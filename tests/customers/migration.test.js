import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient } from './helpers.js';

test('customers table exists with required columns', async () => {
  const db = devClient();
  // Probe by selecting the column set; this returns the empty rowset on success.
  const { error } = await db
    .from('customers')
    .select('id,name,phone,email,nationality,created_at,updated_at,created_by')
    .limit(0);
  assert.equal(error, null);
});
