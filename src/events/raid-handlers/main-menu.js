const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getActiveRaids } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// MAIN RAID MENU HANDLER
// ═══════════════════════════════════════════════════════════════

function createMainMenuEmbed() {
  return new EmbedBuilder()
    .setColor(0xEC4899)
    .setTitle('🎮 Raid Management System')
    .setDescription('**Select an action from the dropdown below:**\n\n━━━━━━━━━━━━━━━━━━━━━━━━')
    .addFields(
      { 
        name: '⚙️ Setup', 
        value: 'Configure Raid 1 & Raid 2 roles', 
        inline: true 
      },
      { 
        name: '➕ Create Preset', 
        value: 'Create new raid preset', 
        inline: true 
      },
      { 
        name: '🚀 Start', 
        value: 'Post raid to channel', 
        inline: true 
      },
      { 
        name: '📋 List', 
        value: 'View active raids', 
        inline: true 
      },
      { 
        name: '🔒 Lock/🔓 Unlock', 
        value: 'Control registration', 
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
        value: 'Repost deleted embed', 
        inline: true 
      },
      { 
        name: '🔄 Refresh', 
        value: 'Update embed', 
        inline: true 
      }
    )
    .setFooter({ text: 'All actions are ephemeral (only you can see them)' });
}

function createMainMenuRow(userId) {
  const mainMenu = new StringSelectMenuBuilder()
    .setCustomId(`raid_main_menu_${userId}`)
    .setPlaceholder('🎮 Select a raid action')
    .addOptions([
      {
        label: '⚙️ Initial Setup',
        value: 'setup',
        description: 'Configure raid roles (one-time setup)',
        emoji: '⚙️'
      },
      {
        label: '➕ Create Preset',
        value: 'create',
        description: 'Create a new raid preset',
        emoji: '➕'
      },
      {
        label: '🚀 Start Raid',
        value: 'start',
        description: 'Post raid to channel',
        emoji: '🚀'
      },
      {
        label: '📋 List Active Raids',
        value: 'list',
        description: 'View all active raids',
        emoji: '📋'
      },
      {
        label: '🔒 Lock Raid',
        value: 'lock',
        description: 'Lock registration (keep unregister)',
        emoji: '🔒'
      },
      {
        label: '🔓 Unlock Raid',
        value: 'unlock',
        description: 'Unlock registration',
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
        description: 'Repost deleted raid embed',
        emoji: '📝'
      },
      {
        label: '🔄 Refresh Embed',
        value: 'refresh',
        description: 'Update raid embed display',
        emoji: '🔄'
      }
    ]);

  return new ActionRowBuilder().addComponents(mainMenu);
}

async function handleRaidMainMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

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

module.exports = {
  handleRaidMainMenu,
  handleBackToMain,
  createMainMenuEmbed,
  createMainMenuRow
};
