// ─── SUPABASE INIT ───────────────────────────────────────────────
const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EASrK2EfbUZ5Jz1VBNw8Kw_nqq18szU';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PROJECT = {
  name:'Golf Grove – Residential Building (B+G+P+7+Roof)',
  client:'Regent Star Property Developments L.L.C',
  plot:'6850752',
  location:"Me'aisem First",
  city:'Production City, Dubai, UAE',
  consultant:'Pioneers of Experts Engineering Consultants',
  contractor:'Modern Building Contracting L.L.C'
};

let currentPage = 'dash';
let currentUser = null;
let currentProfile = null;
let currentProject = null;  // { id, name } — null means project grid is shown
let userProjects    = [];    // [{ id, name }, …] — populated after login
