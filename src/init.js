
// ─── INIT ─────────────────────────────────────────────────────────
(async()=>{
  const {data:{session}} = await sb.auth.getSession();
  if(session?.user) await loadApp(session.user);
  else document.getElementById('auth-screen').style.display = 'flex';
  // Handle browser back/forward navigation
  window.addEventListener('hashchange', ()=>{
    if(!currentProfile) return;
    const hash = location.hash.replace('#','');
    const validPages = ['dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms','subs','users','ipc','boq'];
    if(validPages.includes(hash) && hash !== currentPage){
      const navEl = document.getElementById('n-'+hash);
      nav(hash, navEl);
    }
  });
})();
