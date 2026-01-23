const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { setConfig } = require('../../database/queries');
const logger = require('../../utils/logger');

// ═══════════════════════════════════════════════════════════════
// SETUP HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleSetupMenu(interaction) {
  await interaction.deferReply({ flags: 64 });

  const modal = new ModalBuilder()
    .setCustomId(`raid_setup_modal_${interaction.user.id}`)
    .setTitle('Raid Bot Setup');

  const raid1Input = new TextInputBuilder()
    .setCustomId('raid1_role')
    .setLabel('Raid 1 Role ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Right-click role → Copy ID')
    .setRequired(true);

  const raid2Input = new TextInputBuilder()
    .setCustomId('raid2_role')
    .setLabel('Raid 2 Role ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Right-click role → Copy ID')
    .setRequired(true);

  const row1 = new ActionRowBuilder().addComponents(raid1Input);
  const row2 = new ActionRowBuilder().addComponents(raid2Input);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

async function handleSetupModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raid1RoleId = interaction.fields.getTextInputValue('raid1_role').trim();
    const raid2RoleId = interaction.fields.getTextInputValue('raid2_role').trim();

    // Validate role IDs
    if (!/^\d{17,19}$/.test(raid1RoleId) || !/^\d{17,19}$/.test(raid2RoleId)) {
      return await interaction.editReply({
        content: '❌ Invalid role ID format! Role IDs should be 17-19 digits.',
        components: []
      });
    }

    // Verify roles exist
    try {
      await interaction.guild.roles.fetch(raid1RoleId);
      await interaction.guild.roles.fetch(raid2RoleId);
    } catch (err) {
      return await interaction.editReply({
        content: '❌ One or both roles not found! Make sure the bot can see these roles.',
        components: []
      });
    }

    await setConfig('raid1_role_id', raid1RoleId);
    await setConfig('raid2_role_id', raid2RoleId);

    // Log config changes
    await logger.logConfigChange('raid1_role_id', 'not set', raid1RoleId, interaction.user);
    await logger.logConfigChange('raid2_role_id', 'not set', raid2RoleId, interaction.user);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ Setup complete!\n\n**Raid 1 Role:** <@&${raid1RoleId}>\n**Raid 2 Role:** <@&${raid2RoleId}>\n\nYou can now create and post raids!`,
      components: [row]
    });

  } catch (error) {
    console.error('Setup modal error:', error);
    await interaction.editReply({
      content: '❌ Setup failed. Please try again.',
      components: []
    });
  }
}

module.exports = {
  handleSetupMenu,
  handleSetupModal
};
