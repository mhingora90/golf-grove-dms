import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) throw new Error('Set SUPABASE_SERVICE_KEY env var');

export function devClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function makeMentionedUser(db) {
  const email = 'mention-' + Date.now() + '@test.local';
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: 'TestPass123!',
    email_confirm: true,
  });
  if (error) throw new Error('makeMentionedUser: ' + error.message);
  return { id: data.user.id };
}
