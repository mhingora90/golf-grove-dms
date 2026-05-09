const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const SUPABASE_KEY = process.argv[2]; // Pass key as argument

if (!SUPABASE_KEY) {
  console.error('Usage: node run_migration.js <supabase-service-role-key>');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMigration() {
  const sql = `
    ALTER TABLE payment_certificates
      ADD COLUMN IF NOT EXISTS value_of_works numeric not null default 0,
      ADD COLUMN IF NOT EXISTS pc_ps_adjustments numeric not null default 0,
      ADD COLUMN IF NOT EXISTS advance_recovery_pct numeric not null default 10;
  `;

  const { error } = await sb.rpc('exec_sql', { sql });
  if (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  console.log('Migration successful!');
}

runMigration();
