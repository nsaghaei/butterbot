import test from 'node:test';
import assert from 'node:assert/strict';
import {lifeNeeds,tickNeeds,fulfillNeed,accommodationDesigns,NEED_DEFAULTS,NEED_RATES} from '../needs.mjs';
import {compileDesign} from '../design.mjs';

test('six needs have finite defaults, bounded values and no shared mutable state',()=>{
  const a=lifeNeeds({energy:150,hunger:-10,fun:NaN,hygiene:Infinity,extra:50}),b=lifeNeeds();
  assert.deepEqual(Object.keys(a).sort(),['comfort','energy','fun','hunger','hygiene','social']);
  assert.equal(a.energy,100);assert.equal(a.hunger,0);assert.equal(a.fun,NEED_DEFAULTS.fun);assert.equal(a.hygiene,NEED_DEFAULTS.hygiene);
  a.social=0;assert.equal(b.social,NEED_DEFAULTS.social);assert.throws(()=>lifeNeeds(null),/object/);
});

test('baseline need decay reaches pressure thresholds after roughly 10–20 minutes and uses elapsed simulation time',()=>{
  const b={needs:lifeNeeds()},thresholds={hunger:90,energy:15,fun:20,hygiene:20,social:20,comfort:20};
  for(const key of Object.keys(NEED_DEFAULTS)){
    const seconds=Math.abs(NEED_DEFAULTS[key]-thresholds[key])/NEED_RATES[key];assert.ok(seconds>=600&&seconds<=1200,key);
  }
  tickNeeds(b,60);assert.ok(b.needs.hunger>NEED_DEFAULTS.hunger);
  for(const key of ['energy','fun','hygiene','social','comfort'])assert.ok(b.needs[key]<NEED_DEFAULTS[key]);
  const split={needs:lifeNeeds()};for(let i=0;i<60;i++)tickNeeds(split,1);
  for(const key of Object.keys(b.needs))assert.ok(Math.abs(b.needs[key]-split.needs[key])<1e-9);
  const before={...b.needs};assert.throws(()=>tickNeeds(b,-1),/nonnegative/);assert.deepEqual(b.needs,before);
  tickNeeds(b,100000);assert.equal(b.needs.hunger,100);assert.equal(b.needs.energy,0);
});

test('authored traits and actual activity affect different need pressures without mutating personality',()=>{
  const ordinary={needs:lifeNeeds(),actor:{activity:null}},core=Object.freeze({traits:Object.freeze({energetic:1,playful:1,sociable:1,neat:1,resilient:1})}),distinct={needs:lifeNeeds(),core,actor:{activity:null}},dancing={needs:lifeNeeds(),actor:{activity:'dance'}};
  tickNeeds(ordinary,120);tickNeeds(distinct,120);tickNeeds(dancing,120);
  assert.ok(distinct.needs.energy>ordinary.needs.energy);assert.ok(distinct.needs.hygiene>ordinary.needs.hygiene);assert.ok(distinct.needs.comfort>ordinary.needs.comfort);
  assert.ok(distinct.needs.fun<ordinary.needs.fun);assert.ok(distinct.needs.social<ordinary.needs.social);
  assert.ok(dancing.needs.energy<ordinary.needs.energy);assert.ok(dancing.needs.hygiene<ordinary.needs.hygiene);assert.ok(dancing.needs.hunger>ordinary.needs.hunger);
  assert.equal(distinct.core,core);assert.equal(distinct.core.traits.energetic,1);
});

test('completed activities recover their specific needs using actual elapsed duration',()=>{
  const b={needs:lifeNeeds({energy:20,hunger:70,fun:20,hygiene:10,comfort:10})};
  fulfillNeed(b,'rest',4);assert.ok(b.needs.energy>30);assert.equal(b.needs.hygiene,10);
  const beforeSleep=b.needs.energy;fulfillNeed(b,'sleep',4);assert.equal(b.needs.energy,beforeSleep+18);
  const beforeWash=b.needs.hygiene;fulfillNeed(b,'wash',5);assert.equal(b.needs.hygiene,beforeWash+40);
  const beforeSit=b.needs.comfort;fulfillNeed(b,'sit',4);assert.equal(b.needs.comfort,beforeSit+16);
  const beforeDance={...b.needs};fulfillNeed(b,'dance',5);assert.equal(b.needs.fun,beforeDance.fun+15);assert.ok(b.needs.energy<beforeDance.energy);
  const beforeEat=b.needs.hunger;fulfillNeed(b,'eat',5);assert.equal(b.needs.hunger,beforeEat-28);
  const unchanged={...b.needs};fulfillNeed(b,'wash',0);assert.deepEqual(b.needs,unchanged);
  assert.throws(()=>fulfillNeed(b,'teleport',3),/Unsupported/);assert.deepEqual(b.needs,unchanged);
  fulfillNeed(b,'wash',1000);assert.equal(b.needs.hygiene,100);assert.ok(Object.values(b.needs).every(n=>n>=0&&n<=100));
});

test('social fulfillment requires another nearby physical character and never invents a participant',()=>{
  const actor={id:'actor',controller:{},body:{translation:()=>({x:0,y:1,z:0})}},entities=new Map([['actor',actor]]),brain={actorId:'actor',actor,garden:{physics:{entities}},needs:lifeNeeds({social:20}),job:{target:'missing'}};
  assert.throws(()=>fulfillNeed(brain,'socialize',4),/another real character/);assert.equal(brain.needs.social,20);
  brain.job.target='actor';assert.throws(()=>fulfillNeed(brain,'socialize',4),/another real character/);
  const friend={id:'friend',controller:{},body:{translation:()=>({x:6,y:1,z:0})}};entities.set('friend',friend);brain.job.target='friend';
  assert.throws(()=>fulfillNeed(brain,'socialize',4),/nearby/);assert.equal(brain.needs.social,20);
  friend.body.translation=()=>({x:1.5,y:1,z:0});fulfillNeed(brain,'socialize',4);assert.equal(brain.needs.social,36);
});

test('accommodations have stable distinct IDs, supported purposes, fixed furniture and finite food',()=>{
  const items=accommodationDesigns(),again=accommodationDesigns();
  assert.deepEqual(items.map(x=>x.id),['home-bed','garden-shower','park-bench','snack-bowl']);
  assert.deepEqual(items.map(x=>x.proposal.affordances),[['rest'],['wash'],['sit'],['display']]);
  assert.ok(items.every(item=>Object.values(item.position).every(Number.isFinite)&&item.proposal.kind==='prop'&&item.proposal.mass<=250));
  for(const item of items.slice(0,3)){assert.equal(item.proposal.attributes.anchored,true);assert.equal(item.proposal.attributes.portable,false);assert.equal(item.proposal.attributes.edible,false);}
  const food=items.at(-1);assert.equal(food.proposal.attributes.edible,true);assert.equal(food.proposal.attributes.servings,6);assert.equal(food.proposal.attributes.throwable,false);
  items[0].proposal.attributes.anchored=false;items[0].position.x=99;assert.equal(again[0].proposal.attributes.anchored,true);assert.notEqual(again[0].position.x,99);
});

test('authored accommodation geometry compiles within the physical size budget',async()=>{
  for(const {id,proposal}of accommodationDesigns()){
    // Wash registration belongs to the Garden integration; this test isolates geometry.
    const compiled=await compileDesign({...proposal,affordances:proposal.affordances.map(use=>use==='wash'?'display':use)});
    assert.ok(compiled.dimensions.every(n=>n>0&&n<=3),id);assert.ok(compiled.stats.meshes>3,id);
    assert.ok(compiled.meshes.every(mesh=>mesh.name),id);assert.equal(compiled.attributes.edible,proposal.attributes.edible,id);
  }
});
