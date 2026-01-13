const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveRaids } = require('../database/raids');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid-list')
    .setDescription('List all active raids'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 }); // Ephemeral

    try {
      const raids = await getActiveRaids();

      if (raids.length === 0) {
        return await interaction.editReply({
          content: '📋 No active raids at the moment.'
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xEC4899) // Pink
        .setTitle('📋 Active Raids')
        .setDescription('Here are all currently active raids:');

      for (const raid of raids) {
        const startTime = Math.floor(new Date(raid.start_time).getTime() / 1000);
        embed.addFields({
          name: raid.name,
          value: `**Size:** ${raid.raid_size}-player\n**Time:** <t:${startTime}:F>\n**Channel:** <#${raid.channel_id}>`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Raid list error:', error);
      await interaction.editReply({
        content: '❌ Failed to fetch raids!'
      });
    }
  }
};
