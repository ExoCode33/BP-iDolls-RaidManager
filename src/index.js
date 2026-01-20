require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { startReminderScheduler, getSchedulerHealth } = require('./utils/scheduler');
const { checkMainDBHealth, checkEventDBHealth, getPoolStats } = require('./database/connection');

// Import all interaction handlers
const { 
  handleButton, 
  handleCharacterSelect,
  handleManualClassSelect,
  handleManualSubclassSelect,
  handleManualScoreSelect,
  handleManualIGNModal,
  handleManualBackToClass,
  handleManualBackToSubclass,
  handleASUpdateSelect,
  handleBackToMain,
  handleQuickStart,
  handleQuickComplete,
  handleQuickEdit,
  handleDateButton,
  handleDeleteConfirm,
  handlePresetMenu,
  handleLockUnlockMenu,
  handleManagementMenu,
  handleRosterMenu,
  handleTimeSelect,
  handleSizeSelect,
  handleChannelSelect,
  handleStartSelect,
  handleRaidAction,
  handleEditSelect,
  handleEditRaidSelect,
  handleDeleteSelect,
  handleSetupModal,
  handleNameModal,
  handleDateModal
} = require('./events/interactions');

const { handleRosterSelect, handleRosterPromote, handleRosterDemote, handleRosterUnregister } = require('./events/raid-handlers/roster-handlers');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ]
});

client.commands = new Collection();
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  }
}

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  try {
    const { eventDB } = require('./database/connection');
    
    const schema = `
CREATE TABLE IF NOT EXISTS bot_config (
  key VARCHAR(50) PRIMARY KEY,
  value VARCHAR(200) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raid_presets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  raid_size INTEGER NOT NULL CHECK (raid_size IN (12, 20)),
  time_utc VARCHAR(5) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raids (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  raid_size INTEGER NOT NULL CHECK (raid_size IN (12, 20)),
  start_time TIMESTAMP NOT NULL,
  tank_slots INTEGER NOT NULL,
  support_slots INTEGER NOT NULL,
  dps_slots INTEGER NOT NULL,
  message_id VARCHAR(20),
  channel_id VARCHAR(20) NOT NULL,
  main_role_id VARCHAR(20) NOT NULL,
  raid_slot INTEGER NOT NULL CHECK (raid_slot IN (1, 2)),
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  reminded_30m BOOLEAN DEFAULT false,
  locked BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS raid_registrations (
  id SERIAL PRIMARY KEY,
  raid_id INTEGER REFERENCES raids(id) ON DELETE CASCADE,
  user_id VARCHAR(20) NOT NULL,
  character_id INTEGER,
  character_source VARCHAR(20) DEFAULT 'main_bot' CHECK (character_source IN ('main_bot', 'manual')),
  ign VARCHAR(100) NOT NULL,
  class VARCHAR(50) NOT NULL,
  subclass VARCHAR(50) NOT NULL,
  ability_score INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('Tank', 'DPS', 'Support')),
  registration_type VARCHAR(20) DEFAULT 'register' CHECK (registration_type IN ('register', 'assist')),
  status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered', 'waitlist', 'assist')),
  registered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(raid_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_presets_created_by ON raid_presets(created_by);
CREATE INDEX IF NOT EXISTS idx_raids_status ON raids(status);
CREATE INDEX IF NOT EXISTS idx_raids_slot_status ON raids(raid_slot, status);
CREATE INDEX IF NOT EXISTS idx_raids_start_time ON raids(start_time);
CREATE INDEX IF NOT EXISTS idx_reg_raid_id ON raid_registrations(raid_id);
CREATE INDEX IF NOT EXISTS idx_reg_user_id ON raid_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_reg_raid_role_status ON raid_registrations(raid_id, role, status);
CREATE INDEX IF NOT EXISTS idx_reg_raid_status ON raid_registrations(raid_id, status);

INSERT INTO bot_config (key, value) VALUES 
  ('raid1_role_id', 'not_set'),
  ('raid2_role_id', 'not_set')
ON CONFLICT (key) DO NOTHING;
    `;

    await eventDB.query(schema);
    console.log('✅ Database migrations completed');

    // Check and add locked column if it doesn't exist (for existing databases)
    console.log('🔄 Checking for locked column...');
    const checkLocked = await eventDB.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'raids' AND column_name = 'locked'
    `);

    if (checkLocked.rows.length === 0) {
      console.log('📝 Adding locked column to raids table...');
      await eventDB.query(`
        ALTER TABLE raids 
        ADD COLUMN locked BOOLEAN DEFAULT false
      `);
      console.log('✅ Successfully added locked column');
    } else {
      console.log('✅ Locked column already exists');
    }

    // Check and add preset_id column if it doesn't exist
    console.log('🔄 Checking for preset_id column...');
    const checkPresetId = await eventDB.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'raids' AND column_name = 'preset_id'
    `);

    if (checkPresetId.rows.length === 0) {
      console.log('📝 Adding preset_id column to raids table...');
      await eventDB.query(`
        ALTER TABLE raids 
        ADD COLUMN preset_id INTEGER REFERENCES raid_presets(id) ON DELETE SET NULL
      `);
      console.log('✅ Successfully added preset_id column');
      
      // Create index for preset_id
      await eventDB.query(`
        CREATE INDEX IF NOT EXISTS idx_raids_preset_id ON raids(preset_id)
      `);
      console.log('✅ Successfully created preset_id index');
    } else {
      console.log('✅ Preset_id column already exists');
      // Ensure index exists even if column already exists
      await eventDB.query(`
        CREATE INDEX IF NOT EXISTS idx_raids_preset_id ON raids(preset_id)
      `);
    }

    // ✅ NEW - Add updated_at column to raids if missing
    console.log('🔄 Checking for updated_at column...');
    const checkUpdatedAt = await eventDB.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'raids' AND column_name = 'updated_at'
    `);

    if (checkUpdatedAt.rows.length === 0) {
      console.log('📝 Adding updated_at column to raids table...');
      await eventDB.query(`
        ALTER TABLE raids 
        ADD COLUMN updated_at TIMESTAMP DEFAULT NOW()
      `);
      console.log('✅ Successfully added updated_at column');
    }

    // ✅ NEW - Add lock_notification_message_id column for tracking lock notification messages
    console.log('🔄 Checking for lock_notification_message_id column...');
    const checkLockNotif = await eventDB.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'raids' AND column_name = 'lock_notification_message_id'
    `);

    if (checkLockNotif.rows.length === 0) {
      console.log('📝 Adding lock_notification_message_id column to raids table...');
      await eventDB.query(`
        ALTER TABLE raids 
        ADD COLUMN lock_notification_message_id VARCHAR(20)
      `);
      console.log('✅ Successfully added lock_notification_message_id column');
    } else {
      console.log('✅ Lock_notification_message_id column already exists');
    }

    // ✅ NEW - Add reminder_message_id column for tracking reminder messages
    console.log('🔄 Checking for reminder_message_id column...');
    const checkReminderMsg = await eventDB.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'raids' AND column_name = 'reminder_message_id'
    `);

    if (checkReminderMsg.rows.length === 0) {
      console.log('📝 Adding reminder_message_id column to raids table...');
      await eventDB.query(`
        ALTER TABLE raids 
        ADD COLUMN reminder_message_id VARCHAR(20)
      `);
      console.log('✅ Successfully added reminder_message_id column');
    } else {
      console.log('✅ Reminder_message_id column already exists');
    }

    // ✅ AUTO-FIX: Update status constraint to allow 'assist'
    console.log('🔄 Checking status constraint...');
    try {
      await eventDB.query(`
        ALTER TABLE raid_registrations DROP CONSTRAINT IF EXISTS raid_registrations_status_check;
      `);
      await eventDB.query(`
        ALTER TABLE raid_registrations ADD CONSTRAINT raid_registrations_status_check 
          CHECK (status IN ('registered', 'waitlist', 'assist'));
      `);
      console.log('✅ Status constraint updated to include assist');
    } catch (constraintError) {
      console.log('⚠️ Constraint already correct or error:', constraintError.message);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

async function deployCommands() {
  console.log(`🔄 Deploying ${commands.length} slash commands...`);
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    if (process.env.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: commands },
      );
      console.log(`✅ Successfully deployed ${commands.length} guild commands`);
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands },
      );
      console.log(`✅ Successfully deployed ${commands.length} global commands`);
    }
  } catch (error) {
    console.error('❌ Command deployment failed:', error);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📊 Serving ${c.guilds.cache.size} guild(s)`);
  
  await runMigrations();
  await deployCommands();
  
  startReminderScheduler(client);
  
  // ✅ NEW - Log initial health status
  setTimeout(async () => {
    const mainHealth = await checkMainDBHealth();
    const eventHealth = await checkEventDBHealth();
    const poolStats = await getPoolStats();
    const schedulerHealth = getSchedulerHealth();
    
    console.log('📊 Initial Health Check:', {
      mainDB: mainHealth ? '✅' : '❌',
      eventDB: eventHealth ? '✅' : '❌',
      scheduler: schedulerHealth.isHealthy ? '✅' : '❌',
      pools: poolStats
    });
  }, 3000);
});

// ✅ IMPROVED - Better interaction routing with error handling
const INTERACTION_HANDLERS = {
  button: {
    'raid_back_to_main_': handleBackToMain,
    'raid_quick_start_': handleQuickStart,
    'raid_quick_complete_': handleQuickComplete,
    'raid_quick_edit_': handleQuickEdit,
    'raid_date_button_': handleDateButton,
    'raid_delete_confirm_': handleDeleteConfirm,
  },
  selectMenu: {
    'char_select_': handleCharacterSelect,
    'manual_select_class_': handleManualClassSelect,
    'manual_select_subclass_': handleManualSubclassSelect,
    'manual_select_score_': handleManualScoreSelect,
    'as_update_select_': handleASUpdateSelect,
    'raid_preset_menu_': handlePresetMenu,
    'raid_lock_unlock_menu_': handleLockUnlockMenu,
    'raid_management_menu_': handleManagementMenu,
    'raid_roster_menu_': handleRosterMenu,
    'raid_roster_select_': handleRosterSelect,
    'raid_roster_promote_': handleRosterPromote,
    'raid_roster_demote_': handleRosterDemote,
    'raid_roster_unregister_': handleRosterUnregister,
    'raid_create_time_': handleTimeSelect,
    'raid_create_size_': handleSizeSelect,
    'raid_create_channel_': handleChannelSelect,
    'raid_start_select_': handleStartSelect,
    'raid_action_': handleRaidAction,
    'raid_edit_select_': handleEditSelect,
    'raid_edit_raid_select_': handleEditRaidSelect,
    'raid_delete_select_': handleDeleteSelect,
  },
  modal: {
    'manual_ign_modal_': handleManualIGNModal,
    'raid_setup_modal_': handleSetupModal,
    'raid_create_name_': handleNameModal,
    'raid_create_date_': handleDateModal,
  }
};

client.on(Events.InteractionCreate, async (interaction) => {
  const interactionId = `${interaction.user.id}-${interaction.id}`;
  
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.warn(`Command not found: ${interaction.commandName}`);
        return;
      }
      
      console.log(`[CMD] ${interaction.user.tag} used /${interaction.commandName}`);
      await command.execute(interaction);
      
    } else if (interaction.isButton()) {
      console.log(`[BTN] ${interaction.user.tag} clicked ${interaction.customId}`);
      
      // Try to find matching handler
      let handled = false;
      for (const [prefix, handler] of Object.entries(INTERACTION_HANDLERS.button)) {
        if (interaction.customId.startsWith(prefix)) {
          await handler(interaction);
          handled = true;
          break;
        }
      }
      
      // Fallback to generic button handler
      if (!handled) {
        await handleButton(interaction);
      }
      
    } else if (interaction.isStringSelectMenu()) {
      console.log(`[MENU] ${interaction.user.tag} selected from ${interaction.customId}`);
      
      // Try to find matching handler
      let handled = false;
      for (const [prefix, handler] of Object.entries(INTERACTION_HANDLERS.selectMenu)) {
        if (interaction.customId.startsWith(prefix)) {
          await handler(interaction);
          handled = true;
          break;
        }
      }
      
      // Fallback to generic button handler (handles admin dropdowns)
      if (!handled) {
        await handleButton(interaction);
      }
      
    } else if (interaction.isModalSubmit()) {
      console.log(`[MODAL] ${interaction.user.tag} submitted ${interaction.customId}`);
      
      // Try to find matching handler
      let handled = false;
      for (const [prefix, handler] of Object.entries(INTERACTION_HANDLERS.modal)) {
        if (interaction.customId.startsWith(prefix)) {
          await handler(interaction);
          handled = true;
          break;
        }
      }
      
      if (!handled) {
        console.warn(`No handler found for modal: ${interaction.customId}`);
      }
    }
    
  } catch (error) {
    console.error(`[ERROR] Interaction ${interactionId}:`, error);
    
    // Better error response
    const errorResponse = {
      content: '❌ An error occurred while processing your request. Please try again.',
      ephemeral: true
    };
    
    // Add more specific error messages for common issues
    if (error.code === 10062) {
      errorResponse.content = '❌ This interaction has expired. Please try again.';
    } else if (error.code === 50013) {
      errorResponse.content = '❌ I don\'t have permission to perform this action.';
    } else if (error.message?.includes('Unknown interaction')) {
      errorResponse.content = '❌ This interaction is no longer valid. Please start over.';
    }

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorResponse);
      } else {
        await interaction.reply(errorResponse);
      }
    } catch (replyError) {
      console.error(`[ERROR] Failed to send error response for ${interactionId}:`, replyError);
    }
  }
});

client.on('error', error => {
  console.error('❌ Client error:', error);
});

client.on('warn', warning => {
  console.warn('⚠️ Client warning:', warning);
});

client.on('shardError', error => {
  console.error('❌ Shard error:', error);
});

process.on('unhandledRejection', (error, promise) => {
  console.error('❌ Unhandled promise rejection:', error);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  // Don't exit immediately - let ongoing operations complete
  setTimeout(() => {
    console.error('💥 Exiting due to uncaught exception');
    process.exit(1);
  }, 3000);
});

// ✅ NEW - Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Received SIGINT, shutting down gracefully...');
  
  try {
    const { closeConnections } = require('./database/connection');
    await closeConnections();
    
    client.destroy();
    console.log('✅ Bot shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully...');
  
  try {
    const { closeConnections } = require('./database/connection');
    await closeConnections();
    
    client.destroy();
    console.log('✅ Bot shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

console.log('🚀 Starting bot...');
client.login(process.env.DISCORD_TOKEN);
