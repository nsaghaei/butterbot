import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign,validateProposal} from '../design.mjs';
import {objectInfo,worldObjects} from '../perception.mjs';
import {conciseWorld,validateAction,validatePlanTargets} from '../actions.mjs';
import {buildDecisionContext} from '../decision-context.mjs';

const proposal={name:'Copper display cube',description:'A small copper cube with a flat top, intended for display.',kind:'prop',mass:1,affordances:['display'],code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshToonMaterial({color:0xb87333})));return g;'};
const design=await compileDesign(proposal);
const mock={generator:{ready:true},laya:{ready:true},healthTime:Date.now(),calls:{},decide:async(_s,_q,choices)=>({response:{choice:choices.done?'done':'a0'}}),verifyStep:async()=>({value:{complete:true,explanation:'The recorded inspection establishes this step.'}})};
function addObject(g,position={x:3,y:.4,z:4}){const e=g.physics.add(design,position);g.designs[e.id]=design;return e;}
function ticks(g,n){for(let i=0;i<n;i++)g.step();}
async function selectNext(b){b.nextCall=0;await b.poll();}

test('object names and descriptions survive compilation, snapshots and saved-world restoration',()=>{
  const g=new Garden({seedFood:false,providers:mock}),restored=new Garden({seedFood:false,providers:mock});
  try{
    const e=addObject(g);ticks(g,60);
    assert.equal(e.design.name,proposal.name);assert.equal(e.design.description,proposal.description);
    assert.equal(objectInfo(g,e.id).descriptionSource,'creator');
    assert.equal(g.snapshot().entities.find(x=>x.id===e.id).description,proposal.description);
    restored.restore(g.save());
    assert.equal(objectInfo(restored,e.id).description,proposal.description);
    assert.equal(objectInfo(restored,e.id).name,proposal.name);
    assert.deepEqual(objectInfo(restored,e.id).position,objectInfo(g,e.id).position);
    assert.match(validateProposal({...proposal,description:undefined}).description,/Supported interactions: display/);
    assert.throws(()=>validateProposal({...proposal,description:'x'.repeat(241)}),/240/);
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('every known object name and xyz appear in all canonical decision variants and Gemma sees descriptions',()=>{
  const g=new Garden({seedFood:false,providers:mock});
  try{
    addObject(g,{x:8,y:.4,z:7});addObject(g,{x:-8,y:.4,z:7});
    const objects=worldObjects(g),context=buildDecisionContext(g.selected),facts=conciseWorld(g,g.selected);
    assert.equal(context.snapshot.objects.length,4);
    for(const object of objects){
      const snapshot=context.snapshot.objects.find(x=>x.id===object.id),fact=facts.objects.find(x=>x.id===object.id);
      assert.deepEqual(snapshot.position,object.position);assert.equal(fact.description,object.description);
      for(const variant of context.variants){
        assert.ok(variant.text.includes(object.name));
        assert.ok(variant.text.includes('('+[object.position.x,object.position.y,object.position.z].map(n=>n.toFixed(1)).join(',')+')'));
      }
    }
  }finally{g.physics.dispose();}
});

test('distant inspect first approaches physically without advancing the plan, then observes for two seconds',async()=>{
  const g=new Garden({seedFood:false,providers:mock});
  try{
    const e=addObject(g);ticks(g,60);const b=g.selected,start={...b.actor.body.translation()};
    b.assign('Inspect the copper display cube');b.planSteps=[{action:'inspect',target:e.id,label:'Inspect the copper display cube'}];b.stage='action_decide';
    await selectNext(b);assert.equal(b.job.action,'approach');assert.equal(b.job.advance,false);
    for(let i=0;i<600&&b.stage==='acting';i++)g.step();
    assert.equal(b.stage,'action_decide');assert.equal(b.planIndex,0);
    assert.ok(Math.hypot(b.actor.body.translation().x-start.x,b.actor.body.translation().z-start.z)>1);
    await selectNext(b);assert.equal(b.job.action,'inspect');assert.equal(b.job.seconds,2);
    ticks(g,90);assert.equal(b.lastInspection,undefined);assert.equal(b.stage,'acting');
    ticks(g,35);assert.equal(b.stage,'awaiting_step_done');assert.equal(b.planIndex,0);await selectNext(b);assert.equal(b.stage,'verify_step');await selectNext(b);assert.equal(b.stage,'complete');assert.equal(b.planIndex,1);
    assert.equal(b.lastInspection.description,proposal.description);assert.deepEqual(b.lastInspection.affordances,['display']);
    assert.ok(b.logs.some(l=>l.type==='inspection'&&l.status==='observed'));
    assert.match(b.logs.findLast(l=>l.type==='action_outcome').outcome,/Supported uses: display/);
    assert.equal(b.nextReflection,0);assert.deepEqual(b.memory,[]);
  }finally{g.physics.dispose();}
});

test('inspection persists through save/resume and reflection can choose to remember verified knowledge',async()=>{
  let reflectionFacts;
  const provider={...mock,reflect:async(_b,facts)=>{reflectionFacts=facts;return {value:{thought:'That cube is useful as a display object.',speech:'',memory:[{operation:'remember',id:'',kind:'experience',text:'Copper display cube: a small copper cube for display.'}],proposedActions:[]}};}};
  const g=new Garden({seedFood:false,providers:provider}),restored=new Garden({seedFood:false,providers:provider});
  try{
    const e=addObject(g,{x:.3,y:.4,z:3});ticks(g,60);const b=g.selected;
    b.assign('Inspect the cube');b.planSteps=[{action:'inspect',target:e.id,label:'Inspect cube'}];b.startAction(b.planSteps[0]);
    ticks(g,60);assert.equal(b.lastInspection,undefined);restored.restore(g.save());
    assert.equal(restored.selected.job.action,'inspect');ticks(restored,50);assert.equal(restored.selected.lastInspection,undefined);
    ticks(restored,15);assert.equal(restored.selected.lastInspection.description,proposal.description);
    await restored.selected.reflect('Inspected an object');
    assert.equal(reflectionFacts.lastInspection.name,proposal.name);assert.equal(reflectionFacts.lastInspection.description,proposal.description);
    assert.deepEqual(reflectionFacts.lastInspection.affordances,['display']);assert.equal(restored.selected.memory.length,1);
    assert.equal(objectInfo(restored,e.id).description,proposal.description);
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('fixed fixtures reject pickup, eating and invented uses at both plan and commit validation',()=>{
  const g=new Garden({seedFood:false,providers:mock});
  try{for(const target of ['printer','planter'])for(const action of ['pick_up','eat','use']){
    const step={action,target,use:'drive'};
    assert.throws(()=>validateAction(g,g.selected,step),/fixture|supported/);
    assert.throws(()=>validatePlanTargets(g,[step]),/fixture|supported|unavailable/);
  }}finally{g.physics.dispose();}
});

test('printer approach reaches a position from which its description can actually be inspected',()=>{
  const g=new Garden({seedFood:false,providers:mock});
  try{
    const b=g.selected;b.startAction({action:'approach',target:'printer'});
    const destination={...b.actor.goal};b.actor.body.setTranslation({x:destination.x,y:1.2,z:destination.z},true);
    assert.doesNotThrow(()=>validateAction(g,b,{action:'inspect',target:'printer'}));
  }finally{g.physics.dispose();}
});

test('fresh unfurnished garden has one robot actor, no created props, empty memories and no stale work',()=>{
  const g=new Garden({seedFood:false,providers:mock});
  try{
    assert.equal(g.brains.size,1);assert.equal(g.physics.entities.size,1);assert.equal(g.selected.actorName,'Butterbot');
    assert.equal(g.selected.actor.height,2.3);assert.deepEqual(g.selected.memory,[]);assert.equal(g.selected.job,null);
    assert.equal(g.selected.stage,'goal_select');assert.equal(g.printerOwner,null);assert.deepEqual(g.queue,[]);
    assert.deepEqual(g.designs,{});assert.equal(g.reservations.size,0);assert.equal(g.selected.lastInspection,undefined);
    assert.ok(worldObjects(g).every(o=>o.kind==='fixture'));
  }finally{g.physics.dispose();}
});
