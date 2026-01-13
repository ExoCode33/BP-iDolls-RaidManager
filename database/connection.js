const { Pool } = require('pg');

// Read-only connection to main bot database
const mainDB = new Pool({
  connectionString: process.env.MAIN_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Event bot database (READ-WRITE)
const eventDB = new Pool({
  connectionString: process.env.EVENT_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
