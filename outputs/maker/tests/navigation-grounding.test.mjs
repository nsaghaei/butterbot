import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {validatePlanTargets,validateAction} from '../actions.mjs';

test('planning rejects walking into furniture and retains clear ground destinations and object approaches',()=>{
  const g=new Garden({seedFood:false,furnished:true});try{
    for(const [id,x,z]of [['park-bench',2,-5],['home-bed',6,5]]){
      assert.throws(()=>validatePlanTargets(g,[{action:'move',x,z}]),new RegExp('occupied.*'+id+'.*approach'));
      assert.throws(()=>validateAction(g,g.selected,{action:'move',x,z}),/occupied/);
      assert.equal(validatePlanTargets(g,[{action:'approach',target:id},{action:'use',target:id,use:id==='home-bed'?'rest':'sit'}]),true);
    }
    assert.equal(validatePlanTargets(g,[{action:'move',x:-4,z:5}]),true);
    assert.equal(validateAction(g,g.selected,{action:'move',x:-4,z:5}).action,'move');
  }finally{g.physics.dispose();}
});
