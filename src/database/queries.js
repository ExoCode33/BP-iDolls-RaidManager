const { mainDB, eventDB } = require('./connection');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════
// CONFIG QUERIES
// ═══════════════════════════════════════════════════════════════

async function getConfig(key) {
  const result = await eventDB.query(
    'SELECT value FROM bot_config WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value || null;
}

async function setConfig(key, value) {
  await eventDB.query(
    'INSERT INTO bot_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
    [key, value]
  );
}

// ═══════════════════════════════════════════════════════════════
// CHARACTER QUERIES
// ═══════════════════════════════════════════════════════════════

async function getUserCharacters(userId) {
  const result = await mainDB.query(
    'SELECT * FROM characters WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

// ═══════════════════════════════════════════════════════════════
// RAID SLOT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function getAvailableRaidSlot(startTime) {
  // Check if there are any raids at this time that aren't completed/cancelled
  const result = await eventDB.query(
    `SELECT raid_slot FROM raids 
     WHERE start_time = $1 
     AND status = 'open'
     ORDER BY raid_slot`,
    [startTime]
  );

  const occupiedSlots = result.rows.map(r => r.raid_slot);
  
  // Return first available slot (1 or 2)
  if (!occupiedSlots.includes(1)) return 1;
  if (!occupiedSlots.includes(2)) return 2;
  return null; // Both slots occupied
}

// ═══════════════════════════════════════════════════════════════
// RAID CRUD
// ═══════════════════════════════════════════════════════════════

async function createRaid(data) {
  const result = await eventDB.query(
    `INSERT INTO raids (name, raid_size, start_time, tank_slots, support_slots, dps_slots, channel_id, main_role_id, raid_slot, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.name,
      data.raid_size,
      data.start_time,
      data.tank_slots,
      data.support_slots,
      data.dps_slots,
      data.channel_id,
      data.main_role_id,
      data.raid_slot,
      data.created_by
    ]
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

async function getUnpostedRaids() {
  const result = await eventDB.query(
    `SELECT * FROM raids 
     WHERE message_id IS NULL 
     AND status = 'open'
     ORDER BY start_time ASC`
  );
  return result.rows;
}

async function getPostedRaids() {
  const result = await eventDB.query(
    `SELECT * FROM raids 
     WHERE message_id IS NOT NULL 
     AND status = 'open'
     ORDER BY start_time ASC`
  );
  return result.rows;
}

async function updateRaidMessageId(raidId, messageId) {
  await eventDB.query(
    'UPDATE raids SET message_id = $1, updated_at = NOW() WHERE id = $2',
    [messageId, raidId]
  );
}

async function updateRaidStatus(raidId, status) {
  await eventDB.query(
    'UPDATE raids SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, raidId]
  );
}

async function lockRaid(raidId) {
  await eventDB.query(
    'UPDATE raids SET locked = true, updated_at = NOW() WHERE id = $1',
    [raidId]
  );
}

async function unlockRaid(raidId) {
  await eventDB.query(
    'UPDATE raids SET locked = false, updated_at = NOW() WHERE id = $1',
    [raidId]
  );
}

async function updateRaid(raidId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = $${paramCount}`);
    values.push(value);
    paramCount++;
  }

  fields.push('updated_at = NOW()');
  values.push(raidId);

  await eventDB.query(
    `UPDATE raids SET ${fields.join(', ')} WHERE id = $${paramCount}`,
    values
  );
}

// ═══════════════════════════════════════════════════════════════
// REGISTRATION QUERIES
// ═══════════════════════════════════════════════════════════════

async function getRegistration(raidId, userId) {
  const result = await eventDB.query(
    'SELECT * FROM raid_registrations WHERE raid_id = $1 AND user_id = $2',
    [raidId, userId]
  );
  return result.rows[0] || null;
}

async function getRaidRegistrations(raidId) {
  const result = await eventDB.query(
    `SELECT * FROM raid_registrations 
     WHERE raid_id = $1 
     ORDER BY 
       CASE status 
         WHEN 'registered' THEN 1 
         WHEN 'assist' THEN 2
         WHEN 'waitlist' THEN 3 
       END,
       registered_at ASC`,
    [raidId]
  );
  return result.rows;
}

async function getRaidCounts(raidId) {
  const result = await eventDB.query(
    `SELECT 
       role,
       COUNT(*) FILTER (WHERE status IN ('registered', 'assist')) as filled,
       COUNT(*) FILTER (WHERE status = 'waitlist') as waitlist
     FROM raid_registrations 
     WHERE raid_id = $1 
     GROUP BY role`,
    [raidId]
  );

  const counts = {
    Tank: { filled: 0, waitlist: 0 },
    Support: { filled: 0, waitlist: 0 },
    DPS: { filled: 0, waitlist: 0 }
  };

  result.rows.forEach(row => {
    counts[row.role] = {
      filled: parseInt(row.filled),
      waitlist: parseInt(row.waitlist)
    };
  });

  return counts;
}

// ✅ UPDATED - Transaction-safe registration with proper locking
async function createRegistrationWithTransaction(data) {
  const client = await eventDB.connect();
  
  try {
    await client.query('BEGIN');

    // Lock the raid row to prevent race conditions
    const raidLock = await client.query(
      'SELECT * FROM raids WHERE id = $1 FOR UPDATE',
      [data.raid_id]
    );

    if (raidLock.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'RAID_NOT_FOUND' };
    }

    // Check if user is already registered
    const existingReg = await client.query(
      'SELECT * FROM raid_registrations WHERE raid_id = $1 AND user_id = $2',
      [data.raid_id, data.user_id]
    );

    if (existingReg.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'ALREADY_REGISTERED' };
    }

    // Get current counts
    const countsResult = await client.query(
      `SELECT 
         role,
         COUNT(*) FILTER (WHERE status IN ('registered', 'assist')) as filled
       FROM raid_registrations 
       WHERE raid_id = $1 
       GROUP BY role`,
      [data.raid_id]
    );

    const counts = {
      Tank: 0,
      Support: 0,
      DPS: 0
    };

    countsResult.rows.forEach(row => {
      counts[row.role] = parseInt(row.filled);
    });

    const raid = data.raid;
    const roleSlots = {
      Tank: raid.tank_slots,
      Support: raid.support_slots,
      DPS: raid.dps_slots
    };

    // Determine initial status
    let status = 'registered';
    let demotedPlayer = null;

    if (counts[data.role] >= roleSlots[data.role]) {
      // Role is full, go to waitlist
      status = 'waitlist';
    } else if (data.registration_type === 'assist') {
      // Assist registrations stay as assist
      status = 'assist';
    }

    // Check if we need to demote someone
    if (status === 'registered' || status === 'assist') {
      // Get the lowest priority player in this role
      const demoteCheck = await client.query(
        `SELECT * FROM raid_registrations 
         WHERE raid_id = $1 AND role = $2 AND status IN ('registered', 'assist')
         ORDER BY 
           CASE status 
             WHEN 'assist' THEN 2
             WHEN 'registered' THEN 1
           END DESC,
           registered_at DESC
         LIMIT 1`,
        [data.raid_id, data.role]
      );

      if (demoteCheck.rows.length > 0 && counts[data.role] >= roleSlots[data.role]) {
        demotedPlayer = demoteCheck.rows[0];
        
        // Demote the player
        await client.query(
          'UPDATE raid_registrations SET status = $1 WHERE id = $2',
          ['waitlist', demotedPlayer.id]
        );
      }
    }

    // Insert new registration
    const result = await client.query(
      `INSERT INTO raid_registrations 
       (raid_id, user_id, character_id, character_source, ign, class, subclass, ability_score, role, registration_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.raid_id,
        data.user_id,
        data.character_id,
        data.character_source,
        data.ign,
        data.class,
        data.subclass,
        data.ability_score,
        data.role,
        data.registration_type,
        status
      ]
    );

    await client.query('COMMIT');
    
    return {
      success: true,
      registration: result.rows[0],
      status,
      demotedPlayer
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction registration error:', error);
    
    // Log database error
    await logger.logDatabaseError('createRegistrationWithTransaction', error, data);
    
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
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

async function findNextWaitlistPlayer(raidId, role) {
  const result = await eventDB.query(
    `SELECT * FROM raid_registrations 
     WHERE raid_id = $1 AND role = $2 AND status = 'waitlist'
     ORDER BY registered_at ASC
     LIMIT 1`,
    [raidId, role]
  );
  return result.rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════
// REMINDER & AUTO-COMPLETE
// ═══════════════════════════════════════════════════════════════

async function getActiveRaids() {
  const result = await eventDB.query(
    `SELECT * FROM raids 
     WHERE status = 'open' 
     AND start_time > NOW() - INTERVAL '3 hours'
     ORDER BY start_time ASC`
  );
  return result.rows;
}

async function markRaidReminded(raidId) {
  await eventDB.query(
    'UPDATE raids SET reminded_30m = true, updated_at = NOW() WHERE id = $1',
    [raidId]
  );
}

// ═══════════════════════════════════════════════════════════════
// RAID POST CREATION
// ═══════════════════════════════════════════════════════════════

async function createRaidPost(raid, channel) {
  const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');
  
  const registrations = await getRaidRegistrations(raid.id);
  const embed = await createRaidEmbed(raid, registrations);
  const buttons = createRaidButtons(raid.id, raid.locked);

  const message = await channel.send({
    content: `<@&${raid.main_role_id}>`,
    embeds: [embed],
    components: [buttons]
  });

  return message.id;
}

module.exports = {
  getConfig,
  setConfig,
  getUserCharacters,
  getAvailableRaidSlot,
  createRaid,
  getRaid,
  getUnpostedRaids,
  getPostedRaids,
  updateRaidMessageId,
  updateRaidStatus,
  lockRaid,
  unlockRaid,
  updateRaid,
  getRegistration,
  getRaidRegistrations,
  getRaidCounts,
  createRegistrationWithTransaction,
  deleteRegistration,
  updateRegistrationStatus,
  findNextWaitlistPlayer,
  getActiveRaids,
  markRaidReminded,
  createRaidPost
};
