(function () {
  const qs = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));
  const desktop = qs('#desktop');
  const taskbar = qs('#taskbar');
  const dock = qs('#dock');
  const clock = qs('#clock');
  const themeSelect = qs('#themeSelect');

  const SKEY = window.__WD__.storageKey || 'wd_state';
  const state = { z: 10, windows: {}, tasks: {} };

  function tickClock() {
    const now = new Date();
    clock.textContent = now.toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  setInterval(tickClock, 1000); tickClock();

  // Load themes & apps
  Promise.all([
    fetch(window.__WD__.themesJson).then(r=>r.json()),
    fetch(window.__WD__.appsJson).then(r=>r.json())
  ]).then(([themes, apps]) => {
    // themes
    const list = themes.list || ['dark','light'];
    const def = themes.default || 'dark';
    themeSelect.innerHTML = list.map(t=>`<option value="${t}">${t[0].toUpperCase()+t.slice(1)}</option>`).join('');
    const saved = loadState().theme || def;
    setTheme(saved, false);
    themeSelect.value = saved;
    themeSelect.addEventListener('change', e => setTheme(e.target.value));

    // apps (render buttons)
    (apps.apps || []).forEach(app => {
      const btn = document.createElement('button');
      btn.className = 'dock-item';
      btn.dataset.appId = app.id;
      btn.title = app.name;
      btn.innerHTML = `${app.icon ? `<img src="${app.icon}" alt="">` : '■'}<span>${app.name}</span>`;
      btn.addEventListener('click', () => openApp(app));
      dock.insertBefore(btn, dock.firstChild);
    });

    restoreWindows(apps.apps || []);
  });

  function setTheme(name, persist=true) {
    document.documentElement.setAttribute('data-theme', name);
    if (persist) saveState({ theme: name });
  }

  function openApp(app) {
    const id = app.id;
    if (state.windows[id]) { focusWindow(state.windows[id].el); return; }

    const win = document.createElement('section');
    win.className = 'window';
    win.style.left = (40 + Object.keys(state.windows).length * 24) + 'px';
    win.style.top = (80 + Object.keys(state.windows).length * 24) + 'px';
    win.style.width = (app.width || 560) + 'px';
    win.style.height = (app.height || 400) + 'px';
    win.dataset.appId = id;

    const bar = document.createElement('div');
    bar.className = 'win-titlebar';
    bar.innerHTML = `<strong>${app.name}</strong><div class="win-controls">
      <button class="win-btn" data-act="min" title="Minimize">–</button>
      <button class="win-btn" data-act="max" title="Maximize">□</button>
      <button class="win-btn" data-act="close" title="Close">×</button>
    </div>`;
    win.appendChild(bar);

    const content = document.createElement('div');
    content.className = 'win-content';
    if (app.type === 'iframe') {
      const f = document.createElement('iframe');
      f.src = app.url;
      content.appendChild(f);
    } else {
      const inner = document.createElement('div');
      inner.className = 'pad';
      inner.innerHTML = app.html || '<em>Empty app</em>';
      content.appendChild(inner);
    }
    win.appendChild(content);

    // Dragging
    let drag = null;
    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.win-controls')) return;
      drag = {dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop};
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
    });
    function onDrag(e) {
      if (!drag) return;
      win.style.left = Math.max(0, e.clientX - drag.dx) + 'px';
      win.style.top  = Math.max(42, e.clientY - drag.dy) + 'px';
    }
    function stopDrag() {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
      persistPositions();
    }

    // Resize (SE corner)
    let rs = null;
    win.addEventListener('mousedown', (e) => {
      const rect = win.getBoundingClientRect();
      if (e.clientX > rect.right - 16 && e.clientY > rect.bottom - 16) {
        rs = {w: rect.width, h: rect.height, x: e.clientX, y: e.clientY};
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);
      }
    });
    function onResize(e) {
      if (!rs) return;
      const nw = Math.max(320, rs.w + (e.clientX - rs.x));
      const nh = Math.max(200, rs.h + (e.clientY - rs.y));
      win.style.width = nw + 'px';
      win.style.height = nh + 'px';
    }
    function stopResize() {
      document.removeEventListener('mousemove', onResize);
      document.removeEventListener('mouseup', stopResize);
      persistPositions();
    }

    // Controls
    bar.addEventListener('click', (e) => {
      const act = e.target.closest('.win-btn')?.dataset?.act;
      if (!act) return;
      if (act === 'close') closeWindow(id);
      if (act === 'min') minimizeWindow(id);
      if (act === 'max') toggleMaximize(id);
    });

    desktop.appendChild(win);
    focusWindow(win);

    // Task button
    const task = document.createElement('button');
    task.className = 'task';
    task.textContent = app.name;
    task.addEventListener('click', () => {
      if (win.classList.contains('hidden')) {
        win.classList.remove('hidden');
        focusWindow(win);
      } else {
        minimizeWindow(id);
      }
    });
    taskbar.appendChild(task);

    state.windows[id] = { app, el: win, task };
    persistPositions();
  }

  function focusWindow(win) {
    state.z += 1;
    win.style.zIndex = state.z;
  }
  function closeWindow(id) {
    const w = state.windows[id];
    if (!w) return;
    w.el.remove(); w.task.remove();
    delete state.windows[id];
    persistPositions();
  }
  function minimizeWindow(id) {
    const w = state.windows[id];
    if (!w) return;
    w.el.classList.toggle('hidden');
  }
  function toggleMaximize(id) {
    const w = state.windows[id];
    if (!w) return;
    w.el.classList.toggle('max');
    if (w.el.classList.contains('max')) {
      w.el.style.left = '0px';
      w.el.style.top = '42px';
      w.el.style.width = '100%';
      w.el.style.height = 'calc(100% - 42px - 36px)';
    } else {
      w.el.style.width = (w.app.width || 560) + 'px';
      w.el.style.height = (w.app.height || 400) + 'px';
    }
    persistPositions();
  }

  // Persistence (localStorage)
  function loadState() {
    try { return JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch(e) { return {}; }
  }
  function saveState(partial) {
    const cur = loadState();
    const next = Object.assign({}, cur, partial);
    localStorage.setItem(SKEY, JSON.stringify(next));
  }
  function persistPositions() {
    const winState = {};
    Object.entries(state.windows).forEach(([id, w]) => {
      const r = w.el.getBoundingClientRect();
      winState[id] = {
        x: w.el.style.left, y: w.el.style.top,
        w: w.el.style.width, h: w.el.style.height,
        hidden: w.el.classList.contains('hidden') || false
      };
    });
    saveState({ windows: winState, theme: document.documentElement.getAttribute('data-theme') });
  }
  function restoreWindows(appList) {
    const st = loadState();
    const winState = st.windows || {};
    Object.keys(winState).forEach(id => {
      const meta = appList.find(a => a.id === id);
      if (!meta) return;
      openApp(meta);
      const w = state.windows[id]; if (!w) return;
      const sW = winState[id];
      w.el.style.left = sW.x || w.el.style.left;
      w.el.style.top = sW.y || w.el.style.top;
      w.el.style.width = sW.w || w.el.style.width;
      w.el.style.height = sW.h || w.el.style.height;
      if (sW.hidden) w.el.classList.add('hidden'); else w.el.classList.remove('hidden');
    });
  }
})();