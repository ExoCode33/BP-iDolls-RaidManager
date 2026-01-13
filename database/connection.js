const { Pool } = require('pg');

// Read-only connection to main bot database
const mainDB = new Pool({
  host: process.env.MAIN_DB_HOST,
  port: parseInt(process.env.MAIN_DB_PORT) || 5432,
  database: process.env.MAIN_DB_NAME,
  user: process.env.MAIN_DB_USER,
  password: process.env.MAIN_DB_PASSWORD,
  ssl: process.env.MAIN_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Event bot database (READ-WRITE)
const eventDB = new Pool({
  host: process.env.EVENT_DB_HOST,
  port: parseInt(process.env.EVENT_DB_PORT) || 5432,
  database: process.env.EVENT_DB_NAME,
  user: process.env.EVENT_DB_USER,
  password: process.env.EVENT_DB_PASSWORD,
  ssl: process.env.EVENT_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connections
mainDB.on('connect', () => {
  console.log('✅ Connected to Main Bot Database (READ-ONLY)');
});

mainDB.on('error', (err) => {
  console.error('❌ Main DB Error:', err);
});

eventDB.on('connect', () => {
  console.log('✅ Connected to Event Bot Database (READ-WRITE)');
});

eventDB.on('error', (err) => {
  console.error('❌ Event DB Error:', err);
});

module.exports = {
  mainDB,
  eventDB
};
