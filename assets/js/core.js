// core.js — shared utilities


export const KEYS = {
    SESSION: "desktop.session",
    THEME: "desktop.theme",
    TEMPLATE: "desktop.template",
    WALLPAPER: "desktop.wallpaper",
    ICON_ORDER: "desktop.iconOrder",
    ICON_NAMES: "desktop.iconNames",
    };
    
    
    export function qs(s, el=document){ return el.querySelector(s); }
    export function qsa(s, el=document){ return Array.from(el.querySelectorAll(s)); }
    
    
    export function safeJSON(str){ try { return JSON.parse(str || "null"); } catch { return null; } }
    
    
    export async function sha256(txt){
    const enc = new TextEncoder().encode(txt);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
    }
    
    
    export async function fetchJSON(path){
    const res = await fetch(path, {cache:"no-store"});
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json();
    }
    
    
    export function toast(msg, ms=2200){
    const host = qs("#toasts") || (()=>{ const d=document.createElement('div'); d.id='toasts'; d.className='toasts'; document.body.appendChild(d); return d; })();
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; host.appendChild(el);
    setTimeout(()=> el.remove(), ms);
    }
    
    
    export function setTheme(theme){ document.documentElement.setAttribute("data-theme", theme); localStorage.setItem(KEYS.THEME, theme); }
    export function setWallpaper(path){ const desk = qs("#desktop") || document.body; desk.style.backgroundImage = `url('${path}')`; localStorage.setItem(KEYS.WALLPAPER, path); }
    
    
    export async function verifyUser(username, password){
    let users = null;
    try{ users = await (await fetch("/users.json", {cache:"no-store"})).json(); }
    catch(e){ if (username === "admin" && password === "admin123") return true; throw new Error("Cannot load users.json"); }
    const record = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!record) return false;
    const digest = await sha256(password);
    return (digest === record.password_sha256);
    }