require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
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
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📊 Serving ${c.guilds.cache.size} guild(s)`);
  
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
