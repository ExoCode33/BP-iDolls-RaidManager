const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getActiveRaids, getRaid } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// MAIN MENU - REDESIGNED WITH BUTTONS AND ORGANIZED DROPDOWNS
// ═══════════════════════════════════════════════════════════════

async function createMainMenuEmbed() {
  const raids = await getActiveRaids();
  
  const embed = new EmbedBuilder()
    .setColor(0xEC4899)
    .setTitle('🎮 Raid Management System')
    .setDescription('**Professional raid coordination for your guild**\n\n━━━━━━━━━━━━━━━━━━━━━━━━');

  // Always show active raids
  if (raids.length === 0) {
    embed.addFields({
      name: '📋 Active Raids',
      value: '*No active raids*',
      inline: false
    });
  } else {
    let raidsList = '';
    for (const raid of raids) {
      const startTime = Math.floor(new Date(raid.start_time).getTime() / 1000);
      const status = raid.locked ? '🔒' : '🔓';
      const posted = raid.message_id ? '✅' : '⏳';
      raidsList += `${status} ${posted} **${raid.name}** - ${raid.raid_size}p - <t:${startTime}:F>\n`;
    }
    embed.addFields({
      name: '📋 Active Raids',
      value: raidsList,
      inline: false
    });
  }

  embed.addFields(
    { name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
    { 
      name: '🎯 Quick Actions', 
      value: 'Use buttons above to start, complete, or edit raids\n' +
             'Use dropdowns below for configuration and management', 
      inline: false 
    }
  );

  embed.setFooter({ text: '🔒 = Locked | 🔓 = Open | ✅ = Posted | ⏳ = Not Posted' });
  
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

function createLockDropdown(userId) {
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`raid_lock_menu_${userId}`)
    .setPlaceholder('🔒 Lock Management')
    .addOptions([
      {
        label: '🔒 Lock Raid',
        value: 'lock',
        description: 'Prevent new registrations',
        emoji: '🔒'
      }
    ]);

  return new ActionRowBuilder().addComponents(dropdown);
}

function createUnlockDropdown(userId) {
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`raid_unlock_menu_${userId}`)
    .setPlaceholder('🔓 Unlock Management')
    .addOptions([
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

async function handleLockMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await showRaidSelector(interaction, 'lock', '🔒 Lock Registration');
}

async function handleUnlockMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await showRaidSelector(interaction, 'unlock', '🔓 Unlock Registration');
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
      return await redirectToMainMenu(interaction, '❌ No active raids to edit!\n\nOnly posted raids can be edited or cancelled.');
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
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '✏️ **Edit Raid:** Select which raid to modify or cancel',
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show edit raid selector error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
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
      return await redirectToMainMenu(interaction, `❌ No active raids available for this action!`);
    }

    const options = postedRaids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${raid.raid_size}-player raid`,
      emoji: raid.locked ? '🔒' : '🔓'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_action_select_${action}_${interaction.user.id}`)
      .setPlaceholder(`Select a raid`)
      .addOptions(options);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `${title}`,
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show raid selector error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function showEditSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const unpostedRaids = raids.filter(r => !r.message_id);

    if (unpostedRaids.length === 0) {
      return await redirectToMainMenu(interaction, '❌ No presets available to edit!\n\nOnly unposted raids (presets) can be edited here.');
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
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '✏️ **Edit Preset:** Select which preset to edit',
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show edit selector error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function showDeleteSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const unpostedRaids = raids.filter(r => !r.message_id);

    if (unpostedRaids.length === 0) {
      return await redirectToMainMenu(interaction, '❌ No presets available to delete!\n\nOnly unposted raids (presets) can be deleted.');
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
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '🗑️ **Delete Preset:** Select which preset to delete',
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show delete selector error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
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
  const lockRow = createLockDropdown(interaction.user.id);
  const unlockRow = createUnlockDropdown(interaction.user.id);
  const embedRow = createEmbedDropdown(interaction.user.id);

  await interaction.editReply({
    content: null,
    embeds: [embed],
    components: [buttonRow, roleRow, presetRow, lockRow, unlockRow, embedRow]
  });
}

async function redirectToMainMenu(interaction, errorMessage) {
  const embed = await createMainMenuEmbed();
  const buttonRow = createMainMenuButtons(interaction.user.id);
  const roleRow = createRoleConfigDropdown(interaction.user.id);
  const presetRow = createPresetDropdown(interaction.user.id);
  const lockRow = createLockDropdown(interaction.user.id);
  const unlockRow = createUnlockDropdown(interaction.user.id);
  const embedRow = createEmbedDropdown(interaction.user.id);

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: errorMessage,
      embeds: [embed],
      components: [buttonRow, roleRow, presetRow, lockRow, unlockRow, embedRow],
      flags: 64
    });
  } else {
    await interaction.editReply({
      content: errorMessage,
      embeds: [embed],
      components: [buttonRow, roleRow, presetRow, lockRow, unlockRow, embedRow]
    });
  }

  // Auto-remove error message after 3 seconds
  setTimeout(async () => {
    try {
      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [buttonRow, roleRow, presetRow, lockRow, unlockRow, embedRow]
      });
    } catch (err) {
      // Ignore if interaction expired
    }
  }, 3000);
}

module.exports = {
  createMainMenuEmbed,
  createMainMenuButtons,
  createRoleConfigDropdown,
  createPresetDropdown,
  createLockDropdown,
  createUnlockDropdown,
  createEmbedDropdown,
  handleRoleConfigMenu,
  handlePresetMenu,
  handleLockMenu,
  handleUnlockMenu,
  handleEmbedMenu,
  handleQuickStart,
  handleQuickComplete,
  handleQuickEdit,
  handleEditRaidSelect,
  handleBackToMain
};
