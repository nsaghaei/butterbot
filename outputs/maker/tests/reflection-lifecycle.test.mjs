import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';

function fixture(seconds){
  let finish;const providers={generator:{ready:false},laya:{ready:false},provider:'test',calls:{},healthTime:Date.now(),reflect:()=>new Promise(resolve=>{finish=resolve;})};
  const garden=new Garden({providers,seedFood:false}),brain=garden.selected;brain.assign('Dance for a little while.');brain.goalSource='self';brain.planSteps=[{action:'dance',seconds,label:'Dance'}];brain.startAction(brain.planSteps[0]);
  return {garden,brain,respond:()=>finish({prompt:'Captured activity frame',elapsedMs:20,value:{thought:'I am still beginning my dance.',speech:'Time to dance!',memory:[{operation:'remember',id:'',text:'I started dancing.',kind:'experience'}],proposedActions:[]}})};
}

test('a reflection generated across physical completion cannot publish obsolete dialogue or memory',async()=>{
  const f=fixture(2);try{
    const revision=f.brain.revision,cycle=f.brain.cycle,pending=f.brain.reflect('While dancing');
    for(let i=0;i<125;i++)f.garden.step();assert.equal(f.brain.stage,'awaiting_step_done');assert.equal(f.brain.revision,revision);assert.equal(f.brain.cycle,cycle);
    f.respond();await pending;assert.equal(f.brain.thought,null);assert.equal(f.brain.memory.length,0);assert.equal(f.brain.logs.at(-1).status,'discarded');assert.match(f.brain.logs.at(-1).reason,/Activity changed/);assert.match(f.brain.pendingReflection,/latest completed/);assert.ok(f.brain.nextReflection-Date.now()<1500);assert.equal(f.brain.pendingStepEvidence.job.action,'dance');
  }finally{f.garden.physics.dispose();}
});

test('ordinary movement time and need decay do not invalidate a reflection about the same activity',async()=>{
  const f=fixture(8);try{
    const pending=f.brain.reflect('While dancing'),energy=f.brain.needs.energy;for(let i=0;i<30;i++)f.garden.step();assert.equal(f.brain.stage,'acting');assert.ok(f.brain.needs.energy<energy);
    f.respond();await pending;assert.equal(f.brain.logs.at(-1).status,'accepted');assert.equal(f.brain.thought.speech,'Time to dance!');assert.equal(f.brain.memory.length,1);assert.ok(f.brain.nextReflection-Date.now()>85000);
  }finally{f.garden.physics.dispose();}
});

test('new authoritative evidence invalidates an in-flight reflection even when the stage is unchanged',async()=>{
  const f=fixture(8);try{
    const pending=f.brain.reflect('Current activity');f.brain.log('step_verification',{status:'verified',step:1,result:{complete:true}});f.respond();await pending;
    assert.equal(f.brain.logs.at(-1).status,'discarded');assert.equal(f.brain.thought,null);assert.equal(f.brain.memory.length,0);assert.equal(f.brain.stage,'acting');
  }finally{f.garden.physics.dispose();}
});
