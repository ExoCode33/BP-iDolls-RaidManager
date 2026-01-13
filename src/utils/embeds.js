const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getClassEmoji, getPowerColor } = require('./formatters');

function createRaidEmbed(raid, registrations) {
  const { registered, assist, waitlist } = categorizeRegistrations(registrations);

  const tankRegistered = registered.filter(r => r.role === 'Tank');
  const supportRegistered = registered.filter(r => r.role === 'Support');
  const dpsRegistered = registered.filter(r => r.role === 'DPS');

  const tankAssist = assist.filter(r => r.role === 'Tank');
  const supportAssist = assist.filter(r => r.role === 'Support');
  const dpsAssist = assist.filter(r => r.role === 'DPS');

  const embed = new EmbedBuilder()
    .setColor(0xEC4899) // Pink color
    .setTitle(`${raid.name}`)
    .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n<t:${Math.floor(new Date(raid.start_time).getTime() / 1000)}:F>\n<@&${raid.main_role_id}>`);

  // Tank Section
  let tankText = `**Tank (${tankRegistered.length}/${raid.tank_slots}):**\n`;
  tankText += formatRoleSection(tankRegistered, raid.tank_slots);
  if (tankAssist.length > 0) {
    tankText += `\n*Assist:*\n${formatRoleSection(tankAssist, 0)}`;
  }

  // Support Section  
  let supportText = `**Support (${supportRegistered.length}/${raid.support_slots}):**\n`;
  supportText += formatRoleSection(supportRegistered, raid.support_slots);
  if (supportAssist.length > 0) {
    supportText += `\n*Assist:*\n${formatRoleSection(supportAssist, 0)}`;
  }

  // DPS Section
  let dpsText = `**DPS (${dpsRegistered.length}/${raid.dps_slots}):**\n`;
  dpsText += formatRoleSection(dpsRegistered, raid.dps_slots);
  if (dpsAssist.length > 0) {
    dpsText += `\n*Assist:*\n${formatRoleSection(dpsAssist, 0)}`;
  }

  embed.addFields(
    { name: '\u200b', value: tankText, inline: false },
    { name: '\u200b', value: supportText, inline: false },
    { name: '\u200b', value: dpsText, inline: false }
  );

  // Waitlist
  if (waitlist.length > 0) {
    let waitlistText = waitlist.map(reg => {
      const powerColor = getPowerColor(reg.ability_score);
      const classEmoji = getClassEmoji(reg.class);
      return `${powerColor} <@${reg.user_id}> - ${reg.ign} ${classEmoji}`;
    }).join('\n');
    
    embed.addFields({ name: '**Waitlist:**', value: waitlistText, inline: false });
  }

  embed.addFields({ 
    name: '\u200b', 
    value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 
    inline: false 
  });

  // Add lock indicator if raid is locked
  if (raid.locked) {
    embed.setFooter({ text: '🔒 Registration Locked' });
  }

  return embed;
}

function formatRoleSection(registrations, maxSlots) {
  if (registrations.length === 0) {
    return '*Empty*';
  }

  return registrations.map((reg, index) => {
    const powerColor = getPowerColor(reg.ability_score);
    const classEmoji = getClassEmoji(reg.class);
    return `${powerColor} <@${reg.user_id}> - ${reg.ign} ${classEmoji}`;
  }).join('\n');
}

function categorizeRegistrations(registrations) {
  return {
    registered: registrations.filter(r => r.status === 'registered'),
    assist: registrations.filter(r => r.status === 'assist'),
    waitlist: registrations.filter(r => r.status === 'waitlist')
  };
}

function createRaidButtons(raidId, isLocked = false) {
  const row = new ActionRowBuilder();

  if (!isLocked) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`register_${raidId}`)
        .setLabel('Register')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`assist_${raidId}`)
        .setLabel('I can help')
        .setStyle(ButtonStyle.Primary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`unregister_${raidId}`)
      .setLabel('Unregister')
      .setStyle(ButtonStyle.Danger)
  );

  return row;
}

module.exports = {
  createRaidEmbed,
  createRaidButtons,
  categorizeRegistrations
};
