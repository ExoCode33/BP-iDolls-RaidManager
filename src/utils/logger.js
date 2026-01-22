const { EmbedBuilder, WebhookClient } = require('discord.js');

// ═══════════════════════════════════════════════════════════════
// PROFESSIONAL LOGGING SYSTEM
// Supports both Railway console logs and Discord webhook logs
// ═══════════════════════════════════════════════════════════════

class Logger {
  constructor() {
    this.logChannel = null;
    this.client = null;
    this.enableDiscordLogs = false;
  }

  /**
   * Initialize logger with Discord client
   * @param {Client} client - Discord.js client
   */
  async initialize(client) {
    this.client = client;
    
    if (process.env.LOG_CHANNEL_ID) {
      try {
        this.logChannel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
        this.enableDiscordLogs = true;
        console.log('✅ Discord logging initialized');
        
        // Send startup message
        await this.logSystem('Bot Started', 'Bot has successfully started and is ready to handle raids', 'success');
      } catch (error) {
        console.error('⚠️ Failed to initialize Discord logging:', error.message);
        console.log('ℹ️ Continuing with console-only logging');
      }
    } else {
      console.log('ℹ️ LOG_CHANNEL_ID not set - Discord logging disabled');
    }
  }

  /**
   * Format timestamp for Railway logs
   */
  getTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Get emoji for log level
   */
  getEmoji(level) {
    const emojis = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      debug: '🔍',
      raid: '⚔️',
      user: '👤',
      admin: '👑',
      database: '💾',
      system: '⚙️'
    };
    return emojis[level] || 'ℹ️';
  }

  /**
   * Get color for embed based on level
   */
  getColor(level) {
    const colors = {
      success: 0x00FF00,
      info: 0x3498DB,
      warning: 0xFFAA00,
      error: 0xFF0000,
      debug: 0x95A5A6,
      raid: 0xEC4899,
      user: 0x9B59B6,
      admin: 0xE74C3C,
      database: 0x3498DB,
      system: 0x2ECC71
    };
    return colors[level] || 0x3498DB;
  }

  /**
   * Log to Railway console
   */
  logToConsole(category, message, level = 'info', data = null) {
    const timestamp = this.getTimestamp();
    const emoji = this.getEmoji(level);
    
    let logMessage = `[${timestamp}] ${emoji} [${category.toUpperCase()}] ${message}`;
    
    if (data) {
      console.log(logMessage);
      console.log('   Data:', typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Send log to Discord channel
   */
  async logToDiscord(title, description, level = 'info', fields = null) {
    if (!this.enableDiscordLogs || !this.logChannel) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(this.getColor(level))
        .setTitle(`${this.getEmoji(level)} ${title}`)
        .setDescription(description)
        .setTimestamp();

      if (fields && Array.isArray(fields)) {
        embed.addFields(fields);
      }

      await this.logChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to send Discord log:', error.message);
    }
  }

  /**
   * Log system events
   */
  async logSystem(title, message, level = 'info', data = null) {
    this.logToConsole('SYSTEM', message, level, data);
    await this.logToDiscord(title, message, level);
  }

  /**
   * Log raid creation
   */
  async logRaidCreated(raid, creator) {
    const message = `Raid "${raid.name}" created by ${creator.tag}`;
    const data = {
      raidId: raid.id,
      name: raid.name,
      size: raid.raid_size,
      startTime: raid.start_time,
      channelId: raid.channel_id,
      creatorId: creator.id
    };

    this.logToConsole('RAID', message, 'raid', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '👥 Size', value: `${raid.raid_size}-player`, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '🕐 Start Time', value: `<t:${Math.floor(new Date(raid.start_time).getTime() / 1000)}:F>`, inline: false },
      { name: '📺 Channel', value: `<#${raid.channel_id}>`, inline: true },
      { name: '👤 Created By', value: `${creator.tag} (${creator.id})`, inline: true }
    ];

    await this.logToDiscord('Raid Created', `A new raid has been created`, 'raid', fields);
  }

  /**
   * Log raid posted
   */
  async logRaidPosted(raid, poster) {
    const message = `Raid "${raid.name}" posted by ${poster.tag}`;
    const data = {
      raidId: raid.id,
      name: raid.name,
      messageId: raid.message_id,
      posterId: poster.id
    };

    this.logToConsole('RAID', message, 'success', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '📺 Channel', value: `<#${raid.channel_id}>`, inline: false },
      { name: '👤 Posted By', value: `${poster.tag}`, inline: true },
      { name: '🔗 Message', value: `[Jump to Message](https://discord.com/channels/${poster.guild.id}/${raid.channel_id}/${raid.message_id})`, inline: true }
    ];

    await this.logToDiscord('Raid Posted', `Raid is now live and accepting registrations`, 'success', fields);
  }

  /**
   * Log player registration
   */
  async logPlayerRegistered(raid, registration, user, demotedPlayer = null) {
    const statusEmoji = {
      registered: '✅',
      assist: '🔹',
      waitlist: '⏳'
    };

    const message = `${user.tag} registered for "${raid.name}" as ${registration.role} (${registration.status})`;
    const data = {
      raidId: raid.id,
      userId: user.id,
      character: registration.ign,
      role: registration.role,
      status: registration.status,
      registrationType: registration.registration_type
    };

    this.logToConsole('REGISTRATION', message, 'user', data);

    const fields = [
      { name: '👤 Player', value: `${user.tag} (<@${user.id}>)`, inline: true },
      { name: '⚔️ Character', value: registration.ign, inline: true },
      { name: '🎭 Class', value: `${registration.class} - ${registration.subclass}`, inline: true },
      { name: '🛡️ Role', value: registration.role, inline: true },
      { name: '📊 Status', value: `${statusEmoji[registration.status]} ${registration.status}`, inline: true },
      { name: '📝 Type', value: registration.registration_type === 'assist' ? '🔹 Assist' : '✅ Register', inline: true },
      { name: '💪 Ability Score', value: registration.ability_score.toString(), inline: true },
      { name: '📋 Raid', value: `${raid.name} (#${raid.id})`, inline: true }
    ];

    // Add demotion info if applicable
    if (demotedPlayer) {
      fields.push({
        name: '🔽 Auto-Demoted',
        value: `${demotedPlayer.ign} was moved to waitlist to make room`,
        inline: false
      });
    }

    await this.logToDiscord(
      'Player Registered',
      `${user.tag} has registered for ${raid.name}`,
      'user',
      fields
    );
  }

  /**
   * Log player unregistration
   */
  async logPlayerUnregistered(raid, registration, user, wasPromoted = false) {
    const message = `${user.tag} unregistered from "${raid.name}"`;
    const data = {
      raidId: raid.id,
      userId: user.id,
      character: registration.ign,
      previousStatus: registration.status
    };

    this.logToConsole('REGISTRATION', message, 'warning', data);

    const fields = [
      { name: '👤 Player', value: `${user.tag} (<@${user.id}>)`, inline: true },
      { name: '⚔️ Character', value: registration.ign, inline: true },
      { name: '🛡️ Role', value: registration.role, inline: true },
      { name: '📋 Raid', value: `${raid.name} (#${raid.id})`, inline: true }
    ];

    if (wasPromoted) {
      fields.push({
        name: '🔼 Waitlist Promoted',
        value: 'A player from waitlist was automatically promoted',
        inline: false
      });
    }

    await this.logToDiscord(
      'Player Unregistered',
      `${user.tag} has left ${raid.name}`,
      'warning',
      fields
    );
  }

  /**
   * Log raid locked
   */
  async logRaidLocked(raid, admin, autoLock = false) {
    const message = autoLock 
      ? `Raid "${raid.name}" auto-locked (${process.env.AUTO_LOCK_HOURS || 0}h before start)`
      : `Raid "${raid.name}" locked by ${admin.tag}`;
    
    const data = {
      raidId: raid.id,
      autoLock,
      adminId: admin ? admin.id : 'auto'
    };

    this.logToConsole('RAID', message, 'warning', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '🔒 Locked By', value: autoLock ? 'Auto-Lock System' : admin.tag, inline: true },
      { name: '📺 Channel', value: `<#${raid.channel_id}>`, inline: true }
    ];

    await this.logToDiscord(
      '🔒 Raid Locked',
      `Registration has been closed for ${raid.name}`,
      'warning',
      fields
    );
  }

  /**
   * Log raid unlocked
   */
  async logRaidUnlocked(raid, admin) {
    const message = `Raid "${raid.name}" unlocked by ${admin.tag}`;
    const data = {
      raidId: raid.id,
      adminId: admin.id
    };

    this.logToConsole('RAID', message, 'success', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '🔓 Unlocked By', value: admin.tag, inline: true },
      { name: '📺 Channel', value: `<#${raid.channel_id}>`, inline: true }
    ];

    await this.logToDiscord(
      '🔓 Raid Unlocked',
      `Registration has been reopened for ${raid.name}`,
      'success',
      fields
    );
  }

  /**
   * Log raid completed
   */
  async logRaidCompleted(raid, admin, registrationCount, autoComplete = false) {
    const message = autoComplete
      ? `Raid "${raid.name}" auto-completed (2h after start)`
      : `Raid "${raid.name}" marked complete by ${admin.tag}`;
    
    const data = {
      raidId: raid.id,
      autoComplete,
      registrationCount,
      adminId: admin ? admin.id : 'auto'
    };

    this.logToConsole('RAID', message, 'success', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '👥 Total Players', value: registrationCount.toString(), inline: true },
      { name: '✅ Completed By', value: autoComplete ? 'Auto-Complete System' : admin.tag, inline: true },
      { name: '🕐 Started At', value: `<t:${Math.floor(new Date(raid.start_time).getTime() / 1000)}:F>`, inline: false }
    ];

    await this.logToDiscord(
      '✅ Raid Completed',
      `${raid.name} has been marked as completed`,
      'success',
      fields
    );
  }

  /**
   * Log raid cancelled
   */
  async logRaidCancelled(raid, admin, registrationCount) {
    const message = `Raid "${raid.name}" cancelled by ${admin.tag}`;
    const data = {
      raidId: raid.id,
      registrationCount,
      adminId: admin.id
    };

    this.logToConsole('RAID', message, 'error', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '👥 Affected Players', value: registrationCount.toString(), inline: true },
      { name: '❌ Cancelled By', value: admin.tag, inline: true }
    ];

    await this.logToDiscord(
      '❌ Raid Cancelled',
      `${raid.name} has been cancelled`,
      'error',
      fields
    );
  }

  /**
   * Log roster changes (promote/demote)
   */
  async logRosterChange(raid, player, admin, action, fromStatus, toStatus) {
    const actionEmoji = action === 'promote' ? '🔼' : '🔽';
    const message = `${admin.tag} ${action}d ${player.ign} in "${raid.name}" (${fromStatus} → ${toStatus})`;
    
    const data = {
      raidId: raid.id,
      playerId: player.user_id,
      character: player.ign,
      action,
      fromStatus,
      toStatus,
      adminId: admin.id
    };

    this.logToConsole('ROSTER', message, 'admin', data);

    const fields = [
      { name: '👤 Player', value: `${player.ign} (<@${player.user_id}>)`, inline: true },
      { name: '🔄 Action', value: `${actionEmoji} ${action.toUpperCase()}`, inline: true },
      { name: '📊 Change', value: `${fromStatus} → ${toStatus}`, inline: true },
      { name: '📋 Raid', value: `${raid.name} (#${raid.id})`, inline: true },
      { name: '👑 By Admin', value: admin.tag, inline: true }
    ];

    await this.logToDiscord(
      `${actionEmoji} Roster ${action === 'promote' ? 'Promotion' : 'Demotion'}`,
      `Player status changed in ${raid.name}`,
      'admin',
      fields
    );
  }

  /**
   * Log manual player removal
   */
  async logPlayerRemoved(raid, player, admin) {
    const message = `${admin.tag} removed ${player.ign} from "${raid.name}"`;
    const data = {
      raidId: raid.id,
      playerId: player.user_id,
      character: player.ign,
      adminId: admin.id
    };

    this.logToConsole('ROSTER', message, 'admin', data);

    const fields = [
      { name: '👤 Player', value: `${player.ign} (<@${player.user_id}>)`, inline: true },
      { name: '🛡️ Role', value: player.role, inline: true },
      { name: '📊 Status', value: player.status, inline: true },
      { name: '📋 Raid', value: `${raid.name} (#${raid.id})`, inline: true },
      { name: '👑 Removed By', value: admin.tag, inline: true }
    ];

    await this.logToDiscord(
      '❌ Player Removed',
      `Player manually removed from ${raid.name}`,
      'admin',
      fields
    );
  }

  /**
   * Log reminder sent
   */
  async logReminderSent(raid, minutesBefore) {
    const message = `Reminder sent for "${raid.name}" (${minutesBefore} min before start)`;
    const data = {
      raidId: raid.id,
      minutesBefore
    };

    this.logToConsole('REMINDER', message, 'info', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '⏰ Time Before', value: `${minutesBefore} minutes`, inline: true },
      { name: '📺 Channel', value: `<#${raid.channel_id}>`, inline: true }
    ];

    await this.logToDiscord(
      '🔔 Reminder Sent',
      `Raid reminder has been sent to participants`,
      'info',
      fields
    );
  }

  /**
   * Log database errors
   */
  async logDatabaseError(operation, error, context = null) {
    const message = `Database error during ${operation}: ${error.message}`;
    const data = {
      operation,
      error: error.message,
      stack: error.stack,
      context
    };

    this.logToConsole('DATABASE', message, 'error', data);

    const fields = [
      { name: '⚠️ Operation', value: operation, inline: true },
      { name: '❌ Error', value: error.message.substring(0, 1000), inline: false }
    ];

    if (context) {
      fields.push({
        name: '🔍 Context',
        value: typeof context === 'object' ? JSON.stringify(context).substring(0, 1000) : context.substring(0, 1000),
        inline: false
      });
    }

    await this.logToDiscord(
      '💾 Database Error',
      `An error occurred during database operation`,
      'error',
      fields
    );
  }

  /**
   * Log general errors
   */
  async logError(category, message, error, context = null) {
    const data = {
      message,
      error: error.message,
      stack: error.stack,
      context
    };

    this.logToConsole(category, message, 'error', data);

    const fields = [
      { name: '❌ Error', value: error.message.substring(0, 1000), inline: false }
    ];

    if (context) {
      fields.push({
        name: '🔍 Context',
        value: typeof context === 'object' ? JSON.stringify(context).substring(0, 1000) : context.substring(0, 1000),
        inline: false
      });
    }

    await this.logToDiscord(
      `Error: ${category}`,
      message,
      'error',
      fields
    );
  }

  /**
   * Log config changes
   */
  async logConfigChange(key, oldValue, newValue, admin) {
    const message = `Config "${key}" changed by ${admin.tag}: ${oldValue} → ${newValue}`;
    const data = {
      key,
      oldValue,
      newValue,
      adminId: admin.id
    };

    this.logToConsole('CONFIG', message, 'admin', data);

    const fields = [
      { name: '⚙️ Setting', value: key, inline: true },
      { name: '📝 Old Value', value: oldValue || 'not set', inline: true },
      { name: '✅ New Value', value: newValue, inline: true },
      { name: '👑 Changed By', value: admin.tag, inline: true }
    ];

    await this.logToDiscord(
      '⚙️ Configuration Changed',
      `Bot configuration has been updated`,
      'admin',
      fields
    );
  }

  /**
   * Log raid summary (called when raid completes)
   */
  async logRaidSummary(raid, registrations) {
    const registered = registrations.filter(r => r.status === 'registered' || r.status === 'assist');
    const waitlist = registrations.filter(r => r.status === 'waitlist');
    
    const roleBreakdown = {
      Tank: registered.filter(r => r.role === 'Tank').length,
      Support: registered.filter(r => r.role === 'Support').length,
      DPS: registered.filter(r => r.role === 'DPS').length
    };

    const assistCount = registrations.filter(r => r.registration_type === 'assist').length;

    const message = `Raid summary for "${raid.name}": ${registered.length} registered, ${waitlist.length} waitlist`;
    const data = {
      raidId: raid.id,
      totalRegistered: registered.length,
      totalWaitlist: waitlist.length,
      roleBreakdown,
      assistCount
    };

    this.logToConsole('RAID SUMMARY', message, 'raid', data);

    const fields = [
      { name: '📋 Raid Name', value: raid.name, inline: true },
      { name: '🔢 Raid ID', value: `#${raid.id}`, inline: true },
      { name: '👥 Size', value: `${raid.raid_size}-player`, inline: true },
      { name: '✅ Registered', value: `${registered.length}/${raid.raid_size}`, inline: true },
      { name: '⏳ Waitlist', value: waitlist.length.toString(), inline: true },
      { name: '🔹 Assist', value: assistCount.toString(), inline: true },
      { name: '🛡️ Tanks', value: `${roleBreakdown.Tank}/${raid.tank_slots}`, inline: true },
      { name: '💚 Supports', value: `${roleBreakdown.Support}/${raid.support_slots}`, inline: true },
      { name: '⚔️ DPS', value: `${roleBreakdown.DPS}/${raid.dps_slots}`, inline: true },
      { name: '🕐 Started', value: `<t:${Math.floor(new Date(raid.start_time).getTime() / 1000)}:F>`, inline: false }
    ];

    // Add top participants if any
    if (registered.length > 0) {
      const topPlayers = registered.slice(0, 5).map(r => `• ${r.ign} (${r.role})`).join('\n');
      fields.push({
        name: '🏆 Participants',
        value: topPlayers + (registered.length > 5 ? `\n... and ${registered.length - 5} more` : ''),
        inline: false
      });
    }

    await this.logToDiscord(
      '📊 Raid Summary',
      `Final statistics for ${raid.name}`,
      'raid',
      fields
    );
  }
}

// Export singleton instance
const logger = new Logger();
module.exports = logger;
