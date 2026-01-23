const { getRaid, lockRaid, unlockRaid, updateRaidStatus, updateRaidMessageId, getRaidRegistrations, createRaidPost } = require('../../database/queries');
const { createRaidEmbed, createRaidButtons } = require('../../utils/embeds');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// ═══════════════════════════════════════════════════════════════
// RAID ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleRaidAction(interaction) {
  const parts = interaction.customId.split('_');
  const action = parts[3]; // raid_action_select_ACTION_userId
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const raid = await getRaid(raidId);

    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Raid not found!');
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
        await redirectToMainMenu(interaction, '❌ Unknown action!');
    }
  } catch (error) {
    console.error('Raid action error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
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
      const embed = await createRaidEmbed({ ...raid, locked: true }, registrations);
      const buttons = createRaidButtons(raid.id, true); // true = locked

      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.error('Failed to update raid message:', err);
    }
  }

  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Main Menu')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(backButton);

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been locked!\n\n🔒 Registration is now closed. Only the Unregister button remains.`,
    components: [row]
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
      const embed = await createRaidEmbed({ ...raid, locked: false }, registrations);
      const buttons = createRaidButtons(raid.id, false); // false = unlocked

      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.error('Failed to update raid message:', err);
    }
  }

  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Main Menu')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(backButton);

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been unlocked!\n\n🔓 Registration is now open. All buttons are available.`,
    components: [row]
  });
}

async function handleComplete(interaction, raid) {
  await updateRaidStatus(raid.id, 'completed');

  // Remove Discord role from all participants
  const guild = interaction.guild;
  
  try {
    const role = await guild.roles.fetch(raid.main_role_id);
    
    if (role) {
      console.log(`🧹 [COMPLETE] Removing role: ${role.name} (${role.id})`);
      
      // Force fetch members to ensure we have the latest list
      await guild.members.fetch();
      const membersWithRole = role.members;
      
      if (membersWithRole.size > 0) {
        console.log(`   Removing role from ${membersWithRole.size} member(s)...`);
        
        for (const [memberId, member] of membersWithRole) {
          try {
            await member.roles.remove(role);
            console.log(`   ✅ Removed from ${member.user.tag}`);
          } catch (err) {
            console.error(`   ❌ Failed to remove from ${member.user.tag}:`, err.message);
          }
        }
        
        console.log(`✅ [COMPLETE] Role cleanup complete!`);
      } else {
        console.log(`   No members have this role`);
      }
    } else {
      console.error(`❌ [COMPLETE] Role not found: ${raid.main_role_id}`);
    }
  } catch (err) {
    console.error(`❌ [COMPLETE] Role removal failed:`, err);
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

  // ✅ NEW: Delete lock notification message if it exists
  if (raid.lock_notification_message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const lockMessage = await channel.messages.fetch(raid.lock_notification_message_id);
      await lockMessage.delete();
      console.log(`✅ Deleted lock notification message for raid ${raid.id}`);
    } catch (err) {
      console.error('Failed to delete lock notification message:', err);
    }
  }

  // ✅ NEW: Delete reminder message if it exists
  if (raid.reminder_message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const reminderMessage = await channel.messages.fetch(raid.reminder_message_id);
      await reminderMessage.delete();
      console.log(`✅ Deleted reminder message for raid ${raid.id}`);
    } catch (err) {
      console.error('Failed to delete reminder message:', err);
    }
  }

  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Main Menu')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(backButton);

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been completed!\n\n**Cleanup performed:**\n✅ Raid role removed from all participants\n✅ Raid message deleted\n✅ Database updated to 'completed'`,
    components: [row]
  });
}

async function handleCancel(interaction, raid) {
  await updateRaidStatus(raid.id, 'cancelled');

  // Remove Discord role
  const guild = interaction.guild;
  
  try {
    const role = await guild.roles.fetch(raid.main_role_id);
    
    if (role) {
      console.log(`🧹 [CANCEL] Removing role: ${role.name} (${role.id})`);
      
      // Force fetch members to ensure we have the latest list
      await guild.members.fetch();
      const membersWithRole = role.members;
      
      if (membersWithRole.size > 0) {
        console.log(`   Removing role from ${membersWithRole.size} member(s)...`);
        
        for (const [memberId, member] of membersWithRole) {
          try {
            await member.roles.remove(role);
            console.log(`   ✅ Removed from ${member.user.tag}`);
          } catch (err) {
            console.error(`   ❌ Failed to remove from ${member.user.tag}:`, err.message);
          }
        }
        
        console.log(`✅ [CANCEL] Role cleanup complete!`);
      } else {
        console.log(`   No members have this role`);
      }
    } else {
      console.error(`❌ [CANCEL] Role not found: ${raid.main_role_id}`);
    }
  } catch (err) {
    console.error(`❌ [CANCEL] Role removal failed:`, err);
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

  // ✅ NEW: Delete lock notification message if it exists
  if (raid.lock_notification_message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const lockMessage = await channel.messages.fetch(raid.lock_notification_message_id);
      await lockMessage.delete();
      console.log(`✅ Deleted lock notification message for raid ${raid.id}`);
    } catch (err) {
      console.error('Failed to delete lock notification message:', err);
    }
  }

  // ✅ NEW: Delete reminder message if it exists
  if (raid.reminder_message_id && raid.channel_id) {
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      const reminderMessage = await channel.messages.fetch(raid.reminder_message_id);
      await reminderMessage.delete();
      console.log(`✅ Deleted reminder message for raid ${raid.id}`);
    } catch (err) {
      console.error('Failed to delete reminder message:', err);
    }
  }

  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Main Menu')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(backButton);

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been cancelled!\n\n**Cleanup performed:**\n✅ Raid role removed from all participants\n✅ Raid message deleted\n✅ Database updated to 'cancelled'`,
    components: [row]
  });
}

async function handleRepost(interaction, raid) {
  const channel = await interaction.client.channels.fetch(raid.channel_id);
  const registrations = await getRaidRegistrations(raid.id);
  const messageId = await createRaidPost(raid, channel);

  await updateRaidMessageId(raid.id, messageId);

  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Main Menu')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(backButton);

  await interaction.editReply({
    content: `✅ Raid "${raid.name}" has been reposted!\n\nNew message posted to <#${raid.channel_id}>`,
    components: [row]
  });
}

async function handleRefresh(interaction, raid) {
  if (!raid.message_id || !raid.channel_id) {
    return await redirectToMainMenu(interaction, '❌ Raid has not been posted yet!');
  }

  try {
    const channel = await interaction.client.channels.fetch(raid.channel_id);
    const message = await channel.messages.fetch(raid.message_id);
    
    const registrations = await getRaidRegistrations(raid.id);
    const embed = await createRaidEmbed(raid, registrations);
    const buttons = createRaidButtons(raid.id, raid.locked);

    await message.edit({ embeds: [embed], components: [buttons] });

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ Raid "${raid.name}" has been refreshed!`,
      components: [row]
    });
  } catch (err) {
    console.error('Refresh error:', err);
    await redirectToMainMenu(interaction, '❌ Failed to refresh raid message!');
  }
}

async function redirectToMainMenu(interaction, errorMessage) {
  const { 
    createMainMenuEmbed, 
    createMainMenuButtons,
    createRosterDropdown,
    createLockUnlockDropdown,
    createPresetDropdown,
    createEmbedAndRoleDropdown
  } = require('./main-menu');
  
  const embed = await createMainMenuEmbed();
  const buttonRow = createMainMenuButtons(interaction.user.id);
  const rosterRow = createRosterDropdown(interaction.user.id);
  const lockUnlockRow = createLockUnlockDropdown(interaction.user.id);
  const presetRow = createPresetDropdown(interaction.user.id);
  const managementRow = createEmbedAndRoleDropdown(interaction.user.id);

  await interaction.editReply({
    content: errorMessage,
    embeds: [embed],
    components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow]
  });

  // Auto-remove error message after 3 seconds
  setTimeout(async () => {
    try {
      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow]
      });
    } catch (err) {
      // Ignore if interaction expired
    }
  }, 3000);
}

module.exports = {
  handleRaidAction
};
