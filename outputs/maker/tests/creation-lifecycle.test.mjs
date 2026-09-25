import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';

test('a failed compilation from an abandoned print cannot spend the new request repair budget',async()=>{
  const proposal={name:'Invalid empty creation',description:'No physical components.',kind:'prop',mass:1,affordances:['display'],code:'return new THREE.Group();'};
  const providers={provider:'test',generator:{ready:true},laya:{ready:true},healthTime:Date.now(),design:async()=>({value:proposal})};
  const garden=new Garden({providers,seedFood:false}),brain=garden.selected;try{
    brain.assign('Print an object.');brain.kind='prop';brain.interaction='display';brain.stage='needs_design';
    const compiling=brain.poll();await Promise.resolve();
    const record=brain.logs.findLast(r=>r.type==='design');assert.equal(record.status,'validating','the worker has started compiling');
    brain.assign('Observe the garden.');brain.lastDesignError=null;
    const cycle=brain.cycle,revision=brain.revision,events=brain.events.length,repairs=brain.metrics.creatorRepairs;
    await compiling;
    assert.equal(record.status,'discarded');assert.match(record.error,/1–96 meshes/);
    assert.equal(brain.cycle,cycle);assert.equal(brain.revision,revision);assert.equal(brain.stage,'action_plan');
    assert.equal(brain.error,null);assert.equal(brain.lastDesignError,null);assert.equal(brain.repairCount,0);assert.equal(brain.metrics.creatorRepairs,repairs);assert.equal(brain.events.length,events);
  }finally{garden.physics.dispose();}
});
