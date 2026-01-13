const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { eventDB } = require('../database/connection');
const { createRaidPost } = require('../database/queries');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid-create')
    .setDescription('Create a new raid')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Raid name')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (HH:MM in UTC)')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('size')
        .setDescription('Raid size')
        .setRequired(true)
        .addChoices(
          { name: '12-player', value: 12 },
          { name: '20-player', value: 20 }
        ))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to post raid')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const name = interaction.options.getString('name');
      const date = interaction.options.getString('date');
      const time = interaction.options.getString('time');
      const size = interaction.options.getInteger('size');
      const channel = interaction.options.getChannel('channel');

      const startTime = new Date(`${date}T${time}:00Z`);
      if (isNaN(startTime.getTime())) {
        return await interaction.editReply({ content: '❌ Invalid date/time format!' });
      }

      const { rows: activeRaids } = await eventDB.query(
        "SELECT COUNT(*) as count FROM raids WHERE status = 'open'"
      );

      if (parseInt(activeRaids[0].count) >= 2) {
        return await interaction.editReply({ content: '❌ Maximum 2 active raids allowed!' });
      }

      const raidSlot = parseInt(activeRaids[0].count) + 1;
      const roleIdResult = await eventDB.query(
        'SELECT value FROM bot_config WHERE key = $1',
        [`raid${raidSlot}_role_id`]
      );

      if (!roleIdResult.rows[0] || roleIdResult.rows[0].value === 'not_set') {
        return await interaction.editReply({ content: '❌ Run /raid-setup first!' });
      }

      const roleId = roleIdResult.rows[0].value;

      const slots = size === 12 ? { tank: 2, support: 2, dps: 8 } : { tank: 4, support: 4, dps: 12 };

      const result = await eventDB.query(
        `INSERT INTO raids 
        (name, raid_size, start_time, tank_slots, support_slots, dps_slots, channel_id, main_role_id, raid_slot)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [name, size, startTime, slots.tank, slots.support, slots.dps, channel.id, roleId, raidSlot]
      );

      const raid = result.rows[0];
      const messageId = await createRaidPost(raid, channel);

      await eventDB.query(
        'UPDATE raids SET message_id = $1 WHERE id = $2',
        [messageId, raid.id]
      );

      await interaction.editReply({
        content: `✅ Raid created!\n**Name:** ${name}\n**Size:** ${size}\n**Time:** <t:${Math.floor(startTime.getTime() / 1000)}:F>\n**Channel:** ${channel}`
      });

    } catch (error) {
      console.error('Raid create error:', error);
      await interaction.editReply({ content: '❌ Failed to create raid!' });
    }
  }
};
