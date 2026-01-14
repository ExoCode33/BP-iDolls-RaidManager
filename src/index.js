require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { startReminderScheduler } = require('./utils/scheduler');
const { handleButton, handleManualModal } = require('./events/interactions');

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
  status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered', 'waitlist')),
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
});


client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
    } 
    else if (interaction.isButton()) {
      // Handle back to main menu button
      if (interaction.customId.startsWith('raid_back_to_main_')) {
        const { handleBackToMain } = require('./events/interactions');
        await handleBackToMain(interaction);
      }
      // Handle quick action buttons
      else if (interaction.customId.startsWith('raid_quick_start_')) {
        const { handleQuickStart } = require('./events/interactions');
        await handleQuickStart(interaction);
      }
      else if (interaction.customId.startsWith('raid_quick_complete_')) {
        const { handleQuickComplete } = require('./events/interactions');
        await handleQuickComplete(interaction);
      }
      else if (interaction.customId.startsWith('raid_quick_edit_')) {
        const { handleQuickEdit } = require('./events/interactions');
        await handleQuickEdit(interaction);
      }
      // Handle date button
      else if (interaction.customId.startsWith('raid_date_button_')) {
        const { handleDateButton } = require('./events/interactions');
        await handleDateButton(interaction);
      }
      // Handle delete confirm button
      else if (interaction.customId.startsWith('raid_delete_confirm_')) {
        const { handleDeleteConfirm } = require('./events/interactions');
        await handleDeleteConfirm(interaction);
      }
      else {
        await handleButton(interaction);
      }
    }
    else if (interaction.isStringSelectMenu()) {
      // Route select menus correctly
      if (interaction.customId.startsWith('char_select_')) {
        const { handleCharacterSelect } = require('./events/interactions');
        await handleCharacterSelect(interaction);
      } 
      else if (interaction.customId.startsWith('manual_select_class_')) {
        const { handleManualClassSelect } = require('./events/interactions');
        await handleManualClassSelect(interaction);
      }
      else if (interaction.customId.startsWith('manual_select_subclass_')) {
        const { handleManualSubclassSelect } = require('./events/interactions');
        await handleManualSubclassSelect(interaction);
      }
      else if (interaction.customId.startsWith('manual_select_score_')) {
        const { handleManualScoreSelect } = require('./events/interactions');
        await handleManualScoreSelect(interaction);
      }
      // Raid menu handlers
      else if (interaction.customId.startsWith('raid_main_menu_')) {
        const { handleRaidMainMenu } = require('./events/interactions');
        await handleRaidMainMenu(interaction);
      }
      else if (interaction.customId.startsWith('raid_role_config_')) {
        const { handleRoleConfigMenu } = require('./events/interactions');
        await handleRoleConfigMenu(interaction);
      }
      else if (interaction.customId.startsWith('raid_preset_menu_')) {
        const { handlePresetMenu } = require('./events/interactions');
        await handlePresetMenu(interaction);
      }
      else if (interaction.customId.startsWith('raid_lock_unlock_menu_')) {
        const { handleLockUnlockMenu } = require('./events/interactions');
        await handleLockUnlockMenu(interaction);
      }
      else if (interaction.customId.startsWith('raid_embed_menu_')) {
        const { handleEmbedMenu } = require('./events/interactions');
        await handleEmbedMenu(interaction);
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
      else if (interaction.customId.startsWith('raid_edit_select_')) {
        const { handleEditSelect } = require('./events/interactions');
        await handleEditSelect(interaction);
      }
      else if (interaction.customId.startsWith('raid_edit_raid_select_')) {
        const { handleEditRaidSelect } = require('./events/interactions');
        await handleEditRaidSelect(interaction);
      }
      else if (interaction.customId.startsWith('raid_delete_select_')) {
        const { handleDeleteSelect } = require('./events/interactions');
        await handleDeleteSelect(interaction);
      }
      else {
        // Admin dropdowns and other select menus
        await handleButton(interaction);
      }
    }
    else if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('manual_ign_modal_')) {
        const { handleManualIGNModal } = require('./events/interactions');
        await handleManualIGNModal(interaction);
      }
      // Raid modals
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
        await handleManualModal(interaction);
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    
    const reply = {
      content: '❌ An error occurred while processing your request.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.on('error', error => {
  console.error('Client error:', error);
});

client.on('warn', warning => {
  console.warn('Client warning:', warning);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
