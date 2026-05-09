#!/usr/bin/env node
/**
 * Sales Module — API Integration Tests
 * Run: node tests/sales-api.test.js
 */
const https = require('https');
const { SUPABASE_URL, ANON_KEY, TEST_ACCOUNTS, TEST_PASSWORD } = require('./config');

const results = [];
function pass(n)     { results.push({name:n,status:'PASS'}); console.log('  \u2713  PASS  ' + n); }
function fail(n,msg) { results.push({name:n,status:'FAIL',info:msg}); console.error('  \u2717  FAIL  ' + n + '  \u2192  ' + msg); }
function section(t)  { console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '-'.repeat(70)); }

function req(method, path, body, token) {
  return new Promise((resolve,reject) => {
    const url  = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'apikey': ANON_KEY, 'Authorization': 'Bearer ' + (token||ANON_KEY),
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve({status:res.statusCode,data:JSON.parse(d)});}catch(e){resolve({status:res.statusCode,data:d});} });
    });
    r.on('error',reject);
    if(data) r.write(data);
    r.end();
  });
}

async function signIn(email, password) {
  const r = await req('POST','/auth/v1/token?grant_type=password',{email,password},ANON_KEY);
  return r.data?.access_token||null;
}

const testUnitNo = 'TEST-' + Date.now();
let devToken, consultantToken, testUnitId, testSaleId;

async function run() {
  section('Sign in');
  devToken        = await signIn(TEST_ACCOUNTS.developer, TEST_PASSWORD);
  consultantToken = await signIn(TEST_ACCOUNTS.consultant, TEST_PASSWORD);
  devToken        ? pass('Developer sign in')   : fail('Developer sign in','No token');
  consultantToken ? pass('Consultant sign in')  : fail('Consultant sign in','No token');
  if(!devToken) { console.error('Cannot continue'); process.exit(1); }

  section('Developer CRUD — units');
  {
    const r = await req('POST','/rest/v1/units',{unit_no:testUnitNo,floor:99,unit_type:'Studio',area_sqft:490,listed_price:625000},devToken);
    if(r.status===201 && r.data?.[0]?.id) { testUnitId=r.data[0].id; pass('Insert unit'); }
    else fail('Insert unit','status='+r.status);
  }
  {
    const r = await req('GET','/rest/v1/units?unit_no=eq.'+testUnitNo,null,devToken);
    r.data?.[0]?.unit_no===testUnitNo ? pass('Select unit') : fail('Select unit',JSON.stringify(r.data));
  }
  {
    const r = await req('PATCH','/rest/v1/units?id=eq.'+testUnitId,{listed_price:650000},devToken);
    r.status===200 ? pass('Update unit') : fail('Update unit','status='+r.status);
  }

  section('RLS — consultant blocked');
  {
    const r = await req('GET','/rest/v1/units?unit_no=eq.'+testUnitNo,null,consultantToken);
    (r.status===200 && Array.isArray(r.data) && r.data.length===0)
      ? pass('Consultant cannot read units')
      : fail('Consultant cannot read units','status='+r.status+' data='+JSON.stringify(r.data));
  }
  {
    const r = await req('POST','/rest/v1/units',{unit_no:'CONS-TEST',floor:1,unit_type:'Studio',area_sqft:490,listed_price:600000},consultantToken);
    r.status!==201 ? pass('Consultant cannot insert unit') : fail('Consultant cannot insert unit','Insert succeeded');
  }

  section('Developer CRUD — unit_sales');
  if(testUnitId) {
    const r = await req('POST','/rest/v1/unit_sales',{unit_id:testUnitId,status:'reserved',buyer_name:'Test Buyer',sale_date:'2026-05-01',sold_price:615000,discount_amount:10000,commission_pct:2,spa_status:'signed_buyer'},devToken);
    if(r.status===201 && r.data?.[0]?.id) { testSaleId=r.data[0].id; pass('Insert unit_sales'); }
    else fail('Insert unit_sales','status='+r.status+' '+JSON.stringify(r.data));
  }

  section('Developer CRUD — payment_milestones');
  if(testSaleId) {
    const r = await req('POST','/rest/v1/payment_milestones',{unit_sale_id:testSaleId,milestone_name:'Booking Deposit',amount:61500,pct_of_sale:10,due_date:'2026-05-01',sort_order:0},devToken);
    r.status===201 ? pass('Insert milestone') : fail('Insert milestone','status='+r.status);
  }

  section('Cascade delete');
  if(testSaleId) {
    await req('DELETE','/rest/v1/unit_sales?id=eq.'+testSaleId,null,devToken);
    const r = await req('GET','/rest/v1/payment_milestones?unit_sale_id=eq.'+testSaleId,null,devToken);
    (Array.isArray(r.data) && r.data.length===0) ? pass('Milestones cascade-deleted') : fail('Cascade delete',r.data?.length+' milestones remain');
  }

  section('Cleanup');
  if(testUnitId) {
    const r = await req('DELETE','/rest/v1/units?id=eq.'+testUnitId,null,devToken);
    (r.status===204||r.status===200) ? pass('Test unit deleted') : fail('Delete test unit','status='+r.status);
  }

  const passed = results.filter(r=>r.status==='PASS').length;
  const failed = results.filter(r=>r.status==='FAIL').length;
  console.log('\n' + '='.repeat(70));
  console.log('  ' + passed + ' PASS  ' + failed + ' FAIL  (' + results.length + ' total)');
  console.log('='.repeat(70));
  process.exit(failed>0?1:0);
}
run().catch(e=>{ console.error(e); process.exit(1); });
