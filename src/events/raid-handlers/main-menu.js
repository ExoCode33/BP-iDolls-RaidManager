const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getActiveRaids, getRaid } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// MAIN MENU - REDESIGNED WITH BUTTONS AND ORGANIZED DROPDOWNS
// ═══════════════════════════════════════════════════════════════

async function createMainMenuEmbed() {
  const raids = await getActiveRaids();
  
  const embed = new EmbedBuilder()
    .setColor(0xEC4899)
    .setTitle('⚔️ **iDolls Raid Manager**');

  // Build full ANSI colored description matching the profile bot style
  let ansiContent = '```ansi\n';
  
  // Bold pink line
  ansiContent += '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n';
  
  // Active Raids Section
  ansiContent += '\u001b[1;37m📋 ACTIVE RAIDS\u001b[0m\n';
  
  if (raids.length === 0) {
    ansiContent += '\u001b[0;37mNo active raids scheduled\u001b[0m\n';
  } else {
    const { getRaidRegistrations } = require('../../database/queries');
    
    for (const raid of raids) {
      const startTime = new Date(raid.start_time);
      
      // Format: Mon DD, YYYY HH:MM AM/PM UTC
      const options = { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
      };
      const formattedTime = startTime.toLocaleString('en-US', options) + ' UTC';
      
      // Get registrations to count players
      const registrations = await getRaidRegistrations(raid.id);
      const registered = registrations.filter(r => r.status === 'registered').length;
      const waitlist = registrations.filter(r => r.status === 'waitlist').length;
      
      // Only lock status at the end (consistent emoji)
      const lockStatus = raid.locked ? '\u001b[1;31m🔒\u001b[0m' : '\u001b[1;32m🔓\u001b[0m';
      
      // Post status for display
      const postStatus = raid.message_id ? '\u001b[1;32m✅\u001b[0m' : '\u001b[1;33m⏳\u001b[0m';
      
      // Player count with color coding
      let playerCount;
      const totalWithWaitlist = registered + waitlist;
      
      if (totalWithWaitlist > raid.raid_size) {
        // Overfilled (yellow)
        playerCount = `\u001b[1;33m[${totalWithWaitlist}/${raid.raid_size}]\u001b[0m`;
      } else if (registered >= raid.raid_size) {
        // Full but no overflow (white)
        playerCount = `\u001b[1;37m[${registered}/${raid.raid_size}]\u001b[0m`;
      } else {
        // Not full (green)
        playerCount = `\u001b[1;32m[${registered}/${raid.raid_size}]\u001b[0m`;
      }
      
      // Raid info (bright blue labels, lock at end of name)
      ansiContent += `${postStatus} \u001b[1;34mName:\u001b[0m \u001b[1;37m${raid.name}\u001b[0m ${lockStatus}\n`;
      ansiContent += `\u001b[1;34m👥 Size:\u001b[0m ${playerCount}\n`;
      ansiContent += `\u001b[1;34m🕐 Time:\u001b[0m \u001b[0;37m${formattedTime}\u001b[0m\n`;
    }
  }
  
  // Bold pink line
  ansiContent += '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n';
  
  // Legend with consistent emojis
  ansiContent += '\u001b[1;31m🔒\u001b[0m Locked  \u001b[1;32m🔓\u001b[0m Open  \u001b[1;32m✅\u001b[0m Posted  \u001b[1;33m⏳\u001b[0m Draft\n';
  
  ansiContent += '```';
  
  embed.setDescription(ansiContent);
  
  return embed;
}

function createMainMenuButtons(userId) {
  const startButton = new ButtonBuilder()
    .setCustomId(`raid_quick_start_${userId}`)
    .setLabel('🚀 Start Raid')
    .setStyle(ButtonStyle.Success);

  const completeButton = new ButtonBuilder()
    .setCustomId(`raid_quick_complete_${userId}`)
    .setLabel('✅ Complete Raid')
    .setStyle(ButtonStyle.Primary);

  const editButton = new ButtonBuilder()
    .setCustomId(`raid_quick_edit_${userId}`)
    .setLabel('✏️ Edit Raid')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(startButton, completeButton, editButton);
}

function createRoleConfigDropdown(userId) {
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`raid_role_config_${userId}`)
    .setPlaceholder('⚙️ Role Configuration')
    .addOptions([
      {
        label: '⚙️ Configure Raid Roles',
        value: 'setup',
        description: 'Set Raid 1 and Raid 2 role IDs',
        emoji: '⚙️'
      }
    ]);

  return new ActionRowBuilder().addComponents(dropdown);
}

function createPresetDropdown(userId) {
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`raid_preset_menu_${userId}`)
    .setPlaceholder('📝 Preset Management')
    .addOptions([
      {
        label: '➕ Create Preset',
        value: 'create',
        description: 'Create a new raid template',
        emoji: '➕'
      },
      {
        label: '✏️ Edit Preset',
        value: 'edit',
        description: 'Modify an existing preset',
        emoji: '✏️'
      },
      {
        label: '🗑️ Delete Preset',
        value: 'delete',
        description: 'Remove a preset',
        emoji: '🗑️'
      }
    ]);

  return new ActionRowBuilder().addComponents(dropdown);
}

function createLockUnlockDropdown(userId) {
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`raid_lock_unlock_menu_${userId}`)
    .setPlaceholder('🔒 Lock / Unlock')
    .addOptions([
      {
        label: '🔒 Lock Raid',
        value: 'lock',
        description: 'Prevent new registrations',
        emoji: '🔒'
      },
      {
        label: '🔓 Unlock Raid',
        value: 'unlock',
        description: 'Allow registrations',
        emoji: '🔓'
      }
    ]);

  return new ActionRowBuilder().addComponents(dropdown);
}

function createEmbedDropdown(userId) {
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`raid_embed_menu_${userId}`)
    .setPlaceholder('📺 Embed Management')
    .addOptions([
      {
        label: '🔄 Refresh Embed',
        value: 'refresh',
        description: 'Update raid display',
        emoji: '🔄'
      },
      {
        label: '📝 Repost Embed',
        value: 'repost',
        description: 'Restore deleted embed',
        emoji: '📝'
      }
    ]);

  return new ActionRowBuilder().addComponents(dropdown);
}

function createRosterDropdown(userId) {
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`raid_roster_menu_${userId}`)
    .setPlaceholder('🛠️ Roster Management')
    .addOptions([
      {
        label: '🛠️ Manage Roster',
        value: 'manage',
        description: 'Promote, demote, or remove players',
        emoji: '🛠️'
      }
    ]);

  return new ActionRowBuilder().addComponents(dropdown);
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleRoleConfigMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  if (action === 'setup') {
    const setupHandlers = require('./setup-handlers');
    await setupHandlers.showSetupModal(interaction);
  }
}

async function handlePresetMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  try {
    switch (action) {
      case 'create':
        const createHandlers = require('./create-handlers');
        await createHandlers.startCreateFlow(interaction);
        break;
      
      case 'edit':
        await showEditSelector(interaction);
        break;
      
      case 'delete':
        await showDeleteSelector(interaction);
        break;
    }
  } catch (error) {
    console.error('Preset menu error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function handleLockUnlockMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  try {
    if (action === 'lock') {
      await showRaidSelector(interaction, 'lock', '🔒 Lock Registration');
    } else if (action === 'unlock') {
      await showRaidSelector(interaction, 'unlock', '🔓 Unlock Registration');
    }
  } catch (error) {
    console.error('Lock/Unlock menu error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function handleEmbedMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  try {
    switch (action) {
      case 'refresh':
        await showRaidSelector(interaction, 'refresh', '🔄 Refresh Embed');
        break;
      
      case 'repost':
        await showRaidSelector(interaction, 'repost', '📝 Repost Embed');
        break;
    }
  } catch (error) {
    console.error('Embed menu error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// Quick action buttons
async function handleQuickStart(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const startHandlers = require('./start-handlers');
  await startHandlers.showStartRaidSelector(interaction);
}

async function handleQuickComplete(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await showRaidSelector(interaction, 'complete', '✅ Complete Raid');
}

async function handleQuickEdit(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await showEditRaidSelector(interaction);
}

// ═══════════════════════════════════════════════════════════════
// EDIT RAID SELECTOR
// ═══════════════════════════════════════════════════════════════

async function showEditRaidSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const postedRaids = raids.filter(r => r.message_id);

    if (postedRaids.length === 0) {
      await interaction.followUp({
        content: '❌ No active raids to edit!',
        ephemeral: true
      });
      return;
    }

    const options = postedRaids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${raid.raid_size}-player | ${new Date(raid.start_time).toLocaleString()}`,
      emoji: raid.locked ? '🔒' : '🔓'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_edit_raid_select_${interaction.user.id}`)
      .setPlaceholder('Select a raid to edit or cancel')
      .addOptions(options);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // KEEP the main embed, only change components
    const embed = await createMainMenuEmbed();

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show edit raid selector error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function handleEditRaidSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const raid = await getRaid(raidId);

    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Raid not found!');
    }

    // Show edit options
    const editNameButton = new ButtonBuilder()
      .setCustomId(`raid_edit_raid_name_${raidId}_${interaction.user.id}`)
      .setLabel('📝 Edit Name')
      .setStyle(ButtonStyle.Secondary);

    const editTimeButton = new ButtonBuilder()
      .setCustomId(`raid_edit_raid_time_${raidId}_${interaction.user.id}`)
      .setLabel('🕐 Edit Time')
      .setStyle(ButtonStyle.Secondary);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`raid_action_select_cancel_${raidId}_${interaction.user.id}`)
      .setLabel('❌ Cancel Raid')
      .setStyle(ButtonStyle.Danger);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder().addComponents(editNameButton, editTimeButton, cancelButton);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✏️ **Edit: ${raid.name}**\n\n` +
               `**Current Details:**\n` +
               `📝 Name: ${raid.name}\n` +
               `👥 Size: ${raid.raid_size}-player\n` +
               `🕐 Time: <t:${Math.floor(new Date(raid.start_time).getTime() / 1000)}:F>\n` +
               `📺 Channel: <#${raid.channel_id}>\n` +
               `${raid.locked ? '🔒 Locked' : '🔓 Open'}\n\n` +
               `**What would you like to do?**`,
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Edit raid select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function showRaidSelector(interaction, action, title) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const postedRaids = raids.filter(r => r.message_id);

    if (postedRaids.length === 0) {
      await interaction.followUp({
        content: `❌ No active raids available!`,
        ephemeral: true
      });
      return;
    }

    const options = postedRaids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${raid.raid_size}-player raid`,
      emoji: raid.locked ? '🔒' : '🔓'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_action_select_${action}_${interaction.user.id}`)
      .setPlaceholder(title)
      .addOptions(options);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // KEEP the main embed, only change components
    const embed = await createMainMenuEmbed();

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show raid selector error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function showEditSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const unpostedRaids = raids.filter(r => !r.message_id);

    if (unpostedRaids.length === 0) {
      await interaction.followUp({
        content: '❌ No presets available to edit!',
        ephemeral: true
      });
      return;
    }

    const options = unpostedRaids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${raid.raid_size}-player | ${new Date(raid.start_time).toLocaleString()}`,
      emoji: '✏️'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_edit_select_${interaction.user.id}`)
      .setPlaceholder('Select a preset to edit')
      .addOptions(options);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // KEEP the main embed, only change components
    const embed = await createMainMenuEmbed();

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show edit selector error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function showDeleteSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const unpostedRaids = raids.filter(r => !r.message_id);

    if (unpostedRaids.length === 0) {
      await interaction.followUp({
        content: '❌ No presets available to delete!',
        ephemeral: true
      });
      return;
    }

    const options = unpostedRaids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${raid.raid_size}-player | ${new Date(raid.start_time).toLocaleString()}`,
      emoji: '🗑️'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_delete_select_${interaction.user.id}`)
      .setPlaceholder('Select a preset to delete')
      .addOptions(options);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // KEEP the main embed, only change components
    const embed = await createMainMenuEmbed();

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show delete selector error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function handleBackToMain(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const embed = await createMainMenuEmbed();
  const buttonRow = createMainMenuButtons(interaction.user.id);
  const roleRow = createRoleConfigDropdown(interaction.user.id);
  const presetRow = createPresetDropdown(interaction.user.id);
  const lockUnlockRow = createLockUnlockDropdown(interaction.user.id);
  const embedRow = createEmbedDropdown(interaction.user.id);
  const rosterRow = createRosterDropdown(interaction.user.id);

  await interaction.editReply({
    content: null,
    embeds: [embed],
    components: [buttonRow, roleRow, presetRow, lockUnlockRow, embedRow, rosterRow]
  });
}

async function handleRosterMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  if (action === 'manage') {
    await showRosterRaidSelector(interaction);
  }
}

async function showRosterRaidSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const postedRaids = raids.filter(r => r.message_id);

    if (postedRaids.length === 0) {
      await interaction.followUp({
        content: `❌ No active raids available!`,
        ephemeral: true
      });
      return;
    }

    const options = postedRaids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${raid.raid_size}-player raid`,
      emoji: raid.locked ? '🔒' : '🔓'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_roster_select_${interaction.user.id}`)
      .setPlaceholder('🛠️ Select raid to manage roster')
      .addOptions(options);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    const embed = await createMainMenuEmbed();

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show roster raid selector error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function redirectToMainMenu(interaction, errorMessage) {
  // Just show error, don't rebuild the entire menu
  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: errorMessage,
      ephemeral: true
    });
  } else {
    await interaction.followUp({
      content: errorMessage,
      ephemeral: true
    });
  }
}

module.exports = {
  createMainMenuEmbed,
  createMainMenuButtons,
  createRoleConfigDropdown,
  createPresetDropdown,
  createLockUnlockDropdown,
  createEmbedDropdown,
  createRosterDropdown,
  handleRoleConfigMenu,
  handlePresetMenu,
  handleLockUnlockMenu,
  handleEmbedMenu,
  handleRosterMenu,
  handleQuickStart,
  handleQuickComplete,
  handleQuickEdit,
  handleEditRaidSelect,
  handleBackToMain
};
