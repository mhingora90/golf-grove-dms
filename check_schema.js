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
  console.log('1. All columns on drawing_revisions:');
  const meta = await get('/rest/v1/drawing_revisions?select=*');
  if (Array.isArray(meta) && meta.length) {
    console.log('  Columns:', Object.keys(meta[0]).join(', '));
    console.log('  First row:', JSON.stringify(meta[0], null, 2));
  } else {
    console.log('  Error:', JSON.stringify(meta).substring(0, 120));
  }

  console.log('\n2. Verify storage bucket name via public URL...');
  // Try getting public URL for the known file
  const fp = '43cdb941-76ee-4c6e-b609-e15e2715846a/Rev_B_1776638554530.pdf';
  const pubUrl = `${url}/storage/v1/object/public/drawings/${fp}`;
  console.log(`  Public URL: ${pubUrl}`);
  console.log('  (You can paste this into a browser to test)');
  
  console.log('\nDone.');
})();
