const cron = require('node-cron');
const { getUpcomingRaids, markRaidReminded } = require('../database/queries');

// Track last check time to detect missed reminders
let lastCheckTime = new Date();
const REMINDER_WINDOW = 30 * 60 * 1000; // 30 minutes in milliseconds

function startReminderScheduler(client) {
  console.log('🔄 Initializing reminder scheduler...');
  
  // Run every minute
  cron.schedule('* * * * *', async () => {
    if (process.env.REMINDER_30MIN !== 'true') return;

    const currentTime = new Date();
    const timeSinceLastCheck = currentTime - lastCheckTime;
    
    // Log if we missed checks (bot was down or scheduler failed)
    if (timeSinceLastCheck > 120000) { // More than 2 minutes
      console.warn(`⚠️ Reminder scheduler missed ${Math.floor(timeSinceLastCheck / 60000)} minutes of checks`);
    }

    try {
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
          // For other errors, don't mark as reminded so it can retry next minute
        }
      }

      lastCheckTime = currentTime;

    } catch (error) {
      console.error('❌ Reminder scheduler error:', error);
      
      // Don't update lastCheckTime on error so we know we missed this check
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('⚠️ Database connection error in reminder scheduler');
      }
    }
  });

  // ✅ NEW - Catch-up check on startup
  setTimeout(async () => {
    try {
      console.log('🔄 Running startup reminder catch-up check...');
      const upcomingRaids = await getUpcomingRaids();
      
      if (upcomingRaids.length > 0) {
        console.log(`📋 Found ${upcomingRaids.length} raid(s) that may have missed reminders during downtime`);
        
        for (const raid of upcomingRaids) {
          const raidStartTime = new Date(raid.start_time);
          const timeUntilRaid = raidStartTime - new Date();
          
          // Only send reminders for raids starting in 15-45 minutes
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
            // Too close to start, just mark as reminded
            await markRaidReminded(raid.id);
            console.log(`⏭️ Raid ${raid.id} starting too soon (${Math.floor(timeUntilRaid / 60000)}m), marking as reminded`);
          }
        }
      } else {
        console.log('✅ No missed reminders to catch up on');
      }
    } catch (error) {
      console.error('❌ Startup reminder catch-up failed:', error);
    }
  }, 5000); // Wait 5 seconds after bot starts

  console.log('✅ Reminder scheduler started');
  console.log(`ℹ️  Reminders enabled: ${process.env.REMINDER_30MIN === 'true' ? 'YES' : 'NO'}`);
}

// ✅ NEW - Health check function
function getSchedulerHealth() {
  const now = new Date();
  const timeSinceLastCheck = now - lastCheckTime;
  
  return {
    isHealthy: timeSinceLastCheck < 120000, // Healthy if checked in last 2 minutes
    lastCheckTime: lastCheckTime.toISOString(),
    timeSinceLastCheck: Math.floor(timeSinceLastCheck / 1000), // in seconds
    enabled: process.env.REMINDER_30MIN === 'true'
  };
}

module.exports = { 
  startReminderScheduler,
  getSchedulerHealth
};
