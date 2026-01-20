const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllPresets } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// PRESET MANAGEMENT MENU
// ═══════════════════════════════════════════════════════════════

function createPresetMenuEmbed() {
  return new EmbedBuilder()
    .setColor(0x9333EA) // Purple color for presets
    .setTitle('📋 Preset Management')
    .setDescription('**Manage your raid presets (reusable templates)**\n\n━━━━━━━━━━━━━━━━━━━━━━━━')
    .addFields(
      { 
        name: '➕ Create Preset', 
        value: 'Create a new reusable template', 
        inline: true 
      },
      { 
        name: '✏️ Edit Preset', 
        value: 'Modify existing preset', 
        inline: true 
      },
      { 
        name: '🗑️ Delete Preset', 
        value: 'Remove a preset', 
        inline: true 
      },
      { 
        name: '📋 View All Presets', 
        value: 'List all saved presets', 
        inline: true 
      },
      { 
        name: '🚀 Use Preset', 
        value: 'Create raid from preset', 
        inline: true 
      },
      { 
        name: '◀️ Back', 
        value: 'Return to main menu', 
        inline: true 
      }
    )
    .setFooter({ text: 'Presets are saved and reusable templates' });
}

function createPresetMenuRow(userId) {
  const presetMenu = new StringSelectMenuBuilder()
    .setCustomId(`preset_menu_${userId}`)
    .setPlaceholder('📋 Select a preset action')
    .addOptions([
      {
        label: '➕ Create Preset',
        value: 'create',
        description: 'Create a new reusable template',
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
      },
      {
        label: '📋 View All Presets',
        value: 'list',
        description: 'List all saved presets',
        emoji: '📋'
      },
      {
        label: '🚀 Use Preset',
        value: 'use',
        description: 'Create a raid from preset',
        emoji: '🚀'
      },
      {
        label: '◀️ Back to Main Menu',
        value: 'back',
        description: 'Return to main menu',
        emoji: '◀️'
      }
    ]);

  return new ActionRowBuilder().addComponents(presetMenu);
}

async function handlePresetMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  try {
    switch (action) {
      case 'create':
        const createHandlers = require('./preset-create-handlers');
        await createHandlers.startPresetCreate(interaction);
        break;
      
      case 'edit':
        await showEditPresetSelector(interaction);
        break;
      
      case 'delete':
        await showDeletePresetSelector(interaction);
        break;
      
      case 'list':
        await showPresetList(interaction);
        break;
      
      case 'use':
        await showUsePresetSelector(interaction);
        break;
      
      case 'back':
        const { 
          createMainMenuEmbed, 
          createMainMenuButtons,
          createRosterDropdown,
          createLockUnlockDropdown,
          createPresetDropdown,
          createEmbedAndRoleDropdown
        } = require('./main-menu');
        await interaction.deferUpdate();
        const embed = await createMainMenuEmbed();
        const buttonRow = createMainMenuButtons(interaction.user.id);
        const rosterRow = createRosterDropdown(interaction.user.id);
        const lockUnlockRow = createLockUnlockDropdown(interaction.user.id);
        const presetRow = createPresetDropdown(interaction.user.id);
        const managementRow = createEmbedAndRoleDropdown(interaction.user.id);
        await interaction.editReply({
          content: null,
          embeds: [embed],
          components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow]
        });
        break;
      
      default:
        await redirectToPresetMenu(interaction, '❌ Unknown action!');
    }
  } catch (error) {
    console.error('Preset menu error:', error);
    await redirectToPresetMenu(interaction, '❌ An error occurred!');
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function showPresetList(interaction) {
  await interaction.deferUpdate();

  try {
    const presets = await getAllPresets();

    if (presets.length === 0) {
      return await redirectToPresetMenu(interaction, '📋 No presets found!\n\nCreate your first preset to get started.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x9333EA)
      .setTitle('📋 All Presets')
      .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const preset of presets) {
      const guild = interaction.guild;
      const channel = guild.channels.cache.get(preset.channel_id);
      const channelName = channel ? `#${channel.name}` : 'Unknown Channel';
      
      embed.addFields({
        name: `${preset.name}`,
        value: `**Size:** ${preset.raid_size}-player\n**Time:** ${preset.time_utc} UTC\n**Channel:** ${channelName}`,
        inline: true
      });
    }

    const backButton = new ButtonBuilder()
      .setCustomId(`preset_back_to_menu_${interaction.user.id}`)
      .setLabel('◀️ Back to Preset Menu')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [row]
    });

  } catch (error) {
    console.error('Show preset list error:', error);
    await redirectToPresetMenu(interaction, '❌ An error occurred!');
  }
}

async function showEditPresetSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const presets = await getAllPresets();

    if (presets.length === 0) {
      return await redirectToPresetMenu(interaction, '❌ No presets available to edit!\n\nCreate a preset first.');
    }

    const options = presets.map(preset => ({
      label: preset.name,
      value: preset.id.toString(),
      description: `${preset.raid_size}-player at ${preset.time_utc} UTC`,
      emoji: '✏️'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`preset_edit_select_${interaction.user.id}`)
      .setPlaceholder('Select a preset to edit')
      .addOptions(options.slice(0, 25)); // Discord limit

    const backButton = new ButtonBuilder()
      .setCustomId(`preset_back_to_menu_${interaction.user.id}`)
      .setLabel('◀️ Back to Preset Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '✏️ **Edit Preset:** Select which preset to edit',
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show edit preset selector error:', error);
    await redirectToPresetMenu(interaction, '❌ An error occurred!');
  }
}

async function showDeletePresetSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const presets = await getAllPresets();

    if (presets.length === 0) {
      return await redirectToPresetMenu(interaction, '❌ No presets available to delete!\n\nCreate a preset first.');
    }

    const options = presets.map(preset => ({
      label: preset.name,
      value: preset.id.toString(),
      description: `${preset.raid_size}-player at ${preset.time_utc} UTC`,
      emoji: '🗑️'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`preset_delete_select_${interaction.user.id}`)
      .setPlaceholder('Select a preset to delete')
      .addOptions(options.slice(0, 25)); // Discord limit

    const backButton = new ButtonBuilder()
      .setCustomId(`preset_back_to_menu_${interaction.user.id}`)
      .setLabel('◀️ Back to Preset Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '🗑️ **Delete Preset:** Select which preset to delete',
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show delete preset selector error:', error);
    await redirectToPresetMenu(interaction, '❌ An error occurred!');
  }
}

async function showUsePresetSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const presets = await getAllPresets();

    if (presets.length === 0) {
      return await redirectToPresetMenu(interaction, '❌ No presets available!\n\nCreate a preset first.');
    }

    const options = presets.map(preset => ({
      label: preset.name,
      value: preset.id.toString(),
      description: `${preset.raid_size}-player at ${preset.time_utc} UTC`,
      emoji: '🚀'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`preset_use_select_${interaction.user.id}`)
      .setPlaceholder('Select a preset to use')
      .addOptions(options.slice(0, 25)); // Discord limit

    const backButton = new ButtonBuilder()
      .setCustomId(`preset_back_to_menu_${interaction.user.id}`)
      .setLabel('◀️ Back to Preset Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '🚀 **Use Preset:** Select which preset to create a raid from',
      embeds: [],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show use preset selector error:', error);
    await redirectToPresetMenu(interaction, '❌ An error occurred!');
  }
}

async function handleBackToPresetMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const embed = createPresetMenuEmbed();
  const row = createPresetMenuRow(interaction.user.id);

  await interaction.editReply({
    content: null,
    embeds: [embed],
    components: [row]
  });
}

async function redirectToPresetMenu(interaction, errorMessage) {
  const embed = createPresetMenuEmbed();
  const row = createPresetMenuRow(interaction.user.id);

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: errorMessage,
      embeds: [embed],
      components: [row],
      flags: 64
    });
  } else {
    await interaction.editReply({
      content: errorMessage,
      embeds: [embed],
      components: [row]
    });
  }

  // Auto-remove error message after 3 seconds
  setTimeout(async () => {
    try {
      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [row]
      });
    } catch (err) {
      // Ignore if interaction expired
    }
  }, 3000);
}

module.exports = {
  createPresetMenuEmbed,
  createPresetMenuRow,
  handlePresetMenu,
  handleBackToPresetMenu
};
