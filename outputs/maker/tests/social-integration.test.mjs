import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {feasibleActions,validateAction,validatePlanTargets,conciseWorld} from '../actions.mjs';
import {goalCandidates} from '../autonomy.mjs';
import {buildDecisionContext} from '../decision-context.mjs';
import {fitDecisionContext,closeTokenizer} from '../token-budget.mjs';
after(closeTokenizer);

test('a new neighbor joining an old single-robot save starts on the current scene clock',()=>{
  const single=new Garden({seedFood:false}),duo=new Garden({cast:'duo',seedFood:false});try{
    single.time=4759;single.selected.time=4759;const saved=single.save();delete saved.cast;
    duo.restore(saved);assert.equal(duo.brains.get('pip').time,4759);duo.step();
    assert.equal(duo.snapshot().actors.find(a=>a.id==='pip').time,duo.time);
  }finally{single.physics.dispose();duo.physics.dispose();}
});

test('two robots expose real social partners, distinct traits, and private memories',async()=>{
  const g=new Garden({cast:'duo',seedFood:false,furnished:true});try{
    const b=g.selected,pip=g.brains.get('pip');assert.equal(g.brains.size,2);assert.notDeepEqual(b.core.traits,pip.core.traits);
    pip.memory=[{id:'private-pip',text:'A private Pip recollection.',kind:'belief'}];
    assert.ok(feasibleActions(g,b).some(a=>a.action==='socialize'&&a.target==='pip'));
    const facts=conciseWorld(g,b),peer=facts.characters.find(c=>c.id==='pip');assert.equal(peer.conversational,true);assert.equal(peer.socialAvailable,true);assert.ok(!JSON.stringify(facts).includes('private-pip'));
    b.needs.social=20;assert.ok(goalCandidates(b).some(goal=>goal.id==='socialize'&&goal.steps[0].target==='pip'));
    b.assign('Chat with Pip about the garden.');b.planSteps=[{action:'socialize',target:'pip',label:'Chat with Pip about the garden'}];b.stage='action_decide';
    const context=buildDecisionContext(b),fit=await fitDecisionContext(context,'Which next action advances this goal?',{a:'Chat with Pip',b:'Ask for help'});
    assert.ok(fit.state.includes('pip Pip'));assert.ok(fit.tokenBudget.stateTokens<=362);assert.ok(!JSON.stringify(context).includes('private-pip'));
    const state=g.snapshot();assert.equal(state.actors.length,2);assert.equal(state.characters.length,2);assert.equal(state.cast,'duo');assert.equal(g.save().cast,'duo');
  }finally{g.physics.dispose();}
});

test('conversation availability protects user work and validates only actual brains',()=>{
  const g=new Garden({cast:'duo',seedFood:false});try{
    const b=g.selected;assert.throws(()=>validatePlanTargets(g,[{action:'socialize',target:'actor'}]),/another real character/);
    assert.throws(()=>validateAction(g,b,{action:'socialize',target:'missing'}),/unavailable/);
    g.assign('pip','Rest for a moment.');assert.ok(!feasibleActions(g,b).some(a=>a.action==='socialize'));
    assert.throws(()=>validateAction(g,b,{action:'socialize',target:'pip'}),/not available/);
    assert.equal(g.brains.get('pip').objective,'Rest for a moment.');
  }finally{g.physics.dispose();}
});

test('reloading an interrupted conversation cancels the exchange without inventing fulfillment',()=>{
  const g=new Garden({cast:'duo',seedFood:false}),restored=new Garden({cast:'duo',seedFood:false});try{
    const b=g.selected;b.assign('Chat with Pip.');b.planSteps=[{action:'socialize',target:'pip',label:'Chat with Pip'}];b.startAction(b.planSteps[0]);
    assert.ok(g.social.forActor('actor'));assert.ok(g.social.forActor('pip'));const saved=g.save(),needs=saved.brains.map(x=>x.needs);
    restored.restore(saved);assert.equal(restored.social.forActor('actor'),null);assert.equal(restored.social.forActor('pip'),null);
    assert.equal(restored.selected.stage,'action_plan');assert.equal(restored.selected.job,null);assert.deepEqual([...restored.brains.values()].map(x=>x.needs),needs);
    assert.ok(restored.social.snapshot().history.some(session=>session.phase==='canceled'));
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('the Garden scheduler preserves a conversation through UI pause and independent step verification',async()=>{
  let acceptance=0,turns=0,audit=null,pausedOnce=false;
  const providers={laya:{ready:true},generator:{ready:true},healthTime:Date.now(),
    decide:async(_state,_question,choices)=>({response:{choice:Object.hasOwn(choices,'a0')?'a0':'done'}}),
    socialAcceptance:async()=>{acceptance++;return {response:{choice:'accept'},choice:'accept'};},
    socialTurn:async speaker=>{turns++;return {value:{speech:speaker.actorName+' enjoys this bright garden.',memory:[]}};},
    verifyStep:async(_brain,evidence)=>{audit=evidence;return {value:{complete:true,explanation:'Both nearby participants delivered their turns and received the recorded effect.'}};}
  };
  const g=new Garden({cast:'duo',seedFood:false,providers});try{
    const b=g.selected,pip=g.brains.get('pip');pip.nextCall=Infinity;pip.nextReflection=Infinity;b.nextReflection=Infinity;
    b.assign('Chat with Pip.');b.planSteps=[{action:'socialize',target:'pip',label:'Chat with Pip'}];b.stage='action_decide';
    for(let frame=0;frame<1500&&b.stage!=='complete'&&b.stage!=='failed';frame++){
      g.step();if(frame%15===0){b.nextCall=0;await g.poll();}
      const session=g.social.forActor('actor');
      if(!pausedOnce&&session?.phase==='speaking'){
        const elapsed=session.elapsed,participation={...session.participation},revisions=[b.revision,pip.revision],positions=g.physics.snapshot().map(e=>e.position);
        g.setPaused(true);for(let i=0;i<120;i++)g.step();await g.poll();
        assert.equal(session.elapsed,elapsed);assert.deepEqual(session.participation,participation);assert.deepEqual(g.physics.snapshot().map(e=>e.position),positions);
        g.setPaused(false);assert.deepEqual([b.revision,pip.revision],revisions);assert.equal(g.social.forActor('actor'),session);pausedOnce=true;
      }
    }
    assert.equal(b.stage,'complete',b.error);assert.equal(pausedOnce,true);assert.equal(b.planIndex,1);assert.equal(acceptance,1);assert.equal(turns,2);
    const proof=audit.completion.job.socialEvidence;assert.equal(proof.status,'completed');assert.equal(proof.effectsApplied,true);assert.equal(proof.transcript.length,2);
    assert.deepEqual(new Set(proof.transcript.map(t=>t.speakerId)),new Set(['actor','pip']));
    assert.ok(proof.needChanges.actor.delta.social>0);assert.ok(proof.needChanges.pip.delta.social>0);
    assert.equal(g.social.snapshot().active.length,0);assert.equal(g.social.snapshot().history.length,1);
    assert.ok(b.logs.some(l=>l.type==='step_verification'&&l.status==='verified'));assert.equal(g.slots.gemma,false);assert.equal(g.slots.laya,false);
  }finally{g.physics.dispose();}
});

test('an explicit approach then chat waits for the moving partner to finish its existing plan',async()=>{
  let accepted=0;
  const providers={laya:{ready:true},generator:{ready:true},healthTime:Date.now(),
    decide:async(_state,_question,choices)=>({response:{choice:Object.hasOwn(choices,'a0')?'a0':'done'}}),
    socialAcceptance:async()=>{accepted++;return {response:{choice:'accept'}};},
    socialTurn:async speaker=>({value:{speech:'Hello from '+speaker.actorName+'.',memory:[]}}),
    verifyStep:async()=>({value:{complete:true,explanation:'The exact recorded action finished.'}})
  };
  const g=new Garden({cast:'duo',seedFood:false,providers});try{
    const b=g.selected,pip=g.brains.get('pip');b.nextReflection=Infinity;pip.nextReflection=Infinity;
    pip.newObjective('display','Walk to the quiet corner.');pip.goalSource='self';pip.planSteps=[{action:'move',x:-4,z:8,label:'Walk to the quiet corner'}];pip.startAction(pip.planSteps[0]);
    b.assign('Approach Pip, then chat with Pip.');b.planSteps=[{action:'approach',target:'pip',label:'Approach Pip'},{action:'socialize',target:'pip',label:'Chat with Pip'}];b.stage='action_decide';
    let waited=false;
    for(let frame=0;frame<1800&&b.stage!=='complete'&&b.stage!=='failed';frame++){
      g.step();waited||=g.social.forActor('actor')?.phase==='waiting';
      if(frame%15===0){b.nextCall=0;pip.nextCall=0;await g.poll();}
    }
    assert.equal(b.stage,'complete',b.error);assert.equal(b.planIndex,2);assert.equal(waited,true);assert.equal(accepted,1);
    assert.ok(pip.logs.some(l=>l.type==='action_outcome'&&l.action==='move'&&l.status==='completed'));
    assert.ok(pip.logs.some(l=>l.type==='step_verification'&&l.status==='verified'));
    assert.equal(g.social.snapshot().history.at(-1).phase,'complete');
  }finally{g.physics.dispose();}
});
