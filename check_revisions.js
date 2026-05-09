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
  console.log('Drawing revisions file_paths:');
  const revs = await get('/rest/v1/drawing_revisions?select=id,drawing_id,revision,file_path,upload_date&order=upload_date.asc');
  if (Array.isArray(revs)) {
    revs.forEach(r => {
      console.log(`  Rev ${r.revision} | drawing: ${r.drawing_id.substring(0,8)}... | path: ${r.file_path || '(null)'}`);
    });
  } else {
    console.log('  Error:', JSON.stringify(revs).substring(0, 120));
  }

  console.log('\nStorage bucket contents:');
  const files = await get('/storage/v1/object/list/drawings');
  if (Array.isArray(files)) {
    files.forEach(f => console.log(`  ${f.name} (${f.metadata?.size || '?'} bytes)`));
  } else {
    console.log('  Error:', JSON.stringify(files).substring(0, 120));
  }
  console.log('\nDone.');
})();
