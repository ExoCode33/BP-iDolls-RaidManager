const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { 
  getRaid,
  updateRaidStatus,
  getActiveRaids,
  getRaidRegistrations,
  updateRaidMessageId,
  getRaidCounts,
  getConfig
} = require('../database/queries');
const { createRaidEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid-admin')
    .setDescription('Raid administration commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all active raids'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('complete')
        .setDescription('Mark a raid as completed')
        .addIntegerOption(option =>
          option
            .setName('raid_id')
            .setDescription('Raid ID')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel a raid')
        .addIntegerOption(option =>
          option
            .setName('raid_id')
            .setDescription('Raid ID')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('refresh')
        .setDescription('Refresh a raid embed')
        .addIntegerOption(option =>
          option
            .setName('raid_id')
            .setDescription('Raid ID')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'list':
        await handleList(interaction);
        break;
      case 'complete':
        await handleComplete(interaction);
        break;
      case 'cancel':
        await handleCancel(interaction);
        break;
      case 'refresh':
        await handleRefresh(interaction);
        break;
    }
  }
};

async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const raids = await getActiveRaids();

    if (raids.length === 0) {
      return await interaction.editReply('No active raids found.');
    }

    let response = '**Active Raids:**\n\n';
    for (const raid of raids) {
      const counts = await getRaidCounts(raid.id);
      const timestamp = Math.floor(new Date(raid.start_time).getTime() / 1000);
      response += `**ID ${raid.id}**: ${raid.name}\n`;
      response += `  • Slot: Raid ${raid.raid_slot}\n`;
      response += `  • Size: ${raid.raid_size}-player\n`;
      response += `  • Registered: ${counts.total_registered}/${raid.raid_size}\n`;
      response += `  • Waitlist: ${counts.total_waitlist}\n`;
      response += `  • Starts: <t:${timestamp}:R>\n\n`;
    }

    await interaction.editReply(response);

  } catch (error) {
    console.error('List raids error:', error);
    await interaction.editReply('❌ Failed to list raids.');
  }
}

async function handleComplete(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const raidId = interaction.options.getInteger('raid_id');
    const raid = await getRaid(raidId);

    if (!raid) {
      return await interaction.editReply('❌ Raid not found!');
    }

    if (raid.status !== 'open') {
      return await interaction.editReply('❌ Raid is not active!');
    }

    // Get all registered users
    const registrations = await getRaidRegistrations(raidId);
    const registeredUsers = registrations.filter(r => r.status === 'registered');

    // Remove role from all participants
    const role = await interaction.guild.roles.fetch(raid.main_role_id);
    for (const reg of registeredUsers) {
      try {
        const member = await interaction.guild.members.fetch(reg.user_id);
        await member.roles.remove(role);
      } catch (error) {
        console.error(`Failed to remove role from ${reg.user_id}:`, error);
      }
    }

    // Update status
    await updateRaidStatus(raidId, 'completed');

    // Update embed
    try {
      const channel = await interaction.guild.channels.fetch(raid.channel_id);
      const message = await channel.messages.fetch(raid.message_id);
      
      const counts = await getRaidCounts(raidId);
      const embed = await createRaidEmbed(raid, registrations, counts);
      embed.setTitle('✅ Raid Completed');
      
      await message.edit({ 
        embeds: [embed],
        components: [] // Remove buttons
      });
    } catch (error) {
      console.error('Failed to update embed:', error);
    }

    await interaction.editReply(`✅ Raid ${raidId} marked as completed and ${registeredUsers.length} roles removed.`);

  } catch (error) {
    console.error('Complete raid error:', error);
    await interaction.editReply('❌ Failed to complete raid.');
  }
}

async function handleCancel(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const raidId = interaction.options.getInteger('raid_id');
    const raid = await getRaid(raidId);

    if (!raid) {
      return await interaction.editReply('❌ Raid not found!');
    }

    if (raid.status !== 'open') {
      return await interaction.editReply('❌ Raid is not active!');
    }

    // Get all users
    const registrations = await getRaidRegistrations(raidId);
    const allUsers = registrations.filter(r => r.status === 'registered');

    // Remove role from all participants
    const role = await interaction.guild.roles.fetch(raid.main_role_id);
    for (const reg of allUsers) {
      try {
        const member = await interaction.guild.members.fetch(reg.user_id);
        await member.roles.remove(role);
      } catch (error) {
        console.error(`Failed to remove role from ${reg.user_id}:`, error);
      }
    }

    // Update status
    await updateRaidStatus(raidId, 'cancelled');

    // Update/delete message
    try {
      const channel = await interaction.guild.channels.fetch(raid.channel_id);
      const message = await channel.messages.fetch(raid.message_id);
      
      await message.edit({ 
        content: '❌ This raid has been cancelled.',
        embeds: [],
        components: []
      });
    } catch (error) {
      console.error('Failed to update message:', error);
    }

    await interaction.editReply(`✅ Raid ${raidId} cancelled and ${allUsers.length} roles removed.`);

  } catch (error) {
    console.error('Cancel raid error:', error);
    await interaction.editReply('❌ Failed to cancel raid.');
  }
}

async function handleRefresh(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const raidId = interaction.options.getInteger('raid_id');
    const raid = await getRaid(raidId);

    if (!raid) {
      return await interaction.editReply('❌ Raid not found!');
    }

    const registrations = await getRaidRegistrations(raidId);
    const counts = await getRaidCounts(raidId);
    const embed = await createRaidEmbed(raid, registrations, counts);

    const channel = await interaction.guild.channels.fetch(raid.channel_id);
    const message = await channel.messages.fetch(raid.message_id);

    await message.edit({ embeds: [embed] });

    await interaction.editReply('✅ Raid embed refreshed!');

  } catch (error) {
    console.error('Refresh embed error:', error);
    await interaction.editReply('❌ Failed to refresh embed.');
  }
}
