import test from 'node:test';
import assert from 'node:assert/strict';
import {updateMemory} from '../memory.mjs';

const remember=(text,kind='experience')=>({operation:'remember',id:'',text,kind});
const makeBrain=()=>({actorId:'actor',time:1,memory:[],memorySerial:0,memoryClock:0,core:Object.freeze({style:'curious',interests:Object.freeze(['flowers'])})});

test('repeated normalized inspections refresh one entry without consuming IDs or evicting useful memories',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const brain=makeBrain();
  updateMemory(brain,[remember('The tulip is a decorative flower.')]);
  for(let i=1;i<12;i++)updateMemory(brain,[remember('Useful history '+i+'.')]);
  const original={...brain.memory[0]},ids=brain.memory.map(m=>m.id),serial=brain.memorySerial,clock=brain.memoryClock;
  now=2000;brain.time=30;
  for(let i=0;i<15;i++)updateMemory(brain,[remember('  THE tulip\n is a decorative   flower.  ')]);
  assert.equal(brain.memory.length,12);assert.deepEqual(brain.memory.map(m=>m.id),ids);assert.equal(brain.memorySerial,serial);assert.deepEqual(brain.lastEvictions,[]);
  const refreshed=brain.memory[0];assert.equal(refreshed.text,original.text);assert.equal(refreshed.createdAt,original.createdAt);assert.equal(refreshed.updatedAt,2000);assert.equal(refreshed.lastUsed,2000);assert.equal(refreshed.time,30);assert.equal(refreshed.accessTick,clock+15);
  updateMemory(brain,[remember('A new useful observation.')]);
  assert.ok(brain.memory.some(m=>m.id===original.id));assert.ok(!brain.memory.some(m=>m.id===ids[1]));assert.deepEqual(brain.lastEvictions.map(m=>m.id),[ids[1]]);
});

test('same-batch duplicate remembers and canonically equivalent Unicode reuse the existing entry',()=>{
  const brain=makeBrain();updateMemory(brain,[remember('Café has shade.'),remember('Cafe\u0301 has shade.'),remember('  CAFÉ has shade. ')]);
  assert.equal(brain.memory.length,1);assert.equal(brain.memorySerial,1);assert.equal(brain.memoryClock,3);assert.equal(brain.memory[0].id,'actor-memory-1');
});

test('different kinds, opposite claims, quantities and punctuation remain distinct',()=>{
  const brain=makeBrain();
  updateMemory(brain,[remember('The flower is edible.'),remember('The flower is not edible.'),remember('The flower is edible.','belief')]);
  updateMemory(brain,[remember('There are 2 flowers.'),remember('There are 3 flowers.'),remember('The flower is edible?')]);
  assert.equal(brain.memory.length,6);assert.equal(brain.memorySerial,6);
});

test('explicit revise and forget retain their exact-ID semantics and cannot edit permanent core',()=>{
  const brain=makeBrain(),core=brain.core;
  updateMemory(brain,[remember('First observation.'),remember('Second observation.')]);
  const [first,second]=brain.memory.map(m=>m.id);
  updateMemory(brain,[{operation:'revise',id:second,text:'First observation.',kind:'experience'}]);
  assert.equal(brain.memory.length,2);assert.deepEqual(brain.memory.map(m=>m.id),[first,second]);
  updateMemory(brain,[{operation:'forget',id:first,text:'',kind:'experience'}]);
  assert.deepEqual(brain.memory.map(m=>m.id),[second]);assert.equal(brain.core,core);
  assert.throws(()=>updateMemory(brain,[{operation:'revise',id:'core',text:'Change personality',kind:'belief'}]),/unknown entry/);
  assert.equal(brain.core,core);
});

test('a later invalid edit rolls back an earlier duplicate refresh atomically',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const brain=makeBrain();updateMemory(brain,[remember('A familiar flower.')]);
  const before=structuredClone(brain);now=9000;
  assert.throws(()=>updateMemory(brain,[remember('A FAMILIAR FLOWER.'),{operation:'forget',id:'missing',text:'',kind:'experience'}]),/unknown entry/);
  assert.deepEqual(brain,before);
});
