import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {validateAction,validatePlanTargets,conciseWorld} from '../actions.mjs';
import {executionEvidence} from '../execution-evidence.mjs';

const giftDesign=await compileDesign({name:'Gift flower',description:'A small flower sculpture.',kind:'prop',mass:.5,affordances:['display'],attributes:{portable:true,giftable:true},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.3,.5,.3),new THREE.MeshToonMaterial({color:0xe7a54c})));return g;'});
function fixture(){
  const calls={accepted:0,audits:[]};
  const providers={laya:{ready:true},generator:{ready:true},calls:{},activeRequests:{},healthTime:Date.now(),health:async()=>{},
    decide:async(_state,_question,choices)=>({response:{choice:choices.done?'done':Object.keys(choices)[0]}}),
    giftAcceptance:async()=>{calls.accepted++;return {choice:'accept',response:{choice:'accept'}};},
    verifyStep:async(_brain,evidence)=>{calls.audits.push(evidence);return {value:{complete:true,explanation:'Recorded physical completion supports the step.'}};}
  };
  const garden=new Garden({providers,cast:'duo',seedFood:false}),giver=garden.selected,recipient=garden.brains.get('pip');
  for(const brain of garden.brains.values()){brain.stage='idle';brain.goalReadyAt=1e9;brain.nextReflection=Infinity;brain.pendingReflection=null;}
  for(let i=0;i<60;i++)garden.step();
  const object=garden.physics.add(structuredClone(giftDesign),{x:-.5,y:.5,z:4});garden.designs[object.id]=object.design;garden.physics.carry(object.id,'actor');
  const action={action:'give',target:object.id,recipient:'pip',label:'Give the flower to Pip'};
  return {garden,giver,recipient,object,action,calls,providers};
}
async function pump(f,{until=()=>false,frames=2400,onFrame=()=>{}}={}){
  for(let frame=0;frame<frames;frame++){
    f.garden.step();onFrame(frame);if(until())return true;
    for(const brain of f.garden.brains.values()){brain.nextCall=0;brain.nextReflection=Infinity;}
    await f.garden.poll();
  }return false;
}
function planGift(f){f.giver.assign('Give the flower to Pip.');f.giver.planSteps=[f.action];f.giver.stage='action_decide';f.giver.nextReflection=Infinity;}

test('a gift waits for the recipient walk and audit, asks consent, pauses safely, and transfers exactly once',async()=>{
  const f=fixture();try{
    const peerMove={action:'move',x:-4,z:5,label:'Finish my walk'};
    f.recipient.assign('Finish my walk.');f.recipient.goalSource='self';f.recipient.planSteps=[peerMove];f.recipient.startAction(peerMove);planGift(f);
    let waited=false,paused=false,receivePose=false,transfers=0;const primitive=f.garden.physics.giftObject.bind(f.garden.physics);
    f.garden.physics.giftObject=(...args)=>{transfers++;return primitive(...args);};
    const finished=await pump(f,{until:()=>f.giver.stage==='complete',onFrame:()=>{
      const pair=f.garden.social.forActor('actor');waited||=pair?.phase==='waiting';
      receivePose||=f.recipient.actor.activity==='receive';
      if(pair?.phase==='giving'&&!paused&&pair.giftElapsed>0&&pair.giftElapsed<.5){
        f.garden.setPaused(true);const elapsed=pair.giftElapsed,carrier=f.object.carrier,revisions=[f.giver.revision,f.recipient.revision];
        for(let i=0;i<180;i++)f.garden.step();assert.equal(pair.giftElapsed,elapsed);assert.equal(f.object.carrier,carrier);assert.equal(carrier,'actor');
        f.garden.setPaused(false);assert.deepEqual([f.giver.revision,f.recipient.revision],revisions);paused=true;
      }
    }});
    assert.ok(finished);assert.ok(waited);assert.ok(paused);assert.ok(receivePose);assert.equal(f.calls.accepted,1);assert.equal(transfers,1);
    assert.equal(f.object.carrier,'pip');assert.equal(f.object.owner,'pip');assert.equal(f.giver.planIndex,1);
    const proof=f.calls.audits.find(e=>e.completion?.job?.action==='give').completion.job.giftEvidence;
    assert.equal(proof.status,'completed');assert.equal(proof.accepted,true);assert.equal(proof.transferred,true);assert.equal(proof.transferCount,1);assert.equal(proof.after.carrier,'pip');assert.equal(proof.before.carrier,'actor');assert.ok(proof.distanceAtTransfer<=2);assert.equal(proof.gesture.completed,true);
    assert.ok(f.calls.audits.some(e=>e.completion?.job?.action==='move'),'Pip finishes verification before accepting');
    const history=f.garden.social.snapshot().history.at(-1);assert.equal(history.kind,'gift');assert.equal(history.needChanges,null);assert.equal(history.effectsApplied,true);
  }finally{f.garden.physics.dispose();}
});

test('gift requests protect an active user task and reject controller-only recipients',()=>{
  const f=fixture();try{
    f.recipient.assign('Walk to the corner.');f.recipient.planSteps=[{action:'move',x:5,z:5}];f.recipient.startAction(f.recipient.planSteps[0]);const job=f.recipient.job;
    assert.equal(conciseWorld(f.garden,f.giver).characters.find(c=>c.id==='pip').giftAvailable,false);
    assert.throws(()=>validateAction(f.garden,f.giver,f.action),/not available/);assert.equal(f.recipient.job,job);assert.equal(f.object.carrier,'actor');
    f.garden.physics.character('printed',{x:4,y:1.2,z:6});
    assert.throws(()=>validatePlanTargets(f.garden,[{...f.action,recipient:'printed'}]),/own brain/);
  }finally{f.garden.physics.dispose();}
});

test('a queued gift cannot occupy the hands used by the recipient own pickup',async()=>{
  const f=fixture();try{
    const p=f.recipient.actor.body.translation(),own=f.garden.physics.add(structuredClone(giftDesign),{x:p.x+.5,y:.5,z:p.z});f.garden.designs[own.id]=own.design;
    const pickup={action:'pick_up',target:own.id,label:'Pick up my own flower'};
    f.recipient.assign('Pick up my own flower.');f.recipient.goalSource='self';f.recipient.planSteps=[pickup];f.recipient.startAction(pickup);planGift(f);
    await f.garden.poll();assert.equal(f.garden.social.forActor('actor')?.phase,'waiting');
    await pump(f,{until:()=>f.recipient.stage==='complete'&&f.giver.stage==='failed',frames:800});
    assert.equal(f.object.carrier,'actor');assert.equal(own.carrier,'pip');assert.equal(f.calls.accepted,0);assert.equal(f.giver.stage,'failed');assert.equal(f.recipient.stage,'complete');
    assert.equal(f.garden.social.snapshot().history.at(-1).transferred,false);assert.equal(f.garden.social.snapshot().active.length,0);
  }finally{f.garden.physics.dispose();}
});

test('reload after gift contact preserves actual ownership and evidence without replaying transfer',async()=>{
  const f=fixture();let restored;try{
    planGift(f);const contact=await pump(f,{until:()=>!!f.garden.social.forActor('actor')?.transferred});assert.ok(contact);
    const before=f.garden.social.snapshot().active[0];assert.equal(before.giftEvidence.status,'transferred');assert.equal(before.giftEvidence.transferCount,1);assert.equal(before.giftEvidence.after.carrier,'pip');
    const saved=f.garden.save();restored=new Garden({providers:f.providers,cast:'duo',seedFood:false});restored.restore(saved);
    assert.equal(restored.physics.entities.get(f.object.id).carrier,'pip');assert.equal(restored.social.snapshot().active.length,0);const proof=restored.social.snapshot().history.at(-1).giftEvidence;
    assert.equal(proof.transferred,true);assert.equal(proof.transferCount,1);assert.equal(proof.after.carrier,'pip');assert.equal(restored.selected.job,null);assert.equal(restored.selected.stage,'action_plan');
    for(let i=0;i<120;i++)restored.step();assert.equal(restored.physics.entities.get(f.object.id).carrier,'pip');assert.equal(restored.social.snapshot().history.at(-1).giftEvidence.transferCount,1);
  }finally{restored?.physics.dispose();f.garden.physics.dispose();}
});

test('gift completion exposes contact criteria and immutable transfer evidence for the audit',async()=>{
  const f=fixture();try{
    planGift(f);await pump(f,{until:()=>f.giver.stage==='awaiting_step_done'});
    const evidence=executionEvidence(f.giver);assert.equal(evidence.criteria.maxTransferDistanceMeters,2);assert.equal(evidence.criteria.gestureSeconds,1.4);assert.equal(evidence.criteria.gift.status,'completed');
    const atContact=structuredClone(evidence.criteria.gift.after.position);f.object.body.setTranslation({x:9,y:2,z:8},true);assert.deepEqual(executionEvidence(f.giver).criteria.gift.after.position,atContact);
    assert.equal(f.giver.planIndex,0,'Physical handoff does not advance its own verified plan');
  }finally{f.garden.physics.dispose();}
});
