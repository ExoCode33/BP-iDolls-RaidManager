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

  // Professional header with ANSI colors
  let headerContent = '';
  headerContent += '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n';
  headerContent += '\u001b[1;37m           RAID EVENT\u001b[0m\n';
  headerContent += '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m';

  let description = `\n### ${raid.name}\n`;
  description += `> **Role:** <@&${raid.main_role_id}> (${raidLabel})\n`;
  description += `> **When:** <t:${timestamp}:F> • <t:${timestamp}:R>\n`;
  description += `> **Size:** ${raid.raid_size}-Player Raid\n`;
  description += `> **Status:** ${counts.total_registered}/${raid.raid_size} Registered\n\n`;

  // Tank section
  description += `### ${getRoleEmoji('Tank')} Tank ${counts.Tank.registered}/${raid.tank_slots}\n`;
  if (grouped.Tank.registered.length > 0) {
    grouped.Tank.registered.forEach((reg, idx) => {
      const isLast = idx === grouped.Tank.registered.length - 1;
      const prefix = isLast ? '  ╰─' : '  ├─';
      description += `${prefix} ${formatPlayerLine(reg)}\n`;
    });
  } else {
    description += `  ╰─ *Waiting for tanks...*\n`;
  }

  // Support section
  description += `\n### ${getRoleEmoji('Support')} Support ${counts.Support.registered}/${raid.support_slots}\n`;
  if (grouped.Support.registered.length > 0) {
    grouped.Support.registered.forEach((reg, idx) => {
      const isLast = idx === grouped.Support.registered.length - 1;
      const prefix = isLast ? '  ╰─' : '  ├─';
      description += `${prefix} ${formatPlayerLine(reg)}\n`;
    });
  } else {
    description += `  ╰─ *Waiting for supports...*\n`;
  }

  // DPS section
  description += `\n### ${getRoleEmoji('DPS')} DPS ${counts.DPS.registered}/${raid.dps_slots}\n`;
  if (grouped.DPS.registered.length > 0) {
    grouped.DPS.registered.forEach((reg, idx) => {
      const isLast = idx === grouped.DPS.registered.length - 1;
      const prefix = isLast ? '  ╰─' : '  ├─';
      description += `${prefix} ${formatPlayerLine(reg)}\n`;
    });
  } else {
    description += `  ╰─ *Waiting for DPS...*\n`;
  }

  // Waitlist section
  const allWaitlist = [
    ...grouped.Tank.waitlist,
    ...grouped.Support.waitlist,
    ...grouped.DPS.waitlist
  ].sort((a, b) => new Date(a.registered_at) - new Date(b.registered_at));

  if (allWaitlist.length > 0) {
    description += `\n### ⏳ Waitlist (${allWaitlist.length})\n`;
    allWaitlist.forEach((reg, idx) => {
      const isLast = idx === allWaitlist.length - 1;
      const prefix = isLast ? '  ╰─' : '  ├─';
      description += `${prefix} ${formatPlayerLine(reg, true)}\n`;
    });
  }

  // Professional footer with ANSI colors
  let footerContent = '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n';
  footerContent += '\u001b[1;30m          Click buttons to join\u001b[0m\n';
  footerContent += '\u001b[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m';

  const finalContent = '```ansi\n' + headerContent + '\n```' + description + '```ansi\n' + footerContent + '\n```';

  const embed = new EmbedBuilder()
    .setDescription(finalContent)
    .setColor(0xEB459E)
    .setFooter({ text: `Raid ID: ${raid.id} • iDolls Raid System` })
    .setTimestamp();

  return embed;
}

module.exports = {
  createRaidEmbed
};
