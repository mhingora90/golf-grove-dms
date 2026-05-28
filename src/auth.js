// ─── AUTH ────────────────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('login-form').style.display = tab==='login'?'':'none';
  document.getElementById('signup-form').style.display = tab==='signup'?'':'none';
  document.getElementById('tab-login').classList.toggle('active', tab==='login');
  document.getElementById('tab-signup').classList.toggle('active', tab==='signup');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const msg = document.getElementById('login-msg');
  if(!email||!pass){showAuthMsg('login','Please fill in all fields','error');return;}
  btn.disabled=true; btn.textContent='Signing in...';
  const {data,error} = await sb.auth.signInWithPassword({email,password:pass});
  btn.disabled=false; btn.textContent='Sign In';
  if(error){showAuthMsg('login',error.message,'error');}
  else{await loadApp(data.user);}
}

async function doSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  const company = document.getElementById('signup-company').value.trim();
  const role = document.getElementById('signup-role').value;
  const btn = document.getElementById('signup-btn');
  if(!name||!email||!pass){showAuthMsg('signup','Please fill in all fields','error');return;}
  btn.disabled=true; btn.textContent='Creating account...';
  const {data,error} = await sb.auth.signUp({email,password:pass,options:{data:{full_name:name,role:'pending',company,requested_role:role}}});
  if(error){showAuthMsg('signup',error.message,'error');btn.disabled=false;btn.textContent='Create Account';return;}
  // Profile row is created automatically by the handle_new_user DB trigger.
  btn.disabled=false; btn.textContent='Create Account';
  showAuthMsg('signup','Request submitted — a project admin will approve your access shortly.','success');
  switchTab('login');
}

function showAuthMsg(form,msg,type){
  const el = document.getElementById(form+'-msg');
  el.innerHTML=`<div class="auth-msg ${type}">${msg}</div>`;
  setTimeout(()=>el.innerHTML='',5000);
}

async function doLogout() {
  await sb.auth.signOut();
  currentUser=null; currentProfile=null;
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app-screen').style.display='none';
}

async function loadApp(user) {
  currentUser = user;
  let {data:profile, error:profErr} = await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(profErr && profErr.code !== 'PGRST116'){toast('Profile error: '+profErr.message,'error');return;}
  if(profile && !profile.role) {
    const meta = user.user_metadata||{};
    if(meta.role) {
      await sb.from('profiles').update({role:meta.role,company:meta.company||profile.company,full_name:meta.full_name||profile.full_name}).eq('id',user.id);
      const {data:refreshed} = await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
      profile = refreshed||null;
    }
  }
  if(!profile) {
    // Trigger should have created the row; attempt a fallback insert as safety net.
    // Never inherit meta.role ('pending') — always default to 'contractor' here.
    const meta = user.user_metadata||{};
    const {error:upsertErr} = await sb.from('profiles').upsert({id:user.id,email:user.email,full_name:meta.full_name||user.email,role:'contractor',company:meta.company||''},{onConflict:'id'});
    if(upsertErr) console.error('Profile fallback upsert error:', upsertErr.message);
    const {data:created} = await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
    profile = created||null;
  }
  if(!profile){toast('Failed to load profile — please refresh','error');return;}
  if(profile.role==='pending'){
    await sb.auth.signOut();
    showAuthMsg('login','Your account is pending approval. A project admin will activate it shortly.','error');
    return;
  }
  currentProfile = profile;
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-screen').style.display='flex';
  const initials = (profile?.full_name||user.email).split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  document.getElementById('sb-avatar').textContent=initials;
  document.getElementById('sb-name').textContent=profile?.full_name||user.email;
  document.getElementById('sb-role').textContent=profile?.role||'user';
  const roleClass = `role-${profile?.role||'contractor'}`;
  document.getElementById('role-badge-top').className=`role-badge ${roleClass}`;
  document.getElementById('role-badge-top').textContent=profile?.role||'user';
  if(profile?.role==='developer' || profile?.role==='sales' || profile?.role==='admin'){
    document.getElementById('n-sales-wrap').style.display='';
  }
  if(profile?.role==='developer'){
    document.getElementById('n-users-wrap').style.display='';
    document.getElementById('n-reports-wrap').style.display='';
  }
  if(profile?.role==='admin'){
    ['n-dash','n-draw','n-sub','n-sreg','n-ir','n-ncr','n-rfi','n-trans','n-ms','n-corr','n-punch','n-finance','n-ipc','n-boq','n-subs'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.style.display='none';
    });
    document.querySelectorAll('.sb-section').forEach(el=>{
      if(el.textContent.trim()!=='Sales') el.style.display='none';
    });
  }
  // Set topbar date
  const dateEl = document.getElementById('topbar-date');
  if(dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // Load projects then route
  const { data: projectRows } = await sb.from('projects').select('id, name').order('created_at');
  userProjects = (projectRows || []).map(p => ({ id: p.id, name: p.name }));

  if (userProjects.length === 1) {
    setCurrentProject(userProjects[0]);
  } else {
    const savedId = localStorage.getItem('lastProjectId');
    const saved = savedId && userProjects.find(p => p.id === savedId);
    if (saved) setCurrentProject(saved);
    else renderProjectGrid();
  }
}
