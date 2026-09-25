import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlanHands} from '../actions.mjs';

function fixture(held='tulip'){
  const entities=new Map([
    ['tulip',{id:'tulip',design:{name:'Orange Tulip'},carried:held==='tulip',carrier:held==='tulip'?'pip':null}],
    ['food',{id:'food',design:{name:'Bowl of oranges'},carried:held==='food',carrier:held==='food'?'pip':null}],
    ['other',{id:'other',design:{name:'Other object'},carried:false,carrier:null}]
  ]);
  return {garden:{physics:{entities}},brain:{actorId:'pip',cycle:12,stepResults:{}}};
}
const check=(fixture,steps,options)=>validatePlanHands(fixture.garden,fixture.brain,steps,options);
const eat={action:'eat',target:'food'};

test('held tulip plus approach/eat is rejected before execution with the exact missing prerequisite',()=>{
  const f=fixture(),steps=[{action:'approach',target:'food'},eat],before=structuredClone([...f.garden.physics.entities]),planBefore=structuredClone(steps);
  assert.throws(()=>check(f,steps),/Plan step 2:.*Orange Tulip \(tulip\).*explicit drop or place.*Bowl of oranges \(food\)/);
  assert.deepEqual([...f.garden.physics.entities],before);assert.deepEqual(steps,planBefore);
});

test('explicit matching drop or place frees hands while the wrong target cannot',()=>{
  const f=fixture();
  for(const action of ['drop','place']){
    assert.equal(check(f,[{action,target:'tulip',x:1,z:1},{action:'approach',target:'food'},eat]),true);
    assert.equal(check(f,[{action,target:'',x:1,z:1},eat]),true);
    assert.throws(()=>check(f,[{action,target:'other',x:1,z:1},eat]),/held object would be Orange Tulip/);
  }
  assert.equal(f.garden.physics.entities.get('tulip').carrier,'pip');
});

test('eating accepts empty hands or the same held food and finishes with empty hands',()=>{
  for(const held of [null,'food']){
    const f=fixture(held);assert.equal(check(f,[eat]),true);assert.equal(check(f,[eat,{action:'pick_up',target:'tulip'}]),true);
    assert.throws(()=>check(f,[eat,{action:'drop',target:'food'}]),/nothing would be held/);
  }
});

test('prospective pickups and physical releases track the held target rather than merely current facts',()=>{
  const f=fixture(null);
  assert.throws(()=>check(f,[{action:'pick_up',target:'tulip'},eat]),/explicit drop or place/);
  assert.throws(()=>check(f,[{action:'pick_up',target:'tulip'},{action:'pick_up',target:'food'},eat]),/already hold Orange Tulip/);
  for(const action of ['drop','place','throw','give']){
    assert.equal(check(f,[{action:'pick_up',target:'tulip'},{action,target:'tulip',recipient:'actor',x:1,z:1},eat]),true);
    assert.throws(()=>check(f,[{action,target:'tulip',recipient:'actor'}]),/nothing would be held/);
  }
});

test('printing does not clear occupied hands or implicitly pick up the printed object',()=>{
  const held=fixture(),empty=fixture(null),print={action:'print',label:'Print one edible orange'};
  assert.throws(()=>check(held,[print,{action:'eat',target:'$step1'}]),/Orange Tulip.*explicit drop or place.*\$step1/);
  assert.equal(check(held,[{action:'drop',target:'tulip'},print,{action:'eat',target:'$step2'}]),true);
  assert.equal(check(empty,[print,{action:'eat',target:'$step1'}]),true);
  assert.throws(()=>check(empty,[print,{action:'give',target:'$step1',recipient:'actor'}]),/nothing would be held/);
  assert.equal(check(empty,[print,{action:'pick_up',target:'$step1'},{action:'give',target:'$step1',recipient:'actor'}]),true);
});

test('future printed objects keep distinct full-plan identities through hand transitions',()=>{
  const f=fixture(null),prints=[{action:'print',label:'Print ornament'},{action:'print',label:'Print food'}];
  assert.throws(()=>check(f,[...prints,{action:'pick_up',target:'$step1'},{action:'eat',target:'$step2'}]),/hold \$step1.*before eating \$step2/);
  assert.equal(check(f,[...prints,{action:'pick_up',target:'$step1'},{action:'place',target:'$step1',x:1,z:1},{action:'eat',target:'$step2'}]),true);
  assert.throws(()=>check(f,[{action:'pick_up',target:'$step2'},...prints]),/earlier print step/);
});

test('verified prefix effects are skipped and remaining hands start from the actual world',()=>{
  const steps=[{action:'pick_up',target:'tulip'},{action:'drop',target:'tulip'},eat],empty=fixture(null);
  assert.equal(check(empty,steps,{startIndex:2}),true);
  const changed=fixture();assert.throws(()=>check(changed,steps,{startIndex:2}),/Plan step 3:.*explicit drop or place/);
  assert.equal(check(changed,[{action:'pick_up',target:'tulip'},{action:'drop',target:'tulip'},eat],{startIndex:1}),true);
});

test('a verified earlier print reference matches its actual currently held object, without accepting stale evidence',()=>{
  const f=fixture('food'),print={action:'print',label:'Print food'},steps=[print,{action:'pick_up',target:'$step1'},{action:'eat',target:'$step1'}];
  f.brain.stepResults[0]={status:'verified',stepIndex:0,cycle:12,action:'print',step:structuredClone(print),entityId:'food',creationRecordId:'creation-1'};
  assert.equal(check(f,steps,{startIndex:2}),true);
  assert.equal(check(f,[...steps.slice(0,2),eat],{startIndex:2}),true);
  assert.equal(check(f,[...steps.slice(0,2),{action:'drop',target:'$step1'},eat],{startIndex:2}),true);
  f.brain.stepResults[0].cycle=11;assert.throws(()=>check(f,steps,{startIndex:2}),/no verified created object/);
});
