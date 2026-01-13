const { StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { 
  getRaid, 
  getRegistration, 
  deleteRegistration, 
  getUserCharacters,
  getRaidRegistrations,
  getRaidCounts,
  createRegistration,
  updateRegistrationStatus,
  findNextWaitlistPlayer,
  updateRaidStatus,
  updateRaidMessageId
} = require('../database/queries');
const { getClassEmoji, inferRole } = require('../utils/formatters');
const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');

async function handleButton(interaction) {
  const [action, raidId] = interaction.customId.split('_');

  // Handle admin dropdown selections
  if (action === 'admin') {
    return await handleAdminSelect(interaction);
  }

  if (action === 'unregister') {
    return await handleUnregister(interaction, parseInt(raidId));
  }

  const registrationType = action === 'assist' ? 'assist' : 'register';
  await handleRegistration(interaction, parseInt(raidId), registrationType);
}

async function handleAdminSelect(interaction) {
  await interaction.deferReply({ flags: 64 }); // Ephemeral

  try {
    const [, subcommand, ] = interaction.customId.split('_');
    const raidId = parseInt(interaction.values[0]);

    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.editReply({
        content: '❌ Raid not found!',
        components: []
      });
    }

    switch (subcommand) {
      case 'complete':
        await updateRaidStatus(raidId, 'completed');
        
        // Remove Discord role from all participants
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
        try {
          const channel = await interaction.client.channels.fetch(raid.channel_id);
          const message = await channel.messages.fetch(raid.message_id);
          await message.delete();
        } catch (err) {
          console.error('Failed to delete raid message:', err);
        }

        await interaction.editReply({
          content: `✅ Raid "${raid.name}" has been completed and removed!`,
          components: []
        });
        break;

      case 'cancel':
        await updateRaidStatus(raidId, 'cancelled');
        
        // Remove Discord role
        const guildCancel = interaction.guild;
        const roleCancel = guildCancel.roles.cache.get(raid.main_role_id);
        
        if (roleCancel) {
          const members = roleCancel.members;
          for (const [memberId, member] of members) {
            try {
              await member.roles.remove(roleCancel);
            } catch (err) {
              console.error(`Failed to remove role from ${memberId}:`, err);
            }
          }
        }

        // Delete the raid message
        try {
          const channel = await interaction.client.channels.fetch(raid.channel_id);
          const message = await channel.messages.fetch(raid.message_id);
          await message.delete();
        } catch (err) {
          console.error('Failed to delete raid message:', err);
        }

        await interaction.editReply({
          content: `✅ Raid "${raid.name}" has been cancelled and removed!`,
          components: []
        });
        break;

      case 'repost':
        // Repost the raid embed
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const registrations = await getRaidRegistrations(raidId);
        const embed = createRaidEmbed(raid, registrations);
        const buttons = createRaidButtons(raidId);

        const newMessage = await channel.send({
          embeds: [embed],
          components: [buttons]
        });

        // Update message_id in database
        await updateRaidMessageId(raidId, newMessage.id);

        await interaction.editReply({
          content: `✅ Raid "${raid.name}" has been reposted!`,
          components: []
        });
        break;

      case 'refresh':
        await updateRaidMessage(raid, interaction.client);
        await interaction.editReply({
          content: `✅ Raid "${raid.name}" has been refreshed!`,
          components: []
        });
        break;

      default:
        await interaction.editReply({
          content: '❌ Unknown admin action!',
          components: []
        });
    }

  } catch (error) {
    console.error('Admin action error:', error);
    await interaction.editReply({
      content: '❌ An error occurred!',
      components: []
    });
  }
}

async function handleRegistration(interaction, raidId, registrationType) {
  await interaction.deferReply({ flags: 64 });

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    if (raid.status !== 'open') {
      return await interaction.editReply({ content: '❌ This raid is no longer open for registration!' });
    }

    const existing = await getRegistration(raidId, interaction.user.id);
    if (existing) {
      return await interaction.editReply({ 
        content: '❌ You are already registered for this raid! Use "Unregister" first if you want to change.' 
      });
    }

    const characters = await getUserCharacters(interaction.user.id);

    const options = [];

    for (const char of characters) {
      const role = inferRole(char.class);
      
      let typeLabel = char.character_type;
      if (typeLabel === 'main_subclass') {
        typeLabel = 'Subclass';
      }
      
      const classEmojiRaw = getClassEmoji(char.class);
      let emojiObj = undefined;
      
      if (classEmojiRaw) {
        const match = classEmojiRaw.match(/<:(\w+):(\d+)>/);
        if (match) {
          emojiObj = {
            name: match[1],
            id: match[2]
          };
        }
      }
      
      options.push({
        label: `${char.ign} - ${char.class} (${typeLabel})`,
        value: `char_${char.id}`,
        description: `${char.subclass} - ${role}`,
        emoji: emojiObj
      });
    }

    if (options.length > 0) {
      options.push({
        label: '────────────────────────',
        value: 'separator',
        description: 'My character is not listed',
        disabled: true
      });
    }

    options.push({
      label: 'Tank (My Character is not listed)',
      value: `manual_tank_${registrationType}`,
      emoji: '🛡️'
    });

    options.push({
      label: 'DPS (My Character is not listed)',
      value: `manual_dps_${registrationType}`,
      emoji: '⚔️'
    });

    options.push({
      label: 'Support (My Character is not listed)',
      value: `manual_support_${registrationType}`,
      emoji: '💚'
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`char_select_${raidId}_${registrationType}`)
      .setPlaceholder('Choose your character or manual entry')
      .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      content: 'Select your character:',
      components: [row]
    });

  } catch (error) {
    console.error('Registration error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

async function handleCharacterSelect(interaction) {
  const [, , raidId, registrationType] = interaction.customId.split('_');
  const selection = interaction.values[0];

  await interaction.deferReply({ flags: 64 });

  try {
    const raid = await getRaid(parseInt(raidId));
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    if (raid.status !== 'open') {
      return await interaction.editReply({ content: '❌ This raid is no longer open for registration!' });
    }

    const existing = await getRegistration(parseInt(raidId), interaction.user.id);
    if (existing) {
      return await interaction.editReply({ 
        content: '❌ You are already registered for this raid! Use "Unregister" first if you want to change.' 
      });
    }

    if (selection.startsWith('manual_')) {
      const [, role] = selection.split('_');
      return await showManualEntryModal(interaction, raidId, registrationType, role);
    }

    if (selection.startsWith('char_')) {
      const charId = parseInt(selection.split('_')[1]);
      const characters = await getUserCharacters(interaction.user.id);
      const character = characters.find(c => c.id === charId);

      if (!character) {
        return await interaction.editReply({ 
          content: '❌ Character not found! Please try again or use manual entry.', 
          flags: 64
        });
      }

      await processRegistration(interaction, raid, character, registrationType, 'main_bot');
    }

  } catch (error) {
    console.error('Character select error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ An error occurred. Please try again.', 
        flags: 64
      });
    } else {
      await interaction.followUp({ 
        content: '❌ An error occurred. Please try again.', 
        flags: 64
      });
    }
  }
}

async function showManualEntryModal(interaction, raidId, registrationType, role) {
  const modal = new ModalBuilder()
    .setCustomId(`manual_modal_${raidId}_${registrationType}_${role}`)
    .setTitle(`Manual ${role.charAt(0).toUpperCase() + role.slice(1)} Registration`);

  const ignInput = new TextInputBuilder()
    .setCustomId('ign')
    .setLabel('In-Game Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const classInput = new TextInputBuilder()
    .setCustomId('class')
    .setLabel('Class')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Storm Blade, Heavy Guardian')
    .setRequired(true);

  const subclassInput = new TextInputBuilder()
    .setCustomId('subclass')
    .setLabel('Subclass')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Iaido, Fortress')
    .setRequired(true);

  const powerInput = new TextInputBuilder()
    .setCustomId('power')
    .setLabel('Power Range')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 28-30k, 36-38k, 38k+')
    .setRequired(true);

  const rows = [ignInput, classInput, subclassInput, powerInput].map(input =>
    new ActionRowBuilder().addComponents(input)
  );

  modal.addComponents(...rows);

  await interaction.showModal(modal);
}

async function handleManualModal(interaction) {
  const [, , raidId, registrationType, role] = interaction.customId.split('_');

  await interaction.deferReply({ flags: 64 });

  try {
    const raid = await getRaid(parseInt(raidId));
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    const ign = interaction.fields.getTextInputValue('ign');
    const className = interaction.fields.getTextInputValue('class');
    const subclass = interaction.fields.getTextInputValue('subclass');
    const powerInput = interaction.fields.getTextInputValue('power');

    let abilityScore;
    if (powerInput === '38k+') {
      abilityScore = 38000;
    } else {
      const match = powerInput.match(/(\d+)-(\d+)k/);
      if (match) {
        abilityScore = parseInt(match[1]) * 1000;
      } else {
        return await interaction.editReply({ 
          content: '❌ Invalid power format! Use formats like: 28-30k, 36-38k, or 38k+' 
        });
      }
    }

    const character = {
      id: null,
      ign,
      class: className,
      subclass,
      ability_score: abilityScore
    };

    await processRegistration(interaction, raid, character, registrationType, 'manual');

  } catch (error) {
    console.error('Manual modal error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

async function processRegistration(interaction, raid, character, registrationType, source) {
  const role = inferRole(character.class);
  const counts = await getRaidCounts(raid.id);

  const totalRegistered = counts.total_registered;
  const roleFull = counts[role].registered >= raid[`${role.toLowerCase()}_slots`];
  const raidFull = totalRegistered >= raid.raid_size;

  let status;
  if (registrationType === 'assist') {
    status = 'assist';
  } else if (roleFull || raidFull) {
    status = 'waitlist';
  } else {
    status = 'registered';
  }

  await createRegistration({
    raid_id: raid.id,
    user_id: interaction.user.id,
    character_id: character.id,
    ign: character.ign,
    class: character.class,
    subclass: character.subclass,
    ability_score: character.ability_score,
    role,
    registration_type: registrationType,
    status
  });

  if (status === 'registered') {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(raid.main_role_id);
    } catch (err) {
      console.error('Failed to add role:', err);
    }
  }

  await updateRaidMessage(raid, interaction.client);

  let message = '✅ Successfully registered!';
  if (status === 'waitlist') message = '✅ Added to waitlist!';
  if (status === 'assist') message = '✅ Marked as assist!';

  await interaction.editReply({ content: message });
}

async function handleUnregister(interaction, raidId) {
  await interaction.deferReply({ flags: 64 });

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    const registration = await getRegistration(raidId, interaction.user.id);
    if (!registration) {
      return await interaction.editReply({ content: '❌ You are not registered for this raid!' });
    }

    const wasRegistered = registration.status === 'registered';
    const userRole = registration.role;

    await deleteRegistration(raidId, interaction.user.id);

    // Remove Discord role
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.remove(raid.main_role_id);
    } catch (err) {
      console.error('Failed to remove role:', err);
    }

    if (wasRegistered) {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      await promoteFromWaitlist(raid, userRole, channel);
    }

    await updateRaidMessage(raid, interaction.client);

    await interaction.editReply({ content: '✅ You have been unregistered!' });

  } catch (error) {
    console.error('Unregister error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

async function promoteFromWaitlist(raid, role, channel) {
  try {
    const registrationType = 'register';
    const nextPlayer = await findNextWaitlistPlayer(raid.id, role, registrationType);

    if (!nextPlayer) return;

    await updateRegistrationStatus(nextPlayer.id, 'registered');

    const guild = channel.guild;
    const member = await guild.members.fetch(nextPlayer.user_id);
    await member.roles.add(raid.main_role_id);

    await channel.send(
      `<@${nextPlayer.user_id}> you've been promoted from the waitlist! You're now in the raid! 🎉`
    );

  } catch (error) {
    console.error('Promotion error:', error);
  }
}

async function updateRaidMessage(raid, client) {
  try {
    if (!raid.message_id || !raid.channel_id) return;

    const registrations = await getRaidRegistrations(raid.id);
    const embed = createRaidEmbed(raid, registrations);
    const buttons = createRaidButtons(raid.id);

    const channel = await client.channels.fetch(raid.channel_id);
    const message = await channel.messages.fetch(raid.message_id);

    await message.edit({ embeds: [embed], components: [buttons] });
  } catch (error) {
    console.error('Update raid message error:', error);
  }
}

module.exports = {
  handleButton,
  handleCharacterSelect,
  handleManualModal
};
