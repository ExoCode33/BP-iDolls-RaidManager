require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { startReminderScheduler } = require('./utils/scheduler');
const { handleButton, handleManualModal } = require('./events/interactions');

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ]
});

// Load commands
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

// Run migrations automatically
async function runMigrations() {
  console.log('🔄 Running database migrations...');
  try {
    const { eventDB } = require('./database/connection');
    
    const schema = `
-- Bot configuration table
CREATE TABLE IF NOT EXISTS bot_config (
  key VARCHAR(50) PRIMARY KEY,
  value VARCHAR(200) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Raids table
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
  reminded_30m BOOLEAN DEFAULT false
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
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Deploy commands automatically
async function deployCommands() {
  console.log(`🔄 Deploying ${commands.length} slash commands...`);
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    // Deploy to guild if GUILD_ID provided, otherwise deploy globally
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

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📊 Serving ${c.guilds.cache.size} guild(s)`);
  
  // Run migrations on startup
  await runMigrations();
  
  // Deploy commands on startup
  await deployCommands();
  
  // Start reminder scheduler
  startReminderScheduler(client);
});

// Interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction);
    } 
    else if (interaction.isButton()) {
      await handleButton(interaction);
    }
    else if (interaction.isStringSelectMenu()) {
      const { handleButton: handleSelect } = require('./events/interactions');
      await handleSelect(interaction);
    }
    else if (interaction.isModalSubmit()) {
      await handleManualModal(interaction);
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

// Error handlers
client.on('error', error => {
  console.error('Client error:', error);
});

client.on('warn', warning => {
  console.warn('Client warning:', warning);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN);
```

---

## What Changed:

✅ **Auto-runs migrations** on startup
✅ **Auto-deploys commands** on startup
✅ No manual `npm run deploy` needed
✅ No manual `npm run db:migrate` needed

---

## Now Your Workflow:

1. ✅ Set environment variables in Railway
2. ✅ Deploy bot
3. ✅ **Everything happens automatically!**
   - Database migrations ✅
   - Command deployment ✅
   - Bot starts ✅
4. ✅ Just run `/raid-setup` in Discord
5. ✅ Start creating raids!

---

## Expected Startup Logs:
```
✅ Logged in as iDolls Raid Manager#9467
📊 Serving 1 guild(s)
🔄 Running database migrations...
✅ Database migrations completed
🔄 Deploying 2 slash commands...
✅ Successfully deployed 2 guild commands
✅ Reminder scheduler started
