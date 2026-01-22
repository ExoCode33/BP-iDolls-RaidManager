#!/usr/bin/env node

/**
 * 🗑️ MANUAL RAID CLEANUP SCRIPT
 * 
 * This script helps you manually clean up old raid data from PostgreSQL
 * 
 * Usage:
 *   node cleanup-old-raids.js              # Preview what would be deleted
 *   node cleanup-old-raids.js --confirm    # Actually delete the data
 *   node cleanup-old-raids.js --days 60    # Delete raids older than 60 days
 */

require('dotenv').config();
const { eventDB } = require('./src/database/connection');

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const daysIndex = args.indexOf('--days');
const days = daysIndex !== -1 ? parseInt(args[daysIndex + 1]) : 30;

async function cleanupOldRaids() {
  console.log('🗑️ Raid Cleanup Tool\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    console.log(`📅 Cutoff Date: ${cutoffDate.toLocaleDateString()}`);
    console.log(`🔍 Looking for raids completed/cancelled before this date...\n`);

    // Get raids that would be deleted
    const raidsToDelete = await eventDB.query(
      `SELECT 
        r.id, 
        r.name, 
        r.status, 
        r.start_time,
        r.updated_at,
        COUNT(rr.id) as registration_count
      FROM raids r
      LEFT JOIN raid_registrations rr ON r.id = rr.raid_id
      WHERE r.status IN ('completed', 'cancelled') 
      AND r.updated_at < $1
      GROUP BY r.id, r.name, r.status, r.start_time, r.updated_at
      ORDER BY r.updated_at DESC`,
      [cutoffDate]
    );

    if (raidsToDelete.rows.length === 0) {
      console.log('✅ No old raids found to delete!\n');
      process.exit(0);
    }

    console.log(`Found ${raidsToDelete.rows.length} raid(s) to delete:\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let totalRegistrations = 0;

    raidsToDelete.rows.forEach(raid => {
      const daysAgo = Math.floor((new Date() - new Date(raid.updated_at)) / (1000 * 60 * 60 * 24));
      totalRegistrations += parseInt(raid.registration_count);
      
      console.log(`📋 ID ${raid.id}: "${raid.name}"`);
      console.log(`   Status: ${raid.status}`);
      console.log(`   Started: ${new Date(raid.start_time).toLocaleDateString()}`);
      console.log(`   Last Updated: ${daysAgo} days ago`);
      console.log(`   Registrations: ${raid.registration_count}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📊 Summary:`);
    console.log(`   Raids to delete: ${raidsToDelete.rows.length}`);
    console.log(`   Registrations to delete: ${totalRegistrations}`);
    console.log('');

    if (!confirm) {
      console.log('⚠️  DRY RUN MODE - No data will be deleted');
      console.log('');
      console.log('To actually delete this data, run:');
      console.log(`   node cleanup-old-raids.js --confirm --days ${days}`);
      console.log('');
      process.exit(0);
    }

    // Confirm deletion
    console.log('⚠️  WARNING: This will permanently delete the data above!');
    console.log('');
    console.log('Starting deletion in 5 seconds... (Press Ctrl+C to cancel)');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('');
    console.log('🗑️ Deleting data...\n');

    // Delete raids (CASCADE will delete registrations automatically)
    const result = await eventDB.query(
      `DELETE FROM raids 
       WHERE status IN ('completed', 'cancelled') 
       AND updated_at < $1
       RETURNING id, name`,
      [cutoffDate]
    );

    console.log(`✅ Successfully deleted ${result.rows.length} raid(s):`);
    result.rows.forEach(raid => {
      console.log(`   ✓ ID ${raid.id}: "${raid.name}"`);
    });
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ CLEANUP COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

cleanupOldRaids();
