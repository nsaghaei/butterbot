import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {Physics} from '../physics.mjs';
const threeURL=import.meta.resolve('three');
const source=(await readFile(new URL('../web-next/avatars.js',import.meta.url),'utf8')).replace("'/three.js'",JSON.stringify(threeURL));
const {avatar,updateAvatar}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const mesh=(geometry,color,parent,position=[0,0,0])=>{const object=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color}));object.position.set(...position);parent.add(object);return object;};
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
