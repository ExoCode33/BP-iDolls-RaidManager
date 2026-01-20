const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ═══════════════════════════════════════════════════════════════
// RAID EMBED CREATION
// ═══════════════════════════════════════════════════════════════

async function createRaidEmbed(raid, registrations) {
  const embed = new EmbedBuilder()
    .setColor(0xEC4899);
  
  // ✅ Title with lock emoji at the end - bigger and bolder
  const lockEmoji = raid.locked ? '🔒' : '🔓';
  const lockStatus = raid.locked ? 'Registration Closed' : 'Registration Open';
  embed.setTitle(`**${raid.name} • ${lockStatus}** ${lockEmoji}`);
  
  // ✅ Description with clean separator lines
  const timestamp = Math.floor(new Date(raid.start_time).getTime() / 1000);
  const raidNumber = raid.raid_size === 12 ? '1' : '2';
  
  embed.setDescription(
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n📅 <t:${timestamp}:F>\n⏰ <t:${timestamp}:R>\n👤 Raid Role • <@&${raid.main_role_id}>\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`
  );

  // Separate by role and status
  const registered = registrations.filter(r => r.status === 'registered');
  const assist = registrations.filter(r => r.status === 'assist');
  const waitlist = registrations.filter(r => r.status === 'waitlist');

  // Combine registered and assist for display (both are in the raid)
  const inRaid = [...registered, ...assist];

  // Count by role
  const tanks = inRaid.filter(r => r.role && r.role.toLowerCase() === 'tank');
  const supports = inRaid.filter(r => r.role && r.role.toLowerCase() === 'support');
  const dps = inRaid.filter(r => r.role && r.role.toLowerCase() === 'dps');

  // Tank section with reserved spots
  const tankMax = 2;
  let tankText = '';
  if (tanks.length > 0) {
    try {
      tankText = (await Promise.all(tanks.map(t => formatPlayer(t)))).join('\n');
    } catch (err) {
      console.error('Error formatting tanks:', err);
      tankText = tanks.map(t => `${t.ign}`).join('\n');
    }
  }
  // Add empty spots
  for (let i = tanks.length; i < tankMax; i++) {
    tankText += (tankText ? '\n' : '') + '┗ *Open Spot*';
  }
  
  embed.addFields({ 
    name: `🛡️ Tank (${tanks.length}/${tankMax})`, 
    value: tankText || '┗ *Open Spot*\n┗ *Open Spot*', 
    inline: false 
  });

  // Support section with reserved spots
  const supportMax = 2;
  let supportText = '';
  if (supports.length > 0) {
    try {
      supportText = (await Promise.all(supports.map(s => formatPlayer(s)))).join('\n');
    } catch (err) {
      console.error('Error formatting supports:', err);
      supportText = supports.map(s => `${s.ign}`).join('\n');
    }
  }
  // Add empty spots
  for (let i = supports.length; i < supportMax; i++) {
    supportText += (supportText ? '\n' : '') + '┗ *Open Spot*';
  }
  
  embed.addFields({ 
    name: `💚 Support (${supports.length}/${supportMax})`, 
    value: supportText || '┗ *Open Spot*\n┗ *Open Spot*', 
    inline: false 
  });

  // DPS section with reserved spots
  const dpsMax = raid.raid_size - 4;
  let dpsText = '';
  if (dps.length > 0) {
    try {
      dpsText = (await Promise.all(dps.map(d => formatPlayer(d)))).join('\n');
    } catch (err) {
      console.error('Error formatting dps:', err);
      dpsText = dps.map(d => `${d.ign}`).join('\n');
    }
  }
  // Add empty spots
  for (let i = dps.length; i < dpsMax; i++) {
    dpsText += (dpsText ? '\n' : '') + '┗ *Open Spot*';
  }
  
  embed.addFields({ 
    name: `⚔️ DPS (${dps.length}/${dpsMax})`, 
    value: dpsText || '┗ *Open Spot*\n┗ *Open Spot*\n┗ *Open Spot*\n┗ *Open Spot*\n┗ *Open Spot*\n┗ *Open Spot*\n┗ *Open Spot*\n┗ *Open Spot*', 
    inline: false 
  });

  // Waitlist section
  if (waitlist.length > 0) {
    try {
      const waitlistText = (await Promise.all(waitlist.map(w => formatPlayer(w)))).join('\n');
      embed.addFields({ 
        name: `⏳ Waitlist (${waitlist.length})`, 
        value: waitlistText, 
        inline: false 
      });
    } catch (err) {
      console.error('Error formatting waitlist:', err);
      const waitlistText = waitlist.map(w => `${w.ign}`).join('\n');
      embed.addFields({ 
        name: `⏳ Waitlist (${waitlist.length})`, 
        value: waitlistText, 
        inline: false 
      });
    }
  }

  // Add cute footer with iDolls vibe
  embed.setFooter({ text: '✨ iDolls Raid | Show time!' });
  embed.setTimestamp();

  return embed;
}

async function formatPlayer(registration) {
  // Use data directly from registration object
  const ign = registration.ign || 'Unknown';
  const className = registration.class || '';
  const subclass = registration.subclass || '';
  const score = registration.ability_score || '';
  const isAssist = registration.registration_type === 'assist';
  
  // Get custom emoji using the class name (e.g., "Beat Performer")
  const classEmoji = getClassEmoji(className);
  
  // Format ability score as range (e.g., 31000 -> "30K-32K")
  let scoreRange = '';
  if (score) {
    const numScore = parseInt(score);
    if (!isNaN(numScore)) {
      // Round down to nearest 2K interval
      // e.g., 31000 -> 30000, 32000 -> 32000, 33000 -> 32000
      const lowerBound = Math.floor(numScore / 2000) * 2000;
      const upperBound = lowerBound + 2000;
      scoreRange = `[${lowerBound/1000}K-${upperBound/1000}K]`;
    } else {
      // If score is already formatted, use as-is
      scoreRange = `[${score}]`;
    }
  }
  
  // Build format: IGN • Subclass 🎯 [30K-32K] [Assist]
  let formatted = ign;
  
  if (subclass) {
    formatted += ` • ${subclass}`;
  }
  
  if (classEmoji) {
    formatted += ` ${classEmoji}`;
  }
  
  if (scoreRange) {
    formatted += ` ${scoreRange}`;
  }
  
  if (isAssist) {
    formatted += ` [Assist]`;
  }
  
  return formatted;
}

function getClassEmoji(subclassName) {
  if (!subclassName) return '';
  
  const subclassLower = subclassName.toLowerCase();
  
  // Map class names to custom emoji IDs
  const customEmojiMap = {
    'beatperformer': '<:BeatPerformer:1460272597538181254>',
    'beat performer': '<:BeatPerformer:1460272597538181254>',
    'frostmage': '<:FrostMage:1460272596523159695>',
    'frost mage': '<:FrostMage:1460272596523159695>',
    'heavyguardian': '<:HeavyGuardian:1460272595264995458>',
    'heavy guardian': '<:HeavyGuardian:1460272595264995458>',
    'marksman': '<:Marksman:1460272594275012671>',
    'shieldknight': '<:ShieldKnight:1460272593306255465>',
    'shield knight': '<:ShieldKnight:1460272593306255465>',
    'stormblade': '<:StormBlade:1460272591473348618>',
    'storm blade': '<:StormBlade:1460272591473348618>',
    'verdantoracle': '<:VerdantOracle:1460272589296504916>',
    'verdant oracle': '<:VerdantOracle:1460272589296504916>',
    'windknight': '<:WindKnight:1460272587799138428>',
    'wind knight': '<:WindKnight:1460272587799138428>'
  };
  
  // Remove spaces and check for exact match
  const normalizedName = subclassLower.replace(/\s+/g, '');
  if (customEmojiMap[normalizedName]) {
    return customEmojiMap[normalizedName];
  }
  
  // Check with spaces
  if (customEmojiMap[subclassLower]) {
    return customEmojiMap[subclassLower];
  }
  
  // Subclass emoji map (for all subclasses)
  const subclassEmojiMap = {
    // Beat Performer subclasses
    'dissonance': '🎭',
    'concerto': '🎵',
    
    // Frost Mage subclasses
    'icicle': '❄️',
    'frostbeam': '🧊',
    
    // Heavy Guardian subclasses
    'earthfort': '🛡️',
    'block': '🛡️',
    
    // Marksman subclasses
    'wildpack': '🏹',
    'falconry': '🦅',
    
    // Shield Knight subclasses
    'recovery': '💚',
    'shield': '🛡️',
    
    // Stormblade subclasses
    'iaido slash': '⚡',
    'iaido': '⚡',
    'moonstrike': '🌙',
    
    // Verdant Oracle subclasses
    'smite': '✨',
    'lifebind': '💚',
    
    // Wind Knight subclasses
    'vanguard': '⚔️',
    'skyward': '🌪️'
  };
  
  // Check for subclass names
  for (const [key, emoji] of Object.entries(subclassEmojiMap)) {
    if (subclassLower.includes(key)) {
      return emoji;
    }
  }
  
  return '⚔️'; // Default emoji
}

// ═══════════════════════════════════════════════════════════════
// RAID BUTTONS CREATION
// ═══════════════════════════════════════════════════════════════

function createRaidButtons(raidId, isLocked) {
  const registerButton = new ButtonBuilder()
    .setCustomId(`register_${raidId}`)
    .setLabel('Register [Need Clear]')
    .setStyle(ButtonStyle.Primary)  // ✅ Changed to blue
    .setDisabled(isLocked);

  const assistButton = new ButtonBuilder()
    .setCustomId(`assist_${raidId}`)
    .setLabel('Assist [Already Cleared]')
    .setStyle(ButtonStyle.Secondary)  // ✅ Changed to grey
    .setDisabled(isLocked);

  const unregisterButton = new ButtonBuilder()
    .setCustomId(`unregister_${raidId}`)
    .setLabel('Unregister')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(
    registerButton,
    assistButton,
    unregisterButton
  );
}

module.exports = {
  createRaidEmbed,
  createRaidButtons,
  formatPlayer,
  getClassEmoji
};
