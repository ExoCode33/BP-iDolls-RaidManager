const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getRaid, getRaidRegistrations, updateRegistrationStatus, deleteRegistration } = require('../../database/queries');
const { createRaidEmbed, createRaidButtons } = require('../../utils/embeds');
const { getPowerRange, getClassEmoji } = require('../../utils/formatters');
const logger = require('../../utils/logger');

// ═══════════════════════════════════════════════════════════════
// ROSTER MANAGEMENT HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleRosterMenu(interaction) {
  await interaction.deferUpdate();

  const { getPostedRaids } = require('../../database/queries');
  const raids = await getPostedRaids();

  if (raids.length === 0) {
    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    return await interaction.editReply({
      content: '❌ No posted raids found!',
      components: [row]
    });
  }

  const options = raids.map(raid => {
    const date = new Date(raid.start_time);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toISOString().split('T')[1].substring(0, 5);
    
    return {
      label: raid.name.substring(0, 100),
      value: raid.id.toString(),
      description: `${dateStr} ${timeStr} UTC • ${raid.raid_size}P`,
      emoji: '👥'
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`raid_roster_select_${interaction.user.id}`)
    .setPlaceholder('Choose a raid to manage')
    .addOptions(options.slice(0, 25));

  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Main Menu')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(backButton);

  await interaction.editReply({
    content: `**Roster Management**\n\nSelect a raid to manage its roster:`,
    components: [row1, row2]
  });
}

async function handleRosterSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const raid = await getRaid(raidId);
    
    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Raid not found!');
    }

    const registrations = await getRaidRegistrations(raidId);
    
    // Create embed showing roster
    const embed = new EmbedBuilder()
      .setTitle(`📊 Roster Management: ${raid.name}`)
      .setColor('#5865F2')
      .setDescription('Choose an action below to manage the roster');

    // Separate by status
    const raidPlayers = registrations.filter(r => r.status === 'registered' || r.status === 'assist');
    const waitlistPlayers = registrations.filter(r => r.status === 'waitlist');

    // Show raid roster
    if (raidPlayers.length > 0) {
      const rosterText = raidPlayers.map(r => {
        const emoji = getClassEmoji(r.class);
        const statusEmoji = r.status === 'assist' ? '🔹' : '✅';
        return `${statusEmoji} ${emoji} **${r.ign}** - ${r.subclass} (${getPowerRange(r.ability_score)})`;
      }).join('\n');
      
      embed.addFields({ 
        name: `Raid Roster (${raidPlayers.length}/${raid.raid_size})`, 
        value: rosterText,
        inline: false
      });
    }

    // Show waitlist
    if (waitlistPlayers.length > 0) {
      const waitlistText = waitlistPlayers.map(r => {
        const emoji = getClassEmoji(r.class);
        return `⏳ ${emoji} **${r.ign}** - ${r.subclass} (${getPowerRange(r.ability_score)})`;
      }).join('\n');
      
      embed.addFields({ 
        name: `Waitlist (${waitlistPlayers.length})`, 
        value: waitlistText,
        inline: false
      });
    }

    if (raidPlayers.length === 0 && waitlistPlayers.length === 0) {
      embed.addFields({ 
        name: 'No Registrations', 
        value: 'No players registered yet',
        inline: false
      });
    }

    // Action buttons
    const promoteButton = new ButtonBuilder()
      .setCustomId(`raid_roster_promote_${raidId}_${interaction.user.id}`)
      .setLabel('🔼 Promote from Waitlist')
      .setStyle(ButtonStyle.Success)
      .setDisabled(waitlistPlayers.length === 0);

    const demoteButton = new ButtonBuilder()
      .setCustomId(`raid_roster_demote_${raidId}_${interaction.user.id}`)
      .setLabel('🔽 Demote to Waitlist')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(raidPlayers.length === 0);

    const removeButton = new ButtonBuilder()
      .setCustomId(`raid_roster_unregister_${raidId}_${interaction.user.id}`)
      .setLabel('❌ Remove Player')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(registrations.length === 0);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder().addComponents(promoteButton, demoteButton, removeButton);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Roster select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function handleRosterPromote(interaction) {
  const [, , , raidId, userId] = interaction.customId.split('_');
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raid = await getRaid(parseInt(raidId));
    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Raid not found!');
    }

    const registrations = await getRaidRegistrations(parseInt(raidId));
    const waitlistPlayers = registrations.filter(r => r.status === 'waitlist');

    if (waitlistPlayers.length === 0) {
      return await redirectToMainMenu(interaction, '❌ No players in waitlist!');
    }

    // Show dropdown to select player to promote
    const options = waitlistPlayers.map(player => {
      const emoji = getClassEmoji(player.class);
      return {
        label: player.ign,
        value: player.id.toString(),
        description: `${player.subclass} (${getPowerRange(player.ability_score)})`,
        emoji: emoji ? emoji.match(/<:(\w+):(\d+)>/) ? { name: emoji.match(/<:(\w+):(\d+)>/)[1], id: emoji.match(/<:(\w+):(\d+)>/)[2] } : undefined : undefined
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`roster_promote_select_${raidId}_${interaction.user.id}`)
      .setPlaceholder('Choose player to promote')
      .addOptions(options.slice(0, 25));

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_roster_select_${interaction.user.id}`)
      .setLabel('◀️ Back to Roster')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `**Promote from Waitlist**\n\nSelect a player to promote to the raid:`,
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Roster promote error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function handleRosterDemote(interaction) {
  const [, , , raidId, userId] = interaction.customId.split('_');
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raid = await getRaid(parseInt(raidId));
    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Raid not found!');
    }

    const registrations = await getRaidRegistrations(parseInt(raidId));
    const raidPlayers = registrations.filter(r => r.status === 'registered' || r.status === 'assist');

    if (raidPlayers.length === 0) {
      return await redirectToMainMenu(interaction, '❌ No players in raid roster!');
    }

    // Show dropdown to select player to demote
    const options = raidPlayers.map(player => {
      const emoji = getClassEmoji(player.class);
      const statusEmoji = player.status === 'assist' ? '🔹' : '✅';
      return {
        label: `${statusEmoji} ${player.ign}`,
        value: player.id.toString(),
        description: `${player.subclass} (${getPowerRange(player.ability_score)})`,
        emoji: emoji ? emoji.match(/<:(\w+):(\d+)>/) ? { name: emoji.match(/<:(\w+):(\d+)>/)[1], id: emoji.match(/<:(\w+):(\d+)>/)[2] } : undefined : undefined
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`roster_demote_select_${raidId}_${interaction.user.id}`)
      .setPlaceholder('Choose player to demote')
      .addOptions(options.slice(0, 25));

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_roster_select_${interaction.user.id}`)
      .setLabel('◀️ Back to Roster')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `**Demote to Waitlist**\n\nSelect a player to move to waitlist:`,
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Roster demote error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function handleRosterUnregister(interaction) {
  const [, , , raidId, userId] = interaction.customId.split('_');
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raid = await getRaid(parseInt(raidId));
    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Raid not found!');
    }

    const registrations = await getRaidRegistrations(parseInt(raidId));

    if (registrations.length === 0) {
      return await redirectToMainMenu(interaction, '❌ No players registered!');
    }

    // Show dropdown to select player to remove
    const options = registrations.map(player => {
      const emoji = getClassEmoji(player.class);
      const statusEmoji = player.status === 'registered' ? '✅' : player.status === 'assist' ? '🔹' : '⏳';
      return {
        label: `${statusEmoji} ${player.ign}`,
        value: player.user_id,
        description: `${player.subclass} (${getPowerRange(player.ability_score)})`,
        emoji: emoji ? emoji.match(/<:(\w+):(\d+)>/) ? { name: emoji.match(/<:(\w+):(\d+)>/)[1], id: emoji.match(/<:(\w+):(\d+)>/)[2] } : undefined : undefined
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`roster_remove_select_${raidId}_${interaction.user.id}`)
      .setPlaceholder('Choose player to remove')
      .addOptions(options.slice(0, 25));

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_roster_select_${interaction.user.id}`)
      .setLabel('◀️ Back to Roster')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `**Remove Player**\n\nSelect a player to remove from the raid:`,
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Roster unregister error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// Handle promote selection
async function handlePromoteSelect(interaction) {
  const [, , , raidId, userId] = interaction.customId.split('_');
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const playerId = parseInt(interaction.values[0]);
    const raid = await getRaid(parseInt(raidId));
    const registrations = await getRaidRegistrations(parseInt(raidId));
    const player = registrations.find(r => r.id === playerId);

    if (!player || player.status !== 'waitlist') {
      return await redirectToMainMenu(interaction, '❌ Player not found in waitlist!');
    }

    // Promote to their original registration type (registered or assist)
    const newStatus = player.registration_type === 'assist' ? 'assist' : 'registered';
    await updateRegistrationStatus(playerId, newStatus);

    // Log the promotion
    await logger.logRosterChange(raid, player, interaction.user, 'promote', 'waitlist', newStatus);

    // Add Discord role
    try {
      const member = await interaction.guild.members.fetch(player.user_id);
      await member.roles.add(raid.main_role_id);
    } catch (err) {
      console.error('Failed to add role:', err);
    }

    // Update raid message
    if (raid.message_id && raid.channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const message = await channel.messages.fetch(raid.message_id);
        const updatedRegistrations = await getRaidRegistrations(parseInt(raidId));
        const embed = await createRaidEmbed(raid, updatedRegistrations);
        const buttons = createRaidButtons(raid.id, raid.locked);
        await message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid message:', err);
      }
    }

    // Notify player
    try {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      await channel.send(`🎉 <@${player.user_id}> You've been promoted from the waitlist!`);
    } catch (err) {
      console.error('Failed to send promotion message:', err);
    }

    await redirectToMainMenu(interaction, `✅ Promoted ${player.ign} to raid roster!`);

  } catch (error) {
    console.error('Promote select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// Handle demote selection
async function handleDemoteSelect(interaction) {
  const [, , , raidId, userId] = interaction.customId.split('_');
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const playerId = parseInt(interaction.values[0]);
    const raid = await getRaid(parseInt(raidId));
    const registrations = await getRaidRegistrations(parseInt(raidId));
    const player = registrations.find(r => r.id === playerId);

    if (!player || (player.status !== 'registered' && player.status !== 'assist')) {
      return await redirectToMainMenu(interaction, '❌ Player not found in raid roster!');
    }

    // Move to waitlist
    await updateRegistrationStatus(playerId, 'waitlist');

    // Log the demotion
    await logger.logRosterChange(raid, player, interaction.user, 'demote', player.status, 'waitlist');

    // Remove Discord role
    try {
      const member = await interaction.guild.members.fetch(player.user_id);
      await member.roles.remove(raid.main_role_id);
    } catch (err) {
      console.error('Failed to remove role:', err);
    }

    // Update raid message
    if (raid.message_id && raid.channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const message = await channel.messages.fetch(raid.message_id);
        const updatedRegistrations = await getRaidRegistrations(parseInt(raidId));
        const embed = await createRaidEmbed(raid, updatedRegistrations);
        const buttons = createRaidButtons(raid.id, raid.locked);
        await message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid message:', err);
      }
    }

    await redirectToMainMenu(interaction, `✅ Moved ${player.ign} to waitlist!`);

  } catch (error) {
    console.error('Demote select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// Handle remove selection
async function handleRemoveSelect(interaction) {
  const [, , , raidId, userId] = interaction.customId.split('_');
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const playerUserId = interaction.values[0];
    const raid = await getRaid(parseInt(raidId));
    const registrations = await getRaidRegistrations(parseInt(raidId));
    const player = registrations.find(r => r.user_id === playerUserId);

    if (!player) {
      return await redirectToMainMenu(interaction, '❌ Player not found!');
    }

    // Delete registration
    await deleteRegistration(parseInt(raidId), player.user_id);

    // Log the removal
    await logger.logPlayerRemoved(raid, player, interaction.user);

    // Remove Discord role
    try {
      const member = await interaction.guild.members.fetch(player.user_id);
      await member.roles.remove(raid.main_role_id);
    } catch (err) {
      console.error('Failed to remove role:', err);
    }

    // Update raid message
    if (raid.message_id && raid.channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const message = await channel.messages.fetch(raid.message_id);
        const updatedRegistrations = await getRaidRegistrations(parseInt(raidId));
        const embed = await createRaidEmbed(raid, updatedRegistrations);
        const buttons = createRaidButtons(raid.id, raid.locked);
        await message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid message:', err);
      }
    }

    await redirectToMainMenu(interaction, `✅ Removed ${player.ign} from the raid!`);

  } catch (error) {
    console.error('Remove select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function redirectToMainMenu(interaction, message) {
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
    content: message,
    embeds: [embed],
    components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow]
  });

  // Auto-remove message after 3 seconds
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
  handleRosterMenu,
  handleRosterSelect,
  handleRosterPromote,
  handleRosterDemote,
  handleRosterUnregister,
  handlePromoteSelect,
  handleDemoteSelect,
  handleRemoveSelect
};
