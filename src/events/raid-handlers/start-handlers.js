const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getUnpostedRaids, createRaidPost, updateRaidMessageId } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// START RAID HANDLERS
// ═══════════════════════════════════════════════════════════════

async function showStartRaidSelector(interaction) {
  await interaction.deferUpdate();

  const raids = await getUnpostedRaids();

  if (raids.length === 0) {
    return await interaction.editReply({
      content: '❌ No raids available to start!\n\nAll raids are either already posted or there are no raids created.\n\nUse **➕ Create Raid** to create a new raid first.',
      embeds: [],
      components: []
    });
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

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.editReply({
    content: '🚀 **Start Raid:** Select which raid to post to the channel',
    embeds: [],
    components: [row]
  });
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
      return await interaction.editReply({
        content: '❌ Raid not found!',
        components: []
      });
    }

    if (raid.message_id) {
      return await interaction.editReply({
        content: '❌ This raid has already been posted!',
        components: []
      });
    }

    // Post the raid
    const channel = await interaction.client.channels.fetch(raid.channel_id);
    const messageId = await createRaidPost(raid, channel);

    // Update database with message ID
    await updateRaidMessageId(raidId, messageId);

    await interaction.editReply({
      content: `✅ Raid posted successfully!\n\n**${raid.name}** has been posted to <#${raid.channel_id}>`,
      components: []
    });

  } catch (error) {
    console.error('Start raid error:', error);
    await interaction.editReply({
      content: '❌ Failed to start raid!',
      components: []
    });
  }
}

module.exports = {
  showStartRaidSelector,
  handleStartSelect
};
