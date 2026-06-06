import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient, makeMentionedUser } from './helpers.js';

test('mentioning a user in a customer activity fans out a notification with customer_id', async () => {
  const db = devClient();
  const recipient = await makeMentionedUser(db);
  const { data: c } = await db.from('customers').insert({ name: 'Notif Test' }).select('id').single();

  const { data: act, error } = await db.from('crm_lead_activities').insert({
    customer_id: c.id, method: 'note', body: 'ping @user', author_name: 'dev', mentions: [recipient.id]
  }).select('id').single();
  assert.equal(error, null);

  const { data: n } = await db.from('crm_notifications')
    .select('user_id, lead_id, customer_id, type')
    .eq('activity_id', act.id);
  assert.equal(n.length, 1);
  assert.equal(n[0].user_id, recipient.id);
  assert.equal(n[0].customer_id, c.id);
  assert.equal(n[0].lead_id, null);
  assert.equal(n[0].type, 'mention');

  await db.from('crm_lead_activities').delete().eq('id', act.id);
  await db.from('customers').delete().eq('id', c.id);
});
