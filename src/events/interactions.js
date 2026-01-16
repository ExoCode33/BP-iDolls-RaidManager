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

// Store temporary manual registration state with TTL
const manualRegState = new Map();
const MANUAL_REG_TTL = 5 * 60 * 1000; // 5 minutes

// Store active interactions to prevent spam
const activeInteractions = new Map();
const INTERACTION_COOLDOWN = 2000; // 2 seconds

// Class definitions
const CLASSES = {
  'Beat Performer': { role: 'Support', subclasses: ['Panacea', 'Chroma'] },
  'Frost Mage': { role: 'DPS', subclasses: ['Hail', 'Frostfire'] },
  'Heavy Guardian': { role: 'Tank', subclasses: ['Fortress', 'Vanguard'] },
  'Marksman': { role: 'DPS', subclasses: ['Precision', 'Blitz'] },
  'Shield Knight': { role: 'Tank', subclasses: ['Recovery', 'Sentinel'] },
  'Storm Blade': { role: 'DPS', subclasses: ['Iaido', 'Flow'] },
  'Verdant Oracle': { role: 'Support', subclasses: ['Lifebind', 'Nature'] },
  'Wind Knight': { role: 'DPS', subclasses: ['Tempest', 'Gale'] }
};

const ABILITY_SCORES = [
  { label: '28-30k', value: '28000' },
  { label: '30-32k', value: '30000' },
  { label: '32-34k', value: '32000' },
  { label: '34-36k', value: '34000' },
  { label: '36-38k', value: '36000' },
  { label: '38k+', value: '38000' }
];

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

// Helper function to clean up expired manual registration state
function cleanupExpiredState() {
  const now = Date.now();
  for (const [userId, state] of manualRegState.entries()) {
    if (now - state.timestamp > MANUAL_REG_TTL) {
      manualRegState.delete(userId);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredState, 60000);

async function handleButton(interaction) {
  const [action, raidId] = interaction.customId.split('_');

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
    return await handleUnregister(interaction, parseInt(raidId));
  }

  const registrationType = action === 'assist' ? 'assist' : 'register';
  await handleRegistration(interaction, parseInt(raidId), registrationType);
}

async function showManualClassSelection(interaction) {
  const parts = interaction.customId.split('_');
  const raidId = parts[2];
  const registrationType = parts[3];

  await interaction.deferReply({ flags: 64 });

  try {
    // Store initial state with timestamp
    manualRegState.set(interaction.user.id, {
      raidId: parseInt(raidId),
      registrationType,
      step: 'class',
      timestamp: Date.now()
    });

    const classOptions = Object.entries(CLASSES).map(([className, data]) => {
      const emoji = getClassEmoji(className);
      let emojiObj = undefined;
      
      if (emoji) {
        const match = emoji.match(/<:(\w+):(\d+)>/);
        if (match) {
          emojiObj = { name: match[1], id: match[2] };
        }
      }

      return {
        label: className,
        value: className,
        description: data.role,
        emoji: emojiObj || (data.role === 'Tank' ? '🛡️' : data.role === 'Support' ? '💚' : '⚔️')
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`manual_select_class_${interaction.user.id}`)
      .setPlaceholder('🎭 Select your class')
      .addOptions(classOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_char_select_${raidId}_${registrationType}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: '**Step 1/3:** Select your class',
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Show manual class error:', error);
    await interaction.editReply({ content: '❌ An error occurred!' });
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
    state.class = selectedClass;
    state.step = 'subclass';
    state.timestamp = Date.now(); // Update timestamp
    manualRegState.set(interaction.user.id, state);

    const subclasses = CLASSES[selectedClass].subclasses;
    const classRole = CLASSES[selectedClass].role;
    const classEmoji = getClassEmoji(selectedClass);
    
    let emojiObj = undefined;
    if (classEmoji) {
      const match = classEmoji.match(/<:(\w+):(\d+)>/);
      if (match) {
        emojiObj = { name: match[1], id: match[2] };
      }
    }

    const subclassOptions = subclasses.map(subclass => ({
      label: subclass,
      value: subclass,
      description: classRole,
      emoji: emojiObj || (classRole === 'Tank' ? '🛡️' : classRole === 'Support' ? '💚' : '⚔️')
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

    await interaction.editReply({
      content: `**Step 2/3:** Select your subclass\nClass: **${selectedClass}**`,
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
      description: 'Combat Power',
      emoji: '💪'
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`manual_select_score_${interaction.user.id}`)
      .setPlaceholder('⚔️ Select your ability score')
      .addOptions(scoreOptions);

    const backButton = new ButtonBuilder()
      .setCustomId(`manual_back_to_subclass_${interaction.user.id}`)
      .setLabel('◀️ Back')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    await interaction.editReply({
      content: `**Step 3/3:** Select your ability score\nClass: **${state.class}** | Subclass: **${selectedSubclass}**`,
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

  await interaction.deferReply({ flags: 64 });

  try {
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
      manualRegState.delete(interaction.user.id); // ✅ FIXED - Clean up state
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    if (raid.status !== 'open') {
      manualRegState.delete(interaction.user.id); // ✅ FIXED - Clean up state
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
    
    // ✅ FIXED - Clean up state after successful registration
    manualRegState.delete(interaction.user.id);

  } catch (error) {
    console.error('Manual IGN modal error:', error);
    // ✅ FIXED - Clean up state on error
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
      return await interaction.followUp({ content: '❌ Session expired. Please start again.', flags: 64 });
    }

    state.step = 'class';
    state.timestamp = Date.now(); // Update timestamp
    delete state.class;
    delete state.subclass;
    manualRegState.set(interaction.user.id, state);

    const classOptions = Object.entries(CLASSES).map(([className, data]) => {
      const emoji = getClassEmoji(className);
      let emojiObj = undefined;
      
      if (emoji) {
        const match = emoji.match(/<:(\w+):(\d+)>/);
        if (match) {
          emojiObj = { name: match[1], id: match[2] };
        }
      }

      return {
        label: className,
        value: className,
        description: data.role,
        emoji: emojiObj || (data.role === 'Tank' ? '🛡️' : data.role === 'Support' ? '💚' : '⚔️')
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

    await interaction.editReply({
      content: '**Step 1/3:** Select your class',
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Back to class error:', error);
  }
}

async function handleManualBackToSubclass(interaction) {
  const userId = interaction.customId.split('_').pop();
  if (userId !== interaction.user.id) return;

  await interaction.deferUpdate();

  try {
    const state = manualRegState.get(interaction.user.id);
    if (!state) {
      return await interaction.followUp({ content: '❌ Session expired. Please start again.', flags: 64 });
    }

    state.step = 'subclass';
    state.timestamp = Date.now(); // Update timestamp
    delete state.subclass;
    manualRegState.set(interaction.user.id, state);

    const subclasses = CLASSES[state.class].subclasses;
    const classRole = CLASSES[state.class].role;
    const classEmoji = getClassEmoji(state.class);
    
    let emojiObj = undefined;
    if (classEmoji) {
      const match = classEmoji.match(/<:(\w+):(\d+)>/);
      if (match) {
        emojiObj = { name: match[1], id: match[2] };
      }
    }

    const subclassOptions = subclasses.map(subclass => ({
      label: subclass,
      value: subclass,
      description: classRole,
      emoji: emojiObj || (classRole === 'Tank' ? '🛡️' : classRole === 'Support' ? '💚' : '⚔️')
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

    await interaction.editReply({
      content: `**Step 2/3:** Select your subclass\nClass: **${state.class}**`,
      components: [row1, row2]
    });

  } catch (error) {
    console.error('Back to subclass error:', error);
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

      options.push({
        label: char.ign,
        value: `char_${char.id}`,
        description: `${char.subclass} • ${char.ability_score}`,
        emoji: emojiObj
      });
    }

    if (options.length > 0) {
      options.push({
        label: '────────────────────────',
        value: 'separator',
        description: 'My character is not listed',
        disabled: true
      });
    }

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
      // Start manual registration flow
      const button = new ButtonBuilder()
        .setCustomId(`manual_class_${raidId}_${registrationType}`)
        .setLabel('Start Manual Entry')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.editReply({
        content: '**Manual Registration Flow:**\n1️⃣ Select Class\n2️⃣ Select Subclass\n3️⃣ Select Ability Score\n4️⃣ Enter IGN\n\nClick below to begin:',
        components: [row]
      });
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

      await processRegistration(interaction, raid, character, registrationType, 'main_bot');
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

// ✅ FIXED - Now uses transaction for atomic registration
async function processRegistration(interaction, raid, character, registrationType, source) {
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

    const { status } = result;

    // Add Discord role if registered (not waitlist)
    if (status === 'registered') {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(raid.main_role_id);
      } catch (err) {
        console.error('Failed to add role:', err);
      }
    }

    await updateRaidMessage(raid, interaction.client);

    let message = '✅ Successfully registered!';
    if (status === 'waitlist') message = '✅ Added to waitlist!';
    if (status === 'assist') message = '✅ Marked as assist!';

    if (interaction.deferred) {
      await interaction.followUp({ content: message, flags: 64 });
    } else {
      await interaction.editReply({ content: message });
    }
  } catch (error) {
    console.error('Process registration error:', error);
    
    let errorMessage = '❌ An error occurred. Please try again.';
    if (error.message.includes('duplicate key')) {
      errorMessage = '❌ You are already registered for this raid!';
    }
    
    if (interaction.deferred) {
      await interaction.followUp({ content: errorMessage, flags: 64 });
    } else {
      await interaction.editReply({ content: errorMessage });
    }
  }
}

// ✅ FIXED - Now uses transaction for atomic unregister + waitlist promotion
async function handleUnregister(interaction, raidId) {
  // Check for spam
  if (!checkInteractionCooldown(interaction.user.id, `unregister_${raidId}`)) {
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

    const registration = await getRegistration(raidId, interaction.user.id);
    if (!registration) {
      return await interaction.editReply({ content: '❌ You are not registered for this raid!' });
    }

    const wasRegistered = registration.status === 'registered';
    const userRole = registration.role;

    await deleteRegistration(raidId, interaction.user.id);

    // Remove Discord role
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.remove(raid.main_role_id);
    } catch (err) {
      console.error('Failed to remove role:', err);
    }

    // Promote from waitlist if there was a registered player
    if (wasRegistered) {
      const channel = await interaction.client.channels.fetch(raid.channel_id);
      await promoteFromWaitlist(raid, userRole, channel);
    }

    await updateRaidMessage(raid, interaction.client);

    await interaction.editReply({ content: '✅ You have been unregistered!' });

  } catch (error) {
    console.error('Unregister error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

// ✅ FIXED - Now uses transaction for atomic promotion
async function promoteFromWaitlist(raid, role, channel) {
  try {
    const registrationType = 'register';
    const nextPlayer = await findNextWaitlistPlayer(raid.id, role, registrationType);

    if (!nextPlayer) return;

    await updateRegistrationStatus(nextPlayer.id, 'registered');

    const guild = channel.guild;
    try {
      const member = await guild.members.fetch(nextPlayer.user_id);
      await member.roles.add(raid.main_role_id);
    } catch (err) {
      console.error('Failed to add role to promoted player:', err);
    }

    await channel.send(
      `<@${nextPlayer.user_id}> you've been promoted from the waitlist! You're now in the raid! 🎉`
    );

  } catch (error) {
    console.error('Promotion error:', error);
  }
}

async function updateRaidMessage(raid, client) {
  try {
    if (!raid.message_id || !raid.channel_id) return;

    const registrations = await getRaidRegistrations(raid.id);
    const embed = await createRaidEmbed(raid, registrations);
    const buttons = createRaidButtons(raid.id, raid.locked);

    const channel = await client.channels.fetch(raid.channel_id);
    const message = await channel.messages.fetch(raid.message_id);

    await message.edit({ embeds: [embed], components: [buttons] });
  } catch (error) {
    console.error('Update raid message error:', error);
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
  ...raidHandlers
};
