import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Garden} from '../garden.mjs';
import {buildDecisionContext} from '../decision-context.mjs';
import {fitDecisionContext,closeTokenizer} from '../token-budget.mjs';

after(closeTokenizer);
const story=JSON.parse(await readFile(new URL('./fixtures/tulip-story-context.json',import.meta.url),'utf8'));
const scene=JSON.parse(await readFile(new URL('./fixtures/reclining-tulip-save.json',import.meta.url),'utf8'));
const retry=JSON.parse(await readFile(new URL('./fixtures/verification-capacity-context.json',import.meta.url),'utf8'));
const completionQuestion='Judge only the current plan step, not the whole objective. Should Gemma confirm or examine its recorded outcome?';
const completionChoices={done:'Done with this step — ask Gemma to verify',check:'Ask Gemma to check this step’s outcome'};
const positionText=p=>[p.x,p.y,p.z].map(n=>String(Number(n.toFixed(1)))).join(',');
function world(){
  const g=new Garden({seedFood:false});g.restore(structuredClone(scene));const b=g.selected;b.assign(story.objective);b.planSteps=structuredClone(story.planSteps);b.needs={...story.needs};
  for(const saved of story.entities){const e=g.physics.entities.get(saved.id);e.body?.setTranslation(saved.position,true);if(e.body)e.body.setRotation(saved.rotation,true);if(saved.servings!==undefined)e.servings=saved.servings;}
  return g;
}
function assertPreserved(context,fit,b){
  assert.equal(fit.tokenBudget.stateLimit,511-fit.tokenBudget.headerTokens);assert.ok(fit.tokenBudget.stateTokens<=fit.tokenBudget.stateLimit);assert.ok(fit.tokenBudget.stateTokens+fit.tokenBudget.headerTokens<512);
  assert.ok(fit.state.includes(story.objective),'The full user objective must reach Laya');
  assert.deepEqual(context.snapshot.goal.canonicalStep,b.planSteps[b.planIndex]);
  assert.equal(context.snapshot.goal.resolvedStep.action,b.planSteps[b.planIndex].action);
  assert.ok(fit.state.startsWith('Current step '+(b.planIndex+1)+'/8: '+b.planSteps[b.planIndex].action));
  for(const object of context.snapshot.objects)assert.ok(fit.state.includes(object.id+' '+object.name+' ('+positionText(object.position)+')'),object.name+' is missing from the catalog');
  for(const key of Object.keys(b.needs))assert.ok(fit.state.includes(key));
  for(const fact of ['1.2kg','size=0.75x1.125x0.5m','portable','anchored=false','throwable','maxThrowSpeed=5'])assert.ok(fit.state.includes(fact),fact);
  assert.ok(fit.tokenBudget.compaction.capabilityObjectIds.includes('item-1'));
  assert.equal(fit.tokenBudget.compaction.allPlanActionsPreserved,true);
  const encodedPlan=fit.state.split(' Plan: ')[1].split('.')[0];let cursor=0;
  for(const planned of b.planSteps){const next=encodedPlan.indexOf(planned.action,cursor);assert.ok(next>=cursor,'The ordered plan lost '+planned.action);cursor=next+planned.action.length;}
  assert.equal(fit.tokenBudget.compaction.textTruncated,false);
  if(b.pendingStepEvidence)assert.ok(fit.state.includes(b.pendingStepEvidence.outcome),'Completion evidence cannot be shortened');
}

test('the actual eight-step tulip story fits the CPU checkpoint tokenizer at every action and completion decision',async()=>{
  const g=world();try{
    const b=g.selected,e=g.physics.entities.get('item-1'),outcomes=['Reached (2.13, 3.73).','Picked up Orange Tulip','Reached (-2.00, 3.00).','Threw Orange Tulip at 2.0 m/s within its limit','Reached (0.00, 3.00).','Picked up Orange Tulip','Reached (2.00, 3.00).','Placed Orange Tulip at (2, 3)'],reports=[];
    assert.equal(g.brains.size,1);assert.equal(g.physics.entities.size,6);assert.equal(b.planSteps.length,8);
    for(let index=0;index<8;index++){
      b.planIndex=index;
      for(const stage of ['action_decide','awaiting_step_done','verify_step']){
        b.stage=stage;const complete=stage!=='action_decide';b.pendingStepEvidence=complete?{outcome:outcomes[index]}:null;
        const held=complete?[1,2,5,6].includes(index):[2,3,6,7].includes(index);e.carried=held;e.carrier=held?'actor':null;
        const context=buildDecisionContext(b),fit=await fitDecisionContext(context,complete?completionQuestion:'Which next action best advances your current objective?',complete?completionChoices:{a0:story.planSteps[index].label,a1:'Ask for help with this step'});
        assertPreserved(context,fit,b);
        const current=story.planSteps[index];if(['move','place','throw'].includes(current.action))assert.ok(fit.state.split('. ')[0].includes('('+current.x+','+current.z+')'));
        if(current.action==='throw')assert.match(fit.state.split('. ')[0],/speed=2m\/s/);
        reports.push(fit.tokenBudget.stateTokens);
      }
    }
    console.log('Eight-step story, 24 actual-tokenizer states:',Math.min(...reports)+'–'+Math.max(...reports),'tokens, each within its measured question budget');
  }finally{g.physics.dispose();}
});

test('compact context retains a canonical created-object reference and its resolved physical identity',async()=>{
  const g=world();try{
    const b=g.selected;b.planSteps[0]={action:'print',label:'Print one Orange Tulip'};b.planSteps[1]={...b.planSteps[1],target:'$step1'};b.stepResults={0:{entityId:'item-1',status:'verified'}};b.planIndex=1;b.stage='action_decide';
    const context=buildDecisionContext(b),fit=await fitDecisionContext(context,'Which next action best advances your current objective?',{a0:'Pick up the printed Orange Tulip',a1:'Ask for help with this step'});
    assertPreserved(context,fit,b);assert.match(fit.state,/pick_up \$step1=item-1/);assert.equal(context.snapshot.goal.canonicalStep.target,'$step1');assert.equal(context.snapshot.goal.resolvedStep.target,'item-1');
  }finally{g.physics.dispose();}
});

test('actual movement, grip, throw and placement outcomes still fit as the story changes the physical world',async()=>{
  const g=world();try{
    const b=g.selected,reports=[];g.mode='live';b.stage='action_decide';
    // The corrected planner retrieves the physical object. Walking to the old
    // guessed landing coordinate may collide with the object after it settles.
    b.planSteps[4]={action:'approach',target:'item-1',label:'Approach the thrown Orange Tulip'};
    // The captured failure above is checked verbatim. Exercise this separate
    // physical story from clear ground, independently of the bed-exit solver.
    const start={x:6,y:1.2,z:8};b.actor.body.setTranslation(start,true);b.actor.body.setNextKinematicTranslation(start);b.actor.rig.resetAt(start);
    const check=async(question,choices,context=buildDecisionContext(b))=>{const fit=await fitDecisionContext(context,question,choices);assertPreserved(context,fit,b);reports.push(fit.tokenBudget.stateTokens);};
    g.providers=b.providers={laya:{ready:true},generator:{ready:true},healthTime:Date.now(),calls:{},
      decide:async(_state,question,choices,_id,context)=>{await check(question,choices,context);return {response:{choice:choices.done?'done':'a0'}};},
      verifyStep:async(_brain,{completion})=>{assert.ok(b.logs.some(l=>l.id===completion.recordId&&l.type==='action_outcome'&&l.status==='completed'));await check(completionQuestion,completionChoices);return {value:{complete:true,explanation:'The physical action has a recorded engine outcome.'}};}
    };
    for(let step=0;step<8;step++){
      for(let attempt=0;attempt<3;attempt++){
        assert.equal(b.stage,'action_decide',b.error);b.nextCall=0;await b.poll();
        for(let frame=0;frame<1800&&['acting','interacting'].includes(b.stage);frame++)g.step();
        if(b.stage==='awaiting_step_done')break;
      }
      assert.equal(b.stage,'awaiting_step_done',b.error);assert.equal(b.planIndex,step);
      b.nextCall=0;await b.poll();assert.equal(b.stage,'verify_step',b.error);
      b.nextCall=0;await b.poll();assert.equal(b.planIndex,step+1,b.error);
    }
    assert.equal(b.stage,'complete');assert.ok(reports.length>=24);
    const tulip=g.physics.entities.get('item-1');assert.ok(Math.hypot(tulip.body.translation().x-2,tulip.body.translation().z-3)<.02);assert.equal(tulip.carried,false);
    console.log('Physical story tokenizer maximum:',Math.max(...reports),'state tokens across',reports.length,'contexts; every full sequence stays below512');
  }finally{g.physics.dispose();}
});

test('irreducible checkpoint overflow is reported with measured budgets rather than truncated objective text',async()=>{
  const g=world();try{
    const b=g.selected;b.objective='Keep every exact detail. '+Array.from({length:500},(_,n)=>'object'+n).join(' ');b.stage='action_decide';
    const context=buildDecisionContext(b);assert.ok(context.variants.every(v=>v.text.includes(b.objective)));
    await assert.rejects(fitDecisionContext(context,'Choose.',{a:'Continue'}),error=>{
      assert.match(error.message,/no facts were silently truncated \(smallest state \d+ tokens; limit \d+; header \d+\)/);
      assert.equal(error.tokenBudget.stateLimit,511-error.tokenBudget.headerTokens);assert.ok(error.tokenBudget.profiles.every(v=>v.stateTokens>error.tokenBudget.stateLimit));return true;
    });
  }finally{g.physics.dispose();}
});

function verificationWorld(){
  const g=world(),b=g.selected;
  for(const key of ['objective','planSteps','planIndex','cycle','goalSource','needs','pendingStepEvidence','verificationAttempts'])b[key]=structuredClone(retry[key]);
  b.stage='awaiting_step_done';b.logs=[structuredClone(retry.outcome),structuredClone(retry.verification)];
  for(const [id,position]of Object.entries(retry.positions))g.physics.entities.get(id).body.setTranslation(position,true);
  return g;
}

test('verbose false verification and both following context-capacity errors fit without becoming physical blockers',async()=>{
  const g=verificationWorld();try{
    const b=g.selected,explanation=retry.verification.result.explanation,errors=['Step not verified: '+explanation,...retry.capacityErrors],counts=[];
    for(const [index,error]of errors.entries()){
      b.error=error;b.verificationAttempts=index+1;
      const context=buildDecisionContext(b),fit=await fitDecisionContext(context,completionQuestion,completionChoices);assertPreserved(context,fit,b);
      assert.equal(context.snapshot.blocker,error,'Complete raw feedback remains in the logged snapshot');assert.equal(context.snapshot.feedback.engineBlocker,null);
      assert.equal(context.snapshot.feedback.verification.explanation,explanation);assert.equal(context.snapshot.feedback.verification.recordId,retry.verification.id);assert.equal(context.snapshot.feedback.verification.attempts,index+1);
      assert.match(fit.state,new RegExp('Verification: unconfirmed, attempt '+(index+1)));assert.ok(!fit.state.includes(explanation));assert.ok(!fit.state.includes(' Blocker: '));
      if(index){assert.equal(context.snapshot.feedback.inference.code,'context_capacity');assert.equal(context.snapshot.feedback.inference.message,error);assert.match(fit.state,/context capacity/);}
      assert.equal(b.error,error);assert.equal(b.logs[1].result.explanation,explanation,'Context fitting never rewrites Gemma audit evidence');counts.push(fit.tokenBudget.stateTokens);
    }
    console.log('Live verification feedback/recovery tokenizer:',counts.join('/'),'state tokens, each within its measured question budget');
  }finally{g.physics.dispose();}
});

test('a real engine blocker and feedback lacking matching current completion evidence cannot be hidden as verification status',()=>{
  const g=verificationWorld();try{
    const b=g.selected;b.error='Orange Tulip is held by another character; do not pick it up.';
    let context=buildDecisionContext(b);assert.equal(context.snapshot.feedback.engineBlocker,b.error);assert.ok(context.variants.every(v=>v.text.includes('Blocker: '+b.error)));
    b.error='Step not verified: '+retry.verification.result.explanation;b.logs[0].cycle--;
    context=buildDecisionContext(b);assert.equal(context.snapshot.feedback.verification,null);assert.equal(context.snapshot.feedback.engineBlocker,b.error);assert.ok(context.variants.every(v=>v.text.includes(b.error)));
    b.logs[0].cycle=b.cycle;b.pendingStepEvidence.stepIndex--;
    context=buildDecisionContext(b);assert.equal(context.snapshot.feedback.verification,null);assert.equal(context.snapshot.feedback.engineBlocker,b.error);
  }finally{g.physics.dispose();}
});
