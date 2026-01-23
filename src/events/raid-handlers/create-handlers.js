const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { raidCreationState, TIME_PRESETS, CHANNEL_PRESETS } = require('./state');
const { createRaid, getAvailableRaidSlot, getConfig } = require('../../database/queries');
const logger = require('../../utils/logger');

// ═══════════════════════════════════════════════════════════════
// CREATE RAID HANDLERS
// ═══════════════════════════════════════════════════════════════

function handleCreateStart(interaction) {
  // Show size selection
  const sizes = [
    { label: '12-Player Raid', value: '12', emoji: '👥' },
    { label: '20-Player Raid', value: '20', emoji: '👥👥' }
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`raid_create_size_${interaction.user.id}`)
    .setPlaceholder('Choose raid size')
    .addOptions(sizes);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  return {
    content: '**Step 1/5:** Select raid size',
    components: [row]
  };
}

async function handleSizeSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const size = parseInt(interaction.values[0]);
  
  // Initialize state
  raidCreationState.set(interaction.user.id, {
    size,
    step: 'time'
  });

  // Show time selection
  const times = TIME_PRESETS.map(time => ({
    label: time.label,
    value: time.value,
    emoji: '⏰'
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`raid_create_time_${interaction.user.id}`)
    .setPlaceholder('Choose raid time (UTC)')
    .addOptions(times);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.editReply({
    content: `**Step 2/5:** Select raid time (UTC)\n✅ Size: ${size} players`,
    components: [row]
  });
}

async function handleTimeSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const state = raidCreationState.get(interaction.user.id);
  if (!state) {
    return await interaction.editReply({ 
      content: '❌ Session expired. Please start again.',
      components: []
    });
  }

  state.time = interaction.values[0];
  state.step = 'channel';
  raidCreationState.set(interaction.user.id, state);

  // Show channel selection
  const channels = CHANNEL_PRESETS.map(ch => ({
    label: ch.label,
    value: ch.value,
    emoji: '📢'
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`raid_create_channel_${interaction.user.id}`)
    .setPlaceholder('Choose raid channel')
    .addOptions(channels);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.editReply({
    content: `**Step 3/5:** Select raid channel\n✅ Size: ${state.size} players\n✅ Time: ${state.time} UTC`,
    components: [row]
  });
}

async function handleChannelSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const state = raidCreationState.get(interaction.user.id);
  if (!state) {
    return await interaction.editReply({ 
      content: '❌ Session expired. Please start again.',
      components: []
    });
  }

  state.channel = interaction.values[0];
  state.step = 'name';
  raidCreationState.set(interaction.user.id, state);

  // Show name input modal
  const modal = new ModalBuilder()
    .setCustomId(`raid_create_name_${interaction.user.id}`)
    .setTitle('Raid Name');

  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Enter raid name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Saturday Night Raid')
    .setRequired(true)
    .setMaxLength(200);

  const row = new ActionRowBuilder().addComponents(nameInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleNameModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const state = raidCreationState.get(interaction.user.id);
  if (!state) {
    return await interaction.editReply({ 
      content: '❌ Session expired. Please start again.',
      components: []
    });
  }

  state.name = interaction.fields.getTextInputValue('name').trim();
  state.step = 'date';
  raidCreationState.set(interaction.user.id, state);

  // Show date input modal
  const modal = new ModalBuilder()
    .setCustomId(`raid_create_date_${interaction.user.id}`)
    .setTitle('Raid Date');

  const dateInput = new TextInputBuilder()
    .setCustomId('date')
    .setLabel('Enter raid date (YYYY-MM-DD)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 2026-01-25')
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(dateInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleDateModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  const state = raidCreationState.get(interaction.user.id);
  if (!state) {
    return await interaction.editReply({ 
      content: '❌ Session expired. Please start again.',
      components: []
    });
  }

  const dateStr = interaction.fields.getTextInputValue('date').trim();
  
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return await interaction.editReply({
      content: '❌ Invalid date format! Please use YYYY-MM-DD (e.g., 2026-01-25)',
      components: []
    });
  }

  // Create datetime string
  const startTime = new Date(`${dateStr}T${state.time}:00Z`);
  
  // Validate date is in the future
  if (startTime <= new Date()) {
    return await interaction.editReply({
      content: '❌ Raid time must be in the future!',
      components: []
    });
  }

  state.date = dateStr;
  
  // Calculate slots based on size
  const slots = state.size === 12 
    ? { tank: 2, support: 2, dps: 8 }
    : { tank: 3, support: 3, dps: 14 };

  // Get channel ID and role ID
  const channelId = state.channel;
  const raidSlot = await getAvailableRaidSlot(startTime);
  
  if (raidSlot === null) {
    raidCreationState.delete(interaction.user.id);
    return await interaction.editReply({
      content: '❌ Both raid slots are occupied at this time! Please choose a different time or complete/cancel existing raids.',
      components: []
    });
  }

  const roleId = await getConfig(raidSlot === 1 ? 'raid1_role_id' : 'raid2_role_id');
  
  if (roleId === 'not_set') {
    raidCreationState.delete(interaction.user.id);
    return await interaction.editReply({
      content: `❌ Raid slot ${raidSlot} role has not been configured! Please run \`/raid setup\` first.`,
      components: []
    });
  }

  // Create the raid
  try {
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

    // Log raid creation
    await logger.logRaidCreated(raid, interaction.user);

    const backButton = new ButtonBuilder()
      .setCustomId(`raid_back_to_main_${interaction.user.id}`)
      .setLabel('◀️ Back to Main Menu')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `✅ Raid created successfully!\n\n**${state.name}**\n📅 ${dateStr} at ${state.time} UTC\n👥 ${state.size} players\n📍 <#${channelId}>\n🎭 Slot ${raidSlot}\n\n⚠️ **Next step:** Use the "Post Raid" menu to publish it!`,
      components: [row]
    });
  } catch (error) {
    console.error('Create raid error:', error);
    raidCreationState.delete(interaction.user.id);
    await interaction.editReply({
      content: '❌ Failed to create raid. Please try again.',
      components: []
    });
  }
}

module.exports = {
  handleCreateStart,
  handleSizeSelect,
  handleTimeSelect,
  handleChannelSelect,
  handleNameModal,
  handleDateModal
};
