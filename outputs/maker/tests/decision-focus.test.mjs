import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {buildDecisionContext} from '../decision-context.mjs';

test('decision state leads with active step, marks completed work and includes every need',()=>{
  const g=new Garden();try{
    const b=g.selected;b.assign('Walk, dance, then observe.');b.planSteps=[{action:'move',label:'Walk to sunny pad'},{action:'dance',label:'Dance here'},{action:'observe',label:'Look around'}];b.planIndex=1;
    Object.assign(b.needs,{hygiene:42,social:51,comfort:38});
    const context=buildDecisionContext(b);
    for(const variant of context.variants){assert.match(variant.text,/^Current step 2\/3: Dance here/);assert.match(variant.text,/1 done:/);assert.match(variant.text,/3 later:/);assert.match(variant.text,/hygiene 42, social 51, comfort 38/);for(const object of context.snapshot.objects)assert.ok(variant.text.includes(object.name));}
  }finally{g.physics.dispose();}
});

test('only referenced creation results enter compact context, while complete evidence is logged',()=>{
  const g=new Garden();try{
    const b=g.selected;b.assign('Print two ornaments and carry the first.');b.planSteps=[{action:'print',label:'First ornament'},{action:'print',label:'Second ornament'},{action:'pick_up',target:'$step1',label:'Carry the first ornament'}];b.planIndex=2;
    b.stepResults={0:{entityId:'first-object',outcome:'printed'},1:{entityId:'unrelated-object',outcome:'printed'}};
    const context=buildDecisionContext(b);assert.equal(context.snapshot.goal.stepResults[1].entityId,'unrelated-object');
    for(const variant of context.variants){assert.match(variant.text,/target first-object/);assert.match(variant.text,/\$step1=first-object/);assert.ok(!variant.text.includes('unrelated-object'));}
  }finally{g.physics.dispose();}
});
