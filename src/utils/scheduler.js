const cron = require('node-cron');
const { getActiveRaids, markRaidReminded, updateRaidStatus, lockRaid, updateRaid, getRaidRegistrations } = require('../database/queries');
const logger = require('./logger');

// Track last check time to detect missed reminders
let lastCheckTime = new Date();

// ✅ NEW - Configurable reminder hours (default 0.5 hours = 30 minutes)
const REMINDER_HOURS = parseFloat(process.env.REMINDER_HOURS || '0.5');
const REMINDER_MINUTES = REMINDER_HOURS * 60;
const REMINDER_MS = REMINDER_MINUTES * 60 * 1000;

// ✅ NEW - Auto-lock configuration (in hours before raid start)
// Set to 0 to disable auto-lock
const AUTO_LOCK_HOURS = parseFloat(process.env.AUTO_LOCK_HOURS || '0');

function startReminderScheduler(client) {
  console.log('🔄 Initializing reminder scheduler...');
  
  // Run every minute - handles reminders, auto-lock, AND cleanup
  cron.schedule('* * * * *', async () => {
    if (process.env.REMINDER !== 'true') return;

    const currentTime = new Date();
    const timeSinceLastCheck = currentTime - lastCheckTime;
    
    // Log if we missed checks (bot was down or scheduler failed)
    if (timeSinceLastCheck > 120000) { // More than 2 minutes
      console.warn(`⚠️ Reminder scheduler missed ${Math.floor(timeSinceLastCheck / 60000)} minutes of checks`);
    }

    try {
      // ========== AUTO-LOCK ==========
      if (AUTO_LOCK_HOURS > 0) {
        const activeRaids = await getActiveRaids();
        const raidsToLock = activeRaids.filter(raid => {
          // Skip already locked raids
          if (raid.locked) return false;
          
          // Skip raids that haven't been posted yet
          if (!raid.message_id) {
            return false;
          }
          
          const raidStartTime = new Date(raid.start_time);
          const timeUntilRaid = raidStartTime - currentTime;
          const hoursUntilRaid = timeUntilRaid / (60 * 60 * 1000);
          
          // Lock if within the auto-lock window
          return hoursUntilRaid <= AUTO_LOCK_HOURS && hoursUntilRaid > 0;
        });

        if (raidsToLock.length > 0) {
          console.log(`🔒 Auto-locking ${raidsToLock.length} raid(s)...`);
        }

        for (const raid of raidsToLock) {
          try {
            const raidStartTime = new Date(raid.start_time);
            const timeUntilRaid = raidStartTime - currentTime;
            const hoursUntilRaid = (timeUntilRaid / (60 * 60 * 1000)).toFixed(1);
            
            console.log(`🔒 Auto-locking raid ${raid.id}: "${raid.name}" (starts in ${hoursUntilRaid}h)`);
            
            // Lock the raid in database
            await lockRaid(raid.id);
            
            // Update the Discord message to show locked state
            if (raid.message_id && raid.channel_id) {
              try {
                const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');
                
                const channel = await client.channels.fetch(raid.channel_id);
                const message = await channel.messages.fetch(raid.message_id);
                
                const registrations = await getRaidRegistrations(raid.id);
                const embed = await createRaidEmbed({ ...raid, locked: true }, registrations);
                const buttons = createRaidButtons(raid.id, true); // true = locked
                
                await message.edit({ embeds: [embed], components: [buttons] });
                
                // Send notification to raid channel with role ping
                const timestamp = Math.floor(raidStartTime.getTime() / 1000);
                const lockNotification = await channel.send({
                  content: `<@&${raid.main_role_id}> Thank you for signing up! **${raid.name}** is locked and ready! We start <t:${timestamp}:R> - see you soon! ✨`,
                  allowedMentions: { 
                    roles: [raid.main_role_id] 
                  }
                });
                
                // Save lock notification message ID
                await updateRaid(raid.id, { lock_notification_message_id: lockNotification.id });
                
                console.log(`✅ Auto-locked raid ${raid.id} and updated message`);
                
                // Log auto-lock
                await logger.logRaidLocked(raid, { tag: 'System', id: 'auto' }, true);
              } catch (err) {
                console.error(`Failed to update message for locked raid ${raid.id}:`, err);
              }
            }
            
          } catch (error) {
            console.error(`❌ Failed to auto-lock raid ${raid.id}:`, error);
          }
        }
      }

      // ========== REMINDERS ==========
      // Get raids that should receive reminders
      const activeRaids = await getActiveRaids();
      const upcomingRaids = activeRaids.filter(raid => {
        if (raid.reminded_30m) return false; // Already reminded
        
        const raidStartTime = new Date(raid.start_time);
        const timeUntilRaid = raidStartTime - currentTime;
        
        // Check if within reminder window
        const lowerBound = REMINDER_MS - (5 * 60 * 1000); // 5 min before
        const upperBound = REMINDER_MS + (5 * 60 * 1000); // 5 min after
        
        return timeUntilRaid >= lowerBound && timeUntilRaid <= upperBound && timeUntilRaid > 0;
      });

      if (upcomingRaids.length > 0) {
        console.log(`📋 Processing ${upcomingRaids.length} upcoming raid reminder(s)...`);
      }

      for (const raid of upcomingRaids) {
        try {
          // Calculate time until raid starts
          const raidStartTime = new Date(raid.start_time);
          const timeUntilRaid = raidStartTime - currentTime;
          const minutesUntilRaid = Math.floor(timeUntilRaid / 60000);
          
          const channel = await client.channels.fetch(raid.channel_id).catch(err => {
            console.error(`Failed to fetch channel ${raid.channel_id}:`, err);
            return null;
          });
          
          if (!channel) {
            console.error(`❌ Channel not found for raid ${raid.id}`);
            await markRaidReminded(raid.id); // Mark as reminded to prevent retry
            continue;
          }

          const timestamp = Math.floor(new Date(raid.start_time).getTime() / 1000);

          const reminderMessage = await channel.send(
            `<@&${raid.main_role_id}> It's almost showtime! "${raid.name}" starts <t:${timestamp}:R> ✨`
          );

          // Store reminder message ID for later deletion
          await updateRaid(raid.id, { reminder_message_id: reminderMessage.id });

          await markRaidReminded(raid.id);
          console.log(`✅ Sent reminder for raid ${raid.id}: "${raid.name}" (${minutesUntilRaid} min before start)`);

          // Log reminder
          await logger.logReminderSent(raid, minutesUntilRaid);

        } catch (error) {
          console.error(`❌ Failed to send reminder for raid ${raid.id}:`, error);
          
          // Check if it's a Discord API error (should mark as reminded to prevent spam)
          if (error.code === 10003 || error.code === 50001 || error.code === 50013) {
            console.log(`⚠️ Marking raid ${raid.id} as reminded due to permission/access error`);
            await markRaidReminded(raid.id).catch(err => {
              console.error(`Failed to mark raid ${raid.id} as reminded:`, err);
            });
          }
        }
      }

      // ========== AUTO CLEANUP - IMMEDIATE MESSAGE DELETION ==========
      // Delete reminder and lock messages as soon as raid time passes
      const allActiveRaids = await getActiveRaids();
      const raidsJustStarted = allActiveRaids.filter(raid => {
        const raidStartTime = new Date(raid.start_time);
        const timeSinceStart = currentTime - raidStartTime;
        
        // Raid has started (time is in the past) but hasn't been fully cleaned up yet
        // AND still has messages to delete
        return timeSinceStart > 0 && 
               timeSinceStart <= 2 * 60 * 60 * 1000 &&
               (raid.lock_notification_message_id || raid.reminder_message_id);
      });

      if (raidsJustStarted.length > 0) {
        console.log(`🧹 Checking ${raidsJustStarted.length} started raid(s) for message cleanup...`);
      }

      for (const raid of raidsJustStarted) {
        try {
          let messagesDeleted = false;
          
          // Delete lock notification message immediately when raid starts
          if (raid.lock_notification_message_id && raid.channel_id) {
            try {
              const channel = await client.channels.fetch(raid.channel_id);
              const lockMessage = await channel.messages.fetch(raid.lock_notification_message_id);
              await lockMessage.delete();
              await updateRaid(raid.id, { lock_notification_message_id: null });
              console.log(`✅ Deleted lock notification for started raid ${raid.id}`);
              messagesDeleted = true;
            } catch (err) {
              if (err.code === 10008) {
                // Message already deleted
                await updateRaid(raid.id, { lock_notification_message_id: null });
              } else {
                console.error(`Failed to delete lock notification for raid ${raid.id}:`, err);
              }
            }
          }

          // Delete reminder message immediately when raid starts
          if (raid.reminder_message_id && raid.channel_id) {
            try {
              const channel = await client.channels.fetch(raid.channel_id);
              const reminderMessage = await channel.messages.fetch(raid.reminder_message_id);
              await reminderMessage.delete();
              await updateRaid(raid.id, { reminder_message_id: null });
              console.log(`✅ Deleted reminder message for started raid ${raid.id}`);
              messagesDeleted = true;
            } catch (err) {
              if (err.code === 10008) {
                // Message already deleted
                await updateRaid(raid.id, { reminder_message_id: null });
              } else {
                console.error(`Failed to delete reminder message for raid ${raid.id}:`, err);
              }
            }
          }
          
          if (!messagesDeleted) {
            // Clear message IDs even if we couldn't delete (prevents retries)
            await updateRaid(raid.id, { 
              lock_notification_message_id: null,
              reminder_message_id: null 
            });
          }
          
        } catch (error) {
          console.error(`❌ Failed to clean messages for started raid ${raid.id}:`, error);
        }
      }

      // ========== AUTO CLEANUP - FULL CLEANUP AFTER 2 HOURS ==========
      // Complete cleanup 2 hours after raid starts (delete embed, remove roles, mark completed)
      const raidsToCleanup = allActiveRaids.filter(raid => {
        const raidStartTime = new Date(raid.start_time);
        const timeSinceStart = currentTime - raidStartTime;
        
        // Cleanup raids that started more than 2 hours ago
        return timeSinceStart > 2 * 60 * 60 * 1000;
      });

      if (raidsToCleanup.length > 0) {
        console.log(`🧹 Auto-cleaning ${raidsToCleanup.length} past raid(s)...`);
      }

      for (const raid of raidsToCleanup) {
        try {
          const raidStartTime = new Date(raid.start_time);
          const hoursAgo = Math.floor((currentTime - raidStartTime) / (60 * 60 * 1000));
          
          console.log(`🧹 Auto-completing raid ${raid.id}: "${raid.name}" (started ${hoursAgo}h ago)`);
          
          // Get registrations BEFORE updating status
          const registrations = await getRaidRegistrations(raid.id);
          
          // Update status to completed
          await updateRaidStatus(raid.id, 'completed');
          
          // Remove Discord role from all participants
          try {
            const guild = client.guilds.cache.first(); // Get the guild
            if (guild) {
              const role = guild.roles.cache.get(raid.main_role_id);
              
              if (role) {
                const members = role.members;
                for (const [memberId, member] of members) {
                  try {
                    await member.roles.remove(role);
                  } catch (err) {
                    console.error(`Failed to remove role from ${memberId}:`, err);
                  }
                }
                console.log(`✅ Removed role from ${members.size} members`);
              }
            }
          } catch (err) {
            console.error(`Failed to remove roles for raid ${raid.id}:`, err);
          }
          
          // Delete the raid embed message (2 hours after start)
          if (raid.message_id && raid.channel_id) {
            try {
              const channel = await client.channels.fetch(raid.channel_id);
              const message = await channel.messages.fetch(raid.message_id);
              await message.delete();
              console.log(`✅ Deleted embed message for raid ${raid.id}`);
            } catch (err) {
              console.error(`Failed to delete embed message for raid ${raid.id}:`, err);
            }
          }
          
          // Clean up any remaining notification messages (in case they weren't deleted earlier)
          if (raid.lock_notification_message_id && raid.channel_id) {
            try {
              const channel = await client.channels.fetch(raid.channel_id);
              const lockMessage = await channel.messages.fetch(raid.lock_notification_message_id);
              await lockMessage.delete();
              console.log(`✅ Deleted remaining lock notification for raid ${raid.id}`);
            } catch (err) {
              // Ignore if already deleted
              if (err.code !== 10008) {
                console.error(`Failed to delete lock notification for raid ${raid.id}:`, err);
              }
            }
          }

          if (raid.reminder_message_id && raid.channel_id) {
            try {
              const channel = await client.channels.fetch(raid.channel_id);
              const reminderMessage = await channel.messages.fetch(raid.reminder_message_id);
              await reminderMessage.delete();
              console.log(`✅ Deleted remaining reminder message for raid ${raid.id}`);
            } catch (err) {
              // Ignore if already deleted
              if (err.code !== 10008) {
                console.error(`Failed to delete reminder message for raid ${raid.id}:`, err);
              }
            }
          }
          
          console.log(`✅ Auto-completed raid ${raid.id}: "${raid.name}"`);
          
          // Log auto-complete with summary
          await logger.logRaidSummary(raid, registrations);
          await logger.logRaidCompleted(raid, { tag: 'System', id: 'auto' }, registrations.length, true);
          
        } catch (error) {
          console.error(`❌ Failed to auto-complete raid ${raid.id}:`, error);
        }
      }

      lastCheckTime = currentTime;

    } catch (error) {
      console.error('❌ Reminder scheduler error:', error);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('⚠️ Database connection error in reminder scheduler');
      }
    }
  });

  // ✅ Catch-up check on startup
  setTimeout(async () => {
    try {
      console.log('🔄 Running startup checks...');
      
      // === Reminder catch-up ===
      const activeRaids = await getActiveRaids();
      const now = new Date();
      
      const upcomingRaids = activeRaids.filter(raid => {
        if (raid.reminded_30m) return false;
        
        const raidStartTime = new Date(raid.start_time);
        const timeUntilRaid = raidStartTime - now;
        
        const lowerBound = REMINDER_MS - (15 * 60 * 1000); // Extended window
        const upperBound = REMINDER_MS + (15 * 60 * 1000);
        
        return timeUntilRaid >= lowerBound && timeUntilRaid <= upperBound && timeUntilRaid > 0;
      });
      
      if (upcomingRaids.length > 0) {
        console.log(`📋 Found ${upcomingRaids.length} raid(s) that may have missed reminders during downtime`);
        
        for (const raid of upcomingRaids) {
          const raidStartTime = new Date(raid.start_time);
          const timeUntilRaid = raidStartTime - now;
          const minutesUntilRaid = Math.floor(timeUntilRaid / 60000);
          
          console.log(`📨 Sending catch-up reminder for raid ${raid.id}: "${raid.name}"`);
          
          try {
            const channel = await client.channels.fetch(raid.channel_id);
            const timestamp = Math.floor(raidStartTime.getTime() / 1000);
            
            await channel.send(
              `<@&${raid.main_role_id}> 🔔 Your raid "${raid.name}" starts <t:${timestamp}:R>!`
            );
            
            await markRaidReminded(raid.id);
            console.log(`✅ Sent catch-up reminder for raid ${raid.id}`);
          } catch (err) {
            console.error(`Failed to send catch-up reminder for raid ${raid.id}:`, err);
          }
        }
      } else {
        console.log('✅ No missed reminders to catch up on');
      }

      // === Auto-lock catch-up ===
      if (AUTO_LOCK_HOURS > 0) {
        console.log('🔄 Checking for raids that should be locked...');
        const allActiveRaids = await getActiveRaids();
        
        const raidsNeedingLock = allActiveRaids.filter(raid => {
          if (raid.locked) return false;
          if (!raid.message_id) return false;
          
          const raidStartTime = new Date(raid.start_time);
          const timeUntilRaid = raidStartTime - now;
          const hoursUntilRaid = timeUntilRaid / (60 * 60 * 1000);
          
          return hoursUntilRaid <= AUTO_LOCK_HOURS && hoursUntilRaid > 0;
        });

        if (raidsNeedingLock.length > 0) {
          console.log(`🔒 Found ${raidsNeedingLock.length} raid(s) that should be locked`);
          
          for (const raid of raidsNeedingLock) {
            try {
              await lockRaid(raid.id);
              console.log(`✅ Locked raid ${raid.id} during startup`);
              
              // Update message if exists
              if (raid.message_id && raid.channel_id) {
                const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');
                
                const channel = await client.channels.fetch(raid.channel_id);
                const message = await channel.messages.fetch(raid.message_id);
                
                const registrations = await getRaidRegistrations(raid.id);
                const embed = await createRaidEmbed({ ...raid, locked: true }, registrations);
                const buttons = createRaidButtons(raid.id, true);
                
                await message.edit({ embeds: [embed], components: [buttons] });
              }
            } catch (err) {
              console.error(`Failed to lock raid ${raid.id}:`, err);
            }
          }
        } else {
          console.log('✅ No raids need to be locked');
        }
      }

      // === Cleanup old raids ===
      console.log('🔄 Running startup cleanup check...');
      const allActiveRaids = await getActiveRaids();
      
      // Check for raids that have started but aren't fully cleaned up yet
      const startedRaids = allActiveRaids.filter(raid => {
        const raidStartTime = new Date(raid.start_time);
        const timeSinceStart = now - raidStartTime;
        return timeSinceStart > 0 && timeSinceStart <= 2 * 60 * 60 * 1000;
      });

      if (startedRaids.length > 0) {
        console.log(`🧹 Found ${startedRaids.length} started raid(s) with messages to delete`);
        
        for (const raid of startedRaids) {
          try {
            // Delete lock notification immediately
            if (raid.lock_notification_message_id && raid.channel_id) {
              try {
                const channel = await client.channels.fetch(raid.channel_id);
                const lockMessage = await channel.messages.fetch(raid.lock_notification_message_id);
                await lockMessage.delete();
                await updateRaid(raid.id, { lock_notification_message_id: null });
                console.log(`✅ Deleted lock notification for raid ${raid.id}`);
              } catch (err) {
                if (err.code === 10008) {
                  await updateRaid(raid.id, { lock_notification_message_id: null });
                }
              }
            }

            // Delete reminder immediately
            if (raid.reminder_message_id && raid.channel_id) {
              try {
                const channel = await client.channels.fetch(raid.channel_id);
                const reminderMessage = await channel.messages.fetch(raid.reminder_message_id);
                await reminderMessage.delete();
                await updateRaid(raid.id, { reminder_message_id: null });
                console.log(`✅ Deleted reminder for raid ${raid.id}`);
              } catch (err) {
                if (err.code === 10008) {
                  await updateRaid(raid.id, { reminder_message_id: null });
                }
              }
            }
          } catch (err) {
            console.error(`Failed to cleanup messages for raid ${raid.id}:`, err);
          }
        }
      }
      
      // Check for raids that need full cleanup (2+ hours after start)
      const oldRaids = allActiveRaids.filter(raid => {
        const raidStartTime = new Date(raid.start_time);
        const timeSinceStart = now - raidStartTime;
        return timeSinceStart > 2 * 60 * 60 * 1000;
      });

      if (oldRaids.length > 0) {
        console.log(`🧹 Found ${oldRaids.length} old raid(s) to clean up`);
        for (const raid of oldRaids) {
          try {
            await updateRaidStatus(raid.id, 'completed');
            
            // Remove roles
            const guild = client.guilds.cache.first();
            if (guild) {
              const role = guild.roles.cache.get(raid.main_role_id);
              if (role) {
                const members = role.members;
                for (const [memberId, member] of members) {
                  try {
                    await member.roles.remove(role);
                  } catch (err) {
                    console.error(`Failed to remove role from ${memberId}:`, err);
                  }
                }
              }
            }
            
            // Delete embed message
            if (raid.message_id && raid.channel_id) {
              try {
                const channel = await client.channels.fetch(raid.channel_id);
                const message = await channel.messages.fetch(raid.message_id);
                await message.delete();
              } catch (err) {
                console.error(`Failed to delete embed for raid ${raid.id}:`, err);
              }
            }
            
            console.log(`✅ Marked raid ${raid.id} as completed`);
          } catch (err) {
            console.error(`Failed to cleanup raid ${raid.id}:`, err);
          }
        }
      } else {
        console.log('✅ No old raids to clean up');
      }

    } catch (error) {
      console.error('❌ Startup catch-up failed:', error);
    }
  }, 5000); // Wait 5 seconds after bot starts

  // ✅ NEW - Database cleanup job (runs daily at 3 AM)
  cron.schedule('0 3 * * *', async () => {
    console.log('🗑️ Running daily database cleanup...');
    
    try {
      const { eventDB } = require('../database/connection');
      const DELETE_AFTER_DAYS = parseInt(process.env.DELETE_OLD_RAIDS_AFTER_DAYS || '30');
      
      if (DELETE_AFTER_DAYS === 0) {
        console.log('⏭️ Auto-delete disabled (DELETE_OLD_RAIDS_AFTER_DAYS = 0)');
        return;
      }
      
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DELETE_AFTER_DAYS);
      
      // Delete old completed/cancelled raids and their registrations
      const result = await eventDB.query(
        `DELETE FROM raids 
         WHERE status IN ('completed', 'cancelled') 
         AND updated_at < $1
         RETURNING id, name, status`,
        [cutoffDate]
      );
      
      if (result.rows.length > 0) {
        console.log(`✅ Deleted ${result.rows.length} old raid(s):`);
        result.rows.forEach(raid => {
          console.log(`   - ID ${raid.id}: "${raid.name}" (${raid.status})`);
        });
      } else {
        console.log('✅ No old raids to delete');
      }
      
    } catch (error) {
      console.error('❌ Database cleanup failed:', error);
    }
  });

  console.log('✅ Reminder scheduler started');
  console.log(`ℹ️  Reminders enabled: ${process.env.REMINDER === 'true' ? 'YES' : 'NO'}`);
  console.log(`ℹ️  Reminder time: ${REMINDER_HOURS} hours (${REMINDER_MINUTES} minutes) before raid start`);
  console.log(`ℹ️  Auto-lock enabled: ${AUTO_LOCK_HOURS > 0 ? `YES (${AUTO_LOCK_HOURS} hours before start)` : 'NO'}`);
  console.log(`ℹ️  Message cleanup: Reminder & lock messages deleted when raid starts`);
  console.log(`ℹ️  Full cleanup: Embed deleted & roles removed 2 hours after raid start`);
  console.log(`ℹ️  Database cleanup: Delete raids older than ${parseInt(process.env.DELETE_OLD_RAIDS_AFTER_DAYS || '30')} days (runs daily at 3 AM)`);
}

// ✅ Health check function
function getSchedulerHealth() {
  const now = new Date();
  const timeSinceLastCheck = now - lastCheckTime;
  
  return {
    isHealthy: timeSinceLastCheck < 120000,
    lastCheckTime: lastCheckTime.toISOString(),
    timeSinceLastCheck: Math.floor(timeSinceLastCheck / 1000),
    enabled: process.env.REMINDER === 'true',
    reminderHours: REMINDER_HOURS,
    autoLockHours: AUTO_LOCK_HOURS
  };
}

module.exports = { 
  startReminderScheduler,
  getSchedulerHealth
};
