const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setConfig } = require('../database/queries');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid-setup')
    .setDescription('Initial setup - Creates Raid 1 and Raid 2 roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const guild = interaction.guild;
      
      // Check if roles already exist
      let raid1Role = guild.roles.cache.find(r => r.name === 'Raid 1');
      let raid2Role = guild.roles.cache.find(r => r.name === 'Raid 2');

      // Create Raid 1 role if doesn't exist
      if (!raid1Role) {
        raid1Role = await guild.roles.create({
          name: 'Raid 1',
          mentionable: true,
          hoist: false,
          reason: 'Raid Bot - Persistent Role for Raid 1'
        });
      }

      // Create Raid 2 role if doesn't exist
      if (!raid2Role) {
        raid2Role = await guild.roles.create({
          name: 'Raid 2',
          mentionable: true,
          hoist: false,
          reason: 'Raid Bot - Persistent Role for Raid 2'
        });
      }

      // Save to database
      await setConfig('raid1_role_id', raid1Role.id);
      await setConfig('raid2_role_id', raid2Role.id);

      await interaction.editReply({
        content: `✅ **Setup Complete!**\n\n` +
                 `Created roles:\n` +
                 `• <@&${raid1Role.id}> (Raid 1)\n` +
                 `• <@&${raid2Role.id}> (Raid 2)\n\n` +
                 `You can now create raids using \`/raid create\``
      });

    } catch (error) {
      console.error('Setup error:', error);
      await interaction.editReply({
        content: '❌ Failed to setup raid roles. Please check bot permissions.'
      });
    }
  }
};
