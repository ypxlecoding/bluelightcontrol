// desktop.js — main desktop runtime
const isMac=document.documentElement.getAttribute('data-theme')==='mac'; const titlebarClass=isMac?'mac-titlebar':'win-titlebar';
const controls=isMac?`<div class="actions"><button class="btn-dot btn-close" title="Close"></button><button class="btn-dot btn-min" title="Minimize"></button><button class="btn-dot btn-max" title="Maximize"></button></div>`:`<div class="actions"><button class="btn-close" title="Close">✕</button><button class="btn-min" title="Minimize">—</button><button class="btn-max" title="Maximize">▢</button></div>`;
win.innerHTML=`<div class="${titlebarClass}"><div class="win-title">${app.name}</div>${controls}</div><div class="win-body"></div>`;
qs('#windowLayer').appendChild(win); state.windows.set(app.id, win); addTaskButton(app); enableDrag(win); focusWindow(win);
const bar = win.querySelector('.win-titlebar, .mac-titlebar'); bar.addEventListener('dblclick', ()=> maximizeWindow(app.id));
const [closeBtn,minBtn,maxBtn] = win.querySelectorAll('.actions > *');
closeBtn.addEventListener('click', ()=> closeWindow(app.id));
minBtn.addEventListener('click', ()=> minimizeWindow(app.id));
maxBtn.addEventListener('click', ()=> maximizeWindow(app.id));
renderAppContent(win, app);
}


function renderAppContent(win, app){
const body=win.querySelector('.win-body');
const iframe=document.createElement('iframe'); iframe.src=app.url; iframe.title=app.name; iframe.setAttribute('sandbox','allow-scripts allow-forms allow-same-origin');
const timeout=setTimeout(()=>{ body.innerHTML=cspFallback(app); }, 3000);
iframe.addEventListener('load', ()=> clearTimeout(timeout));
iframe.addEventListener('error', ()=>{ body.innerHTML=cspFallback(app); });
body.appendChild(iframe);
}


function cspFallback(app){ return `<div style="padding:12px"><h3>Can’t display ${app.name}</h3><p>The site likely blocks embedding (X-Frame-Options/CSP). Use the button below.</p><p><a href="${app.url}" target="_blank" rel="noopener">Open in new tab</a></p></div>`; }


function focusWindow(win){ qsa('.window').forEach(w=>w.style.zIndex=101); win.style.zIndex=102; }
function addTaskButton(app){ const strip=qs('#taskStrip'); const btn=document.createElement('button'); btn.className='task-btn'; btn.textContent=app.name; btn.dataset.appId=app.id; btn.addEventListener('click',()=>{ const w=state.windows.get(app.id); if(!w) return; w.style.display = (w.style.display==='none') ? 'block' : 'none'; if(w.style.display!=='none') focusWindow(w); }); strip.appendChild(btn); }
function closeWindow(appId){ const win=state.windows.get(appId); if(!win) return; win.remove(); state.windows.delete(appId); qsa('.task-btn').forEach(b=>{ if(b.dataset.appId===appId) b.remove(); }); }
function minimizeWindow(appId){ const win=state.windows.get(appId); if (win) win.style.display='none'; }
function maximizeWindow(appId){ const win=state.windows.get(appId); if(!win) return; if(win.dataset.max==='1'){ win.style.left='40px'; win.style.top='60px'; win.style.width='720px'; win.style.height='480px'; win.dataset.max='0'; } else { win.style.left='0'; win.style.top='34px'; win.style.width='100vw'; win.style.height='calc(100vh - 46px - 34px)'; win.dataset.max='1'; } }
function enableDrag(win){ const bar=win.querySelector('.win-titlebar, .mac-titlebar'); let sx=0,sy=0,sl=0,st=0,drag=false; bar.addEventListener('mousedown',e=>{ drag=true; focusWindow(win); sx=e.clientX; sy=e.clientY; const r=win.getBoundingClientRect(); sl=r.left; st=r.top; document.body.style.userSelect='none'; }); window.addEventListener('mousemove', e=>{ if(!drag) return; const dx=e.clientX-sx, dy=e.clientY-sy; win.style.left=(sl+dx)+'px'; win.style.top=(st+dy)+'px'; }); window.addEventListener('mouseup', ()=>{ drag=false; document.body.style.userSelect=''; }); }


/* SETTINGS MODAL (in-desktop quick access) */
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
const tplId=qs('#tplSel',modal).value; fetchJSON('/templates.json').then(ts=>{ const tpl=ts.find(t=>t.id===tplId)||ts[0]; document.documentElement.style.setProperty('--tile-radius', tpl.vars.tileRadius); document.documentElement.style.setProperty('--window-radius', tpl.vars.windowRadius); if(tpl.vars.accent) document.documentElement.style.setProperty('--accent', tpl.vars.accent); localStorage.setItem(KEYS.TEMPLATE, tpl.id); });
setWallpaper(qs('#wpSel',modal).value);
modal.remove();
});
qs('#resetDesktop',modal).addEventListener('click',()=>{ localStorage.removeItem(KEYS.ICON_ORDER); localStorage.removeItem(KEYS.ICON_NAMES); toast('Desktop reset'); renderAppGrid(state.apps); });
}


/* CONTEXT MENU & PALETTE */
function desktopContextMenu(){ const cm=qs('#contextMenu'); document.addEventListener('click',()=>hide()); qs('#desktopArea').addEventListener('contextmenu', e=>{ e.preventDefault(); show(e.pageX,e.pageY,[ {label:'New Window (Notes)',action:()=>openAppWindow(state.apps.find(a=>a.id==='notes'))}, {label:'Change wallpaper',action:()=>openSettingsModal()}, {label:'Settings',action:()=>openSettingsModal()}, {divider:true}, {label:'Reload',action:()=>location.reload()}, {label:'Logout',action:()=>doLogout()}, ]); }); function hide(){ cm.classList.add('hidden'); cm.setAttribute('aria-hidden','true'); } function show(x,y,items){ cm.innerHTML=`<ul>${items.map(it=> it.divider?`<li style='border-top:1px solid rgba(255,255,255,0.08); margin:6px 0; padding:0'></li>`:`<li data-act>${it.label}</li>`).join('')}</ul>`; cm.style.left=x+'px'; cm.style.top=y+'px'; cm.classList.remove('hidden'); cm.setAttribute('aria-hidden','false'); qsa('[data-act]',cm).forEach((el,i)=>{ const act=items.filter(x=>!x.divider)[i]; el.addEventListener('click',()=>{ act.action(); hide(); }); }); } }


function bindPalette(){ const pal=qs('#palette'); const input=qs('#paletteInput'); const list=qs('#paletteList'); function open(){ pal.classList.remove('hidden'); input.value=''; list.innerHTML=''; input.focus(); } function close(){ pal.classList.add('hidden'); }
window.addEventListener('keydown', e=>{ if((e.metaKey && e.code==='Space') || (e.ctrlKey && e.code==='Space')){ e.preventDefault(); open(); } if(e.key==='Escape') close(); });
input.addEventListener('input',()=>{ const q=input.value.toLowerCase(); const apps=state.apps.filter(a=> (a.name||'').toLowerCase().includes(q)); list.innerHTML = apps.map(a=>`<button data-id='${a.id}'>${a.name}</button>`).join(''); qsa('button',list).forEach(btn=> btn.addEventListener('click',()=>{ const id=btn.dataset.id; const app=state.apps.find(a=>a.id===id); openAppWindow(app); close(); })); });
}


/* LOGOUT */
function doLogout(){ localStorage.removeItem(KEYS.SESSION); location.href='index.html'; }