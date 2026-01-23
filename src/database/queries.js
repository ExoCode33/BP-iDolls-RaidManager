const { mainDB, eventDB } = require('./connection');

// ==================== CONFIG ====================

async function getConfig(key) {
  const result = await eventDB.query(
    'SELECT value FROM bot_config WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value || null;
}

async function setConfig(key, value) {
  await eventDB.query(
    'INSERT INTO bot_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, value]
  );
}

async function getAllConfig() {
  const result = await eventDB.query('SELECT key, value FROM bot_config');
  return result.rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

// ==================== MAIN DB (READ-ONLY) ====================

async function getUserCharacters(userId) {
  const result = await mainDB.query(
    `SELECT * FROM characters WHERE user_id = $1 ORDER BY character_type ASC`,
    [userId]
  );
  return result.rows;
}

async function getCharacterById(characterId) {
  const result = await mainDB.query(
    'SELECT * FROM characters WHERE id = $1',
    [characterId]
  );
  return result.rows[0] || null;
}

// ==================== RAIDS ====================

async function createRaid(data) {
  const result = await eventDB.query(
    `INSERT INTO raids 
    (name, raid_size, start_time, tank_slots, support_slots, dps_slots, channel_id, main_role_id, raid_slot, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [data.name, data.raid_size, data.start_time, data.tank_slots, data.support_slots, 
     data.dps_slots, data.channel_id, data.main_role_id, data.raid_slot, data.created_by]
  );
  return result.rows[0];
}

async function getRaid(raidId) {
  const result = await eventDB.query(
    'SELECT * FROM raids WHERE id = $1',
    [raidId]
  );
  return result.rows[0] || null;
}

async function updateRaidMessageId(raidId, messageId) {
  await eventDB.query(
    'UPDATE raids SET message_id = $1 WHERE id = $2',
    [messageId, raidId]
  );
}

async function updateRaidStatus(raidId, status) {
  await eventDB.query(
    'UPDATE raids SET status = $1 WHERE id = $2',
    [status, raidId]
  );
}

async function updateRaid(raidId, data) {
  const ALLOWED_FIELDS = [
    'name', 'raid_size', 'start_time', 'tank_slots', 'support_slots', 
    'dps_slots', 'channel_id', 'main_role_id', 'raid_slot', 'status',
    'message_id', 'reminded_30m', 'locked', 'preset_id',
    'lock_notification_message_id', 'reminder_message_id'
  ];

  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (!ALLOWED_FIELDS.includes(key)) {
      console.warn(`Attempted to update non-whitelisted field: ${key}`);
      return;
    }
    
    fields.push(`${key} = $${paramCount}`);
    values.push(value);
    paramCount++;
  });

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(raidId);

  await eventDB.query(
    `UPDATE raids SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`,
    values
  );
}

async function getActiveRaids() {
  const result = await eventDB.query(
    "SELECT * FROM raids WHERE status = 'open' ORDER BY start_time ASC"
  );
  return result.rows;
}

async function getUnpostedRaids() {
  const result = await eventDB.query(
    "SELECT * FROM raids WHERE message_id IS NULL AND status = 'open' ORDER BY start_time ASC"
  );
  return result.rows;
}

async function getPostedRaids() {
  const result = await eventDB.query(
    "SELECT * FROM raids WHERE message_id IS NOT NULL AND status = 'open' ORDER BY start_time ASC"
  );
  return result.rows;
}

async function getActiveRaidCount() {
  const result = await eventDB.query(
    "SELECT COUNT(*) as count FROM raids WHERE status = 'open'"
  );
  return parseInt(result.rows[0].count);
}

async function getAvailableRaidSlot() {
  const result = await eventDB.query(
    "SELECT raid_slot FROM raids WHERE status = 'open' ORDER BY raid_slot"
  );
  
  const usedSlots = result.rows.map(r => r.raid_slot);
  
  if (!usedSlots.includes(1)) return 1;
  if (!usedSlots.includes(2)) return 2;
  return null;
}

async function markRaidReminded(raidId) {
  await eventDB.query(
    'UPDATE raids SET reminded_30m = true WHERE id = $1',
    [raidId]
  );
}

async function getUpcomingRaids() {
  const result = await eventDB.query(
    `SELECT * FROM raids 
     WHERE status = 'open' 
     AND reminded_30m = false 
     AND start_time > NOW() 
     AND start_time <= NOW() + INTERVAL '30 minutes'`
  );
  return result.rows;
}

async function lockRaid(raidId) {
  await eventDB.query(
    'UPDATE raids SET locked = true WHERE id = $1',
    [raidId]
  );
}

async function unlockRaid(raidId) {
  await eventDB.query(
    'UPDATE raids SET locked = false WHERE id = $1',
    [raidId]
  );
}

// ==================== REGISTRATIONS ====================

async function createRegistration(data) {
  const result = await eventDB.query(
    `INSERT INTO raid_registrations 
    (raid_id, user_id, character_id, character_source, ign, class, subclass, ability_score, role, registration_type, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [data.raid_id, data.user_id, data.character_id, data.character_source || 'main_bot',
     data.ign, data.class, data.subclass, data.ability_score, data.role, 
     data.registration_type, data.status]
  );
  return result.rows[0];
}

// ✅ FIXED - Transaction-safe registration with auto-demotion that stops when locked
async function createRegistrationWithTransaction(data) {
  const client = await eventDB.connect();
  
  try {
    await client.query('BEGIN');
    
    // Lock the raid row to prevent concurrent modifications
    const raidResult = await client.query(
      'SELECT * FROM raids WHERE id = $1 FOR UPDATE',
      [data.raid_id]
    );
    
    const raid = raidResult.rows[0];
    
    // ✅ NEW: Check if raid is locked - if locked, no auto-demotion allowed
    const isLocked = raid.locked;
    
    // Check if user is already registered
    const existingCheck = await client.query(
      'SELECT * FROM raid_registrations WHERE raid_id = $1 AND user_id = $2',
      [data.raid_id, data.user_id]
    );
    
    if (existingCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'ALREADY_REGISTERED' };
    }
    
    // Get current counts with lock
    const countsResult = await client.query(
      `SELECT role, status, registration_type, COUNT(*) as count
       FROM raid_registrations
       WHERE raid_id = $1
       GROUP BY role, status, registration_type`,
      [data.raid_id]
    );
    
    const counts = {
      Tank: { registered: 0, waitlist: 0, assist: 0 },
      Support: { registered: 0, waitlist: 0, assist: 0 },
      DPS: { registered: 0, waitlist: 0, assist: 0 },
      total_registered: 0,
      total_waitlist: 0,
      total_assist: 0
    };
    
    countsResult.rows.forEach(row => {
      counts[row.role][row.status] = (counts[row.role][row.status] || 0) + parseInt(row.count);
      if (row.status === 'registered') {
        counts.total_registered += parseInt(row.count);
      } else if (row.status === 'waitlist') {
        counts.total_waitlist += parseInt(row.count);
      } else if (row.status === 'assist') {
        counts.total_assist += parseInt(row.count);
      }
    });
    
    const role = data.role;
    const registrationType = data.registration_type;
    
    let status;
    let demotedPlayer = null;
    
    // Determine status based on raid capacity
    if (registrationType === 'assist') {
      const roleTotal = counts[role].registered + counts[role].assist;
      const roleFull = roleTotal >= raid[`${role.toLowerCase()}_slots`];
      const raidTotal = counts.total_registered + counts.total_assist;
      const raidFull = raidTotal >= raid.raid_size;
      
      if (roleFull || raidFull) {
        status = 'waitlist';
      } else {
        status = 'assist';
      }
    } else {
      // registrationType === 'register'
      const roleTotal = counts[role].registered + counts[role].assist;
      const roleFull = roleTotal >= raid[`${role.toLowerCase()}_slots`];
      const raidTotal = counts.total_registered + counts.total_assist;
      const raidFull = raidTotal >= raid.raid_size;
      
      // ✅ NEW: Auto-demotion logic (only if raid is NOT locked)
      if (!isLocked && (roleFull || raidFull)) {
        // Role is full - check if there's an assist player to demote
        const assistToDemote = await client.query(
          `SELECT * FROM raid_registrations
           WHERE raid_id = $1 AND role = $2 AND status = 'assist' AND registration_type = 'assist'
           ORDER BY registered_at DESC
           LIMIT 1
           FOR UPDATE`,
          [data.raid_id, role]
        );
        
        if (assistToDemote.rows.length > 0) {
          // Demote the most recent assist player to waitlist
          demotedPlayer = assistToDemote.rows[0];
          await client.query(
            'UPDATE raid_registrations SET status = $1 WHERE id = $2',
            ['waitlist', demotedPlayer.id]
          );
          
          console.log(`🔄 Auto-demoted ${demotedPlayer.ign} (assist) to waitlist to make room for ${data.ign} (register)`);
          
          // Now there's a slot available
          status = 'registered';
        } else {
          // No assist to demote, go to waitlist
          status = 'waitlist';
        }
      } else if (roleFull || raidFull) {
        // Raid is locked OR no assist to demote
        status = 'waitlist';
      } else {
        // There's space
        status = 'registered';
      }
    }
    
    // Insert registration
    const result = await client.query(
      `INSERT INTO raid_registrations 
      (raid_id, user_id, character_id, character_source, ign, class, subclass, ability_score, role, registration_type, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [data.raid_id, data.user_id, data.character_id, data.character_source || 'main_bot',
       data.ign, data.class, data.subclass, data.ability_score, data.role, 
       data.registration_type, status]
    );
    
    await client.query('COMMIT');
    
    return { 
      success: true, 
      registration: result.rows[0],
      status: status,
      demotedPlayer: demotedPlayer // Return demoted player info for notification
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction registration error:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

async function getRegistration(raidId, userId) {
  const result = await eventDB.query(
    'SELECT * FROM raid_registrations WHERE raid_id = $1 AND user_id = $2',
    [raidId, userId]
  );
  return result.rows[0] || null;
}

async function deleteRegistration(raidId, userId) {
  await eventDB.query(
    'DELETE FROM raid_registrations WHERE raid_id = $1 AND user_id = $2',
    [raidId, userId]
  );
}

async function updateRegistrationStatus(registrationId, status) {
  await eventDB.query(
    'UPDATE raid_registrations SET status = $1 WHERE id = $2',
    [status, registrationId]
  );
}

async function getRaidRegistrations(raidId) {
  const result = await eventDB.query(
    'SELECT * FROM raid_registrations WHERE raid_id = $1 ORDER BY registered_at ASC',
    [raidId]
  );
  return result.rows;
}

async function getRaidCounts(raidId) {
  const result = await eventDB.query(
    `SELECT role, status, COUNT(*) as count
     FROM raid_registrations
     WHERE raid_id = $1
     GROUP BY role, status`,
    [raidId]
  );

  const counts = {
    Tank: { registered: 0, waitlist: 0, assist: 0 },
    Support: { registered: 0, waitlist: 0, assist: 0 },
    DPS: { registered: 0, waitlist: 0, assist: 0 },
    total_registered: 0,
    total_waitlist: 0,
    total_assist: 0
  };

  result.rows.forEach(row => {
    counts[row.role][row.status] = parseInt(row.count);
    if (row.status === 'registered') {
      counts.total_registered += parseInt(row.count);
    } else if (row.status === 'waitlist') {
      counts.total_waitlist += parseInt(row.count);
    } else if (row.status === 'assist') {
      counts.total_assist += parseInt(row.count);
    }
  });

  return counts;
}

// ✅ OPTIMIZED - Single query with priority ordering (register > assist)
async function findNextWaitlistPlayer(raidId, role) {
  const client = await eventDB.connect();
  
  try {
    await client.query('BEGIN');
    
    // Prioritize 'register' over 'assist', then earliest registration (FIFO)
    const result = await client.query(
      `SELECT * FROM raid_registrations 
       WHERE raid_id = $1 AND role = $2 AND status = 'waitlist'
       ORDER BY 
         CASE registration_type 
           WHEN 'register' THEN 1 
           WHEN 'assist' THEN 2 
         END ASC,
         registered_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [raidId, role]
    );
    
    await client.query('COMMIT');
    return result.rows[0] || null;
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Find next waitlist player error:', error);
    return null;
  } finally {
    client.release();
  }
}

async function getUserRaids(userId) {
  const result = await eventDB.query(
    `SELECT r.*, reg.status as registration_status, reg.role as user_role
     FROM raids r
     JOIN raid_registrations reg ON r.id = reg.raid_id
     WHERE reg.user_id = $1 AND r.status = 'open'
     ORDER BY r.start_time ASC`,
    [userId]
  );
  return result.rows;
}

// ==================== HELPER FUNCTIONS ====================

async function completeRaid(raidId) {
  return await updateRaidStatus(raidId, 'completed');
}

async function cancelRaid(raidId) {
  return await updateRaidStatus(raidId, 'cancelled');
}

async function createRaidPost(raid, channel) {
  const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');
  
  const registrations = await getRaidRegistrations(raid.id);
  
  const embed = await createRaidEmbed(raid, registrations);
  const buttons = createRaidButtons(raid.id, raid.locked);
  
  const message = await channel.send({
    embeds: [embed],
    components: [buttons]
  });
  
  return message.id;
}

module.exports = {
  // Config
  getConfig,
  setConfig,
  getAllConfig,
  
  // Main DB (READ-ONLY)
  getUserCharacters,
  getCharacterById,
  
  // Raids
  createRaid,
  getRaid,
  updateRaidMessageId,
  updateRaidStatus,
  updateRaid,
  getActiveRaids,
  getUnpostedRaids,
  getPostedRaids,
  getActiveRaidCount,
  getAvailableRaidSlot,
  markRaidReminded,
  getUpcomingRaids,
  lockRaid,
  unlockRaid,
  completeRaid,
  cancelRaid,
  createRaidPost,
  
  // Registrations
  createRegistration,
  createRegistrationWithTransaction,
  getRegistration,
  deleteRegistration,
  updateRegistrationStatus,
  getRaidRegistrations,
  getRaidCounts,
  findNextWaitlistPlayer,
  getUserRaids
};
