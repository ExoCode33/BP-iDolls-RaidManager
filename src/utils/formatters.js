const classEmojis = {
  'Beat Performer': '<:BeatPerformer:1460272597538181254>',
  'Frost Mage': '<:FrostMage:1460272596523159695>',
  'Heavy Guardian': '<:HeavyGuardian:1460272595264995458>',
  'Marksman': '<:Marksman:1460272594275012671>',
  'Shield Knight': '<:ShieldKnight:1460272593306255465>',
  'Stormblade': '<:StormBlade:1460272591473348618>',
  'Verdant Oracle': '<:VerdantOracle:1460272589296504916>',
  'Wind Knight': '<:WindKnight:1460272587799138428>'
};

const tankClasses = ['Heavy Guardian', 'Shield Knight'];
const supportClasses = ['Beat Performer', 'Verdant Oracle'];

function getClassEmoji(className) {
  return classEmojis[className] || '❔';
}

function inferRole(className) {
  if (tankClasses.includes(className)) return 'Tank';
  if (supportClasses.includes(className)) return 'Support';
  return 'DPS';
}

function getPowerColor(abilityScore) {
  if (abilityScore >= 38000) return '🟣'; // 38k+ Purple
  if (abilityScore >= 36000) return '🔴'; // 36-38k Red
  if (abilityScore >= 34000) return '🟠'; // 34-36k Orange
  if (abilityScore >= 32000) return '🟡'; // 32-34k Yellow
  if (abilityScore >= 30000) return '🟢'; // 30-32k Green
  return '⚪'; // <30k White
}

function getPowerRange(abilityScore) {
  if (abilityScore >= 38000) return '38k+';
  if (abilityScore >= 36000) return '36-38k';
  if (abilityScore >= 34000) return '34-36k';
  if (abilityScore >= 32000) return '32-34k';
  if (abilityScore >= 30000) return '30-32k';
  return '28-30k';
}

module.exports = {
  getClassEmoji,
  inferRole,
  getPowerColor,
  getPowerRange,
  tankClasses,
  supportClasses
};
