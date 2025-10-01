/* Desktop v2
   - Robust login (fix: screen hides on success; better errors)
   - Apps (apps.json) including INTERNAL apps (notes/sysinfo/clock)
   - Templates (templates.json)
   - Windows/Mac themes
   - Wallpaper picker (/wallpapers)
   - Context menu, drag-reorder icons (persist), rename tiles
   - Command palette (Win or Cmd+Space)
   - Window snapping/maximize
   - Iframe CSP detection -> offer Open in new tab
   - Toasts
*/

const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

const KEYS = {
  SESSION: "desktop.session",
  THEME: "desktop.theme",
  TEMPLATE: "desktop.template",
  WALLPAPER: "desktop.wallpaper",
  ICON_ORDER: "desktop.iconOrder",
  ICON_NAMES: "desktop.iconNames",
};

const state = {
  user: null,
  apps: [],
  windows: new Map(), // id -> element
  template: null,
  iconOrder: [],
  iconNames: {}, // id -> custom name
};

init().catch(err => {
  console.error(err);
  toast("Init error. Check console.");
});

async function init(){
  // Restore theme/wallpaper ASAP
  const savedTheme = localStorage.getItem(KEYS.THEME) || "windows";
  document.documentElement.setAttribute("data-theme", savedTheme);

  const wp = localStorage.getItem(KEYS.WALLPAPER);
  if (wp) setWallpaper(wp);

  tickClock(); setInterval(tickClock, 1000);

  // Wire global buttons now (exist even while hidden)
  qs("#settingsBtn").addEventListener("click", openSettings);
  qs("#logoutBtn").addEventListener("click", doLogout);

  // Start / Apple menu -> open settings
  qs("#startBtn")?.addEventListener("click", openSettings);
  qsa("#menuActions [data-action='settings']").forEach(b=>b.addEventListener("click", openSettings));

  // Context menu on desktop
  desktopContextMenu();

  // Command palette (Win key or Cmd+Space)
  bindPalette();

  // Login flow
  const session = safeJSON(localStorage.getItem(KEYS.SESSION));
  if (session?.username){
    state.user = session;
    await bootDesktop(); // guaranteed to swap screens
  } else {
    bindLogin();
  }
}

function safeJSON(str){
  try { return JSON.parse(str || "null"); } catch { return null; }
}

function tickClock(){
  const d = new Date();
  const s = d.toLocaleString(undefined, {hour:'2-digit', minute:'2-digit', weekday:'short', day:'2-digit', month:'short'});
  const el = qs("#clock");
  if (el) el.textContent = s;
}

function setWallpaper(path){
  const desk = qs("#desktop");
  desk.style.backgroundImage = `url('${path}')`;
  localStorage.setItem(KEYS.WALLPAPER, path);
}

/* ---------- LOGIN ---------- */

function bindLogin(){
  const form = qs("#loginForm");
  const btn  = qs("#loginBtn");
  const err  = qs("#loginErr");
  const user = qs("#loginUser");
  const pass = qs("#loginPass");

  // Enter submits by default; just UX niceties
  user.addEventListener("keydown", e => { if (e.key === "Enter") pass.focus(); });

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    err.textContent = "";
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try{
      const u = user.value.trim();
      const p = pass.value;
      const ok = await verifyUser(u, p);
      if (!ok){
        err.textContent = "Invalid username or password.";
        btn.disabled = false; btn.textContent = "Sign in";
        return;
      }
      // Success: swap screens immediately (no more "stuck")
      state.user = { username: u };
      localStorage.setItem(KEYS.SESSION, JSON.stringify(state.user));
      await bootDesktop();
      toast(`Hi, ${u}!`);
    }catch(ex){
      console.error(ex);
      err.textContent = "Login failed. See console.";
      btn.disabled = false; btn.textContent = "Sign in";
    }
  });
}

async function verifyUser(username, password){
  // If users.json can’t be fetched (file:// or not deployed yet), allow demo login as "admin"/"admin123"
  let users = null;
  try{
    users = await (await fetch("users.json", {cache:"no-store"})).json();
  }catch(e){
    // DEMO: allow one known combo so you’re not blocked while wiring hosting
    if (username === "admin" && password === "admin123") return true;
    qs("#loginErr").textContent = "Cannot load users.json. Serve over HTTP/HTTPS.";
    return false;
  }
  const record = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!record) return false;
  const digest = await sha256(password);
  return (digest === record.password_sha256);
}

async function sha256(txt){
  const enc = new TextEncoder().encode(txt);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ---------- DESKTOP BOOT ---------- */

async function bootDesktop(){
  // Swap screens FIRST so it’s obvious login worked
  qs("#loginScreen").classList.add("hidden");
  qs("#desktop").classList.remove("hidden");
  qs("#desktop").focus();

  // Load templates
  const templates = await fetchJSON("templates.json");
  const savedTemplate = localStorage.getItem(KEYS.TEMPLATE);
  state.template = templates.find(t => t.id === savedTemplate) || templates[0];
  applyTemplate(state.template);

  // Load icon state
  state.iconOrder = safeJSON(localStorage.getItem(KEYS.ICON_ORDER)) || [];
  state.iconNames = safeJSON(localStorage.getItem(KEYS.ICON_NAMES)) || {};

  // Load apps
  let apps = await fetchJSON("apps.json");
  // Add internal utility apps
  apps = addInternalApps(apps);
  state.apps = apps;

  renderAppGrid(apps);
}

async function fetchJSON(path){
  const res = await fetch(path, {cache:"no-store"});
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

function applyTemplate(tpl){
  document.documentElement.style.setProperty("--tile-radius", tpl.vars.tileRadius);
  document.documentElement.style.setProperty("--window-radius", tpl.vars.windowRadius);
  if (tpl.vars.accent) document.documentElement.style.setProperty("--accent", tpl.vars.accent);
  localStorage.setItem(KEYS.TEMPLATE, tpl.id);
}

/* ---------- APPS & GRID ---------- */

function addInternalApps(apps){
  const internal = [
    { id:"notes", name:"Notes", icon:"📝", type:"internal", component:"notes" },
    { id:"sysinfo", name:"System Info", icon:"💻", type:"internal", component:"sysinfo" },
    { id:"clock", name:"World Clock", icon:"🕒", type:"internal", component:"clock" },
  ];
  const base = [...apps];
  internal.forEach(a => { if (!base.find(x=>x.id===a.id)) base.push(a); });
  return base;
}

function orderedApps(apps){
  if (!state.iconOrder.length) return apps;
  const map = new Map(apps.map(a => [a.id, a]));
  const out = [];
  state.iconOrder.forEach(id => { if (map.has(id)) { out.push(map.get(id)); map.delete(id); }});
  // append any new apps not yet in order
  map.forEach(v => out.push(v));
  return out;
}

function renderAppGrid(apps){
  const grid = qs("#desktopArea");
  grid.innerHTML = "";
  const list = orderedApps(apps);
  list.forEach(app=>{
    const tile = document.createElement("div");
    tile.className = "icon-tile";
    tile.draggable = true;
    tile.dataset.appId = app.id;
    const name = state.iconNames[app.id] || app.name;
    tile.innerHTML = `
      <div class="icon" aria-hidden="true">${app.icon || "🧩"}</div>
      <div class="name">${name}</div>
    `;
    // open
    tile.addEventListener("dblclick", ()=> openAppWindow(app));
    tile.addEventListener("keydown", (e)=>{ if (e.key==="Enter") openAppWindow(app); });

    // rename (F2)
    tile.addEventListener("keydown", (e)=>{
      if (e.key === "F2") startRename(tile, app);
    });

    // drag reorder
    dragReorder(tile, grid);

    grid.appendChild(tile);

    // context for each tile
    tile.addEventListener("contextmenu", (e)=>{
      e.preventDefault();
      showContext(e.pageX, e.pageY, [
        {label:"Open", action:()=>openAppWindow(app)},
        {label:"Rename", action:()=>startRename(tile, app)},
        {divider:true},
        {label:"Open in new tab", action:()=>window.open(resolveUrl(app), "_blank")},
      ]);
    });
  });
}

function resolveUrl(app){
  if (app.type === "internal") return "about:blank";
  return app.url;
}

function startRename(tile, app){
  const nameEl = tile.querySelector(".name");
  const current = nameEl.textContent;
  const input = document.createElement("input");
  input.className = "icon-rename";
  input.value = current;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = ()=>{
    const v = input.value.trim() || app.name;
    state.iconNames[app.id] = v;
    localStorage.setItem(KEYS.ICON_NAMES, JSON.stringify(state.iconNames));
    input.replaceWith(Object.assign(document.createElement("div"), {className:"name", textContent:v}));
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", e=>{
    if (e.key==="Enter") input.blur();
    if (e.key==="Escape"){ input.value=current; input.blur(); }
  });
}

/* drag reorder grid tiles (simple swap on enter) */
function dragReorder(tile, grid){
  tile.addEventListener("dragstart", e=>{
    e.dataTransfer.setData("text/plain", tile.dataset.appId);
    tile.classList.add("dragging");
  });
  tile.addEventListener("dragend", ()=>{
    tile.classList.remove("dragging");
    persistOrder(grid);
  });
  grid.addEventListener("dragover", e=>{
    e.preventDefault();
    const after = getDragAfterElement(grid, e.clientY, e.clientX);
    const id = e.dataTransfer.getData("text/plain");
    const dragged = grid.querySelector(`[data-app-id="${id}"]`);
    if (!dragged) return;
    if (after == null) grid.appendChild(dragged);
    else grid.insertBefore(dragged, after);
  });
}

function getDragAfterElement(container, y, x){
  const els = [...container.querySelectorAll(".icon-tile:not(.dragging)")];
  return els.reduce((closest, child)=>{
    const rect = child.getBoundingClientRect();
    const offset = y - rect.top - rect.height/2;
    if (offset < 0 && offset > closest.offset) return {offset, element:child};
    else return closest;
  }, {offset: Number.NEGATIVE_INFINITY}).element;
}

function persistOrder(grid){
  const ids = [...grid.querySelectorAll(".icon-tile")].map(el => el.dataset.appId);
  state.iconOrder = ids;
  localStorage.setItem(KEYS.ICON_ORDER, JSON.stringify(ids));
}

/* ---------- WINDOWS ---------- */

function openAppWindow(app){
  // If focus existing
  if (state.windows.has(app.id)){
    focusWindow(state.windows.get(app.id));
    return;
  }

  const win = document.createElement("section");
  win.className = "window";
  win.style.left = (40 + (state.windows.size*20)) + "px";
  win.style.top = (60 + (state.windows.size*20)) + "px";

  const isMac = document.documentElement.getAttribute("data-theme") === "mac";
  const titlebarClass = isMac ? "mac-titlebar" : "win-titlebar";
  const controls = isMac
    ? `<div class="actions">
         <button class="btn-dot btn-close" title="Close"></button>
         <button class="btn-dot btn-min"   title="Minimize"></button>
         <button class="btn-dot btn-max"   title="Maximize"></button>
       </div>`
    : `<div class="actions">
         <button class="btn-close" title="Close">✕</button>
         <button class="btn-min"   title="Minimize">—</button>
         <button class="btn-max"   title="Maximize">▢</button>
       </div>`;

  win.innerHTML = `
    <div class="${titlebarClass}">
      <div class="win-title">${app.name}</div>
      ${controls}
    </div>
    <div class="win-body"></div>
  `;

  qs("#windowLayer").appendChild(win);
  state.windows.set(app.id, win);
  addTaskButton(app);
  enableDrag(win);
  focusWindow(win);

  // Titlebar extra behaviors
  const bar = qs(".win-titlebar, .mac-titlebar", win);
  bar.addEventListener("dblclick", ()=> maximizeWindow(app.id));

  // Controls
  const [closeBtn, minBtn, maxBtn] = qsa(".actions > *", win);
  closeBtn.addEventListener("click", ()=> closeWindow(app.id));
  minBtn.addEventListener("click", ()=> minimizeWindow(app.id));
  maxBtn.addEventListener("click", ()=> maximizeWindow(app.id));

  // Content
  renderAppContent(win, app);
}

function renderAppContent(win, app){
  const body = qs(".win-body", win);

  if (app.type === "internal"){
    switch(app.component){
      case "notes": renderNotes(body); return;
      case "sysinfo": renderSysInfo(body); return;
      case "clock": renderWorldClock(body); return;
      default: body.textContent = "Unknown internal app"; return;
    }
  }

  // External app via iframe
  const iframe = document.createElement("iframe");
  iframe.src = app.url;
  iframe.title = app.name;
  iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
  iframe.addEventListener("error", ()=>{
    body.innerHTML = cspFallback(app);
  });
  // also catch CSP with onload + postMessage failure
  const timeout = setTimeout(()=> { body.innerHTML = cspFallback(app); }, 3000);
  iframe.addEventListener("load", ()=> clearTimeout(timeout));

  body.appendChild(iframe);
}

function cspFallback(app){
  return `
    <div style="padding:12px">
      <h3>Can’t display ${app.name} here</h3>
      <p>The site likely blocks embedding (X-Frame-Options/CSP). You can still open it in a new tab.</p>
      <p><a href="${app.url}" target="_blank" rel="noopener">Open ${app.name} in a new tab</a></p>
    </div>
  `;
}

function focusWindow(win){
  qsa(".window").forEach(w => w.style.zIndex = 101);
  win.style.zIndex = 102;
}

function addTaskButton(app){
  const strip = qs("#taskStrip");
  const btn = document.createElement("button");
  btn.className = "task-btn";
  btn.textContent = app.name;
  btn.dataset.appId = app.id;
  btn.addEventListener("click", ()=>{
    const w = state.windows.get(app.id);
    if (!w) return;
    w.style.display = (w.style.display === "none") ? "block" : "none";
    if (w.style.display !== "none") focusWindow(w);
  });
  strip.appendChild(btn);
}

function closeWindow(appId){
  const win = state.windows.get(appId);
  if (!win) return;
  win.remove();
  state.windows.delete(appId);
  qsa(".task-btn").forEach(b => { if (b.dataset.appId===appId) b.remove(); });
}

function minimizeWindow(appId){
  const win = state.windows.get(appId);
  if (!win) return;
  win.style.display = "none";
}

function maximizeWindow(appId){
  const win = state.windows.get(appId);
  if (!win) return;
  if (win.dataset.max === "1"){
    win.style.left = "40px";
    win.style.top = "60px";
    win.style.width = "720px";
    win.style.height = "480px";
    win.dataset.max = "0";
  } else {
    win.style.left = "0px";
    win.style.top = "34px";
    win.style.width = "100vw";
    win.style.height = "calc(100vh - 46px - 34px)";
    win.dataset.max = "1";
  }
}

function enableDrag(win){
  const bar = qs(".win-titlebar, .mac-titlebar", win);
  let sx=0, sy=0, sl=0, st=0, dragging=false;
  bar.addEventListener("mousedown", (e)=>{
    dragging = true; focusWindow(win);
    sx = e.clientX; sy = e.clientY;
    const rect = win.getBoundingClientRect();
    sl = rect.left; st = rect.top;
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e)=>{
    if (!dragging) return;
    const dx = e.clientX - sx; const dy = e.clientY - sy;
    win.style.left = (sl + dx) + "px";
    win.style.top  = (st + dy) + "px";
  });
  window.addEventListener("mouseup", ()=>{
    dragging = false; document.body.style.userSelect = "";
  });
}

/* ---------- SETTINGS ---------- */

async function openSettings(){
  const templates = await fetchJSON("templates.json");
  const wpList = await listWallpapers();

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="sheet">
      <header>
        <h2>Settings</h2>
        <button class="ghost" id="xModal">✕</button>
      </header>
      <div class="content">
        <div class="row">
          <label>
            <span>Theme</span>
            <select id="themeSel">
              <option value="windows">Windows</option>
              <option value="mac">Mac</option>
            </select>
          </label>
          <label>
            <span>Template</span>
            <select id="tplSel">
              ${templates.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>
          <span>Wallpaper</span>
          <select id="wpSel">
            ${wpList.map(w=>`<option value="${w}">${w.split('/').pop()}</option>`).join("")}
          </select>
        </label>
        <div class="row">
          <button id="resetDesktop">Reset desktop</button>
          <span></span>
        </div>
        <div>
          <button id="applyBtn">Apply</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  qs("#themeSel", modal).value = document.documentElement.getAttribute("data-theme");
  qs("#tplSel", modal).value = localStorage.getItem(KEYS.TEMPLATE) || "";
  qs("#wpSel", modal).value = localStorage.getItem(KEYS.WALLPAPER) || "/wallpapers/default.jpg";

  qs("#xModal", modal).addEventListener("click", ()=> modal.remove());
  qs("#applyBtn", modal).addEventListener("click", ()=>{
    const theme = qs("#themeSel", modal).value;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEYS.THEME, theme);

    const tplId = qs("#tplSel", modal).value;
    loadTemplateById(tplId);

    const wp = qs("#wpSel", modal).value;
    setWallpaper(wp);

    modal.remove();
  });

  qs("#resetDesktop", modal).addEventListener("click", ()=>{
    localStorage.removeItem(KEYS.ICON_ORDER);
    localStorage.removeItem(KEYS.ICON_NAMES);
    toast("Desktop reset");
    renderAppGrid(state.apps);
  });
}

async function loadTemplateById(id){
  const templates = await fetchJSON("templates.json");
  const tpl = templates.find(t => t.id === id) || templates[0];
  applyTemplate(tpl);
}

async function listWallpapers(){
  // Static list (extend as you add files)
  const known = [
    "/wallpapers/default.jpg",
    "/wallpapers/mac-bigsur.jpg",
    "/wallpapers/win11-bloom.jpg"
  ];
  return known;
}

/* ---------- CONTEXT MENU & PALETTE ---------- */

function desktopContextMenu(){
  const cm = qs("#contextMenu");
  document.addEventListener("click", ()=> hideContext());
  qs("#desktopArea").addEventListener("contextmenu", (e)=>{
    e.preventDefault();
    showContext(e.pageX, e.pageY, [
      {label:"New Window (Notes)", action:()=>openAppWindow({id:"notes",name:"Notes",type:"internal",component:"notes",icon:"📝"})},
      {label:"Change wallpaper", action:()=>openSettings()},
      {label:"Settings", action:()=>openSettings()},
      {divider:true},
      {label:"Reload", action:()=>location.reload()},
      {label:"Logout", action:()=>doLogout()},
    ]);
  });

  function hideContext(){
    cm.classList.add("hidden");
    cm.setAttribute("aria-hidden", "true");
  }
}

function showContext(x,y,items){
  const cm = qs("#contextMenu");
  cm.innerHTML = `<ul>${items.map(it=>{
    if (it.divider) return `<li style="border-top:1px solid rgba(255,255,255,0.08); margin:6px 0; padding:0"></li>`;
    return `<li data-act>${it.label}</li>`;
  }).join("")}</ul>`;
  cm.style.left = x + "px";
  cm.style.top  = y + "px";
  cm.classList.remove("hidden");
  cm.setAttribute("aria-hidden", "false");
  qsa("[data-act]", cm).forEach((el, i)=>{
    const act = items[i];
    el.addEventListener("click", ()=>{ act.action(); cm.classList.add("hidden"); });
  });
}

function bindPalette(){
  const pal = qs("#palette");
  const input = qs("#paletteInput");
  const list  = qs("#paletteList");

  function open(){
    pal.classList.remove("hidden");
    input.value = "";
    list.innerHTML = "";
    input.focus();
  }
  function close(){ pal.classList.add("hidden"); }

  // Win key OR Cmd+Space
  window.addEventListener("keydown", e=>{
    if ((e.metaKey && e.code === "Space") || e.key === "Meta"){
      // Open only on keydown of Meta if you want; here we prefer Cmd+Space
    }
    if (e.metaKey && e.code === "Space"){ e.preventDefault(); open(); }
    if (e.key === "Escape") close();
    // Windows: Ctrl+Space as alternative
    if (e.ctrlKey && e.code === "Space"){ e.preventDefault(); open(); }
  });

  input.addEventListener("input", ()=>{
    const q = input.value.toLowerCase();
    const apps = state.apps.filter(a => (a.name || "").toLowerCase().includes(q));
    list.innerHTML = apps.map(a=>`<button data-id="${a.id}">${a.name}</button>`).join("");
    qsa("button", list).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.dataset.id;
        const app = state.apps.find(a=>a.id===id);
        openAppWindow(app);
        close();
      });
    });
  });

  pal.addEventListener("click", e=>{ if (e.target === pal) close(); });
}

/* ---------- INTERNAL APPS ---------- */

function renderNotes(container){
  const KEY = "internal.notes";
  container.innerHTML = `
    <div style="padding:8px">
      <textarea id="notesArea" style="width:100%; height:calc(100% - 10px); min-height:300px; background:#0a0f17; color:var(--fg); border:1px solid #2a3142; border-radius:8px; padding:10px;"></textarea>
    </div>
  `;
  const ta = qs("#notesArea", container);
  ta.value = localStorage.getItem(KEY) || "";
  ta.addEventListener("input", ()=> localStorage.setItem(KEY, ta.value));
}

function renderSysInfo(container){
  const ua = navigator.userAgent;
  const plat = navigator.platform;
  const lang = navigator.language;
  const sz = `${window.innerWidth}×${window.innerHeight}`;
  container.innerHTML = `
    <div style="padding:12px; line-height:1.6">
      <div><strong>User Agent:</strong> ${ua}</div>
      <div><strong>Platform:</strong> ${plat}</div>
      <div><strong>Language:</strong> ${lang}</div>
      <div><strong>Viewport:</strong> ${sz}</div>
    </div>
  `;
}

function renderWorldClock(container){
  const cities = [
    {name:"Berlin", tz:"Europe/Berlin"},
    {name:"New York", tz:"America/New_York"},
    {name:"London", tz:"Europe/London"},
    {name:"Tokyo", tz:"Asia/Tokyo"},
  ];
  const wrap = document.createElement("div");
  wrap.style.padding = "12px";
  container.appendChild(wrap);
  function render(){
    wrap.innerHTML = cities.map(c=>{
      const d = new Date().toLocaleString([], {hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:c.tz});
      return `<div><strong>${c.name}:</strong> ${d}</div>`;
    }).join("");
  }
  render(); setInterval(render, 1000);
}

/* ---------- TOAST ---------- */
function toast(msg, ms=2200){
  const host = qs("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=> { el.remove(); }, ms);
}

/* ---------- LOGOUT ---------- */
function doLogout(){
  localStorage.removeItem(KEYS.SESSION);
  location.reload();
}
