import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {Providers} from '../providers.mjs';
import {executionEvidence,NAVIGATION_TOLERANCE} from '../execution-evidence.mjs';

test('approach verification uses the actual clear arrival point instead of unused model coordinates',async()=>{
  let audit;const g=new Garden({providers:{laya:{ready:true},generator:{ready:true},decide:async()=>({response:{choice:'done'}}),verifyStep:async(_b,evidence)=>{audit=evidence;return {value:{complete:true,explanation:'The recorded arrival satisfies the declared engine tolerance.'}};}}});
  try{const b=g.selected,step={action:'approach',target:'berries',x:0,z:0,label:'Approach the fruit'};b.planSteps=[step];b.startAction(step);const requested={...b.actor.goal};assert.notDeepEqual(requested,{x:0,z:0});
    for(let i=0;i<900&&b.stage==='acting';i++)g.step();assert.equal(b.stage,'awaiting_step_done',b.error);
    assert.deepEqual(b.pendingStepEvidence.job.navigationDestination,requested);
    const e=executionEvidence(b),p=e.record.endPosition,fruit=g.physics.position(g.physics.entities.get('berries'));
    assert.deepEqual(e.criteria.navigation.destination,requested);assert.deepEqual(e.record.destination,requested);assert.equal(e.record.navigation.status,'arrived');assert.equal(e.criteria.navigation.toleranceMeters,NAVIGATION_TOLERANCE);
    assert.ok(e.criteria.navigation.horizontalDistanceAtCompletion<NAVIGATION_TOLERANCE);
    assert.ok(Math.hypot(p.x-fruit.x,p.z-fruit.z)>1.3,'approaching intentionally leaves room beside the object');
    b.nextCall=0;await b.poll();b.nextCall=0;await b.poll();assert.deepEqual(audit.execution,e);assert.equal(b.planIndex,1);
  }finally{g.physics.dispose();}
});

test('Gemma is instructed to apply actual arrival and throw criteria rather than invent stricter thresholds',async()=>{
  const p=new Providers();let prompt;p.generate=async(_system,text)=>{prompt=text;return {value:{complete:true,explanation:'Test response'}};};
  await p.verifyStep({objective:'Retrieve the tulip',planSteps:[{action:'approach',target:'item-1'}],planIndex:0,stepResults:{}},{execution:{criteria:{navigation:{destination:{x:-1.5,z:3},toleranceMeters:.18,horizontalDistanceAtCompletion:.12}}}});
  assert.match(prompt,/execution.criteria.*exact rules/);assert.match(prompt,/1.5m object distance can be a valid approach/);assert.match(prompt,/pickup\/use allow up to 2.7m/);assert.match(prompt,/Throw coordinates are an aim direction, never a promised landing point/);assert.match(prompt,/"horizontalDistanceAtCompletion":0.12/);
});

test('placement retains the exact released object position as evidence after it settles',()=>{
  const g=new Garden();try{const b=g.selected,start={x:-5,y:1.2,z:5};b.actor.body.setTranslation(start,true);b.actor.body.setNextKinematicTranslation(start);b.actor.rig.resetAt(start);g.physics.carry('berries');const step={action:'place',x:1,z:3,label:'Place the berries'};b.planSteps=[step];b.startAction(step);
    for(let i=0;i<900&&b.stage==='acting';i++)g.step();assert.equal(b.stage,'awaiting_step_done',b.error);
    const proof=executionEvidence(b),object=proof.record.objectAtCompletion;assert.equal(object.id,'berries');assert.equal(object.carried,false);assert.equal(object.carrier,null);assert.ok(Math.abs(object.position.x-1)<.000001&&Math.abs(object.position.z-3)<.000001);
    assert.deepEqual(proof.criteria.placementPoint,{x:1,z:3});assert.notDeepEqual(proof.criteria.navigation.destination,proof.criteria.placementPoint);
    for(let i=0;i<120;i++)g.step();assert.deepEqual(executionEvidence(b).record.objectAtCompletion,object);
  }finally{g.physics.dispose();}
});
