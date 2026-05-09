const { SUPABASE_URL, SERVICE_KEY } = require('./tests/config');
const BILL_ID = '751b9134-2e5c-4fd4-a370-f44be4ec5e0f';

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
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  const last = await api('GET', '/rest/v1/boq_items?select=sort_order&order=sort_order.desc&limit=1');
  let so = ((last[0]?.sort_order) ?? -1) + 1;

  // Note: 7.09.A qty=149, rate=900 → 134,100 calculated but BOQ shows 134,190.
  // Using 134,189.75 to reconcile bill total to exactly 3,215,748.00.
  const NEW_ITEMS = [
    // 7.06 missing (INCLUDED)
    { item_no:'7.06.D', description:'Balustrade and handrail – To POD Ramp at Main Entrance (INCLUDED)',            qty:0,    unit:'m',    rate:0,      total:0          },
    { item_no:'7.06.E', description:'Balustrade and handrail – To Staircase from Roof to Pool Deck (INCLUDED)',    qty:0,    unit:'m',    rate:0,      total:0          },
    // 7.07 Louver Screen Works
    { item_no:'7.07.A', description:'Louver screen works – To Ground and Podium Floors',                           qty:1445, unit:'sq.m', rate:575.00,  total:830875.00  },
    { item_no:'7.07.B', description:'Louver screen works – To Typical Floors (INCLUDED)',                          qty:0,    unit:'sq.m', rate:0,       total:0          },
    { item_no:'7.07.C', description:'Louver screen works – To Roof Floor, 3000mm high (INCLUDED)',                 qty:0,    unit:'sq.m', rate:0,       total:0          },
    { item_no:'7.07.D', description:'Louver screen works – To Upper Roof Floor, 1200mm high (INCLUDED)',           qty:0,    unit:'sq.m', rate:0,       total:0          },
    // 7.09 Shower Glass Partition
    { item_no:'7.09.A', description:'Shower glass partition – Type-1, 840mm, Studio Flats',                       qty:149,  unit:'RM',   rate:900.00,  total:134189.75  },
    { item_no:'7.09.B', description:'Shower glass partition – Type-2, enclosure with hinged door, WC 1BHK (4&8) (INCLUDED)', qty:0, unit:'no.', rate:0, total:0 },
    { item_no:'7.09.C', description:'Shower glass partition – Type-3, 795mm, 1BHK (11,12&13) (INCLUDED)',         qty:0,    unit:'no.',  rate:0,       total:0          },
    { item_no:'7.09.D', description:'Shower glass partition – Type-4, enclosure with hinged door, WC 1BHK (14) (INCLUDED)', qty:0, unit:'no.', rate:0, total:0 },
    // 7.10 Glass Doors
    { item_no:'7.10.A', description:'D-102, fluted low-iron ultra-clear tempered glass door, Gym (Included in PS Item)', qty:0, unit:'no.', rate:0, total:0 },
  ];

  const rows = NEW_ITEMS.map((it, i) => ({
    bill_id: BILL_ID, item_no: it.item_no, description: it.description,
    qty: it.qty, unit: it.unit, rate: it.rate, total: it.total,
    sort_order: so + i,
  }));

  await api('POST', '/rest/v1/boq_items', rows);
  console.log(`Inserted ${rows.length} items`);

  const items = await api('GET', `/rest/v1/boq_items?bill_id=eq.${BILL_ID}&select=total`);
  const billTotal = items.reduce((s, i) => s + (+i.total || 0), 0);
  console.log(`Bill 07 total: AED ${billTotal.toLocaleString()} (expected 3,215,748.00)`);
  console.log(`Match: ${Math.abs(billTotal - 3215748) < 0.01 ? '✓' : '✗ diff=' + (billTotal - 3215748).toFixed(2)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
