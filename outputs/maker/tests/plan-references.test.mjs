import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {Providers} from '../providers.mjs';
import {compileDesign} from '../design.mjs';
import {validatePlanTargets,validatePlanCoverage,validateAction,resolveActionReferences,validatePrintedRequirements,printDependencies} from '../actions.mjs';
import {PRINTER} from '../environment-layout.mjs';

const food=await compileDesign({name:'Edible orange',description:'A small edible orange.',kind:'prop',mass:.35,attributes:{edible:true,servings:1},affordances:['display'],code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(.2,12,8),new THREE.MeshToonMaterial({color:0xff9b30})));return g;'});food.material='food';
const provider=(overrides={})=>({laya:{ready:true},generator:{ready:true},healthTime:Date.now(),calls:{},decide:async(_s,_q,choices)=>({response:{choice:choices.done?'done':'a0'}}),verifyStep:async()=>({value:{complete:true,explanation:'The engine records the exact step outcome.'}}),...overrides});
const ticks=(g,n)=>{for(let i=0;i<n;i++)g.step();};
const poll=async b=>{b.nextCall=0;await b.poll();};
async function verify(b){assert.equal(b.stage,'awaiting_step_done');await poll(b);assert.equal(b.stage,'verify_step');await poll(b);}
function begin(g,steps,objective='Print an edible orange, then eat it.'){g.assign('actor',objective);const b=g.selected;b.planSteps=structuredClone(steps);b.planIndex=0;b.stage='action_decide';return b;}
function materialize(g,design=food){const b=g.selected;b.startAction(b.planSteps[b.planIndex]);assert.equal(b.printJob,true);b.pendingDesign=structuredClone(design);b.stage='printing';b.stageUntil=b.time;g.step();assert.equal(b.stage,'awaiting_step_done');return b.pendingStepEvidence.job.createdEntityId;}
const orangePlan=[{action:'print',label:'Print one edible orange'},{action:'eat',target:'$step1',label:'Eat the printed orange'}];

test('future targets must be well-formed backward references to print steps and still obey known shape rules',()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{
    assert.equal(validatePlanTargets(g,orangePlan),true);
    for(const target of ['$step0','$step9','$step01','$step1x','$step2'])assert.throws(()=>validatePlanTargets(g,[orangePlan[0],{action:'eat',target}]),/reference|earlier print/);
    assert.throws(()=>validatePlanTargets(g,[{action:'eat',target:'$step1'},orangePlan[0]]),/earlier print/);
    assert.throws(()=>validatePlanTargets(g,[{action:'dance'},{action:'eat',target:'$step1'}]),/earlier print/);
    assert.throws(()=>validatePlanTargets(g,[orangePlan[0],{action:'throw',target:'$step1',x:99,z:0,speed:3}]),/inside the garden/);
    assert.throws(()=>validatePlanTargets(g,[orangePlan[0],{action:'throw',target:'$step1',x:2,z:0,speed:11}]),/throw speed/);
    assert.throws(()=>validatePlanTargets(g,[orangePlan[0],{action:'push',target:'$step1',x:2,z:0,strength:4}]),/strength/);
    assert.throws(()=>validatePlanTargets(g,[orangePlan[0],{action:'give',target:'$step1',recipient:'ghost'}]),/existing character/);
    assert.throws(()=>validatePlanTargets(g,[orangePlan[0],{action:'dance',target:'$step1'}]),/does not use/);
  }finally{g.physics.dispose();}
});

test('print completes at materialization and a binding is published only after successful verification',async()=>{
  let accepted=false;const g=new Garden({providers:provider({verifyStep:async()=>({value:{complete:accepted,explanation:accepted?'The created entity exists.':'Need another evidence check.'}})}),seedFood:false});
  try{const b=begin(g,orangePlan),id=materialize(g);assert.ok(g.physics.entities.has(id));assert.equal(b.job,null);assert.equal(b.printJob,false);assert.equal(b.planIndex,0);assert.equal(b.stepResults[0],undefined);assert.equal(b.choices(),null);assert.equal(b.pendingStepEvidence.job.createdEntityId,id);
    await verify(b);assert.equal(b.stage,'awaiting_step_done');assert.equal(b.stepResults[0],undefined);accepted=true;await verify(b);
    assert.equal(b.planIndex,1);assert.equal(b.stepResults[0].entityId,id);assert.equal(b.stepResults[0].status,'verified');assert.equal(b.stepResults[0].creationRecordId,b.logs.find(l=>l.type==='creation').id);assert.equal(b.logs.filter(l=>l.type==='creation').length,1);
    const resolved=resolveActionReferences(g,b,b.planSteps[1]);assert.equal(resolved.target,id);assert.equal(resolved.targetReference,'$step1');assert.equal(b.planSteps[1].target,'$step1');
  }finally{g.physics.dispose();}
});

test('a later eating step approaches and consumes the exact printed object without printing again',async()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{const b=begin(g,orangePlan),id=materialize(g);await verify(b);b.needs.hunger=80;await poll(b);assert.equal(b.job.action,'approach');assert.equal(b.job.target,id);assert.equal(b.job.advance,false);
    for(let i=0;i<1200&&b.stage==='acting';i++)g.step();assert.equal(b.stage,'action_decide');await poll(b);assert.equal(b.job.action,'eat');assert.equal(b.job.target,id);assert.equal(b.job.targetReference,'$step1');ticks(g,185);assert.equal(g.physics.entities.has(id),false);assert.equal(g.designs[id],undefined);assert.equal(b.designs[id],undefined);assert.equal(g.save().designs[id],undefined);assert.equal(b.stage,'awaiting_step_done');await verify(b);
    assert.equal(b.stage,'complete');assert.equal(b.planIndex,2);assert.ok(b.needs.hunger<56);assert.equal(b.logs.filter(l=>l.type==='creation').length,1);const outcome=b.logs.findLast(l=>l.type==='action_outcome'&&l.action==='eat');assert.equal(outcome.target,id);assert.equal(outcome.targetReference,'$step1');assert.ok(Number.isFinite(outcome.jobStart));
  }finally{g.physics.dispose();}
});

test('binding never falls back to activeId, another same-named object, a previous goal or changed source step',async()=>{
  const g=new Garden({providers:provider(),seedFood:false});try{const b=begin(g,orangePlan),id=materialize(g);await verify(b);const duplicate=g.physics.add(structuredClone(food),{x:0,y:1,z:3});b.activeId=duplicate.id;assert.equal(resolveActionReferences(g,b,b.planSteps[1]).target,id);
    const oldCycle=b.stepResults[0].cycle;b.stepResults[0].cycle--;assert.throws(()=>resolveActionReferences(g,b,b.planSteps[1]),/no verified/);b.stepResults[0].cycle=oldCycle;
    b.planSteps[0].label='Print a different object';assert.throws(()=>resolveActionReferences(g,b,b.planSteps[1]),/no verified/);b.planSteps[0].label=orangePlan[0].label;
    g.physics.remove(id);assert.throws(()=>resolveActionReferences(g,b,b.planSteps[1]),/no longer available/);assert.ok(g.physics.entities.has(duplicate.id));b.assign('Eat the other orange.');assert.deepEqual(b.stepResults,{});assert.throws(()=>resolveActionReferences(g,b,{action:'eat',target:'$step1'}),/earlier print/);
  }finally{g.physics.dispose();}
});

test('actual capabilities are checked after binding and downstream eating constrains the creation',async()=>{
  const dependencies=printDependencies(orangePlan,0);assert.deepEqual(dependencies,[{action:'eat'}]);assert.equal(validatePrintedRequirements(food,dependencies),true);
  const plastic={...food,material:'polymer',attributes:{...food.attributes,edible:false,servings:0}};assert.throws(()=>validatePrintedRequirements(plastic,dependencies),/not edible/);assert.throws(()=>validatePrintedRequirements({...food,material:'polymer'},dependencies),/food material/);
  const heavy={...food,mass:150,attributes:{...food.attributes,portable:false,throwable:false,giftable:false}};assert.throws(()=>validatePrintedRequirements(heavy,[{action:'pick_up'}]),/150kg/);
  const g=new Garden({providers:provider(),seedFood:false});try{const b=begin(g,orangePlan);assert.equal(b.printRequirements.length,0);const id=materialize(g);assert.equal(b.material,'food');assert.ok(!b.questionTopics.includes('material'));await verify(b);const e=g.physics.entities.get(id);e.edible=false;e.servings=0;assert.throws(()=>validateAction(g,b,b.planSteps[1]),/not edible/);
  }finally{g.physics.dispose();}
});

test('verified prefix and object results survive suffix replanning, saving and restoration',async()=>{
  let facts;const steps=[{action:'print',label:'Print an orange'},{action:'pick_up',target:'$step1',label:'Pick up orange'},{action:'move',x:2,z:3,label:'Carry to (2,3)'},{action:'drop',target:'$step1',label:'Put it down'}];
  const p=provider({actionPlan:async(_b,f)=>{facts=f;return {value:{supported:true,steps:steps.slice(2)}};}}),g=new Garden({providers:p,seedFood:false}),restored=new Garden({providers:provider(),seedFood:false});
  try{const b=begin(g,steps,'Print an orange, pick up the orange, carry it to (2,3), then put it down.'),id=materialize(g);await verify(b);await poll(b);for(let i=0;i<1200&&b.stage==='acting';i++)g.step();await poll(b);assert.equal(b.job.action,'pick_up');ticks(g,70);await verify(b);assert.equal(b.planIndex,2);assert.equal(g.physics.entities.get(id).carrier,'actor');const prefix=structuredClone(b.planSteps.slice(0,2)),results=structuredClone(b.stepResults);
    b.stage='action_plan';b.planError='Need a remaining route';await poll(b);assert.equal(b.stage,'action_decide');assert.equal(b.planIndex,2);assert.deepEqual(b.planSteps.slice(0,2),prefix);assert.deepEqual(b.stepResults,results);assert.deepEqual(facts.planning.verifiedPrefix,prefix);assert.equal(facts.planning.nextStepNumber,3);
    restored.restore(g.save());assert.deepEqual(restored.selected.stepResults,results);assert.equal(restored.selected.planIndex,2);assert.equal(restored.physics.entities.get(id).carrier,'actor');restored.selected.planIndex=3;assert.equal(validateAction(restored,restored.selected,steps[3]).target,id);
    assert.equal(validatePlanCoverage('Pick up the flower, carry it to (2,3), then put it down.',[{action:'pick_up'},{action:'move',x:2,z:3},{action:'drop'}]),true);assert.throws(()=>validatePlanCoverage('Put it down at (2,3).',[{action:'drop'},{action:'move',x:2,z:3}]),/placing/);assert.throws(()=>validatePlanCoverage('Carry it to (2,3), then put it down.',[{action:'drop'}]),/coordinates/);
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('committed steps offer only their required action or prerequisite and bounded help, despite unrelated suggestions',async()=>{
  let offered;const g=new Garden({providers:provider({decide:async(_s,_q,choices)=>{offered=choices;return {response:{choice:'a0'}};}}),seedFood:false});
  try{const b=begin(g,[{action:'dance',seconds:2,label:'Dance now'}],'Dance, then observe.');b.suggestions=[{action:'move',x:1,z:1,label:'Walk to sunny pad'},{action:'observe',label:'Look around'}];await poll(b);assert.deepEqual(Object.values(offered),['Dance now','Ask for help with this step']);assert.equal(b.job.action,'dance');assert.equal(b.job.advance,true);assert.equal(b.logs.findLast(l=>l.type==='laya').candidateContracts[0].action,'dance');
  }finally{g.physics.dispose();}
});

test('printer prompts scope each creation and action planning explains stable backward references and suffixes',async()=>{
  const p=new Providers(),captured=[];p.generate=async(_system,prompt)=>{captured.push(prompt);return {value:{}};};
  const world={objective:'Print an orange, then print a blue box.',printIntent:'Print a blue box',printRequirements:[{action:'pick_up'}],stateForModel:()=>'',actorName:'Wobble',kind:'prop',interaction:'display',material:'polymer',answers:[],questionTopics:['form'],planSteps:orangePlan,planIndex:1,stepResults:{0:{entityId:'item-1'}}};
  await p.plan(world);await p.question(world);await p.design(world);for(const prompt of captured){assert.match(prompt,/Print a blue box/);assert.match(prompt,/pick_up/);assert.match(prompt,/Print an orange, then print a blue box/);}
  captured.length=0;await p.actionPlan(world,{planning:{verifiedPrefix:[orangePlan[0]],nextStepNumber:2,maxNewSteps:7}});assert.match(captured[0],/ONLY the remaining/);assert.match(captured[0],/target="\$stepN"/);assert.match(captured[0],/does not pick up, place, eat, or use/);
});
