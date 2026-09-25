import test from 'node:test';import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';import {goalCandidates,criticalNeedPlan} from '../autonomy.mjs';import {Providers} from '../providers.mjs';
import {compileDesign} from '../design.mjs';import {validatePlanTargets,validatePlanCoverage} from '../actions.mjs';
const provider=()=>({generator:{ready:true},laya:{ready:true},healthTime:Date.now(),calls:{},actionPlan:async(_b,facts)=>({value:{supported:true,steps:structuredClone(facts.planning.engineProposal.steps)}}),decide:async(state,q,choices)=>({response:{choice:Object.keys(choices)[0]}}),verifyStep:async()=>({value:{complete:true,explanation:'Engine action completed.'}})});
test('Laya selects self goals from needs; user assignment overrides them; needs change during idle',async()=>{const g=new Garden({providers:provider()});try{const b=g.selected;b.needs.energy=40;await b.poll();assert.equal(b.goalSource,'self');assert.match(b.objective,/Rest/);assert.ok(b.logs.some(l=>l.scope==='goal'&&l.status==='accepted'));g.assign('actor','Walk to (2,3).');assert.equal(b.goalSource,'user');assert.equal(b.stage,'action_plan');const before={...b.needs};for(let i=0;i<60;i++)g.step();assert.ok(b.needs.energy<before.energy);assert.ok(b.needs.fun<before.fun);assert.ok(b.needs.hunger>before.hunger);}finally{g.physics.dispose();}});
test('critical energy interruption records the temporary goal and resumes the user plan',async()=>{const g=new Garden({providers:provider()});try{const b=g.selected;g.assign('actor','Walk to (2,3).');b.stage='action_decide';b.planSteps=[{action:'move',x:2,z:3,label:'Walk to (2,3)'}];b.needs.energy=5;await b.poll();assert.equal(b.goalSource,'need interruption');assert.equal(b.stage,'action_decide');assert.equal(b.job,null);b.nextCall=0;await b.poll();assert.equal(b.job.action,'rest');for(let i=0;i<430;i++)g.step();assert.equal(b.stage,'awaiting_step_done');assert.equal(b.goalSource,'need interruption');b.nextCall=0;await b.poll();assert.equal(b.stage,'verify_step');b.nextCall=0;await b.poll();assert.equal(b.goalSource,'user');assert.equal(b.objective,'Walk to (2,3).');assert.equal(b.stage,'action_decide');assert.equal(b.suspendedGoal,null);assert.ok(b.needs.energy>20);assert.ok(b.logs.some(l=>l.status==='resumed'));}finally{g.physics.dispose();}});
test('no-resource hunger stays unmet and does not propose printing or eating imaginary food',()=>{const g=new Garden();try{const b=g.selected;b.needs.hunger=95;g.physics.entities.get('berries').servings=0;const goals=goalCandidates(b);assert.ok(goals.some(x=>x.id==='explain'));assert.ok(!goals.some(x=>x.steps.some(a=>a.action==='eat'||a.action==='print')));const before=b.needs.hunger;for(let i=0;i<60;i++)g.step();assert.ok(b.needs.hunger>=before);}finally{g.physics.dispose();}});
test('slow Gemma action does not block another actor’s Laya and user work outranks idle reflection',async()=>{let finishPlan,planCalls=0,layaCalls=0,reflectionCalls=0;const p=provider();p.actionPlan=()=>{planCalls++;return new Promise(r=>finishPlan=r);};p.decide=async(s,q,choices)=>{layaCalls++;return {response:{choice:Object.keys(choices)[0]}};};p.reflect=async()=>{reflectionCalls++;throw Error('Should not reflect while user action work is queued');};const g=new Garden({providers:p,cast:'ensemble'});try{g.assign('actor','Rest briefly.');const pip=g.brains.get('pip');pip.stage='action_decide';pip.planSteps=[{action:'dance',label:'Dance',seconds:2}];g.brains.get('june').stage='idle';for(const b of g.brains.values())b.nextReflection=0;const pending=g.poll();await new Promise(r=>setImmediate(r));assert.equal(planCalls,1);assert.equal(layaCalls,1);assert.equal(pip.stage,'acting');assert.equal(reflectionCalls,0);await g.poll();assert.equal(planCalls,1);finishPlan({value:{supported:true,explanation:'',steps:[{action:'rest',label:'Rest briefly',seconds:2}]}});await pending;}finally{g.physics.dispose();}});
test('provider activity is keyed by actor/provider/token and one completion cannot clear another',async()=>{const original=globalThis.fetch,p=new Providers(),resolvers=[];globalThis.fetch=(url,args)=>new Promise(resolve=>resolvers.push({url,resolve}));try{p.generatorOwner='actor';p.generatorPurpose='action';const gen=p.generate('system','prompt',{type:'object'},50);p.layaOwner='pip';const decision=p.decide('state','question',{a:'Act',b:'Wait'},'test');assert.deepEqual(new Set(Object.values(p.activeRequests).map(r=>r.kind)),new Set(['gemma','laya']));assert.equal(Object.values(p.activeRequests).find(r=>r.kind==='laya').actorId,'pip');resolvers.find(r=>r.url.includes('/api/decide')).resolve({ok:true,json:async()=>({results:{test:{do:{choice:'a'}}}})});await decision;assert.deepEqual(Object.values(p.activeRequests).map(r=>r.kind),['gemma']);resolvers.find(r=>r.url.includes('/api/chat')).resolve({ok:true,json:async()=>({message:{content:'{}'}})});await gen;assert.deepEqual(p.activeRequests,{});}finally{globalThis.fetch=original;}});

const orange=await compileDesign({name:'Clementine',description:'One edible clementine.',kind:'prop',mass:.2,affordances:['display'],attributes:{edible:true,servings:1},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),new THREE.MeshToonMaterial({color:0xff9933})));return g;'});
orange.material='food';
function foodAt(g,name,x,z){return g.physics.add({...structuredClone(orange),name},{x,y:.3,z});}

test('urgent hunger offers only actual nearest food, using its name and respecting ownership and reservations',()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{const b=g.selected,p=b.actor.body.translation(),near=foodAt(g,'Clementine',p.x+1,p.z),far=foodAt(g,'Lunch pear',p.x+5,p.z);b.needs={hunger:95,energy:40,fun:5};
    let goals=goalCandidates(b);assert.deepEqual(goals.map(goal=>goal.id),['eat']);assert.match(goals[0].text,/Clementine/);assert.doesNotMatch(goals[0].text,/berries/);assert.deepEqual(goals[0].steps.map(a=>a.action),['eat']);assert.equal(goals[0].steps[0].target,near.id);
    g.reservations.set(near.id,'other');goals=goalCandidates(b);assert.match(goals[0].text,/Lunch pear/);assert.deepEqual(goals[0].steps.map(a=>a.action),['approach','eat']);assert.ok(goals[0].steps.every(a=>a.target===far.id));
    g.reservations.set(near.id,'actor');assert.equal(goalCandidates(b)[0].steps.at(-1).target,near.id);near.carrier='other';assert.equal(goalCandidates(b)[0].steps.at(-1).target,far.id);
    far.servings=0;assert.equal(goalCandidates(b)[0].id,'print_food');
  }finally{g.physics.dispose();}
});

test('critical energy excludes wandering and substantial unmet needs stay ahead of leisure',()=>{
  const g=new Garden({providers:provider()});try{const b=g.selected;b.needs={hunger:95,energy:5,fun:0};assert.deepEqual(goalCandidates(b).map(g=>g.id),['rest']);assert.deepEqual(criticalNeedPlan(b),goalCandidates(b)[0]);
    b.needs={hunger:70,energy:60,fun:0};assert.deepEqual(goalCandidates(b).map(g=>g.id),['eat','rest']);
    b.needs={hunger:25,energy:30,fun:0};assert.deepEqual(goalCandidates(b).map(g=>g.id),['rest']);
  }finally{g.physics.dispose();}
});

test('no food with an available printer proposes a valid print then eat binding without satisfying hunger',async()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{const b=g.selected;b.needs.hunger=95;const before=structuredClone(b.needs),entities=[...g.physics.entities.keys()],goal=goalCandidates(b)[0];
    assert.equal(goal.id,'print_food');assert.deepEqual(goal.steps.map(a=>a.action),['print','eat']);assert.equal(goal.steps[1].target,'$step1');assert.match(goal.steps[0].label,/edible.*one serving.*food/);assert.equal(validatePlanTargets(g,goal.steps),true);assert.equal(validatePlanCoverage(goal.text,goal.steps),true);assert.deepEqual(criticalNeedPlan(b),goal);assert.deepEqual(b.needs,before);assert.deepEqual([...g.physics.entities.keys()],entities);
    await b.poll();assert.equal(b.goalSource,'self');assert.equal(b.objective,goal.text);assert.equal(b.stage,'action_plan');assert.deepEqual(b.selfGoalProposal,goal);assert.deepEqual(b.planSteps,[]);b.nextCall=0;await b.poll();assert.deepEqual(b.planSteps,goal.steps);assert.equal(b.needs.hunger,95);assert.deepEqual([...g.physics.entities.keys()],entities);
  }finally{g.physics.dispose();}
});

test('unavailable resources explain the concrete blocker and cannot repeatedly interrupt a user goal',()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{const b=g.selected;b.needs.hunger=95;g.printerOwner='other';let goals=goalCandidates(b);assert.deepEqual(goals.map(g=>g.id),['explain']);assert.match(goals[0].text,/printer.*another character/);assert.ok(goals[0].steps.every(s=>s.action==='ask_for_help'));assert.equal(criticalNeedPlan(b),null);
    g.printerOwner=null;b.providers.generator.ready=false;goals=goalCandidates(b);assert.match(goals[0].text,/generator is unavailable/);assert.equal(criticalNeedPlan(b),null);assert.equal(b.needs.hunger,95);
  }finally{g.physics.dispose();}
});

test('critical interruptions leave imminent user eating and rest plans in charge of their own resources',async()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{const b=g.selected,p=b.actor.body.translation(),food=foodAt(g,'Planned clementine',p.x+1,p.z);g.assign('actor','Print one small edible orange and then eat it.');b.needs.hunger=100;b.planSteps=[{action:'print',label:'Print edible orange'},{action:'eat',target:food.id,label:'Eat printed orange'}];b.planIndex=1;b.stage='action_decide';
    assert.equal(criticalNeedPlan(b),null);await b.poll();assert.equal(b.goalSource,'user');assert.equal(b.suspendedGoal,null);assert.equal(b.job.action,'eat');assert.equal(b.job.target,food.id);assert.equal(food.servings,1);
    b.planSteps=[{action:'approach',target:'printer'},{action:'print'},{action:'approach',target:'$step2'},{action:'eat',target:'$step2'}];b.planIndex=0;assert.equal(criticalNeedPlan(b),null);
    b.planSteps=[{action:'print'},{action:'eat',target:'$step1'}];assert.equal(criticalNeedPlan(b),null);
    b.planSteps=[{action:'dance'},{action:'eat',target:food.id}];assert.equal(criticalNeedPlan(b).id,'eat');
    b.needs.hunger=20;b.needs.energy=5;b.planSteps=[{action:'approach',target:'bed'},{action:'use',target:'bed',use:'rest'}];assert.equal(criticalNeedPlan(b),null);b.planSteps[1].target='different-bed';assert.equal(criticalNeedPlan(b).id,'rest');b.planSteps=[{action:'rest'}];assert.equal(criticalNeedPlan(b),null);
  }finally{g.physics.dispose();}
});

test('hunger at 100 does not steal the verified object between a user print step and its eating step',async()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{const b=g.selected;g.assign('actor','Print one edible orange and then eat it.');b.needs.hunger=100;b.planSteps=[{action:'print',label:'Print one edible orange'},{action:'eat',target:'$step1',label:'Eat the orange'}];b.planIndex=0;b.stage='action_decide';
    await b.poll();assert.equal(b.goalSource,'user');assert.equal(b.job.action,'print');b.pendingDesign=structuredClone(orange);b.stage='printing';b.stageUntil=b.time;g.step();const id=b.pendingStepEvidence.job.createdEntityId;
    b.nextCall=0;await b.poll();b.nextCall=0;await b.poll();assert.equal(b.planIndex,1);assert.equal(b.stepResults[0].entityId,id);b.nextCall=0;await b.poll();assert.equal(b.goalSource,'user');assert.equal(b.suspendedGoal,null);assert.equal(b.job.action,'approach');assert.equal(b.job.target,id);assert.equal(g.physics.entities.get(id).servings,1);
  }finally{g.physics.dispose();}
});
