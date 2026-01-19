require('dotenv').config();
const { eventDB } = require('./connection');

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
  
  -- Role limits (auto-set based on raid_size)
  tank_slots INTEGER NOT NULL,
  support_slots INTEGER NOT NULL,
  dps_slots INTEGER NOT NULL,
  
  -- Discord resources
  message_id VARCHAR(20),
  channel_id VARCHAR(20) NOT NULL,
  main_role_id VARCHAR(20) NOT NULL,
  raid_slot INTEGER NOT NULL CHECK (raid_slot IN (1, 2)),
  
  -- Metadata
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  reminded_30m BOOLEAN DEFAULT false,
  locked BOOLEAN DEFAULT false,
  preset_id INTEGER,
  
  -- Ensure only 2 active raids max (enforced in application logic)
  CONSTRAINT unique_active_slot UNIQUE (raid_slot, status)
);

-- Raid registrations table
CREATE TABLE IF NOT EXISTS raid_registrations (
  id SERIAL PRIMARY KEY,
  raid_id INTEGER REFERENCES raids(id) ON DELETE CASCADE,
  user_id VARCHAR(20) NOT NULL,
  
  -- Character data (from main bot OR manual entry)
  character_id INTEGER,
  character_source VARCHAR(20) DEFAULT 'main_bot' CHECK (character_source IN ('main_bot', 'manual')),
  ign VARCHAR(100) NOT NULL,
  class VARCHAR(50) NOT NULL,
  subclass VARCHAR(50) NOT NULL,
  ability_score INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('Tank', 'DPS', 'Support')),
  
  -- Registration details
  registration_type VARCHAR(20) DEFAULT 'register' CHECK (registration_type IN ('register', 'assist')),
  status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered', 'waitlist')),
  registered_at TIMESTAMP DEFAULT NOW(),
  
  -- One registration per user per raid
  UNIQUE(raid_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_raids_status ON raids(status);
CREATE INDEX IF NOT EXISTS idx_raids_slot_status ON raids(raid_slot, status);
CREATE INDEX IF NOT EXISTS idx_raids_start_time ON raids(start_time);
CREATE INDEX IF NOT EXISTS idx_reg_raid_id ON raid_registrations(raid_id);
CREATE INDEX IF NOT EXISTS idx_reg_user_id ON raid_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_reg_raid_role_status ON raid_registrations(raid_id, role, status);
CREATE INDEX IF NOT EXISTS idx_reg_raid_status ON raid_registrations(raid_id, status);

-- Insert default config values (will skip if already exist)
INSERT INTO bot_config (key, value) VALUES 
  ('raid1_role_id', 'not_set'),
  ('raid2_role_id', 'not_set')
ON CONFLICT (key) DO NOTHING;

-- Add locked column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raids' AND column_name = 'locked'
  ) THEN
    ALTER TABLE raids ADD COLUMN locked BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add updated_at column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raids' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE raids ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- Add preset_id column if it doesn't exist (for existing databases)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'raids' AND column_name = 'preset_id'
  ) THEN
    ALTER TABLE raids ADD COLUMN preset_id INTEGER;
  END IF;
END $$;
`;

async function migrate() {
  try {
    console.log('🔄 Running database migrations...');
    await eventDB.query(schema);
    console.log('✅ Database migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
