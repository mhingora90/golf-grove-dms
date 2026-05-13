export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;
    const leadId = data.lead_id || data.leadgen_id || '';
    const formId = data.form_id || data.adgroup_id || '';
    
    // Extract fields - handle both flat and nested field_data formats
    const fields = {};
    if (data.field_data && Array.isArray(data.field_data)) {
      data.field_data.forEach(f => { fields[f.name] = (f.values || []).join(', '); });
    }
    // Also check for flat fields (Zapier sends them flat)
    if (data.full_name) fields.full_name = data.full_name;
    if (data.email) fields.email = data.email;
    if (data.phone_number) fields.phone_number = data.phone_number;
    if (data.first_name) fields.first_name = data.first_name;
    if (data.company_name) fields.company_name = data.company_name;
    if (data.broker_type) fields.broker_type = data.broker_type;
    if (data.budget_range) fields.budget_range = data.budget_range;
    if (data.property_types) fields.property_types = data.property_types;
    if (data.availability) fields.availability = data.availability;

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

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kdxvhrwnnehicgdryowu.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_KEY) {
      console.log('[Meta Lead] No SUPABASE_KEY. Lead:', JSON.stringify(lead));
      return res.status(200).json({ status: 'logged_no_key', lead });
    }

    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };

    // Check for duplicate by meta_lead_id or email
    const orFilter = `meta_lead_id.eq.${leadId}` + (lead.email ? `,email.eq.${lead.email}` : '');
    const checkUrl = `${SUPABASE_URL}/rest/v1/crm_leads?select=id&or=(${orFilter})&limit=1`;
    const checkRes = await fetch(checkUrl, { headers });
    const existing = await checkRes.json();

    if (existing && existing.length > 0) {
      console.log(`[Meta Lead] Duplicate lead ${leadId}`);
      return res.status(200).json({ status: 'duplicate', id: existing[0].id });
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
      method: 'POST',
      headers,
      body: JSON.stringify(lead),
    });
    const result = await insertRes.json();

    if (!insertRes.ok) {
      console.error('[Meta Lead] Error:', JSON.stringify(result));
      return res.status(500).json({ error: result });
    }

    console.log(`[Meta Lead] New lead: ${lead.name} (${leadId})`);
    return res.status(200).json({ status: 'created', id: result[0]?.id });
  } catch (e) {
    console.error('[Meta Lead] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
