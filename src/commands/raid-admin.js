const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { getActiveRaids, getRaid, completeRaid, cancelRaid, updateRaidMessage } = require('../database/raids');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid-admin')
    .setDescription('Admin commands for raid management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('complete')
        .setDescription('Mark a raid as completed')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel a raid')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('repost')
        .setDescription('Repost a raid embed (if deleted)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('refresh')
        .setDescription('Refresh a raid embed')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      const raids = await getActiveRaids();

      if (raids.length === 0) {
        return await interaction.reply({
          content: '❌ No active raids found!',
          flags: 64 // Ephemeral
        });
      }

      const options = raids.map(raid => ({
        label: raid.name,
        value: raid.id.toString(),
        description: `Started: ${new Date(raid.start_time).toLocaleString()}`
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`admin_${subcommand}_select`)
        .setPlaceholder('Select a raid')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: `Select a raid to ${subcommand}:`,
        components: [row],
        flags: 64 // Ephemeral
      });

    } catch (error) {
      console.error(`Admin ${subcommand} error:`, error);
      await interaction.reply({
        content: '❌ An error occurred!',
        flags: 64 // Ephemeral
      });
    }
  }
};
