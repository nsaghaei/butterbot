import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const plan=steps=>({value:{supported:true,explanation:'Supported engine actions.',steps}});
const chat={action:'socialize',target:'pip',label:'Chat with Pip about the garden'};
const dance={action:'dance',seconds:2,label:'Dance briefly'};
function fixture(overrides={}){
  const calls=[],providers={laya:{ready:true},generator:{ready:true},healthTime:Date.now(),calls:{},
    actionPlan:async brain=>{calls.push(['plan',brain.actorId]);return plan(brain.goalSource==='need interruption'?[{action:'rest',seconds:6,label:'Rest briefly'}]:[dance]);},
    decide:async(_state,_question,choices)=>{calls.push(['decision',providers.layaOwner]);return {response:{choice:Object.hasOwn(choices,'a0')?'a0':Object.keys(choices)[0]}};},
    socialAcceptance:async brain=>{calls.push(['acceptance',brain.actorId]);return {choice:'accept'};},
    socialTurn:async brain=>{calls.push(['turn',brain.actorId]);return {value:{speech:brain.actorName+' enjoys the garden.',memory:[]}};},
    reflect:async()=>{throw Error('No reflection should be scheduled in this test');},...overrides};
  const g=new Garden({cast:'duo',seedFood:false,providers});for(const b of g.brains.values()){b.nextReflection=Infinity;b.nextCall=0;}
  return {g,a:g.selected,b:g.brains.get('pip'),providers,calls,close:()=>g.physics.dispose()};
}

test('a user chat plan reaches its invitation before the free recipient starts competing self inference',async()=>{
  const planning=deferred(),choice=deferred(),acceptance=deferred();let planCalls=0,choices=0,accepts=0;
  const f=fixture({actionPlan:async()=>{planCalls++;return planning.promise;},decide:async()=>{choices++;return choice.promise;},socialAcceptance:async()=>{accepts++;return acceptance.promise;}});let pending;
  try{
    f.g.assign('actor','Chat with Pip about the garden.');pending=f.g.poll();await flush();
    assert.equal(planCalls,1);assert.equal(choices,0);assert.equal(f.b.stage,'goal_select');assert.equal(f.b.busy,false);assert.equal(f.g.slots.gemma,true);assert.equal(f.g.slots.laya,false);
    await f.g.poll();assert.equal(planCalls,1);assert.equal(choices,0,'A second poll cannot launch the recipient while the user plan is pending');
    planning.resolve(plan([chat]));await pending;assert.equal(f.a.stage,'action_decide');f.a.nextCall=0;
    pending=f.g.poll();await flush();assert.equal(choices,1);assert.equal(f.b.stage,'goal_select');assert.equal(f.b.busy,false);await f.g.poll();assert.equal(choices,1);
    choice.resolve({response:{choice:'a0'}});await pending;const session=f.g.social.forActor('actor');assert.ok(session);assert.equal(f.g.social.forActor('pip'),session);
    pending=f.g.poll();await flush();assert.equal(accepts,1);assert.equal(choices,1);assert.equal(f.g.slots.laya,true);await f.g.poll();assert.equal(accepts,1);
    acceptance.resolve({choice:'decline'});await pending;assert.equal(f.g.social.forActor('pip'),null);assert.equal(f.g.slots.laya,false);assert.equal(f.b.busy,false);assert.equal(f.b.dispatched,false);assert.equal(f.g.inFlight.size,0);
  }finally{planning.resolve(plan([chat]));choice.resolve({response:{choice:'a0'}});acceptance.resolve({choice:'decline'});await pending;f.close();}
});

test('postponing personal inference while a user plans does not stop an existing physical walk',async()=>{
  const planning=deferred(),f=fixture({actionPlan:()=>planning.promise});let pending;
  try{
    f.b.objective='Walk to (-7,5).';f.b.goalSource='self';f.b.planSteps=[{action:'move',x:-7,z:5,label:'Walk to (-7,5)'}];f.b.startAction(f.b.planSteps[0]);const job=f.b.job,start={...f.b.actor.body.translation()},beforeNeeds={...f.b.needs};
    f.g.assign('actor','Dance briefly.');pending=f.g.poll();await flush();for(let frame=0;frame<30;frame++)f.g.step();
    const end=f.b.actor.body.translation();assert.ok(Math.hypot(end.x-start.x,end.z-start.z)>.4);assert.equal(f.b.job,job);assert.equal(f.b.stage,'acting');assert.ok(f.b.needs.energy<beforeNeeds.energy);assert.ok(f.b.needs.hunger>beforeNeeds.hunger);assert.equal(f.b.busy,false);assert.equal(f.g.slots.gemma,true);assert.equal(f.g.social.forActor('pip'),null);
    planning.resolve(plan([dance]));await pending;assert.equal(f.a.stage,'action_decide');
  }finally{planning.resolve(plan([dance]));await pending;f.close();}
});

test('late acceptance after actual user reassignment cannot start social movement or overwrite the new objective',async()=>{
  const acceptance=deferred(),f=fixture({socialAcceptance:()=>acceptance.promise});let pending;
  try{
    f.g.assign('actor','Chat with Pip.');f.a.planSteps=[chat];f.a.stage='action_decide';await f.g.poll();pending=f.g.poll();await flush();assert.equal(f.g.slots.laya,true);
    f.g.assign('pip','Dance briefly.');const revision=f.b.revision,cycle=f.b.cycle,needs=structuredClone([f.a.needs,f.b.needs]);assert.equal(f.g.social.forActor('actor'),null);
    acceptance.resolve({choice:'accept'});await pending;
    assert.equal(f.b.objective,'Dance briefly.');assert.equal(f.b.stage,'action_plan');assert.equal(f.b.revision,revision);assert.equal(f.b.cycle,cycle);assert.equal(f.b.actor.goal,null);assert.equal(f.b.memory.length,0);assert.deepEqual([f.a.needs,f.b.needs],needs);assert.equal(f.g.social.snapshot().history[0].effectsApplied,false);assert.equal(f.g.social.snapshot().history[0].transcript.length,0);
    assert.equal(f.g.slots.laya,false);assert.equal(f.g.inFlight.size,0);f.b.nextCall=0;await f.g.poll();assert.equal(f.b.stage,'action_decide');assert.deepEqual(f.b.planSteps,[dance]);
  }finally{acceptance.resolve({choice:'decline'});await pending;f.close();}
});

test('a canceled pending social turn holds its single Gemma slot until settlement and cannot publish stale speech',async()=>{
  const turn=deferred();let turnCalls=0,planCalls=0;const f=fixture({socialTurn:()=>{turnCalls++;return turn.promise;},actionPlan:async()=>{planCalls++;return plan([dance]);}});let pending;
  try{
    f.g.assign('actor','Chat with Pip.');f.a.planSteps=[chat];f.a.stage='action_decide';await f.g.poll();await f.g.poll();
    for(let frame=0;frame<900&&f.g.social.forActor('actor')?.phase==='approaching';frame++)f.g.step();assert.equal(f.g.social.forActor('actor')?.phase,'generating');
    pending=f.g.poll();await flush();assert.equal(turnCalls,1);assert.equal(f.g.slots.gemma,true);await f.g.poll();assert.equal(turnCalls,1);
    f.g.assign('pip','Dance briefly.');const needs=structuredClone([f.a.needs,f.b.needs]);await f.g.poll();assert.equal(planCalls,0,'A new user plan must wait for the occupied Gemma slot');assert.equal(f.g.slots.gemma,true);
    turn.resolve({value:{speech:'Undelivered stale sentence.',memory:[{operation:'remember',id:'',text:'This conversation finished.',kind:'experience'}]}});await pending;
    assert.equal(f.a.thought?.speech,undefined);assert.equal(f.a.memory.length,0);assert.equal(f.b.memory.length,0);assert.deepEqual([f.a.needs,f.b.needs],needs);assert.equal(f.g.social.snapshot().history[0].transcript.length,0);assert.equal(f.g.slots.gemma,false);assert.equal(f.g.inFlight.size,0);
    f.b.nextCall=0;await f.g.poll();assert.equal(planCalls,1);assert.equal(f.b.stage,'action_decide');
  }finally{turn.resolve({value:{speech:'Late hello.',memory:[]}});await pending;f.close();}
});

test('an urgent need transition is scheduled in the Gemma slot and cannot overlap another robot planning',async()=>{
  const requests=[];let active=0,maximum=0;
  const f=fixture({actionPlan:async brain=>{const d=deferred();requests.push({brain,d,owner:f.providers.generatorOwner});active++;maximum=Math.max(maximum,active);try{return await d.promise;}finally{active--;}}});let pending;
  try{
    f.g.assign('actor','Walk to (2,3).');f.a.stage='action_decide';f.a.planSteps=[{action:'move',x:2,z:3,label:'Walk to (2,3)'}];f.a.needs.energy=5;
    f.b.goalSource='self';f.b.stage='action_plan';f.b.objective='Dance briefly.';pending=f.g.poll();await flush();
    assert.equal(maximum,1,'Urgent need planning must never run inside a Laya dispatch alongside a second Gemma call');assert.equal(requests.length,1);assert.equal(requests[0].brain.actorId,'actor');assert.equal(requests[0].owner,'actor');assert.equal(f.g.slots.gemma,true);assert.equal(f.g.slots.laya,false);
  }finally{for(const {brain,d}of requests)d.resolve(plan(brain.actorId==='actor'?[{action:'rest',seconds:6,label:'Rest briefly'}]:[dance]));await pending;f.close();}
});

test('scene reset shares outstanding model slots until the old decision settles before starting a new one',async()=>{
  const requests=[];let active=0,maximum=0,disposed=false,fresh,oldPoll,newPoll;
  const f=fixture({decide:async(_state,_question,choices)=>{const d=deferred();requests.push({d,choices});active++;maximum=Math.max(maximum,active);try{return await d.promise;}finally{active--;}}});
  try{
    f.g.assign('actor','Dance briefly.');f.a.planSteps=[dance];f.a.stage='action_decide';oldPoll=f.g.poll();await flush();assert.equal(requests.length,1);assert.equal(f.g.slots.laya,true);
    // Match /api/reset: retain the provider and its occupied scheduling objects,
    // invalidate the old actors, then dispose the old physical scene.
    fresh=new Garden({seed:'reset-during-inference',providers:f.providers,cast:f.g.cast,seedFood:false,furnished:true});fresh.slots=f.g.slots;fresh.inFlight=f.g.inFlight;
    for(const b of f.g.brains.values()){f.g.social.cancelActor(b.actorId,'Scene reset');b.revision++;}f.g.physics.dispose();disposed=true;
    assert.equal(fresh.slots,f.g.slots);assert.equal(fresh.inFlight,f.g.inFlight);await fresh.poll();assert.equal(requests.length,1,'The fresh scene cannot start a second Laya request during reset');assert.equal(active,1);
    requests[0].d.resolve({response:{choice:'a0'}});await oldPoll;assert.equal(f.a.logs.findLast(l=>l.type==='laya').status,'discarded');assert.equal(fresh.slots.laya,false);assert.equal(fresh.inFlight.size,0);assert.equal(fresh.selected.job,null);assert.equal(fresh.selected.memory.length,0);
    newPoll=fresh.poll();await flush();assert.equal(requests.length,2);assert.equal(maximum,1);assert.equal(fresh.slots.laya,true);
    requests[1].d.resolve({response:{choice:Object.keys(requests[1].choices)[0]}});await newPoll;assert.equal(fresh.selected.stage,'action_plan');assert.equal(fresh.slots.laya,false);assert.equal(fresh.inFlight.size,0);
  }finally{for(const {d,choices}of requests)d.resolve({response:{choice:Object.keys(choices)[0]}});await Promise.allSettled([oldPoll,newPoll]);if(!disposed)f.close();fresh?.physics.dispose();}
});

test('a legacy save with an orphan social job replans without restoring a speech pose or granting needs',()=>{
  const f=fixture(),fresh=new Garden({cast:'duo',seedFood:false,providers:f.providers});
  try{
    f.g.assign('actor','Chat with Pip.');f.a.planSteps=[chat];f.a.startAction(chat);f.a.actor.goal={x:4,z:4};f.a.actor.activity='speak';f.a.actor.speaking=true;
    const saved=f.g.save(),needs=structuredClone(saved.brains.map(b=>b.needs));saved.social.active=[];
    fresh.restore(saved);const b=fresh.selected;
    assert.equal(fresh.social.forActor('actor'),null);assert.equal(b.objective,'Chat with Pip.');assert.equal(b.stage,'action_plan');assert.equal(b.job,null);assert.equal(b.pendingStepEvidence,null);assert.equal(b.actor.goal,null);assert.equal(b.actor.activity,null);assert.equal(b.actor.speaking,false);assert.match(b.planError,/Conversation interrupted by reload/);
    assert.deepEqual([...fresh.brains.values()].map(brain=>brain.needs),needs);assert.ok(!b.logs.some(l=>l.type==='action_outcome'&&l.action==='socialize'&&l.status==='completed'));assert.deepEqual(b.planSteps,[chat]);
  }finally{f.close();fresh.physics.dispose();}
});

test('orphan repair preserves a physically completed conversation awaiting its independent verification',async()=>{
  const f=fixture(),fresh=new Garden({cast:'duo',seedFood:false,providers:f.providers});
  try{
    f.g.assign('actor','Chat with Pip.');f.a.planSteps=[chat];f.a.stage='action_decide';await f.g.poll();await f.g.poll();
    for(let frame=0;frame<1200&&f.a.stage!=='awaiting_step_done';frame++){f.g.step();if(f.a.stage==='awaiting_step_done')break;if(f.g.social.forActor('actor')?.phase==='generating')await f.g.poll();}
    assert.equal(f.a.stage,'awaiting_step_done');assert.equal(f.a.job,null);assert.equal(f.a.pendingStepEvidence.job.socialEvidence.status,'completed');assert.equal(f.a.pendingStepEvidence.job.socialEvidence.transcript.length,2);
    const saved=f.g.save(),proof=structuredClone(f.a.pendingStepEvidence),needs=structuredClone(saved.brains.map(b=>b.needs));fresh.restore(saved);
    assert.equal(fresh.selected.stage,'awaiting_step_done');assert.deepEqual(fresh.selected.pendingStepEvidence,proof);assert.equal(fresh.selected.hasStepEvidence(),true);assert.equal(fresh.selected.job,null);assert.equal(fresh.social.snapshot().active.length,0);
    fresh.social.tick(20);assert.deepEqual([...fresh.brains.values()].map(b=>b.needs),needs);assert.equal(fresh.social.snapshot().history[0].effectsApplied,true);assert.equal(fresh.social.snapshot().history.length,1);
  }finally{f.close();fresh.physics.dispose();}
});
