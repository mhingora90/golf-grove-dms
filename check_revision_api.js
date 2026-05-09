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
  const drawingId = '43cdb941-76ee-4c6e-b609-e15e2715846a';
  console.log(`Fetching revisions for drawing ${drawingId.substring(0,8)}...`);
  const revs = await get(`/rest/v1/drawing_revisions?select=*&drawing_id=eq.${drawingId}&order=upload_date.asc`);
  if (Array.isArray(revs)) {
    console.log(`Found ${revs.length} revisions:`);
    revs.forEach(r => {
      console.log(`  Rev: ${r.revision}`);
      console.log(`    file_path type: ${typeof r.file_path}, value: ${r.file_path}`);
      console.log(`    keys: ${Object.keys(r).join(', ')}`);
    });
  } else {
    console.log('Error:', JSON.stringify(revs).substring(0, 150));
  }
})();
