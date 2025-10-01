// admin.js — client-side JSON editor (download after edits)
import { qs, fetchJSON, sha256, toast } from './core.js';


const editor = qs('#editor');
let currentPath = null;


qs('[data-open="apps.json"]').addEventListener('click', ()=> openFile('apps.json'));
qs('[data-open="templates.json"]').addEventListener('click', ()=> openFile('templates.json'));
qs('[data-open="users.json"]').addEventListener('click', ()=> openFile('users.json'));


qs('#validateBtn').addEventListener('click', ()=>{
try{ JSON.parse(editor.value); toast('Valid JSON ✔'); }
catch(e){ toast('Invalid JSON: ' + e.message); }
});


qs('#downloadBtn').addEventListener('click', ()=>{
if (!currentPath) { toast('Open a file first'); return; }
downloadJSON(editor.value, currentPath);
});


qs('#genUser').addEventListener('click', async ()=>{
const n = qs('#uName').value.trim();
const p = qs('#uPass').value; const r = qs('#uRole').value || 'user';
if (!n || !p) { toast('Enter username & password'); return; }
const digest = await sha256(p);
const obj = { username:n, password_sha256:digest, role:r };
qs('#userOut').textContent = JSON.stringify(obj, null, 2);
});


qs('#appendUser').addEventListener('click', ()=>{
if (!currentPath || currentPath !== 'users.json') { toast('Open users.json first'); return; }
if (!editor.value.trim()) { toast('users.json is empty'); return; }
try{
const arr = JSON.parse(editor.value);
const obj = JSON.parse(qs('#userOut').textContent || '{}');
if (!obj.username) { toast('Generate user first'); return; }
arr.push(obj);
editor.value = JSON.stringify(arr, null, 2);
toast('User appended (remember to Download)');
}catch(e){ toast('Error: ' + e.message); }
});


async function openFile(path){
try{ const data = await fetchJSON('/' + path); editor.value = JSON.stringify(data, null, 2); currentPath = path; toast('Opened ' + path); }
catch(e){ editor.value = ''; currentPath = null; toast('Cannot load ' + path); }
}


function downloadJSON(text, filename){
try{ JSON.parse(text); } catch{ toast('Fix JSON before download'); return; }
const blob = new Blob([text], {type:'application/json'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
URL.revokeObjectURL(url);
}