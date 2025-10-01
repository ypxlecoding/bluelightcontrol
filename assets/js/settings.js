// settings.js — logic for standalone settings page
import { KEYS, qs, fetchJSON, setTheme, setWallpaper, toast } from './core.js';


(async function(){
// populate selects
const templates = await fetchJSON('/templates.json');
const knownWps = ['/wallpapers/default.jpg','/wallpapers/mac-bigsur.jpg','/wallpapers/win11-bloom.jpg'];


qs('#themeSel').value = document.documentElement.getAttribute('data-theme') || localStorage.getItem(KEYS.THEME) || 'windows';
qs('#tplSel').innerHTML = templates.map(t=>`<option value='${t.id}'>${t.name}</option>`).join('');
qs('#tplSel').value = localStorage.getItem(KEYS.TEMPLATE) || templates[0].id;


qs('#wpSel').innerHTML = knownWps.map(w=>`<option value='${w}'>${w.split('/').pop()}</option>`).join('');
qs('#wpSel').value = localStorage.getItem(KEYS.WALLPAPER) || '/wallpapers/default.jpg';


qs('#applyBtn').addEventListener('click',()=>{
setTheme(qs('#themeSel').value);
const tplId=qs('#tplSel').value; fetchJSON('/templates.json').then(ts=>{ const tpl=ts.find(t=>t.id===tplId)||ts[0]; document.documentElement.style.setProperty('--tile-radius', tpl.vars.tileRadius); document.documentElement.style.setProperty('--window-radius', tpl.vars.windowRadius); if(tpl.vars.accent) document.documentElement.style.setProperty('--accent', tpl.vars.accent); localStorage.setItem(KEYS.TEMPLATE, tpl.id); });
setWallpaper(qs('#wpSel').value);
toast('Settings applied');
});


qs('#resetDesktop').addEventListener('click',()=>{ localStorage.removeItem(KEYS.ICON_ORDER); localStorage.removeItem(KEYS.ICON_NAMES); toast('Desktop layout reset'); });
qs('#clearAll').addEventListener('click',()=>{ Object.values(KEYS).forEach(k=> localStorage.removeItem(k)); toast('Cleared local settings'); });
})();