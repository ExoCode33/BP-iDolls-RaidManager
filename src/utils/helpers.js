const classEmojis = {
  'BeatPerformer': '<:BeatPerformer:1460272597538181254>',
  'FrostMage': '<:FrostMage:1460272596523159695>',
  'HeavyGuardian': '<:HeavyGuardian:1460272595264995458>',
  'Marksman': '<:Marksman:1460272594275012671>',
  'ShieldKnight': '<:ShieldKnight:1460272593306255465>',
  'StormBlade': '<:StormBlade:1460272591473348618>',
  'VerdantOracle': '<:VerdantOracle:1460272589296504916>',
  'WindKnight': '<:WindKnight:1460272588779913428>'
};

const roleEmojis = {
  Tank: '🛡️',
  DPS: '⚔️',
  Support: '💚'
};

const classToRole = {
  'HeavyGuardian': 'Tank',
  'ShieldKnight': 'Tank',
  'BeatPerformer': 'Support',
  'VerdantOracle': 'Support',
  'StormBlade': 'DPS',
  'FrostMage': 'DPS',
  'Marksman': 'DPS',
  'WindKnight': 'DPS'
};

function inferRole(className) {
  return classToRole[className] || 'DPS';
}

function getRoleEmoji(role) {
  return roleEmojis[role] || '❓';
}

function getClassEmoji(className) {
  return classEmojis[className] || '';
}

function getPowerBracket(abilityScore) {
  if (abilityScore >= 38000) return '[38k+]';
  const lower = Math.floor(abilityScore / 2000) * 2;
  const upper = lower + 2;
  return `[${lower}-${upper}k]`;
}

function formatPlayerLine(registration, showTag = false) {
  const classEmoji = getClassEmoji(registration.class);
  const powerBracket = getPowerBracket(registration.ability_score);
  const tag = showTag ? ` (${registration.registration_type === 'register' ? 'Register' : 'Assist'})` : '';
  
  return `${registration.ign} • ${registration.class} ${classEmoji} ${powerBracket}${tag}`;
}

function parseDateTime(dateStr, timeStr) {
  const combined = `${dateStr}T${timeStr}:00Z`;
  return new Date(combined);
}

function isRaidFull(counts, raidSize) {
  return counts.total_registered >= raidSize;
}

function isRoleFull(role, counts, raid) {
  const slots = {
    Tank: raid.tank_slots,
    Support: raid.support_slots,
    DPS: raid.dps_slots
  };
  
  return counts[role].registered >= slots[role];
}

function getRaidSlotLabel(raidSlot) {
  return `Raid ${raidSlot}`;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const allClasses = [
  'BeatPerformer',
  'FrostMage',
  'HeavyGuardian',
  'Marksman',
  'ShieldKnight',
  'StormBlade',
  'VerdantOracle',
  'WindKnight'
];

const allSubclasses = {
  'BeatPerformer': ['Lifebind', 'Healing Wave', 'Rejuvenation'],
  'VerdantOracle': ['Nature\'s Blessing', 'Spirit Link', 'Restoration'],
  'HeavyGuardian': ['Fortress', 'Iron Wall', 'Shield Bash'],
  'ShieldKnight': ['Recovery', 'Guardian', 'Defender'],
  'StormBlade': ['Iaido', 'Lightning Strike', 'Thunder Slash'],
  'FrostMage': ['Ice Storm', 'Blizzard', 'Frozen Orb'],
  'Marksman': ['Precision', 'Rapid Fire', 'Sniper'],
  'WindKnight': ['Tempest', 'Gale Force', 'Hurricane']
};

const powerRanges = [
  '0-10k',
  '10-12k',
  '12-14k',
  '14-16k',
  '16-18k',
  '18-20k',
  '20-22k',
  '22-24k',
  '24-26k',
  '26-28k',
  '28-30k',
  '30-32k',
  '32-34k',
  '34-36k',
  '36-38k',
  '38k+'
];

function parsePowerRange(rangeStr) {
  if (rangeStr === '38k+') return 38000;
  const match = rangeStr.match(/(\d+)-(\d+)k/);
  if (match) {
    return parseInt(match[1]) * 1000;
  }
  return 0;
}

module.exports = {
  inferRole,
  getRoleEmoji,
  getClassEmoji,
  getPowerBracket,
  formatPlayerLine,
  parseDateTime,
  isRaidFull,
  isRoleFull,
  getRaidSlotLabel,
  chunkArray,
  allClasses,
  allSubclasses,
  powerRanges,
  parsePowerRange,
  classToRole
};
