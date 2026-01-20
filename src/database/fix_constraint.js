require('dotenv').config();
const { eventDB } = require('./connection');

async function fixConstraint() {
  try {
    console.log('🔄 Fixing status constraint...');
    
    // Drop old constraint
    await eventDB.query(`
      ALTER TABLE raid_registrations DROP CONSTRAINT IF EXISTS raid_registrations_status_check;
    `);
    console.log('✅ Dropped old constraint');
    
    // Add new constraint
    await eventDB.query(`
      ALTER TABLE raid_registrations ADD CONSTRAINT raid_registrations_status_check 
        CHECK (status IN ('registered', 'waitlist', 'assist'));
    `);
    console.log('✅ Added new constraint with assist');
    
    // Verify
    const result = await eventDB.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'raid_registrations'::regclass 
      AND conname = 'raid_registrations_status_check';
    `);
    
    console.log('✅ Constraint verified:', result.rows[0]);
    console.log('✅ Fix completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  }
}

fixConstraint();
