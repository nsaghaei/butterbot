import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {accommodationDesigns} from '../needs.mjs';

const bowl=await compileDesign(accommodationDesigns().find(item=>item.id==='snack-bowl').proposal);
const flower=await compileDesign({name:'Held flower',description:'A small decorative flower.',kind:'prop',mass:.2,affordances:['display'],code:'const root=new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(.2,.5,.2),new THREE.MeshToonMaterial({color:0xf3a641}))); return root;'});
async function poll(brain){brain.nextCall=0;await brain.poll();}
function fixture(correctSecond=true){
  let plans=0,choices=0;const corrections=[];
  const providers={generator:{ready:true},laya:{ready:true},calls:{},activeRequests:{},healthTime:Date.now(),
    actionPlan:async(_brain,facts)=>{corrections.push(facts.correction);plans++;return {value:{supported:true,explanation:'A meal plan',steps:plans>1&&correctSecond?[{action:'drop',target:held.id,label:'Set down the flower'},{action:'eat',target:food.id,label:'Eat the oranges'}]:[{action:'approach',target:food.id,label:'Approach the oranges'},{action:'eat',target:food.id,label:'Eat the oranges'}]}};},
    decide:async()=>{choices++;return {response:{choice:'a0'}};}};
  const garden=new Garden({providers,seedFood:false}),brain=garden.selected;
  for(let i=0;i<30;i++)garden.step();const p=brain.actor.body.translation();
  const held=garden.physics.add(structuredClone(flower),{x:p.x+.2,y:.4,z:p.z+.5}),food=garden.physics.add(structuredClone(bowl),{x:p.x+1.2,y:.3,z:p.z});
  garden.physics.carry(held.id,brain.actorId);brain.assign('Eat one serving of the oranges.');
  return {garden,brain,held,food,corrections,counts:()=>({plans,choices})};
}

test('an occupied-hands plan is corrected by Gemma before Laya can start any movement',async()=>{
  const f=fixture();try{
    const position={...f.brain.actor.body.translation()};await poll(f.brain);
    assert.equal(f.brain.stage,'action_plan');assert.match(f.brain.planError,/drop|place/i);assert.equal(f.brain.planAttempts,1);
    assert.equal(f.brain.job,null);assert.equal(f.held.carrier,'actor');assert.equal(f.food.servings,6);assert.deepEqual({...f.brain.actor.body.translation()},position);assert.deepEqual(f.counts(),{plans:1,choices:0});
    assert.equal(f.brain.logs.filter(r=>r.type==='action_outcome').length,0);
    await poll(f.brain);assert.match(f.corrections[1],/drop|place/i);assert.equal(f.brain.stage,'action_decide');assert.deepEqual(f.brain.planSteps.map(s=>s.action),['drop','eat']);assert.equal(f.held.carrier,'actor');
    await poll(f.brain);assert.equal(f.brain.job.action,'drop');assert.deepEqual(f.counts(),{plans:2,choices:1});assert.equal(f.held.carrier,'actor','choosing the timed drop is not immediate disposal');
    for(let i=0;i<60;i++)f.garden.step();assert.equal(f.held.carried,false);assert.equal(f.brain.logs.findLast(r=>r.type==='action_outcome').action,'drop');assert.equal(f.food.servings,6);
  }finally{f.garden.physics.dispose();}
});

test('repeated plans that ignore occupied hands stop after the bounded three attempts without executing',async()=>{
  const f=fixture(false);try{
    for(let i=0;i<3;i++)await poll(f.brain);
    assert.equal(f.brain.stage,'failed');assert.equal(f.brain.planAttempts,3);assert.deepEqual(f.counts(),{plans:3,choices:0});assert.equal(f.brain.job,null);assert.equal(f.held.carrier,'actor');assert.equal(f.food.servings,6);
    await poll(f.brain);assert.deepEqual(f.counts(),{plans:3,choices:0});assert.equal(f.brain.logs.filter(r=>r.type==='action_outcome').length,0);
  }finally{f.garden.physics.dispose();}
});
