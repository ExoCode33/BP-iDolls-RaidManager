const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUnpostedRaids, createRaidPost, updateRaidMessageId } = require('../../database/queries');
const logger = require('../../utils/logger');

// ═══════════════════════════════════════════════════════════════
// START/POST RAID HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleStartMenu(interaction) {
  await interaction.deferUpdate();

  const raids = await getUnpostedRaids();

  if (raids.length === 0) {
    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    return await interaction.editReply({
      content: '❌ No unposted raids found!\n\nCreate a raid first, then come back here to post it.',
      components: [row]
    });
  }

  // Create dropdown with raids
  const options = raids.map(raid => {
    const date = new Date(raid.start_time);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toISOString().split('T')[1].substring(0, 5);
    
    return {
      label: raid.name.substring(0, 100),
      value: raid.id.toString(),
      description: `${dateStr} ${timeStr} UTC • ${raid.raid_size}P • Slot ${raid.raid_slot}`,
      emoji: '📢'
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`raid_start_select_${interaction.user.id}`)
    .setPlaceholder('Choose a raid to post')
    .addOptions(options.slice(0, 25)); // Discord limit

  const backButton = new ButtonBuilder()
    .setCustomId(`raid_back_to_main_${interaction.user.id}`)
    .setLabel('◀️ Back to Main Menu')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(backButton);

  await interaction.editReply({
    content: `**Post a Raid**\n\nFound ${raids.length} unposted raid(s). Select one to post:`,
    components: [row1, row2]
  });
}

async function handleStartSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raidId = parseInt(interaction.values[0]);
    const raids = await getUnpostedRaids();
    const raid = raids.find(r => r.id === raidId);

    if (!raid) {
      const backButton = new ButtonBuilder()
        .setCustomId(`raid_back_to_main_${interaction.user.id}`)
        .setLabel('◀️ Back to Main Menu')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(backButton);

      return await interaction.editReply({
        content: '❌ Raid not found or already posted!',
        components: [row]
      });
    }

    // Post the raid
    const channel = await interaction.client.channels.fetch(raid.channel_id);
    const messageId = await createRaidPost(raid, channel);

    // Update database with message ID
    await updateRaidMessageId(raidId, messageId);

    // Log raid posted
    await logger.logRaidPosted({ ...raid, message_id: messageId }, interaction.user);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ Raid posted successfully!\n\n**${raid.name}**\nPosted to <#${raid.channel_id}>\n\n[Jump to raid message](https://discord.com/channels/${interaction.guild.id}/${raid.channel_id}/${messageId})`,
      components: [row]
    });

  } catch (error) {
    console.error('Start select error:', error);
    
    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '❌ Failed to post raid. Please try again.',
      components: [row]
    });
  }
}

module.exports = {
  handleStartMenu,
  handleStartSelect
};
