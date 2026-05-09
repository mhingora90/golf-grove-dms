const { SUPABASE_URL, SERVICE_KEY } = require('./tests/config');
const BILL_ID = 'd66feaa8-5b05-43f2-a308-9a7754e70b78';

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
  // 1. Update 6.04.B total to match BOQ exactly
  const existing = await api('GET', `/rest/v1/boq_items?bill_id=eq.${BILL_ID}&item_no=eq.6.04.B&select=id,total`);
  if (existing.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/boq_items?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: 34817.10 }),
    });
    console.log(`Updated 6.04.B: ${existing[0].total} → 34817.10`);
  }

  // 2. Get max sort_order globally
  const last = await api('GET', '/rest/v1/boq_items?select=sort_order&order=sort_order.desc&limit=1');
  let so = ((last[0]?.sort_order) ?? -1) + 1;

  // 3. Insert missing items
  const NEW_ITEMS = [
    { item_no:'6.01.A', description:'1,000 gauge polythene separation layer below PCC and Grade Slab', qty:1640,  unit:'sq.m', rate:10.00,    total:16400.00   },
    { item_no:'6.01.C', description:'50mm protection screed',                                          qty:1640,  unit:'sq.m', rate:40.00,    total:65600.00   },
    { item_no:'6.02.A', description:'GRP lining – water tanks base slab, walls and soffits of cover slab', qty:632, unit:'sq.m', rate:125.00, total:79000.00   },
    { item_no:'6.02.B', description:'GRP lining – sump pits internal surfaces (INCLUDED)',             qty:0,     unit:'sq.m', rate:0,        total:0          },
    { item_no:'6.03.A', description:'Roofing waterproofing – To Roof',                                 qty:272,   unit:'sq.m', rate:150.00,   total:40740.00   },
    { item_no:'6.03.B', description:'Roofing waterproofing – To Upper Roofs',                          qty:427,   unit:'sq.m', rate:150.00,   total:64050.00   },
    { item_no:'6.04.A', description:'Wet areas waterproofing – horizontally to floorings',             qty:580,   unit:'sq.m', rate:80.00,    total:46392.80   },
    { item_no:'6.07.A', description:'Swimming pool waterproofing – To Swimming Pool deck (PS Item)',    qty:0,     unit:'sq.m', rate:0,        total:0          },
    { item_no:'6.07.B', description:'Swimming pool waterproofing – walls and floorings of all Swimming Pools (PS Item)', qty:0, unit:'sq.m', rate:0, total:0  },
    { item_no:'6.09.A', description:'Exposed areas waterproofing – To First Floor Terrace',            qty:528,   unit:'sq.m', rate:80.00,    total:42240.00   },
    { item_no:'6.09.B', description:'Exposed areas waterproofing – External area and Steps at Main Entrance', qty:20, unit:'sq.m', rate:80.00, total:1600.00  },
  ];

  const rows = NEW_ITEMS.map((it, i) => ({
    bill_id: BILL_ID, item_no: it.item_no, description: it.description,
    qty: it.qty, unit: it.unit, rate: it.rate, total: it.total,
    sort_order: so + i,
  }));

  await api('POST', '/rest/v1/boq_items', rows);
  console.log(`Inserted ${rows.length} items`);

  // 4. Verify bill total
  const items = await api('GET', `/rest/v1/boq_items?bill_id=eq.${BILL_ID}&select=total`);
  const billTotal = items.reduce((s, i) => s + (+i.total || 0), 0);
  console.log(`Bill 06 total: AED ${billTotal.toLocaleString()} (expected 853,333.90)`);
  console.log(`Match: ${Math.abs(billTotal - 853333.90) < 0.01 ? '✓' : '✗ MISMATCH'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
