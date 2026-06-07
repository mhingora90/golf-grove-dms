#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const cmd = process.argv[2];
if (!cmd) { console.error('Usage: db-cli <push|pull|status>'); process.exit(2); }

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('SUPABASE_DB_URL not set. Run via npm script (dotenv loads .env.local).'); process.exit(2); }

const argMap = {
  push:   ['db', 'push', '--db-url', url],
  pull:   ['db', 'pull', '--db-url', url],
  status: ['migration', 'list', '--db-url', url],
};
if (!argMap[cmd]) { console.error(`Unknown: ${cmd}`); process.exit(2); }

const r = spawnSync('npx', ['supabase', ...argMap[cmd]], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
