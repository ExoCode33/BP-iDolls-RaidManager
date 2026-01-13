const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
  getConfig, 
  createRaid, 
  getActiveRaidCount, 
  getAvailableRaidSlot,
  updateRaidMessageId,
  getRaidRegistrations,
  getRaidCounts
} = require('../database/queries');
const { parseDateTime } = require('../utils/helpers');
const { createRaidEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Raid management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new raid')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Raid name')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('date')
            .setDescription('Date in format YYYY-MM-DD (e.g., 2025-12-27)')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('time')
            .setDescription('Time in UTC format HH:MM (e.g., 02:00)')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('size')
            .setDescription('Raid size')
            .setRequired(true)
            .addChoices(
              { name: '12-Player', value: 12 },
              { name: '20-Player', value: 20 }
            )))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreate(interaction);
    }
  }
};

async function handleCreate(interaction) {
  await interaction.deferReply();

  try {
    // Check if setup has been run
    const raid1RoleId = await getConfig('raid1_role_id');
    const raid2RoleId = await getConfig('raid2_role_id');

    if (!raid1RoleId || !raid2RoleId || raid1RoleId === 'not_set' || raid2RoleId === 'not_set') {
      return await interaction.editReply({
        content: '❌ Please run `/raid-setup` first to initialize the bot!'
      });
    }

    // Check active raid count
    const activeCount = await getActiveRaidCount();
    if (activeCount >= 2) {
      return await interaction.editReply({
        content: '❌ Maximum 2 active raids allowed! Please complete or cancel an existing raid first.'
      });
    }

    // Get available slot
    const raidSlot = await getAvailableRaidSlot();
    if (!raidSlot) {
      return await interaction.editReply({
        content: '❌ Both raid slots are currently occupied!'
      });
    }

    // Get role ID for this slot
    const roleId = raidSlot === 1 ? raid1RoleId : raid2RoleId;

    // Parse inputs
    const name = interaction.options.getString('name');
    const date = interaction.options.getString('date');
    const time = interaction.options.getString('time');
    const size = interaction.options.getInteger('size');

    // Validate and parse datetime
    let startTime;
    try {
      startTime = parseDateTime(date, time);
      if (isNaN(startTime.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      return await interaction.editReply({
        content: '❌ Invalid date/time format! Use YYYY-MM-DD for date and HH:MM for time (UTC).\nExample: `2025-12-27` and `02:00`'
      });
    }

    // Check if time is in the past
    if (startTime < new Date()) {
      return await interaction.editReply({
        content: '❌ Raid start time cannot be in the past!'
      });
    }

    // Set role slots based on size
    const tankSlots = size === 12 ? 2 : 4;
    const supportSlots = size === 12 ? 2 : 4;
    const dpsSlots = size === 12 ? 8 : 12;

    // Create raid in database
    const raid = await createRaid({
      name,
      raid_size: size,
      start_time: startTime,
      tank_slots: tankSlots,
      support_slots: supportSlots,
      dps_slots: dpsSlots,
      channel_id: interaction.channel.id,
      main_role_id: roleId,
      raid_slot: raidSlot,
      created_by: interaction.user.id
    });

    // Create embed
    const embed = await createRaidEmbed(raid, [], {
      Tank: { registered: 0, waitlist: 0 },
      DPS: { registered: 0, waitlist: 0 },
      Support: { registered: 0, waitlist: 0 },
      total_registered: 0,
      total_waitlist: 0
    });

    // Create buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`raid_register_${raid.id}`)
          .setLabel('Register')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`raid_assist_${raid.id}`)
          .setLabel('Assist')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`raid_unregister_${raid.id}`)
          .setLabel('Unregister')
          .setStyle(ButtonStyle.Danger)
      );

    // Post to channel
    const message = await interaction.channel.send({
      content: `<@&${roleId}> New raid created!`,
      embeds: [embed],
      components: [row]
    });

    // Save message ID
    await updateRaidMessageId(raid.id, message.id);

    await interaction.editReply({
      content: `✅ Raid created successfully! (ID: ${raid.id})`
    });

  } catch (error) {
    console.error('Create raid error:', error);
    await interaction.editReply({
      content: '❌ Failed to create raid. Please try again.'
    });
  }
}
