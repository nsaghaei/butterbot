import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {goalCandidates,criticalNeedPlan} from '../autonomy.mjs';
import {lifeNeeds} from '../needs.mjs';
import {validatePlanCoverage,validatePlanTargets} from '../actions.mjs';

const ticks=(g,n)=>{for(let i=0;i<n;i++)g.step();};
const position=(b,p)=>{b.actor.body.setTranslation(p,true);b.actor.body.setNextKinematicTranslation(p);b.actor.rig.resetAt(p);};
const provider=()=>({generator:{ready:true},laya:{ready:true},healthTime:Date.now(),calls:{},decide:async(_s,_q,choices)=>({response:{choice:choices.done?'done':Object.keys(choices)[0]}}),actionPlan:async(_b,f)=>({value:{supported:true,steps:structuredClone(f.planning.engineProposal.steps)}}),verifyStep:async()=>({value:{complete:true,explanation:'The recorded physical action completed.'}})});
const poll=async b=>{b.nextCall=0;await b.poll();};

test('furniture migration uses stable IDs once and never restores consumed or removed accommodations',()=>{
  const g=new Garden({seedFood:false}),restored=new Garden({seedFood:false,furnished:true});try{
    assert.deepEqual(g.selected.needs,lifeNeeds());g.assign('actor','Observe the garden.');const cycle=g.selected.cycle;
    assert.deepEqual(g.ensureAccommodations(),['home-bed','garden-shower','park-bench','snack-bowl']);assert.equal(g.selected.cycle,cycle);assert.equal(g.selected.objective,'Observe the garden.');assert.equal(g.brains.size,1);assert.equal(g.physics.entities.get('snack-bowl').servings,6);assert.equal(g.physics.entities.get('garden-shower').design.material,'metal');
    g.physics.remove('snack-bowl');delete g.designs['snack-bowl'];g.physics.remove('park-bench');delete g.designs['park-bench'];const saved=g.save();restored.restore(saved);
    assert.equal(restored.accommodationsInstalled,true);assert.deepEqual(restored.ensureAccommodations(),[]);assert.ok(!restored.physics.entities.has('snack-bowl'));assert.ok(!restored.physics.entities.has('park-bench'));assert.ok(restored.physics.entities.has('garden-shower'));
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('natural accommodation goals require the matching physical interaction',()=>{
  for(const [text,use]of [['Wash at Garden shower.','wash'],['Please take a shower.','wash'],['Shower.','wash'],['Use the shower.','wash'],['Use the Garden shower.','wash'],['Sit comfortably at Park bench.','sit'],['Rest on Garden daybed.','rest'],['Sleep in the bed.','rest']]){
    assert.equal(validatePlanCoverage(text,[{action:'use',target:'furniture',use}]),true);assert.throws(()=>validatePlanCoverage(text,[{action:'observe'}]),/omitted/);
  }
  assert.throws(()=>validatePlanCoverage('Rest on Garden daybed.',[{action:'rest'}]),/supporting bed/);
  assert.equal(validatePlanCoverage('Rest here.',[{action:'rest'}]),true);assert.equal(validatePlanCoverage('Sleep for a moment.',[{action:'rest'}]),true);
  assert.equal(validatePlanCoverage('Print an anchored shower.',[{action:'print'}]),true);
  assert.throws(()=>validatePlanCoverage('Print a shower, then wash.',[{action:'print'}]),/wash/);
  assert.equal(validatePlanCoverage('Print a shower, then wash.',[{action:'print'},{action:'use',target:'$step1',use:'wash'}]),true);
  for(const text of ['Inspect the Garden shower.','Inspect the wash station.','Have a closer look at Garden shower.'])assert.equal(validatePlanCoverage(text,[{action:'inspect',target:'garden-shower'}]),true);
  for(const text of ['Walk to the shower.','Approach the Garden shower.','Go to the wash station.'])assert.equal(validatePlanCoverage(text,[{action:'approach',target:'garden-shower'}]),true);
});

test('hygiene and comfort proposals name available accommodations without inventing social relief',()=>{
  const g=new Garden({seedFood:false,furnished:true});try{const b=g.selected;b.needs=lifeNeeds({hunger:0,energy:90,fun:90,hygiene:5,comfort:10,social:1});const before={...b.needs},goals=goalCandidates(b);
    assert.deepEqual(goals.map(g=>g.id),['wash','sit']);assert.match(goals[0].text,/Garden shower/);assert.match(goals[1].text,/Park bench/);
    for(const goal of goals){assert.equal(validatePlanTargets(g,goal.steps),true);assert.equal(validatePlanCoverage(goal.text,goal.steps),true);}assert.deepEqual(b.needs,before);
    b.needs.energy=10;assert.equal(goalCandidates(b)[0].steps.at(-1).target,'home-bed');g.reservations.set('garden-shower','other');b.needs.energy=90;assert.equal(goalCandidates(b)[0].id,'wash_help');
  }finally{g.physics.dispose();}
});

for(const [target,use,kind,need,amount]of [['home-bed','rest','sleep','energy',27],['park-bench','sit','sit','comfort',24]])test(`actual ${use} fulfills once after six seconds of supported posture`,()=>{
  const g=new Garden({seedFood:false,furnished:true});g.mode='manual';try{const b=g.selected,e=g.physics.entities.get(target),p=g.physics.position(e);position(b,{x:p.x,y:1.2,z:p.z+1});ticks(g,60);b.needs=lifeNeeds({energy:20,comfort:10,social:10});b.planSteps=[{action:'use',target,use,label:use+' here'}];b.startAction(b.planSteps[0]);ticks(g,300);
    assert.equal(b.stage,'interacting');assert.ok(b.needs[need]<(need==='energy'?20:10));assert.equal(b.job.needFulfillment,undefined);ticks(g,70);
    assert.equal(b.stage,'awaiting_step_done');const record=b.logs.findLast(l=>l.type==='action_outcome');assert.equal(record.use,use);assert.equal(record.needFulfillment.kind,kind);assert.equal(record.needFulfillment.elapsed,6);assert.equal(record.needFulfillment.after[need]-record.needFulfillment.before[need],amount);assert.ok(b.needs.social<10);
    const value=b.needs[need];ticks(g,120);assert.ok(b.needs[need]<value);assert.equal(b.logs.filter(l=>l.type==='action_outcome').length,1);
  }finally{g.physics.dispose();}
});

test('mid-wash save restoration restarts a full physical wash and fulfills only once',()=>{
  const g=new Garden({seedFood:false,furnished:true}),restored=new Garden({seedFood:false});g.mode='manual';try{const b=g.selected,station=g.physics.washStation('garden-shower','actor',{requireNear:false});position(b,station.position);ticks(g,30);b.needs.hygiene=10;b.planSteps=[{action:'use',target:'garden-shower',use:'wash',label:'Wash'}];b.startAction(b.planSteps[0]);ticks(g,180);assert.equal(b.washStarted,true);assert.equal(b.stage,'interacting');assert.ok(b.needs.hygiene<10);
    restored.restore(g.save());const next=restored.selected;assert.equal(next.washStarted,false);assert.equal(next.actor.washing,null);ticks(restored,300);assert.equal(next.stage,'interacting');assert.equal(next.job.needFulfillment,undefined);ticks(restored,90);
    assert.equal(next.stage,'awaiting_step_done',next.error);const record=next.logs.findLast(l=>l.type==='action_outcome');assert.equal(record.use,'wash');assert.equal(record.needFulfillment.kind,'wash');assert.equal(record.needFulfillment.after.hygiene-record.needFulfillment.before.hygiene,48);assert.equal(next.actor.washing,null);assert.equal(next.logs.filter(l=>l.type==='action_outcome'&&l.use==='wash').length,1);
  }finally{g.physics.dispose();restored.physics.dispose();}
});

test('a failed critical-need detour resumes the original verified plan with a bounded retry cooldown',async()=>{
  const p=provider();p.actionPlan=async()=>{throw Error('Temporary planner unavailable');};const g=new Garden({providers:p,seedFood:false});try{const b=g.selected;g.assign('actor','Walk to (2,3).');b.planSteps=[{action:'move',x:2,z:3,label:'Walk to (2,3)'}];b.planIndex=0;b.stage='action_decide';b.needs.energy=5;
    await poll(b);assert.equal(b.goalSource,'need interruption');await poll(b);await poll(b);assert.equal(b.stage,'failed');g.step();assert.equal(b.goalSource,'user');assert.equal(b.stage,'action_decide');assert.equal(b.objective,'Walk to (2,3).');assert.equal(b.suspendedGoal,null);assert.equal(criticalNeedPlan(b),null);assert.ok(b.needs.energy<5);assert.ok(b.logs.some(l=>l.status==='resumed'&&/failed/.test(l.outcome)));
    await poll(b);assert.equal(b.job.action,'move');assert.equal(b.job.x,2);assert.equal(b.job.z,3);
  }finally{g.physics.dispose();}
});

test('only the exact legacy default actor name migrates to Butterbot',()=>{
  const g=new Garden({seedFood:false}),restored=new Garden({seedFood:false});try{assert.equal(g.selected.actorName,'Butterbot');const saved=g.save();saved.brains[0].actorName='Agent Wobble';restored.restore(saved);assert.equal(restored.selected.actorName,'Butterbot');saved.brains[0].actorName='Rivet';restored.restore(saved);assert.equal(restored.selected.actorName,'Rivet');assert.equal(restored.selected.core.name,'Rivet');assert.equal(restored.physics.actor.name,'Rivet');
  }finally{g.physics.dispose();restored.physics.dispose();}
});
