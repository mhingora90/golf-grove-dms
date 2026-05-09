const { SUPABASE_URL, SERVICE_KEY } = require('./tests/config');
const BILL_ID = '22e6260f-c5f5-4f80-b137-c7965321758a';

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

async function patch(path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  console.log(`PATCH ${path} → ${res.status}`);
}

async function main() {
  // 1. Get all Bill 09 items sorted by sort_order
  const items = await api('GET',
    `/rest/v1/boq_items?bill_id=eq.${BILL_ID}&select=id,item_no,total,sort_order&order=sort_order`);
  console.log(`Bill 09 items: ${items.length}`);

  const byNo = Object.fromEntries(items.map(i => [i.item_no, i]));

  // 2. Rename 9.06.D → 9.06.E (skip if already done)
  const d06 = byNo['9.06.D'] || byNo['9.06.E'];
  if (!d06) throw new Error('9.06.D / 9.06.E not found');
  if (byNo['9.06.D']) {
    await patch(`/rest/v1/boq_items?id=eq.${d06.id}`, { item_no: '9.06.E' });
    console.log(`Renamed 9.06.D → 9.06.E`);
  } else {
    console.log(`9.06.D already renamed to 9.06.E — skipping`);
  }

  // 3. Shift items to make integer gaps for new rows
  // Strategy: re-number all Bill 09 items with spacing=10, then slot new ones in
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  // Re-number existing items with gap=10
  for (let idx = 0; idx < sorted.length; idx++) {
    const newSo = (idx + 1) * 10;
    if (sorted[idx].sort_order !== newSo) {
      await patch(`/rest/v1/boq_items?id=eq.${sorted[idx].id}`, { sort_order: newSo });
    }
  }
  console.log('Re-numbered existing items with gap=10');

  // Reload to get updated sort_orders
  const refreshed = await api('GET',
    `/rest/v1/boq_items?bill_id=eq.${BILL_ID}&select=id,item_no,sort_order&order=sort_order`);
  const byNo2 = Object.fromEntries(refreshed.map(i => [i.item_no, i]));

  const so902D = byNo2['9.02.D']?.sort_order ?? 10;
  const so902E = so902D + 5; // midpoint between 9.02.D and next

  const so906E = byNo2['9.06.E']?.sort_order ?? 50; // renamed from 9.06.D
  const maxSo = Math.max(...refreshed.map(i => i.sort_order));

  const NEW_ITEMS = [
    {
      item_no: '9.02.E',
      description: 'Terrazzo Tiles landings to Internal Staircase',
      qty: 269, unit: 'sq.m', rate: 75.00, total: 20175.00,
      sort_order: so902E,
    },
    {
      item_no: '9.06.F',
      description: 'Fenomastic Emulsion Paint to ceilings — Pump Room, ETS Room, Generator Room, Chilled Water Pump Room, Substation Room, LV Room, Telephone Rooms, CCTV Room, Watchman Room, Swimming Pool Room, Water Meters Rooms, Electrical Rooms, GSM Room, FHC, Swimming Pool Mechanical Area, and Staircases',
      qty: 921, unit: 'sq.m', rate: 22.00, total: 20262.00,
      sort_order: so906E + 1,
    },
    {
      item_no: '9.06.G',
      description: 'Fenomastic paint to suspended gypsum board ceilings',
      qty: 4184, unit: 'sq.m', rate: 22.00, total: 92048.00,
      sort_order: so906E + 2,
    },
    {
      item_no: '9.06.H',
      description: 'Antifungal paint to surfaces above suspended ceilings in wet areas',
      qty: 456, unit: 'sq.m', rate: 25.00, total: 11400.00,
      sort_order: so906E + 3,
    },
    {
      item_no: '9.06.I',
      description: 'Jotashield External Paint to Soffits/Suspended Ceilings',
      qty: 1354, unit: 'sq.m', rate: 43.00, total: 58222.00,
      sort_order: so906E + 4,
    },
    {
      item_no: 'ADD.01',
      description: 'Grooves in elevation (Additional Item)',
      qty: 1, unit: 'l.s', rate: 20000.00, total: 20000.00,
      sort_order: maxSo + 1,
    },
  ];

  const rows = NEW_ITEMS.map(it => ({ bill_id: BILL_ID, ...it }));
  await api('POST', '/rest/v1/boq_items', rows);
  console.log(`Inserted ${rows.length} items`);

  // Verify
  const allItems = await api('GET', `/rest/v1/boq_items?bill_id=eq.${BILL_ID}&select=total`);
  const billTotal = allItems.reduce((s, i) => s + (+i.total || 0), 0);
  const expected = 4085949;
  console.log(`Bill 09 total: AED ${billTotal.toLocaleString()} (expected ${expected.toLocaleString()})`);
  console.log(`Match: ${Math.abs(billTotal - expected) < 0.01 ? '✓' : '✗ diff=' + (billTotal - expected).toFixed(2)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
