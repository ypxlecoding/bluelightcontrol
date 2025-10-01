/* Desktop Loader with:
   - Login (users.json; SHA-256)
   - Apps (apps.json)
   - Templates (templates.json)
   - Windows/Mac themes
   - Wallpaper picker (/wallpapers)
*/

const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

const KEYS = {
  SESSION: "desktop.session",
  THEME: "desktop.theme",
  TEMPLATE: "desktop.template",
  WALLPAPER: "desktop.wallpaper"
};

const state = {
  user: null,
  apps: [],
  windows: new Map(), // id -> element
  template: null
};

init().catch(err => console.error(err));

async function init(){
  // Session restore
  const savedTheme = localStorage.getItem(KEYS.THEME) || "windows";
  document.documentElement.setAttribute("data-theme", savedTheme);

  const wp = localStorage.getItem(KEYS.WALLPAPER);
  if (wp) setWallpaper(wp);

  tickClock(); setInterval(tickClock, 1000);

  const session = JSON.parse(localStorage.getItem(KEYS.SESSION) || "null");
  if (session?.username){
    state.user = session;
    await bootDesktop();
  } else {
    bindLogin();
  }

  // Settings button
  qs("#settingsBtn").addEventListener("click", openSettings);
  qs("#logoutBtn").addEventListener("click", doLogout);

  // Start button (Windows)
  const startBtn = qs("#startBtn");
  startBtn && startBtn.addEventListener("click", () => openSettings());
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

function bindLogin(){
  const form = qs("#loginForm");
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const u = qs("#loginUser").value.trim();
    const p = qs("#loginPass").value;
    const ok = await verifyUser(u, p);
    if (!ok){
      qs("#loginErr").textContent = "Invalid username or password.";
      return;
    }
    qs("#loginErr").textContent = "";
    state.user = { username: u };
    localStorage.setItem(KEYS.SESSION, JSON.stringify(state.user));
    bootDesktop();
  });
}

async function verifyUser(username, password){
  let users;
  try{
    users = await (await fetch("users.json", {cache:"no-store"})).json();
  }catch(e){
    qs("#loginErr").textContent = "Cannot load users.json (serve over HTTP).";
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

async function bootDesktop(){
  // Swap screens
  qs("#loginScreen").classList.add("hidden");
  qs("#desktop").classList.remove("hidden");

  // Load templates
  const templates = await (await fetch("templates.json", {cache:"no-store"})).json();
  const savedTemplate = localStorage.getItem(KEYS.TEMPLATE);
  state.template = templates.find(t => t.id === savedTemplate) || templates[0];
  applyTemplate(state.template);

  // Load apps
  state.apps = await (await fetch("apps.json", {cache:"no-store"})).json();
  renderAppGrid(state.apps);
}

function applyTemplate(tpl){
  document.documentElement.style.setProperty("--tile-radius", tpl.vars.tileRadius);
  document.documentElement.style.setProperty("--window-radius", tpl.vars.windowRadius);
  if (tpl.vars.accent) document.documentElement.style.setProperty("--accent", tpl.vars.accent);
  localStorage.setItem(KEYS.TEMPLATE, tpl.id);
}

function renderAppGrid(apps){
  const grid = qs("#desktopArea");
  grid.innerHTML = "";
  apps.forEach(app=>{
    const tile = document.createElement("button");
    tile.className = "icon-tile";
    tile.setAttribute("role", "button");
    tile.innerHTML = `
      <div class="icon" aria-hidden="true">${app.icon || "🧩"}</div>
      <div class="name">${app.name}</div>
    `;
    tile.addEventListener("dblclick", ()=> openAppWindow(app));
    tile.addEventListener("keydown", (e)=>{ if (e.key==="Enter") openAppWindow(app); });
    grid.appendChild(tile);
  });
}

function openAppWindow(app){
  // If already open, focus
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
    <iframe src="${app.url}" title="${app.name}" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
  `;

  qs("#windowLayer").appendChild(win);
  state.windows.set(app.id, win);
  addTaskButton(app);

  enableDrag(win);
  focusWindow(win);

  // Controls
  const [closeBtn, minBtn, maxBtn] = qsa(".actions > *", win);
  closeBtn.addEventListener("click", ()=> closeWindow(app.id));
  minBtn.addEventListener("click", ()=> minimizeWindow(app.id));
  maxBtn.addEventListener("click", ()=> maximizeWindow(app.id));
}

function focusWindow(win){
  // Bring to front
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
  // remove task button
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

/* Settings modal */
async function openSettings(){
  // Gather templates and wallpapers
  const templates = await (await fetch("templates.json", {cache:"no-store"})).json();
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
        <div>
          <button id="applyBtn">Apply</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Preselect current
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
}

async function loadTemplateById(id){
  const templates = await (await fetch("templates.json", {cache:"no-store"})).json();
  const tpl = templates.find(t => t.id === id) || templates[0];
  applyTemplate(tpl);
}

async function listWallpapers(){
  // There is no directory listing in static hosting by default,
  // so we return the canonical set. Add more files here as needed.
  const known = [
    "/wallpapers/default.jpg",
    "/wallpapers/mac-bigsur.jpg",
    "/wallpapers/win11-bloom.jpg"
  ];
  return known;
}

function doLogout(){
  localStorage.removeItem(KEYS.SESSION);
  location.reload();
}