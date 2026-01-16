const cron = require('node-cron');
const { getUpcomingRaids, markRaidReminded, getActiveRaids, updateRaidStatus, lockRaid } = require('../database/queries');

// Track last check time to detect missed reminders
let lastCheckTime = new Date();
const REMINDER_WINDOW = 30 * 60 * 1000; // 30 minutes in milliseconds

// ✅ NEW - Auto-lock configuration (in hours before raid start)
// Set to 0 to disable auto-lock
const AUTO_LOCK_HOURS = parseFloat(process.env.AUTO_LOCK_HOURS || '0');

function startReminderScheduler(client) {
  console.log('🔄 Initializing reminder scheduler...');
  
  // Run every minute - handles reminders, auto-lock, AND cleanup
  cron.schedule('* * * * *', async () => {
    if (process.env.REMINDER_30MIN !== 'true') return;

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
          
          // ✅ FIX - Skip raids that haven't been posted yet
          if (!raid.message_id) {
            console.log(`⏭️ Skipping auto-lock for raid ${raid.id} - not posted yet`);
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
                const { getRaidRegistrations } = require('../database/queries');
                const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');
                
                const channel = await client.channels.fetch(raid.channel_id);
                const message = await channel.messages.fetch(raid.message_id);
                
                const registrations = await getRaidRegistrations(raid.id);
                const embed = await createRaidEmbed({ ...raid, locked: true }, registrations);
                const buttons = createRaidButtons(raid.id, true); // true = locked
                
                await message.edit({ embeds: [embed], components: [buttons] });
                
                // Send notification to raid channel
                const timestamp = Math.floor(raidStartTime.getTime() / 1000);
                await channel.send(
                  `🔒 **Registration Locked** - "${raid.name}" is now locked. Raid starts <t:${timestamp}:R>`
                );
                
                console.log(`✅ Auto-locked raid ${raid.id} and updated message`);
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
      const upcomingRaids = await getUpcomingRaids();

      if (upcomingRaids.length > 0) {
        console.log(`📋 Processing ${upcomingRaids.length} upcoming raid reminder(s)...`);
      }

      for (const raid of upcomingRaids) {
        try {
          // Calculate time until raid starts
          const raidStartTime = new Date(raid.start_time);
          const timeUntilRaid = raidStartTime - currentTime;
          
          // Only send if within reminder window (25-35 minutes to handle delays)
          if (timeUntilRaid < 25 * 60 * 1000 || timeUntilRaid > 35 * 60 * 1000) {
            console.log(`⏭️ Skipping raid ${raid.id} - outside reminder window (${Math.floor(timeUntilRaid / 60000)}m until start)`);
            // Still mark as reminded to prevent future attempts
            await markRaidReminded(raid.id);
            continue;
          }

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

          await channel.send(
            `<@&${raid.main_role_id}> 🔔 Your raid "${raid.name}" starts in 30 minutes! <t:${timestamp}:R>`
          );

          await markRaidReminded(raid.id);
          console.log(`✅ Sent reminder for raid ${raid.id}: "${raid.name}"`);

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

      // ========== AUTO CLEANUP ==========
      // Clean up raids that are past their start time
      const activeRaids = await getActiveRaids();
      const raidsToCleanup = activeRaids.filter(raid => {
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
          
          // Delete the raid message
          if (raid.message_id && raid.channel_id) {
            try {
              const channel = await client.channels.fetch(raid.channel_id);
              const message = await channel.messages.fetch(raid.message_id);
              await message.delete();
              console.log(`✅ Deleted message for raid ${raid.id}`);
            } catch (err) {
              console.error(`Failed to delete message for raid ${raid.id}:`, err);
            }
          }
          
          console.log(`✅ Auto-completed raid ${raid.id}: "${raid.name}"`);
          
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
      const upcomingRaids = await getUpcomingRaids();
      
      if (upcomingRaids.length > 0) {
        console.log(`📋 Found ${upcomingRaids.length} raid(s) that may have missed reminders during downtime`);
        
        for (const raid of upcomingRaids) {
          const raidStartTime = new Date(raid.start_time);
          const timeUntilRaid = raidStartTime - new Date();
          
          if (timeUntilRaid > 15 * 60 * 1000 && timeUntilRaid < 45 * 60 * 1000) {
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
          } else if (timeUntilRaid < 15 * 60 * 1000) {
            await markRaidReminded(raid.id);
            console.log(`⏭️ Raid ${raid.id} starting too soon (${Math.floor(timeUntilRaid / 60000)}m), marking as reminded`);
          }
        }
      } else {
        console.log('✅ No missed reminders to catch up on');
      }

      // === Auto-lock catch-up ===
      if (AUTO_LOCK_HOURS > 0) {
        console.log('🔄 Checking for raids that should be locked...');
        const activeRaids = await getActiveRaids();
        const now = new Date();
        
        const raidsNeedingLock = activeRaids.filter(raid => {
          if (raid.locked) return false;
          
          // ✅ FIX - Skip raids that haven't been posted yet
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
                const { getRaidRegistrations } = require('../database/queries');
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
      const activeRaids = await getActiveRaids();
      const now = new Date();
      
      const oldRaids = activeRaids.filter(raid => {
        const raidStartTime = new Date(raid.start_time);
        const timeSinceStart = now - raidStartTime;
        return timeSinceStart > 2 * 60 * 60 * 1000;
      });

      if (oldRaids.length > 0) {
        console.log(`🧹 Found ${oldRaids.length} old raid(s) to clean up`);
        for (const raid of oldRaids) {
          await updateRaidStatus(raid.id, 'completed');
          console.log(`✅ Marked raid ${raid.id} as completed`);
        }
      } else {
        console.log('✅ No old raids to clean up');
      }

    } catch (error) {
      console.error('❌ Startup catch-up failed:', error);
    }
  }, 5000); // Wait 5 seconds after bot starts

  console.log('✅ Reminder scheduler started');
  console.log(`ℹ️  Reminders enabled: ${process.env.REMINDER_30MIN === 'true' ? 'YES' : 'NO'}`);
  console.log(`ℹ️  Auto-lock enabled: ${AUTO_LOCK_HOURS > 0 ? `YES (${AUTO_LOCK_HOURS} hours before start)` : 'NO'}`);
  console.log(`ℹ️  Auto-cleanup enabled: YES (2 hours after raid start)`);
}

// ✅ Health check function
function getSchedulerHealth() {
  const now = new Date();
  const timeSinceLastCheck = now - lastCheckTime;
  
  return {
    isHealthy: timeSinceLastCheck < 120000,
    lastCheckTime: lastCheckTime.toISOString(),
    timeSinceLastCheck: Math.floor(timeSinceLastCheck / 1000),
    enabled: process.env.REMINDER_30MIN === 'true',
    autoLockHours: AUTO_LOCK_HOURS
  };
}

module.exports = { 
  startReminderScheduler,
  getSchedulerHealth
};
