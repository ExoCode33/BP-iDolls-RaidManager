const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { getRaid, updateRaid, updateRaidStatus } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// EDIT PRESET HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleEditSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const raid = await getRaid(raidId);

    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Preset not found!');
    }

    if (raid.message_id) {
      return await redirectToMainMenu(interaction, '❌ Cannot edit a raid that has already been posted!\n\nYou can only edit unposted presets.');
    }

    // Show what can be edited
    const editButton1 = new ButtonBuilder()
      .setCustomId(`raid_edit_name_${raidId}_${interaction.user.id}`)
      .setLabel(`📝 Name: ${raid.name}`)
      .setStyle(ButtonStyle.Secondary);

    const editButton2 = new ButtonBuilder()
      .setCustomId(`raid_edit_time_${raidId}_${interaction.user.id}`)
      .setLabel(`🕐 Time: ${new Date(raid.start_time).toLocaleString()}`)
      .setStyle(ButtonStyle.Secondary);

    const editButton3 = new ButtonBuilder()
      .setCustomId(`raid_edit_channel_${raidId}_${interaction.user.id}`)
      .setLabel(`📺 Channel`)
      .setStyle(ButtonStyle.Secondary);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder().addComponents(editButton1, editButton2, editButton3);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✏️ **Edit Preset: ${raid.name}**\n\n` +
               `**Current Details:**\n` +
               `📝 Name: ${raid.name}\n` +
               `👥 Size: ${raid.raid_size}-player\n` +
               `🕐 Time: <t:${Math.floor(new Date(raid.start_time).getTime() / 1000)}:F>\n` +
               `📺 Channel: <#${raid.channel_id}>\n\n` +
               `Click a button below to edit that field:`,
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Edit select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE PRESET HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleDeleteSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const raid = await getRaid(raidId);

    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Preset not found!');
    }

    if (raid.message_id) {
      return await redirectToMainMenu(interaction, '❌ Cannot delete a raid that has already been posted!\n\nUse "Cancel Raid" instead.');
    }

    // Show confirmation
    const confirmButton = new ButtonBuilder()
      .setCustomId(`raid_delete_confirm_${raidId}_${interaction.user.id}`)
      .setLabel('🗑️ Confirm Delete')
      .setStyle(ButtonStyle.Danger);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, backButton);

    await interaction.editReply({
      content: `⚠️ **Are you sure you want to delete this preset?**\n\n` +
               `**${raid.name}**\n` +
               `Size: ${raid.raid_size}-player\n` +
               `Time: <t:${Math.floor(new Date(raid.start_time).getTime() / 1000)}:F>\n\n` +
               `This action cannot be undone!`,
      components: [row]
    });

  } catch (error) {
    console.error('Delete select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

async function handleDeleteConfirm(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[3]);
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raid = await getRaid(raidId);

    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Preset not found!');
    }

    // Delete the preset
    await updateRaidStatus(raidId, 'cancelled');

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ **Preset "${raid.name}" has been deleted!**`,
      components: [row]
    });

  } catch (error) {
    console.error('Delete confirm error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function redirectToMainMenu(interaction, errorMessage) {
  const { 
    createMainMenuEmbed, 
    createMainMenuButtons,
    createRosterDropdown,
    createLockUnlockDropdown,
    createPresetDropdown,
    createEmbedAndRoleDropdown
  } = require('./main-menu');
  
  const embed = await createMainMenuEmbed();
  const buttonRow = createMainMenuButtons(interaction.user.id);
  const rosterRow = createRosterDropdown(interaction.user.id);
  const lockUnlockRow = createLockUnlockDropdown(interaction.user.id);
  const presetRow = createPresetDropdown(interaction.user.id);
  const managementRow = createEmbedAndRoleDropdown(interaction.user.id);

  await interaction.editReply({
    content: errorMessage,
    embeds: [embed],
    components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow]
  });

  // Auto-remove error message after 3 seconds
  setTimeout(async () => {
    try {
      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow]
      });
    } catch (err) {
      // Ignore if interaction expired
    }
  }, 3000);
}

module.exports = {
  handleEditSelect,
  handleDeleteSelect,
  handleDeleteConfirm
};
