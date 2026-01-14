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

  await interaction.deferReply({ flags: 64 });

  try {
    const name = interaction.fields.getTextInputValue('name');
    
    const state = raidCreationState.get(interaction.user.id) || {};
    state.name = name;
    state.step = 'date';
    raidCreationState.set(interaction.user.id, state);

    // Show date modal
    const modal = new ModalBuilder()
      .setCustomId(`raid_create_date_${interaction.user.id}`)
      .setTitle('➕ Create Preset - Step 2/5');

    const dateInput = new TextInputBuilder()
      .setCustomId('date')
      .setLabel('Date (YYYY-MM-DD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('2026-01-20')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(dateInput));

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Name modal error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred! Redirecting to main menu...');
  }
}

async function handleDateModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferReply({ flags: 64 });

  try {
    const date = interaction.fields.getTextInputValue('date');
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      raidCreationState.delete(interaction.user.id);
      return await redirectToMainMenu(interaction, '❌ Invalid date format! Use YYYY-MM-DD. Redirecting to main menu...');
    }
    
    const state = raidCreationState.get(interaction.user.id) || {};
    state.date = date;
    state.step = 'time';
    raidCreationState.set(interaction.user.id, state);

    // Show time dropdown
    const timeOptions = TIME_PRESETS.map(preset => ({
      label: preset.label,
      value: preset.value,
      emoji: '🕐'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_create_time_${interaction.user.id}`)
      .setPlaceholder('⏰ Select raid time')
      .addOptions(timeOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `**Step 3/5:** Select raid time\n**Name:** ${state.name}\n**Date:** ${date}`,
      components: [row1, row2]
    });
  } catch (error) {
    console.error('Date modal error:', error);
    await redirectToMainMenu(interaction, '❌ An error occurred! Redirecting to main menu...');
  }
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

    // Show channel dropdown
    const channelOptions = Object.entries(CHANNEL_PRESETS).map(([name, id]) => ({
      label: name,
      value: id,
      emoji: '📺'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`raid_create_channel_${interaction.user.id}`)
      .setPlaceholder('📺 Select channel')
      .addOptions(channelOptions);

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

    // Create the raid
    const startTime = new Date(`${state.date}T${state.time}:00Z`);
    if (isNaN(startTime.getTime())) {
      raidCreationState.delete(interaction.user.id);
      return await redirectToMainMenu(interaction, '❌ Invalid date/time format! Redirecting to main menu...');
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
  const { createMainMenuEmbed, createMainMenuRow } = require('./main-menu');
  
  const embed = createMainMenuEmbed();
  const row = createMainMenuRow(interaction.user.id);

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: errorMessage,
      embeds: [embed],
      components: [row],
      flags: 64
    });
  } else {
    await interaction.editReply({
      content: errorMessage,
      embeds: [embed],
      components: [row]
    });
  }

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
  startCreateFlow,
  handleNameModal,
  handleDateModal,
  handleTimeSelect,
  handleSizeSelect,
  handleChannelSelect
};
