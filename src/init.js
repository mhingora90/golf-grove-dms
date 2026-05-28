
// ─── INIT ─────────────────────────────────────────────────────────
(async()=>{
  const {data:{session}} = await sb.auth.getSession();
  if(session?.user) await loadApp(session.user);
  else document.getElementById('auth-screen').style.display = 'flex';
  // Handle browser back/forward navigation
  window.addEventListener('hashchange', ()=>{
    if(!currentProfile) return;
    const hash = location.hash.replace('#','');
    const validPages = Object.keys(PAGE_TITLES); // auto-includes every page registered in nav.js
    if(validPages.includes(hash) && hash !== currentPage){
      const navEl = document.getElementById('n-'+hash);
      nav(hash, navEl);
    }
  });
})();
