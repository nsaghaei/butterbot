const fs=require('fs');const scene=fs.readFileSync('work/ui-scene.mjs','utf8');
const prefix=`import * as THREE from '/three.js';
import {OrbitControls} from '/OrbitControls.js';
import {avatar,updateAvatar} from '/avatars.js';
import {PRINTER} from '/environment-layout.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),title=s=>String(s??'').replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase()),clock=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
let state=null,prev=null,received=0,selected='actor';const designs=new Map(),objects=new Map(),loading=new Map();
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error||'Request failed');return result;}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function call(path,data){return post(path,data).catch(e=>toast(e.message));}
`;
fs.writeFileSync('outputs/maker/web-next/app.js',prefix+scene+fs.readFileSync('work/ui-main.mjs','utf8'));
