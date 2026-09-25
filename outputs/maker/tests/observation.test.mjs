import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {ACTIONS,LANDMARKS,feasibleActions,conciseWorld,validateAction} from '../actions.mjs';

const design=await compileDesign({name:'Observation marker',description:'A small blue cube that serves as a visible marker.',kind:'prop',mass:1,affordances:['display'],code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshToonMaterial({color:0x3366cc})));return g;'});
function provider(){return {generator:{ready:false},laya:{ready:false},healthTime:Date.now(),calls:{},decide:async()=>{throw Error('Observation tests must not call a model');}};}
function garden(){return new Garden({seedFood:false,providers:provider()});}
function ticks(g,n){for(let i=0;i<n;i++)g.step();}
function add(g,position){const e=g.physics.add(design,position);g.designs[e.id]=design;return e;}
function startObservation(g){const b=g.selected;b.assign('Observe my surroundings.');b.planSteps=[{action:'observe',label:'Observe my surroundings',seconds:2}];b.stage='action_decide';b.startAction(b.planSteps[0]);return b;}
function positionActor(g,position){g.selected.actor.body.setTranslation(position,true);g.selected.actor.rig.resetAt(position);}

test('observe is offered as a supported two-second action and its engine outcome still needs step confirmation',()=>{
  const g=garden();
  try{
    assert.ok(ACTIONS.includes('observe'));
    const option=feasibleActions(g,g.selected).find(a=>a.action==='observe');assert.ok(option);assert.equal(option.seconds,2);
    assert.doesNotThrow(()=>validateAction(g,g.selected,option));
    const b=startObservation(g);assert.equal(b.stage,'acting');assert.equal(b.job.action,'observe');
    ticks(g,119);assert.equal(b.lastObservation,undefined);assert.equal(b.stage,'acting');
    ticks(g,3);assert.ok(b.lastObservation);assert.equal(b.stage,'awaiting_step_done');assert.equal(b.planIndex,0);assert.equal(b.job,null);
    assert.equal(b.pendingStepEvidence.job.action,'observe');
    const observed=b.logs.find(l=>l.type==='observation');assert.equal(observed.status,'observed');
    assert.ok(b.logs.some(l=>l.id===b.pendingStepEvidence.recordId&&l.type==='action_outcome'&&l.status==='completed'));
    ticks(g,180);assert.equal(b.logs.filter(l=>l.type==='observation').length,1);assert.equal(b.planIndex,0);
  }finally{g.physics.dispose();}
});

test('observation includes nearby object descriptions and characters while excluding objects and characters outside six meters',()=>{
  const g=garden();
  try{
    positionActor(g,{x:0,y:1.2,z:-2});
    const near=add(g,{x:3,y:.3,z:-2}),far=add(g,{x:10,y:.3,z:8});
    const friend=g.physics.character('near_friend',{x:2,y:1.2,z:-1});friend.name='Bram';
    const distant=g.physics.character('far_friend',{x:10,y:1.2,z:8});distant.name='Fern';
    startObservation(g);ticks(g,125);const observation=g.selected.lastObservation;
    assert.equal(observation.radius,6);assert.ok(Math.hypot(observation.position.x-g.selected.actor.body.translation().x,observation.position.z-g.selected.actor.body.translation().z)<.01);
    const marker=observation.objects.find(o=>o.id===near.id);assert.ok(marker);assert.equal(marker.name,design.name);
    assert.equal(marker.kind,'prop');assert.equal(marker.description,design.description);assert.deepEqual(marker.affordances,['display']);
    assert.ok(marker.distance>0&&marker.distance<=6);assert.ok(!observation.objects.some(o=>o.id===far.id));
    assert.ok(observation.objects.some(o=>o.id==='printer'));assert.ok(!observation.objects.some(o=>o.id==='planter'));
    const character=observation.characters.find(c=>c.id===friend.id);assert.ok(character);assert.equal(character.name,'Bram');
    assert.ok(character.distance<=6);assert.ok(!observation.characters.some(c=>c.id===distant.id||c.id==='actor'));
    assert.deepEqual(observation.landmarks,LANDMARKS);assert.deepEqual(observation.bounds,{x:[-13,13],z:[-12,12]});
  }finally{g.physics.dispose();}
});

test('observation records current positions, held inventory and printer availability without rewriting an earlier observation',()=>{
  const g=garden();
  try{
    const marker=add(g,{x:2,y:.3,z:3}),held=add(g,{x:-.5,y:.3,z:3});ticks(g,45);startObservation(g);g.physics.carry(held.id,'actor');
    g.printerOwner='actor';g.queue=['waiting_character'];ticks(g,123);
    const first=structuredClone(g.selected.lastObservation),oldPosition={...first.objects.find(o=>o.id===marker.id).position};
    assert.deepEqual(first.held,[held.id]);assert.deepEqual(first.printerAvailability,{owner:'actor',queue:['waiting_character']});
    marker.body.setTranslation({x:4,y:.3,z:2},true);marker.body.setLinvel({x:0,y:0,z:0},true);
    g.printerOwner=null;g.queue=[];startObservation(g);ticks(g,123);const next=g.selected.lastObservation,current=next.objects.find(o=>o.id===marker.id);
    assert.ok(Math.hypot(current.position.x-oldPosition.x,current.position.z-oldPosition.z)>1);
    const physical=g.physics.position(marker);assert.ok(Math.hypot(current.position.x-physical.x,current.position.z-physical.z)<.01);
    assert.deepEqual(next.printerAvailability,{owner:null,queue:[]});
    assert.ok(next.observedAt>first.observedAt);assert.deepEqual(first.objects.find(o=>o.id===marker.id).position,oldPosition);
    const observations=g.selected.logs.filter(l=>l.type==='observation');assert.equal(observations.length,2);
  }finally{g.physics.dispose();}
});

test('saved observations persist independently of later world changes and are included in model facts',()=>{
  const g=garden(),restored=garden();
  try{
    const e=add(g,{x:2,y:.3,z:3});startObservation(g);ticks(g,125);const observed=structuredClone(g.selected.lastObservation);
    restored.restore(g.save());assert.deepEqual(restored.selected.lastObservation,observed);
    assert.deepEqual(conciseWorld(restored,restored.selected).lastObservation,observed);
    assert.deepEqual(restored.snapshot().lastObservation,observed);
    assert.equal(restored.selected.stage,'awaiting_step_done');assert.equal(restored.selected.planIndex,0);
    restored.physics.entities.get(e.id).body.setTranslation({x:8,y:.3,z:7},true);
    assert.deepEqual(restored.selected.lastObservation,observed);
    const live=conciseWorld(restored,restored.selected).objects.find(o=>o.id===e.id);
    assert.notDeepEqual(live.position,observed.objects.find(o=>o.id===e.id).position);
  }finally{g.physics.dispose();restored.physics.dispose();}
});
