import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {compileDesign} from '../design.mjs';
import {buildDecisionContext} from '../decision-context.mjs';
import {PRINTER} from '../environment-layout.mjs';
import {MakerWorld} from '../world.mjs';

const cube=await compileDesign({name:'Keepsake',description:'A small cream-colored keepsake cube.',kind:'prop',mass:1,affordances:['display'],code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshToonMaterial({color:0xffedb5})));return g;'});
const providers={generator:{ready:false},laya:{ready:false},healthTime:Date.now(),calls:{},health:async()=>{}};

test('blocked nested printer navigation stops with a real failure instead of waiting forever',()=>{
 const w=new MakerWorld({providers});try{
  w.actor.body.setTranslation(PRINTER.approach,true);w.actor.goal={x:PRINTER.center.x,z:PRINTER.center.z};w.stage='approaching';
  for(let i=0;i<900&&w.stage==='approaching';i++)w.step();
  assert.equal(w.stage,'failed');assert.match(w.error,/Route to printer is blocked/);assert.equal(w.actor.goal,null);assert.equal(w.result.ok,false);
 }finally{w.physics.dispose();}
});

test('each new nested print clears old results and repair state without losing the outer plan',()=>{
 const g=new Garden({providers,seedFood:false});try{
  const b=g.selected;g.assign('actor','Print a new object');b.planSteps=[{action:'print',label:'Print a new object'}];b.result={ok:true,description:'Old success'};b.activeId='old';b.pendingDesign=cube;b.review={ok:true};b.lastDesignError='old failure';b.commitFailures=2;b.waitCount=2;
  b.startAction(b.planSteps[0]);for(const key of ['result','activeId','pendingDesign','review','lastDesignError'])assert.equal(b[key],null,key);assert.equal(b.commitFailures,0);assert.equal(b.waitCount,0);assert.equal(b.planSteps.length,1);assert.equal(b.stage,'planning');
 }finally{g.physics.dispose();}
});

test('verification transport failures consume exactly one attempt each',async()=>{
 let calls=0;const g=new Garden({providers:{...providers,verifyStep:async()=>{calls++;throw Error('Temporary verifier failure');}},seedFood:false});try{
  const b=g.selected;g.assign('actor','Rest');b.planSteps=[{action:'rest',seconds:2,label:'Rest briefly'}];b.startAction(b.planSteps[0]);for(let i=0;i<125;i++)g.step();
  for(let i=1;i<=3;i++){b.stage='verify_step';b.nextCall=0;await b.poll();assert.equal(b.verificationAttempts,i);assert.equal(b.stage,i===3?'failed':'awaiting_step_done');}assert.equal(calls,3);
 }finally{g.physics.dispose();}
});

test('a planned help step retains its outcome for verification',async()=>{
 const g=new Garden({providers:{...providers,reflect:async()=>({value:{thought:'I need an available resource.',speech:'There is no food here.',memory:[],proposedActions:[]}})},seedFood:false});try{
  const b=g.selected;g.assign('actor','Explain what is missing');b.planSteps=[{action:'ask_for_help',label:'Explain the missing resource'}];b.startAction(b.planSteps[0]);await b.reflect('Explain missing resource');
  assert.equal(b.stage,'awaiting_step_done');assert.equal(b.pendingStepEvidence.stepIndex,0);
 }finally{g.physics.dispose();}
});

test('nested printer-use rejection preserves its stage and reaches a bounded honest failure',async()=>{
 const w=new MakerWorld({providers:{...providers,laya:{ready:true},decide:async()=>({response:{choice:'use'}})}});try{
  const e=w.physics.add(cube,{x:-1,y:.3,z:4});w.activeId=e.id;w.stage='use';w.interaction='rest';w.placement={x:-1,z:4};
  for(let i=0;i<3;i++){w.nextCall=0;await w.poll();assert.match(w.error,/supporting surface/);assert.equal(w.commitFailures,i+1);assert.equal(w.stage,i===2?'failed':'use');}
  assert.equal(w.actor.reclining,false);assert.equal(w.logs.filter(l=>l.type==='laya'&&l.status==='rejected').length,3);
 }finally{w.physics.dispose();}
});

test('equivalent model suggestions cannot duplicate the intended move and discard its progress',async()=>{
 let offered;
 const g=new Garden({providers:{...providers,laya:{ready:true},decide:async(_s,_q,choices)=>{offered=choices;return {response:{choice:'a0'}};}},seedFood:false});try{
  const b=g.selected;g.assign('actor','Walk to (1,1).');b.planSteps=[{action:'move',x:1,z:1,target:'',label:'Walk to the sunny patch'}];b.stage='action_decide';
  b.suggestions=[{action:'move',x:1,z:1,label:'Walk to sunny patch'}];await b.poll();
  assert.equal(Object.values(offered).filter(label=>/sunny patch/.test(label)).length,1);
  for(let i=0;i<300&&b.stage==='acting';i++)g.step();
  assert.equal(b.stage,'awaiting_step_done');assert.equal(b.logs.filter(l=>l.type==='action_outcome').length,1);
 }finally{g.physics.dispose();}
});

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
