// ═══════════════════════════════════════════════════════════════
// RAID MANAGEMENT STATE & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const raidCreationState = new Map();

// Channel presets - UPDATE THESE WITH YOUR CHANNEL IDS
const CHANNEL_PRESETS = {
  'Raid Channel': '1458571147418275882', // Replace with your actual channel ID
  'Events Channel': '1234567890123456789', // Replace with your actual channel ID
};

// Time presets (all in UTC)
const TIME_PRESETS = [
  { label: '8:00 PM EST (01:00 UTC)', value: '01:00' },
  { label: '9:00 PM EST (02:00 UTC)', value: '02:00' },
  { label: '10:00 PM EST (03:00 UTC)', value: '03:00' },
  { label: '8:00 PM PST (04:00 UTC)', value: '04:00' },
  { label: '9:00 PM PST (05:00 UTC)', value: '05:00' },
  { label: '10:00 PM PST (06:00 UTC)', value: '06:00' },
];

module.exports = {
  raidCreationState,
  CHANNEL_PRESETS,
  TIME_PRESETS
};
