const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Pool } = require('pg');

// Profile database connection
const profilePool = new Pool({
  connectionString: process.env.PROFILE_BOT_DB_URL || process.env.EVENT_BOT_DB_URL,
  ssl: false
});

// ═══════════════════════════════════════════════════════════════
// RAID EMBED CREATION
// ═══════════════════════════════════════════════════════════════

async function createRaidEmbed(raid, registrations) {
  const embed = new EmbedBuilder()
    .setColor(0xEC4899)
    .setTitle(raid.name);
  
  // Always set a description, even if minimal
  const timestamp = Math.floor(new Date(raid.start_time).getTime() / 1000);
  const raidNumber = raid.raid_size === 12 ? '1' : '2';
  embed.setDescription(
    `<t:${timestamp}:F>\n@Raid ${raidNumber}`
  );

  // Separate by role and status
  const registered = registrations.filter(r => r.status === 'registered');
  const waitlist = registrations.filter(r => r.status === 'waitlist');

  // Count by role - fix role field to lowercase
  const tanks = registered.filter(r => r.role && r.role.toLowerCase() === 'tank');
  const supports = registered.filter(r => r.role && r.role.toLowerCase() === 'support');
  const dps = registered.filter(r => r.role && r.role.toLowerCase() === 'dps');

  // Tank section (0/2)
  const tankMax = 2;
  let tankText = '';
  if (tanks.length === 0) {
    tankText = '*Empty*';
  } else {
    try {
      tankText = (await Promise.all(tanks.map(t => formatPlayer(t, false)))).join('\n');
    } catch (err) {
      console.error('Error formatting tanks:', err);
      tankText = tanks.map(t => `🟢 ${t.ign}`).join('\n');
    }
  }
  embed.addFields({ 
    name: `Tank (${tanks.length}/${tankMax}):`, 
    value: tankText, 
    inline: false 
  });

  // Support section (1/2)
  const supportMax = 2;
  let supportText = '';
  if (supports.length === 0) {
    supportText = '*Empty*';
  } else {
    try {
      supportText = (await Promise.all(supports.map(s => formatPlayer(s, false)))).join('\n');
    } catch (err) {
      console.error('Error formatting supports:', err);
      supportText = supports.map(s => `🟢 ${s.ign}`).join('\n');
    }
  }
  embed.addFields({ 
    name: `Support (${supports.length}/${supportMax}):`, 
    value: supportText, 
    inline: false 
  });

  // DPS section (0/8)
  const dpsMax = raid.raid_size - 4; // Total minus tanks and supports
  let dpsText = '';
  if (dps.length === 0) {
    dpsText = '*Empty*';
  } else {
    try {
      dpsText = (await Promise.all(dps.map(d => formatPlayer(d, false)))).join('\n');
    } catch (err) {
      console.error('Error formatting dps:', err);
      dpsText = dps.map(d => `🟢 ${d.ign}`).join('\n');
    }
  }
  embed.addFields({ 
    name: `DPS (${dps.length}/${dpsMax}):`, 
    value: dpsText, 
    inline: false 
  });

  // Waitlist section (Assist)
  if (waitlist.length > 0) {
    try {
      const waitlistText = (await Promise.all(waitlist.map(w => formatPlayer(w, true)))).join('\n');
      embed.addFields({ 
        name: `⏳ Waitlist (${waitlist.length}):`, 
        value: waitlistText, 
        inline: false 
      });
    } catch (err) {
      console.error('Error formatting waitlist:', err);
      const waitlistText = waitlist.map(w => `🟢 ${w.ign} [Assist]`).join('\n');
      embed.addFields({ 
        name: `⏳ Waitlist (${waitlist.length}):`, 
        value: waitlistText, 
        inline: false 
      });
    }
  }

  return embed;
}

async function formatPlayer(registration, isAssist) {
  // Get player character data from profile database
  let characterData = null;
  try {
    const result = await profilePool.query(
      `SELECT ign, class, subclass, ability_score FROM characters WHERE discord_id = $1 AND type = 'main' LIMIT 1`,
      [registration.user_id]  // ✅ FIXED - use user_id instead of discord_id
    );
    characterData = result.rows[0];
  } catch (err) {
    console.error('Error fetching character data:', err);
  }

  // Use data from profile or fallback to registration data
  const ign = characterData?.ign || registration.ign || 'Unknown';
  const subclass = characterData?.subclass || registration.subclass || registration.class || '';
  const score = characterData?.ability_score || registration.ability_score || '';
  
  // Status indicator (green dot for registered)
  const statusDot = '🟢';
  
  // Class emoji based on subclass name
  const classEmoji = getClassEmoji(subclass);
  
  // Build format: 🟢 IGN • Subclass 🎯 [30-32k] [Assist]
  let formatted = `${statusDot} ${ign}`;
  
  if (subclass) {
    formatted += ` • ${subclass}`;
  }
  
  if (classEmoji) {
    formatted += ` ${classEmoji}`;
  }
  
  if (score) {
    formatted += ` [${score}]`;
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
    .setLabel('Register')
    .setStyle(ButtonStyle.Success)
    .setDisabled(isLocked);

  const helpButton = new ButtonBuilder()
    .setCustomId(`help_${raidId}`)
    .setLabel('I can help')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isLocked);

  const unregisterButton = new ButtonBuilder()
    .setCustomId(`unregister_${raidId}`)
    .setLabel('Unregister')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(
    registerButton,
    helpButton,
    unregisterButton
  );
}

module.exports = {
  createRaidEmbed,
  createRaidButtons,
  formatPlayer,
  getClassEmoji
};
