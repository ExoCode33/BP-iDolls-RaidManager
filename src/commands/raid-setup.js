const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { eventDB } = require('../database/connection');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid-setup')
    .setDescription('Setup raid roles (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(option =>
      option.setName('raid1')
        .setDescription('Raid 1 role')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('raid2')
        .setDescription('Raid 2 role')
        .setRequired(true)),

  async execute(interaction) {
    const raid1Role = interaction.options.getRole('raid1');
    const raid2Role = interaction.options.getRole('raid2');

    await eventDB.query(
      "INSERT INTO bot_config (key, value) VALUES ('raid1_role_id', $1), ('raid2_role_id', $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [raid1Role.id, raid2Role.id]
    );

    await interaction.reply({
      content: `✅ Raid roles configured!\n**Raid 1:** ${raid1Role}\n**Raid 2:** ${raid2Role}`,
      flags: 64
    });
  }
};
