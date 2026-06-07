#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.env.BACKUP_DIR || 'backups/storage';
const BUCKETS = (process.env.BACKUP_BUCKETS || 'drawings,attachments').split(',').map(s => s.trim()).filter(Boolean);

if (!URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');
  process.exit(2);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function walk(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        const sub = await walk(bucket, path);
        out.push(...sub);
      } else {
        out.push({ path, size: item.metadata?.size ?? null, updated_at: item.updated_at });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function syncBucket(bucket) {
  console.log(`[${bucket}] listing...`);
  const objects = await walk(bucket);
  console.log(`[${bucket}] ${objects.length} objects`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const obj of objects) {
    const localPath = join(OUT, bucket, obj.path);
    let needFetch = true;
    try {
      const s = await stat(localPath);
      if (obj.size !== null && s.size === obj.size) needFetch = false;
    } catch { /* not present */ }

    if (!needFetch) { skipped++; continue; }

    const { data, error } = await sb.storage.from(bucket).download(obj.path);
    if (error) {
      console.error(`  FAIL ${obj.path}: ${error.message}`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, buf);
    downloaded++;
  }

  console.log(`[${bucket}] downloaded=${downloaded} skipped=${skipped} failed=${failed}`);
  return { downloaded, skipped, failed };
}

let totalFail = 0;
for (const b of BUCKETS) {
  try {
    const r = await syncBucket(b);
    totalFail += r.failed;
  } catch (e) {
    console.error(`[${b}] ERROR: ${e.message}`);
    totalFail++;
  }
}

process.exit(totalFail > 0 ? 1 : 0);
