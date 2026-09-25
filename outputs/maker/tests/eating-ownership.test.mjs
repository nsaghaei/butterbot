import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {accommodationDesigns} from '../needs.mjs';
import {validateAction,validatePlanTargets,validatePlanCoverage,feasibleActions} from '../actions.mjs';
import {goalCandidates,criticalNeedPlan} from '../autonomy.mjs';
import {objectInfo} from '../perception.mjs';

const saved=JSON.parse(await readFile(new URL('./fixtures/reclining-tulip-save.json',import.meta.url),'utf8'));
const tulip=Object.values(saved.designs).find(design=>/tulip/i.test(design.name));
const bowl=await compileDesign(accommodationDesigns().find(item=>item.id==='snack-bowl').proposal);
bowl.material='food';
const noModels={generator:{ready:false},laya:{ready:false},calls:{},activeRequests:{},healthTime:Date.now(),decide:()=>assert.fail('No live Laya calls'),generate:()=>assert.fail('No live Gemma calls')};
const ticks=(garden,count)=>{for(let i=0;i<count;i++)garden.step();};
const outcome=brain=>brain.logs.findLast(record=>record.type==='action_outcome');
const poll=async brain=>{brain.nextCall=0;await brain.poll();};
function fixture({flower=true,food=true,cast='single',providers=noModels}={}){
  const garden=new Garden({seedFood:false,cast,providers});garden.mode='manual';
  const brain=garden.selected;
  for(const b of garden.brains.values())b.mode='manual';
  ticks(garden,90);
  const p=brain.actor.body.translation();
  const add=(design,position)=>{const entity=garden.physics.add(structuredClone(design),position);garden.designs[entity.id]=entity.design;return entity;};
  const held=flower?add(tulip,{x:p.x,y:.3,z:p.z+.8}):null;
  const target=food?add(bowl,{x:p.x+1.2,y:.3,z:p.z+.4}):null;
  ticks(garden,60);
  if(held){garden.physics.carry(held.id,brain.actorId);ticks(garden,12);}
  brain.needs.hunger=70;
  return {garden,brain,held,target};
}
function start(brain,action){brain.goalSource='user';brain.objective=action.label||action.action;brain.planSteps=[action];brain.planIndex=0;brain.pendingStepEvidence=null;brain.startAction(action);return brain.job;}

test('an actual held tulip blocks eating the bowl and offers an explicit drop instead',()=>{
  const {garden:g,brain:b,held,target}=fixture();try{
    const position={...g.physics.position(held)},hunger=b.needs.hunger;
    assert.throws(()=>start(b,{action:'eat',target:target.id}),/Hands are occupied.*explicitly drop or place/);
    assert.equal(b.job,null);assert.notEqual(b.actor.activity,'eat');assert.equal(held.carrier,b.actorId);
    assert.deepEqual({...g.physics.position(held)},position);assert.equal(target.carried,false);assert.equal(target.servings,6);assert.equal(b.needs.hunger,hunger);
    const offered=feasibleActions(g,b);assert.ok(!offered.some(action=>action.action==='eat'&&action.target===target.id));
    assert.ok(offered.some(action=>action.action==='drop'&&action.target===held.id));assert.equal(outcome(b),undefined);
  }finally{g.physics.dispose();}
});

for(const failure of ['throws','does not acquire'])test(`failed food carry ${failure} cannot set foodHeld or consume`,()=>{
  const {garden:g,brain:b,target}=fixture({flower:false});try{
    let attempts=0;g.physics.carry=()=>{attempts++;if(failure==='throws')throw Error('Grip blocked by fixture');};
    const job=start(b,{action:'eat',target:target.id});ticks(g,200);
    assert.equal(attempts,1);assert.equal(job.foodHeld,false);assert.equal(job.effectApplied,false);assert.equal(job.consumedServings,undefined);
    assert.equal(target.servings,6);assert.equal(target.carried,false);assert.equal(outcome(b).status,'failed');assert.equal(outcome(b).needFulfillment,null);assert.ok(b.needs.hunger>=70);
    assert.match(outcome(b).outcome,failure==='throws'?/Grip blocked/:/actual food to be held/);
  }finally{g.physics.dispose();}
});

for(const interruption of ['released','stolen','removed'])test(`food ${interruption} during the meal fails without consumption or reacquisition`,()=>{
  const {garden:g,brain:b,target}=fixture({flower:false,cast:interruption==='stolen'?'duo':'single'});try{
    const job=start(b,{action:'eat',target:target.id});ticks(g,45);assert.equal(job.foodHeld,true);assert.equal(target.carrier,b.actorId);
    if(interruption==='removed')g.physics.remove(target.id);
    else{
      g.physics.release(target.id);
      if(interruption==='stolen'){
        const peer=g.brains.get('pip').actor,p=g.physics.position(target),position={x:p.x+1.5,y:1.2,z:p.z};
        peer.body.setTranslation(position,true);peer.body.setNextKinematicTranslation(position);peer.rig.resetAt(position);
        g.physics.carry(target.id,'pip');
      }
    }
    ticks(g,160);
    assert.equal(job.consumedServings,undefined);assert.equal(job.effectApplied,false);assert.equal(target.servings,6);
    assert.equal(outcome(b).status,'failed');assert.equal(outcome(b).needFulfillment,null);assert.ok(b.needs.hunger>=70);
    assert.equal(b.logs.filter(record=>record.type==='action_outcome').length,1);
    if(interruption==='removed')assert.equal(g.physics.entities.has(target.id),false);
    else assert.equal(target.carrier,interruption==='stolen'?'pip':null);
  }finally{g.physics.dispose();}
});

test('already-held food is consumed once without trying to carry it again',()=>{
  const {garden:g,brain:b,target}=fixture({flower:false});try{
    g.physics.carry(target.id,b.actorId);ticks(g,12);
    g.physics.carry=()=>assert.fail('Food already held must not be reacquired');
    const job=start(b,{action:'eat',target:target.id});assert.equal(job.foodHeld,true);ticks(g,185);
    assert.equal(target.servings,5);assert.equal(target.carried,false);assert.equal(job.consumedServings,1);assert.equal(outcome(b).status,'completed');
    assert.equal(outcome(b).needFulfillment.before.hunger-outcome(b).needFulfillment.after.hunger,28);
    ticks(g,120);assert.equal(target.servings,5);assert.equal(b.logs.filter(record=>record.type==='action_outcome').length,1);
  }finally{g.physics.dispose();}
});

test('edible but anchored or oversized food cannot be eaten or proposed as reachable relief',()=>{
  const {garden:g,brain:b}=fixture({flower:false,food:false});try{
    const p=b.actor.body.translation();
    for(const overrides of [{attributes:{...bowl.attributes,anchored:true}},{dimensions:[2.1,...bowl.dimensions.slice(1)]}]){
      const entity=g.physics.add({...structuredClone(bowl),...overrides},{x:p.x+1,y:.3,z:p.z});
      assert.throws(()=>validateAction(g,b,{action:'eat',target:entity.id}),/Eating requires holding the food/);
      assert.throws(()=>validatePlanTargets(g,[{action:'eat',target:entity.id}]),/Eating requires holding the food/);
      const info=objectInfo(g,entity.id);assert.match(info.blockedActions.eat,/Eating requires holding the food/);assert.ok(!info.availableUses.includes('eat'));
    }
    b.needs.hunger=95;assert.equal(goalCandidates(b)[0].id,'explain');assert.equal(criticalNeedPlan(b),null);
  }finally{g.physics.dispose();}
});

test('critical hunger proposes a real drop prerequisite without moving items or satisfying hunger',()=>{
  const {garden:g,brain:b,held,target}=fixture();try{
    b.needs.hunger=95;const position={...g.physics.position(held)},before={...b.needs},goal=criticalNeedPlan(b);
    assert.deepEqual(goal.steps.map(step=>step.action),['drop','eat']);assert.equal(goal.steps[0].target,held.id);assert.equal(goal.steps[1].target,target.id);
    assert.equal(validatePlanTargets(g,goal.steps),true);assert.equal(validatePlanCoverage(goal.text,goal.steps),true);
    assert.deepEqual(b.needs,before);assert.deepEqual({...g.physics.position(held)},position);assert.equal(held.carrier,b.actorId);assert.equal(target.servings,6);
    b.planSteps=structuredClone(goal.steps);b.planIndex=0;assert.equal(criticalNeedPlan(b),null);
    b.planSteps[0]={action:'place',target:held.id,x:1,z:1};assert.equal(criticalNeedPlan(b),null);
    b.planSteps[0]={action:'drop',target:target.id};assert.equal(criticalNeedPlan(b)?.id,'eat');
    b.planSteps=[{action:'eat',target:target.id}];assert.equal(criticalNeedPlan(b)?.steps[0].target,held.id);
  }finally{g.physics.dispose();}
});

test('holding edible food prefers that serving rather than dropping it for another food',()=>{
  const {garden:g,brain:b,target}=fixture({flower:false});try{
    g.physics.carry(target.id,b.actorId);ticks(g,12);
    const p=b.actor.body.translation();g.physics.add(structuredClone(bowl),{x:p.x+.2,y:.3,z:p.z});
    b.needs.hunger=95;const goal=goalCandidates(b)[0];assert.deepEqual(goal.steps.map(step=>step.action),['eat']);assert.equal(goal.steps[0].target,target.id);
    b.planSteps=goal.steps;b.planIndex=0;assert.equal(criticalNeedPlan(b),null);
  }finally{g.physics.dispose();}
});

test('freeing hands before printed food preserves the correct full-plan object reference',()=>{
  const {garden:g,brain:b,held}=fixture({food:false,providers:{...noModels,generator:{ready:true}}});try{
    b.needs.hunger=95;const goal=goalCandidates(b)[0];assert.equal(goal.id,'print_food');assert.deepEqual(goal.steps.map(step=>step.action),['drop','print','eat']);assert.equal(goal.steps[0].target,held.id);assert.equal(goal.steps[2].target,'$step2');
    assert.equal(validatePlanTargets(g,goal.steps),true);assert.equal(validatePlanCoverage(goal.text,goal.steps),true);assert.equal(held.carrier,b.actorId);
    b.planSteps=goal.steps;b.planIndex=0;assert.equal(criticalNeedPlan(b),null);
    b.planSteps=[goal.steps[0],{action:'approach',target:'printer'},{action:'print'},{action:'approach',target:'$step3'},{action:'eat',target:'$step3'}];assert.equal(criticalNeedPlan(b),null);
    b.planSteps[4].target='$step2';assert.equal(criticalNeedPlan(b)?.id,'print_food');
  }finally{g.physics.dispose();}
});

test('critical hunger still waits for Gemma planning and separate Laya choices before drop then real eating',async()=>{
  let resolvePlan,proposal,plans=0;const audits=[];
  const providers={...noModels,generator:{ready:true},laya:{ready:true},actionPlan:async(_brain,facts)=>{plans++;proposal=structuredClone(facts.planning.engineProposal);return new Promise(resolve=>resolvePlan=resolve);},decide:async(_state,_question,choices)=>({response:{choice:choices.done?'done':Object.keys(choices)[0]}}),verifyStep:async(_brain,evidence)=>{audits.push(evidence.completion);return {value:{complete:true,explanation:'The recorded physical step completed.'}};}};
  const {garden:g,brain:b,held,target}=fixture({providers});try{
    g.mode='autonomous';b.mode='autonomous';
    g.assign(b.actorId,'Walk to (2,3).');b.planSteps=[{action:'move',x:2,z:3,label:'Walk to (2,3)'}];b.planIndex=0;b.stage='action_decide';b.needs.hunger=95;
    const planning=poll(b);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(plans,1);assert.equal(b.goalSource,'need interruption');assert.equal(b.stage,'action_plan');assert.equal(b.job,null);assert.equal(held.carrier,b.actorId);assert.equal(target.servings,6);assert.equal(b.needs.hunger,95);
    assert.deepEqual(proposal.steps.map(step=>step.action),['drop','eat']);resolvePlan({value:{supported:true,steps:proposal.steps}});await planning;
    assert.equal(b.job,null);assert.equal(held.carrier,b.actorId);assert.equal(b.stage,'action_decide');
    await poll(b);assert.equal(b.job.action,'drop');assert.equal(held.carrier,b.actorId);ticks(g,60);assert.equal(held.carried,false);assert.equal(b.stage,'awaiting_step_done');assert.equal(target.servings,6);
    await poll(b);await poll(b);assert.equal(b.planIndex,1);await poll(b);assert.equal(b.job.action,'eat');ticks(g,45);assert.equal(target.carrier,b.actorId);assert.equal(held.carried,false);ticks(g,140);
    assert.equal(target.servings,5);assert.equal(b.stage,'awaiting_step_done');assert.equal(outcome(b).status,'completed');assert.equal(outcome(b).needFulfillment.before.hunger-outcome(b).needFulfillment.after.hunger,28);
    await poll(b);await poll(b);assert.deepEqual(audits.map(entry=>entry.job.action),['drop','eat']);assert.equal(audits[1].job.foodHeld,true);assert.equal(audits[1].job.consumedServings,1);
    assert.equal(b.goalSource,'user');assert.equal(b.objective,'Walk to (2,3).');assert.equal(b.stage,'action_decide');assert.equal(b.suspendedGoal,null);
  }finally{g.physics.dispose();}
});
