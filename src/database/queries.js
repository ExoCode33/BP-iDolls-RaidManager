const { mainDB, eventDB } = require('./connection');

// ==================== CONFIG ====================

async function getConfig(key) {
  const result = await eventDB.query('SELECT value FROM bot_config WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

async function setConfig(key, value) {
  await eventDB.query(
    'INSERT INTO bot_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
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

// ==================== MAIN BOT DATABASE (READ-ONLY) ====================

async function getUserCharacters(userId) {
  const result = await mainDB.query(
    `SELECT 
      id, 
      user_id,
      ign, 
      class, 
      subclass, 
      ability_score,
      character_type 
    FROM characters 
    WHERE user_id = $1 
    ORDER BY 
      CASE 
        WHEN character_type = 'Main' THEN 1
        WHEN character_type = 'Subclass' THEN 2
        WHEN character_type = 'Alt' THEN 3
        ELSE 4
      END,
      ability_score DESC`,
    [userId]
  );
  return result.rows;
}

async function getCharacterById(characterId) {
  const result = await mainDB.query(
    'SELECT id, user_id, ign, class, subclass, ability_score, character_type FROM characters WHERE id = $1',
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
  const result = await eventDB.query('SELECT * FROM raids WHERE id = $1', [raidId]);
  return result.rows[0] || null;
}

async function updateRaidMessageId(raidId, messageId) {
  await eventDB.query('UPDATE raids SET message_id = $1 WHERE id = $2', [messageId, raidId]);
}

async function updateRaidStatus(raidId, status) {
  await eventDB.query('UPDATE raids SET status = $1 WHERE id = $2', [status, raidId]);
}

async function updateRaid(raidId, data) {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.start_time !== undefined) {
    updates.push(`start_time = $${paramIndex++}`);
    values.push(data.start_time);
  }
  if (data.raid_size !== undefined) {
    updates.push(`raid_size = $${paramIndex++}`);
    values.push(data.raid_size);
  }

  values.push(raidId);
  await eventDB.query(`UPDATE raids SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
}

async function getActiveRaids() {
  const result = await eventDB.query(
    "SELECT * FROM raids WHERE status = 'open' ORDER BY start_time ASC"
  );
  return result.rows;
}

async function getActiveRaidCount() {
  const result = await eventDB.query("SELECT COUNT(*) FROM raids WHERE status = 'open'");
  return parseInt(result.rows[0].count);
}

async function getAvailableRaidSlot() {
  const result = await eventDB.query(
    "SELECT raid_slot FROM raids WHERE status = 'open' ORDER BY raid_slot"
  );
  
  if (result.rows.length === 0) return 1;
  if (result.rows.length === 1) {
    return result.rows[0].raid_slot === 1 ? 2 : 1;
  }
  return null; // Both slots taken
}

async function markRaidReminded(raidId) {
  await eventDB.query('UPDATE raids SET reminded_30m = true WHERE id = $1', [raidId]);
}

async function getUpcomingRaids() {
  const now = new Date();
  const thirtyMinLater = new Date(now.getTime() + 31 * 60 * 1000);
  const twentyNineMinLater = new Date(now.getTime() + 29 * 60 * 1000);

  const result = await eventDB.query(
    `SELECT * FROM raids 
     WHERE status = 'open' 
       AND reminded_30m = false 
       AND start_time BETWEEN $1 AND $2`,
    [twentyNineMinLater, thirtyMinLater]
  );
  return result.rows;
}

// ==================== REGISTRATIONS ====================

async function createRegistration(data) {
  const result = await eventDB.query(
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
      data.status
    ]
  );
  return result.rows[0];
}

async function getRegistration(raidId, userId) {
  const result = await eventDB.query(
    'SELECT * FROM raid_registrations WHERE raid_id = $1 AND user_id = $2',
    [raidId, userId]
  );
  return result.rows[0] || null;
}

async function deleteRegistration(raidId, userId) {
  await eventDB.query('DELETE FROM raid_registrations WHERE raid_id = $1 AND user_id = $2', [raidId, userId]);
}

async function updateRegistrationStatus(registrationId, status) {
  await eventDB.query('UPDATE raid_registrations SET status = $1 WHERE id = $2', [status, registrationId]);
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
    `SELECT 
      role,
      status,
      COUNT(*) as count
    FROM raid_registrations
    WHERE raid_id = $1
    GROUP BY role, status`,
    [raidId]
  );

  const counts = {
    Tank: { registered: 0, waitlist: 0 },
    DPS: { registered: 0, waitlist: 0 },
    Support: { registered: 0, waitlist: 0 },
    total_registered: 0,
    total_waitlist: 0
  };

  result.rows.forEach(row => {
    counts[row.role][row.status] = parseInt(row.count);
    if (row.status === 'registered') {
      counts.total_registered += parseInt(row.count);
    } else {
      counts.total_waitlist += parseInt(row.count);
    }
  });

  return counts;
}

async function findNextWaitlistPlayer(raidId, role, preferredType = 'register') {
  // First try to find preferred type
  let result = await eventDB.query(
    `SELECT * FROM raid_registrations 
     WHERE raid_id = $1 AND role = $2 AND status = 'waitlist' AND registration_type = $3
     ORDER BY registered_at ASC LIMIT 1`,
    [raidId, role, preferredType]
  );

  if (result.rows.length > 0) return result.rows[0];

  // If not found, try other type
  const otherType = preferredType === 'register' ? 'assist' : 'register';
  result = await eventDB.query(
    `SELECT * FROM raid_registrations 
     WHERE raid_id = $1 AND role = $2 AND status = 'waitlist' AND registration_type = $3
     ORDER BY registered_at ASC LIMIT 1`,
    [raidId, role, otherType]
  );

  return result.rows[0] || null;
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

// Helper functions for admin commands
async function completeRaid(raidId) {
  return await updateRaidStatus(raidId, 'completed');
}

async function cancelRaid(raidId) {
  return await updateRaidStatus(raidId, 'cancelled');
}

// Helper function for creating raid posts
async function createRaidPost(raid, channel) {
  const { createRaidEmbed, createRaidButtons } = require('../utils/embeds');
  const embed = createRaidEmbed(raid, []);
  const buttons = createRaidButtons(raid.id);
  
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
  getActiveRaidCount,
  getAvailableRaidSlot,
  markRaidReminded,
  getUpcomingRaids,
  completeRaid,
  cancelRaid,
  createRaidPost,
  
  // Registrations
  createRegistration,
  getRegistration,
  deleteRegistration,
  updateRegistrationStatus,
  getRaidRegistrations,
  getRaidCounts,
  findNextWaitlistPlayer,
  getUserRaids
};
