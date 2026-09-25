import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {criticalNeedPlan} from '../autonomy.mjs';

const cabinet=await compileDesign({name:'Garden cabinet',description:'A solid anchored garden cabinet.',kind:'prop',mass:40,affordances:['display'],attributes:{anchored:true},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,.9,1.2),new THREE.MeshToonMaterial({color:0x98a377})));return g;'});
const provider=(overrides={})=>({generator:{ready:true},laya:{ready:true},healthTime:Date.now(),calls:{},decide:async(_s,_q,choices)=>({response:{choice:choices.done?'done':'a0'}}),verifyStep:async()=>({value:{complete:true,explanation:'The engine action completed.'}}),...overrides});
const ticks=(g,n)=>{for(let i=0;i<n;i++)g.step();};
const poll=async b=>{b.nextCall=0;await b.poll();};

test('a physically blocked route replans the remaining suffix without replaying a verified step',async()=>{
  let facts,target;const g=new Garden({seedFood:false,providers:provider({actionPlan:async(_b,f)=>{facts=f;return {value:{supported:true,steps:[{action:'approach',target,label:'Approach the cabinet'},{action:'inspect',target,label:'Inspect the cabinet'}]}};}})});
  try{const b=g.selected,e=g.physics.add(cabinet,{x:6,y:.47,z:4});target=e.id;g.designs[e.id]=e.design;g.assign('actor','Rest briefly, then inspect the Garden cabinet.');b.planSteps=[{action:'rest',seconds:2,label:'Rest briefly'},{action:'move',x:3,z:4,label:'Walk toward the cabinet'},{action:'inspect',target,label:'Inspect cabinet'}];b.startAction(b.planSteps[0]);ticks(g,125);await poll(b);await poll(b);assert.equal(b.planIndex,1);const prefix=structuredClone(b.planSteps[0]),verified=structuredClone(b.stepResults);
    b.startAction(b.planSteps[1]);e.body.setTranslation({x:3,y:.47,z:4},true);for(let i=0;i<900&&b.stage==='acting';i++)g.step();
    assert.equal(b.stage,'action_plan',b.error);assert.equal(b.navigationRecoveries,1);assert.equal(b.planIndex,1);assert.deepEqual(b.stepResults,verified);assert.equal(b.pendingStepEvidence,null);assert.equal(b.job,null);assert.equal(b.actor.goal,null);const failure=b.logs.findLast(l=>l.type==='action_outcome');assert.equal(failure.status,'failed');assert.equal(failure.action,'move');assert.match(failure.outcome,/Route blocked/);assert.equal(b.navigationFailure.blocker.id,e.id);assert.match(b.planError,/Garden cabinet.*approach.*solid center/);
    assert.equal(failure.navigation.status,'blocked');assert.match(failure.navigation.reason,/occupied/);assert.deepEqual(failure.navigation.goal,{x:3,z:4});assert.deepEqual(b.navigationFailure.route,failure.navigation);
    await poll(b);assert.equal(b.stage,'action_decide');assert.equal(b.planIndex,1);assert.deepEqual(b.planSteps[0],prefix);assert.deepEqual(b.stepResults,verified);assert.deepEqual(facts.planning.verifiedPrefix,[prefix]);assert.equal(facts.planning.navigationFailure.recordId,failure.id);assert.equal(facts.objects.find(o=>o.id===target).position.x,3);assert.equal(b.planSteps[1].action,'approach');assert.equal(b.logs.filter(l=>l.type==='action_outcome'&&l.action==='rest').length,1);
  }finally{g.physics.dispose();}
});

test('movement recovery permits two replans per goal, persists its budget, and resets for a new objective',async()=>{
  const step={action:'move',x:3,z:4,label:'Walk to (3,4)'},p=provider({actionPlan:async()=>({value:{supported:true,steps:[step]}})}),g=new Garden({providers:p,seedFood:false}),restored=new Garden({providers:p,seedFood:false});
  try{let b=g.selected;g.assign('actor','Walk to (3,4).');b.planSteps=[step];b.startAction(step);b.actionDone(false,'Route obstructed during travel');assert.equal(b.stage,'action_plan');restored.restore(g.save());b=restored.selected;assert.equal(b.navigationRecoveries,1);assert.match(b.planError,/Navigation recovery 1\/2/);
    await poll(b);b.startAction(step);b.actionDone(false,'Route remained obstructed');assert.equal(b.stage,'action_plan');assert.equal(b.navigationRecoveries,2);await poll(b);b.startAction(step);b.actionDone(false,'Route still obstructed');assert.equal(b.stage,'failed');assert.equal(b.navigationRecoveries,2);assert.equal(b.planIndex,0);assert.equal(b.pendingStepEvidence,null);assert.equal(b.logs.filter(l=>l.type==='navigation_recovery').length,2);assert.equal(b.logs.filter(l=>l.type==='action_outcome'&&l.status==='failed').length,3);
    b.assign('Observe here.');assert.equal(b.navigationRecoveries,0);assert.equal(b.navigationFailure,null);b.planSteps=[{action:'dance',seconds:2,label:'Dance'}];b.startAction(b.planSteps[0]);b.actionDone(false,'Gesture failed');assert.equal(b.stage,'failed');assert.equal(b.navigationRecoveries,0);
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('a destination occupied between selection and commit records an unstarted failure and requests recovery',async()=>{
  let blocked=false;const g=new Garden({seedFood:false,providers:provider({decide:async()=>{if(!blocked){g.physics.add(cabinet,{x:3,y:.47,z:4});blocked=true;}return {response:{choice:'a0'}};}})});
  try{const b=g.selected;g.assign('actor','Walk to (3,4).');b.planSteps=[{action:'move',x:3,z:4,label:'Walk to (3,4)'}];b.stage='action_decide';const before={...b.actor.body.translation()};await poll(b);
    assert.equal(b.stage,'action_plan');assert.equal(b.navigationRecoveries,1);assert.equal(b.job,null);assert.deepEqual({...b.actor.body.translation()},before);const record=b.logs.findLast(l=>l.type==='action_outcome');assert.equal(record.status,'failed');assert.equal(record.executionStarted,false);assert.match(record.outcome,/Not executed: Walking destination is occupied/);assert.equal(b.planIndex,0);
  }finally{g.physics.dispose();}
});

test('an exhausted critical-need navigation detour resumes the deferred goal and its original budget',async()=>{
  const p=provider({actionPlan:async(_b,f)=>({value:{supported:true,steps:structuredClone(f.planning.engineProposal.steps)}})}),g=new Garden({providers:p,seedFood:false,furnished:true});
  try{const b=g.selected;g.assign('actor','Walk to (2,3).');const original=[{action:'move',x:2,z:3,label:'Walk to (2,3)'}];b.planSteps=original;b.stage='action_decide';b.navigationRecoveries=1;b.needs.energy=5;await poll(b);assert.equal(b.goalSource,'need interruption');assert.equal(b.navigationRecoveries,0);
    for(let attempt=0;attempt<3;attempt++){b.startAction(b.planSteps[0]);assert.equal(b.job.action,'approach');b.actionDone(false,'The bed approach is blocked');if(attempt<2){assert.equal(b.stage,'action_plan');await poll(b);}}
    assert.equal(b.stage,'failed');assert.equal(b.navigationRecoveries,2);g.step();assert.equal(b.goalSource,'user');assert.equal(b.stage,'action_decide');assert.deepEqual(b.planSteps,original);assert.equal(b.navigationRecoveries,1);assert.equal(b.suspendedGoal,null);assert.equal(criticalNeedPlan(b),null);assert.ok(b.needs.energy<5);
  }finally{g.physics.dispose();}
});

test('Garden approaches a bed at a capsule-clear point and reaches it without entering the bed',()=>{
  const g=new Garden({seedFood:false,furnished:true});g.mode='manual';try{const b=g.selected,p={x:2,y:1.2,z:-3.5};b.actor.body.setTranslation(p,true);b.actor.body.setNextKinematicTranslation(p);b.actor.rig.resetAt(p);ticks(g,30);g.assign('actor','Rest on Garden daybed.');b.planSteps=[{action:'approach',target:'home-bed',label:'Approach bed'},{action:'use',target:'home-bed',use:'rest',label:'Rest on bed'}];const before={...b.actor.body.translation()};b.startAction(b.planSteps[0]);const destination={...b.actor.goal};
    assert.equal(g.physics.groundMoveDestination(destination).clear,true);assert.deepEqual({...b.actor.body.translation()},before);for(let i=0;i<900&&b.stage==='acting';i++)g.step();assert.equal(b.stage,'awaiting_step_done',b.error);assert.equal(b.navigationRecoveries,0);assert.ok(Math.hypot(b.actor.body.translation().x-destination.x,b.actor.body.translation().z-destination.z)<.18);assert.ok(b.actor.travel>6);
  }finally{g.physics.dispose();}
});
