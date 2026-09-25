import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Garden} from '../garden.mjs';

// Physical transforms/colliders from the real pre-v12 save. Generated mesh
// vertices, prompts and decision history are unnecessary for this replay.
const saved=JSON.parse(await readFile(new URL('./fixtures/reclining-tulip-save.json',import.meta.url),'utf8'));
const magnitude=value=>Math.hypot(value.x,value.y,value.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const offline={laya:{ready:false},generator:{ready:false},healthTime:Date.now(),calls:{}};

function assertStableRest(g,frames){
  const actor=g.physics.actor,tulip=g.physics.entities.get('item-1'),start={...tulip.body.translation()},resting={...actor.body.translation()};
  assert.equal(actor.reclining,true);assert.equal(actor.seated,true);assert.equal(actor.collider.isEnabled(),false);
  for(let frame=0;frame<frames;frame++){
    g.step();
    assert.ok(magnitude(tulip.body.linvel())<1,'An untouched resting object gained velocity at frame '+frame);
    assert.ok(distance(tulip.body.translation(),start)<.01,'An untouched resting object moved at frame '+frame);
    for(const [name,part]of Object.entries(actor.rig.parts))assert.ok(magnitude(part.body.linvel())<12,name+' gained unstable velocity at frame '+frame);
  }
  assert.deepEqual({...actor.body.translation()},resting);
  assert.equal(tulip.carried,false);assert.ok(!tulip.carrier);
  assert.ok(!g.selected.logs.some(record=>record.type==='action_outcome'));
}

test('restoring the reclining character cannot launch an untouched compound prop across the garden',()=>{
  const g=new Garden({providers:offline,seedFood:false});
  try{
    g.restore(structuredClone(saved));
    const expected=saved.world.entities.find(e=>e.id==='item-1'),tulip=g.physics.entities.get('item-1');
    assert.ok(distance(tulip.body.translation(),expected.position)<.000001);
    for(const key of ['x','y','z','w'])assert.ok(Math.abs(tulip.body.rotation()[key]-expected.rotation[key])<.000001);
    assertStableRest(g,1200);
  }finally{g.physics.dispose();}
});

test('saving and restoring a settled reclining scene again preserves stable objects and posture',()=>{
  const first=new Garden({providers:offline,seedFood:false}),second=new Garden({providers:offline,seedFood:false});
  try{
    first.restore(structuredClone(saved));assertStableRest(first,180);
    const checkpoint=first.save();second.restore(checkpoint);
    assert.equal(second.physics.actor.heading,first.physics.actor.heading);
    assertStableRest(second,600);
  }finally{first.physics.dispose();second.physics.dispose();}
});

for(const [label,height]of [['legacy frame',.6599999666213989],['current mattress',.8699999451637268]])test(`a restored ${label} resting pose can immediately stand and walk without launching nearby objects`,()=>{
  const g=new Garden({providers:offline,seedFood:false});
  try{
    const data=structuredClone(saved);data.world.entities.find(e=>e.id==='actor').position.y=height;g.restore(data);
    const actor=g.physics.actor,tulip=g.physics.entities.get('item-1'),start={...tulip.body.translation()},b=g.selected;
    // Assign before even one settling tick, as happens when resuming after restart.
    g.assign('actor','Walk to (6,8).');assert.equal(actor.reclining,false);assert.equal(actor.seated,false);assert.equal(actor.collider.isEnabled(),true);
    const step={action:'move',x:6,z:8,label:'Walk away from the bed'};b.planSteps=[step];b.stage='action_decide';b.startAction(step);
    for(let frame=0;frame<1200;frame++){
      g.step();assert.ok(magnitude(tulip.body.linvel())<1);assert.ok(distance(tulip.body.translation(),start)<.01);
      for(const [name,part]of Object.entries(actor.rig.parts))assert.ok(magnitude(part.body.linvel())<12,name+' became unstable during bed exit at frame '+frame);
    }
    assert.equal(b.stage,'awaiting_step_done',b.error);assert.equal(b.navigationRecoveries,0);
    assert.ok(Math.hypot(actor.body.translation().x-6,actor.body.translation().z-8)<.18);
    const outcomes=b.logs.filter(record=>record.type==='action_outcome');assert.equal(outcomes.length,1);assert.equal(outcomes[0].action,'move');assert.equal(outcomes[0].status,'completed');
    assert.equal(tulip.carried,false);assert.ok(!tulip.carrier);
  }finally{g.physics.dispose();}
});
