import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {validatePlanTargets,validateAction,resolveActionReferences} from '../actions.mjs';
import {objectInfo} from '../perception.mjs';

const parcel=await compileDesign({name:'Red parcel',description:'A small red parcel that can be carried, thrown and gifted.',kind:'prop',mass:.65,affordances:['display'],attributes:{portable:true,throwable:true,maxThrowSpeed:4,giftable:true},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.35,.35,.35),new THREE.MeshToonMaterial({color:0xd45659})));return g;'});
const orange=await compileDesign({name:'Travel orange',description:'One finite edible orange.',kind:'prop',mass:.15,affordances:['display'],attributes:{edible:true,servings:1},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),new THREE.MeshToonMaterial({color:0xf2a63b})));return g;'});orange.material='food';
const ticks=(g,n)=>{for(let i=0;i<n;i++)g.step();};
const poll=async b=>{b.nextCall=0;await b.poll();};
function providers(){return {laya:{ready:true},generator:{ready:true},healthTime:Date.now(),calls:{},decide:async(_s,_q,choices)=>({response:{choice:choices.done?'done':'a0'}}),actionPlan:async()=>assert.fail('A clear scripted narrative must not need replanning'),verifyStep:async(b,{completion})=>{assert.ok(b.logs.some(l=>l.id===completion.recordId&&l.type==='action_outcome'&&l.status==='completed'));return {value:{complete:true,explanation:'The supplied engine completion records this step.'}};}};}
function begin(g,steps,text){g.assign('actor',text);const b=g.selected;b.planSteps=structuredClone(steps);b.planIndex=0;b.stage='action_decide';assert.equal(validatePlanTargets(g,steps),true);return b;}
async function verify(b){const index=b.planIndex;assert.equal(b.stage,'awaiting_step_done',b.error);await poll(b);assert.equal(b.stage,'verify_step');assert.equal(b.planIndex,index);await poll(b);assert.equal(b.planIndex,index+1);assert.equal(b.stepResults[index].status,'verified');}
async function completeNext(g){const b=g.selected,index=b.planIndex;
  for(let attempt=0;attempt<3;attempt++){assert.equal(b.stage,'action_decide',b.error);await poll(b);for(let tick=0;tick<1800&&['acting','interacting'].includes(b.stage);tick++)g.step();if(b.stage==='awaiting_step_done')break;assert.equal(b.stage,'action_decide',b.error);assert.equal(b.planIndex,index);}
  assert.equal(b.stage,'awaiting_step_done',b.error);const evidence=structuredClone(b.pendingStepEvidence);await verify(b);return evidence;
}

test('one existing prop can be picked up, carried, thrown, recovered and placed through verified physical jobs',async()=>{
  const g=new Garden({providers:providers(),seedFood:false});try{const e=g.physics.add(parcel,{x:-.3,y:.25,z:4});g.designs[e.id]=e.design;ticks(g,60);const steps=[{action:'pick_up',target:e.id,label:'Pick up the red parcel'},{action:'move',x:1,z:4,label:'Carry the parcel to (1,4)'},{action:'throw',target:e.id,x:4,z:4,speed:4,label:'Throw the parcel toward (4,4)'},{action:'approach',target:e.id,label:'Approach the landed parcel'},{action:'pick_up',target:e.id,label:'Recover the same parcel'},{action:'place',target:e.id,x:0,z:6,label:'Place the parcel at (0,6)'}],b=begin(g,steps,'Pick up the red parcel, carry it to (1,4), throw it toward (4,4), recover it and place it at (0,6).'),needs={...b.needs};
    assert.equal(g.brains.size,1);assert.equal(objectInfo(g,e.id).attributes.giftable,true);await completeNext(g);assert.equal(e.carrier,'actor');const picked={...g.physics.position(e)};
    await completeNext(g);assert.equal(e.carrier,'actor');assert.ok(Math.hypot(g.physics.position(e).x-picked.x,g.physics.position(e).z-picked.z)>1);assert.ok(Math.hypot(b.actor.body.translation().x-1,b.actor.body.translation().z-4)<.18);
    const thrown=await completeNext(g),launch=thrown.job.effectResult;assert.equal(e.carrier,null);assert.equal(e.carried,false);assert.equal(launch.id,e.id);assert.ok(Math.abs(Math.hypot(...Object.values(launch.velocity))-4)<.001);assert.ok(launch.speed<=objectInfo(g,e.id).attributes.maxThrowSpeed);assert.ok(g.physics.position(e).x>launch.position.x+.8);
    ticks(g,90);const landed={...g.physics.position(e)};await completeNext(g);assert.ok(Math.hypot(b.actor.body.translation().x-landed.x,b.actor.body.translation().z-landed.z)<2.7);await completeNext(g);assert.equal(e.carrier,'actor');assert.throws(()=>validateAction(g,b,{action:'give',target:e.id,recipient:'imaginary-friend'}),/existing character/);
    await completeNext(g);ticks(g,60);assert.equal(b.stage,'complete');assert.equal(b.planIndex,steps.length);assert.equal(e.carried,false);assert.equal(e.carrier,null);assert.ok(Math.hypot(g.physics.position(e).x,g.physics.position(e).z-6)<.03);assert.ok(g.physics.position(e).y<.25);assert.equal(g.physics.entities.size,2);
    const outcomes=b.logs.filter(l=>l.type==='action_outcome'&&l.status==='completed');assert.deepEqual(outcomes.map(l=>l.action),steps.map(s=>s.action));assert.ok(outcomes.every(l=>l.needFulfillment===null));assert.ok(b.needs.hunger>needs.hunger);assert.ok(b.needs.energy<needs.energy);assert.ok(b.needs.social<needs.social);assert.equal(b.logs.filter(l=>l.type==='creation').length,0);
  }finally{g.physics.dispose();}
});

test('an anchored heavy bench cannot be eaten, lifted or thrown and rejected attempts change no physical facts',()=>{
  const g=new Garden({providers:providers(),seedFood:false,furnished:true});try{const b=g.selected,e=g.physics.entities.get('park-bench'),before={position:{...g.physics.position(e)},needs:{...b.needs},count:g.physics.entities.size};
    for(const [action,expected]of [[{action:'eat',target:e.id},/not edible/],[{action:'pick_up',target:e.id},/36kg|anchored|lifting limit/],[{action:'throw',target:e.id,x:4,z:-5,speed:2},/36kg|anchored|lifting limit/]]){assert.throws(()=>b.startAction(action),expected);assert.equal(b.job,null);}
    assert.deepEqual({...g.physics.position(e)},before.position);assert.deepEqual(b.needs,before.needs);assert.equal(g.physics.entities.size,before.count);assert.equal(e.carried,false);assert.ok(!b.logs.some(l=>l.type==='action_outcome'&&l.status==='completed'));assert.equal(g.brains.size,1);
  }finally{g.physics.dispose();}
});

test('a throw cannot use a stale grip after the same character has released the object',async()=>{
  const g=new Garden({providers:providers(),seedFood:false});try{const e=g.physics.add(parcel,{x:-.3,y:.25,z:4});g.designs[e.id]=e.design;ticks(g,60);const b=begin(g,[{action:'pick_up',target:e.id,label:'Pick up parcel'},{action:'throw',target:e.id,x:4,z:4,speed:4,label:'Throw parcel'}],'Pick up and throw the parcel.');await completeNext(g);await poll(b);assert.equal(b.job.action,'throw');ticks(g,20);assert.equal(e.carrier,'actor');g.physics.release(e.id);ticks(g,25);
    assert.equal(b.stage,'failed');assert.equal(b.planIndex,1);assert.equal(e.carrier,null);assert.equal(g.physics.entities.has(e.id),true);assert.equal(b.pendingStepEvidence,null);const outcome=b.logs.findLast(l=>l.type==='action_outcome');assert.equal(outcome.status,'failed');assert.equal(outcome.action,'throw');assert.match(outcome.outcome,/Nothing is held/);assert.equal(b.logs.filter(l=>l.type==='step_verification'&&l.status==='verified').length,1);
  }finally{g.physics.dispose();}
});

test('a saved held $step1 object is consumed once after restore and historical references never resurrect it',async()=>{
  const g=new Garden({providers:providers(),seedFood:false}),restored=new Garden({providers:providers(),seedFood:false}),again=new Garden({providers:providers(),seedFood:false});
  try{const b=begin(g,[{action:'print',label:'Print one edible orange'},{action:'pick_up',target:'$step1',label:'Pick up the printed orange'},{action:'eat',target:'$step1',label:'Eat the held orange'}],'Print one edible orange, pick it up, then eat it.');b.needs.hunger=80;b.startAction(b.planSteps[0]);b.pendingDesign=structuredClone(orange);b.stage='printing';b.stageUntil=b.time;g.step();const id=b.pendingStepEvidence.job.createdEntityId;await verify(b);await completeNext(g);const verified=structuredClone(b.stepResults);assert.equal(g.physics.entities.get(id).carrier,'actor');
    restored.restore(g.save());const next=restored.selected;assert.deepEqual(next.stepResults,verified);assert.equal(next.planIndex,2);assert.equal(restored.physics.entities.get(id).carrier,'actor');assert.equal(resolveActionReferences(restored,next,next.planSteps[2]).target,id);
    const evidence=await completeNext(restored);assert.equal(evidence.job.target,id);assert.equal(evidence.job.targetReference,'$step1');assert.equal(evidence.job.consumedServings,1);assert.equal(evidence.job.needFulfillment.before.hunger-evidence.job.needFulfillment.after.hunger,28);assert.equal(restored.physics.entities.has(id),false);assert.equal(next.stage,'complete');assert.equal(next.logs.filter(l=>l.type==='creation').length,1);
    again.restore(restored.save());assert.equal(again.physics.entities.has(id),false);assert.equal(again.designs[id],undefined);assert.equal(again.selected.planIndex,3);assert.equal(again.selected.stepResults[0].entityId,id);assert.throws(()=>resolveActionReferences(again,again.selected,{action:'eat',target:'$step1'}),/no longer available/);assert.equal(again.physics.entities.size,1);
  }finally{g.physics.dispose();restored.physics.dispose();again.physics.dispose();}
});
