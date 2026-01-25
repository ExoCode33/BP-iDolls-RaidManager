// ═══════════════════════════════════════════════════════════════
// RAID MANAGEMENT STATE & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const raidCreationState = new Map();

// Channel presets - These will be fetched dynamically from Discord
// You can also hardcode specific channels here if needed
const CHANNEL_PRESETS = {
  // Example: 'Raid Channel': '1458571147418275882',
  // The system will auto-fetch all channels from your guild
};

// ✅ IMPORTANT: Time presets are in UTC
// EST is UTC-5 (or UTC-4 during daylight saving)
// To convert: EST + 5 hours = UTC (or EST + 4 hours = UTC during DST)
// 
// Example: 9:00 PM EST = 2:00 AM UTC next day (9 PM + 5 hours = 2 AM)
//          8:00 PM EST = 1:00 AM UTC next day (8 PM + 5 hours = 1 AM)
//
// When creating a raid:
// 1. Enter the DATE in your local timezone
// 2. Select the TIME in UTC from the dropdown
// 3. The bot will create the raid at that exact UTC time

const TIME_PRESETS = [
  { label: '12:00 AM EST (05:00 UTC)', value: '05:00' },
  { label: '1:00 AM EST (06:00 UTC)', value: '06:00' },
  { label: '2:00 AM EST (07:00 UTC)', value: '07:00' },
  { label: '3:00 AM EST (08:00 UTC)', value: '08:00' },
  { label: '4:00 AM EST (09:00 UTC)', value: '09:00' },
  { label: '5:00 AM EST (10:00 UTC)', value: '10:00' },
  { label: '6:00 AM EST (11:00 UTC)', value: '11:00' },
  { label: '7:00 AM EST (12:00 UTC)', value: '12:00' },
  { label: '8:00 AM EST (13:00 UTC)', value: '13:00' },
  { label: '9:00 AM EST (14:00 UTC)', value: '14:00' },
  { label: '10:00 AM EST (15:00 UTC)', value: '15:00' },
  { label: '11:00 AM EST (16:00 UTC)', value: '16:00' },
  { label: '12:00 PM EST (17:00 UTC)', value: '17:00' },
  { label: '1:00 PM EST (18:00 UTC)', value: '18:00' },
  { label: '2:00 PM EST (19:00 UTC)', value: '19:00' },
  { label: '3:00 PM EST (20:00 UTC)', value: '20:00' },
  { label: '4:00 PM EST (21:00 UTC)', value: '21:00' },
  { label: '5:00 PM EST (22:00 UTC)', value: '22:00' },
  { label: '6:00 PM EST (23:00 UTC)', value: '23:00' },
  { label: '7:00 PM EST (00:00 UTC)', value: '00:00' },
  { label: '8:00 PM EST (01:00 UTC)', value: '01:00' },
  { label: '9:00 PM EST (02:00 UTC)', value: '02:00' },
  { label: '10:00 PM EST (03:00 UTC)', value: '03:00' },
  { label: '11:00 PM EST (04:00 UTC)', value: '04:00' },
];

module.exports = {
  raidCreationState,
  CHANNEL_PRESETS,
  TIME_PRESETS
};
