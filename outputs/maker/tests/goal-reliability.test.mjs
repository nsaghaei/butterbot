import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {buildDecisionContext} from '../decision-context.mjs';
import {PRINTER} from '../environment-layout.mjs';

const cube=await compileDesign({name:'Keepsake',description:'A small cream-colored keepsake cube.',kind:'prop',mass:1,affordances:['display'],code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshToonMaterial({color:0xffedb5})));return g;'});
const providers={generator:{ready:false},laya:{ready:false},healthTime:Date.now(),calls:{},health:async()=>{}};

test('new instructions preserve a held object for subsequent interaction',()=>{
 const g=new Garden({providers,seedFood:false});try{
  const e=g.physics.add(cube,{x:-1,y:1,z:4});g.designs[e.id]=e.design;g.physics.carry(e.id,'actor');
  g.assign('actor','Put my keepsake at (2,3).');
  assert.equal(e.carrier,'actor');assert.equal(e.carried,true);assert.equal(g.selected.lastUserGoal.text,'Put my keepsake at (2,3).');
 }finally{g.physics.dispose();}
});

test('a commit-time rejection ends the failed attempt instead of silently looping the same choice',async()=>{
 const g=new Garden({providers:{...providers,laya:{ready:true},decide:async()=>{g.reservations.set('berries','someone-else');return {response:{choice:'a0'}};}}});try{
  const b=g.selected;g.assign('actor','Eat berries');b.actor.body.setTranslation({x:-5,y:1,z:5},true);b.planSteps=[{action:'eat',target:'berries',label:'Eat berries'}];b.stage='action_decide';
  await b.poll();assert.equal(b.stage,'failed');assert.match(b.error,/reserved/);assert.equal(b.job,null);assert.equal(g.physics.entities.get('berries').servings,3);
 }finally{g.physics.dispose();}
});

test('failed user request survives autonomous activity and save/restore',()=>{
 const g=new Garden({providers,seedFood:false}),restored=new Garden({providers,seedFood:false});try{
  const b=g.selected;g.assign('actor','Print a flower');b.stage='failed';b.error='Design was not approved';b.goalReadyAt=0;g.step();
  assert.equal(b.stage,'goal_select');assert.equal(b.lastUserGoal.status,'failed');assert.equal(b.lastUserGoal.text,'Print a flower');assert.equal(b.lastUserGoal.error,'Design was not approved');
  restored.restore(g.save());assert.deepEqual(restored.selected.lastUserGoal,b.lastUserGoal);assert.equal(restored.snapshot().lastUserGoal.status,'failed');
 }finally{g.physics.dispose();restored.physics.dispose();}
});

test('review context states successful physical checks without inventing visual verification or empty failures',()=>{
 const g=new Garden({providers,seedFood:false});try{
  const b=g.selected;g.assign('actor','Print a keepsake');b.stage='review';b.pendingDesign=cube;b.review={summary:'Three physical checks passed',checks:[{ok:true,label:'Geometry'}]};
  const context=buildDecisionContext(b);for(const {text}of context.variants){assert.match(text,/cream-colored keepsake/);assert.match(text,/no physical check failed/);assert.match(text,/Visual resemblance remains unverified/);assert.doesNotMatch(text,/; failed\s*\./);}
 }finally{g.physics.dispose();}
});

test('restored printer approach follows the shared layout instead of a stale destination',()=>{
 const g=new Garden({providers,seedFood:false}),restored=new Garden({providers,seedFood:false});try{
  g.selected.stage='approaching';g.selected.actor.goal={x:-5,z:-.8};restored.restore(g.save());
  assert.deepEqual(restored.selected.actor.goal,{x:PRINTER.approach.x,z:PRINTER.approach.z});
 }finally{g.physics.dispose();restored.physics.dispose();}
});
