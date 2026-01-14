const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getActiveRaids } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// MAIN RAID MENU HANDLER
// ═══════════════════════════════════════════════════════════════

function createMainMenuEmbed() {
  return new EmbedBuilder()
    .setColor(0xEC4899)
    .setTitle('🎮 Raid Management System')
    .setDescription('**Professional raid coordination for your guild**\n\n━━━━━━━━━━━━━━━━━━━━━━━━')
    .addFields(
      { 
        name: '\u200B', 
        value: '**📋 SETUP & CONFIGURATION**', 
        inline: false 
      },
      { 
        name: '⚙️ Role Setup', 
        value: 'Configure raid roles', 
        inline: true 
      },
      { 
        name: '\u200B', 
        value: '\u200B', 
        inline: true 
      },
      { 
        name: '\u200B', 
        value: '\u200B', 
        inline: true 
      },
      { 
        name: '\u200B', 
        value: '**📝 PRESET MANAGEMENT**', 
        inline: false 
      },
      { 
        name: '➕ Create', 
        value: 'New template', 
        inline: true 
      },
      { 
        name: '✏️ Edit', 
        value: 'Modify existing', 
        inline: true 
      },
      { 
        name: '🗑️ Delete', 
        value: 'Remove preset', 
        inline: true 
      },
      { 
        name: '\u200B', 
        value: '**🚀 RAID OPERATIONS**', 
        inline: false 
      },
      { 
        name: '📋 View Raids', 
        value: 'List all active', 
        inline: true 
      },
      { 
        name: '🎯 Start Raid', 
        value: 'Post to channel', 
        inline: true 
      },
      { 
        name: '🔄 Refresh', 
        value: 'Update embed', 
        inline: true 
      },
      { 
        name: '\u200B', 
        value: '**⚡ QUICK ACTIONS**', 
        inline: false 
      },
      { 
        name: '🔒 Lock', 
        value: 'Stop signups', 
        inline: true 
      },
      { 
        name: '🔓 Unlock', 
        value: 'Allow signups', 
        inline: true 
      },
      { 
        name: '✅ Complete', 
        value: 'Finish raid', 
        inline: true 
      },
      { 
        name: '❌ Cancel', 
        value: 'Cancel raid', 
        inline: true 
      },
      { 
        name: '📝 Repost', 
        value: 'Restore embed', 
        inline: true 
      },
      { 
        name: '\u200B', 
        value: '\u200B', 
        inline: true 
      }
    )
    .setFooter({ text: 'All actions are private • Select an option below' });
}

function createMainMenuRow(userId) {
  const mainMenu = new StringSelectMenuBuilder()
    .setCustomId(`raid_main_menu_${userId}`)
    .setPlaceholder('🎮 Select an action')
    .addOptions([
      {
        label: '⚙️ Role Setup',
        value: 'setup',
        description: 'Configure Raid 1 & Raid 2 roles',
        emoji: '⚙️'
      },
      {
        label: '─────────────────────',
        value: 'separator1',
        description: 'PRESET MANAGEMENT',
        emoji: '📝'
      },
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
      },
      {
        label: '─────────────────────',
        value: 'separator2',
        description: 'RAID OPERATIONS',
        emoji: '🚀'
      },
      {
        label: '📋 View Active Raids',
        value: 'list',
        description: 'List all active raids',
        emoji: '📋'
      },
      {
        label: '🎯 Start Raid',
        value: 'start',
        description: 'Post a raid to channel',
        emoji: '🎯'
      },
      {
        label: '🔄 Refresh Embed',
        value: 'refresh',
        description: 'Update raid display',
        emoji: '🔄'
      },
      {
        label: '─────────────────────',
        value: 'separator3',
        description: 'QUICK ACTIONS',
        emoji: '⚡'
      },
      {
        label: '🔒 Lock Raid',
        value: 'lock',
        description: 'Stop new registrations',
        emoji: '🔒'
      },
      {
        label: '🔓 Unlock Raid',
        value: 'unlock',
        description: 'Allow registrations',
        emoji: '🔓'
      },
      {
        label: '✅ Complete Raid',
        value: 'complete',
        description: 'Mark raid as completed',
        emoji: '✅'
      },
      {
        label: '❌ Cancel Raid',
        value: 'cancel',
        description: 'Cancel a raid',
        emoji: '❌'
      },
      {
        label: '📝 Repost Embed',
        value: 'repost',
        description: 'Restore deleted embed',
        emoji: '📝'
      }
    ]);

  return new ActionRowBuilder().addComponents(mainMenu);
}

async function handleRaidMainMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  // Ignore separator selections
  if (action.startsWith('separator')) {
    await interaction.deferUpdate();
    return;
  }

  try {
    switch (action) {
      case 'setup':
        const setupHandlers = require('./setup-handlers');
        await setupHandlers.showSetupModal(interaction);
        break;
      
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
      
      case 'start':
        const startHandlers = require('./start-handlers');
        await startHandlers.showStartRaidSelector(interaction);
        break;
      
      case 'list':
        await showRaidList(interaction);
        break;
      
      case 'lock':
        await showRaidSelector(interaction, 'lock', '🔒 Lock Registration');
        break;
      
      case 'unlock':
        await showRaidSelector(interaction, 'unlock', '🔓 Unlock Registration');
        break;
      
      case 'complete':
        await showRaidSelector(interaction, 'complete', '✅ Complete Raid');
        break;
      
      case 'cancel':
        await showRaidSelector(interaction, 'cancel', '❌ Cancel Raid');
        break;
      
      case 'repost':
        await showRaidSelector(interaction, 'repost', '📝 Repost Embed');
        break;
      
      case 'refresh':
        await showRaidSelector(interaction, 'refresh', '🔄 Refresh Embed');
        break;
      
      default:
        await redirectToMainMenuWithError(interaction, '❌ Unknown action!');
    }
  } catch (error) {
    console.error('Raid menu error:', error);
    await redirectToMainMenuWithError(interaction, '❌ An error occurred!');
  }
}

async function handleBackToMain(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const embed = createMainMenuEmbed();
  const row = createMainMenuRow(interaction.user.id);

  await interaction.editReply({
    content: null,
    embeds: [embed],
    components: [row]
  });
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function showRaidList(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();

    if (raids.length === 0) {
      return await redirectToMainMenuWithError(interaction, '📋 No active raids at the moment.');
    }

    const embed = new EmbedBuilder()
      .setColor(0xEC4899)
      .setTitle('📋 Active Raids')
      .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const raid of raids) {
      const startTime = Math.floor(new Date(raid.start_time).getTime() / 1000);
      const status = raid.locked ? '🔒 Locked' : '🔓 Open';
      const posted = raid.message_id ? '✅ Posted' : '⏳ Not Posted';
      
      embed.addFields({
        name: `${raid.name}`,
        value: `**Status:** ${status} | ${posted}\n**Size:** ${raid.raid_size}-player\n**Time:** <t:${startTime}:F>\n**Channel:** <#${raid.channel_id}>`,
        inline: false
      });
    }

    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({ 
      content: null,
      embeds: [embed], 
      components: [row] 
    });
  } catch (error) {
    console.error('Show raid list error:', error);
    await redirectToMainMenuWithError(interaction, '❌ An error occurred while loading raids!');
  }
}

async function showRaidSelector(interaction, action, title) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();

    if (raids.length === 0) {
      return await redirectToMainMenuWithError(interaction, '❌ No active raids found!');
    }

    const options = raids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${new Date(raid.start_time).toLocaleString()}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_action_${action}_${interaction.user.id}`)
      .setPlaceholder('Select a raid')
      .addOptions(options);

    const { ButtonBuilder, ButtonStyle } = require('discord.js');
    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `${title}: Select a raid`,
      embeds: [],
      components: [row1, row2]
    });
  } catch (error) {
    console.error('Show raid selector error:', error);
    await redirectToMainMenuWithError(interaction, '❌ An error occurred!');
  }
}

async function redirectToMainMenuWithError(interaction, errorMessage) {
  const embed = createMainMenuEmbed();
  const row = createMainMenuRow(interaction.user.id);

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

async function showEditSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const unpostedRaids = raids.filter(r => !r.message_id);

    if (unpostedRaids.length === 0) {
      return await redirectToMainMenuWithError(interaction, '❌ No presets available to edit!\n\nOnly unposted raids (presets) can be edited.');
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

    const { ButtonBuilder, ButtonStyle } = require('discord.js');
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
    await redirectToMainMenuWithError(interaction, '❌ An error occurred!');
  }
}

async function showDeleteSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getActiveRaids();
    const unpostedRaids = raids.filter(r => !r.message_id);

    if (unpostedRaids.length === 0) {
      return await redirectToMainMenuWithError(interaction, '❌ No presets available to delete!\n\nOnly unposted raids (presets) can be deleted.');
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

    const { ButtonBuilder, ButtonStyle } = require('discord.js');
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
    await redirectToMainMenuWithError(interaction, '❌ An error occurred!');
  }
}

module.exports = {
  handleRaidMainMenu,
  handleBackToMain,
  createMainMenuEmbed,
  createMainMenuRow
};
