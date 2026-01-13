#!/usr/bin/env node

/**
 * 🚀 AUTOMATIC DEPLOYMENT SCRIPT
 * 
 * This script will automatically:
 * 1. Backup your current files
 * 2. Update index.js with new routing
 * 3. Update interactions.js with raid handlers
 * 4. Delete old command files
 * 5. Rename raid-command.js to raid.js
 * 6. Deploy commands
 * 
 * Usage: node AUTO_DEPLOY.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🎮 Starting automatic deployment...\n');

// ============================================================================
// STEP 1: BACKUP
// ============================================================================
console.log('📦 Step 1: Creating backup...');
const backupDir = `backup-${Date.now()}`;
try {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
    
    // Backup critical files
    if (fs.existsSync('src/index.js')) {
      fs.copyFileSync('src/index.js', `${backupDir}/index.js`);
    }
    if (fs.existsSync('src/events/interactions.js')) {
      fs.copyFileSync('src/events/interactions.js', `${backupDir}/interactions.js`);
    }
    
    console.log(`✅ Backup created in ${backupDir}/`);
  }
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  process.exit(1);
}
console.log('');

// ============================================================================
// STEP 2: UPDATE INDEX.JS
// ============================================================================
console.log('📝 Step 2: Updating src/index.js...');
try {
  let indexContent = fs.readFileSync('src/index.js', 'utf8');
  
  // Add locked column to schema
  if (!indexContent.includes('locked BOOLEAN DEFAULT false')) {
    indexContent = indexContent.replace(
      /reminded_30m BOOLEAN DEFAULT false\s*\n\s*\);/,
      'reminded_30m BOOLEAN DEFAULT false,\n  locked BOOLEAN DEFAULT false\n);'
    );
    console.log('  ✅ Added locked column to schema');
  } else {
    console.log('  ⏭️  locked column already exists');
  }
  
  // Add raid menu routing in SelectMenu section
  if (!indexContent.includes("interaction.customId.startsWith('raid_main_menu_')")) {
    const selectMenuSection = indexContent.match(
      /else if \(interaction\.customId\.startsWith\('manual_select_score_'\)\) \{[\s\S]*?\}\s*else \{[\s\S]*?\/\/ Admin dropdowns/
    );
    
    if (selectMenuSection) {
      const raidRouting = `else if (interaction.customId.startsWith('manual_select_score_')) {
        const { handleManualScoreSelect } = require('./events/interactions');
        await handleManualScoreSelect(interaction);
      }
      // NEW: Raid menu handlers
      else if (interaction.customId.startsWith('raid_main_menu_')) {
        const { handleRaidMainMenu } = require('./events/interactions');
        await handleRaidMainMenu(interaction);
      }
      else if (interaction.customId.startsWith('raid_create_time_')) {
        const { handleTimeSelect } = require('./events/interactions');
        await handleTimeSelect(interaction);
      }
      else if (interaction.customId.startsWith('raid_create_size_')) {
        const { handleSizeSelect } = require('./events/interactions');
        await handleSizeSelect(interaction);
      }
      else if (interaction.customId.startsWith('raid_create_channel_')) {
        const { handleChannelSelect } = require('./events/interactions');
        await handleChannelSelect(interaction);
      }
      else if (interaction.customId.startsWith('raid_start_select_')) {
        const { handleStartSelect } = require('./events/interactions');
        await handleStartSelect(interaction);
      }
      else if (interaction.customId.startsWith('raid_action_')) {
        const { handleRaidAction } = require('./events/interactions');
        await handleRaidAction(interaction);
      }
      else {
        // Admin dropdowns`;
      
      indexContent = indexContent.replace(selectMenuSection[0], raidRouting);
      console.log('  ✅ Added raid menu routing');
    }
  } else {
    console.log('  ⏭️  Raid menu routing already exists');
  }
  
  // Add raid modal routing in ModalSubmit section
  if (!indexContent.includes("interaction.customId.startsWith('raid_setup_modal_')")) {
    const modalSection = indexContent.match(
      /if \(interaction\.customId\.startsWith\('manual_ign_modal_'\)\) \{[\s\S]*?\} else \{[\s\S]*?await handleManualModal/
    );
    
    if (modalSection) {
      const raidModalRouting = `if (interaction.customId.startsWith('manual_ign_modal_')) {
        const { handleManualIGNModal } = require('./events/interactions');
        await handleManualIGNModal(interaction);
      }
      // NEW: Raid modals
      else if (interaction.customId.startsWith('raid_setup_modal_')) {
        const { handleSetupModal } = require('./events/interactions');
        await handleSetupModal(interaction);
      }
      else if (interaction.customId.startsWith('raid_create_name_')) {
        const { handleNameModal } = require('./events/interactions');
        await handleNameModal(interaction);
      }
      else if (interaction.customId.startsWith('raid_create_date_')) {
        const { handleDateModal } = require('./events/interactions');
        await handleDateModal(interaction);
      }
      else {
        await handleManualModal`;
      
      indexContent = indexContent.replace(modalSection[0], raidModalRouting);
      console.log('  ✅ Added raid modal routing');
    }
  } else {
    console.log('  ⏭️  Raid modal routing already exists');
  }
  
  fs.writeFileSync('src/index.js', indexContent);
  console.log('✅ src/index.js updated successfully');
} catch (error) {
  console.error('❌ Failed to update index.js:', error.message);
  process.exit(1);
}
console.log('');

// ============================================================================
// STEP 3: UPDATE INTERACTIONS.JS
// ============================================================================
console.log('📝 Step 3: Updating src/events/interactions.js...');
try {
  let interactionsContent = fs.readFileSync('src/events/interactions.js', 'utf8');
  
  // Add raid handlers import
  if (!interactionsContent.includes("const raidHandlers = require('./raid-handlers');")) {
    interactionsContent = interactionsContent.replace(
      /const \{ createRaidEmbed, createRaidButtons \} = require\('\.\.\/utils\/embeds'\);/,
      `const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');\nconst raidHandlers = require('./raid-handlers');`
    );
    console.log('  ✅ Added raid handlers import');
  } else {
    console.log('  ⏭️  Raid handlers import already exists');
  }
  
  // Update module.exports
  if (!interactionsContent.includes('...raidHandlers')) {
    interactionsContent = interactionsContent.replace(
      /module\.exports = \{[\s\S]*?handleManualBackToSubclass\s*\};/,
      `module.exports = {
  handleButton,
  handleCharacterSelect,
  handleManualClassSelect,
  handleManualSubclassSelect,
  handleManualScoreSelect,
  handleManualIGNModal,
  handleManualBackToClass,
  handleManualBackToSubclass,
  ...raidHandlers
};`
    );
    console.log('  ✅ Added raid handlers to exports');
  } else {
    console.log('  ⏭️  Raid handlers already in exports');
  }
  
  fs.writeFileSync('src/events/interactions.js', interactionsContent);
  console.log('✅ src/events/interactions.js updated successfully');
} catch (error) {
  console.error('❌ Failed to update interactions.js:', error.message);
  process.exit(1);
}
console.log('');

// ============================================================================
// STEP 4: DELETE OLD COMMAND FILES
// ============================================================================
console.log('🗑️  Step 4: Removing old command files...');
const oldFiles = [
  'src/commands/raid-setup.js',
  'src/commands/raid-create.js',
  'src/commands/raid-list.js',
  'src/commands/raid-admin.js'
];

let deletedCount = 0;
oldFiles.forEach(file => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`  ✅ Deleted ${file}`);
    deletedCount++;
  }
});

if (deletedCount === 0) {
  console.log('  ⏭️  No old files to delete');
}
console.log('');

// ============================================================================
// STEP 5: RENAME RAID-COMMAND.JS
// ============================================================================
console.log('📝 Step 5: Renaming unified command...');
if (fs.existsSync('src/commands/raid-command.js')) {
  if (fs.existsSync('src/commands/raid.js')) {
    console.log('  ⚠️  raid.js already exists, removing old raid-command.js');
    fs.unlinkSync('src/commands/raid-command.js');
  } else {
    fs.renameSync('src/commands/raid-command.js', 'src/commands/raid.js');
    console.log('  ✅ raid-command.js → raid.js');
  }
} else if (fs.existsSync('src/commands/raid.js')) {
  console.log('  ⏭️  raid.js already exists');
} else {
  console.log('  ⚠️  raid-command.js not found (may need to be added)');
}
console.log('');

// ============================================================================
// STEP 6: CHECK CHANNEL IDS
// ============================================================================
console.log('⚙️  Step 6: Checking channel configuration...');
try {
  const stateContent = fs.readFileSync('src/events/raid-handlers/state.js', 'utf8');
  
  if (stateContent.includes('1234567890123456789')) {
    console.log('  ⚠️  WARNING: Default channel IDs detected!');
    console.log('  📝 You need to update channel IDs in:');
    console.log('     src/events/raid-handlers/state.js');
    console.log('');
    console.log('  How to get channel IDs:');
    console.log('    1. Enable Developer Mode in Discord');
    console.log('    2. Right-click channel → Copy ID');
    console.log('    3. Update CHANNEL_PRESETS in state.js');
  } else {
    console.log('  ✅ Channel IDs appear to be configured');
  }
} catch (error) {
  console.log('  ⚠️  Could not check state.js');
}
console.log('');

// ============================================================================
// STEP 7: DEPLOY COMMANDS
// ============================================================================
console.log('🚀 Step 7: Deploying commands...');
try {
  execSync('npm run deploy', { stdio: 'inherit' });
  console.log('✅ Commands deployed successfully');
} catch (error) {
  console.error('❌ Command deployment failed');
  console.log('   You can manually run: npm run deploy');
}
console.log('');

// ============================================================================
// FINAL MESSAGE
// ============================================================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ DEPLOYMENT COMPLETE!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('📋 What was done:');
console.log('  ✅ Backup created');
console.log('  ✅ index.js updated (schema + routing)');
console.log('  ✅ interactions.js updated (imports + exports)');
console.log(`  ✅ ${deletedCount} old command files deleted`);
console.log('  ✅ raid-command.js renamed to raid.js');
console.log('  ✅ Commands deployed');
console.log('');
console.log('⚠️  IMPORTANT:');
console.log('  Update channel IDs in: src/events/raid-handlers/state.js');
console.log('');
console.log('🚀 Next steps:');
console.log('  1. Update channel IDs (if not done)');
console.log('  2. Run: npm start');
console.log('  3. Test: /raid in Discord');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
