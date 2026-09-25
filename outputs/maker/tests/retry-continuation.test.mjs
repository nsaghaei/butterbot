import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {resolveActionReferences} from '../actions.mjs';
import {PRINTER} from '../environment-layout.mjs';

const orange=await compileDesign({name:'Retry orange',description:'One small edible orange.',kind:'prop',mass:.15,attributes:{edible:true,servings:1},affordances:['display'],code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),new THREE.MeshToonMaterial({color:0xff9933})));return g;'});orange.material='food';
const steps=[{action:'print',label:'Print an edible orange'},{action:'pick_up',target:'$step1',label:'Pick up the orange'},{action:'give',target:'$step1',recipient:'pip',label:'Give the orange to Pip'}];
const objective='Print an edible orange, pick up the orange, and give it to Pip.';
const ticks=(g,n)=>{for(let i=0;i<n;i++)g.step();};
const poll=async b=>{b.nextCall=0;await b.poll();};
async function verify(b){assert.equal(b.stage,'awaiting_step_done');await poll(b);assert.equal(b.stage,'verify_step');await poll(b);}
function providers(){
  const p={provider:'offline fixture',healthTime:Date.now(),generator:{ready:true},laya:{ready:true},calls:{},planning:[],failDecision:false,
    decide:async(_state,_question,choices)=>{if(p.failDecision){p.failDecision=false;throw Error('The pickup context exceeded the local decision budget');}return {response:{choice:choices.done?'done':choices.a0?'a0':Object.keys(choices)[0]}};},
    verifyStep:async()=>({value:{complete:true,explanation:'The actual engine action and object exist.'}}),
    actionPlan:async(_brain,facts)=>{p.planning.push(structuredClone(facts));return {value:{supported:true,steps:structuredClone(steps.slice(facts.planning.verifiedPrefix.length))}};}
  };return p;
}
async function printedFixture(){
  const p=providers(),g=new Garden({providers:p,cast:'duo',seedFood:false}),b=g.selected;
  g.assign(b.actorId,objective);b.planSteps=structuredClone(steps);b.planIndex=0;b.stage='action_decide';
  const position={...PRINTER.approach,y:1.2};b.actor.body.setTranslation(position,true);b.actor.body.setNextKinematicTranslation(position);b.actor.rig.resetAt(position);ticks(g,30);
  b.startAction(b.planSteps[0]);b.pendingDesign=structuredClone(orange);b.stage='printing';b.stageUntil=b.time;g.step();const id=b.pendingStepEvidence.job.createdEntityId;
  await verify(b);assert.equal(b.planIndex,1);p.failDecision=true;await poll(b);assert.equal(b.stage,'failed');
  return {g,b,p,id};
}

test('retry after verified printing and failed pickup preserves original proof and reuses the same orange',async()=>{
  const {g,b,p,id}=await printedFixture();try{
    const cycle=b.cycle,revision=b.revision,result=structuredClone(b.stepResults[0]),entityCount=g.physics.entities.size,proofCount=b.logs.filter(record=>record.type==='step_verification').length;
    const retry=g.resume(b.actorId);assert.deepEqual(retry,{continued:true,verifiedSteps:1});assert.equal(b.cycle,cycle);assert.ok(b.cycleSerial>cycle);assert.ok(b.revision>revision);assert.equal(b.stage,'action_plan');assert.equal(b.job,null);assert.equal(b.planIndex,1);assert.deepEqual(b.stepResults[0],result);
    assert.equal(b.logs.filter(record=>record.type==='step_verification').length,proofCount);assert.equal(g.physics.entities.size,entityCount);assert.equal(resolveActionReferences(g,b,b.planSteps[1]).target,id);
    await poll(b);assert.equal(b.stage,'action_decide',b.error);assert.deepEqual(p.planning[0].planning.verifiedPrefix,[steps[0]]);assert.equal(p.planning[0].planning.nextStepNumber,2);assert.equal(b.planSteps.filter(step=>step.action==='print').length,1);
    await poll(b);assert.equal(b.job.action,'pick_up');assert.equal(b.job.target,id);ticks(g,70);assert.equal(b.stage,'awaiting_step_done');assert.equal(g.physics.entities.get(id).carrier,b.actorId);
    assert.equal(b.logs.filter(record=>record.type==='creation').length,1);assert.equal(g.physics.entities.size,entityCount);
  }finally{g.physics.dispose();}
});

test('original retry evidence survives autonomous goals, log eviction, save/restore, and later cycle allocation',async()=>{
  const {g,b,id}=await printedFixture();let restored,again;try{
    b.captureUserResult();const originalCycle=b.cycle,originalResult=structuredClone(b.stepResults[0]);assert.equal(b.lastUserGoal.continuation.records.length,3);
    b.stage='goal_select';await b.chooseGoal();assert.equal(b.goalSource,'self');assert.equal(b.selfGoalProposal.text,b.objective);const autonomousCycle=b.cycle;
    for(let i=0;i<190;i++)b.log('observation',{status:'observed',outcome:'Independent observation '+i});b.history=[];
    assert.ok(!b.logs.some(record=>record.cycle===originalCycle));
    restored=new Garden({providers:providers(),cast:'duo',seedFood:false});restored.restore(JSON.parse(JSON.stringify(g.save())));const next=restored.selected;
    assert.equal(restored.resume(next.actorId).continued,true);assert.equal(next.cycle,originalCycle);assert.ok(next.cycleSerial>autonomousCycle);assert.deepEqual(next.stepResults[0],originalResult);assert.equal(resolveActionReferences(restored,next,next.planSteps[1]).target,id);
    const highWater=next.cycleSerial;again=new Garden({providers:providers(),cast:'duo',seedFood:false});again.restore(JSON.parse(JSON.stringify(restored.save())));assert.equal(again.selected.cycleSerial,highWater);
    again.assign('actor','Dance here.');assert.ok(again.selected.cycle>highWater);assert.deepEqual(again.selected.stepResults,{});assert.equal(again.selected.lastUserGoal.text,'Dance here.');
  }finally{again?.physics.dispose();restored?.physics.dispose();g.physics.dispose();}
});

test('legacy lastUserGoal without a checkpoint reconstructs only original verified print evidence',async()=>{
  const {g,b,id}=await printedFixture();let restored;try{
    b.captureUserResult();const cycle=b.cycle;b.stage='goal_select';await b.chooseGoal();assert.equal(b.goalSource,'self');
    const saved=JSON.parse(JSON.stringify(g.save())),entry=saved.brains.find(brain=>brain.id==='actor');delete entry.lastUserGoal.continuation;delete entry.lastUserGoal.stepResults;delete entry.cycleSerial;
    restored=new Garden({providers:providers(),cast:'duo',seedFood:false});restored.restore(saved);assert.equal(restored.resume('actor').verifiedSteps,1);const next=restored.selected;
    assert.equal(next.cycle,cycle);assert.equal(next.stepResults[0].entityId,id);assert.ok(next.stepResults[0].creationRecordId);assert.equal(resolveActionReferences(restored,next,next.planSteps[1]).target,id);assert.equal(next.logs.filter(record=>record.type==='step_verification'&&record.cycle===cycle).length,1);
  }finally{restored?.physics.dispose();g.physics.dispose();}
});

test('a missing printed entity stays a historical print and cannot bind to a same-named replacement',async()=>{
  const {g,b,id}=await printedFixture();try{
    g.physics.remove(id);delete g.designs[id];const replacement=g.physics.add(structuredClone(orange),{x:0,y:.3,z:4});
    assert.equal(g.resume(b.actorId).verifiedSteps,1);assert.match(b.planError,/no longer available/);assert.equal(b.stepResults[0].entityId,id);assert.equal(b.stage,'action_plan');
    assert.throws(()=>resolveActionReferences(g,b,b.planSteps[1]),/no longer available/);await poll(b);assert.equal(b.stage,'action_plan');assert.match(b.planError,/no longer available/);assert.equal(b.job,null);assert.equal(replacement.carried,false);assert.equal(b.logs.filter(record=>record.type==='creation').length,1);
  }finally{g.physics.dispose();}
});

test('retry rolls back an unsupported later prefix but retains earlier authentic print provenance',async()=>{
  const {g,b,id}=await printedFixture();try{
    b.stage='action_decide';b.startAction(b.planSteps[1]);ticks(g,70);await verify(b);assert.equal(b.planIndex,2);
    b.stepResults[1].verificationRecordId='missing-audit';b.stage='failed';b.error='Corrupted later progress';
    assert.equal(g.resume(b.actorId).verifiedSteps,1);assert.equal(b.planIndex,1);assert.deepEqual(Object.keys(b.stepResults),['0']);assert.equal(b.stepResults[0].entityId,id);assert.match(b.planError,/lacks matching verification/);assert.equal(g.physics.entities.get(id).carrier,b.actorId);
  }finally{g.physics.dispose();}
});

test('no authentic prefix uses a fresh retry and does not transplant stale-cycle results',async()=>{
  const {g,b}=await printedFixture();try{
    const cycle=b.cycle;b.stepResults[0].cycle--;assert.deepEqual(g.resume(b.actorId),{continued:false,verifiedSteps:0});assert.ok(b.cycle>cycle);assert.equal(b.stage,'action_plan');assert.equal(b.planIndex,0);assert.deepEqual(b.stepResults,{});assert.deepEqual(b.planSteps,[]);
    b.stage='failed';b.error='No plan could be generated';const next=b.cycle;assert.equal(g.resume(b.actorId).continued,false);assert.ok(b.cycle>next);
  }finally{g.physics.dispose();}
});

test('an older failed checkpoint cannot replace a newer active user request',async()=>{
  const {g,b}=await printedFixture();try{
    b.captureUserResult();const old=structuredClone(b.lastUserGoal);g.assign(b.actorId,'Observe the garden.');b.lastUserGoal=old;
    const cycle=b.cycle,revision=b.revision;assert.throws(()=>g.resume(b.actorId),/newer user request is active/);assert.equal(b.objective,'Observe the garden.');assert.equal(b.cycle,cycle);assert.equal(b.revision,revision);assert.equal(b.stage,'action_plan');
  }finally{g.physics.dispose();}
});

test('a model response from before retry is discarded even when the logical cycle is reused',async()=>{
  const {g,b,p}=await printedFixture();try{
    let finish;b.stage='action_plan';p.actionPlan=()=>new Promise(resolve=>finish=resolve);const stale=poll(b);await new Promise(resolve=>setImmediate(resolve));
    b.stage='failed';b.error='Retry requested while an old plan remained pending';const cycle=b.cycle;g.resume(b.actorId);assert.equal(b.cycle,cycle);
    finish({value:{supported:true,steps:[{action:'print',label:'Print a second orange'}]}});await stale;
    assert.equal(b.stage,'action_plan');assert.equal(b.planIndex,1);assert.deepEqual(b.planSteps,steps);assert.equal(b.logs.filter(record=>record.type==='creation').length,1);
  }finally{g.physics.dispose();}
});

test('a pre-retry autonomous Laya rejection cannot overwrite the continued user request or its cooldown',async()=>{
  const {g,b,p}=await printedFixture();try{
    b.captureUserResult();b.stage='goal_select';let reject;p.decide=()=>new Promise((_resolve,no)=>reject=no);const stale=b.chooseGoal();await new Promise(resolve=>setImmediate(resolve));
    g.resume(b.actorId);const nextCall=b.nextCall;assert.equal(b.stage,'action_plan');assert.equal(b.error,null);
    reject(Error('Old autonomous Laya request failed'));await stale;assert.equal(b.stage,'action_plan');assert.equal(b.error,null);assert.equal(b.nextCall,nextCall);assert.equal(b.busy,false);assert.equal(b.logs.findLast(record=>record.type==='laya'&&record.scope==='goal').status,'discarded');
  }finally{g.physics.dispose();}
});

test('repeated retry cannot restart or abort an active continuation or a completed request',async()=>{
  const {g,b,p}=await printedFixture();try{
    let aborts=0;p.generatorOwner=b.actorId;p.generatorAbort={abort:()=>aborts++};g.resume(b.actorId);assert.equal(aborts,1);const cycle=b.cycle,revision=b.revision,serial=b.cycleSerial;assert.throws(()=>g.resume(b.actorId),/no failed request/);assert.equal(aborts,1);assert.equal(b.cycle,cycle);assert.equal(b.revision,revision);assert.equal(b.cycleSerial,serial);
    b.stage='complete';b.captureUserResult();assert.throws(()=>g.resume(b.actorId),/no failed request/);assert.equal(b.stage,'complete');
  }finally{g.physics.dispose();}
});
