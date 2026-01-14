const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Comprehensive raid management system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 }); // Ephemeral

    const mainMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_main_menu_${interaction.user.id}`)
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

    const row = new ActionRowBuilder().addComponents(mainMenu);

    const embed = new EmbedBuilder()
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

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
