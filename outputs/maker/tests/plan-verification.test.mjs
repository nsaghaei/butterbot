import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';

function provider(overrides={}){return {generator:{ready:true},laya:{ready:true},healthTime:Date.now(),calls:{},decide:async(_state,_question,choices)=>({response:{choice:choices.done?'done':Object.keys(choices)[0]}}),verifyStep:async()=>({value:{complete:true,explanation:'The engine records the requested action completing.'}}),...overrides};}
function ticks(g,n){for(let i=0;i<n;i++)g.step();}
async function poll(b){b.nextCall=0;await b.poll();}
function completedRest(g,{twoSteps=false}={}){const b=g.selected;b.assign('Rest briefly'+(twoSteps?', then dance.':'.'));b.planSteps=[{action:'rest',seconds:2,label:'Rest briefly'},...(twoSteps?[{action:'dance',seconds:2,label:'Dance afterwards'}]:[])];b.stage='action_decide';b.startAction(b.planSteps[0]);ticks(g,125);assert.equal(b.stage,'awaiting_step_done');return b;}

test('an engine-completed step waits for confirmation without incrementing or repeating itself',()=>{
  const g=new Garden({providers:provider(),seedFood:false});
  try{
    const b=completedRest(g,{twoSteps:true}),evidence=structuredClone(b.pendingStepEvidence);
    assert.equal(b.planIndex,0);assert.equal(b.job,null);assert.equal(evidence.stepIndex,0);
    assert.equal(evidence.step.action,'rest');assert.equal(evidence.job.action,'rest');assert.ok(Number.isFinite(evidence.completedAt));
    const record=b.logs.find(l=>l.id===evidence.recordId);assert.equal(record.type,'action_outcome');assert.equal(record.status,'completed');assert.equal(record.outcome,evidence.outcome);
    ticks(g,300);assert.equal(b.stage,'awaiting_step_done');assert.equal(b.planIndex,0);assert.equal(b.job,null);
    assert.deepEqual(b.pendingStepEvidence,evidence);assert.equal(b.logs.filter(l=>l.type==='action_outcome').length,1);
  }finally{g.physics.dispose();}
});

test('Done selects verification; only supported positive verification advances to the next step',async()=>{
  let choicesSeen,verificationFacts;
  const g=new Garden({seedFood:false,providers:provider({decide:async(_s,_q,choices)=>{choicesSeen=choices;return {response:{choice:'done'}};},verifyStep:async(_b,context)=>{verificationFacts=context;return {value:{complete:true,explanation:'A completed rest outcome supports this step.'}};}})});
  try{
    const b=completedRest(g,{twoSteps:true});await poll(b);
    assert.match(choicesSeen.done,/Done with this step/);assert.match(choicesSeen.check,/check this step/);
    assert.deepEqual(Object.keys(choicesSeen).sort(),['check','done']);
    assert.equal(b.stage,'verify_step');assert.equal(b.planIndex,0);await poll(b);
    assert.equal(verificationFacts.completion.step.action,'rest');assert.ok(verificationFacts.facts.objects.some(e=>e.id==='printer'));
    assert.equal(b.planIndex,1);assert.equal(b.stage,'action_decide');assert.equal(b.pendingStepEvidence,null);assert.equal(b.job,null);
    assert.equal(b.logs.filter(l=>l.type==='action_outcome').length,1);
  }finally{g.physics.dispose();}
});

test('negative verification preserves the unfinished index and cannot retry indefinitely',async()=>{
  let calls=0;
  const g=new Garden({seedFood:false,providers:provider({verifyStep:async()=>{calls++;return {value:{complete:false,explanation:'The requested result is not established.'}};}})});
  try{
    const b=completedRest(g);for(let i=0;i<3;i++){
      await poll(b);assert.equal(b.stage,'verify_step');await poll(b);assert.equal(b.planIndex,0);assert.equal(b.verificationAttempts,i+1);
      assert.match(b.error,/requested result is not established/);
      if(i<2)assert.equal(b.stage,'awaiting_step_done');
    }
    assert.equal(calls,3);assert.notEqual(b.stage,'awaiting_step_done');assert.notEqual(b.stage,'verify_step');assert.notEqual(b.stage,'complete');
    assert.equal(b.logs.filter(l=>l.type==='action_outcome').length,1);
  }finally{g.physics.dispose();}
});

test('a positive model verdict cannot advance when the matching engine completion is absent or failed',async()=>{
  for(const defect of ['missing','failed','wrong-step']){
    const g=new Garden({seedFood:false,providers:provider()});
    try{
      const b=completedRest(g),id=b.pendingStepEvidence.recordId;
      if(defect==='missing')b.logs=b.logs.filter(l=>l.id!==id);
      if(defect==='failed')b.logs.find(l=>l.id===id).status='failed';
      if(defect==='wrong-step')b.planSteps[0]={action:'dance',seconds:2,label:'Dance instead'};
      await poll(b);await poll(b);
      assert.equal(b.planIndex,0,defect);assert.notEqual(b.stage,'complete',defect);
    }finally{g.physics.dispose();}
  }
});

test('verification completion is discarded after a user supersedes the goal',async()=>{
  let resolveVerification;
  const g=new Garden({seedFood:false,providers:provider({verifyStep:()=>new Promise(resolve=>resolveVerification=resolve)})});
  try{
    const b=completedRest(g);await poll(b);const pending=poll(b);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(typeof resolveVerification,'function');g.assign('actor','Dance near the flowers.');
    resolveVerification({value:{complete:true,explanation:'Old rest completed.'}});await pending;
    assert.equal(b.objective,'Dance near the flowers.');assert.equal(b.stage,'action_plan');assert.equal(b.planIndex,0);assert.equal(b.pendingStepEvidence,null);
    assert.ok(b.logs.some(l=>l.status==='discarded'));
  }finally{g.physics.dispose();}
});

test('pending step evidence and verification attempts survive save and restore',async()=>{
  const p=provider({verifyStep:async()=>({value:{complete:false,explanation:'Needs another check.'}})}),g=new Garden({seedFood:false,providers:p}),restored=new Garden({seedFood:false,providers:provider()});
  try{
    const b=completedRest(g);await poll(b);await poll(b);assert.equal(b.verificationAttempts,1);
    restored.restore(g.save());const next=restored.selected;
    assert.equal(next.stage,'awaiting_step_done');assert.equal(next.planIndex,0);assert.deepEqual(next.pendingStepEvidence,b.pendingStepEvidence);assert.equal(next.verificationAttempts,1);
    await poll(next);await poll(next);assert.equal(next.planIndex,1);assert.equal(next.stage,'complete');assert.equal(next.pendingStepEvidence,null);
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('the scheduler reserves the Gemma slot during verification and does not run reflection concurrently',async()=>{
  let resolveVerification,verifyCalls=0,reflectionCalls=0;
  const g=new Garden({seedFood:false,providers:provider({verifyStep:()=>{verifyCalls++;return new Promise(resolve=>resolveVerification=resolve);},reflect:async()=>{reflectionCalls++;throw Error('Unexpected simultaneous reflection');}})});
  try{
    const b=completedRest(g);await poll(b);b.nextCall=0;b.nextReflection=0;
    const pending=g.poll();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(verifyCalls,1);assert.equal(g.slots.gemma,true);assert.equal(reflectionCalls,0);
    await g.poll();assert.equal(verifyCalls,1);
    resolveVerification({value:{complete:true,explanation:'Verified against the completed engine record.'}});await pending;
    assert.equal(g.slots.gemma,false);assert.equal(b.stage,'complete');assert.equal(b.planIndex,1);
  }finally{g.physics.dispose();}
});

test('repeated Check choices verify the same completed printer approach once before beginning the flower print',async()=>{
  const completionChoices=[],evidenceIds=[];let verificationCalls=0;
  const g=new Garden({seedFood:false,providers:provider({
    decide:async(_state,_question,choices)=>{
      if(choices.done){completionChoices.push(Object.keys(choices));return {response:{choice:'check'}};}
      return {response:{choice:Object.keys(choices)[0]}};
    },
    verifyStep:async(_brain,context)=>{
      verificationCalls++;evidenceIds.push(context.completion.recordId);
      return {value:{complete:verificationCalls>1,explanation:verificationCalls===1?'Check the recorded destination once more.':'The actor reached the printer approach point.'}};
    }
  })});
  try{
    const b=g.selected;b.assign('Print a flower at the idea printer.');
    b.planSteps=[{action:'move',x:-5,z:-.8,label:'Walk to the printer'},{action:'print',label:'Print a flower'}];b.stage='action_decide';
    await poll(b);assert.equal(b.job.action,'move');
    for(let i=0;i<900&&b.stage==='acting';i++)g.step();
    assert.equal(b.stage,'awaiting_step_done');assert.equal(b.planIndex,0);
    const evidence=structuredClone(b.pendingStepEvidence),arrival={...b.actor.body.translation()};
    assert.ok(Math.hypot(arrival.x+5,arrival.z+.8)<.18);
    await poll(b);assert.equal(b.stage,'verify_step');assert.deepEqual(b.pendingStepEvidence,evidence);
    await poll(b);assert.equal(b.stage,'awaiting_step_done');assert.equal(b.planIndex,0);
    ticks(g,180);assert.equal(b.job,null);assert.deepEqual(b.pendingStepEvidence,evidence);
    await poll(b);assert.equal(b.stage,'verify_step');assert.deepEqual(b.pendingStepEvidence,evidence);
    await poll(b);assert.equal(b.stage,'action_decide');assert.equal(b.planIndex,1);
    await poll(b);assert.equal(b.stage,'planning');assert.equal(b.job.action,'print');assert.equal(b.printJob,true);
    assert.deepEqual(evidenceIds,[evidence.recordId,evidence.recordId]);assert.equal(verificationCalls,2);
    assert.ok(completionChoices.every(keys=>keys.length===2&&keys.includes('done')&&keys.includes('check')));
    assert.equal(b.logs.filter(l=>l.type==='action_outcome'&&l.action==='move').length,1);
    assert.equal(b.logs.filter(l=>l.type==='laya'&&l.scope==='activity'&&l.selected==='Walk to the printer').length,1);
  }finally{g.physics.dispose();}
});

test('a stale Rework response cannot discard completed evidence or restart the completed action',async()=>{
  const g=new Garden({seedFood:false,providers:provider({decide:async()=>({response:{choice:'rework'}})})});
  try{
    const b=completedRest(g),evidence=structuredClone(b.pendingStepEvidence);await poll(b);
    assert.equal(b.stage,'awaiting_step_done');assert.equal(b.planIndex,0);assert.equal(b.job,null);
    assert.deepEqual(b.pendingStepEvidence,evidence);assert.match(b.error,/Invalid completion choice/);
    ticks(g,180);assert.equal(b.logs.filter(l=>l.type==='action_outcome').length,1);
  }finally{g.physics.dispose();}
});
