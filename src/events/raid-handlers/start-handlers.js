const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUnpostedRaids, createRaidPost, updateRaidMessageId } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// START RAID HANDLERS
// ═══════════════════════════════════════════════════════════════

async function showStartRaidSelector(interaction) {
  await interaction.deferUpdate();

  try {
    const raids = await getUnpostedRaids();

    if (raids.length === 0) {
      await interaction.followUp({
        content: '❌ No raids available to start!\n\nCreate a raid first using **Create Preset**.',
        ephemeral: true
      });
      return;
    }

    const options = raids.map(raid => ({
      label: raid.name,
      value: raid.id.toString(),
      description: `${raid.raid_size}-player | ${new Date(raid.start_time).toLocaleString()}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_start_select_${interaction.user.id}`)
      .setPlaceholder('Select a raid to post')
      .addOptions(options);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // Keep the main embed visible
    const { createMainMenuEmbed } = require('./main-menu');
    const embed = await createMainMenuEmbed();

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: [row1, row2]
    });
  } catch (error) {
    console.error('Show start selector error:', error);
    await interaction.followUp({
      content: '❌ An error occurred!',
      ephemeral: true
    });
  }
}

async function handleStartSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const { getRaid } = require('../../database/queries');
    const raid = await getRaid(raidId);

    if (!raid) {
      return await redirectToMainMenu(interaction, '❌ Raid not found!');
    }

    if (raid.message_id) {
      return await redirectToMainMenu(interaction, '❌ This raid has already been posted!');
    }

    // Post the raid
    const channel = await interaction.client.channels.fetch(raid.channel_id);
    const messageId = await createRaidPost(raid, channel);

    // Update database with message ID
    await updateRaidMessageId(raidId, messageId);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ Raid posted successfully!\n\n**${raid.name}** has been posted to <#${raid.channel_id}>`,
      components: [row]
    });

  } catch (error) {
    console.error('Start raid error:', error);
    await redirectToMainMenu(interaction, '❌ Failed to start raid!');
  }
}

async function redirectToMainMenu(interaction, errorMessage) {
  const { 
    createMainMenuEmbed, 
    createMainMenuButtons,
    createRoleConfigDropdown,
    createPresetDropdown,
    createLockUnlockDropdown,
    createEmbedDropdown
  } = require('./main-menu');
  
  const embed = await createMainMenuEmbed();
  const buttonRow = createMainMenuButtons(interaction.user.id);
  const roleRow = createRoleConfigDropdown(interaction.user.id);
  const presetRow = createPresetDropdown(interaction.user.id);
  const lockUnlockRow = createLockUnlockDropdown(interaction.user.id);
  const embedRow = createEmbedDropdown(interaction.user.id);

  await interaction.editReply({
    content: errorMessage,
    embeds: [embed],
    components: [buttonRow, roleRow, presetRow, lockUnlockRow, embedRow]
  });

  // Auto-remove error message after 3 seconds
  setTimeout(async () => {
    try {
      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [buttonRow, roleRow, presetRow, lockUnlockRow, embedRow]
      });
    } catch (err) {
      // Ignore if interaction expired
    }
  }, 3000);
}

module.exports = {
  showStartRaidSelector,
  handleStartSelect
};
