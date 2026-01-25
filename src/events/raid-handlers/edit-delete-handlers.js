const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { getRaid, updateRaid, updateRaidStatus, getRaidRegistrations, updateRaidMessageId } = require('../../database/queries');
const { createRaidEmbed, createRaidButtons } = require('../../utils/embeds');

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
      .setLabel(`🕐 Time`)
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
// EDIT PRESET NAME
// ═══════════════════════════════════════════════════════════════

async function handleEditPresetName(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[3]);
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.reply({ content: '❌ Preset not found!', ephemeral: true });
    }

    if (raid.message_id) {
      return await interaction.reply({ 
        content: '❌ Cannot edit a posted raid!', 
        ephemeral: true 
      });
    }

    // Show modal to edit name
    const modal = new ModalBuilder()
      .setCustomId(`raid_edit_name_modal_${raidId}_${userId}`)
      .setTitle('Edit Preset Name');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Raid Name')
      .setStyle(TextInputStyle.Short)
      .setValue(raid.name)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Edit preset name error:', error);
    await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleEditPresetNameModal(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[4]);
  const userId = parts[5];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const newName = interaction.fields.getTextInputValue('name').trim();
    
    if (!newName || newName.length === 0) {
      return await interaction.followUp({ 
        content: '❌ Name cannot be empty!', 
        ephemeral: true 
      });
    }

    await updateRaid(raidId, { name: newName });

    const raid = await getRaid(raidId);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ **Preset name updated!**\n\nNew name: **${newName}**`,
      components: [row]
    });

  } catch (error) {
    console.error('Edit preset name modal error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// EDIT PRESET TIME
// ═══════════════════════════════════════════════════════════════

async function handleEditPresetTime(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[3]);
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.reply({ content: '❌ Preset not found!', ephemeral: true });
    }

    if (raid.message_id) {
      return await interaction.reply({ 
        content: '❌ Cannot edit a posted raid!', 
        ephemeral: true 
      });
    }

    // Show modal to edit date and time
    const modal = new ModalBuilder()
      .setCustomId(`raid_edit_time_modal_${raidId}_${userId}`)
      .setTitle('Edit Preset Time');

    const currentDate = new Date(raid.start_time);
    const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = currentDate.toISOString().split('T')[1].substring(0, 5); // HH:MM

    const dateInput = new TextInputBuilder()
      .setCustomId('date')
      .setLabel('Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setValue(dateStr)
      .setRequired(true);

    const timeInput = new TextInputBuilder()
      .setCustomId('time')
      .setLabel('Time (HH:MM in UTC)')
      .setStyle(TextInputStyle.Short)
      .setValue(timeStr)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(timeInput)
    );

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Edit preset time error:', error);
    await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleEditPresetTimeModal(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[4]);
  const userId = parts[5];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const date = interaction.fields.getTextInputValue('date').trim();
    const time = interaction.fields.getTextInputValue('time').trim();

    // Validate format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return await interaction.followUp({
        content: '❌ Invalid date format! Use YYYY-MM-DD (e.g., 2026-12-31)',
        ephemeral: true
      });
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      return await interaction.followUp({
        content: '❌ Invalid time format! Use HH:MM (e.g., 14:30)',
        ephemeral: true
      });
    }

    // Create and validate datetime
    let startTime = new Date(`${date}T${time}:00Z`);
    if (isNaN(startTime.getTime())) {
      return await interaction.followUp({
        content: '❌ Invalid date/time!',
        ephemeral: true
      });
    }

    // Check if in the past
    const now = new Date();
    if (startTime < now) {
      startTime.setDate(startTime.getDate() + 1);
      console.log(`⚠️ Time was in the past, moved to next day: ${startTime.toISOString()}`);
    }

    await updateRaid(raidId, { start_time: startTime });

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ **Preset time updated!**\n\nNew time: <t:${Math.floor(startTime.getTime() / 1000)}:F>`,
      components: [row]
    });

  } catch (error) {
    console.error('Edit preset time modal error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// EDIT PRESET CHANNEL
// ═══════════════════════════════════════════════════════════════

async function handleEditPresetChannel(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[3]);
  const userId = parts[4];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.followUp({ content: '❌ Preset not found!', ephemeral: true });
    }

    if (raid.message_id) {
      return await interaction.followUp({ 
        content: '❌ Cannot edit a posted raid!', 
        ephemeral: true 
      });
    }

    // Show channel selector
    const guild = interaction.guild;
    const textChannels = guild.channels.cache
      .filter(channel => channel.type === 0)
      .sort((a, b) => a.position - b.position);

    const channelsArray = Array.from(textChannels.values()).slice(0, 25);

    if (channelsArray.length === 0) {
      return await interaction.followUp({ 
        content: '❌ No text channels found!', 
        ephemeral: true 
      });
    }

    const channels = channelsArray.map(channel => ({
      label: `#${channel.name}`,
      value: channel.id,
      description: channel.topic ? channel.topic.substring(0, 100) : 'No description',
      emoji: '📺'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_edit_channel_select_${raidId}_${userId}`)
      .setPlaceholder('📺 Select new channel')
      .addOptions(channels);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `📺 **Edit Channel for: ${raid.name}**\n\nCurrent channel: <#${raid.channel_id}>\n\nSelect a new channel:`,
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Edit preset channel error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleEditPresetChannelSelect(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[4]);
  const userId = parts[5];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const newChannelId = interaction.values[0];

    await updateRaid(raidId, { channel_id: newChannelId });

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ **Preset channel updated!**\n\nNew channel: <#${newChannelId}>`,
      components: [row]
    });

  } catch (error) {
    console.error('Edit preset channel select error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// EDIT POSTED RAID (NAME/TIME)
// ═══════════════════════════════════════════════════════════════

async function handleEditRaidName(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[4]);
  const userId = parts[5];
  
  if (userId !== interaction.user.id) return;

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.reply({ content: '❌ Raid not found!', ephemeral: true });
    }

    // Show modal to edit name
    const modal = new ModalBuilder()
      .setCustomId(`raid_edit_raid_name_modal_${raidId}_${userId}`)
      .setTitle('Edit Raid Name');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Raid Name')
      .setStyle(TextInputStyle.Short)
      .setValue(raid.name)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Edit raid name error:', error);
    await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleEditRaidNameModal(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[5]);
  const userId = parts[6];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const newName = interaction.fields.getTextInputValue('name').trim();
    
    if (!newName || newName.length === 0) {
      return await interaction.followUp({ 
        content: '❌ Name cannot be empty!', 
        ephemeral: true 
      });
    }

    const raid = await getRaid(raidId);
    await updateRaid(raidId, { name: newName });

    // Update the Discord message
    if (raid.message_id && raid.channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const message = await channel.messages.fetch(raid.message_id);
        
        const registrations = await getRaidRegistrations(raidId);
        const updatedRaid = { ...raid, name: newName };
        const embed = await createRaidEmbed(updatedRaid, registrations);
        const buttons = createRaidButtons(raidId, raid.locked);

        await message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid message:', err);
      }
    }

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ **Raid name updated!**\n\nNew name: **${newName}**\n\n${raid.message_id ? 'The raid message has been updated.' : ''}`,
      components: [row]
    });

  } catch (error) {
    console.error('Edit raid name modal error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleEditRaidTime(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[4]);
  const userId = parts[5];
  
  if (userId !== interaction.user.id) return;

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.reply({ content: '❌ Raid not found!', ephemeral: true });
    }

    // Show modal to edit time
    const modal = new ModalBuilder()
      .setCustomId(`raid_edit_raid_time_modal_${raidId}_${userId}`)
      .setTitle('Edit Raid Time');

    const currentDate = new Date(raid.start_time);
    const dateStr = currentDate.toISOString().split('T')[0];
    const timeStr = currentDate.toISOString().split('T')[1].substring(0, 5);

    const dateInput = new TextInputBuilder()
      .setCustomId('date')
      .setLabel('Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setValue(dateStr)
      .setRequired(true);

    const timeInput = new TextInputBuilder()
      .setCustomId('time')
      .setLabel('Time (HH:MM in UTC)')
      .setStyle(TextInputStyle.Short)
      .setValue(timeStr)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(timeInput)
    );

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Edit raid time error:', error);
    await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
  }
}

async function handleEditRaidTimeModal(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parseInt(parts[5]);
  const userId = parts[6];
  
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const date = interaction.fields.getTextInputValue('date').trim();
    const time = interaction.fields.getTextInputValue('time').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return await interaction.followUp({
        content: '❌ Invalid date format! Use YYYY-MM-DD',
        ephemeral: true
      });
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      return await interaction.followUp({
        content: '❌ Invalid time format! Use HH:MM',
        ephemeral: true
      });
    }

    let startTime = new Date(`${date}T${time}:00Z`);
    if (isNaN(startTime.getTime())) {
      return await interaction.followUp({
        content: '❌ Invalid date/time!',
        ephemeral: true
      });
    }

    const now = new Date();
    if (startTime < now) {
      startTime.setDate(startTime.getDate() + 1);
    }

    const raid = await getRaid(raidId);
    await updateRaid(raidId, { start_time: startTime, reminded_30m: false });

    // Update the Discord message
    if (raid.message_id && raid.channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const message = await channel.messages.fetch(raid.message_id);
        
        const registrations = await getRaidRegistrations(raidId);
        const updatedRaid = { ...raid, start_time: startTime };
        const embed = await createRaidEmbed(updatedRaid, registrations);
        const buttons = createRaidButtons(raidId, raid.locked);

        await message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid message:', err);
      }
    }

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ **Raid time updated!**\n\nNew time: <t:${Math.floor(startTime.getTime() / 1000)}:F>\n\n${raid.message_id ? 'The raid message has been updated.' : ''}`,
      components: [row]
    });

  } catch (error) {
    console.error('Edit raid time modal error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', ephemeral: true });
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
  handleDeleteConfirm,
  handleEditPresetName,
  handleEditPresetNameModal,
  handleEditPresetTime,
  handleEditPresetTimeModal,
  handleEditPresetChannel,
  handleEditPresetChannelSelect,
  handleEditRaidName,
  handleEditRaidNameModal,
  handleEditRaidTime,
  handleEditRaidTimeModal
};
