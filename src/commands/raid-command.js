const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { 
  createMainMenuEmbed,
  createMainMenuButtons,
  createRoleConfigDropdown,
  createPresetDropdown,
  createLockDropdown,
  createUnlockDropdown,
  createEmbedDropdown
} = require('../events/raid-handlers/main-menu');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Comprehensive raid management system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 }); // Ephemeral

    const embed = await createMainMenuEmbed();
    const buttonRow = createMainMenuButtons(interaction.user.id);
    const roleRow = createRoleConfigDropdown(interaction.user.id);
    const presetRow = createPresetDropdown(interaction.user.id);
    const lockRow = createLockDropdown(interaction.user.id);
    const unlockRow = createUnlockDropdown(interaction.user.id);
    const embedRow = createEmbedDropdown(interaction.user.id);

    await interaction.editReply({
      embeds: [embed],
      components: [buttonRow, roleRow, presetRow, lockRow, unlockRow, embedRow]
    });
  }
};
