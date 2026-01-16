const { Pool } = require('pg');

// Connection configuration with query timeout
const connectionConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Increased from 2000
  statement_timeout: 10000, // 10 second query timeout
  query_timeout: 10000,
};

// Read-only connection to main bot database
const mainDB = new Pool({
  connectionString: process.env.MAIN_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  ...connectionConfig
});

// Event bot database (READ-WRITE)
const eventDB = new Pool({
  connectionString: process.env.EVENT_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  ...connectionConfig
});

// ✅ IMPROVED - Connection tracking and health monitoring
let mainDBConnected = false;
let eventDBConnected = false;
let mainDBReconnectAttempts = 0;
let eventDBReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5 seconds

// Test connections and set up health monitoring
mainDB.on('connect', (client) => {
  console.log('✅ Connected to Main Bot Database (READ-ONLY)');
  mainDBConnected = true;
  mainDBReconnectAttempts = 0;
  
  // Set statement timeout for this connection
  client.query('SET statement_timeout = 10000').catch(err => {
    console.error('Failed to set statement timeout:', err);
  });
});

mainDB.on('error', (err, client) => {
  console.error('❌ Main DB Error:', err);
  mainDBConnected = false;
  
  // Attempt reconnection
  if (mainDBReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    mainDBReconnectAttempts++;
    console.log(`🔄 Attempting to reconnect to Main DB (attempt ${mainDBReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    setTimeout(async () => {
      try {
        await mainDB.query('SELECT 1');
        console.log('✅ Main DB reconnection successful');
      } catch (reconnectErr) {
        console.error('❌ Main DB reconnection failed:', reconnectErr);
      }
    }, RECONNECT_DELAY);
  } else {
    console.error('❌ Main DB: Maximum reconnection attempts reached. Manual intervention required.');
  }
});

mainDB.on('remove', () => {
  console.log('ℹ️ Main DB client removed from pool');
});

eventDB.on('connect', (client) => {
  console.log('✅ Connected to Event Bot Database (READ-WRITE)');
  eventDBConnected = true;
  eventDBReconnectAttempts = 0;
  
  // Set statement timeout for this connection
  client.query('SET statement_timeout = 10000').catch(err => {
    console.error('Failed to set statement timeout:', err);
  });
});

eventDB.on('error', (err, client) => {
  console.error('❌ Event DB Error:', err);
  eventDBConnected = false;
  
  // Attempt reconnection
  if (eventDBReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    eventDBReconnectAttempts++;
    console.log(`🔄 Attempting to reconnect to Event DB (attempt ${eventDBReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    setTimeout(async () => {
      try {
        await eventDB.query('SELECT 1');
        console.log('✅ Event DB reconnection successful');
      } catch (reconnectErr) {
        console.error('❌ Event DB reconnection failed:', reconnectErr);
      }
    }, RECONNECT_DELAY);
  } else {
    console.error('❌ Event DB: Maximum reconnection attempts reached. Manual intervention required.');
  }
});

eventDB.on('remove', () => {
  console.log('ℹ️ Event DB client removed from pool');
});

// ✅ NEW - Health check functions
async function checkMainDBHealth() {
  try {
    const result = await mainDB.query('SELECT 1 as health');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Main DB health check failed:', error);
    return false;
  }
}

async function checkEventDBHealth() {
  try {
    const result = await eventDB.query('SELECT 1 as health');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Event DB health check failed:', error);
    return false;
  }
}

async function getPoolStats() {
  return {
    mainDB: {
      total: mainDB.totalCount,
      idle: mainDB.idleCount,
      waiting: mainDB.waitingCount,
      connected: mainDBConnected
    },
    eventDB: {
      total: eventDB.totalCount,
      idle: eventDB.idleCount,
      waiting: eventDB.waitingCount,
      connected: eventDBConnected
    }
  };
}

// ✅ NEW - Periodic health checks (every 30 seconds)
setInterval(async () => {
  const mainHealth = await checkMainDBHealth();
  const eventHealth = await checkEventDBHealth();
  
  if (!mainHealth || !eventHealth) {
    const stats = await getPoolStats();
    console.warn('⚠️ Database health check warning:', {
      mainDB: mainHealth ? '✅' : '❌',
      eventDB: eventHealth ? '✅' : '❌',
      stats
    });
  }
}, 30000);

// ✅ NEW - Graceful shutdown handler
async function closeConnections() {
  console.log('🔄 Closing database connections...');
  
  try {
    await Promise.all([
      mainDB.end(),
      eventDB.end()
    ]);
    console.log('✅ Database connections closed successfully');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await closeConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeConnections();
  process.exit(0);
});

module.exports = {
  mainDB,
  eventDB,
  checkMainDBHealth,
  checkEventDBHealth,
  getPoolStats,
  closeConnections
};
