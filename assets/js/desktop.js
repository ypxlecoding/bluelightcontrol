// desktop.js — main desktop runtime (module)
import { KEYS, qs, qsa, safeJSON, fetchJSON, verifyUser, setTheme, setWallpaper, toast } from './core.js';

const state = {
  user: null,
  apps: [],
  windows: new Map(),
  template: null,
  iconOrder: [],
  iconNames: {},
};

init().catch(err => { console.error(err); toast('Init error. Check console.'); });

async function init(){
  const savedTheme = localStorage.getItem(KEYS.THEME) || 'windows';
  setTheme(savedTheme);
  const wp = localStorage.getItem(KEYS.WALLPAPER); if (wp) setWallpaper(wp);
  tickClock(); setInterval(tickClock, 1000);

  qs('#settingsBtn')?.addEventListener('click', openSettingsModal);
  qs('#logoutBtn')?.addEventListener('click', doLogout);
  qs('#startBtn')?.addEventListener('click', openSettingsModal);

  desktopContextMenu();
  bindPalette();

  const session = safeJSON(localStorage.getItem(KEYS.SESSION));
  if (session?.username){ state.user = session; await bootDesktop(); } else { bindLogin(); }
}

function tickClock(){
  const el = qs('#clock'); if (!el) return;
  el.textContent = new Date().toLocaleString([], {hour:'2-digit', minute:'2-digit', weekday:'short', day:'2-digit', month:'short'});
}

/* LOGIN */
function bindLogin(){
  const form = qs('#loginForm'); const btn = qs('#loginBtn'); const err = qs('#loginErr'); const user = qs('#loginUser'); const pass = qs('#loginPass');
  if (!form) return;
  user?.addEventListener('keydown', e=>{ if (e.key==='Enter') pass?.focus(); });
  form.addEventListener('submit', async (e)=>{
    e.preventDefault(); err.textContent=''; btn.disabled=true; btn.textContent='Signing in…';
    try{
      const ok = await verifyUser(user.value.trim(), pass.value);
      if (!ok){ err.textContent='Invalid username or password.'; btn.disabled=false; btn.textContent='Sign in'; return; }
      state.user = { username: user.value.trim() };
      localStorage.setItem(KEYS.SESSION, JSON.stringify(state.user));
      await bootDesktop();
      toast(`Hi, ${state.user.username}!`);
    }catch(ex){ err.textContent = ex.message || 'Login failed'; btn.disabled=false; btn.textContent='Sign in'; }
  });
}

/* BOOT */
async function bootDesktop(){
  qs('#loginScreen')?.classList.add('hidden');
  qs('#desktop')?.classList.remove('hidden');
  qs('#desktop')?.focus();

  const templates = await fetchJSON('/templates.json');
  const savedTemplate = localStorage.getItem(KEYS.TEMPLATE);
  state.template = templates.find(t => t.id === savedTemplate) || templates[0];
  applyTemplate(state.template);

  state.iconOrder = safeJSON(localStorage.getItem(KEYS.ICON_ORDER)) || [];
  state.iconNames = safeJSON(localStorage.getItem(KEYS.ICON_NAMES)) || {};

  let apps = await fetchJSON('/apps.json');
  apps = addInternalApps(apps);
  state.apps = apps;
  renderAppGrid(apps);
}

function applyTemplate(tpl){
  document.documentElement.style.setProperty('--tile-radius', tpl.vars.tileRadius);
  document.documentElement.style.setProperty('--window-radius', tpl.vars.windowRadius);
  if (tpl.vars.accent) document.documentElement.style.setProperty('--accent', tpl.vars.accent);
  localStorage.setItem(KEYS.TEMPLATE, tpl.id);
}

/* APPS */
function addInternalApps(apps){
  const base = [...apps];
  const internal = [
    { id:'notes',   name:'Notes',   icon:'📝', type:'internal', url:'/apps/notes.html' },
    { id:'sysinfo', name:'SysInfo', icon:'💻', type:'internal', url:'/apps/sysinfo.html' },
    // NEW: analog clocks app
    { id:'clock',   name:'Clocks',  icon:'🕰️', type:'internal', url:'/apps/clock.html' },
    { id:'settings',name:'Settings',icon:'⚙️', type:'internal', url:'/settings.html' },
    { id:'about',   name:'About',   icon:'ℹ️', type:'internal', url:'/about.html' },
  ];
  internal.forEach(a => { if (!base.find(x=>x.id===a.id)) base.push(a); });
  return base;
}

function orderedApps(apps){
  if (!state.iconOrder.length) return apps;
  const map = new Map(apps.map(a=>[a.id,a]));
  const out=[];
  state.iconOrder.forEach(id=>{ if(map.has(id)){ out.push(map.get(id)); map.delete(id);} });
  map.forEach(v=>out.push(v));
  return out;
}

function renderAppGrid(apps){
  const grid = qs('#desktopArea'); grid.innerHTML='';
  const list = orderedApps(apps);
  list.forEach(app=>{
    const tile = document.createElement('div');
    tile.className='icon-tile'; tile.draggable=true; tile.dataset.appId=app.id;
    const name = state.iconNames[app.id] || app.name;
    tile.innerHTML = `<div class="icon">${app.icon||'🧩'}</div><div class="name">${name}</div>`;
    tile.addEventListener('dblclick', ()=> openAppWindow(app));
    tile.addEventListener('keydown', e=>{ if(e.key==='Enter') openAppWindow(app); if(e.key==='F2') startRename(tile, app); });
    dragReorder(tile, grid);
    tile.addEventListener('contextmenu', e=>{ e.preventDefault(); showContext(e.pageX,e.pageY,[
      {label:'Open', action:()=>openAppWindow(app)},
      {label:'Rename', action:()=>startRename(tile,app)},
      {divider:true},
      {label:'Open in new tab', action:()=>window.open(app.url,'_blank')},
    ]); });
    grid.appendChild(tile);
  });
}

function startRename(tile, app){
  const nameEl = tile.querySelector('.name');
  const current = nameEl.textContent;
  const input = document.createElement('input'); input.className='icon-rename'; input.value=current; nameEl.replaceWith(input); input.focus(); input.select();
  const commit = ()=>{ const v=input.value.trim()||app.name; const d=document.createElement('div'); d.className='name'; d.textContent=v; state.iconNames[app.id]=v; localStorage.setItem(KEYS.ICON_NAMES, JSON.stringify(state.iconNames)); input.replaceWith(d); };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') input.blur(); if(e.key==='Escape'){ input.value=current; input.blur(); }});
}

function dragReorder(tile, grid){
  tile.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', tile.dataset.appId); tile.classList.add('dragging'); });
  tile.addEventListener('dragend', ()=>{ tile.classList.remove('dragging'); persistOrder(grid); });
  grid.addEventListener('dragover', e=>{
    e.preventDefault();
    const after = getDragAfterElement(grid, e.clientY);
    const id = e.dataTransfer.getData('text/plain');
    const dragged = grid.querySelector(`[data-app-id="${id}"]`);
    if(!dragged) return;
    if(after==null) grid.appendChild(dragged); else grid.insertBefore(dragged, after);
  });
}
function getDragAfterElement(container, y){
  const els=[...container.querySelectorAll('.icon-tile:not(.dragging)')];
  return els.reduce((closest,child)=>{
    const rect=child.getBoundingClientRect(); const offset=y-rect.top-rect.height/2;
    if(offset<0 && offset>closest.offset) return {offset,element:child};
    return closest;
  }, {offset:Number.NEGATIVE_INFINITY}).element;
}
function persistOrder(grid){
  const ids=[...grid.querySelectorAll('.icon-tile')].map(el=>el.dataset.appId);
  state.iconOrder=ids;
  localStorage.setItem(KEYS.ICON_ORDER, JSON.stringify(ids));
}

/* WINDOWS */
function openAppWindow(app){
  if (state.windows.has(app.id)){ focusWindow(state.windows.get(app.id)); return; }
  const win=document.createElement('section'); win.className='window'; win.style.left=(40+(state.windows.size*20))+'px'; win.style.top=(60+(state.windows.size*20))+'px';
  const isMac=document.documentElement.getAttribute('data-theme')==='mac'; const titlebarClass=isMac?'mac-titlebar':'win-titlebar';
  const controls=isMac
    ? `<div class="actions"><button class="btn-dot btn-close" title="Close"></button><button class="btn-dot btn-min" title="Minimize"></button><button class="btn-dot btn-max" title="Maximize"></button></div>`
    : `<div class="actions"><button class="btn-close" title="Close">✕</button><button class="btn-min" title="Minimize">—</button><button class="btn-max" title="Maximize">▢</button></div>`;
  win.innerHTML=`<div class="${titlebarClass}"><div class="win-title">${app.name}</div>${controls}</div><div class="win-body"></div>`;
  qs('#windowLayer').appendChild(win);
  state.windows.set(app.id, win);
  addTaskButton(app); enableDrag(win); focusWindow(win);

  const bar = win.querySelector('.win-titlebar, .mac-titlebar'); bar.addEventListener('dblclick', ()=> maximizeWindow(app.id));
  const [closeBtn,minBtn,maxBtn] = win.querySelectorAll('.actions > *');
  closeBtn.addEventListener('click', ()=> closeWindow(app.id));
  minBtn.addEventListener('click', ()=> minimizeWindow(app.id));
  maxBtn.addEventListener('click', ()=> maximizeWindow(app.id));

  const body=win.querySelector('.win-body');
  const iframe=document.createElement('iframe'); iframe.src=app.url; iframe.title=app.name; iframe.setAttribute('sandbox','allow-scripts allow-forms allow-same-origin');
  const timeout=setTimeout(()=>{ body.innerHTML=cspFallback(app); }, 3000);
  iframe.addEventListener('load', ()=> clearTimeout(timeout));
  iframe.addEventListener('error', ()=>{ body.innerHTML=cspFallback(app); });
  body.appendChild(iframe);
}

function cspFallback(app){
  return `<div style="padding:12px"><h3>Can’t display ${app.name}</h3><p>The site likely blocks embedding (X-Frame-Options/CSP). Use the button below.</p><p><a href="${app.url}" target="_blank" rel="noopener">Open in new tab</a></p></div>`;
}

function focusWindow(win){ qsa('.window').forEach(w=>w.style.zIndex=101); win.style.zIndex=102; }
function addTaskButton(app){
  const strip=qs('#taskStrip');
  const btn=document.createElement('button'); btn.className='task-btn'; btn.textContent=app.name; btn.dataset.appId=app.id;
  btn.addEventListener('click',()=>{
    const w=state.windows.get(app.id); if(!w) return;
    w.style.display = (w.style.display==='none') ? 'block' : 'none';
    if(w.style.display!=='none') focusWindow(w);
  });
  strip.appendChild(btn);
}
function closeWindow(appId){
  const win=state.windows.get(appId); if(!win) return;
  win.remove(); state.windows.delete(appId);
  qsa('.task-btn').forEach(b=>{ if(b.dataset.appId===appId) b.remove(); });
}
function minimizeWindow(appId){ const win=state.windows.get(appId); if (win) win.style.display='none'; }
function maximizeWindow(appId){
  const win=state.windows.get(appId); if(!win) return;
  if(win.dataset.max==='1'){
    win.style.left='40px'; win.style.top='60px'; win.style.width='720px'; win.style.height='480px'; win.dataset.max='0';
  } else {
    win.style.left='0'; win.style.top='34px'; win.style.width='100vw'; win.style.height='calc(100vh - 46px - 34px)'; win.dataset.max='1';
  }
}
function enableDrag(win){
  const bar=win.querySelector('.win-titlebar, .mac-titlebar');
  let sx=0,sy=0,sl=0,st=0,drag=false;
  bar.addEventListener('mousedown',e=>{
    drag=true; focusWindow(win);
    sx=e.clientX; sy=e.clientY;
    const r=win.getBoundingClientRect(); sl=r.left; st=r.top;
    document.body.style.userSelect='none';
  });
  window.addEventListener('mousemove', e=>{
    if(!drag) return;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    win.style.left=(sl+dx)+'px'; win.style.top=(st+dy)+'px';
  });
  window.addEventListener('mouseup', ()=>{ drag=false; document.body.style.userSelect=''; });
}

/* SETTINGS MODAL */
async function openSettingsModal(){
  const templates = await fetchJSON('/templates.json');
  const knownWps = ['/wallpapers/default.jpg','/wallpapers/mac-bigsur.jpg','/wallpapers/win11-bloom.jpg'];
  const modal=document.createElement('div'); modal.className='modal';
  modal.innerHTML=`<div class="sheet"><header><h2>Settings</h2><button class='ghost' id='xModal'>✕</button></header><div class='content'>
    <div class='row'><label><span>Theme</span><select id='themeSel'><option value='windows'>Windows</option><option value='mac'>Mac</option></select></label>
    <label><span>Template</span><select id='tplSel'>${templates.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></label></div>
    <label><span>Wallpaper</span><select id='wpSel'>${knownWps.map(w=>`<option value='${w}'>${w.split('/').pop()}</option>`).join('')}</select></label>
    <div class='row'><button id='resetDesktop'>Reset desktop</button><a class='ghost' href='/settings.html' target='_blank'>Open full settings</a></div>
    <div><button id='applyBtn'>Apply</button></div>
  </div></div>`;
  document.body.appendChild(modal);

  qs('#themeSel',modal).value = document.documentElement.getAttribute('data-theme');
  qs('#tplSel',modal).value = localStorage.getItem(KEYS.TEMPLATE) || '';
  qs('#wpSel',modal).value = localStorage.getItem(KEYS.WALLPAPER) || '/wallpapers/default.jpg';

  qs('#xModal',modal).addEventListener('click',()=>modal.remove());
  qs('#applyBtn',modal).addEventListener('click',()=>{
    setTheme(qs('#themeSel',modal).value);
    const tplId=qs('#tplSel',modal).value;
    fetchJSON('/templates.json').then(ts=>{
      const tpl=ts.find(t=>t.id===tplId)||ts[0];
      document.documentElement.style.setProperty('--tile-radius', tpl.vars.tileRadius);
      document.documentElement.style.setProperty('--window-radius', tpl.vars.windowRadius);
      if(tpl.vars.accent) document.documentElement.style.setProperty('--accent', tpl.vars.accent);
      localStorage.setItem(KEYS.TEMPLATE, tpl.id);
    });
    setWallpaper(qs('#wpSel',modal).value);
    modal.remove();
  });
  qs('#resetDesktop',modal).addEventListener('click',()=>{
    localStorage.removeItem(KEYS.ICON_ORDER);
    localStorage.removeItem(KEYS.ICON_NAMES);
    toast('Desktop reset');
    renderAppGrid(state.apps);
  });
}

/* CONTEXT MENU & PALETTE */
function desktopContextMenu(){
  const cm=qs('#contextMenu');
  document.addEventListener('click',()=>hide());
  qs('#desktopArea').addEventListener('contextmenu', e=>{
    e.preventDefault();
    show(e.pageX,e.pageY,[
      {label:'New Window (Notes)',action:()=>openAppWindow(state.apps.find(a=>a.id==='notes'))},
      {label:'Open Clocks',action:()=>openAppWindow(state.apps.find(a=>a.id==='clock'))},
      {label:'Change wallpaper',action:()=>openSettingsModal()},
      {divider:true},
      {label:'Reload',action:()=>location.reload()},
      {label:'Logout',action:()=>doLogout()},
    ]);
  });
  function hide(){ cm.classList.add('hidden'); cm.setAttribute('aria-hidden','true'); }
  function show(x,y,items){
    cm.innerHTML=`<ul>${items.map(it=> it.divider?`<li style='border-top:1px solid rgba(255,255,255,0.08); margin:6px 0; padding:0'></li>`:`<li data-act>${it.label}</li>`).join('')}</ul>`;
    cm.style.left=x+'px'; cm.style.top=y+'px'; cm.classList.remove('hidden'); cm.setAttribute('aria-hidden','false');
    qsa('[data-act]',cm).forEach((el,i)=>{ const act=items.filter(x=>!x.divider)[i]; el.addEventListener('click',()=>{ act.action(); hide(); }); });
  }
}

function bindPalette(){
  const pal=qs('#palette'); const input=qs('#paletteInput'); const list=qs('#paletteList');
  function open(){ pal.classList.remove('hidden'); input.value=''; list.innerHTML=''; input.focus(); }
  function close(){ pal.classList.add('hidden'); }
  window.addEventListener('keydown', e=>{
    if((e.metaKey && e.code==='Space') || (e.ctrlKey && e.code==='Space')){ e.preventDefault(); open(); }
    if(e.key==='Escape') close();
  });
  input.addEventListener('input',()=>{
    const q=input.value.toLowerCase();
    const apps=state.apps.filter(a=> (a.name||'').toLowerCase().includes(q));
    list.innerHTML = apps.map(a=>`<button data-id='${a.id}'>${a.name}</button>`).join('');
    qsa('button',list).forEach(btn=> btn.addEventListener('click',()=>{
      const id=btn.dataset.id; const app=state.apps.find(a=>a.id===id);
      openAppWindow(app); close();
    }));
  });
}

/* LOGOUT */
function doLogout(){ localStorage.removeItem(KEYS.SESSION); location.href='index.html'; }
