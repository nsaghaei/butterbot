import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {buildDecisionContext} from '../decision-context.mjs';

test('decision state leads with active step, marks completed work and includes every need',()=>{
  const g=new Garden();try{
    const b=g.selected;b.assign('Walk, dance, then observe.');b.planSteps=[{action:'move',label:'Walk to sunny pad'},{action:'dance',label:'Dance here'},{action:'observe',label:'Look around'}];b.planIndex=1;
    Object.assign(b.needs,{hygiene:42,social:51,comfort:38});
    const context=buildDecisionContext(b);
    assert.equal(context.snapshot.goal.step,1);assert.deepEqual(context.snapshot.goal.canonicalStep,b.planSteps[1]);assert.deepEqual(context.snapshot.goal.resolvedStep,b.planSteps[1]);
    for(const variant of context.variants){
      const focus=/^Current step (\d+)\/(\d+): ([a-z_]+)/.exec(variant.text);assert.ok(focus);assert.deepEqual(focus.slice(1),['2','3','dance']);assert.ok(variant.text.includes(b.objective));
      const encoded=/ Plan: ([^.]+)\./.exec(variant.text);assert.ok(encoded,'Full ordered plan is missing');
      const entries=encoded[1].split(/[;>]/);assert.equal(entries.length,b.planSteps.length);
      for(const [index,entry]of entries.entries()){
        const numbered=/^(\d+)\s*(done|now|later)?:\s*(.*)$/.exec(entry),content=numbered?numbered[3]:entry;
        if(numbered){assert.equal(Number(numbered[1]),index+1);if(numbered[2])assert.equal(numbered[2],index<1?'done':index===1?'now':'later');}
        assert.ok([b.planSteps[index].action,b.planSteps[index].label].includes(content),'Plan step '+(index+1)+' lost its action or changed order');
      }
      // The current step number identifies the completed prefix even when the
      // dense ordered plan omits repeated done/now/later presentation labels.
      assert.equal(Number(focus[1])-1,context.snapshot.goal.step);
      for(const [need,value]of Object.entries(b.needs))assert.ok(variant.text.includes(need+' '+Math.round(value)),need);
      for(const object of context.snapshot.objects)assert.ok(variant.text.includes(object.name));
    }
  }finally{g.physics.dispose();}
});

test('only referenced creation results enter compact context, while complete evidence is logged',()=>{
  const g=new Garden();try{
    const b=g.selected;b.assign('Print two ornaments and carry the first.');b.planSteps=[{action:'print',label:'First ornament'},{action:'print',label:'Second ornament'},{action:'pick_up',target:'$step1',label:'Carry the first ornament'}];b.planIndex=2;
    b.stepResults={0:{entityId:'first-object',outcome:'printed'},1:{entityId:'unrelated-object',outcome:'printed'}};
    const context=buildDecisionContext(b);assert.equal(context.snapshot.goal.stepResults[1].entityId,'unrelated-object');
    assert.deepEqual(context.snapshot.goal.canonicalStep,b.planSteps[2]);assert.deepEqual(context.snapshot.goal.resolvedStep,{...b.planSteps[2],target:'first-object'});assert.deepEqual(context.snapshot.goal.bindings,{'$step1':'first-object'});
    for(const variant of context.variants){const focus=/^Current step (\d+)\/(\d+): (\w+) (\$step\d+)=([^\s.]+)/.exec(variant.text);assert.ok(focus);assert.deepEqual(focus.slice(1),['3','3','pick_up','$step1','first-object']);assert.ok(!variant.text.includes('unrelated-object'));}
  }finally{g.physics.dispose();}
});
