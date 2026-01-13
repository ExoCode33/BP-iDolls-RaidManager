require('dotenv').config();
const { mainDB, eventDB } = require('./src/database/connection');

async function verifySetup() {
  console.log('🔍 Verifying bot setup...\n');

  const checks = {
    passed: [],
    failed: [],
    warnings: []
  };

  // Check environment variables
  console.log('📋 Checking environment variables...');
  const requiredVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'MAIN_DATABASE_URL',
    'EVENT_DATABASE_URL'
  ];

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      checks.passed.push(`✅ ${varName} is set`);
    } else {
      checks.failed.push(`❌ ${varName} is missing`);
    }
  }

  // Check Main DB connection
  console.log('\n🔌 Testing Main Bot Database connection...');
  try {
    const result = await mainDB.query('SELECT NOW()');
    checks.passed.push('✅ Main DB connection successful');
    
    // Check if characters table exists
    const tablesResult = await mainDB.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'characters'"
    );
    
    if (tablesResult.rows.length > 0) {
      checks.passed.push('✅ Characters table found');
      
      // Check if we can read
      const countResult = await mainDB.query('SELECT COUNT(*) FROM characters');
      checks.passed.push(`✅ Can read characters (${countResult.rows[0].count} found)`);
    } else {
      checks.warnings.push('⚠️  Characters table not found - is this the right database?');
    }

    // Try to write (should fail for readonly user)
    try {
      await mainDB.query("INSERT INTO characters (user_id, ign) VALUES ('test', 'test')");
      checks.warnings.push('⚠️  Main DB allows writes - should be read-only!');
    } catch (error) {
      if (error.message.includes('permission denied')) {
        checks.passed.push('✅ Main DB is correctly read-only');
      } else {
        checks.warnings.push(`⚠️  Unexpected error testing write: ${error.message}`);
      }
    }

  } catch (error) {
    checks.failed.push(`❌ Main DB connection failed: ${error.message}`);
  }

  // Check Event DB connection
  console.log('\n🔌 Testing Event Bot Database connection...');
  try {
    const result = await eventDB.query('SELECT NOW()');
    checks.passed.push('✅ Event DB connection successful');

    // Check if tables exist
    const tablesResult = await eventDB.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('raids', 'raid_registrations', 'bot_config')"
    );

    if (tablesResult.rows.length === 3) {
      checks.passed.push('✅ All Event DB tables found');
    } else if (tablesResult.rows.length > 0) {
      checks.warnings.push(`⚠️  Only ${tablesResult.rows.length}/3 tables found - run migrations`);
    } else {
      checks.warnings.push('⚠️  Event DB tables not found - run: npm run db:migrate');
    }

    // Test write
    try {
      await eventDB.query("SELECT 1");
      checks.passed.push('✅ Event DB allows queries');
    } catch (error) {
      checks.failed.push(`❌ Event DB query failed: ${error.message}`);
    }

  } catch (error) {
    checks.failed.push(`❌ Event DB connection failed: ${error.message}`);
  }

  // Print results
  console.log('\n' + '='.repeat(50));
  console.log('📊 VERIFICATION RESULTS');
  console.log('='.repeat(50) + '\n');

  if (checks.passed.length > 0) {
    console.log('✅ PASSED CHECKS:');
    checks.passed.forEach(check => console.log(`   ${check}`));
    console.log('');
  }

  if (checks.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    checks.warnings.forEach(warning => console.log(`   ${warning}`));
    console.log('');
  }

  if (checks.failed.length > 0) {
    console.log('❌ FAILED CHECKS:');
    checks.failed.forEach(failure => console.log(`   ${failure}`));
    console.log('');
  }

  // Final verdict
  console.log('='.repeat(50));
  if (checks.failed.length === 0 && checks.warnings.length === 0) {
    console.log('🎉 ALL CHECKS PASSED! Bot is ready to run.');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run deploy');
    console.log('  2. Start bot: npm start');
    console.log('  3. In Discord: /raid-setup');
  } else if (checks.failed.length === 0) {
    console.log('✅ Setup is functional but has warnings.');
    console.log('Review warnings above before proceeding.');
  } else {
    console.log('❌ Setup incomplete. Fix failed checks above.');
    process.exit(1);
  }
  console.log('='.repeat(50));

  process.exit(0);
}

verifySetup().catch(error => {
  console.error('💥 Verification script error:', error);
  process.exit(1);
});
