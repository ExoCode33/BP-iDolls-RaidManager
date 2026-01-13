const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { setConfig } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// SETUP HANDLERS
// ═══════════════════════════════════════════════════════════════

async function showSetupModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`raid_setup_modal_${interaction.user.id}`)
    .setTitle('⚙️ Setup Raid Roles');

  const raid1Input = new TextInputBuilder()
    .setCustomId('raid1_role_id')
    .setLabel('Raid 1 Role ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Right-click role → Copy ID')
    .setRequired(true);

  const raid2Input = new TextInputBuilder()
    .setCustomId('raid2_role_id')
    .setLabel('Raid 2 Role ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Right-click role → Copy ID')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(raid1Input),
    new ActionRowBuilder().addComponents(raid2Input)
  );

  await interaction.showModal(modal);
}

async function handleSetupModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferReply({ flags: 64 });

  try {
    const raid1RoleId = interaction.fields.getTextInputValue('raid1_role_id');
    const raid2RoleId = interaction.fields.getTextInputValue('raid2_role_id');

    await setConfig('raid1_role_id', raid1RoleId);
    await setConfig('raid2_role_id', raid2RoleId);

    await interaction.editReply({
      content: `✅ Raid roles configured!\n**Raid 1:** <@&${raid1RoleId}>\n**Raid 2:** <@&${raid2RoleId}>`
    });
  } catch (error) {
    console.error('Setup error:', error);
    await interaction.editReply({ content: '❌ Failed to setup roles!' });
  }
}

module.exports = {
  showSetupModal,
  handleSetupModal
};
