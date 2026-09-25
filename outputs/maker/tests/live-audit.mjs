// Independent in-memory world: never reads or mutates the user-facing server.
import {Garden} from '../garden.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const garden=new Garden(),brain=garden.selected;await garden.providers.health();assert.ok(garden.providers.laya.ready&&garden.providers.generator.ready);
const dir=new URL('../evidence/',import.meta.url);await mkdir(dir,{recursive:true});
async function run(name,goal,expected){
  garden.assign('actor',goal);let transitions=[],last=null;const start=Date.now();
  for(let i=0;i<18000;i++){
    if(brain.stage!==last){transitions.push({stage:brain.stage,time:brain.time});last=brain.stage;console.log(name,brain.stage,brain.error||'');}
    if(['complete','failed'].includes(brain.stage))break;
    for(let j=0;j<15;j++)garden.step();brain.nextCall=0;
    if(!['acting','approaching','placing','printing','preview','settling','interacting','queued'].includes(brain.stage))await brain.poll();
    if(Date.now()-start>240000)throw Error(name+' wall-clock timeout');
  }
  const snapshot=brain.snapshot();await writeFile(new URL('live-'+name+'-v2.json',dir),JSON.stringify({snapshot,designs:garden.designs,transitions,wallMs:Date.now()-start},null,2));
  if(expected)expected(snapshot);console.log(name,'RESULT',brain.stage,brain.result||brain.error);return snapshot;
}
try{
  const walk=await run('walk-dance','Walk to the quiet patch at (-2, 5), then dance there.',s=>{assert.equal(s.stage,'complete');const outcomes=s.logs.filter(l=>l.cycle===s.cycle&&l.type==='action_outcome');assert.deepEqual(outcomes.map(o=>o.action),['move','dance']);assert.ok(s.needs.fun>=85);});
  const panda=await run('red-panda','Get a squishy red panda plush and squeeze it.',s=>{assert.equal(s.kind,'soft');assert.equal(s.interaction,'squish');assert.equal(s.stage,'complete');assert.ok(s.logs.some(l=>l.cycle===s.cycle&&l.type==='laya'&&l.response?.choice==='print'&&l.status==='accepted'));});
  const plush=brain.activeId;await run('carry-plush',`Pick up the existing ${garden.physics.entities.get(plush).design.name} and place it at (3, 6).`,s=>{assert.equal(s.stage,'complete');const p=garden.physics.position(garden.physics.entities.get(plush));assert.ok(Math.hypot(p.x-3,p.z-6)<.5);});
  await run('unsupported','Climb the tall tree and fly over the fence.',s=>assert.equal(s.stage,'failed'));
  await brain.reflect('Explain why the current objective cannot be executed');await writeFile(new URL('live-reflection-v2.json',dir),JSON.stringify({memory:brain.memory,thought:brain.thought,record:brain.logs.at(-1)},null,2));assert.ok(brain.thought?.text);console.log('REFLECTION',brain.thought);
}finally{garden.physics.dispose();}
