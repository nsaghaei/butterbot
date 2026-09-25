import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {Physics} from '../physics.mjs';
import {compileDesign} from '../design.mjs';
import {sampleForKind} from '../world.mjs';

const providers={generator:{ready:true},laya:{ready:true},healthTime:Date.now(),calls:{},decide:async(_s,_q,choices)=>({response:{choice:choices.done?'done':Object.keys(choices)[0]}}),verifyStep:async()=>({value:{complete:true,explanation:'The engine completed the furniture interaction.'}})};
const tick=(g,n)=>{for(let i=0;i<n;i++)g.step();};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

for(const use of ['sit','rest'])test(`a ${use} step gets up and physically walks to the next target in the same plan`,async()=>{
  const g=new Garden({providers,seedFood:false});
  try{
    const design=await compileDesign({...sampleForKind({kind:'prop',interaction:use}),attributes:{anchored:true}}),e=g.physics.add(design,{x:-1,y:design.dimensions?.[1]/2||.7,z:4.5});
    tick(g,180);const b=g.selected;b.assign(`${use} here, then walk to (3, 5).`);
    b.planSteps=[{action:'use',target:e.id,use,label:use+' on furniture'},{action:'move',x:3,z:5,label:'Walk to (3,5)'}];b.stage='action_decide';b.startAction(b.planSteps[0]);
    for(let i=0;i<480&&b.stage!=='awaiting_step_done';i++)g.step();
    assert.equal(b.stage,'awaiting_step_done');assert.equal(b.actor.seated,true);assert.equal(b.planIndex,0);
    if(use==='rest'){assert.equal(b.actor.reclining,true);assert.equal(b.actor.collider.isEnabled(),false);}
    const resting={...b.actor.body.translation()};tick(g,15);assert.ok(distance(resting,b.actor.body.translation())<.001);
    b.nextCall=0;await b.poll();b.nextCall=0;await b.poll();assert.equal(b.planIndex,1);
    b.nextCall=0;await b.poll();assert.equal(b.job.action,'move');g.step();
    assert.equal(b.actor.seated,false);assert.equal(b.actor.reclining,false);assert.equal(b.actor.collider.isEnabled(),true);
    assert.ok(b.actor.body.translation().y>=resting.y-.01);assert.ok(distance(b.actor.body.translation(),resting)<.1);
    for(let i=0;i<900&&b.stage==='acting';i++)g.step();
    assert.equal(b.stage,'awaiting_step_done',b.error||use);assert.equal(b.pendingStepEvidence.job.action,'move');
    assert.ok(distance(b.actor.body.translation(),{x:3,z:5})<.18);assert.ok(b.actor.travel>3);
    assert.ok(b.actor.rig.snapshot().bodies.every(part=>Object.values(part.position).every(Number.isFinite)));
    assert.equal(b.logs.filter(l=>l.type==='action_outcome'&&l.action==='move').length,1);
  }finally{g.physics.dispose();}
});

test('resting characters stay at rest without a movement goal and mounted characters do not auto-dismount',()=>{
  const p=new Physics();
  try{
    tick(p,60);const a=p.actor;a.seated=true;a.reclining=true;a.collider.setEnabled(false);const before={...a.body.translation()};
    tick(p,90);assert.equal(a.seated,true);assert.equal(a.reclining,true);assert.equal(a.collider.isEnabled(),false);assert.deepEqual({...a.body.translation()},before);
    a.mounted='vehicle';a.goal={x:3,z:6};tick(p,30);assert.equal(a.mounted,'vehicle');assert.equal(a.seated,true);assert.equal(a.collider.isEnabled(),false);
    assert.equal(p.standUp('actor'),false);assert.deepEqual({...a.body.translation()},before);
  }finally{p.dispose();}
});

test('direct movement restores navigation once without repeatedly lifting the character',()=>{
  const p=new Physics();
  try{
    tick(p,60);const a=p.actor;a.seated=true;a.collider.setEnabled(false);const before={...a.body.translation()};
    p.move(a,{x:2,z:5},1/60);assert.equal(a.seated,false);assert.equal(a.collider.isEnabled(),true);
    const upright={...a.body.translation()};assert.equal(p.standUp(a.id),false);assert.deepEqual({...a.body.translation()},upright);
    a.goal={x:2,z:5};tick(p,180);assert.ok(distance(a.body.translation(),before)>1);assert.ok(a.body.translation().y<2);
  }finally{p.dispose();}
});
