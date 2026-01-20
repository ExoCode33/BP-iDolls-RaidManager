const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getRaid, getRaidRegistrations, updateRegistrationStatus, deleteRegistration } = require('../../database/queries');
const { createRaidEmbed, createRaidButtons } = require('../../utils/embeds');
const { getPowerRange, getClassEmoji } = require('../../utils/formatters');

// ═══════════════════════════════════════════════════════════════
// ROSTER MANAGEMENT - COMPLETE UI
// ═══════════════════════════════════════════════════════════════

async function handleRosterSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    await showRosterManagementUI(interaction, raidId);
  } catch (error) {
    console.error('Roster select error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function showRosterManagementUI(interaction, raidId) {
  const raid = await getRaid(raidId);
  if (!raid) {
    return await interaction.editReply({ content: '❌ Raid not found!' });
  }

  const registrations = await getRaidRegistrations(raidId);
  
  // ✅ PART 1: Full Raid Embed (exactly as users see it)
  const raidEmbed = await createRaidEmbed(raid, registrations);
  
  // ✅ PART 2: Management Panel Embed
  const mgmtEmbed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('🛠️ Roster Management')
    .setDescription(
      `Use the dropdowns below to manage players\n` +
      `🔼 **Promote** = Waitlist → Raid Party\n` +
      `🔽 **Demote** = Raid Party → Waitlist\n` +
      `❌ **Unregister** = Remove completely`
    );

  // Separate players
  const registered = registrations.filter(r => r.status === 'registered');
  const assist = registrations.filter(r => r.status === 'assist');
  const waitlist = registrations.filter(r => r.status === 'waitlist');
  
  const inRaid = [...registered, ...assist];

  // ✅ DROPDOWN 1: From Waitlist to Raid Party (Promote)
  const promoteOptions = waitlist.slice(0, 25).map(player => {
    const classEmoji = getClassEmoji(player.class);
    const powerRange = getPowerRange(player.ability_score);
    const type = player.registration_type === 'assist' ? '[Assist]' : '';
    
    return {
      label: `${player.ign} • ${player.subclass} ${powerRange} ${type}`.trim(),
      value: `promote_${player.id}`,
      description: `Promote to ${player.registration_type === 'assist' ? 'Assist' : 'Registered'}`,
      emoji: classEmoji || '⚔️'
    };
  });

  // ✅ DROPDOWN 2: From Raid Party to Waitlist (Demote)
  const demoteOptions = inRaid.slice(0, 25).map(player => {
    const classEmoji = getClassEmoji(player.class);
    const powerRange = getPowerRange(player.ability_score);
    const type = player.status === 'assist' ? '[Assist]' : '';
    
    return {
      label: `${player.ign} • ${player.subclass} ${powerRange} ${type}`.trim(),
      value: `demote_${player.id}`,
      description: `Move to waitlist`,
      emoji: classEmoji || '⚔️'
    };
  });

  // ✅ DROPDOWN 3: Unregister from Raid Party / Waitlist
  const allPlayers = [...inRaid, ...waitlist];
  const unregisterOptions = allPlayers.slice(0, 25).map(player => {
    const classEmoji = getClassEmoji(player.class);
    const powerRange = getPowerRange(player.ability_score);
    const statusLabel = player.status === 'registered' ? '[Registered]' : 
                        player.status === 'assist' ? '[Assist]' : '[Waitlist]';
    
    return {
      label: `${player.ign} • ${player.subclass} ${powerRange} ${statusLabel}`.trim(),
      value: `unregister_${player.id}`,
      description: `Remove from raid`,
      emoji: classEmoji || '⚔️'
    };
  });

  const components = [];

  // Add promote dropdown if waitlist has players
  if (promoteOptions.length > 0) {
    const promoteDropdown = new StringSelectMenuBuilder()
      .setCustomId(`raid_roster_promote_${raidId}_${interaction.user.id}`)
      .setPlaceholder('🔼 From Waitlist to Raid Party')
      .addOptions(promoteOptions);
    components.push(new ActionRowBuilder().addComponents(promoteDropdown));
  }

  // Add demote dropdown if raid party has players
  if (demoteOptions.length > 0) {
    const demoteDropdown = new StringSelectMenuBuilder()
      .setCustomId(`raid_roster_demote_${raidId}_${interaction.user.id}`)
      .setPlaceholder('🔽 From Raid Party to Waitlist')
      .addOptions(demoteOptions);
    components.push(new ActionRowBuilder().addComponents(demoteDropdown));
  }

  // Add unregister dropdown if any players exist
  if (unregisterOptions.length > 0) {
    const unregisterDropdown = new StringSelectMenuBuilder()
      .setCustomId(`raid_roster_unregister_${raidId}_${interaction.user.id}`)
      .setPlaceholder('❌ Unregister from Raid Party / Waitlist')
      .addOptions(unregisterOptions);
    components.push(new ActionRowBuilder().addComponents(unregisterDropdown));
  }

  // Back button
  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Menu')
    .setStyle(ButtonStyle.Secondary);
  
  components.push(new ActionRowBuilder().addComponents(backButton));

  // If no players at all
  if (allPlayers.length === 0) {
    components.length = 0;
    components.push(new ActionRowBuilder().addComponents(backButton));
    mgmtEmbed.setDescription('❌ No players registered for this raid!');
  }

  await interaction.editReply({
    content: null,
    embeds: [raidEmbed, mgmtEmbed],
    components: components
  });
}

// ═══════════════════════════════════════════════════════════════
// ACTION HANDLERS - AUTO-REFRESH AFTER EVERY ACTION
// ═══════════════════════════════════════════════════════════════

async function handleRosterPromote(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[3]);
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const playerId = parseInt(interaction.values[0].split('_')[1]);
    
    const raid = await getRaid(raidId);
    const registrations = await getRaidRegistrations(raidId);
    const player = registrations.find(r => r.id === playerId);

    if (!player) {
      await interaction.followUp({ content: '❌ Player not found!', ephemeral: true });
      return;
    }

    if (player.status !== 'waitlist') {
      await interaction.followUp({ 
        content: `❌ ${player.ign} is not on the waitlist!`, 
        ephemeral: true 
      });
      return;
    }

    // Promote to their original registration type (registered or assist)
    const newStatus = player.registration_type === 'assist' ? 'assist' : 'registered';
    await updateRegistrationStatus(playerId, newStatus);

    // Add Discord role
    try {
      const member = await interaction.guild.members.fetch(player.user_id);
      await member.roles.add(raid.main_role_id);
    } catch (err) {
      console.error('Failed to add role:', err);
    }

    // Update raid message
    await updateRaidMessage(raid, interaction.client, raidId);

    // ✅ AUTO-REFRESH UI
    await showRosterManagementUI(interaction, raidId);

    await interaction.followUp({
      content: `✅ Promoted **${player.ign}** to raid party!`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Promote error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleRosterDemote(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[3]);
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const playerId = parseInt(interaction.values[0].split('_')[1]);
    
    const raid = await getRaid(raidId);
    const registrations = await getRaidRegistrations(raidId);
    const player = registrations.find(r => r.id === playerId);

    if (!player) {
      await interaction.followUp({ content: '❌ Player not found!', ephemeral: true });
      return;
    }

    if (player.status === 'waitlist') {
      await interaction.followUp({ 
        content: `❌ ${player.ign} is already on the waitlist!`, 
        ephemeral: true 
      });
      return;
    }

    // Move to waitlist
    await updateRegistrationStatus(playerId, 'waitlist');

    // Remove Discord role
    try {
      const member = await interaction.guild.members.fetch(player.user_id);
      await member.roles.remove(raid.main_role_id);
    } catch (err) {
      console.error('Failed to remove role:', err);
    }

    // Update raid message
    await updateRaidMessage(raid, interaction.client, raidId);

    // ✅ AUTO-REFRESH UI
    await showRosterManagementUI(interaction, raidId);

    await interaction.followUp({
      content: `✅ Moved **${player.ign}** to waitlist!`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Demote error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleRosterUnregister(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[3]);
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const playerId = parseInt(interaction.values[0].split('_')[1]);
    
    const raid = await getRaid(raidId);
    const registrations = await getRaidRegistrations(raidId);
    const player = registrations.find(r => r.id === playerId);

    if (!player) {
      await interaction.followUp({ content: '❌ Player not found!', ephemeral: true });
      return;
    }

    // Delete registration
    await deleteRegistration(raidId, player.user_id);

    // Remove Discord role
    try {
      const member = await interaction.guild.members.fetch(player.user_id);
      await member.roles.remove(raid.main_role_id);
    } catch (err) {
      console.error('Failed to remove role:', err);
    }

    // Update raid message
    await updateRaidMessage(raid, interaction.client, raidId);

    // ✅ AUTO-REFRESH UI
    await showRosterManagementUI(interaction, raidId);

    await interaction.followUp({
      content: `✅ Unregistered **${player.ign}** from the raid!`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Unregister error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function updateRaidMessage(raid, client, raidId) {
  if (!raid.message_id || !raid.channel_id) return;

  try {
    const channel = await client.channels.fetch(raid.channel_id);
    const message = await channel.messages.fetch(raid.message_id);
    
    const registrations = await getRaidRegistrations(raidId);
    const embed = await createRaidEmbed(raid, registrations);
    const buttons = createRaidButtons(raid.id, raid.locked);

    await message.edit({ embeds: [embed], components: [buttons] });
  } catch (err) {
    console.error('Failed to update raid message:', err);
  }
}

module.exports = {
  handleRosterSelect,
  handleRosterPromote,
  handleRosterDemote,
  handleRosterUnregister
};
