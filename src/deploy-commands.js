require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🔄 Refreshing ${commands.length} application (/) commands...`);

    // Deploy to specific guild (faster for testing)
    if (process.env.DISCORD_GUILD_ID) {
      const data = await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: commands },
      );
      console.log(`✅ Successfully registered ${data.length} guild commands!`);
    } 
    // Deploy globally (takes up to 1 hour)
    else {
      const data = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands },
      );
      console.log(`✅ Successfully registered ${data.length} global commands!`);
    }
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
})();
