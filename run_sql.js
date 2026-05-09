const https = require('https');

const url = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';

const sql = `UPDATE drawing_revisions 
SET file_path = '43cdb941-76ee-4c6e-b609-e15e2715846a/Rev_B_1776638554530.pdf'
WHERE drawing_id = '43cdb941-76ee-4c6e-b609-e15e2715846a' 
AND revision = 'Rev B';`;

console.log('Executing SQL...');
console.log(sql);
console.log('');

const body = JSON.stringify({ query: sql });

const req = https.request(`${url}/pg/v1/query`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${key}`, 
    'apikey': key,
    'Content-Type': 'application/json' 
  }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (result.error) {
        console.log('Error:', result.error.message);
      } else {
        console.log('Success:', JSON.stringify(result, null, 2).substring(0, 200));
      }
    } catch(e) {
      console.log('Response:', data.substring(0, 200));
    }
  });
});

req.on('error', e => console.error('Network error:', e.message));
req.write(body);
req.end();
