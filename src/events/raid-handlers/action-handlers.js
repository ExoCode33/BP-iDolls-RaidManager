const { getRaid, lockRaid, unlockRaid, updateRaidStatus, updateRaidMessageId, getRaidRegistrations, createRaidPost } = require('../../database/queries');
const { createRaidEmbed, createRaidButtons } = require('../../utils/embeds');

// ═══════════════════════════════════════════════════════════════
// RAID ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleRaidAction(interaction) {
  const parts = interaction.customId.split('_');
  const action = parts[2]; // raid_action_LOCK_userId
  const userId = parts[3];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const raid = await getRaid(raidId);

    if (!raid) {
      return await interaction.editReply({
        content: '❌ Raid not found!',
        components: []
      });
    }

    switch (action) {
      case 'lock':
        await handleLock(interaction, raid);
        break;
      case 'unlock':
        await handleUnlock(interaction, raid);
        break;
      case 'complete':
        await handleComplete(interaction, raid);
        break;
      case 'cancel':
        await handleCancel(interaction, raid);
        break;
      case 'repost':
        await handleRepost(interaction, raid);
        break;
      case 'refresh':
        await handleRefresh(interaction, raid);
        break;
      default:
        await interaction.editReply({
          content: '❌ Unknown action!',
          components: []
        });
    }
  } catch (error) {
    console.error('Raid action error:', error);
    await interaction.editReply({
      content: '❌ An error occurred!',
      components: []
    });
  }
}

async function handleLock(interaction, raid) {
  await lockRaid(raid.id);

  // Update the message to remove Register/Assist buttons
  if (raid.message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const message = await channel.messages.fetch(raid.message_id);
      
      const registrations = await getRaidRegistrations(raid.id);
      const embed = createRaidEmbed({ ...raid, locked: true }, registrations);
      const buttons = createRaidButtons(raid.id, true); // true = locked

      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.error('Failed to update raid message:', err);
    }
  }

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been locked!\n\n🔒 Registration is now closed. Only the Unregister button remains.`,
    components: []
  });
}

async function handleUnlock(interaction, raid) {
  await unlockRaid(raid.id);

  // Update the message to restore Register/Assist buttons
  if (raid.message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const message = await channel.messages.fetch(raid.message_id);
      
      const registrations = await getRaidRegistrations(raid.id);
      const embed = createRaidEmbed({ ...raid, locked: false }, registrations);
      const buttons = createRaidButtons(raid.id, false); // false = unlocked

      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.error('Failed to update raid message:', err);
    }
  }

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been unlocked!\n\n🔓 Registration is now open. All buttons are available.`,
    components: []
  });
}

async function handleComplete(interaction, raid) {
  await updateRaidStatus(raid.id, 'completed');

  // Remove Discord role from all participants
  const guild = interaction.guild;
  const role = guild.roles.cache.get(raid.main_role_id);
  
  if (role) {
    const members = role.members;
    let removedCount = 0;
    for (const [memberId, member] of members) {
      try {
        await member.roles.remove(role);
        removedCount++;
      } catch (err) {
        console.error(`Failed to remove role from ${memberId}:`, err);
      }
    }
  }

  // Delete the raid message
  if (raid.message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const message = await channel.messages.fetch(raid.message_id);
      await message.delete();
    } catch (err) {
      console.error('Failed to delete raid message:', err);
    }
  }

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been completed!\n\n**Cleanup performed:**\n✅ Raid role removed from all participants\n✅ Raid message deleted\n✅ Database updated to 'completed'`,
    components: []
  });
}

async function handleCancel(interaction, raid) {
  await updateRaidStatus(raid.id, 'cancelled');

  // Remove Discord role
  const guild = interaction.guild;
  const role = guild.roles.cache.get(raid.main_role_id);
  
  if (role) {
    const members = role.members;
    for (const [memberId, member] of members) {
      try {
        await member.roles.remove(role);
      } catch (err) {
        console.error(`Failed to remove role from ${memberId}:`, err);
      }
    }
  }

  // Delete the raid message
  if (raid.message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const message = await channel.messages.fetch(raid.message_id);
      await message.delete();
    } catch (err) {
      console.error('Failed to delete raid message:', err);
    }
  }

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been cancelled!\n\n**Cleanup performed:**\n✅ Raid role removed from all participants\n✅ Raid message deleted\n✅ Database updated to 'cancelled'`,
    components: []
  });
}

async function handleRepost(interaction, raid) {
  const channel = await interaction.client.channels.fetch(raid.channel_id);
  const registrations = await getRaidRegistrations(raid.id);
  const messageId = await createRaidPost(raid, channel);

  await updateRaidMessageId(raid.id, messageId);

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been reposted!\n\nNew message posted to <#${raid.channel_id}>`,
    components: []
  });
}

async function handleRefresh(interaction, raid) {
  if (!raid.message_id || !raid.channel_id) {
    return await interaction.editReply({
      content: '❌ Raid has not been posted yet!',
      components: []
    });
  }

  try {
    const channel = await interaction.client.channels.fetch(raid.channel_id);
    const message = await channel.messages.fetch(raid.message_id);
    
    const registrations = await getRaidRegistrations(raid.id);
    const embed = createRaidEmbed(raid, registrations);
    const buttons = createRaidButtons(raid.id, raid.locked);

    await message.edit({ embeds: [embed], components: [buttons] });

    await interaction.editReply({
      content: `✅ Raid "${raid.name}" has been refreshed!`,
      components: []
    });
  } catch (err) {
    console.error('Refresh error:', err);
    await interaction.editReply({
      content: '❌ Failed to refresh raid message!',
      components: []
    });
  }
}

module.exports = {
  handleRaidAction
};
