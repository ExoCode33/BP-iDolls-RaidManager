const { EmbedBuilder } = require('discord.js');
const { getRoleEmoji, formatPlayerLine, getRaidSlotLabel } = require('./helpers');

async function createRaidEmbed(raid, registrations, counts) {
  const timestamp = Math.floor(new Date(raid.start_time).getTime() / 1000);
  const raidLabel = getRaidSlotLabel(raid.raid_slot);
  
  // Group registrations by role and status
  const grouped = {
    Tank: { registered: [], waitlist: [] },
    DPS: { registered: [], waitlist: [] },
    Support: { registered: [], waitlist: [] }
  };

  registrations.forEach(reg => {
    grouped[reg.role][reg.status].push(reg);
  });

  // Build description
  let description = `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  description += `📅 ${raid.name}\n`;
  description += `👥 <@&${raid.main_role_id}> (${raidLabel})\n`;
  description += `🕐 <t:${timestamp}:F>\n`;
  description += `Raid Size: ${raid.raid_size}-Player (${counts.total_registered}/${raid.raid_size})\n\n`;

  // Tank section
  description += `${getRoleEmoji('Tank')} **Tank (${counts.Tank.registered}/${raid.tank_slots})**\n`;
  if (grouped.Tank.registered.length > 0) {
    grouped.Tank.registered.forEach((reg, idx) => {
      const prefix = idx === grouped.Tank.registered.length - 1 ? '└─' : '├─';
      description += `${prefix} ${formatPlayerLine(reg)}\n`;
    });
  } else {
    description += `└─ *No tanks yet*\n`;
  }
  description += '\n';

  // Support section
  description += `${getRoleEmoji('Support')} **Support (${counts.Support.registered}/${raid.support_slots})**\n`;
  if (grouped.Support.registered.length > 0) {
    grouped.Support.registered.forEach((reg, idx) => {
      const prefix = idx === grouped.Support.registered.length - 1 ? '└─' : '├─';
      description += `${prefix} ${formatPlayerLine(reg)}\n`;
    });
  } else {
    description += `└─ *No supports yet*\n`;
  }
  description += '\n';

  // DPS section
  description += `${getRoleEmoji('DPS')} **DPS (${counts.DPS.registered}/${raid.dps_slots})**\n`;
  if (grouped.DPS.registered.length > 0) {
    grouped.DPS.registered.forEach((reg, idx) => {
      const prefix = idx === grouped.DPS.registered.length - 1 ? '└─' : '├─';
      description += `${prefix} ${formatPlayerLine(reg)}\n`;
    });
  } else {
    description += `└─ *No DPS yet*\n`;
  }

  // Waitlist section
  const allWaitlist = [
    ...grouped.Tank.waitlist,
    ...grouped.Support.waitlist,
    ...grouped.DPS.waitlist
  ].sort((a, b) => new Date(a.registered_at) - new Date(b.registered_at));

  if (allWaitlist.length > 0) {
    description += `\n⏳ **Waitlist (${allWaitlist.length})**\n`;
    allWaitlist.forEach((reg, idx) => {
      const prefix = idx === allWaitlist.length - 1 ? '└─' : '├─';
      description += `${prefix} ${formatPlayerLine(reg, true)}\n`;
    });
  }

  description += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor(0x5865F2)
    .setFooter({ text: `Raid ID: ${raid.id}` });

  return embed;
}

module.exports = {
  createRaidEmbed
};
