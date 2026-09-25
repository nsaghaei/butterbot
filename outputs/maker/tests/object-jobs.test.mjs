import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {validateAction,feasibleActions} from '../actions.mjs';

const cube=await compileDesign({name:'Small cube',description:'A small movable cube.',kind:'prop',mass:1,affordances:['display'],attributes:{maxThrowSpeed:4},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshToonMaterial({color:0xe49635})));return g;'});
const noModels={laya:{ready:false},generator:{ready:false},calls:{},activeRequests:{},healthTime:Date.now(),health:async()=>{},decide:()=>assert.fail('Manual physical tests must not call Laya'),generate:()=>assert.fail('Manual physical tests must not call Gemma')};
const ticks=(garden,count)=>{for(let i=0;i<count;i++)garden.step();};
function garden(options={}){const g=new Garden({providers:noModels,seedFood:false,...options});g.mode='manual';for(const b of g.brains.values())b.mode='manual';ticks(g,90);return g;}
function add(g,overrides={},position={x:-1,y:.3,z:4.4}){const design={...structuredClone(cube),...overrides,attributes:{...cube.attributes,...overrides.attributes}};const e=g.physics.add(design,position);g.designs[e.id]=e.design;ticks(g,60);return e;}
function start(g,action){const b=g.selected;b.goalSource='user';b.objective=action.label||action.action;b.planSteps=[{...action}];b.planIndex=0;b.pendingStepEvidence=null;b.startAction(action);return b;}
const outcome=b=>b.logs.filter(l=>l.type==='action_outcome').at(-1);

test('pickup and drop commit during physical gestures and produce one outcome after their durations',()=>{
  const g=garden();try{const e=add(g),b=start(g,{action:'pick_up',target:e.id,label:'Pick up cube'});
    assert.equal(e.carried,false);ticks(g,25);assert.equal(e.carried,false);assert.equal(b.actor.activity,'pick_up');assert.ok(b.actor.actionProgress>0);assert.equal(outcome(b),undefined);
    ticks(g,15);assert.equal(e.carrier,'actor');assert.equal(b.stage,'acting');assert.equal(outcome(b),undefined);
    ticks(g,30);assert.equal(b.stage,'awaiting_step_done');assert.equal(outcome(b).status,'completed');assert.equal(outcome(b).action,'pick_up');assert.ok(g.physics.position(e).y>1);
    const height=g.physics.position(e).y;start(g,{action:'drop',target:e.id,label:'Drop cube'});ticks(g,20);assert.equal(e.carried,true);ticks(g,10);assert.equal(e.carried,false);assert.equal(b.stage,'acting');ticks(g,30);
    assert.equal(outcome(b).action,'drop');assert.equal(outcome(b).status,'completed');assert.ok(g.physics.position(e).y<height-.2);assert.equal(b.logs.filter(l=>l.type==='action_outcome').length,2);
  }finally{g.physics.dispose();}
});

test('throw releases a held prop with bounded launch speed and real displacement',()=>{
  const g=garden();try{const e=add(g);start(g,{action:'pick_up',target:e.id});ticks(g,70);const b=start(g,{action:'throw',target:e.id,x:-1,z:8,speed:4,label:'Throw cube'});
    ticks(g,36);assert.equal(e.carried,true);assert.equal(outcome(b).action,'pick_up');ticks(g,2);assert.equal(e.carried,false);
    const v=e.body.linvel();assert.ok(Math.abs(Math.hypot(v.x,v.y,v.z)-4)<.03);assert.ok(v.z>0);const launched={...g.physics.position(e)};ticks(g,42);
    assert.equal(outcome(b).action,'throw');assert.equal(outcome(b).status,'completed');assert.ok(Math.hypot(g.physics.position(e).x-launched.x,g.physics.position(e).z-launched.z)>.8);assert.equal(b.stage,'awaiting_step_done');
  }finally{g.physics.dispose();}
});

test('push completion is supported by actual displacement after the shove',()=>{
  const g=garden();try{const e=add(g),p={...g.physics.position(e)},b=start(g,{action:'push',target:e.id,x:-1,z:8,strength:3,label:'Push cube'});
    ticks(g,45);assert.equal(outcome(b),undefined);assert.ok(Math.abs(g.physics.position(e).z-p.z)<.03);ticks(g,70);
    assert.equal(outcome(b).action,'push');assert.equal(outcome(b).status,'completed');assert.ok(g.physics.position(e).z-p.z>.025);assert.match(outcome(b).outcome,/moved/);
  }finally{g.physics.dispose();}
});

test('gifting transfers a held object to a nearby character only during the gesture',()=>{
  const g=garden({cast:'ensemble'});try{const recipient=g.physics.entities.get('pip'),position={x:-1,y:1.2,z:4.6};recipient.body.setTranslation(position,true);recipient.rig.resetAt(position);const e=add(g,{}, {x:0,y:.3,z:3.6});start(g,{action:'pick_up',target:e.id});ticks(g,70);const b=start(g,{action:'give',target:e.id,recipient:'pip',label:'Give cube to Pip'});
    ticks(g,30);assert.equal(e.carrier,'actor');assert.equal(outcome(b).action,'pick_up');ticks(g,25);assert.equal(e.carrier,'pip');assert.equal(e.owner,'pip');assert.equal(b.stage,'acting');ticks(g,35);
    assert.equal(outcome(b).action,'give');assert.equal(outcome(b).status,'completed');assert.equal(e.carrier,'pip');assert.equal(b.stage,'awaiting_step_done');
  }finally{g.physics.dispose();}
});

test('giving rechecks recipient distance at contact and keeps the object when the recipient moves away',()=>{
  const g=garden({cast:'ensemble'});try{const recipient=g.physics.entities.get('pip'),near={x:-1,y:1.2,z:4.6};recipient.body.setTranslation(near,true);recipient.rig.resetAt(near);const e=add(g,{}, {x:0,y:.3,z:3.6});start(g,{action:'pick_up',target:e.id});ticks(g,70);const b=start(g,{action:'give',target:e.id,recipient:'pip'});const far={x:8,y:1.2,z:7};recipient.body.setTranslation(far,true);recipient.rig.resetAt(far);ticks(g,60);
    assert.equal(e.carrier,'actor');assert.equal(outcome(b).status,'failed');assert.match(outcome(b).outcome,/recipient|2m/);assert.equal(b.stage,'failed');
  }finally{g.physics.dispose();}
});

test('eating takes time, consumes one serving, saves remaining servings and removes exhausted food',()=>{
  const g=garden();let restored;try{const e=add(g,{name:'Orange',mass:.2,attributes:{edible:true,servings:2}}),b=start(g,{action:'eat',target:e.id,label:'Eat orange'});b.needs.hunger=80;
    ticks(g,150);assert.equal(e.servings,2);assert.ok(b.needs.hunger>=80);assert.equal(outcome(b),undefined);assert.equal(e.carrier,'actor');ticks(g,35);
    assert.equal(e.servings,1);assert.equal(outcome(b).status,'completed');assert.ok(b.needs.hunger>52&&b.needs.hunger<52.4);assert.equal(outcome(b).needFulfillment.before.hunger-outcome(b).needFulfillment.after.hunger,28);assert.equal(e.carried,false);
    restored=garden();restored.restore(g.save());const remaining=restored.physics.entities.get(e.id);assert.equal(remaining.servings,1);assert.equal(remaining.edible,true);
    start(restored,{action:'eat',target:e.id,label:'Finish orange'});ticks(restored,185);assert.equal(restored.physics.entities.has(e.id),false);assert.equal(restored.designs[e.id],undefined);assert.equal(outcome(restored.selected).status,'completed');
    const saved=restored.save();assert.ok(!saved.world.entities.some(x=>x.id===e.id));assert.equal(saved.designs[e.id],undefined);assert.ok(!feasibleActions(restored,restored.selected).some(a=>a.target===e.id));
  }finally{restored?.physics.dispose();g.physics.dispose();}
});

test('paused interaction cannot consume food or advance its physical gesture',()=>{
  const g=garden();try{const e=add(g,{name:'Orange',attributes:{edible:true,servings:1}}),b=start(g,{action:'eat',target:e.id});ticks(g,30);g.paused=true;const time=b.time,progress=b.actor.actionProgress,position={...g.physics.position(e)};ticks(g,240);
    assert.equal(b.time,time);assert.equal(b.actor.actionProgress,progress);assert.deepEqual({...g.physics.position(e)},position);assert.equal(e.servings,1);assert.equal(outcome(b),undefined);g.paused=false;ticks(g,160);assert.equal(g.physics.entities.has(e.id),false);assert.equal(outcome(b).status,'completed');
  }finally{g.physics.dispose();}
});

test('impossible object actions are blocked using attributes, mass, ownership and speed',()=>{
  const g=garden();try{const tree=add(g,{name:'Tree',mass:150,attributes:{anchored:true}}),b=g.selected;
    assert.throws(()=>validateAction(g,b,{action:'eat',target:tree.id}),/not edible/);assert.throws(()=>validateAction(g,b,{action:'pick_up',target:tree.id}),/150kg|lifting limit/);assert.throws(()=>validateAction(g,b,{action:'push',target:tree.id,x:2,z:8,strength:3}),/anchored/);
    const e=add(g,{}, {x:0,y:.3,z:3});assert.throws(()=>validateAction(g,b,{action:'throw',target:e.id,x:0,z:8,speed:4}),/Nothing is held/);start(g,{action:'pick_up',target:e.id});ticks(g,70);
    assert.throws(()=>validateAction(g,b,{action:'throw',target:e.id,x:0,z:8,speed:4.1}),/at most 4/);assert.throws(()=>validateAction(g,b,{action:'give',target:e.id,recipient:'actor'}),/yourself/);assert.throws(()=>validateAction(g,b,{action:'give',target:e.id,recipient:'ghost'}),/existing character/);assert.equal(e.carrier,'actor');
    assert.ok(!feasibleActions(g,b).some(a=>a.target===tree.id&&['eat','pick_up','push','throw'].includes(a.action)));
  }finally{g.physics.dispose();}
});
