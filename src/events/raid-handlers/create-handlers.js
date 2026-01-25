const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { raidCreationState, TIME_PRESETS, CHANNEL_PRESETS } = require('./state');
const { createRaid, getAvailableRaidSlot, getConfig } = require('../../database/queries');

// ═══════════════════════════════════════════════════════════════
// RAID CREATION FLOW HANDLERS (PRESET)
// ═══════════════════════════════════════════════════════════════

async function startCreateFlow(interaction) {
  // DON'T defer - we're showing a modal immediately
  
  // Initialize state
  raidCreationState.set(interaction.user.id, { step: 'name' });

  // Show name input modal
  const modal = new ModalBuilder()
    .setCustomId(`raid_create_name_${interaction.user.id}`)
    .setTitle('➕ Create Preset - Step 1/5');

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Raid Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Saturday Night Raid')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

  await interaction.showModal(modal);
}

async function handleNameModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  try {
    const name = interaction.fields.getTextInputValue('name');
    
    const state = raidCreationState.get(interaction.user.id) || {};
    state.name = name;
    state.step = 'date';
    raidCreationState.set(interaction.user.id, state);

    // Show date input button
    const dateButton = new ButtonBuilder()
      .setCustomId(`raid_date_button_${interaction.user.id}`)
      .setLabel('📅 Enter Date')
      .setStyle(ButtonStyle.Primary);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(dateButton, backButton);

    // ✅ FIX: Reply immediately instead of deferUpdate for modal submissions
    await interaction.update({
      content: `**Step 2/5:** Enter the date\n**Name:** ${name}\n\nClick the button below to open the date input.`,
      components: [row]
    });
  } catch (error) {
    console.error('Name modal error:', error);
    
    // Try to respond if we haven't yet
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred! Please try again.',
        ephemeral: true
      });
    }
  }
}

async function handleDateModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  try {
    const date = interaction.fields.getTextInputValue('date');
    
    // ✅ FIX: Improved date validation
    // Check format first
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      raidCreationState.delete(interaction.user.id);
      return await interaction.update({
        content: '❌ Invalid date format! Use YYYY-MM-DD (e.g., 2026-01-25)',
        components: []
      });
    }
    
    // ✅ FIX: Validate actual date
    const dateObj = new Date(date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) {
      raidCreationState.delete(interaction.user.id);
      return await interaction.update({
        content: '❌ Invalid date! Please enter a valid date.',
        components: []
      });
    }
    
    // ✅ FIX: Allow today's date (don't require future dates at this step)
    // We'll validate the final datetime later when time is selected
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inputDate = new Date(date + 'T00:00:00');
    inputDate.setHours(0, 0, 0, 0);
    
    if (inputDate < today) {
      raidCreationState.delete(interaction.user.id);
      return await interaction.update({
        content: '❌ Date cannot be in the past! Please enter today or a future date.',
        components: []
      });
    }
    
    const state = raidCreationState.get(interaction.user.id) || {};
    state.date = date;
    state.step = 'time';
    raidCreationState.set(interaction.user.id, state);

    // ✅ NEW: Get dynamic time options with EST descriptions based on selected date
    const { getTimePresetsWithDescriptions } = require('./state');
    const timeOptions = getTimePresetsWithDescriptions(date);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_create_time_${interaction.user.id}`)
      .setPlaceholder('⏰ Select raid time (UTC)')
      .addOptions(timeOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // ✅ FIX: Reply immediately instead of deferUpdate
    await interaction.update({
      content: `**Step 3/5:** Select raid time\n**Name:** ${state.name}\n**Date:** ${date}\n\n⏰ Times shown in UTC with EST equivalent`,
      components: [row1, row2]
    });
  } catch (error) {
    console.error('Date modal error:', error);
    
    // Try to respond if we haven't yet
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred! Please try again.',
        ephemeral: true
      });
    }
  }
}

async function handleDateButton(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  const state = raidCreationState.get(interaction.user.id);
  if (!state || !state.name) {
    return await interaction.reply({
      content: '❌ Session expired. Please start again with /raid',
      flags: 64
    });
  }

  // Show date modal
  const modal = new ModalBuilder()
    .setCustomId(`raid_create_date_${interaction.user.id}`)
    .setTitle('➕ Create Preset - Step 2/5');

  const dateInput = new TextInputBuilder()
    .setCustomId('date')
    .setLabel('Date (YYYY-MM-DD)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('2026-01-25')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(dateInput));

  await interaction.showModal(modal);
}

async function handleTimeSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const time = interaction.values[0];
    
    const state = raidCreationState.get(interaction.user.id) || {};
    state.time = time;
    state.step = 'size';
    raidCreationState.set(interaction.user.id, state);

    // Show size dropdown
    const sizeOptions = [
      { label: '12-player Raid', value: '12', emoji: '🎯' },
      { label: '20-player Raid', value: '20', emoji: '🎯' }
    ];

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_create_size_${interaction.user.id}`)
      .setPlaceholder('👥 Select raid size')
      .addOptions(sizeOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `**Step 4/5:** Select raid size\n**Name:** ${state.name}\n**Date:** ${state.date}\n**Time:** ${time} UTC`,
      components: [row1, row2]
    });
  } catch (error) {
    console.error('Time select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred! Redirecting to main menu...');
  }
}

async function handleSizeSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const size = parseInt(interaction.values[0]);
    
    const state = raidCreationState.get(interaction.user.id) || {};
    state.size = size;
    state.step = 'channel';
    raidCreationState.set(interaction.user.id, state);

    // Fetch actual channels from the guild
    const guild = interaction.guild;
    const textChannels = guild.channels.cache
      .filter(channel => channel.type === 0) // 0 = Text channels
      .sort((a, b) => a.position - b.position);

    // Limit to first 25 channels (Discord limit)
    const channelsArray = Array.from(textChannels.values()).slice(0, 25);

    if (channelsArray.length === 0) {
      return await redirectToMainMenu(interaction, '❌ No text channels found!');
    }

    const channels = channelsArray.map(channel => ({
      label: `#${channel.name}`,
      value: channel.id,
      description: channel.topic ? channel.topic.substring(0, 100) : 'No description',
      emoji: '📺'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_create_channel_${interaction.user.id}`)
      .setPlaceholder('📺 Select channel')
      .addOptions(channels);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `**Step 5/5:** Select channel\n**Name:** ${state.name}\n**Date:** ${state.date}\n**Time:** ${state.time} UTC\n**Size:** ${size}-player`,
      components: [row1, row2]
    });
  } catch (error) {
    console.error('Size select error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred! Redirecting to main menu...');
  }
}

async function handleChannelSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const channelId = interaction.values[0];
    
    const state = raidCreationState.get(interaction.user.id) || {};
    state.channelId = channelId;

    // ✅ FIXED: Proper UTC datetime construction
    // The time value from TIME_PRESETS is already in UTC (e.g., "01:00" = 1 AM UTC = 8 PM EST previous day)
    let startTime = new Date(`${state.date}T${state.time}:00Z`);
    
    if (isNaN(startTime.getTime())) {
      raidCreationState.delete(interaction.user.id);
      return await redirectToMainMenu(interaction, '❌ Invalid date/time format! Redirecting to main menu...');
    }

    // ✅ IMPORTANT: Do NOT add a day if time is in the past
    // The user selected the date and time intentionally
    // If they want tomorrow, they should select tomorrow's date
    // We only validate that the final datetime is not in the past
    const now = new Date();
    if (startTime < now) {
      raidCreationState.delete(interaction.user.id);
      return await redirectToMainMenu(interaction, '❌ Raid time is in the past! Please select a future date/time. Redirecting to main menu...');
    }

    const raidSlot = await getAvailableRaidSlot();
    if (!raidSlot) {
      raidCreationState.delete(interaction.user.id);
      return await redirectToMainMenu(interaction, '❌ Maximum 2 active raids allowed! Redirecting to main menu...');
    }

    const roleId = await getConfig(`raid${raidSlot}_role_id`);
    if (!roleId || roleId === 'not_set') {
      raidCreationState.delete(interaction.user.id);
      return await redirectToMainMenu(interaction, '❌ Raid roles not configured! Use Setup first. Redirecting to main menu...');
    }

    const slots = state.size === 12 
      ? { tank: 2, support: 2, dps: 8 } 
      : { tank: 4, support: 4, dps: 12 };

    const raid = await createRaid({
      name: state.name,
      raid_size: state.size,
      start_time: startTime,
      tank_slots: slots.tank,
      support_slots: slots.support,
      dps_slots: slots.dps,
      channel_id: channelId,
      main_role_id: roleId,
      raid_slot: raidSlot,
      created_by: interaction.user.id
    });

    raidCreationState.delete(interaction.user.id);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ **Raid Preset Created Successfully!**\n\n**${state.name}**\n**Size:** ${state.size}-player\n**Time:** <t:${Math.floor(startTime.getTime() / 1000)}:F>\n**Channel:** <#${channelId}>\n\n⚠️ Raid is created but **NOT posted yet**.\nUse \`/raid\` → **🚀 Start Raid** to post it to the channel.`,
      components: [row]
    });

  } catch (error) {
    console.error('Create raid error:', error);
    raidCreationState.delete(interaction.user.id);
    await redirectToMainMenu(interaction, '❌ Failed to create raid! Redirecting to main menu...');
  }
}

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

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: errorMessage,
      embeds: [embed],
      components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow],
      flags: 64
    });
  } else {
    await interaction.editReply({
      content: errorMessage,
      embeds: [embed],
      components: [buttonRow, rosterRow, lockUnlockRow, presetRow, managementRow]
    });
  }

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
  startCreateFlow,
  handleNameModal,
  handleDateButton,
  handleDateModal,
  handleTimeSelect,
  handleSizeSelect,
  handleChannelSelect
};
