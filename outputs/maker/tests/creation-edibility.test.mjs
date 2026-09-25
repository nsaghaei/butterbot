import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {MakerWorld} from '../world.mjs';

const proposal=(edible=true,overrides={})=>({name:edible?'Small edible orange':'Decorative orange',description:edible?'A small orange with one edible serving.':'A small orange-shaped decorative sculpture.',kind:'prop',mass:.15,affordances:['display'],attributes:{portable:true,anchored:false,edible,servings:edible?1:0,throwable:true,maxThrowSpeed:4,giftable:true,pushable:true},code:'const g=new THREE.Group();const fruit=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),new THREE.MeshToonMaterial({color:0xff9328}));fruit.name="orange";g.add(fruit);return g;',...overrides});
const plan=edible=>({id:'a',label:edible?'A small edible orange to give as a gift':'An orange-shaped polymer sculpture',kind:'prop',interaction:'display',edible});
const poll=async brain=>{brain.nextCall=0;await brain.poll();};
const ticks=(garden,n)=>{for(let i=0;i<n;i++)garden.step();};
function providers({edible=true,design=()=>proposal(edible)}={}){
  const calls={topics:[],designs:0};
  return {provider:'offline fixture',healthTime:Date.now(),generator:{ready:true},laya:{ready:true},calls,
    plan:async()=>({value:{plans:[plan(edible),{...plan(edible),id:'b',label:'Another small orange'}]}}),
    decide:async(_state,_question,choices)=>({response:{choice:choices.a?'a':choices.print?'print':choices.approach?'approach':assert.fail('Unexpected choice '+JSON.stringify(choices))}}),
    question:async world=>{const topic=world.questionTopics[world.answers.length];calls.topics.push(topic);return {value:{topic,text:'Choose the '+topic,choices:[{id:'a',label:topic==='material'?'Polymer':'Simple',value:topic==='material'?'polymer':'simple'},{id:'b',label:topic==='material'?'Wood':'Rounded',value:topic==='material'?'wood':'rounded'}]}};},
    design:async world=>{calls.designs++;return {value:design(world)};}
  };
}
function startGift(garden,edible=true){
  const b=garden.selected;garden.assign('actor',edible?'Print a small edible orange, pick it up, and give it to Pip.':'Print a decorative orange, pick it up, and give it to Pip.');
  b.planSteps=[{action:'print',label:edible?'Print a small edible orange':'Print a decorative orange'},{action:'pick_up',target:'$step1',label:'Pick up the orange'},{action:'give',target:'$step1',recipient:'pip',label:'Give the orange to Pip'}];b.planIndex=0;b.startAction(b.planSteps[0]);return b;
}
async function selectPlan(brain){await poll(brain);assert.equal(brain.stage,'choose_plan');await poll(brain);assert.equal(brain.stage,'ready');}
async function createPreview(garden,brain){
  await poll(brain);assert.equal(brain.stage,'approaching');
  for(let frame=0;frame<1800&&brain.stage==='approaching';frame++)garden.step();
  assert.equal(brain.stage,'needs_question',brain.error);
  for(let attempt=0;attempt<12&&brain.stage!=='review';attempt++)await poll(brain);
  assert.equal(brain.stage,'review',brain.error||brain.lastDesignError);assert.equal(brain.review.ok,true);
}

test('choosing an edible gift enforces food through questions, validated creation, and materialization without eating it',async()=>{
  const p=providers(),g=new Garden({cast:'duo',seedFood:false,providers:p});try{
    const b=startGift(g),steps=structuredClone(b.planSteps),hunger=b.needs.hunger;
    assert.deepEqual(b.printRequirements.map(requirement=>requirement.action),['pick_up','give']);
    await selectPlan(b);
    assert.equal(b.plan.edible,true);assert.equal(b.material,'food');assert.deepEqual(b.questionTopics,['form','size','detail']);
    assert.deepEqual(b.printRequirements.map(requirement=>requirement.action),['pick_up','give','eat']);assert.deepEqual(b.planSteps,steps);
    await createPreview(g,b);assert.deepEqual(p.calls.topics,['form','size','detail']);assert.equal(p.calls.designs,1);
    assert.equal(b.pendingDesign.attributes.edible,true);assert.equal(b.pendingDesign.material,'food');assert.equal(b.pendingDesign.attributes.servings,1);assert.equal(b.pendingDesign.attributes.giftable,true);
    await poll(b);assert.equal(b.stage,'preview');ticks(g,490);assert.equal(b.stage,'awaiting_step_done');
    const entity=g.physics.entities.get(b.pendingStepEvidence.job.createdEntityId);assert.ok(entity);assert.equal(entity.edible,true);assert.equal(entity.servings,1);assert.equal(entity.design.material,'food');assert.equal(entity.carried,false);
    assert.deepEqual(b.planSteps,steps);assert.equal(b.planSteps.some(step=>step.action==='eat'),false);assert.ok(b.needs.hunger>=hunger);
    const outcomes=b.logs.filter(record=>record.type==='action_outcome');assert.deepEqual(outcomes.map(record=>record.action),['print']);assert.equal(outcomes[0].needFulfillment,null);
  }finally{g.physics.dispose();}
});

test('decorative orange plans keep ordinary material choice and can create nonedible polymer',async()=>{
  const p=providers({edible:false}),g=new Garden({cast:'duo',seedFood:false,providers:p});try{
    const b=startGift(g,false);await selectPlan(b);assert.equal(b.material,null);assert.ok(b.questionTopics.includes('material'));assert.ok(!b.printRequirements.some(requirement=>requirement.action==='eat'));
    await createPreview(g,b);assert.deepEqual(p.calls.topics,['form','size','material','detail']);assert.equal(b.material,'polymer');assert.equal(b.pendingDesign.material,'polymer');assert.equal(b.pendingDesign.attributes.edible,false);assert.equal(b.pendingDesign.attributes.servings,0);
  }finally{g.physics.dispose();}
});

test('existing future-eat requirements survive legacy selected plans and never duplicate or erase other requirements',()=>{
  for(const edible of [undefined,false,true]){
    const w=new MakerWorld();try{
      w.stage='choose_plan';w.plans=[{...plan(true),edible}];w.printRequirements=[{action:'pick_up'},{action:'give'},{action:'throw',speed:3},{action:'eat'}];const requirements=structuredClone(w.printRequirements);
      w.material='polymer';w.questionTopics=['form','size','material','detail'];w.applyChoice('a',{});
      assert.equal(w.material,'food');assert.deepEqual(w.questionTopics,['form','size','detail']);assert.deepEqual(w.printRequirements,requirements);
      w.stage='choose_plan';w.applyChoice('a',{});assert.deepEqual(w.printRequirements,requirements);
    }finally{w.physics.dispose();}
  }
});

test('a design contradicting the selected edible plan is rejected before printing, preserving the food contract for repair',async()=>{
  const p=providers({design:()=>proposal(false)}),g=new Garden({cast:'duo',seedFood:false,providers:p});try{
    const b=startGift(g);await selectPlan(b);b.stage='needs_design';const entities=g.physics.entities.size;await poll(b);
    assert.equal(b.stage,'needs_design');assert.equal(b.repairCount,1);assert.equal(b.pendingDesign,null);assert.equal(g.physics.entities.size,entities);assert.match(b.lastDesignError,/not edible/);assert.equal(b.material,'food');assert.ok(b.printRequirements.some(requirement=>requirement.action==='eat'));
    assert.equal(b.logs.findLast(record=>record.type==='design').status,'rejected');assert.ok(!b.logs.some(record=>record.type==='creation'));
  }finally{g.physics.dispose();}
});

test('edible selection retains a later throw speed requirement during physical design validation',async()=>{
  const p=providers({design:()=>proposal(true,{attributes:{...proposal().attributes,maxThrowSpeed:2}})}),g=new Garden({seedFood:false,providers:p});try{
    const b=g.selected;g.assign('actor','Print an edible orange, pick it up, then throw it.');b.planSteps=[{action:'print',label:'Print an edible orange'},{action:'pick_up',target:'$step1',label:'Pick up the orange'},{action:'throw',target:'$step1',x:2,z:3,speed:3,label:'Throw it at 3 m/s'}];b.planIndex=0;b.startAction(b.planSteps[0]);
    await selectPlan(b);assert.equal(b.printRequirements.find(requirement=>requirement.action==='throw').speed,3);b.stage='needs_design';await poll(b);
    assert.equal(b.stage,'needs_design');assert.match(b.lastDesignError,/at most 2m\/s/);assert.equal(b.pendingDesign,null);
  }finally{g.physics.dispose();}
});

test('a paused selected edible plan saves and restores its material, topics, and capability requirements',async()=>{
  const p=providers(),g=new Garden({cast:'duo',seedFood:false,providers:p}),restored=new Garden({cast:'duo',seedFood:false,providers:providers()});try{
    const b=startGift(g);await selectPlan(b);g.setPaused(true);const saved=g.save();restored.restore(saved);const next=restored.selected;
    assert.equal(restored.paused,true);assert.equal(next.plan.edible,true);assert.equal(next.material,'food');assert.deepEqual(next.questionTopics,['form','size','detail']);assert.deepEqual(next.printRequirements,b.printRequirements);assert.deepEqual(next.planSteps,b.planSteps);
    const stage=next.stage;await poll(next);assert.equal(next.stage,stage);assert.equal(next.logs.filter(record=>record.type==='creation').length,0);
    restored.setPaused(false);next.stage='needs_design';await poll(next);assert.equal(next.stage,'review');assert.equal(next.pendingDesign.material,'food');assert.equal(next.pendingDesign.attributes.edible,true);
  }finally{g.physics.dispose();restored.physics.dispose();}
});
