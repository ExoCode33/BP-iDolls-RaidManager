// ═══════════════════════════════════════════════════════════════
// PATCH FOR main-menu.js - handlePresetMenu function
// ═══════════════════════════════════════════════════════════════

// Replace the handlePresetMenu function with this updated version:

async function handlePresetMenu(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const action = interaction.values[0];

  try {
    switch (action) {
      case 'create':
        // Show modal immediately - don't defer
        const modal = new ModalBuilder()
          .setCustomId(`raid_create_name_${interaction.user.id}`)
          .setTitle('Create Raid - Step 1/5');

        const nameInput = new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Raid Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., Saturday Night Raid')
          .setRequired(true)
          .setMaxLength(200);

        const row = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        break;
      
      case 'edit':
        await showEditSelector(interaction);
        break;
      
      case 'delete':
        await showDeleteSelector(interaction);
        break;
    }
  } catch (error) {
    console.error('Preset menu error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// IMPORTANT: Add these imports at the top of main-menu.js if not already present:
// const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
