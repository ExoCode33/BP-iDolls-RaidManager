const { StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
  getRaid, 
  getRegistration, 
  deleteRegistration, 
  getUserCharacters,
  getRaidRegistrations,
  getRaidCounts,
  createRegistrationWithTransaction,
  updateRegistrationStatus,
  findNextWaitlistPlayer,
  updateRaidStatus,
  updateRaidMessageId
} = require('../database/queries');
const { getClassEmoji, inferRole } = require('../utils/formatters');
const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');
const raidHandlers = require('./raid-handlers');

// ✅ NEW - Import main DB connection for AS updates
const { mainDB } = require('../database/connection');

// Store temporary manual registration state with TTL
const manualRegState = new Map();
const MANUAL_REG_TTL = 5 * 60 * 1000; // 5 minutes

// ✅ NEW - Store AS selection state
const asSelectionState = new Map();
const AS_SELECTION_TTL = 2 * 60 * 1000; // 2 minutes

// Store active interactions to prevent spam
const activeInteractions = new Map();
const INTERACTION_COOLDOWN = 2000; // 2 seconds

// Class definitions
const CLASSES = {
  'Beat Performer': { role: 'Support', subclasses: ['Dissonance', 'Concerto'] },
  'Frost Mage': { role: 'DPS', subclasses: ['Icicle', 'Frostbeam'] },
  'Heavy Guardian': { role: 'Tank', subclasses: ['Earthfort', 'Block'] },
  'Marksman': { role: 'DPS', subclasses: ['Wildpack', 'Falconry'] },
  'Shield Knight': { role: 'Tank', subclasses: ['Recovery', 'Shield'] },
  'Stormblade': { role: 'DPS', subclasses: ['Iaido Slash', 'Moonstrike'] },
  'Verdant Oracle': { role: 'Support', subclasses: ['Smite', 'Lifebind'] },
  'Wind Knight': { role: 'DPS', subclasses: ['Vanguard', 'Skyward'] }
};

// ✅ UPDATED - Full AS ranges from other bot
const ABILITY_SCORES = [
  { label: '≤10k', value: '10000' },
  { label: '10-12k', value: '11000' },
  { label: '12-14k', value: '13000' },
  { label: '14-16k', value: '15000' },
  { label: '16-18k', value: '17000' },
  { label: '18-20k', value: '19000' },
  { label: '20-22k', value: '21000' },
  { label: '22-24k', value: '23000' },
  { label: '24-26k', value: '25000' },
  { label: '26-28k', value: '27000' },
  { label: '28-30k', value: '29000' },
  { label: '30-32k', value: '31000' },
  { label: '32-34k', value: '33000' },
  { label: '34-36k', value: '35000' },
  { label: '36-38k', value: '37000' },
  { label: '38-40k', value: '39000' },
  { label: '40-42k', value: '41000' },
  { label: '42-44k', value: '43000' },
  { label: '44-46k', value: '45000' },
  { label: '46-48k', value: '47000' },
  { label: '48-50k', value: '49000' },
  { label: '50-52k', value: '51000' },
  { label: '52-54k', value: '53000' },
  { label: '54-56k', value: '55000' },
  { label: '56k+', value: '57000' }
];

// ✅ NEW - ANSI embed helper for manual registration (matching registration bot style)
function createManualRegEmbed(step, total, title, description) {
  const centerText = (text, width = 42) => text.padStart((text.length + width) / 2).padEnd(width);
  const titleLine = centerText(title);
  const descLines = description.split('\n').map(line => centerText(line));
  
  const progress = step / total;
  const filledBars = Math.floor(progress * 10);
  const emptyBars = 10 - filledBars;
  const progressBar = '♥'.repeat(filledBars) + '♡'.repeat(emptyBars);
  const progressText = `${progressBar} ${step}/${total}`;
  
  const ansiText = [
    '\u001b[35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    `\u001b[1;34m${titleLine}\u001b[0m`,
    '\u001b[35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m',
    '',
    ...descLines.map(line => `\u001b[0;37m${line}\u001b[0m`),
    '',
    `\u001b[1;35m${centerText(progressText)}\u001b[0m`,
    '\u001b[35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m'
  ].join('\n');

  const { EmbedBuilder } = require('discord.js');
  return new EmbedBuilder()
    .setColor('#EC4899')
    .setDescription(`\`\`\`ansi\n${ansiText}\n\`\`\``)
    .setTimestamp();
}

// Helper function to check interaction cooldown
function checkInteractionCooldown(userId, action) {
  const key = `${userId}_${action}`;
  const lastInteraction = activeInteractions.get(key);
  
  if (lastInteraction && Date.now() - lastInteraction < INTERACTION_COOLDOWN) {
    return false; // Still on cooldown
  }
  
  activeInteractions.set(key, Date.now());
  
  // Cleanup old entries
  if (activeInteractions.size > 1000) {
    const now = Date.now();
    for (const [k, timestamp] of activeInteractions.entries()) {
      if (now - timestamp > INTERACTION_COOLDOWN * 2) {
        activeInteractions.delete(k);
      }
    }
  }
  
  return true;
}

// ✅ FIX: Add size limits to prevent memory leaks
const MAX_STATE_SIZE = 5000;
const MAX_INTERACTION_SIZE = 10000;

// Helper function to clean up expired manual registration state
function cleanupExpiredState() {
  const now = Date.now();
  
  // Cleanup manual registration state
  for (const [userId, state] of manualRegState.entries()) {
    if (now - state.timestamp > MANUAL_REG_TTL) {
      manualRegState.delete(userId);
    }
  }
  
  // Cleanup AS selection state
  for (const [userId, state] of asSelectionState.entries()) {
    if (now - state.timestamp > AS_SELECTION_TTL) {
      asSelectionState.delete(userId);
    }
  }
  
  // ✅ FIX: Emergency cleanup if Maps get too large
  if (manualRegState.size > MAX_STATE_SIZE) {
    console.warn(`⚠️ Manual reg state too large (${manualRegState.size}), forcing cleanup`);
    const sortedEntries = Array.from(manualRegState.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    manualRegState.clear();
    sortedEntries.slice(-1000).forEach(([key, value]) => {
      manualRegState.set(key, value);
    });
    console.log(`✅ Cleaned up manual reg state to ${manualRegState.size} entries`);
  }
  
  if (asSelectionState.size > MAX_STATE_SIZE) {
    console.warn(`⚠️ AS selection state too large (${asSelectionState.size}), forcing cleanup`);
    const sortedEntries = Array.from(asSelectionState.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    asSelectionState.clear();
    sortedEntries.slice(-1000).forEach(([key, value]) => {
      asSelectionState.set(key, value);
    });
    console.log(`✅ Cleaned up AS selection state to ${asSelectionState.size} entries`);
  }
  
  // ✅ FIX: Cleanup activeInteractions more aggressively
  if (activeInteractions.size > MAX_INTERACTION_SIZE) {
    console.warn(`⚠️ Active interactions too large (${activeInteractions.size}), forcing cleanup`);
    const cutoffTime = now - (INTERACTION_COOLDOWN * 5);
    for (const [key, timestamp] of activeInteractions.entries()) {
      if (timestamp < cutoffTime) {
        activeInteractions.delete(key);
      }
    }
    console.log(`✅ Cleaned up active interactions to ${activeInteractions.size} entries`);
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredState, 60000);

async function handleButton(interaction) {
  const [action, raidId] = interaction.customId.split('_');

  // ✅ FIX: Only handle register/assist/unregister buttons
  // Let other buttons (like raid_management_menu) be handled by their own handlers
  const validActions = ['register', 'assist', 'unregister', 'manual', 'admin'];
  if (!validActions.includes(action)) {
    // Not a button this handler should process
    return;
  }

  // Check for spam
  if (!checkInteractionCooldown(interaction.user.id, `button_${action}_${raidId}`)) {
    return await interaction.reply({ 
      content: '⏳ Please wait a moment before trying again.', 
      ephemeral: true 
    });
  }

  // Handle admin dropdown selections
  if (action === 'admin') {
    return await handleAdminSelect(interaction);
  }

  // Handle manual registration step buttons
  if (action === 'manual' && interaction.customId.includes('class_')) {
    return await showManualClassSelection(interaction);
  }

  if (action === 'unregister') {
    const parsedRaidId = parseInt(raidId);
    if (isNaN(parsedRaidId)) {
      console.error(`Invalid raid ID for unregister: ${raidId} from customId: ${interaction.customId}`);
      return await interaction.reply({ content: '❌ Invalid raid ID!', flags: 64 });
    }
    return await handleUnregister(interaction, parsedRaidId);
  }

  // ✅ FIX: Validate raid ID before calling handleRegistration
  const parsedRaidId = parseInt(raidId);
  if (isNaN(parsedRaidId)) {
    console.error(`Invalid raid ID for registration: ${raidId} from customId: ${interaction.customId}`);
    return await interaction.reply({ content: '❌ Invalid raid ID!', flags: 64 });
  }

  const registrationType = action === 'assist' ? 'assist' : 'register';
  await handleRegistration(interaction, parsedRaidId, registrationType);
}

async function showManualClassSelection(interaction, raidId, registrationType) {
  // ✅ FIX: Can be called from button OR from dropdown
  if (!raidId || isNaN(raidId)) {
    const parts = interaction.customId.split('_');
    raidId = parseInt(parts[2]);
    registrationType = parts[3];
  }

  // Only defer if not already deferred
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 });
  }

  try {
    // Store initial state with timestamp
    manualRegState.set(interaction.user.id, {
      raidId: raidId,
      registrationType,
      step: 'class',
      timestamp: Date.now()
    });

    // ✅ Emoji IDs from server - exact names without spaces
    const emojiMap = {
      'Beat Performer': { name: 'BeatPerformer', id: '1460272597538181254' },
      'Frost Mage': { name: 'FrostMage', id: '1460272596523159695' },
      'Heavy Guardian': { name: 'HeavyGuardian', id: '1460272595264995458' },
      'Marksman': { name: 'Marksman', id: '1460272594275012671' },
      'Shield Knight': { name: 'ShieldKnight', id: '1460272593306255465' },
      'Stormblade': { name: 'StormBlade', id: '1460272591473348618' },
      'Verdant Oracle': { name: 'VerdantOracle', id: '1460272589296504916' },
      'Wind Knight': { name: 'WindKnight', id: '1460272587799138428' }
    };

    const classOptions = Object.entries(CLASSES).map(([className, data]) => {
      const option = {
        label: className,
        value: className,
        description: data.role
      };
      
      // Add emoji directly - Discord will handle if it doesn't exist
      const emojiObj = emojiMap[className];
      if (emojiObj) {
        option.emoji = emojiObj;
      }
      
      return option;
    });

    // Add "My character is not listed" option at the end
    classOptions.push({
      label: 'My character is not listed',
      value: 'not_listed',
      description: 'Return to character selection',
      emoji: '❌'
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`manual_select_class_${interaction.user.id}`)
      .setPlaceholder('🎭 Pick your class')
      .addOptions(classOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_char_select_${raidId}_${registrationType}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // ✅ NEW: Use ANSI embed matching registration bot style
    const embed = createManualRegEmbed(
      1, 4,
      'Manual Registration',
      'Select your class'
    );

    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show manual class error:', error);
    await interaction.editReply({ content: '❌ An error occurred!', embeds: [], components: [] });
  }
}

async function handleManualClassSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const state = manualRegState.get(interaction.user.id);
    if (!state) {
      return await interaction.followUp({ content: '❌ Session expired. Please start again.', flags: 64 });
    }

    const selectedClass = interaction.values[0];
    
    // Handle "My character is not listed" option
    if (selectedClass === 'not_listed') {
      manualRegState.delete(interaction.user.id);
      return await interaction.editReply({
        content: '❌ Manual registration cancelled. Please use the character selection menu to register with an existing character.',
        embeds: [],
        components: []
      });
    }
    
    state.class = selectedClass;
    state.step = 'subclass';
    state.timestamp = Date.now(); // Update timestamp
    manualRegState.set(interaction.user.id, state);

    const subclasses = CLASSES[selectedClass].subclasses;
    const classRole = CLASSES[selectedClass].role;
    
    // ✅ Emoji IDs from server - exact names without spaces
    const emojiMap = {
      'Beat Performer': { name: 'BeatPerformer', id: '1460272597538181254' },
      'Frost Mage': { name: 'FrostMage', id: '1460272596523159695' },
      'Heavy Guardian': { name: 'HeavyGuardian', id: '1460272595264995458' },
      'Marksman': { name: 'Marksman', id: '1460272594275012671' },
      'Shield Knight': { name: 'ShieldKnight', id: '1460272593306255465' },
      'Stormblade': { name: 'StormBlade', id: '1460272591473348618' },
      'Verdant Oracle': { name: 'VerdantOracle', id: '1460272589296504916' },
      'Wind Knight': { name: 'WindKnight', id: '1460272587799138428' }
    };

    // Get emoji directly - Discord will handle if it doesn't exist
    const emojiObj = emojiMap[selectedClass];

    const subclassOptions = subclasses.map(sub => {
      const option = {
        label: sub,
        value: sub,
        description: classRole
      };
      
      // Add emoji if available
      if (emojiObj) {
        option.emoji = emojiObj;
      }
      
      return option;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`manual_select_subclass_${interaction.user.id}`)
      .setPlaceholder('✨ Pick your subclass')
      .addOptions(subclassOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`manual_back_to_class_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // ✅ NEW: Use ANSI embed
    const embed = createManualRegEmbed(
      2, 4,
      'Manual Registration',
      `Class: ${selectedClass}\n \nSelect your subclass`
    );

    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Manual class select error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', flags: 64 });
  }
}

async function handleManualSubclassSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const state = manualRegState.get(interaction.user.id);
    if (!state) {
      return await interaction.followUp({ content: '❌ Session expired. Please start again.', flags: 64 });
    }

    const selectedSubclass = interaction.values[0];
    state.subclass = selectedSubclass;
    state.step = 'score';
    state.timestamp = Date.now(); // Update timestamp
    manualRegState.set(interaction.user.id, state);

    const scoreOptions = ABILITY_SCORES.map(score => ({
      label: score.label,
      value: score.value,
      description: 'Your ability score range',
      emoji: '💪'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`manual_select_score_${interaction.user.id}`)
      .setPlaceholder('💪 Pick your score')
      .addOptions(scoreOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`manual_back_to_subclass_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // ✅ NEW: Use ANSI embed
    const embed = createManualRegEmbed(
      3, 4,
      'Manual Registration',
      `Class: ${state.class}\nSubclass: ${selectedSubclass}\n \nSelect your ability score`
    );

    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Manual subclass select error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', flags: 64 });
  }
}

async function handleManualScoreSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  try {
    const state = manualRegState.get(interaction.user.id);
    if (!state) {
      return await interaction.reply({ content: '❌ Session expired. Please start again.', flags: 64 });
    }

    const selectedScore = interaction.values[0];
    state.abilityScore = parseInt(selectedScore);
    state.timestamp = Date.now(); // Update timestamp
    manualRegState.set(interaction.user.id, state);

    // Show modal for IGN
    const modal = new ModalBuilder()
      .setCustomId(`manual_ign_modal_${interaction.user.id}`)
      .setTitle('Final Step: Enter IGN');

    const ignInput = new TextInputBuilder()
      .setCustomId('ign')
      .setLabel('In-Game Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your character name')
      .setRequired(true)
      .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(ignInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Manual score select error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', flags: 64 });
  }
}

async function handleManualIGNModal(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    await interaction.editReply({ 
      content: '⏳ Processing registration...',
      embeds: [],
      components: []
    });

    const state = manualRegState.get(interaction.user.id);
    if (!state) {
      return await interaction.editReply({ content: '❌ Session expired. Please start again.' });
    }

    const ign = interaction.fields.getTextInputValue('ign').trim();
    
    if (!ign || ign.length === 0) {
      return await interaction.editReply({ content: '❌ Please enter a valid IGN!' });
    }

    const raid = await getRaid(state.raidId);
    if (!raid) {
      manualRegState.delete(interaction.user.id);
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    if (raid.status !== 'open') {
      manualRegState.delete(interaction.user.id);
      return await interaction.editReply({ content: '❌ This raid is no longer open!' });
    }

    const character = {
      id: null,
      ign: ign,
      class: state.class,
      subclass: state.subclass,
      ability_score: state.abilityScore
    };

    await processRegistration(interaction, raid, character, state.registrationType, 'manual');
    
    manualRegState.delete(interaction.user.id);

  } catch (error) {
    console.error('Manual IGN modal error:', error);
    manualRegState.delete(interaction.user.id);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

async function handleManualBackToClass(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const state = manualRegState.get(interaction.user.id);
    if (!state) {
      return await interaction.followUp({ content: '❌ Session expired.', flags: 64 });
    }

    delete state.class;
    delete state.subclass;
    state.step = 'class';
    state.timestamp = Date.now();
    manualRegState.set(interaction.user.id, state);

    // ✅ FIX: Hardcoded custom emoji IDs
    const classOptions = Object.entries(CLASSES).map(([className, data]) => {
      let emojiObj = undefined;
      
      if (className === 'Beat Performer') {
        emojiObj = { name: 'BeatPerformer', id: '1460272597538181254' };
      } else if (className === 'Frost Mage') {
        emojiObj = { name: 'FrostMage', id: '1460272596523159695' };
      } else if (className === 'Heavy Guardian') {
        emojiObj = { name: 'HeavyGuardian', id: '1460272595264995458' };
      } else if (className === 'Marksman') {
        emojiObj = { name: 'Marksman', id: '1460272594275012671' };
      } else if (className === 'Shield Knight') {
        emojiObj = { name: 'ShieldKnight', id: '1460272593306255465' };
      } else if (className === 'Stormblade') {
        emojiObj = { name: 'StormBlade', id: '1460272591473348618' };
      } else if (className === 'Verdant Oracle') {
        emojiObj = { name: 'VerdantOracle', id: '1460272589296504916' };
      } else if (className === 'Wind Knight') {
        emojiObj = { name: 'WindKnight', id: '1460272587799138428' };
      }

      return {
        label: className,
        value: className,
        description: data.role,
        emoji: emojiObj
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`manual_select_class_${interaction.user.id}`)
      .setPlaceholder('🎭 Select your class')
      .addOptions(classOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_char_select_${state.raidId}_${state.registrationType}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // ✅ NEW: Use ANSI embed
    const embed = createManualRegEmbed(
      1, 4,
      'Manual Registration',
      'Select your class'
    );

    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Back to class error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', flags: 64 });
  }
}

async function handleManualBackToSubclass(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const state = manualRegState.get(interaction.user.id);
    if (!state) {
      return await interaction.followUp({ content: '❌ Session expired.', flags: 64 });
    }

    delete state.subclass;
    state.step = 'subclass';
    state.timestamp = Date.now();
    manualRegState.set(interaction.user.id, state);

    const subclasses = CLASSES[state.class].subclasses;
    const classRole = CLASSES[state.class].role;
    
    // ✅ FIX: Hardcoded custom emoji IDs
    let emojiObj = undefined;
    if (state.class === 'Beat Performer') {
      emojiObj = { name: 'BeatPerformer', id: '1460272597538181254' };
    } else if (state.class === 'Frost Mage') {
      emojiObj = { name: 'FrostMage', id: '1460272596523159695' };
    } else if (state.class === 'Heavy Guardian') {
      emojiObj = { name: 'HeavyGuardian', id: '1460272595264995458' };
    } else if (state.class === 'Marksman') {
      emojiObj = { name: 'Marksman', id: '1460272594275012671' };
    } else if (state.class === 'Shield Knight') {
      emojiObj = { name: 'ShieldKnight', id: '1460272593306255465' };
    } else if (state.class === 'Stormblade') {
      emojiObj = { name: 'StormBlade', id: '1460272591473348618' };
    } else if (state.class === 'Verdant Oracle') {
      emojiObj = { name: 'VerdantOracle', id: '1460272589296504916' };
    } else if (state.class === 'Wind Knight') {
      emojiObj = { name: 'WindKnight', id: '1460272587799138428' };
    }

    const subclassOptions = subclasses.map(sub => ({
      label: sub,
      value: sub,
      description: classRole,
      emoji: emojiObj
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`manual_select_subclass_${interaction.user.id}`)
      .setPlaceholder('✨ Select your subclass')
      .addOptions(subclassOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`manual_back_to_class_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    // ✅ NEW: Use ANSI embed
    const embed = createManualRegEmbed(
      2, 4,
      'Manual Registration',
      `Class: ${state.class}\n \nSelect your subclass`
    );

    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Back to subclass error:', error);
    await interaction.followUp({ content: '❌ An error occurred!', flags: 64 });
  }
}

async function handleRegistration(interaction, raidId, registrationType) {
  // Check for spam
  if (!checkInteractionCooldown(interaction.user.id, `register_${raidId}`)) {
    return await interaction.reply({ 
      content: '⏳ Please wait a moment before trying again.', 
      ephemeral: true 
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    if (raid.status !== 'open') {
      return await interaction.editReply({ content: '❌ This raid is no longer open for registration!' });
    }

    if (raid.locked && registrationType === 'register') {
      return await interaction.editReply({ content: '❌ This raid is locked! Registration is closed.' });
    }

    const existing = await getRegistration(raidId, interaction.user.id);
    if (existing) {
      return await interaction.editReply({ 
        content: '❌ You are already registered for this raid! Use "Unregister" first if you want to change.' 
      });
    }

    const characters = await getUserCharacters(interaction.user.id);
    const options = [];

    for (const char of characters) {
      const classEmoji = getClassEmoji(char.class);
      let emojiObj = undefined;
      
      if (classEmoji) {
        const match = classEmoji.match(/<:(\w+):(\d+)>/);
        if (match) {
          emojiObj = { name: match[1], id: match[2] };
        }
      }

      // ✅ FIX: Convert AS to range label
      const asRange = ABILITY_SCORES.find(s => parseInt(s.value) === char.ability_score);
      const asDisplay = asRange ? asRange.label : char.ability_score;

      options.push({
        label: char.ign,
        value: `char_${char.id}`,
        description: `${char.subclass} • ${asDisplay}`,
        emoji: emojiObj
      });
    }

    // ✅ FIX: Removed separator - just add manual entry option directly
    options.push({
      label: 'My Character is not listed',
      value: `manual_entry_${registrationType}`,
      emoji: '📝'
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`char_select_${raidId}_${registrationType}`)
      .setPlaceholder('Choose your character or manual entry')
      .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      content: 'Select your character:',
      components: [row]
    });

  } catch (error) {
    console.error('Registration error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

// ✅ NEW - Handle AS selection after character select
async function handleCharacterSelect(interaction) {
  const [, , raidId, registrationType] = interaction.customId.split('_');
  const selection = interaction.values[0];

  await interaction.deferUpdate();

  try {
    const raid = await getRaid(parseInt(raidId));
    if (!raid) {
      return await interaction.followUp({ content: '❌ Raid not found!', flags: 64 });
    }

    if (raid.status !== 'open') {
      return await interaction.followUp({ content: '❌ This raid is no longer open for registration!', flags: 64 });
    }

    const existing = await getRegistration(parseInt(raidId), interaction.user.id);
    if (existing) {
      return await interaction.followUp({ 
        content: '❌ You are already registered for this raid! Use "Unregister" first if you want to change.', 
        flags: 64
      });
    }

    if (selection.startsWith('manual_entry_')) {
      // ✅ FIX: Jump straight to manual class selection with ANSI embed
      await showManualClassSelection(interaction, parseInt(raidId), registrationType);
      return;
    }

    if (selection.startsWith('char_')) {
      const charId = parseInt(selection.split('_')[1]);
      const characters = await getUserCharacters(interaction.user.id);
      const character = characters.find(c => c.id === charId);

      if (!character) {
        return await interaction.followUp({ 
          content: '❌ Character not found! Please try again or use manual entry.', 
          flags: 64
        });
      }

      // ✅ NEW - Show AS selection dropdown
      await showASSelection(interaction, raid, character, registrationType);
    }

  } catch (error) {
    console.error('Character select error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ An error occurred. Please try again.', 
        flags: 64
      });
    } else {
      await interaction.followUp({ 
        content: '❌ An error occurred. Please try again.', 
        flags: 64
      });
    }
  }
}

// ✅ NEW - Show AS selection dropdown with current AS highlighted
async function showASSelection(interaction, raid, character, registrationType) {
  try {
    // Store state for AS update
    asSelectionState.set(interaction.user.id, {
      raidId: raid.id,
      character,
      registrationType,
      timestamp: Date.now()
    });

    // Find current AS range
    const currentAS = character.ability_score;
    const currentRange = ABILITY_SCORES.find(s => parseInt(s.value) === currentAS);

    // Build dropdown with current highlighted
    const scoreOptions = ABILITY_SCORES.map(score => ({
      label: score.label === currentRange?.label 
        ? `✅ ${score.label} (Current)` 
        : score.label,
      value: score.value,
      description: 'Your ability score range',
      emoji: '💪'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`as_update_select_${interaction.user.id}`)
      .setPlaceholder('💪 Confirm or update your Ability Score')
      .addOptions(scoreOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      content: `**Confirm Ability Score**\n\nCharacter: **${character.ign}**\nClass: **${character.class}** | Subclass: **${character.subclass}**\n\nCurrent AS: **${currentRange?.label || currentAS}**\n\nSelect your current ability score range:`,
      components: [row]
    });

  } catch (error) {
    console.error('Show AS selection error:', error);
    // Fallback: register without AS update
    await processRegistration(interaction, raid, character, registrationType, 'main_bot');
  }
}

// ✅ NEW - Handle AS update selection
async function handleASUpdateSelect(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const state = asSelectionState.get(interaction.user.id);
    if (!state) {
      return await interaction.followUp({ content: '❌ Session expired. Please try again.', flags: 64 });
    }

    const selectedAS = parseInt(interaction.values[0]);
    const { raidId, character, registrationType } = state;

    let asUpdated = false;
    let asUpdateLabel = '';

    // ✅ Update AS in main DB if different
    if (selectedAS !== character.ability_score) {
      try {
        await mainDB.query(
          'UPDATE characters SET ability_score = $1 WHERE id = $2',
          [selectedAS, character.id]
        );
        
        asUpdated = true;
        const newRange = ABILITY_SCORES.find(s => parseInt(s.value) === selectedAS);
        asUpdateLabel = newRange?.label || selectedAS;
        
        console.log(`✅ Updated AS for character ${character.id}: ${character.ability_score} → ${selectedAS}`);
        
        // Update character object for registration
        character.ability_score = selectedAS;
      } catch (err) {
        console.error('AS update failed (non-critical):', err);
        // Continue with registration using old AS
      }
    }

    // Clean up state
    asSelectionState.delete(interaction.user.id);

    // Get raid again to ensure fresh data
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.followUp({ content: '❌ Raid not found!', flags: 64 });
    }

    // Process registration
    await processRegistration(interaction, raid, character, registrationType, 'main_bot', asUpdated, asUpdateLabel);

  } catch (error) {
    console.error('AS update select error:', error);
    asSelectionState.delete(interaction.user.id);
    await interaction.followUp({ content: '❌ An error occurred. Please try again.', flags: 64 });
  }
}

// ✅ UPDATED - Now accepts asUpdated and asUpdateLabel parameters
async function processRegistration(interaction, raid, character, registrationType, source, asUpdated = false, asUpdateLabel = '') {
  const role = inferRole(character.class);

  try {
    // Use transaction-safe registration
    const result = await createRegistrationWithTransaction({
      raid_id: raid.id,
      user_id: interaction.user.id,
      character_id: character.id,
      character_source: source,
      ign: character.ign,
      class: character.class,
      subclass: character.subclass,
      ability_score: character.ability_score,
      role,
      registration_type: registrationType,
      raid
    });

    if (!result.success) {
      if (result.error === 'ALREADY_REGISTERED') {
        return await interaction.editReply({ 
          content: '❌ You are already registered for this raid!' 
        });
      }
      throw new Error(result.error || 'Registration failed');
    }

    const { status, demotedPlayer } = result;

    // Add Discord role if registered (not waitlist)
    if (status === 'registered' || status === 'assist') {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(raid.main_role_id);
      } catch (err) {
        console.error('Failed to add raid role:', err);
      }
    }

    // ✅ UPDATED - Silent role removal from demoted player
    if (demotedPlayer) {
      try {
        const demotedMember = await interaction.guild.members.fetch(demotedPlayer.user_id);
        await demotedMember.roles.remove(raid.main_role_id);
      } catch (err) {
        console.error('Failed to remove role from demoted player:', err);
      }
    }

    // Update raid message
    if (raid.message_id && raid.channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const message = await channel.messages.fetch(raid.message_id);
        
        const registrations = await getRaidRegistrations(raid.id);
        const embed = await createRaidEmbed(raid, registrations);
        const buttons = createRaidButtons(raid.id, raid.locked);

        await message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid message:', err);
      }
    }

    // ✅ UPDATED - Show AS update in success message
    let successMessage = '';
    if (status === 'registered') {
      successMessage = registrationType === 'assist' 
        ? '✅ You have been registered as **Assist** for this raid!' 
        : '✅ You have been registered for this raid!';
    } else if (status === 'assist') {
      successMessage = '✅ You have been registered as **Assist** for this raid!';
    } else {
      successMessage = '⏳ You have been added to the **waitlist**!';
    }

    // ✅ NEW - Add AS update notice
    if (asUpdated && asUpdateLabel) {
      successMessage += `\n💪 AS updated to **${asUpdateLabel}**`;
    }

    await interaction.editReply({ 
      content: successMessage,
      components: []
    });

  } catch (error) {
    console.error('Process registration error:', error);
    throw error;
  }
}

async function handleUnregister(interaction, raidId) {
  await interaction.deferReply({ flags: 64 });

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    const registration = await getRegistration(raidId, interaction.user.id);
    if (!registration) {
      return await interaction.editReply({ content: '❌ You are not registered for this raid!' });
    }

    // Delete registration
    await deleteRegistration(raidId, interaction.user.id);

    // Remove Discord role
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.remove(raid.main_role_id);
    } catch (err) {
      console.error('Failed to remove raid role:', err);
    }

    // Promote from waitlist if needed
    const wasInRaid = registration.status === 'registered' || registration.status === 'assist';
    if (wasInRaid) {
      const nextPlayer = await findNextWaitlistPlayer(raidId, registration.role);
      
      if (nextPlayer) {
        const newStatus = nextPlayer.registration_type === 'assist' ? 'assist' : 'registered';
        await updateRegistrationStatus(nextPlayer.id, newStatus);

        try {
          const nextMember = await interaction.guild.members.fetch(nextPlayer.user_id);
          await nextMember.roles.add(raid.main_role_id);
        } catch (err) {
          console.error('Failed to add role to promoted player:', err);
        }

        try {
          const channel = await interaction.client.channels.fetch(raid.channel_id);
          await channel.send(
            `🎉 <@${nextPlayer.user_id}> You've been promoted from the waitlist!`
          );
        } catch (err) {
          console.error('Failed to send promotion message:', err);
        }
      }
    }

    // Update raid message
    if (raid.message_id && raid.channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(raid.channel_id);
        const message = await channel.messages.fetch(raid.message_id);
        
        const registrations = await getRaidRegistrations(raid.id);
        const embed = await createRaidEmbed(raid, registrations);
        const buttons = createRaidButtons(raid.id, raid.locked);

        await message.edit({ embeds: [embed], components: [buttons] });
      } catch (err) {
        console.error('Failed to update raid message:', err);
      }
    }

    await interaction.editReply({ content: '✅ You have been unregistered from this raid!' });

  } catch (error) {
    console.error('Unregister error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

module.exports = {
  handleButton,
  handleCharacterSelect,
  handleManualClassSelect,
  handleManualSubclassSelect,
  handleManualScoreSelect,
  handleManualIGNModal,
  handleManualBackToClass,
  handleManualBackToSubclass,
  handleASUpdateSelect,
  ...raidHandlers
};
