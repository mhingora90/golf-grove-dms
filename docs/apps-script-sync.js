// Google Apps Script — syncLeadsToCRM + backfillAllLeads
// Project: 1_k0ADnbsdTFeUjfgKZ5pFg1MTSnUzLMhMs6OtYMKiuSvqImrQyqi0S-e
// Sheet: "Automatic Meta Leads"

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';
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
  const idxLeadId    = idx('id') >= 0 ? idx('id') : idx('lead_id');

  const str = (i) => i >= 0 ? (String(row[i] || '').trim() || null) : null;

  return {
    name:         str(idxName),
    company_name: str(idxCompany),
    email:        str(idxEmail),
    phone:        str(idxPhone),
    created_time: str(idxBudget),
    ad_id:        str(idxPropType),
    meta_lead_id: str(idxLeadId),
    source:       'meta_ads',
  };
}

// Fires on sheet change — syncs new rows only (409 = already exists, treated as success)
function syncLeadsToCRM() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const lastRow = data[data.length - 1];
  const payload = buildPayload(headers, lastRow);

  if (!payload.meta_lead_id && !payload.email) return; // skip empty rows

  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/crm_leads', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      Prefer: 'return=minimal',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code !== 201 && code !== 409) {
    Logger.log('Insert failed: ' + code + ' ' + res.getContentText());
  }
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

    const res = UrlFetchApp.fetch(
      SUPABASE_URL + '/rest/v1/crm_leads?meta_lead_id=eq.' + encodeURIComponent(payload.meta_lead_id),
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
