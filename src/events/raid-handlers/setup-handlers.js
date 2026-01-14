const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

    // Validate role IDs (should be Discord snowflakes)
    if (!/^\d{17,20}$/.test(raid1RoleId) || !/^\d{17,20}$/.test(raid2RoleId)) {
      return await redirectToMainMenu(interaction, '❌ Invalid role IDs! Role IDs should be 17-20 digit numbers.');
    }

    await setConfig('raid1_role_id', raid1RoleId);
    await setConfig('raid2_role_id', raid2RoleId);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ Raid roles configured!\n**Raid 1:** <@&${raid1RoleId}>\n**Raid 2:** <@&${raid2RoleId}>`,
      components: [row]
    });
  } catch (error) {
    console.error('Setup error:', error);
    await redirectToMainMenu(interaction, '❌ Failed to setup roles!');
  }
}

async function redirectToMainMenu(interaction, errorMessage) {
  const { createMainMenuEmbed, createMainMenuRow } = require('./main-menu');
  
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
  showSetupModal,
  handleSetupModal
};
