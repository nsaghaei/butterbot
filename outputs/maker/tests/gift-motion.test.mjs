import test from 'node:test';
import assert from 'node:assert/strict';
import {Physics} from '../physics.mjs';
import {compileDesign} from '../design.mjs';

const design=await compileDesign({name:'Gift',description:'A small asymmetric gift.',kind:'prop',mass:.2,affordances:['display'],attributes:{portable:true,giftable:true},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.2,.3,.4),new THREE.MeshToonMaterial({color:0xefac40})));return g;'});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)));
function fixture(gap){
  const physics=new Physics(),giver=physics.actor,recipient=physics.character('pip',{x:0,y:1.2,z:4+gap});
  giver.body.setTranslation({x:0,y:1.2,z:4},true);giver.heading=0;recipient.heading=Math.PI;
  giver.activity='give';recipient.activity='receive';giver.actionProgress=recipient.actionProgress=.52;
  const object=physics.add(structuredClone(design),{x:0,y:.5,z:4.4});physics.carry(object.id,'actor');
  for(let i=0;i<60;i++)physics.step();
  return {physics,giver,recipient,object};
}

test('gift contact preserves position and eases both translation and rotation into the recipient grip',()=>{
  for(const gap of [1.62782385,1.77281,1.8]){
    const {physics,giver,recipient,object}=fixture(gap);try{
      const before={...object.body.translation()},rotation={...object.body.rotation()};
      physics.giftObject(object.id,'actor','pip');
      assert.equal(object.owner,'pip');assert.equal(object.carrier,'pip');assert.ok(distance(before,object.body.translation())<1e-6);
      let previous=before,previousRotation=rotation,maxStep=0;
      for(let i=0;i<21;i++){
        physics.step();const position={...object.body.translation()},q={...object.body.rotation()};
        const delta=distance(previous,position);maxStep=Math.max(maxStep,delta);
        if(i===0){assert.ok(delta<.01,'first frame must not snap to the other grip');assert.ok(angle(previousRotation,q)<.03,'first frame must not flip the object');}
        assert.ok(angle(previousRotation,q)<.45,'rotation remains continuous through the handoff');
        assert.equal(object.carrier,'pip');previous=position;previousRotation=q;
      }
      assert.ok(maxStep<.04,'the measured 29.7cm jump is spread smoothly over the gesture');
      assert.ok(distance(object.body.translation(),physics.gripPosition(recipient))<1e-5);
      assert.equal(object.handoff,null);assert.equal(giver.activity,'give');
    }finally{physics.dispose();}
  }
});

test('releasing during the settling gesture cancels its transient carry transform',()=>{
  const {physics,object}=fixture(1.62782385);try{
    physics.giftObject(object.id,'actor','pip');physics.step();assert.ok(object.handoff);
    const before={...object.body.translation()};physics.release(object.id);assert.equal(object.handoff,null);
    physics.step();assert.equal(object.carried,false);assert.equal(object.carrier,null);
    assert.ok(Math.abs(object.body.translation().z-before.z)<.001,'release cannot keep chasing the recipient');
    physics.carry(object.id,'pip');assert.equal(object.handoff,null,'a later pickup cannot reuse the old gift transform');
  }finally{physics.dispose();}
});

test('restored settling data is bounded and must describe a valid carried object transform',()=>{
  const {physics,object}=fixture(1.62782385);try{
    physics.giftObject(object.id,'actor','pip');physics.step();
    const saved=physics.snapshot().find(e=>e.id===object.id).handoff;object.handoff=null;
    for(const invalid of [{...saved,duration:30},{...saved,elapsed:-1},{...saved,elapsed:NaN},{...saved,position:{x:999,y:0,z:0}},{...saved,rotation:{x:0,y:0,z:0,w:0}}])assert.equal(physics.restoreHandoff(object.id,invalid),false);
    assert.equal(object.handoff,null);assert.equal(physics.restoreHandoff(object.id,saved),true);assert.deepEqual(object.handoff,saved);assert.notEqual(object.handoff,saved);
    physics.release(object.id);assert.equal(physics.restoreHandoff(object.id,saved),false);
  }finally{physics.dispose();}
});
