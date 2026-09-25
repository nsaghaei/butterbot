import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {accommodationDesigns} from '../needs.mjs';

const cube=await compileDesign({name:'Gift cube',description:'A small orange cube that can be carried and given.',kind:'prop',mass:1,affordances:['display'],code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.32,.32,.32),new THREE.MeshToonMaterial({color:0xf0a13d})));return g;'});
const foodBowl=await compileDesign(accommodationDesigns().find(item=>item.id==='snack-bowl').proposal);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function fixture(overrides={}){
  const calls={acceptance:[],transfers:0},providers={giftAcceptance:async(brain,giver,session)=>{calls.acceptance.push({recipient:brain.actorId,giver,session});return {choice:'accept'};},socialAcceptance:()=>assert.fail('Gifting must not request chat acceptance'),socialTurn:()=>assert.fail('Gifting must not generate conversation turns'),...overrides},g=new Garden({cast:'duo',seedFood:false,providers}),a=g.brains.get('actor'),b=g.brains.get('pip');
  for(let i=0;i<30;i++)g.physics.step();const p=a.actor.body.translation(),item=g.physics.add(structuredClone(cube),{x:p.x,y:.3,z:p.z+.5});item.owner='actor';g.designs[item.id]=item.design;g.physics.carry(item.id,'actor');for(let i=0;i<10;i++)g.physics.step();
  const transfer=g.physics.giftObject.bind(g.physics);g.physics.giftObject=(...args)=>{calls.transfers++;return transfer(...args);};
  return {g,a,b,item,calls,social:g.social,close:()=>g.physics.dispose()};
}
function start(f){f.a.goalSource='user';f.a.objective='Give the cube to Pip';f.a.planSteps=[{action:'give',target:f.item.id,recipient:'pip'}];f.a.planIndex=0;f.a.startAction(f.a.planSteps[0],{advance:true});return f.social.forActor('actor');}
function advance(f,predicate,limit=1000){let n=0;for(;!predicate()&&n<limit;n++)f.g.step();assert.ok(predicate(),'Condition did not become true within '+limit+' frames');return n;}
async function accepted(f){const s=start(f),r=f.social.nextRequest();assert.equal(r.kind,'laya');assert.equal(r.purpose,'gift acceptance');assert.equal(r.brain,f.b);await r.run();advance(f,()=>s.phase==='giving'||!f.social.forActor('actor'));assert.equal(s.phase,'giving',s.reason);return s;}
const lastOutcome=f=>f.a.logs.findLast(l=>l.type==='action_outcome'&&l.action==='give');

test('gifting requires a real willing-eligible peer, donor-held portable object and free recipient hands',()=>{
  const f=fixture();try{
    assert.equal(f.social.canReceiveGift(f.a,'pip'),true);assert.equal(f.social.canGiveRequest(f.a,f.item.id,'pip'),true);assert.equal(f.social.canGiveRequest(f.a,f.item.id,'actor'),false);assert.equal(f.social.canGiveRequest(f.a,'missing','pip'),false);
    const printed=f.g.physics.character('printed',{x:4,y:1.2,z:4});assert.ok(printed.controller);assert.equal(f.social.canReceiveGift(f.a,'printed'),false);
    f.b.goalSource='user';f.b.stage='action_plan';assert.equal(f.social.canGiveRequest(f.a,f.item.id,'pip'),false);f.b.goalSource='self';f.b.stage='goal_select';f.b.needs.energy=15;assert.equal(f.social.canReceiveGift(f.a,'pip'),false);f.b.needs.energy=80;
    const other=f.g.physics.add(structuredClone(cube),{x:-4,y:.3,z:1.4});f.g.physics.carry(other.id,'pip');assert.equal(f.social.canReceiveGift(f.a,'pip'),false);assert.throws(()=>f.social.beginGift(f.a,f.item.id,'pip'),/empty hands/);f.g.physics.release(other.id);
    f.item.design.attributes.giftable=false;assert.equal(f.social.canGiveRequest(f.a,f.item.id,'pip'),false);f.item.design.attributes.giftable=true;f.g.physics.release(f.item.id);assert.equal(f.social.canReceiveGift(f.a,'pip'),true);assert.equal(f.social.canGiveRequest(f.a,f.item.id,'pip'),false);
  }finally{f.close();}
});

test('a consenting pair approaches physically, gives and receives for 1.4 seconds, and transfers exactly once at contact',async()=>{
  const f=fixture();try{
    const initial={...f.a.actor.body.translation()},needs=[f.a.needs.social,f.b.needs.social],s=start(f);assert.equal(s.kind,'gift');assert.equal(f.a.stage,'gifting');assert.equal(f.item.carrier,'actor');assert.deepEqual({...f.a.actor.body.translation()},initial);
    await f.social.nextRequest().run();assert.equal(s.phase,'approaching');assert.equal(f.calls.acceptance.length,1);assert.equal(f.calls.acceptance[0].session.object.heldBy,'actor');assert.equal(f.calls.acceptance[0].session.object.id,f.item.id);assert.equal(f.calls.acceptance[0].giver.id,'actor');assert.equal('memory'in f.calls.acceptance[0].giver,false);
    const walked=advance(f,()=>s.phase==='giving');assert.ok(walked>10);assert.ok(distance(initial,f.a.actor.body.translation())>.7);assert.ok(distance(f.a.actor.body.translation(),f.b.actor.body.translation())<=2);assert.equal(f.item.carrier,'actor');assert.equal(f.a.actor.activity,'give');assert.equal(f.b.actor.activity,'receive');
    advance(f,()=>s.giftElapsed>=.5);assert.equal(f.calls.transfers,0);assert.equal(f.item.carrier,'actor');assert.equal(lastOutcome(f),undefined);advance(f,()=>s.transferred);
    assert.equal(f.calls.transfers,1);assert.equal(f.item.carrier,'pip');assert.equal(f.item.owner,'pip');assert.equal(f.a.stage,'gifting');assert.equal(lastOutcome(f),undefined);const contact=f.a.job.giftEvidence;assert.equal(contact.status,'transferred');assert.equal(contact.accepted,true);assert.equal(contact.before.carrier,'actor');assert.equal(contact.after.carrier,'pip');assert.equal(contact.after.owner,'pip');assert.equal(contact.transferCount,1);assert.ok(contact.distanceAtTransfer<=2);assert.ok(Object.isFrozen(contact));assert.equal(contact.gesture.completed,false);
    advance(f,()=>!f.social.forActor('actor'));const proof=f.a.pendingStepEvidence.job.giftEvidence;assert.equal(f.a.stage,'awaiting_step_done');assert.equal(f.a.planIndex,0);assert.equal(proof.status,'completed');assert.equal(proof.gesture.duration,1.4);assert.equal(proof.gesture.elapsed,1.4);assert.equal(proof.gesture.completed,true);assert.equal(proof.transferred,true);assert.equal(f.calls.transfers,1);assert.equal(lastOutcome(f).status,'completed');assert.ok(distance(f.g.physics.position(f.item),f.g.physics.gripPosition(f.b.actor))<.12);
    assert.equal(f.a.memory.length,0);assert.equal(f.b.memory.length,0);assert.ok(f.a.needs.social<=needs[0]&&f.b.needs.social<=needs[1]);assert.equal(f.social.snapshot().history[0].needChanges,null);for(let i=0;i<30;i++)f.g.step();assert.equal(f.calls.transfers,1);assert.equal(f.item.carrier,'pip');
  }finally{f.close();}
});

test('declining or unavailable acceptance leaves the offered object with its giver',async()=>{
  for(const acceptance of [async()=>({response:{choice:'decline'}}),async()=>{throw Error('No Laya response');}]){
    const f=fixture({giftAcceptance:acceptance});try{const before={...f.a.actor.body.translation()};start(f);await f.social.nextRequest().run();assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.forActor('pip'),null);assert.equal(f.item.carrier,'actor');assert.equal(f.calls.transfers,0);assert.equal(lastOutcome(f).status,'failed');assert.equal(lastOutcome(f).giftEvidence.transferred,false);assert.deepEqual({...f.a.actor.body.translation()},before);}finally{f.close();}
  }
});

test('a peer finishes and verifies its own pickup before the queued gift rejects its still-occupied hands',async()=>{
  const f=fixture({decide:async()=>({response:{choice:'done'}}),verifyStep:async()=>({value:{complete:true,explanation:'The recipient picked up its own object.'}})});try{
    const other=f.g.physics.add(structuredClone(cube),{x:-4,y:.3,z:1.5});other.owner='pip';f.g.designs[other.id]=other.design;f.b.planSteps=[{action:'pick_up',target:other.id}];f.b.startAction(f.b.planSteps[0],{advance:true});const peerJob=f.b.job,s=start(f);assert.equal(s.phase,'waiting');assert.equal(f.social.forActor('pip'),null);
    advance(f,()=>other.carrier==='pip');assert.equal(f.social.forActor('actor'),s);assert.equal(f.b.job,peerJob);assert.equal(f.b.stage,'acting');assert.equal(f.calls.acceptance.length,0);assert.equal(f.calls.transfers,0);
    advance(f,()=>f.b.stage==='awaiting_step_done');assert.equal(f.b.pendingStepEvidence.job.action,'pick_up');assert.equal(s.phase,'waiting');assert.equal(f.social.forActor('pip'),null);
    f.b.nextCall=0;await f.b.pollStepCompletion();f.g.step();assert.equal(f.b.stage,'verify_step');assert.equal(s.phase,'waiting');f.b.nextCall=0;await f.b.pollStepCompletion();assert.equal(f.b.stage,'complete');f.g.step();
    assert.equal(f.social.forActor('actor'),null);assert.equal(f.social.waitingForActor('pip'),null);assert.equal(f.b.stage,'complete');assert.equal(f.b.planIndex,1);assert.equal(other.carrier,'pip');assert.equal(f.item.carrier,'actor');assert.match(f.a.error,/occupied hands/);assert.equal(f.calls.acceptance.length,0);assert.equal(f.calls.transfers,0);assert.equal(f.b.logs.filter(l=>l.type==='action_outcome'&&l.status==='completed').length,1);assert.equal(f.b.logs.filter(l=>l.type==='step_verification'&&l.status==='verified').length,1);
  }finally{f.close();}
});

for(const requestAt of ['before holding food','while holding food'])test('a gift requested '+requestAt+' waits for real eating, release and audit before consent and transfer',async()=>{
  let audits=0;const f=fixture({decide:async()=>({response:{choice:'done'}}),verifyStep:async(brain,evidence)=>{assert.equal(brain.actorId,'pip');assert.equal(evidence.completion.job.action,'eat');assert.equal(evidence.completion.job.consumedServings,1);audits++;return {value:{complete:true,explanation:'One actual serving was consumed and the bowl was released.'}};}});try{
    const food=f.g.physics.add(structuredClone(foodBowl),{x:-4,y:.3,z:1.6});f.g.designs[food.id]=food.design;f.b.needs.hunger=70;f.b.goalSource='self';f.b.planSteps=[{action:'eat',target:food.id}];f.b.startAction(f.b.planSteps[0],{advance:true});const eatingJob=f.b.job;
    if(requestAt==='while holding food'){advance(f,()=>food.carrier==='pip');assert.equal(f.social.canReceiveGift(f.a,'pip'),true);assert.equal(f.social.canGiveRequest(f.a,f.item.id,'pip'),true);}
    const session=start(f);assert.equal(session.phase,'waiting');assert.equal(f.social.forActor('pip'),null);advance(f,()=>food.carrier==='pip');assert.equal(f.b.job,eatingJob);assert.equal(f.b.stage,'acting');assert.equal(f.social.forActor('actor'),session);assert.equal(f.calls.acceptance.length,0);assert.equal(f.calls.transfers,0);assert.equal(f.item.carrier,'actor');
    advance(f,()=>f.b.stage==='awaiting_step_done');assert.equal(food.servings,foodBowl.attributes.servings-1);assert.equal(food.carried,false);assert.equal(food.carrier,null);assert.ok(f.b.needs.hunger<43);assert.equal(session.phase,'waiting');assert.equal(f.social.forActor('pip'),null);assert.equal(f.calls.acceptance.length,0);
    f.b.nextCall=0;await f.b.pollStepCompletion();f.g.step();assert.equal(f.b.stage,'verify_step');assert.equal(session.phase,'waiting');f.b.nextCall=0;await f.b.pollStepCompletion();assert.equal(audits,1);assert.equal(f.b.stage,'complete');f.g.step();assert.equal(session.phase,'invited');assert.equal(f.calls.acceptance.length,0);
    await f.social.nextRequest().run();advance(f,()=>!f.social.forActor('actor'));assert.equal(f.calls.acceptance.length,1);assert.equal(f.calls.transfers,1);assert.equal(f.item.carrier,'pip');assert.equal(f.item.owner,'pip');assert.equal(f.a.stage,'awaiting_step_done');assert.equal(f.a.pendingStepEvidence.job.giftEvidence.status,'completed');assert.equal(f.b.planIndex,1);assert.equal(f.b.stage,'complete');assert.equal(food.servings,foodBowl.attributes.servings-1);assert.equal(food.carried,false);
  }finally{f.close();}
});

test('temporary occupied hands do not extend the 45-second wait or release the recipient’s object',()=>{
  const f=fixture();try{
    const other=f.g.physics.add(structuredClone(cube),{x:-4,y:.3,z:1.5});f.g.designs[other.id]=other.design;f.b.planSteps=[{action:'pick_up',target:other.id}];f.b.startAction(f.b.planSteps[0],{advance:true});advance(f,()=>f.b.stage==='awaiting_step_done');assert.equal(other.carrier,'pip');assert.equal(f.social.canReceiveGift(f.a,'pip'),true);const session=start(f);f.social.tick(44.9);assert.equal(session.phase,'waiting');f.social.tick(.1);
    assert.equal(f.social.forActor('actor'),null);assert.match(f.a.error,/45 seconds/);assert.equal(f.b.stage,'awaiting_step_done');assert.equal(other.carrier,'pip');assert.equal(f.item.carrier,'actor');assert.equal(f.calls.acceptance.length,0);assert.equal(f.calls.transfers,0);
  }finally{f.close();}
});

test('occupied hands remain forbidden after an invitation even while its acceptance request is busy',async()=>{
  const d=deferred(),f=fixture({giftAcceptance:()=>d.promise});try{
    start(f);const request=f.social.nextRequest().run();assert.equal(f.b.busy,true);const other=f.g.physics.add(structuredClone(cube),{x:-4,y:.3,z:1.5});f.g.physics.carry(other.id,'pip');d.resolve({choice:'accept'});await request;
    assert.equal(f.social.forActor('actor'),null);assert.match(f.a.error,/occupied hands/);assert.equal(f.item.carrier,'actor');assert.equal(other.carrier,'pip');assert.equal(f.calls.transfers,0);assert.equal(lastOutcome(f).giftEvidence.accepted,false);
  }finally{f.close();}
});

test('recipient separation before contact cancels the gift without transferring or rolling back other work',async()=>{
  const f=fixture();try{
    const s=await accepted(f);advance(f,()=>s.giftElapsed>=.3);const far={x:7,y:1.2,z:7};f.b.actor.body.setTranslation(far,true);f.b.actor.body.setNextKinematicTranslation(far);f.g.step();assert.equal(f.calls.transfers,0);assert.equal(f.item.carrier,'actor');assert.equal(lastOutcome(f).giftEvidence.transferred,false);assert.equal(lastOutcome(f).status,'failed');assert.equal(f.social.forActor('pip'),null);
  }finally{f.close();}
});

test('a late consent response cannot transfer an object the donor released during inference',async()=>{
  const d=deferred(),f=fixture({giftAcceptance:()=>d.promise});try{
    start(f);const request=f.social.nextRequest().run();f.g.physics.release(f.item.id);d.resolve({choice:'accept'});await request;assert.equal(f.calls.transfers,0);assert.equal(f.item.carried,false);assert.equal(f.social.forActor('actor'),null);assert.equal(lastOutcome(f).giftEvidence.transferred,false);assert.match(lastOutcome(f).outcome,/no longer holds/);
  }finally{f.close();}
});

test('cancellation after contact retains truthful transfer evidence and never completes a replacement user goal',async()=>{
  const f=fixture();try{
    const s=await accepted(f);advance(f,()=>s.transferred);assert.ok(s.giftElapsed<1.4);f.g.assign('actor','Walk to the far garden corner');const cycle=f.a.cycle;for(let i=0;i<50;i++)f.g.step();
    assert.equal(f.a.cycle,cycle);assert.equal(f.a.objective,'Walk to the far garden corner');assert.equal(f.a.stage,'action_plan');assert.equal(f.a.job,null);assert.equal(f.item.carrier,'pip');assert.equal(f.item.owner,'pip');assert.equal(f.calls.transfers,1);const history=f.social.snapshot().history[0];assert.equal(history.phase,'canceled');assert.equal(history.effectsApplied,true);assert.equal(history.transferred,true);assert.equal(history.giftEvidence.status,'canceled');assert.equal(history.giftEvidence.transferred,true);assert.equal(history.giftEvidence.gesture.completed,false);assert.equal(f.a.logs.filter(l=>l.type==='action_outcome'&&l.cycle===cycle&&l.status==='completed').length,0);
  }finally{f.close();}
});

test('a stale gifting revision clears the exact old job without replaying a contact that already transferred',async()=>{
  const f=fixture();try{
    const s=await accepted(f);advance(f,()=>s.transferred);f.a.revision++;f.g.step();assert.equal(f.a.stage,'failed');assert.equal(f.a.job,null);assert.equal(f.social.forActor('actor'),null);assert.equal(f.item.carrier,'pip');assert.equal(f.calls.transfers,1);assert.equal(lastOutcome(f).giftEvidence.transferred,true);assert.equal(lastOutcome(f).giftEvidence.status,'canceled');
  }finally{f.close();}
});

test('physical primitive failure records its actual post-state, including a transfer completed before an exception',async()=>{
  for(const transferred of [false,true]){
    const f=fixture();try{const original=f.g.physics.giftObject.bind(f.g.physics);f.g.physics.giftObject=(...args)=>{if(transferred)original(...args);else f.g.physics.release(args[0]);throw Error('Injected post-mutation failure');};await accepted(f);advance(f,()=>!f.social.forActor('actor'));const evidence=lastOutcome(f).giftEvidence;assert.equal(lastOutcome(f).status,'failed');assert.equal(evidence.status,'canceled');assert.equal(evidence.transferred,transferred);assert.equal(evidence.before.carrier,'actor');assert.equal(evidence.after.carrier,transferred?'pip':null);assert.equal(f.item.carrier,transferred?'pip':null);assert.equal(evidence.transferCount,transferred?1:0);assert.match(evidence.reason,/post-mutation/);}finally{f.close();}
  }
});

test('pause freezes handoff contact and a resumed gesture transfers only once',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const f=fixture();try{
    const s=await accepted(f);advance(f,()=>s.giftElapsed>=.3);const elapsed=s.giftElapsed,positions=[{...f.a.actor.body.translation()},{...f.b.actor.body.translation()}];f.g.setPaused(true);now+=900000;for(let i=0;i<300;i++)f.g.step();assert.equal(s.giftElapsed,elapsed);assert.equal(f.calls.transfers,0);assert.equal(f.item.carrier,'actor');assert.deepEqual([{...f.a.actor.body.translation()},{...f.b.actor.body.translation()}],positions);
    f.g.setPaused(false);advance(f,()=>s.transferred);f.g.setPaused(true);now+=900000;for(let i=0;i<300;i++)f.g.step();assert.equal(f.calls.transfers,1);assert.equal(f.item.carrier,'pip');f.g.setPaused(false);advance(f,()=>!f.social.forActor('actor'));assert.equal(f.calls.transfers,1);assert.equal(f.a.pendingStepEvidence.job.giftEvidence.status,'completed');
  }finally{f.close();}
});

for(const point of ['before contact','after contact','complete'])test('restoring '+point+' cancels only unfinished gift work and never replays or reverses ownership',async()=>{
  const f=fixture(),restored=new Garden({cast:'duo',seedFood:false});try{
    const s=await accepted(f);if(point==='before contact')advance(f,()=>s.giftElapsed>=.3);else if(point==='after contact')advance(f,()=>s.transferred);else advance(f,()=>!f.social.forActor('actor'));
    const saved=f.g.save();restored.physics.giftObject=()=>assert.fail('Restore must not replay a gift');restored.restore(saved);const object=restored.physics.entities.get(f.item.id),history=restored.social.snapshot().history[0],wasTransferred=point!=='before contact';assert.equal(object.carrier,wasTransferred?'pip':'actor');assert.equal(history.transferred,wasTransferred);assert.equal(history.effectsApplied,wasTransferred);assert.equal(history.phase,point==='complete'?'complete':'canceled');if(wasTransferred){assert.equal(history.giftEvidence.transferred,true);assert.equal(history.giftEvidence.after.carrier,'pip');assert.equal(object.owner,'pip');}
    assert.equal(restored.social.forActor('actor'),null);assert.equal(restored.social.forActor('pip'),null);for(let i=0;i<20;i++)restored.step();assert.equal(object.carrier,wasTransferred?'pip':'actor');if(point!=='complete'){assert.equal(restored.brains.get('actor').job,null);assert.equal(restored.brains.get('actor').stage,'action_plan');assert.equal(restored.reservations.has(object.id),false);}
  }finally{f.close();restored.physics.dispose();}
});
