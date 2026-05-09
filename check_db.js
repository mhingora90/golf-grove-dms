const https = require('https');
const url = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';

function get(path) {
  return new Promise(resolve => {
    https.get(`${url}${path}`, { headers: { 'Authorization': `Bearer ${key}`, 'apikey': key } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
  });
}

(async () => {
  console.log('1. Listing ALL storage buckets...');
  const buckets = await get('/storage/v1/bucket');
  if (Array.isArray(buckets)) {
    console.log(`  Found ${buckets.length} bucket(s):`);
    buckets.forEach(b => console.log(`    - ${b.id} (public: ${b.public})`));
  } else {
    console.log(`  Error: ${JSON.stringify(buckets).substring(0,150)}`);
  }

  console.log('\n2. Trying bucket name "drawings"...');
  const r1 = await get('/storage/v1/object/list/drawings');
  if (Array.isArray(r1)) {
    console.log(`  Found ${r1.length} objects:`);
    r1.forEach(f => console.log(`    ${f.name} (${f.metadata?.size || '?'} bytes)`));
  } else {
    console.log(`  Response: ${JSON.stringify(r1).substring(0,150)}`);
  }

  console.log('\n3. Checking if drawings with file_path reference existing storage files...');
  const drawings = await get('/rest/v1/drawings?select=id,file_path&file_path=not.is.null&limit=5');
  if (Array.isArray(drawings) && drawings.length) {
    console.log('  Sample file_paths in DB:');
    drawings.forEach(d => console.log(`    ${d.file_path}`));
  }
  console.log('\nDone.');
})();
