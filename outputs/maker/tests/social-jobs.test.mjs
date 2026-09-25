import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {SocialSessions} from '../social-jobs.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture(overrides={}){
  const calls={acceptance:[],turns:[]},providers={
    async socialAcceptance(brain,inviter,session){calls.acceptance.push({id:brain.actorId,inviter,session});return {choice:'accept'};},
    async socialTurn(brain,context){calls.turns.push({id:brain.actorId,context});return {value:{speech:brain.actorName+' says hello.',memory:[{operation:'remember',id:'',kind:'experience',text:'I greeted '+context.partner.name+' in the garden.'}]}};},...overrides
  },garden=new Garden({cast:'duo',seedFood:false,providers}),a=garden.brains.get('actor'),b=garden.brains.get('pip');
  a.needs.social=20;b.needs.social=30;a.needs.fun=40;b.needs.fun=45;
  for(let i=0;i<20;i++)garden.physics.step();
  return {garden,a,b,social:garden.social,calls,close:()=>garden.physics.dispose()};
}
function begin(f){f.a.planSteps=[{action:'socialize',target:'pip'}];f.a.planIndex=0;f.a.startAction({action:'socialize',target:'pip'},{advance:true});return f.social.forActor('actor');}
function tick(f,seconds=1/60){f.garden.time+=seconds;f.a.time+=seconds;f.b.time+=seconds;f.social.tick(seconds);}
function approach(f,limit=900){let frames=0,maxStep=0;for(;f.social.forActor('actor')?.phase==='approaching'&&frames<limit;frames++){
  const before={...f.a.actor.body.translation()};f.garden.physics.step();maxStep=Math.max(maxStep,distance(before,f.a.actor.body.translation()));tick(f);
}return {frames,maxStep};}
async function accept(f){const session=begin(f),request=f.social.nextRequest();assert.equal(request.kind,'laya');assert.equal(request.brain,f.b);await request.run();approach(f);return session;}
async function deliver(f){const request=f.social.nextRequest();assert.equal(request?.kind,'gemma');await request.run();const session=f.social.forActor('actor');assert.equal(session.phase,'speaking');tick(f,session.speech.duration);}
async function complete(f){await accept(f);await deliver(f);await deliver(f);}
function peerWalk(f){const step={action:'move',x:-2,z:1};f.b.goalSource='self';f.b.planSteps=[step];f.b.planIndex=0;f.b.startAction(step,{advance:true});return f.b.job;}

test('availability requires a real free brain, protects user work and urgent needs, and permits the dispatching initiator',()=>{
  const f=fixture();try{
    assert.equal(f.social.available(f.a,'pip'),true);assert.equal(f.social.available(f.a,'actor'),false);assert.equal(f.social.available(f.a,'missing'),false);
    const follower=f.garden.physics.character('printed-follower',{x:3,y:1.2,z:3});assert.ok(follower.controller);assert.equal(f.social.available(f.a,'printed-follower'),false);
    for(const [key,value]of [['busy',true],['dispatched',true],['job',{action:'move'}],['pendingStepEvidence',{step:0}]]){const old=f.b[key];f.b[key]=value;assert.equal(f.social.available(f.a,'pip'),false,key);f.b[key]=old;}
    f.b.goalSource='user';f.b.stage='action_plan';assert.equal(f.social.available(f.a,'pip'),false);f.b.stage='complete';assert.equal(f.social.available(f.a,'pip'),true);
    f.b.needs.energy=15;assert.equal(f.social.available(f.a,'pip'),false);f.b.needs.energy=80;f.a.needs.hunger=90;assert.equal(f.social.available(f.a,'pip'),false);f.a.needs.hunger=25;
    f.a.busy=true;f.a.dispatched=true;const s=begin(f);assert.equal(s.phase,'invited');assert.equal(f.social.forActor('pip'),s);assert.equal(f.social.available(f.b,'actor'),false);assert.throws(()=>f.social.begin(f.b,'actor'),/not available/);
  }finally{f.close();}
});

test('declining releases both participants with evidence and no movement, delivered memory, or social reward',async()=>{
  const f=fixture({socialAcceptance:async()=>({response:{choice:'decline'}})});try{
    const before=f.a.actor.body.translation(),needs=structuredClone([f.a.needs,f.b.needs]);begin(f);await f.social.nextRequest().run();
    assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.forActor('pip'),null);assert.deepEqual(f.a.actor.body.translation(),before);assert.deepEqual([f.a.needs,f.b.needs],needs);
    const record=f.social.snapshot().history[0];assert.equal(record.phase,'declined');assert.equal(record.effectsApplied,false);assert.equal(record.transcript.length,0);assert.equal(f.a.memory.length,0);assert.equal(f.b.memory.length,0);
    assert.equal(f.a.logs.filter(l=>l.type==='action_outcome'&&l.action==='socialize'&&l.status==='failed').length,1);assert.equal(f.social.cancelActor('actor'),false);
  }finally{f.close();}
});

test('two real characters walk, face each other, deliver sequential private turns, and recover needs exactly once after both turns',async()=>{
  const f=fixture();try{
    const topic='Reflect on the orange you just gave to Pip.',origin={id:'actor',name:'Butterbot'};f.a.objective=topic;
    f.a.memory=[{id:'a-secret',kind:'belief',text:'My private blue preference.',accessTick:1}];f.b.memory=[{id:'b-secret',kind:'belief',text:'My private yellow preference.',accessTick:1}];
    const start={...f.a.actor.body.translation()},s=begin(f);await f.social.nextRequest().run();assert.equal(s.phase,'approaching');assert.deepEqual({...f.a.actor.body.translation()},start);
    const walked=approach(f);assert.ok(walked.frames>1);assert.ok(walked.maxStep<.075);assert.equal(s.phase,'generating');assert.ok(distance(f.a.actor.body.translation(),f.b.actor.body.translation())>=1.6);assert.equal(f.a.actor.goal,null);
    const aPos=f.a.actor.body.translation(),bPos=f.b.actor.body.translation();assert.ok(Math.abs(f.a.actor.heading-Math.atan2(bPos.x-aPos.x,bPos.z-aPos.z))<1e-9);assert.ok(Math.abs(f.b.actor.heading-Math.atan2(aPos.x-bPos.x,aPos.z-bPos.z))<1e-9);
    const before=structuredClone([f.a.needs,f.b.needs]);tick(f,20);assert.deepEqual(s.participation,{actor:0,pip:0});assert.deepEqual([f.a.needs,f.b.needs],before);
    const first=f.social.nextRequest();await first.run();assert.equal(f.calls.turns[0].id,'actor');assert.deepEqual(f.calls.turns[0].context.transcript,[]);assert.equal(f.calls.turns[0].context.world.actor.id,'actor');assert.equal('memory'in f.calls.turns[0].context.partner,false);
    assert.equal(f.a.memory.length,1);tick(f,s.speech.duration/2);assert.equal(f.a.actor.speaking,true);assert.equal(f.a.thought.duration,s.speech.duration);assert.equal(f.a.thought.sessionId,s.id);assert.equal(f.b.actor.speaking,false);assert.equal(f.b.actor.activity,'listen');assert.equal(f.a.memory.length,1);assert.equal(s.transcript.length,0);assert.deepEqual([f.a.needs,f.b.needs],before);
    tick(f,s.speech.duration/2);assert.equal(s.transcript.length,1);assert.equal(f.a.memory.length,2);assert.equal(f.b.memory.length,1);assert.equal(s.effectsApplied,false);await first.run();assert.equal(f.calls.turns.length,1);
    tick(f,20);assert.deepEqual([f.a.needs,f.b.needs],before);await deliver(f);
    assert.deepEqual(f.calls.turns.map(c=>c.id),['actor','pip']);assert.equal(f.calls.turns[1].context.transcript.length,1);assert.equal(f.calls.turns[1].context.transcript[0].speakerId,'actor');assert.equal(f.calls.turns[1].context.world.actor.id,'pip');assert.equal(f.b.memory.length,2);
    for(const call of f.calls.turns){assert.equal(call.context.topic,topic);assert.deepEqual(call.context.topicInitiator,origin);assert.notEqual(call.context.topicInitiator,s.topicInitiator,'Each provider call receives a detached public attribution');assert.deepEqual(Object.keys(call.context.topicInitiator).sort(),['id','name']);}
    assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.forActor('pip'),null);assert.equal(f.a.stage,'awaiting_step_done');assert.equal(f.a.planIndex,0);
    const record=f.social.snapshot().history[0],evidence=f.a.pendingStepEvidence.job.socialEvidence;assert.equal(record.phase,'complete');assert.equal(record.effectsApplied,true);assert.equal(evidence.status,'completed');assert.equal(evidence.accepted,true);assert.equal(evidence.transcript.length,2);assert.ok(Object.isFrozen(s.initiatorJob.socialEvidence));assert.deepEqual(evidence,s.initiatorJob.socialEvidence);assert.equal(record.participation.actor,record.participation.pip);assert.ok(record.participation.actor>=4);
    assert.equal(record.topic,topic);assert.deepEqual(record.topicInitiator,origin);
    for(const brain of [f.a,f.b]){const change=record.needChanges[brain.actorId];assert.equal(brain.needs.social,change.after.social);assert.equal(change.delta.social,change.seconds*4);assert.equal(brain.actor.speaking,false);assert.equal(brain.actor.goal,null);}
    const after=structuredClone([f.a.needs,f.b.needs]);tick(f,100);assert.equal(f.social.nextRequest(),null);f.social.cancelActor('actor');assert.deepEqual([f.a.needs,f.b.needs],after);assert.equal(f.a.logs.filter(l=>l.type==='action_outcome'&&l.action==='socialize'&&l.status==='completed').length,1);
  }finally{f.close();}
});

test('scheduler inspection does not claim an occupied slot and duplicate run callbacks issue only one model request',async()=>{
  const d=deferred();let count=0;const f=fixture({socialAcceptance:async()=>{count++;return d.promise;}});try{
    begin(f);const r1=f.social.nextRequest(),r2=f.social.nextRequest();assert.ok(r1&&r2);assert.equal(f.b.busy,false);const p1=r1.run(),p2=r2.run();assert.equal(count,1);assert.equal(f.social.nextRequest(),null);tick(f,30);assert.deepEqual(f.social.forActor('actor').participation,{actor:0,pip:0});assert.equal(f.b.memory.length,0);
    d.resolve({choice:'accept'});await Promise.all([p1,p2]);assert.equal(f.b.busy,false);assert.equal(count,1);
  }finally{f.close();}
});

test('late acceptance after partner reassignment cannot change the new job, memory, needs, or pose',async()=>{
  const d=deferred(),f=fixture({socialAcceptance:()=>d.promise});try{
    begin(f);const request=f.social.nextRequest().run();f.b.revision++;f.b.job={action:'move',x:7,z:4};f.b.actor.goal={x:7,z:4};f.b.actor.activity='move';const before=structuredClone([f.a.needs,f.b.needs]);d.resolve({choice:'accept'});await request;tick(f);
    assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.snapshot().history[0].phase,'canceled');assert.deepEqual([f.a.needs,f.b.needs],before);assert.deepEqual(f.b.job,{action:'move',x:7,z:4});assert.deepEqual(f.b.actor.goal,{x:7,z:4});assert.equal(f.b.actor.activity,'move');assert.equal(f.a.memory.length,0);assert.equal(f.b.memory.length,0);
  }finally{f.close();}
});

test('late generated speech after cancellation is discarded without clearing an unrelated request',async()=>{
  const d=deferred(),f=fixture({socialTurn:()=>d.promise});try{
    await accept(f);const request=f.social.nextRequest().run();f.social.cancelActor('actor','A new task was assigned');f.a.revision++;f.a.busy=true;f.a.busyLabel='Creating a new object';
    d.resolve({value:{speech:'This should never be spoken.',memory:[{operation:'remember',id:'',kind:'belief',text:'Undelivered content.'}]}});await request;tick(f);
    assert.equal(f.a.memory.length,0);assert.equal(f.a.thought?.speech,undefined);assert.equal(f.social.snapshot().history[0].transcript.length,0);assert.equal(f.a.busy,true);assert.equal(f.a.busyLabel,'Creating a new object');assert.equal(f.a.needs.social,20);
  }finally{f.close();}
});

for(const cause of ['separation','critical need','removal'])test(cause+' during delivery cancels both participants without rewarding a partial turn',async()=>{
  const f=fixture();try{
    await accept(f);await f.social.nextRequest().run();tick(f,.5);assert.equal(f.a.actor.speaking,true);
    if(cause==='separation'){const p={x:8,y:1.2,z:8};f.b.actor.body.setTranslation(p,true);f.b.actor.body.setNextKinematicTranslation(p);}else if(cause==='critical need')f.b.needs.energy=14;else f.garden.brains.delete('pip');
    tick(f,.5);assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.forActor('pip'),null);assert.equal(f.social.snapshot().history[0].effectsApplied,false);assert.equal(f.a.needs.social,20);assert.equal(f.b.needs.social,30);assert.equal(f.a.memory.length,0);assert.equal(f.a.actor.speaking,false);
  }finally{f.close();}
});

test('generation failure and another robot memory ID cannot fabricate a delivered line or fulfillment',async()=>{
  for(const response of [()=>Promise.reject(Object.assign(Error('Offline generator failed'),{diagnostics:{requestId:'test-failure'}})),async()=>({value:{speech:'Hello',memory:[{operation:'revise',id:'private-to-pip',kind:'belief',text:'Not mine.'}]}})]){
    const f=fixture({socialTurn:response});try{await accept(f);await f.social.nextRequest().run();const result=f.social.snapshot().history[0];assert.equal(result.phase,'canceled');assert.equal(result.effectsApplied,false);assert.equal(result.transcript.length,0);assert.equal(f.a.memory.length,0);assert.equal(f.a.needs.social,20);assert.equal(f.b.needs.social,30);}finally{f.close();}
  }
});

test('a delivered first turn may be remembered but a failed second turn gives neither actor social recovery',async()=>{
  const f=fixture();try{
    await accept(f);await deliver(f);assert.equal(f.a.memory.length,1);f.garden.providers.socialTurn=async()=>{throw Error('No second line');};await f.social.nextRequest().run();
    const record=f.social.snapshot().history[0];assert.equal(record.phase,'canceled');assert.equal(record.transcript.length,1);assert.equal(record.effectsApplied,false);assert.equal(f.a.memory.length,1);assert.equal(f.b.memory.length,0);assert.equal(f.a.needs.social,20);assert.equal(f.b.needs.social,30);
  }finally{f.close();}
});

test('saved active conversations restore canceled, and completed history never replays mutual effects',async()=>{
  const f=fixture();try{
    await accept(f);await f.social.nextRequest().run();tick(f,.5);const partial=f.social.snapshot(),before=structuredClone([f.a.needs,f.b.needs]),restored=new SocialSessions(f.garden),result=restored.restore(partial);
    assert.deepEqual(result.canceledParticipantIds,['actor','pip']);assert.equal(result.canceledSessionIds.length,1);assert.equal(restored.snapshot().active.length,0);assert.equal(restored.snapshot().history[0].phase,'canceled');assert.equal(restored.nextRequest(),null);assert.deepEqual([f.a.needs,f.b.needs],before);assert.equal(f.a.actor.speaking,false);assert.equal(f.a.memory.length,0);
    assert.deepEqual(partial.active[0].topicInitiator,{id:'actor',name:'Butterbot'});assert.deepEqual(restored.snapshot().history[0].topicInitiator,partial.active[0].topicInitiator);assert.equal(restored.snapshot().history[0].topic,partial.active[0].topic);
  }finally{f.close();}
  const done=fixture();try{
    await complete(done);const snapshot=done.social.snapshot(),before=structuredClone([done.a.needs,done.b.needs]),restored=new SocialSessions(done.garden);
    done.a.actorName='A later display name';
    restored.restore(snapshot);restored.restore(snapshot);restored.tick(50);assert.deepEqual([done.a.needs,done.b.needs],before);assert.deepEqual(restored.snapshot().history,snapshot.history);assert.equal(restored.snapshot().active.length,0);assert.equal(restored.snapshot().history[0].effectsApplied,true);
    assert.deepEqual(restored.snapshot().history[0].topicInitiator,{id:'actor',name:'Butterbot'},'Historical attribution keeps its original name after a later rename');
    const legacy=structuredClone(snapshot);delete legacy.history[0].topicInitiator;restored.restore(legacy);assert.deepEqual(restored.snapshot().history,legacy.history,'Older history stays readable without inventing a historical display name');assert.equal(restored.snapshot().history[0].initiatorId,'actor');
  }finally{done.close();}
});

test('unreachable meeting positions fail within bounded searches and never teleport either participant',async()=>{
  const f=fixture();try{
    const before=[{...f.a.actor.body.translation()},{...f.b.actor.body.translation()}];let searches=0;f.garden.physics.planGroundRoute=(_id,_goal,options)=>{searches++;assert.equal(options.maxNodes,500);return {ok:false};};begin(f);await f.social.nextRequest().run();
    assert.ok(searches>0&&searches<=6);assert.deepEqual([{...f.a.actor.body.translation()},{...f.b.actor.body.translation()}],before);assert.equal(f.social.snapshot().history[0].phase,'canceled');assert.match(f.social.snapshot().history[0].reason,/reachable/);assert.equal(f.a.needs.social,20);
  }finally{f.close();}
});

test('pausing gives no participation and invitation timeout releases both brains without effects',async()=>{
  const f=fixture();try{
    await accept(f);await f.social.nextRequest().run();f.garden.paused=true;tick(f,60);const s=f.social.forActor('actor');assert.equal(s.speech.elapsed,0);assert.deepEqual(s.participation,{actor:0,pip:0});assert.equal(f.a.memory.length,0);assert.equal(f.social.nextRequest(),null);
    f.garden.paused=false;tick(f,.5);assert.equal(s.speech.elapsed,.5);f.social.cancelActor('pip','Paused conversation ended');assert.equal(f.a.needs.social,20);
  }finally{f.close();}
  const expired=fixture();try{begin(expired);tick(expired,241);assert.equal(expired.social.forActor('actor'),null);assert.match(expired.social.snapshot().history[0].reason,/timed out/);assert.equal(expired.a.needs.social,20);assert.equal(expired.b.needs.social,30);}finally{expired.close();}
});

test('a long pause preserves a partly delivered conversation and repeated controls do not extend its timeout twice',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const f=fixture();try{
    await accept(f);await f.social.nextRequest().run();tick(f,.5);const session=f.social.forActor('actor'),phaseStartedAt=session.phaseStartedAt,elapsed=session.elapsed,participation={...session.participation};
    now+=100;f.garden.paused=true;assert.equal(f.social.setPaused(true),true);now+=600000;assert.equal(f.social.setPaused(true),false);tick(f,60);assert.equal(session.elapsed,elapsed);assert.deepEqual(session.participation,participation);assert.equal(session.speech.elapsed,.5);assert.equal(f.a.memory.length,0);
    now+=300000;f.garden.paused=false;assert.equal(f.social.setPaused(false),true);assert.equal(session.phaseStartedAt,phaseStartedAt+900000);assert.equal(f.social.setPaused(false),false);assert.equal(session.phaseStartedAt,phaseStartedAt+900000);
    tick(f,session.speech.duration-.5);assert.equal(session.transcript.length,1);assert.equal(session.phase,'generating');assert.equal(session.effectsApplied,false);await deliver(f);assert.equal(f.social.snapshot().history[0].phase,'complete');assert.equal(f.a.stage,'awaiting_step_done');assert.equal(f.a.logs.filter(l=>l.type==='action_outcome'&&l.action==='socialize').length,1);
  }finally{f.close();}
});

test('a model response received during a long pause starts no delivery and only excludes its own paused phase time',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const d=deferred(),f=fixture({socialTurn:()=>d.promise});try{
    await accept(f);const request=f.social.nextRequest().run(),session=f.social.forActor('actor');now+=100;f.garden.paused=true;f.social.setPaused(true);now+=600000;
    d.resolve({value:{speech:'Hello after the pause.',memory:[]}});await request;assert.equal(session.phase,'speaking');assert.equal(session.phaseStartedAt,now);assert.equal(session.speech.elapsed,0);assert.deepEqual(session.participation,{actor:0,pip:0});assert.equal(f.a.thought,undefined);
    now+=300000;f.garden.paused=false;f.social.setPaused(false);assert.equal(session.phaseStartedAt,now);tick(f,session.speech.duration);assert.equal(session.transcript.length,1);assert.equal(session.phase,'generating');assert.equal(session.effectsApplied,false);
  }finally{f.close();}
});

test('an unrelated revision bump fails and clears the original social job instead of stranding socializing',async()=>{
  const f=fixture();try{
    await accept(f);await f.social.nextRequest().run();tick(f,.5);const oldJob=f.a.job;assert.equal(f.a.stage,'socializing');f.a.revision++;f.b.revision++;tick(f);
    assert.equal(f.social.forActor('actor'),null);assert.equal(f.a.job,null);assert.equal(f.a.stage,'failed');assert.equal(f.a.actor.goal,null);assert.equal(f.a.actor.speaking,false);assert.equal(f.a.actor.lookPoint,null);assert.equal(f.a.pendingStepEvidence,undefined);assert.equal(oldJob.socialEvidence.status,'canceled');assert.equal(oldJob.socialEvidence.effectsApplied,false);assert.equal(f.a.needs.social,20);assert.equal(f.a.memory.length,0);
    tick(f);assert.equal(f.a.logs.filter(l=>l.type==='action_outcome'&&l.action==='socialize'&&l.status==='failed').length,1);
  }finally{f.close();}
});

for(const replacement of ['job','objective cycle'])test('stale social cancellation never completes a replacement '+replacement,async()=>{
  const f=fixture();try{
    await accept(f);f.a.revision++;f.a.stage='action_decide';f.a.objective='Reach the far garden corner';if(replacement==='job')f.a.job={action:'move',x:7,z:4};else f.a.cycle++;
    const newJob=f.a.job;f.a.actor.goal={x:7,z:4};f.a.actor.activity='move';tick(f);assert.equal(f.social.forActor('actor'),null);assert.equal(f.a.job,newJob);assert.equal(f.a.stage,'action_decide');assert.deepEqual(f.a.actor.goal,{x:7,z:4});assert.equal(f.a.actor.activity,'move');assert.equal(f.a.logs.filter(l=>l.type==='action_outcome'&&l.action==='socialize').length,0);
  }finally{f.close();}
});

test('manual interruption retains its newer suspended state and subsequent movement goal',async()=>{
  const f=fixture();try{
    await accept(f);f.garden.interrupt('actor','Manual movement requested');f.a.actor.goal={x:7,z:4};tick(f);
    assert.equal(f.social.forActor('actor'),null);assert.equal(f.a.stage,'suspended');assert.equal(f.a.error,'Manual movement requested');assert.deepEqual(f.a.actor.goal,{x:7,z:4});assert.equal(f.a.logs.filter(l=>l.type==='action_outcome'&&l.action==='socialize').length,0);assert.equal(f.social.snapshot().history[0].phase,'canceled');assert.equal(f.a.needs.social,20);
  }finally{f.close();}
});

test('acceptance received while paused defers standing and approach until the first resumed physics tick',async()=>{
  const d=deferred(),f=fixture({socialAcceptance:()=>d.promise});try{
    f.b.actor.seated=true;f.b.actor.collider.setEnabled(false);const position={...f.b.actor.body.translation(),y:.72};f.b.actor.body.setTranslation(position,true);f.b.actor.body.setNextKinematicTranslation(position);Object.assign(position,f.b.actor.body.translation());
    begin(f);const request=f.social.nextRequest().run();f.garden.paused=true;f.social.setPaused(true);d.resolve({choice:'accept'});await request;
    assert.equal(f.social.forActor('actor').accepted,true);assert.equal(f.b.actor.seated,true);assert.deepEqual({...f.b.actor.body.translation()},position);assert.equal(f.a.actor.goal,null);assert.equal(f.b.actor.goal,null);assert.equal(f.a.needs.social,20);
    f.garden.paused=false;f.social.setPaused(false);tick(f);assert.equal(f.b.actor.seated,false);assert.ok(f.b.actor.body.translation().y>position.y+.3);assert.ok(f.a.actor.goal);assert.equal(f.social.forActor('actor').phase,'approaching');assert.deepEqual(f.social.forActor('actor').participation,{actor:0,pip:0});
  }finally{f.close();}
});

test('a queued invitation holds only its initiator while the peer really walks and verifies that job before consenting',async()=>{
  const f=fixture({decide:async()=>({response:{choice:'done'}}),verifyStep:async()=>({value:{complete:true,explanation:'The recorded move reached its destination.'}})});try{
    peerWalk(f);const peerStart={...f.b.actor.body.translation()},peerRevision=f.b.revision;assert.equal(f.social.available(f.a,'pip'),false);assert.equal(f.social.canRequest(f.a,'pip'),true);
    const session=begin(f);assert.equal(session.phase,'waiting');assert.equal(f.social.forActor('actor'),session);assert.equal(f.social.forActor('pip'),null);assert.equal(f.social.waitingForActor('pip'),session);assert.deepEqual(session.heldParticipants,['actor']);assert.equal(f.social.nextRequest(),null);assert.equal(f.calls.acceptance.length,0);
    let frames=0;for(;f.b.stage==='acting'&&frames<600;frames++)f.garden.step();assert.ok(frames>10&&frames<600);assert.ok(distance(peerStart,f.b.actor.body.translation())>1.5);assert.equal(f.b.stage,'awaiting_step_done');assert.equal(session.phase,'waiting');assert.equal(f.b.job,null);
    f.b.nextCall=0;await f.b.pollStepCompletion();assert.equal(f.b.stage,'verify_step');assert.ok(f.b.revision>peerRevision);tick(f);assert.equal(session.phase,'waiting');assert.equal(f.social.forActor('pip'),null);
    f.b.nextCall=0;await f.b.pollStepCompletion();assert.equal(f.b.stage,'complete');tick(f);assert.equal(session.phase,'invited');assert.equal(session.revisions.pip,f.b.revision);assert.equal(session.cycles.pip,f.b.cycle);assert.equal(f.social.waitingForActor('pip'),null);assert.equal(f.social.forActor('pip'),session);assert.deepEqual(session.heldParticipants,['actor','pip']);assert.equal(f.calls.acceptance.length,0);assert.deepEqual(session.participation,{actor:0,pip:0});assert.equal(f.a.memory.length,0);assert.equal(f.b.memory.length,0);assert.ok(f.a.needs.social<=20&&f.b.needs.social<=30);
    await f.social.nextRequest().run();approach(f);await deliver(f);await deliver(f);assert.equal(f.calls.acceptance.length,1);assert.equal(f.social.snapshot().history[0].phase,'complete');assert.equal(f.a.stage,'awaiting_step_done');assert.equal(f.b.stage,'complete');assert.equal(f.b.planIndex,1);
  }finally{f.close();}
});

test('reciprocal queued invitations are rejected atomically without replacing either existing job',()=>{
  const f=fixture();try{
    const peerJob=peerWalk(f),session=begin(f),initiatorJob=f.a.job;assert.equal(f.social.canRequest(f.b,'actor'),false);assert.equal(f.social.available(f.b,'actor'),false);assert.throws(()=>f.social.begin(f.b,'actor'),/not available/);assert.equal(f.social.snapshot().active.length,1);assert.equal(f.social.forActor('actor'),session);assert.equal(f.social.forActor('pip'),null);assert.equal(f.social.waitingForActor('pip'),session);assert.equal(f.a.job,initiatorJob);assert.equal(f.b.job,peerJob);assert.equal(f.b.stage,'acting');
  }finally{f.close();}
});

test('waiting stops honestly at 45 simulation seconds without consenting, rewarding, or clearing the peer action',()=>{
  const f=fixture();try{
    const peerJob=peerWalk(f),goal=f.b.actor.goal,needs=structuredClone([f.a.needs,f.b.needs]),session=begin(f),job=f.a.job;tick(f,44.9);assert.equal(session.phase,'waiting');assert.equal(f.social.forActor('pip'),null);assert.equal(f.social.nextRequest(),null);tick(f,.1);
    assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.waitingForActor('pip'),null);assert.equal(f.a.job,null);assert.equal(f.a.stage,'failed');assert.match(f.a.error,/45 seconds/);assert.equal(f.b.job,peerJob);assert.equal(f.b.actor.goal,goal);assert.equal(f.b.stage,'acting');assert.deepEqual([f.a.needs,f.b.needs],needs);assert.equal(f.calls.acceptance.length,0);assert.equal(f.calls.turns.length,0);assert.equal(f.a.memory.length,0);assert.equal(f.b.memory.length,0);assert.equal(job.socialEvidence.accepted,false);assert.equal(job.socialEvidence.effectsApplied,false);assert.deepEqual(job.socialEvidence.transcript,[]);
  }finally{f.close();}
});

for(const id of ['actor','pip'])test('a new user objective for '+id+' releases a pending invitation without clobbering independent work',()=>{
  const f=fixture();try{
    const peerJob=peerWalk(f),peerGoal=f.b.actor.goal;begin(f);f.garden.assign(id,'Inspect the flower bed for me');tick(f);
    const assigned=f.garden.brains.get(id);assert.equal(assigned.objective,'Inspect the flower bed for me');assert.equal(assigned.stage,'action_plan');assert.equal(assigned.job,null);assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.forActor('pip'),null);assert.equal(f.social.waitingForActor('pip'),null);assert.equal(f.social.snapshot().history[0].effectsApplied,false);assert.equal(f.calls.acceptance.length,0);
    if(id==='actor'){assert.equal(f.b.job,peerJob);assert.equal(f.b.actor.goal,peerGoal);assert.equal(f.b.stage,'acting');}else assert.equal(f.a.stage,'failed');
  }finally{f.close();}
});

test('active user work and urgent needs are never waitable, including a peer changed outside the assignment helper',()=>{
  const f=fixture();try{
    peerWalk(f);f.b.goalSource='user';assert.equal(f.social.canRequest(f.a,'pip'),false);assert.throws(()=>begin(f),/not available/);f.b.goalSource='self';f.b.needs.energy=15;assert.equal(f.social.canRequest(f.a,'pip'),false);f.b.needs.energy=80;begin(f);
    f.b.goalSource='user';f.b.cycle++;f.b.revision++;f.b.stage='action_plan';f.b.objective='A newer user task';f.b.job=null;f.b.actor.goal={x:7,z:4};tick(f);assert.equal(f.social.waitingForActor('pip'),null);assert.equal(f.a.stage,'failed');assert.equal(f.b.stage,'action_plan');assert.equal(f.b.objective,'A newer user task');assert.deepEqual(f.b.actor.goal,{x:7,z:4});assert.equal(f.calls.acceptance.length,0);
  }finally{f.close();}
});

test('restoring a pending invitation cancels its initiator while retaining the unreserved peer’s real movement job',()=>{
  const f=fixture(),restored=new Garden({cast:'duo',seedFood:false});try{
    peerWalk(f);begin(f);for(let i=0;i<15;i++)f.garden.step();const saved=f.garden.save(),originalPeer=saved.brains.find(b=>b.id==='pip'),peerGoal={...f.b.actor.goal};assert.deepEqual(saved.social.active[0].heldParticipants,['actor']);restored.restore(saved);
    const actor=restored.brains.get('actor'),peer=restored.brains.get('pip');assert.equal(restored.social.forActor('actor'),null);assert.equal(restored.social.waitingForActor('pip'),null);assert.equal(actor.job,null);assert.equal(actor.stage,'action_plan');assert.deepEqual(peer.job,originalPeer.job);assert.equal(peer.stage,'acting');assert.deepEqual(peer.actor.goal,peerGoal);assert.deepEqual(peer.needs,originalPeer.needs);assert.equal(restored.social.snapshot().history[0].effectsApplied,false);
    const before={...peer.actor.body.translation()};for(let i=0;i<30;i++)restored.step();assert.ok(distance(before,peer.actor.body.translation())>.3);assert.equal(peer.stage,'acting');
  }finally{f.close();restored.physics.dispose();}
});
