const { Pool } = require('pg');

// Parse connection URL or use individual variables
function createPool(prefix, isReadOnly = false) {
  // Option 1: Use DATABASE_URL if provided (Railway style)
  const dbUrl = process.env[`${prefix}_DB_URL`];
  
  if (dbUrl) {
    return new Pool({
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  
  // Option 2: Use individual PG* variables (Railway exports these too)
  return new Pool({
    host: process.env[`${prefix}_PGHOST`] || process.env[`${prefix}_DB_HOST`],
    port: parseInt(process.env[`${prefix}_PGPORT`] || process.env[`${prefix}_DB_PORT`]) || 5432,
    database: process.env[`${prefix}_PGDATABASE`] || process.env[`${prefix}_DB_NAME`],
    user: process.env[`${prefix}_PGUSER`] || process.env[`${prefix}_DB_USER`],
    password: process.env[`${prefix}_PGPASSWORD`] || process.env[`${prefix}_DB_PASSWORD`],
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

// Read-only connection to main bot database
const mainDB = createPool('MAIN', true);

// Event bot database (READ-WRITE)
const eventDB = createPool('EVENT', false);

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
