import test from 'node:test';
import assert from 'node:assert/strict';
import {creationPairs,PAIRS,validatePlans} from '../planning.mjs';
import {MakerWorld} from '../world.mjs';

const proposal=(id,kind,interaction)=>({id,kind,interaction,label:kind+' with '+interaction});

test('creation choices retain neutral defaults and constrain only the relevant later behaviors',()=>{
  assert.deepEqual(creationPairs(),PAIRS);assert.equal(creationPairs().prop[0],'display');
  assert.deepEqual(creationPairs([{action:'pick_up'},{action:'inspect'}]),PAIRS);
  assert.deepEqual(creationPairs([{action:'eat'}]),{prop:['display']});
  assert.deepEqual(creationPairs([{action:'use',use:'drive'}]),{vehicle:['drive']});
  assert.deepEqual(creationPairs([{action:'use',use:'rest'}]),{prop:['rest']});
  assert.deepEqual(creationPairs([{action:'use',use:'squish'}]),{soft:['squish']});
});

test('eating permits another explicit compatible prop use and incompatible requirements fail clearly',()=>{
  assert.deepEqual(creationPairs([{action:'eat'},{action:'use',use:'store'}]),{prop:['store']});
  assert.deepEqual(creationPairs([{action:'use',use:'sit'},{action:'use',use:'rest'}]),{prop:['sit','rest']});
  assert.throws(()=>creationPairs([{action:'eat'},{action:'use',use:'drive'}]),/Incompatible.*eat.*drive/);
  assert.throws(()=>creationPairs([{action:'use',use:'drive'},{action:'use',use:'squish'}]),/Incompatible.*drive.*squish/);
  assert.throws(()=>creationPairs([{action:'use',use:'fly'}]),/Incompatible.*fly/);
});

test('food planning rejects storage before construction while preserving the valid proposal subset',()=>{
  const value={plans:[proposal('a','prop','store'),proposal('b','prop','display'),proposal('c','soft','squish')]},result=validatePlans('Print one small edible orange',value,[{action:'eat'}]);
  assert.deepEqual(result.accepted.map(p=>p.id),['b']);assert.equal(result.rejected.length,2);assert.match(result.rejected[0].reason,/prop\/display.*prop\/store/);assert.match(result.rejected[1].reason,/prop\/display.*soft\/squish/);
  assert.equal(validatePlans('Print one edible container',value,[{action:'eat'},{action:'use',use:'store'}]).accepted[0].id,'a');
});

test('world passes required later behavior into printer proposal validation',async()=>{
  const providers={healthTime:Date.now(),generator:{ready:true},provider:'offline fixture',plan:async()=>({value:{plans:[proposal('a','prop','store'),proposal('b','prop','display')]},prompt:'fixture'})};
  const w=new MakerWorld({providers});try{w.objective='Print one small edible orange, then eat it.';w.printIntent='Print one small edible orange';w.printRequirements=[{action:'eat'}];w.stage='planning';await w.poll();
    assert.deepEqual(w.plans.map(p=>p.id),['b']);assert.equal(w.stage,'choose_plan');const record=w.logs.find(l=>l.type==='plan');assert.equal(record.status,'accepted');assert.match(record.rejections[0].reason,/prop\/display/);
  }finally{w.physics.dispose();}
});
