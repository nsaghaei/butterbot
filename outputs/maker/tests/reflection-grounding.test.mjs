import test from 'node:test';
import assert from 'node:assert/strict';
import {Providers} from '../providers.mjs';

const parse=(prompt,label)=>JSON.parse(prompt.split('\n').find(line=>line.startsWith(label+': ')).slice(label.length+2));
const capture=()=>{const provider=new Providers();let request;provider.generate=async(system,prompt)=>{request={system,prompt};return {value:{thought:'The tulip found a new home.',speech:'',memory:[],proposedActions:[]}};};return {provider,request:()=>request};};
const giftFixture=()=>{
  const step={action:'give',target:'item-1',recipient:'pip',label:'Give Orange Tulip to Pip'},outcome='Gave Orange Tulip to Pip after consent and a physical handoff';
  const giftEvidence={sessionId:'gift-182',kind:'gift',objectId:'item-1',giverId:'actor',recipientId:'pip',participants:['actor','pip'],accepted:true,transferred:true,transferCount:1,transferredAt:4968.2,before:{owner:'actor',carrier:'actor',carried:true},after:{owner:'pip',carrier:'pip',carried:true},distanceAtTransfer:1.2,gesture:{duration:1.4,elapsed:1.4,completed:true},status:'completed'};
  const completion={recordId:'outcome-182',stepIndex:0,step,outcome,job:{...step,giftEvidence}};
  const world={actorId:'actor',actorName:'Butterbot',style:'gently theatrical',objective:'Give the Orange Tulip to Pip after Pip finishes the current activity.',goalSource:'user',cycle:182,time:4973.54,stage:'complete',planSteps:[step],planIndex:1,pendingStepEvidence:null,
    stepResults:{0:{status:'verified',stepIndex:0,cycle:182,step,recordId:'outcome-182',verificationRecordId:'verified-182',verifiedAt:4973.45,outcome}},
    memory:[{id:'own-1',kind:'experience',text:'I once held Orange Tulip.'},{id:'own-2',kind:'belief',text:'Pip may be occupied.'}],recalledMemory:[],
    logs:[{id:'failure-181',type:'action_outcome',cycle:181,time:4959.87,status:'failed',action:'give',outcome:'The gift recipient now has occupied hands',prompt:'Private obsolete model input'},
      {id:'outcome-182',type:'action_outcome',cycle:182,time:4968.93,status:'completed',action:'give',target:'item-1',outcome,giftEvidence,objectAtCompletion:{id:'item-1',carrier:'pip',carried:true}},
      {id:'verified-182',type:'step_verification',cycle:182,time:4973.45,status:'verified',step:1,outcome:'The recorded physical handoff satisfies the requested step.',result:{complete:true,explanation:'The gift was transferred once after consent.'},evidence:{completion},prompt:'Verbose private verification request'}]};
  const facts={stage:'complete',blocker:null,actor:{id:'actor',position:{x:1,y:1.2,z:2},inventory:[],needs:{energy:60}},characters:[{id:'pip',name:'Pip',position:{x:2,y:1.2,z:2},held:['item-1'],socialReady:true,giftReady:false}],objects:[{id:'item-1',name:'Orange Tulip',position:{x:2,y:1,z:2},owner:'pip',heldBy:'pip',description:'A decorative orange flower.'}],
    lastInspection:{id:'item-1',name:'Orange Tulip',description:'A decorative orange flower.',observedAt:3790.83,position:{x:2.29,y:.24,z:2.49},owner:'actor',heldBy:null},lastObservation:{observedAt:3920.08,objects:[],held:[]},recentOutcomes:[world.logs[0].outcome,outcome]};
  return {world,facts,step,outcome};
};

test('completed gift reflection separates verified current progress from old failure and inspection ownership',async()=>{
  const {world,facts,step,outcome}=giftFixture(),before=structuredClone({world,facts}),mock=capture();
  const result=await mock.provider.reflect(world,facts,'An action completed'),{prompt}=mock.request();
  const current=parse(prompt,'Current goal and recorded progress'),truth=parse(prompt,'Authoritative engine facts (generated memories excluded)'),history=parse(prompt,'Historical evidence (not current state)');
  assert.ok(prompt.startsWith('Current goal and recorded progress: '));assert.equal(current.goal,world.objective);assert.equal(current.cycle,182);assert.equal(current.capturedAt,4973.54);assert.equal(current.stage,'complete');assert.deepEqual(current.plan,[step]);assert.equal(current.currentStepNumber,null);
  assert.deepEqual(current.verifiedSteps,[{stepNumber:1,status:'verified',cycle:182,recordId:'outcome-182',verificationRecordId:'verified-182',verifiedAt:4973.45,outcome}]);
  assert.deepEqual(current.recentEvents.map(e=>[e.id,e.status,e.time]),[['outcome-182','completed',4968.93],['verified-182','verified',4973.45]]);
  const gift=current.recentEvents[0].giftEvidence;assert.equal(gift.status,'completed');assert.equal(gift.transferCount,1);assert.equal(gift.after.carrier,'pip');assert.equal(gift.gesture.completed,true);
  assert.equal(current.recentEvents[1].completion.recordId,'outcome-182');assert.deepEqual(current.recentEvents[1].completion.step,step);
  assert.equal(truth.objects[0].owner,'pip');assert.equal(truth.objects[0].heldBy,'pip');assert.deepEqual(truth.actor.inventory,[]);assert.deepEqual(truth.characters[0].held,['item-1']);assert.equal(truth.blocker,null);
  for(const key of ['lastObservation','lastInspection','recentOutcomes'])assert.equal(key in truth,false);
  assert.deepEqual(history.priorCycleEvents.map(e=>[e.id,e.cycle,e.status,e.time]),[['failure-181',181,'failed',4959.87]]);
  const inspection=history.observations.find(o=>o.kind==='lastInspection');assert.equal(inspection.observedAt,3790.83);assert.ok(Math.abs(inspection.ageSeconds-1182.71)<1e-6);assert.equal(inspection.data.owner,'actor');assert.equal(inspection.data.heldBy,null);assert.deepEqual(history.unattributedOutcomes,[]);
  assert.match(prompt,/Current positions, inventory, owner and heldBy override historical inspections/);assert.match(prompt,/Prior-cycle failures are history, not current blockers/);assert.match(prompt,/unfinished plan steps, never an obsolete failure or old ownership/);
  assert.deepEqual(parse(prompt,'Complete editable memory store'),world.memory);assert.doesNotMatch(prompt,/Private obsolete model input|Verbose private verification request/);assert.deepEqual({world,facts},before);
  assert.equal(result.value.thought,'The tulip found a new home.','provider passes model speech through without deterministic narration rewrites');
});

test('engine completion awaiting verification remains distinct from verified step and whole-goal completion',async()=>{
  const {world,facts,step,outcome}=giftFixture(),mock=capture();
  world.stage=facts.stage='awaiting_step_done';world.planIndex=0;world.planSteps.push({action:'observe',label:'Observe afterward'});world.stepResults={};world.logs.pop();world.pendingStepEvidence={recordId:'outcome-182',stepIndex:0,step,outcome};
  await mock.provider.reflect(world,facts,'An action completed');const current=parse(mock.request().prompt,'Current goal and recorded progress');
  assert.equal(current.stage,'awaiting_step_done');assert.equal(current.currentStepNumber,1);assert.equal(current.plan.length,2);assert.deepEqual(current.verifiedSteps,[]);assert.equal(current.pendingStepCompletion.recordId,'outcome-182');assert.equal(current.recentEvents[0].status,'completed');
  assert.match(mock.request().prompt,/completed engine action with pendingStepCompletion still awaits independent step verification/);
});

test('identical steps from an earlier cycle do not establish current verification, while legacy linked records do',async()=>{
  const {world,facts}=giftFixture(),mock=capture();world.cycle=183;world.stage=facts.stage='action_decide';world.planIndex=0;
  await mock.provider.reflect(world,facts,'Review goal');let current=parse(mock.request().prompt,'Current goal and recorded progress');
  assert.deepEqual(current.verifiedSteps,[]);assert.deepEqual(current.recentEvents,[]);assert.equal(current.currentStepNumber,1);
  world.cycle=182;world.stage=facts.stage='complete';world.planIndex=1;world.stepResults={};
  await mock.provider.reflect(world,facts,'Review completed goal');current=parse(mock.request().prompt,'Current goal and recorded progress');
  assert.equal(current.verifiedSteps.length,1);assert.equal(current.verifiedSteps[0].verificationRecordId,'verified-182');assert.equal(current.verifiedSteps[0].recordId,'outcome-182');
});

test('current failure retains the actual blocker and timed failed evidence without turning old memories into proof',async()=>{
  const {world,facts}=giftFixture(),mock=capture();world.cycle=181;world.stage=facts.stage='failed';world.planIndex=0;world.stepResults={};world.logs=world.logs.slice(0,1);facts.blocker=world.logs[0].outcome;
  await mock.provider.reflect(world,facts,'An action failed');const {prompt}=mock.request(),current=parse(prompt,'Current goal and recorded progress'),truth=parse(prompt,'Authoritative engine facts (generated memories excluded)');
  assert.equal(current.stage,'failed');assert.equal(current.recentEvents[0].status,'failed');assert.equal(current.recentEvents[0].time,4959.87);assert.equal(truth.blocker,'The gift recipient now has occupied hands');assert.deepEqual(current.verifiedSteps,[]);
  assert.equal(parse(prompt,'Complete editable memory store')[1].kind,'belief');assert.match(prompt,/Do not turn a preference or belief into a verified fact/);
});
