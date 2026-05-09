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
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  // Bill already created in previous run — look it up
  const bills = await api('GET', "/rest/v1/boq_bills?bill_no=eq.05&select=id");
  if (!bills.length) throw new Error('Bill 05 not found — run without skip');
  const billId = bills[0].id;
  console.log(`Using existing Bill 05: ${billId}`);

  // Get current max global sort_order for items
  const lastItem = await api('GET', '/rest/v1/boq_items?select=sort_order&order=sort_order.desc&limit=1');
  let so = ((lastItem[0]?.sort_order) ?? -1) + 1;

  const ITEMS = [
    // 5.01 AAC Blocks
    // 5.01.1 Externally
    { item_no:'5.01.1.A', description:'AAC blocks – Externally – 200mm thick wall',         qty:1883,   unit:'sq.m', rate:120.00,  total:225960.00  },
    { item_no:'5.01.1.B', description:'AAC blocks – Externally – 250mm thick wall',         qty:746,    unit:'sq.m', rate:130.00,  total:96980.00   },
    { item_no:'5.01.1.C', description:'AAC blocks – Externally – 300mm thick wall (INCLUDED)',  qty:0, unit:'sq.m', rate:0, total:0 },
    { item_no:'5.01.1.D', description:'AAC blocks – Externally – 350mm thick wall (INCLUDED)',  qty:0, unit:'sq.m', rate:0, total:0 },
    { item_no:'5.01.1.E', description:'AAC blocks – Externally – 400mm thick wall (INCLUDED)',  qty:0, unit:'sq.m', rate:0, total:0 },
    // 5.01.2 Internally
    { item_no:'5.01.2.A', description:'AAC blocks – Internally – 100mm thick wall',         qty:5114,   unit:'sq.m', rate:95.00,   total:485830.00  },
    { item_no:'5.01.2.B', description:'AAC blocks – Internally – 150mm thick wall',         qty:2,      unit:'sq.m', rate:100.00,  total:200.00     },
    { item_no:'5.01.2.C', description:'AAC blocks – Internally – 200mm thick wall',         qty:5508,   unit:'sq.m', rate:120.00,  total:660960.00  },
    { item_no:'5.01.2.D', description:'AAC blocks – Internally – 250mm thick wall',         qty:276,    unit:'sq.m', rate:130.00,  total:35880.00   },
    { item_no:'5.01.2.E', description:'AAC blocks – Internally – 300mm thick wall',         qty:261,    unit:'sq.m', rate:135.00,  total:35235.00   },
    { item_no:'5.01.2.F', description:'AAC blocks – Internally – 400mm thick wall (INCLUDED)', qty:0, unit:'sq.m', rate:0, total:0 },
    // 5.02 Solid Block
    { item_no:'5.02.A',   description:'Solid block – 200mm thick to substructure',          qty:1120,   unit:'sq.m', rate:130.00,  total:145600.00  },
    { item_no:'5.02.B',   description:'Solid block – 100mm thick wall to Ducts & OTS (INCLUDED)', qty:0, unit:'sq.m', rate:0, total:0 },
    { item_no:'5.02.C',   description:'Solid block – 150mm thick wall to Ducts & OTS (INCLUDED)', qty:0, unit:'sq.m', rate:0, total:0 },
    { item_no:'5.02.D',   description:'Solid block – 200mm thick wall to Ducts & OTS (INCLUDED)', qty:0, unit:'sq.m', rate:0, total:0 },
    { item_no:'5.02.E',   description:'Solid block – 200mm thick wall (60cm×120cm) behind WC', qty:127.2, unit:'sq.m', rate:160.00, total:20352.00 },
  ];

  const rows = ITEMS.map((it, i) => ({
    bill_id    : billId,
    item_no    : it.item_no,
    description: it.description,
    qty        : it.qty,
    unit       : it.unit,
    rate       : it.rate,
    total      : it.total,
    sort_order : so + i,
  }));

  await api('POST', '/rest/v1/boq_items', rows);
  console.log(`Inserted ${rows.length} items`);

  // Verify total
  const priced = rows.filter(r => r.total !== null);
  const sum = priced.reduce((s, r) => s + r.total, 0);
  console.log(`Priced total: AED ${sum.toLocaleString()} (expected 1,706,997)`);
}

main().catch(e => { console.error(e); process.exit(1); });
