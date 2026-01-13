const cron = require('node-cron');
const { getUpcomingRaids, markRaidReminded } = require('../database/queries');

function startReminderScheduler(client) {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    if (process.env.REMINDER_30MIN !== 'true') return;

    try {
      const upcomingRaids = await getUpcomingRaids();

      for (const raid of upcomingRaids) {
        try {
          const channel = await client.channels.fetch(raid.channel_id);
          if (!channel) continue;

          const timestamp = Math.floor(new Date(raid.start_time).getTime() / 1000);

          await channel.send(
            `<@&${raid.main_role_id}> 🔔 Your raid starts in 30 minutes! <t:${timestamp}:R>`
          );

          await markRaidReminded(raid.id);

        } catch (error) {
          console.error(`Failed to send reminder for raid ${raid.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Reminder scheduler error:', error);
    }
  });

  console.log('✅ Reminder scheduler started');
}

module.exports = { startReminderScheduler };
