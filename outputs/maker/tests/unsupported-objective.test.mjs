import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';

const poll=async b=>{b.nextCall=0;await b.poll();};
test('an explicit unsupported-object response is explained once without retrying or changing the world',async()=>{
  let calls=0;const explanation='The Park bench is anchored, weighs 36kg, and is not edible.';
  const g=new Garden({seedFood:false,furnished:true,providers:{generator:{ready:true},laya:{ready:true},actionPlan:async()=>{calls++;return {value:{supported:false,explanation,steps:[]}};}}});
  try{const b=g.selected;b.thought={text:'An old goal',speech:'Old speech'};g.assign('actor','Eat the park bench.');assert.equal(b.thought,null);const before={needs:{...b.needs},position:{...b.actor.body.translation()},entities:[...g.physics.entities.keys()]};
    for(let i=0;i<4;i++)await poll(b);
    assert.equal(calls,1);assert.equal(b.stage,'failed');assert.equal(b.error,explanation);assert.equal(b.planAttempts,0);assert.equal(b.planIndex,0);assert.equal(b.job,null);assert.equal(b.pendingStepEvidence,null);assert.equal(b.logs.filter(l=>l.type==='activity_plan').length,1);assert.equal(b.logs.find(l=>l.type==='activity_plan').status,'unsupported');assert.equal(b.logs.some(l=>l.type==='action_outcome'),false);assert.deepEqual({needs:{...b.needs},position:{...b.actor.body.translation()},entities:[...g.physics.entities.keys()]},before);
  }finally{g.physics.dispose();}
});

test('malformed plan support responses still receive the bounded repair attempts',async()=>{
  for(const value of [{steps:[]},{supported:false,explanation:'',steps:[]}]){let calls=0;const g=new Garden({seedFood:false,providers:{generator:{ready:true},actionPlan:async()=>{calls++;return {value};}}});try{const b=g.selected;g.assign('actor','Observe here.');for(let i=0;i<4;i++)await poll(b);assert.equal(calls,3);assert.equal(b.stage,'failed');assert.match(b.error,/Invalid activity plan/);}finally{g.physics.dispose();}}
});
