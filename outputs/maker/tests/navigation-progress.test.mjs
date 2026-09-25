import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';

test('a detour away from the final destination counts as motion; a stopped actor still times out',()=>{
  const g=new Garden({seedFood:false});try{
    const b=g.selected,start={x:0,y:1.2,z:0};b.actor.body.setTranslation(start,true);b.actor.body.setNextKinematicTranslation(start);
    const step={action:'move',x:4,z:0,label:'Walk to the marked spot'};b.planSteps=[step];b.startAction(step);
    for(let i=1;i<=300;i++){b.actor.body.setTranslation({x:-i/100,y:1.2,z:0},true);b.step(1/60);}
    assert.equal(b.stage,'acting');assert.ok(b.job.lastDistance>6.9);assert.ok(b.job.stuck<.2);
    for(let i=0;i<250&&b.stage==='acting';i++)b.step(1/60);
    assert.equal(b.stage,'action_plan');assert.equal(b.navigationRecoveries,1);assert.equal(b.logs.findLast(l=>l.type==='action_outcome').status,'failed');
  }finally{g.physics.dispose();}
});

test('continuous movement still obeys the overall travel deadline',()=>{
  const g=new Garden({seedFood:false});try{
    const b=g.selected,start={x:0,y:1.2,z:0};b.actor.body.setTranslation(start,true);b.actor.body.setNextKinematicTranslation(start);
    const step={action:'move',x:7,z:7,label:'Walk to the marked spot'};b.planSteps=[step];b.startAction(step);
    for(let i=0;i<2200&&b.stage==='acting';i++){b.actor.body.setTranslation({x:Math.cos(i/60),y:1.2,z:Math.sin(i/60)},true);b.step(1/60);}
    assert.equal(b.stage,'action_plan');assert.ok(b.time>=35&&b.time<36);
  }finally{g.physics.dispose();}
});
