const { SUPABASE_URL, SERVICE_KEY } = require('./tests/config');

async function api(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  // 1. Check no existing IPC No.1
  const existing = await api('GET', '/rest/v1/payment_certificates?cert_no=eq.1&select=id');
  if (existing.length) {
    console.log('IPC No.1 already exists:', existing[0].id);
    process.exit(0);
  }

  // 1b. Delete existing bad IPC No.1 if present (from previous failed run)
  // (already handled above — script exits if exists, but if we need a fresh run, delete first via API)

  // 2. Create the payment certificate header (status=Certified — already issued)
  const [cert] = await api('POST', '/rest/v1/payment_certificates', {
    cert_no            : 1,
    ref_no             : 'IPC-001',
    status             : 'Certified',
    previously_paid    : 0,
    retention_pct      : 10,
    advance_recovery_pct: 0,
    mobilisation_advance: 0,
    vat_pct            : 5,
    certified_date     : '2026-05-08',
    certified_by_name  : 'Eng. Mohamed Megahed',
    notes              : 'Ref: POE/CL/B-153/05-26/123 | Period ending: 17-Apr-2026 | Contractor: Modern Building Contracting LLC',
  });
  console.log('Created IPC No.1:', cert.id);

  // 3. Fetch all BOQ items
  const boqItems = await api('GET', '/rest/v1/boq_items?select=id,item_no,total&order=sort_order');
  console.log(`BOQ items: ${boqItems.length}`);

  // 4. Claimed amounts per item_no (from PDF Appendix A / General Summary)
  // Bill 01 — 20% lump sum. The BOQ item 1.01 = 1,580,000
  // Bill 02 — per-item percentages (from Bill 02 BOQ breakdown in PDF)
  // Bill 05 — 5.02.A at 10%
  // Discount of 5.13 distributed as tiny rounding — applied to Bill 02 total below.
  const claimedPct = {
    // Bill 01
    '01-001': 20,

    // Bill 02
    '2.01.A': 100,
    '2.02.A': 100,
    '2.03.A': 90,
    '2.03.B': 90,
    '2.05.A': 30,
    '2.06.B': 80,

    // Bill 05
    '5.02.A': 10,
  };

  // Override amounts where PDF states a specific AED figure that differs from pct×total
  // (covers the 5.13 contract discount spread across Bill 02)
  const claimedAmountOverride = {
    '2.03.A': 148878.00,
    '2.03.B': 148878.00,
    '2.05.A': 82500.00,
    '2.06.B': 8000.00,
  };

  // 5. Build payment_certificate_items
  const certItems = boqItems.map(item => {
    const pct = claimedPct[item.item_no] ?? 0;
    let amount;
    if (claimedAmountOverride[item.item_no] !== undefined) {
      amount = claimedAmountOverride[item.item_no];
    } else {
      amount = Math.round((+item.total || 0) * pct / 100 * 100) / 100;
    }
    return {
      cert_id          : cert.id,
      boq_item_id      : item.id,
      contractor_pct   : pct,
      contractor_amount: amount,
      consultant_amount: amount,  // certified = contractor claim (no adjustments noted)
    };
  });

  // 6. Insert in batches of 100
  for (let i = 0; i < certItems.length; i += 100) {
    const batch = certItems.slice(i, i + 100);
    await api('POST', '/rest/v1/payment_certificate_items', batch);
  }
  console.log(`Inserted ${certItems.length} certificate items`);

  // 7. Verify totals
  const gross = certItems.reduce((s, i) => s + i.consultant_amount, 0);
  const retention = Math.round(gross * 10) / 100;
  const net = gross - retention;
  console.log(`Gross work done    : AED ${gross.toLocaleString()} (expected 728,816.00 before 5.13 discount)`);
  console.log(`Less retention 10% : AED (${retention.toLocaleString()})`);
  console.log(`Net certified      : AED ${net.toLocaleString()} (expected ~655,929.78)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
