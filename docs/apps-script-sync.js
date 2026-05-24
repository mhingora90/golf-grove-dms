// Google Apps Script — syncLeadsToCRM + backfillAllLeads
// Project: 1_k0ADnbsdTFeUjfgKZ5pFg1MTSnUzLMhMs6OtYMKiuSvqImrQyqi0S-e
// Sheet: "Automatic Meta Leads"

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
// Service role key — bypasses RLS so the script can insert leads without a user session.
// Safe here: Apps Script runs server-side and is not publicly visible.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1ODY2MywiZXhwIjoyMDkxMjM0NjYzfQ.q9i53Jx2GXHpX5t89Tdzly0WPiS-TOeiuY36D6uRnUA';
const SHEET_NAME = 'Automatic Meta Leads';

// Column mapping: sheet headers are misleading — actual data locations:
// adset_name → name
// adset_id   → company_name
// campaign_id → email
// campaign_name → phone
// created_time → budget (stored as created_time)
// ad_id        → property type (stored as ad_id)
// id (or lead_id) → meta_lead_id

function buildPayload(headers, row) {
  const idx = (h) => headers.findIndex(header => header === h);

  const idxName      = idx('adset_name');
  const idxCompany   = idx('adset_id');
  const idxEmail     = idx('campaign_id');
  const idxPhone     = idx('campaign_name');
  const idxBudget    = idx('created_time');
  const idxPropType  = idx('ad_id');
  const idxLeadId    = idx('form_name'); // e.g. "l:999128779718002" — strip "l:" prefix

  const str = (i) => i >= 0 ? (String(row[i] || '').trim() || null) : null;
  const rawId = str(idxLeadId) || '';
  const metaLeadId = rawId.startsWith('l:') ? rawId.slice(2) : (rawId || null);

  const phone = str(idxPhone);
  const phoneCleaned = phone ? phone.replace(/^p:/, '') : null;

  return {
    project_id:   '00000000-0000-0000-0000-000000000002', // 241 Waterside
    name:         str(idxName),
    company_name: str(idxCompany),
    email:        str(idxEmail),
    phone:        phoneCleaned,
    created_time: str(idxBudget),
    ad_id:        str(idxPropType),
    meta_lead_id: metaLeadId,
    source:       'meta_ads',
  };
}

// Runs hourly via time-based trigger.
// Scans ALL rows, finds leads where created_at = today, inserts only new ones.
// Uses ignore-duplicates — NEVER overwrites existing CRM data.
function syncTodayLeads() {
  const ss    = SpreadsheetApp.openById('1MilS5L6fbmbm4w1xStoVvitX5vgvyrG0RWczSHRxNqo');
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found: ' + SHEET_NAME); return; }

  const data = sheet.getDataRange().getValues();
  if (data.length < 3) return;

  // Row 0 = data row (SyncWith export), Row 1 = headers
  const headers  = data[1].map(h => String(h).trim().toLowerCase());
  const idx      = (h) => headers.findIndex(header => header === h);
  const idxName  = idx('adset_name');
  const idxCo    = idx('adset_id');
  const idxEmail = idx('campaign_id');
  const idxPhone = idx('campaign_name');
  const idxBudget= idx('created_time');
  const idxProp  = idx('ad_id');
  const idxDate  = idx('is_organic'); // actual Meta submission timestamp

  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  let inserted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 1) continue; // skip header row
    const row   = data[i];
    const str   = (j) => j >= 0 ? (String(row[j] || '').trim() || null) : null;
    const rawId = str(0) || '';
    const metaLeadId = rawId.startsWith('l:') ? rawId.slice(2) : (rawId || null);
    if (!metaLeadId) continue;

    // Only process leads submitted today
    const leadDate = str(idxDate) || '';
    if (!leadDate.startsWith(todayStr)) { skipped++; continue; }

    const payload = {
      project_id:   '00000000-0000-0000-0000-000000000002',
      meta_lead_id: metaLeadId,
      name:         str(idxName),
      company_name: str(idxCo),
      email:        str(idxEmail),
      phone:        str(idxPhone)?.replace(/^p:/, '') || null,
      created_time: str(idxBudget),
      ad_id:        str(idxProp),
      created_at:   str(idxDate),
      source:       'meta_ads',
    };

    const res = UrlFetchApp.fetch(
      SUPABASE_URL + '/rest/v1/crm_leads?on_conflict=meta_lead_id',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      }
    );

    const code = res.getResponseCode();
    if (code === 201 || code === 200 || code === 204) {
      inserted++;
    } else {
      errors++;
      Logger.log('Row ' + i + ' error ' + code + ': ' + res.getContentText());
    }
    Utilities.sleep(30);
  }

  Logger.log('Today sync done — inserted: ' + inserted + ', skipped (not today): ' + skipped + ', errors: ' + errors);
}

// Run manually once to backfill created_time + ad_id for ALL existing rows.
// Matches by meta_lead_id; updates created_time and ad_id only (won't overwrite name/email/etc).
function backfillAllLeads() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  let updated = 0, skipped = 0, errors = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const payload = buildPayload(headers, row);
    if (!payload.meta_lead_id) { skipped++; continue; }

    const update = {};
    if (payload.created_time) update.created_time = payload.created_time;
    if (payload.ad_id)        update.ad_id        = payload.ad_id;
    if (payload.company_name) update.company_name = payload.company_name;
    if (Object.keys(update).length === 0) { skipped++; continue; }

    // Match both stripped ('4210...') and prefixed ('l:4210...') forms
    const idRaw = payload.meta_lead_id;
    const idAlt = idRaw.startsWith('l:') ? idRaw.slice(2) : 'l:' + idRaw;
    const res = UrlFetchApp.fetch(
      SUPABASE_URL + '/rest/v1/crm_leads?or=(meta_lead_id.eq.' + encodeURIComponent(idRaw) + ',meta_lead_id.eq.' + encodeURIComponent(idAlt) + ')',
      {
        method: 'patch',
        contentType: 'application/json',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
          Prefer: 'return=minimal',
        },
        payload: JSON.stringify(update),
        muteHttpExceptions: true,
      }
    );

    const code = res.getResponseCode();
    if (code === 200 || code === 204) {
      updated++;
    } else {
      errors++;
      Logger.log('Row ' + i + ' error: ' + code + ' ' + res.getContentText());
    }

    Utilities.sleep(50); // avoid rate limits
  }

  Logger.log('Backfill done — updated: ' + updated + ', skipped: ' + skipped + ', errors: ' + errors);
}

// Upsert ALL rows from sheet into crm_leads.
// Uses data[1] as header row (SyncWith export: data[0] is a data row, data[1] is headers).
// on_conflict=meta_lead_id → insert new, update existing.
function upsertAllLeads() {
  const ss = SpreadsheetApp.openById('1MilS5L6fbmbm4w1xStoVvitX5vgvyrG0RWczSHRxNqo');
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found: ' + SHEET_NAME); return; }
  const data = sheet.getDataRange().getValues();
  if (data.length < 3) return;

  const headers = data[1].map(h => String(h).trim().toLowerCase());
  const idx = (h) => headers.findIndex(header => header === h);

  const idxName     = idx('adset_name');    // person name
  const idxCompany  = idx('adset_id');      // company/brokerage
  const idxEmail    = idx('campaign_id');   // email
  const idxPhone    = idx('campaign_name'); // phone with p: prefix
  const idxBudget   = idx('created_time');  // budget range
  const idxPropType = idx('ad_id');         // property type
  const idxDate     = idx('is_organic');    // col 1 — actual Meta submission timestamp (ISO)

  let inserted = 0, errors = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 1) continue; // skip header row
    const row = data[i];
    const str = (j) => j >= 0 ? (String(row[j] || '').trim() || null) : null;
    const rawId = str(0) || '';
    const metaLeadId = rawId.startsWith('l:') ? rawId.slice(2) : (rawId || null);
    if (!metaLeadId) continue;

    const payload = {
      project_id:   '00000000-0000-0000-0000-000000000002',
      meta_lead_id: metaLeadId,
      name:         str(idxName),
      company_name: str(idxCompany),
      email:        str(idxEmail),
      phone:        str(idxPhone)?.replace(/^p:/, '') || null,
      created_time: str(idxBudget),
      ad_id:        str(idxPropType),
      created_at:   str(idxDate),   // actual lead submission date from Meta
      source:       'meta_ads',
    };

    const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/crm_leads?on_conflict=meta_lead_id', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = res.getResponseCode();
    if (code === 201 || code === 200 || code === 204) {
      inserted++;
    } else {
      errors++;
      Logger.log('Row ' + i + ' error: ' + code + ' ' + res.getContentText());
    }
    Utilities.sleep(30);
  }

  Logger.log('Upsert done — processed: ' + inserted + ', errors: ' + errors);
}
