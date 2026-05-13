const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5173;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

http.createServer((req, res) => {
  // Meta Conversions API webhook endpoint
  if (req.url === '/api/meta-lead' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const leadId = data.lead_id || data.leadgen_id || '';
        const formId = data.form_id || data.adgroup_id || '';
        const fields = {};
        (data.field_data || []).forEach(f => { fields[f.name] = (f.values || []).join(', '); });
        
        const lead = {
          name: fields.full_name || fields.first_name || fields.email || 'Unknown',
          email: fields.email || null,
          phone: fields.phone_number || fields.phone || null,
          source: 'meta_ads',
          meta_lead_id: leadId,
          meta_form_id: formId,
          first_name: fields.first_name || null,
          broker_type: fields.broker_type || null,
          budget_range: fields.budget_range || null,
          property_types: fields.property_types || null,
          availability: fields.availability || null,
          company_name: fields.company_name || null,
        };

        const supabaseUrl = process.env.SUPABASE_URL || 'https://kdxvhrwnnehicgdryowu.supabase.co';
        const supabaseKey = process.env.SUPABASE_KEY || '';
        
        if (!supabaseKey) {
          console.log('[Meta Lead] No SUPABASE_KEY set. Logging lead:', JSON.stringify(lead));
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({status:'logged_no_key', lead}));
          return;
        }

        const headers = {'apikey': supabaseKey, 'Authorization':'Bearer '+supabaseKey, 'Content-Type':'application/json', 'Prefer':'return=representation'};

        // Check for existing lead by meta_lead_id or email
        const orFilter = `meta_lead_id.eq.${leadId}` + (lead.email ? `,email.eq.${lead.email}` : '');
        const checkUrl = `${supabaseUrl}/rest/v1/crm_leads?select=id&or=(${orFilter})&limit=1`;
        const checkRes = await fetch(checkUrl, {headers});
        const existing = await checkRes.json();

        if (existing && existing.length > 0) {
          console.log(`[Meta Lead] Duplicate lead ${leadId}`);
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({status:'duplicate', id:existing[0].id}));
        } else {
          const insertRes = await fetch(`${supabaseUrl}/rest/v1/crm_leads`, {
            method:'POST', headers, body:JSON.stringify(lead),
          });
          const newLead = await insertRes.json();
          if (!insertRes.ok) {
            console.error('[Meta Lead] Error:', JSON.stringify(newLead));
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({error: newLead}));
          } else {
            console.log(`[Meta Lead] New lead: ${lead.name} (${leadId})`);
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify({status:'created', id:newLead[0]?.id}));
          }
        }
      } catch(e) {
        console.error('[Meta Lead] Error:', e.message);
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  let filePath = '.' + req.url;
  if (filePath === './') filePath = './index.html';
  
  // Handle SPA routing - all routes go to index.html
  if (!filePath.includes('.')) filePath = './index.html';
  
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for SPA
        fs.readFile('./index.html', (err2, content2) => {
          if (err2) {
            res.writeHead(500);
            res.end('Server Error');
          } else {
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
            res.end(content2, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(content, 'utf-8');
    }
  });
}).listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
