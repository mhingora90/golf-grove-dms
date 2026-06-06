import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) throw new Error('Set SUPABASE_SERVICE_KEY env var');

export function devClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
