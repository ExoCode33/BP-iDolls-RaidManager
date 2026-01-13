const { 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  getRaid,
  getUserCharacters,
  getRegistration,
  createRegistration,
  deleteRegistration,
  getRaidRegistrations,
  getRaidCounts,
  findNextWaitlistPlayer,
  updateRegistrationStatus,
  getConfig
} = require('../database/queries');
const { 
  inferRole, 
  getRoleEmoji, 
  getClassEmoji,
  isRaidFull, 
  isRoleFull,
  allClasses,
  allSubclasses,
  powerRanges,
  parsePowerRange
} = require('../utils/helpers');
const { createRaidEmbed } = require('../utils/embeds');

async function handleButton(interaction) {
  const [action, type, raidId] = interaction.customId.split('_');

  if (action === 'raid') {
    if (type === 'register' || type === 'assist') {
      await handleRegistration(interaction, parseInt(raidId), type);
    } else if (type === 'unregister') {
      await handleUnregister(interaction, parseInt(raidId));
    }
  } else if (action === 'char') {
    await handleCharacterSelect(interaction);
  } else if (action === 'manual') {
    await handleManualEntry(interaction);
  }
}

async function handleRegistration(interaction, raidId, registrationType) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    if (raid.status !== 'open') {
      return await interaction.editReply({ content: '❌ This raid is no longer open for registration!' });
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
      const role = inferRole(char.class);
      
      let typeLabel = char.character_type;
      if (typeLabel === 'main_subclass') {
        typeLabel = 'Subclass';
      }
      
      const classEmojiRaw = getClassEmoji(char.class);
      let emojiObj = undefined;
      
      if (classEmojiRaw) {
        const match = classEmojiRaw.match(/<:(\w+):(\d+)>/);
        if (match) {
          emojiObj = {
            name: match[1],
            id: match[2]
          };
        }
      }
      
      options.push({
        label: `${char.ign} - ${char.class} (${typeLabel})`,
        value: `char_${char.id}`,
        description: `${char.subclass} - ${role}`,
        emoji: emojiObj
      });
    }

    if (options.length > 0) {
      options.push({
        label: '─────────────────────────────',
        value: 'separator',
        description: 'Manual Entry Options',
        disabled: true
      });
    }

    options.push({
      label: 'Register as Tank (No Character)',
      value: `manual_tank_${registrationType}`,
      emoji: '🛡️'
    });

    options.push({
      label: 'Register as DPS (No Character)',
      value: `manual_dps_${registrationType}`,
      emoji: '⚔️'
    });

    options.push({
      label: 'Register as Support (No Character)',
      value: `manual_support_${registrationType}`,
      emoji: '💚'
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
      return await interaction.followUp({ 
        content: '❌ Raid not found!', 
        ephemeral: true 
      });
    }

    if (selection.startsWith('manual_')) {
      const [, role] = selection.split('_');
      await showManualEntryModal(interaction, parseInt(raidId), registrationType, role);
      return;
    }

    if (selection.startsWith('char_')) {
      const characterId = parseInt(selection.split('_')[1]);
      const { getCharacterById } = require('../database/queries');
      const character = await getCharacterById(characterId);

      if (!character) {
        return await interaction.followUp({ 
          content: '❌ Character not found!', 
          ephemeral: true 
        });
      }

      await processRegistration(interaction, raid, character, registrationType, 'main_bot');
    }

  } catch (error) {
    console.error('Character select error:', error);
    await interaction.followUp({ 
      content: '❌ An error occurred. Please try again.', 
      ephemeral: true 
    });
  }
}

async function showManualEntryModal(interaction, raidId, registrationType, role) {
  const modal = new ModalBuilder()
    .setCustomId(`manual_modal_${raidId}_${registrationType}_${role}`)
    .setTitle(`Manual ${role.charAt(0).toUpperCase() + role.slice(1)} Registration`);

  const ignInput = new TextInputBuilder()
    .setCustomId('ign')
    .setLabel('In-Game Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const classInput = new TextInputBuilder()
    .setCustomId('class')
    .setLabel('Class')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., StormBlade, HeavyGuardian')
    .setRequired(true);

  const subclassInput = new TextInputBuilder()
    .setCustomId('subclass')
    .setLabel('Subclass')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Iaido, Fortress')
    .setRequired(true);

  const powerInput = new TextInputBuilder()
    .setCustomId('power')
    .setLabel('Power Range')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 28-30k, 36-38k, 38k+')
    .setRequired(true);

  const rows = [ignInput, classInput, subclassInput, powerInput].map(input =>
    new ActionRowBuilder().addComponents(input)
  );

  modal.addComponents(...rows);

  await interaction.showModal(modal);
}

async function handleManualModal(interaction) {
  const [, , raidId, registrationType, role] = interaction.customId.split('_');

  await interaction.deferReply({ ephemeral: true });

  try {
    const raid = await getRaid(parseInt(raidId));
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    const ign = interaction.fields.getTextInputValue('ign');
    const className = interaction.fields.getTextInputValue('class');
    const subclass = interaction.fields.getTextInputValue('subclass');
    const powerInput = interaction.fields.getTextInputValue('power');

    let abilityScore;
    if (powerInput === '38k+') {
      abilityScore = 38000;
    } else {
      const match = powerInput.match(/(\d+)-(\d+)k/);
      if (match) {
        abilityScore = parseInt(match[1]) * 1000;
      } else {
        return await interaction.editReply({ 
          content: '❌ Invalid power format! Use format like "28-30k" or "38k+"' 
        });
      }
    }

    const characterData = {
      id: null,
      ign,
      class: className,
      subclass,
      ability_score: abilityScore,
      role: role.charAt(0).toUpperCase() + role.slice(1)
    };

    await processRegistration(interaction, raid, characterData, registrationType, 'manual');

  } catch (error) {
    console.error('Manual modal error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

async function processRegistration(interaction, raid, character, registrationType, source) {
  try {
    const counts = await getRaidCounts(raid.id);
    const role = inferRole(character.class);

    let status;
    if (isRaidFull(counts, raid.raid_size) || isRoleFull(role, counts, raid)) {
      status = 'waitlist';
    } else {
      status = 'registered';
    }

    await createRegistration({
      raid_id: raid.id,
      user_id: interaction.user.id,
      character_id: character.id,
      character_source: source,
      ign: character.ign,
      class: character.class,
      subclass: character.subclass,
      ability_score: character.ability_score,
      role: role,
      registration_type: registrationType,
      status: status
    });

    if (status === 'registered') {
      const raidRole = await interaction.guild.roles.fetch(raid.main_role_id);
      await interaction.member.roles.add(raidRole);
    }

    await updateRaidMessage(raid, interaction.client);

    const message = status === 'registered'
      ? `✅ You're registered for the raid! You now have the <@&${raid.main_role_id}> role.`
      : `✅ The raid/role is full. You've been added to the waitlist. You'll be notified if a spot opens!`;

    await interaction.editReply({ content: message });

  } catch (error) {
    console.error('Process registration error:', error);
    throw error;
  }
}

async function handleUnregister(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const raid = await getRaid(raidId);
    if (!raid) {
      return await interaction.editReply({ content: '❌ Raid not found!' });
    }

    const registration = await getRegistration(raidId, interaction.user.id);
    if (!registration) {
      return await interaction.editReply({ content: '❌ You are not registered for this raid!' });
    }

    const wasInMainRoster = (registration.status === 'registered');

    if (wasInMainRoster) {
      const raidRole = await interaction.guild.roles.fetch(raid.main_role_id);
      await interaction.member.roles.remove(raidRole);
    }

    await deleteRegistration(raidId, interaction.user.id);

    if (wasInMainRoster) {
      await promoteFromWaitlist(raid, registration.role, interaction.channel);
    }

    await updateRaidMessage(raid, interaction.client);

    await interaction.editReply({ content: '✅ You have been unregistered from the raid.' });

  } catch (error) {
    console.error('Unregister error:', error);
    await interaction.editReply({ content: '❌ An error occurred. Please try again.' });
  }
}

async function promoteFromWaitlist(raid, role, channel) {
  const promoted = await findNextWaitlistPlayer(raid.id, role, 'register');

  if (!promoted) return;

  try {
    const guild = channel.guild;
    const member = await guild.members.fetch(promoted.user_id);
    const raidRole = await guild.roles.fetch(raid.main_role_id);

    await member.roles.add(raidRole);

    await updateRegistrationStatus(promoted.id, 'registered');

    await channel.send(
      `<@${promoted.user_id}> you've been promoted from the waitlist! You're now in the raid! 🎉`
    );

  } catch (error) {
    console.error('Promotion error:', error);
  }
}

async function updateRaidMessage(raid, client) {
  try {
    if (!raid.message_id || !raid.channel_id) return;

    const registrations = await getRaidRegistrations(raid.id);
    const counts = await getRaidCounts(raid.id);
    const embed = await createRaidEmbed(raid, registrations, counts);

    const channel = await client.channels.fetch(raid.channel_id);
    const message = await channel.messages.fetch(raid.message_id);

    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error('Update raid message error:', error);
  }
}

module.exports = {
  handleButton,
  handleManualModal
};
