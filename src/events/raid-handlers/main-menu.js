const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getActiveRaids, getUnpostedRaids } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// MAIN RAID MENU HANDLER
// ═══════════════════════════════════════════════════════════════

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
        await interaction.update({
          content: '❌ Unknown action!',
          embeds: [],
          components: []
        });
    }
  } catch (error) {
    console.error('Raid menu error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred!', flags: 64 });
    } else {
      await interaction.followUp({ content: '❌ An error occurred!', flags: 64 });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function showRaidList(interaction) {
  await interaction.deferUpdate();

  const raids = await getActiveRaids();

  if (raids.length === 0) {
    return await interaction.editReply({
      content: '📋 No active raids at the moment.',
      embeds: [],
      components: []
    });
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

  await interaction.editReply({ embeds: [embed], components: [] });
}

async function showRaidSelector(interaction, action, title) {
  await interaction.deferUpdate();

  const raids = await getActiveRaids();

  if (raids.length === 0) {
    return await interaction.editReply({
      content: '❌ No active raids found!',
      embeds: [],
      components: []
    });
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

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.editReply({
    content: `${title}: Select a raid`,
    embeds: [],
    components: [row]
  });
}

module.exports = {
  handleRaidMainMenu
};
