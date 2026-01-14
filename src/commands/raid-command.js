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

    const row = new ActionRowBuilder().addComponents(mainMenu);

    const embed = new EmbedBuilder()
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

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
