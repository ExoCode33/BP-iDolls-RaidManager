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

// ✅ COMPLETELY REVISED: UTC-first time selection
// The dropdown will show times in pure UTC format
// Descriptions will be dynamically generated to show EST equivalent with proper date
//
// Example:
// - User selects date: Jan 25, 2026
// - Dropdown shows: "02:00 UTC" with description "Jan 24, 9:00 PM EST"
// - Result: Jan 25 at 2 AM UTC = Jan 24 at 9 PM EST

function getTimePresetsWithDescriptions(selectedDate) {
  const baseDate = new Date(selectedDate + 'T00:00:00Z');
  
  const times = [];
  
  for (let hour = 0; hour < 24; hour++) {
    const utcHour = hour.toString().padStart(2, '0');
    const utcTime = `${utcHour}:00`;
    
    // Calculate EST equivalent (UTC - 5 hours)
    const utcDateTime = new Date(`${selectedDate}T${utcTime}:00Z`);
    const estDateTime = new Date(utcDateTime.getTime() - (5 * 60 * 60 * 1000));
    
    // Format EST time
    const estMonth = estDateTime.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const estDay = estDateTime.getUTCDate();
    const estHour = estDateTime.getUTCHours();
    const estMinute = estDateTime.getUTCMinutes();
    const estPeriod = estHour >= 12 ? 'PM' : 'AM';
    const estHour12 = estHour % 12 || 12;
    const estTime = `${estHour12}:${estMinute.toString().padStart(2, '0')} ${estPeriod}`;
    
    const description = `${estMonth} ${estDay}, ${estTime} EST`;
    
    times.push({
      label: `${utcTime} UTC`,
      value: utcTime,
      description: description,
      emoji: '🕐'
    });
  }
  
  return times;
}

// Legacy presets for backwards compatibility (if needed elsewhere)
const TIME_PRESETS = [
  { label: '00:00 UTC', value: '00:00' },
  { label: '01:00 UTC', value: '01:00' },
  { label: '02:00 UTC', value: '02:00' },
  { label: '03:00 UTC', value: '03:00' },
  { label: '04:00 UTC', value: '04:00' },
  { label: '05:00 UTC', value: '05:00' },
  { label: '06:00 UTC', value: '06:00' },
  { label: '07:00 UTC', value: '07:00' },
  { label: '08:00 UTC', value: '08:00' },
  { label: '09:00 UTC', value: '09:00' },
  { label: '10:00 UTC', value: '10:00' },
  { label: '11:00 UTC', value: '11:00' },
  { label: '12:00 UTC', value: '12:00' },
  { label: '13:00 UTC', value: '13:00' },
  { label: '14:00 UTC', value: '14:00' },
  { label: '15:00 UTC', value: '15:00' },
  { label: '16:00 UTC', value: '16:00' },
  { label: '17:00 UTC', value: '17:00' },
  { label: '18:00 UTC', value: '18:00' },
  { label: '19:00 UTC', value: '19:00' },
  { label: '20:00 UTC', value: '20:00' },
  { label: '21:00 UTC', value: '21:00' },
  { label: '22:00 UTC', value: '22:00' },
  { label: '23:00 UTC', value: '23:00' }
];

module.exports = {
  raidCreationState,
  CHANNEL_PRESETS,
  TIME_PRESETS,
  getTimePresetsWithDescriptions
};
