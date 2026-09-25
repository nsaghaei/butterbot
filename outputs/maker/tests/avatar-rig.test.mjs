import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {Physics} from '../physics.mjs';
import {compileDesign} from '../design.mjs';
const threeURL=import.meta.resolve('three');
const source=(await readFile(new URL('../web-next/avatars.js',import.meta.url),'utf8')).replace("'/three.js'",JSON.stringify(threeURL));
const {avatar,updateAvatar}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const mesh=(geometry,color,parent,position=[0,0,0])=>{const object=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color}));object.position.set(...position);parent.add(object);return object;};
test('a held orange stays within the robot palms while listening, speaking, thinking and walking',async()=>{
  const design=await compileDesign({name:'Orange',description:'A small carryable orange.',kind:'prop',mass:.15,affordances:['display'],attributes:{portable:true,giftable:true},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(.105,12,8),new THREE.MeshBasicMaterial({color:0xffaa22})));return g;'});
  const p=new Physics(),model=avatar('pip',{mesh}),pip=p.character('pip',{x:2,y:1.2,z:4});
  try{
    const object=p.add(design,{x:2,y:.3,z:4.4});p.carry(object.id,'pip');
    let previous=p.snapshot().find(e=>e.id==='pip'),contacts=0;
    for(const heading of [0,Math.PI/2,-2.1])for(const activity of [null,'listen','speak','think','move']){
      const start={...pip.body.translation()};pip.heading=heading;pip.activity=activity;pip.speaking=activity==='speak';pip.goal=activity==='move'?{x:start.x+Math.sin(heading)*.6,z:start.z+Math.cos(heading)*.6}:null;
      for(let i=0;i<20;i++)p.step();
      const state=p.snapshot(),e=state.find(e=>e.id==='pip'),item=state.find(e=>e.id===object.id);
      assert.equal(e.heldObject.id,object.id);assert.deepEqual(e.heldObject.position,{...item.position});
      assert.equal(state.find(e=>e.id==='actor').heldObject,null,'the other robot must not support this object');
      if(activity==='move')assert.ok(Math.hypot(e.position.x-start.x,e.position.z-start.z)>.1,'check the carrying pose during actual walking');
      // Interpolation must use the same previous/current object transform as rendering.
      updateAvatar(model,e,previous,1);model.updateMatrixWorld(true);
      for(const chain of Object.values(model.userData.human.arms)){
        const palm=chain.end.localToWorld(new THREE.Vector3(0,-.085,0)),center=new THREE.Vector3(item.position.x,item.position.y,item.position.z);
        assert.ok(palm.distanceTo(center)<.145,`${activity||'idle'} palm gap ${palm.distanceTo(center).toFixed(3)}m`);
        contacts++;
      }
      previous=e;
    }
    assert.equal(contacts,30);p.release(object.id);assert.equal(p.snapshot().find(e=>e.id==='pip').heldObject,null);
  }finally{p.dispose();}
});
test('Butterbot and Pip have independent connected bodies and visibly distinct palettes during conversation',()=>{
  const butter=avatar('actor',{mesh}),pip=avatar('pip',{mesh}),base={position:{x:0,y:.95,z:0},heading:0,actionProgress:.5};
  assert.notEqual(butter.userData.palette.shell,pip.userData.palette.shell);assert.notEqual(butter.userData.palette.teal,pip.userData.palette.teal);assert.notEqual(butter.userData.parts.head,pip.userData.parts.head);
  for(const [id,model]of [['actor',butter],['pip',pip]])model.traverse(o=>assert.equal(o.userData.entityId,id));
  for(let i=0;i<60;i++){
    updateAvatar(butter,{...base,activity:'speak'});updateAvatar(pip,{...base,position:{x:2,y:.95,z:0},activity:'listen'});
    for(const model of [butter,pip]){model.updateMatrixWorld(true);model.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));for(const chain of [...Object.values(model.userData.human.arms),...Object.values(model.userData.human.legs)]){const start=chain.upper.getWorldPosition(new THREE.Vector3()),joint=chain.lower.getWorldPosition(new THREE.Vector3()),end=chain.end.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(start.distanceTo(joint)-chain.lengths[0])<1e-6);assert.ok(Math.abs(joint.distanceTo(end)-chain.lengths[1])<1e-6);}}
  }
  assert.equal(butter.position.x,0);assert.equal(pip.position.x,2);assert.equal(butter.userData.human.head.rotation.x,0);assert.notEqual(pip.userData.human.head.rotation.x,0,'only the listener nods');
});
test('receiving hands follow physical targets and keep supporting the held object after the handoff',()=>{
  const model=avatar('pip',{mesh}),base={position:{x:3,y:.95,z:2},heading:0,rig:{pose:{targets:{forearmL:{x:2.84,y:1.2,z:2.45},forearmR:{x:3.16,y:1.2,z:2.45}}}}};
  for(const activity of ['receive','idle'])for(const progress of [0,.25,.5,.75,1]){
    updateAvatar(model,{...base,activity,actionProgress:progress});model.updateMatrixWorld(true);
    for(const chain of Object.values(model.userData.human.arms)){
      const shoulder=chain.upper.getWorldPosition(new THREE.Vector3()),elbow=chain.lower.getWorldPosition(new THREE.Vector3()),hand=chain.end.getWorldPosition(new THREE.Vector3()),local=model.worldToLocal(hand.clone());
      assert.ok(local.z>.3&&local.y>1,'hands stay raised in front at the physical carry target');assert.ok(Math.abs(shoulder.distanceTo(elbow)-chain.lengths[0])<1e-6);assert.ok(Math.abs(elbow.distanceTo(hand)-chain.lengths[1])<1e-6);
    }
    model.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  }
});
test('robot remains connected with fixed limb lengths through walking, object actions, washing and furniture poses',()=>{
const model=avatar('actor',{mesh}),p=new Physics();let previous=p.snapshot()[0],checked=0;
function check(e){
  updateAvatar(model,e,previous,1);previous=e;model.updateMatrixWorld(true);const h=model.userData.human,scale=model.scale.x;
  for(const chain of [...Object.values(h.arms),...Object.values(h.legs)]){
    const start=chain.upper.getWorldPosition(new THREE.Vector3()),joint=chain.lower.getWorldPosition(new THREE.Vector3()),end=chain.end.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(start.distanceTo(joint)-chain.lengths[0]*scale)<1e-6);
    assert.ok(Math.abs(joint.distanceTo(end)-chain.lengths[1]*scale)<1e-6);
  }
  model.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));checked++;
}
try{
  for(let i=0;i<120;i++){p.step();check(p.snapshot()[0]);}
  const idleBounds=new THREE.Box3().setFromObject(model),height=idleBounds.max.y-idleBounds.min.y;assert.ok(height>2&&height<2.6);assert.ok(idleBounds.min.y>-.12&&idleBounds.min.y<.08,'robot feet meet the physical ground');
  p.actor.goal={x:3,z:6};p.actor.activity='move';for(let i=0;i<180;i++){p.step();check(p.snapshot()[0]);}
  for(const action of ['pick_up','drop','place','print','give','push','eat','throw','dance','wash']){
    p.actor.goal=null;p.actor.activity=action;for(let i=0;i<45;i++){p.actor.actionProgress=i/44;p.step();check(p.snapshot()[0]);}
  }
  p.actor.seated=true;p.actor.activity=null;for(let i=0;i<150;i++){p.step();check(p.snapshot()[0]);}
  p.actor.reclining=true;for(let i=0;i<150;i++){p.step();check(p.snapshot()[0]);}
  const distressed=p.snapshot()[0];for(const b of distressed.rig.bodies)b.position={x:20,y:-10,z:50};check(distressed);
  assert.equal(checked,1051);
}finally{p.dispose();}

});
