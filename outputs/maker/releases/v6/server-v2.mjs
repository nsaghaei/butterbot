import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {Garden} from './garden.mjs';
import {PRESETS,sampleForKind} from './world.mjs';
import {compileDesign} from './design.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),port=Number(process.env.PORT||8790),saveFile=process.env.SAVE_FILE||path.join(root,'saved','garden-v2.json');let world=new Garden({seedFood:false});
if(process.env.NO_RESTORE!=='1'){for(const file of [saveFile,path.join(root,'saved','world-snapshot.json')]){try{world.restore(JSON.parse(await readFile(file,'utf8')));console.log('Restored '+file);break;}catch(error){if(error.code!=='ENOENT')console.error('Restore:',error.message);}}}
const clients=new Set();let last=performance.now(),accumulator=0,lastSend=0,saving=false;
function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw Error('JSON body required');let data='';for await(const part of req){data+=part;if(data.length>100000)throw Error('Request too large');}return JSON.parse(data);}
async function save(){if(saving)return;saving=true;try{await mkdir(path.dirname(saveFile),{recursive:true});await writeFile(saveFile,JSON.stringify(world.save()));}finally{saving=false;}}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'");
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host)||req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin))return json(res,403,{error:'Local origin required'});
  try{const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(req.method==='GET'){
      if(url.pathname==='/api/state')return json(res,200,world.snapshot());
      if(url.pathname==='/api/config')return json(res,200,{presets:PRESETS,openaiConfigured:!!process.env.OPENAI_API_KEY});
      if(url.pathname==='/api/history')return json(res,200,{logs:world.logs,history:world.history});
      if(url.pathname==='/api/actions')return json(res,200,world.snapshot().actions);
      if(url.pathname.startsWith('/api/design/')){const design=world.designs[url.pathname.split('/').at(-1)];return json(res,design?200:404,design||{error:'Unknown design'});}
      if(url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify(world.snapshot())}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return;}
      const files={'/':'web-next/index.html','/app.js':'web-next/app.js','/avatars.js':'web-next/avatars.js','/style.css':'web-next/style.css','/three.js':'node_modules/three/build/three.module.js','/three.core.js':'node_modules/three/build/three.core.js','/OrbitControls.js':'node_modules/three/examples/jsm/controls/OrbitControls.js','/favicon.svg':'web/favicon.svg'};
      const file=files[url.pathname];if(!file)return json(res,404,{error:'Not found'});let content=await readFile(file.startsWith('node_modules/')&&process.env.SHARED_NODE_MODULES?path.join(process.env.SHARED_NODE_MODULES,file.slice(13)):path.join(root,file));if(file.endsWith('OrbitControls.js'))content=Buffer.from(content.toString().replace("from 'three'","from '/three.js'"));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/javascript'});res.end(content);return;
    }
    if(req.method==='POST'){
      const data=await body(req),brain=world.brains.get(data.actorId||world.selectedActor);if(!brain)throw Error('Unknown character');
      if(url.pathname==='/api/select'){world.selectedActor=brain.actorId;return json(res,200,{ok:true});}
      if(url.pathname==='/api/objective'){if(typeof data.objective!=='string'||!data.objective.trim()||data.objective.length>240)throw Error('Please use a goal of 1–240 characters');world.assign(brain.actorId,data.objective.trim());await save();return json(res,200,{ok:true});}
      if(url.pathname==='/api/resume'){world.assign(brain.actorId,brain.objective);return json(res,200,{ok:true});}
      // Automated verification APIs; the user interface exposes character communication only.
      if(url.pathname==='/api/control'){
        if(data.paused!==undefined){if(typeof data.paused!=='boolean')throw Error('Invalid pause');world.paused=data.paused;for(const b of world.brains.values()){b.paused=data.paused;b.revision++;}}
        if(data.speed!==undefined){if(![1,2,4].includes(data.speed))throw Error('Invalid speed');world.speed=data.speed;}
        if(data.mode!==undefined){if(!['live','sample','demo','manual'].includes(data.mode))throw Error('Invalid mode');world.mode=data.mode;for(const b of world.brains.values()){b.mode=data.mode;b.revision++;b.nextCall=0;}}
        if(data.provider!==undefined){if(!['ollama','openai'].includes(data.provider))throw Error('Invalid provider');world.providers.provider=data.provider;await world.providers.checkGenerator();}
        if(data.retry){await world.providers.health();world.assign(brain.actorId,brain.objective);}return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/action'){brain.revision++;brain.startAction(data,{advance:false});return json(res,200,{ok:true});}
      if(url.pathname==='/api/physical'){
        const id=data.id||brain.actorId;world.invalidateObject(id);
        if(data.action==='impulse')world.physics.impulse(id,3);
        else if(data.action==='carry')world.physics.carry(id,brain.actorId);
        else if(data.action==='drop')world.physics.release(id);
        else if(data.action==='place')world.physics.place(id,data.point);
        else if(data.action==='drag')world.physics.drag(id,data.point);
        else if(data.action==='end_drag')world.physics.endDrag(id);
        else if(data.action==='walk'){if(!Number.isFinite(data.x)||!Number.isFinite(data.z)||Math.abs(data.x)>11||Math.abs(data.z)>10)throw Error('Destination outside garden');brain.actor.goal={x:data.x,z:data.z};}
        else if(data.action==='drive'){const e=world.physics.entities.get(id);if(!e?.vehicle)throw Error('Not a vehicle');for(const n of ['throttle','steer','brake'])if(!Number.isFinite(data[n])||Math.abs(data[n])>1)throw Error('Invalid drive');e.drive={throttle:data.throttle,steer:data.steer,brake:data.brake};}
        else throw Error('Unsupported physical action');return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/save'){await save();return json(res,200,{ok:true,file:saveFile});}
      if(url.pathname==='/api/sample'){if(!PRESETS[data.interaction])throw Error('Invalid sample kind');const design=await compileDesign(sampleForKind({kind:PRESETS[data.interaction].kind,interaction:data.interaction}));design.source='sample';design.material='sample';const e=world.physics.add(design,data.point||{x:5,y:2,z:4});world.designs[e.id]=design;return json(res,200,{ok:true,id:e.id});}
      if(url.pathname==='/api/reset'){if(typeof data.seed!=='string'||data.seed.length>80)throw Error('Invalid seed');const old=world;old.providers.generatorAbort?.abort('Scene reset');world=new Garden({seed:data.seed,providers:old.providers,seedFood:false});for(const b of old.brains.values())b.revision++;old.physics.dispose();await save();return json(res,200,{ok:true});}
    }json(res,404,{error:'Not found'});
  }catch(error){json(res,400,{error:error.message});}
});
setInterval(()=>{try{const now=performance.now(),elapsed=Math.min(.2,(now-last)/1000);last=now;if(!world.paused){accumulator+=elapsed*world.speed;const start=performance.now();let n=0;while(accumulator>=1/60&&n<48){world.step();accumulator-=1/60;n++;}world.metrics.maxStepMs=Math.max(world.metrics.maxStepMs,performance.now()-start);}if(now-lastSend>125&&clients.size){const data=`data: ${JSON.stringify(world.snapshot())}\n\n`;for(const c of clients){if(c.writableLength>3_000_000){c.end();clients.delete(c);}else c.write(data);}lastSend=now;}}catch(error){console.error(error);world.paused=true;world.selected.error=error.message;}},16);
setInterval(()=>void world.poll().catch(console.error),300);
setInterval(()=>void save().catch(console.error),20000);
server.listen(port,'127.0.0.1',()=>{console.log(`Maker Garden: http://127.0.0.1:${port}`);void world.providers.health();});
