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
      return await redirectToMainMenu(interaction, '❌ No raids available to start!\n\nAll raids are either already posted or there are no raids created.\n\nUse **➕ Create Preset** to create a new raid first.');
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
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '🚀 **Start Raid:** Select which raid to post to the channel',
      embeds: [],
      components: [row1, row2]
    });
  } catch (error) {
    console.error('Show start selector error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred!');
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
  const { createMainMenuEmbed, createMainMenuRow } = require('./main-menu');
  
  const embed = createMainMenuEmbed();
  const row = createMainMenuRow(interaction.user.id);

  await interaction.editReply({
    content: errorMessage,
    embeds: [embed],
    components: [row]
  });

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
  showStartRaidSelector,
  handleStartSelect
};
