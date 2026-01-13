const { EmbedBuilder } = require('discord.js');
const { getRoleEmoji, formatPlayerLine, getRaidSlotLabel, inferRole } = require('./helpers');

async function createRaidEmbed(raid, registrations, counts) {
  const timestamp = Math.floor(new Date(raid.start_time).getTime() / 1000);
  const raidLabel = getRaidSlotLabel(raid.raid_slot);
  
  const grouped = {
    Tank: { registered: [], waitlist: [] },
    DPS: { registered: [], waitlist: [] },
    Support: { registered: [], waitlist: [] }
  };

  registrations.forEach(reg => {
    const correctRole = inferRole(reg.class);
    grouped[correctRole][reg.status].push(reg);
  });

  // Build the content inside ANSI code block for pink lines
  let ansiContent = '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n';
  
  let description = `📅 **${raid.name}**\n`;
  description += `👥 <@&${raid.main_role_id}> (${raidLabel})\n`;
  description += `🕐 <t:${timestamp}:F>\n`;
  description += `Raid Size: ${raid.raid_size}-Player (${counts.total_registered}/${raid.raid_size})\n\n`;

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

  description += `${getRoleEmoji('DPS')} **DPS (${counts.DPS.registered}/${raid.dps_slots})**\n`;
  if (grouped.DPS.registered.length > 0) {
    grouped.DPS.registered.forEach((reg, idx) => {
      const prefix = idx === grouped.DPS.registered.length - 1 ? '└─' : '├─';
      description += `${prefix} ${formatPlayerLine(reg)}\n`;
    });
  } else {
    description += `└─ *No DPS yet*\n`;
  }

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

  const finalContent = '```ansi\n' + ansiContent + '```\n' + description + '\n```ansi\n\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n```';

  const embed = new EmbedBuilder()
    .setDescription(finalContent)
    .setColor(0xEB459E)
    .setFooter({ text: `Raid ID: ${raid.id}` });

  return embed;
}

module.exports = {
  createRaidEmbed
};
