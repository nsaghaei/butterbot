import test from 'node:test';
import assert from 'node:assert/strict';
import {Physics} from '../physics.mjs';
import {compileDesign} from '../design.mjs';
import {sampleForKind} from '../world.mjs';

const block=await compileDesign({name:'Small physics cube',description:'A small cube for carrying.',kind:'prop',affordances:['display'],mass:1,code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshToonMaterial({color:0xcc8855})));return g;'});
const tick=(p,n)=>{for(let i=0;i<n;i++)p.step();};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const variant=(attributes={},mass=1)=>({...block,mass,attributes});

test('throw releases at the actual grip with bounded ballistic velocity and restores collision filtering',()=>{
  const p=new Physics();
  try{
    const e=p.add(variant({maxThrowSpeed:4}),{x:-.4,y:.3,z:3});tick(p,60);p.carry(e.id);p.actor.activity='throw';p.actor.actionProgress=.45;tick(p,30);
    const before={...e.body.translation()};assert.throws(()=>p.throwObject(e.id,'actor',{x:-1,z:10,speed:4.1}),/limit/);assert.equal(e.carrier,'actor');
    const launch=p.throwObject(e.id,'actor',{x:-1,z:10,speed:4});
    assert.deepEqual(launch.position,before);assert.deepEqual({...e.body.translation()},before);assert.equal(e.carried,false);assert.equal(e.carrier,null);assert.ok(e.body.isDynamic());
    const velocity=e.body.linvel();assert.ok(Math.abs(Math.hypot(velocity.x,velocity.y,velocity.z)-4)<.001);assert.ok(velocity.y>0);
    assert.equal(e.body.collider(0).collisionGroups(),0x00080001);
    tick(p,6);assert.ok(e.body.translation().y>before.y);assert.ok(e.body.translation().z>before.z+.25);
    tick(p,12);assert.equal(e.body.collider(0).collisionGroups(),0xffffffff);assert.ok(distance(e.body.translation(),before)>.5);
    assert.throws(()=>p.throwObject(e.id,'actor',{x:0,z:8}),/held/);
  }finally{p.dispose();}
});

test('anchored and heavy objects cannot be carried; anchors are actual fixed bodies',()=>{
  const p=new Physics();
  try{
    const anchor=p.add(variant({anchored:true},40),{x:1,y:1,z:3}),heavy=p.add(variant({},30),{x:-2,y:.3,z:3}),forbidden=p.add(variant({portable:false}),{x:-1,y:.3,z:4});
    const original={...anchor.body.translation()};assert.ok(anchor.body.isFixed());
    for(const e of [anchor,heavy,forbidden])assert.throws(()=>p.carry(e.id),/cannot be carried/);
    assert.throws(()=>p.pushObject(anchor.id),/cannot be pushed/);tick(p,120);assert.deepEqual({...anchor.body.translation()},original);
    const snapshot=p.snapshot().find(e=>e.id===anchor.id);assert.equal(snapshot.attributes.anchored,true);assert.equal(snapshot.attributes.portable,false);assert.equal(snapshot.mass,40);
  }finally{p.dispose();}
});

test('push applies a bounded horizontal impulse to a nearby physical object',()=>{
  const p=new Physics();
  try{
    const e=p.add(variant({},30),{x:1,y:.3,z:3});tick(p,90);const before={...e.body.translation()},velocity={...e.body.linvel()};
    assert.throws(()=>p.pushObject(e.id,'actor',{x:8,z:3,strength:4}),/strength/);
    const result=p.pushObject(e.id,'actor',{x:8,z:3,strength:3});assert.ok(Math.hypot(result.impulse.x,result.impulse.z)<=20);assert.equal(result.impulse.y,0);assert.ok(e.body.linvel().x>velocity.x+.5);
    tick(p,12);assert.ok(e.body.translation().x>before.x+.02);
    const far=p.add(variant(),{x:8,y:.3,z:8});assert.throws(()=>p.pushObject(far.id),/Approach/);
  }finally{p.dispose();}
});

test('giving transfers ownership and the real held object to the nearby recipient grip',()=>{
  const p=new Physics();
  try{
    const recipient=p.character('recipient',{x:.5,y:1.2,z:3});recipient.name='Recipient';
    const e=p.add(variant({giftable:true}),{x:-.5,y:.3,z:3});tick(p,60);p.carry(e.id);tick(p,30);
    const donorPosition={...e.body.translation()};p.giftObject(e.id,'actor','recipient');
    assert.equal(e.owner,'recipient');assert.equal(e.carrier,'recipient');assert.equal(e.carried,true);tick(p,30);
    assert.ok(distance(e.body.translation(),p.gripPosition(recipient))<.02);assert.ok(distance(e.body.translation(),donorPosition)>1);
    const other=p.add(variant(),{x:-1,y:.3,z:4});p.carry(other.id);assert.throws(()=>p.giftObject(other.id,'actor','recipient'),/occupied/);
    const remote=p.character('remote',{x:8,y:1.2,z:8});assert.throws(()=>p.giftObject(other.id,'actor',remote.id),/Approach/);assert.equal(other.carrier,'actor');
  }finally{p.dispose();}
});

test('edible state initializes from attributes and removing consumed food removes its actual body and proxy',()=>{
  const p=new Physics();
  try{
    const originalResources=p.ammoOwned.length,e=p.add(variant({edible:true,servings:2}),{x:1,y:.3,z:3}),handle=e.body.handle,colliderHandle=e.body.collider(0).handle;
    assert.equal(e.edible,true);assert.equal(e.servings,2);assert.ok(p.proxies.has(e.id));
    assert.equal(p.remove(e.id),true);assert.equal(p.entities.has(e.id),false);assert.equal(p.proxies.has(e.id),false);
    assert.equal(p.world.getRigidBody(handle),null);assert.equal(p.world.getCollider(colliderHandle),null);assert.equal(p.ammoOwned.length,originalResources);
    assert.equal(p.remove(e.id),false);tick(p,10);
  }finally{p.dispose();}
});

test('removing soft objects, fracture bodies and articulated characters cleans their physics resources',async()=>{
  const soft=await compileDesign(sampleForKind({kind:'soft',interaction:'squish'})),breakable=await compileDesign(sampleForKind({kind:'breakable',interaction:'break'})),p=new Physics();
  try{
    const a=p.add(soft,{x:3,y:1,z:3}),b=p.add(breakable,{x:5,y:1,z:3}),c=p.character('temporary',{x:7,y:1.2,z:3});
    p.break(b);const fragments=b.fragments.map(f=>f.body.handle),rigHandles=Object.values(c.rig.parts).map(part=>part.body.handle);
    p.remove(a.id);p.remove(b.id);p.remove(c.id);tick(p,10);
    assert.ok(fragments.every(handle=>p.world.getRigidBody(handle)===null));assert.ok(rigHandles.every(handle=>p.world.getRigidBody(handle)===null));assert.equal(p.entities.size,1);
  }finally{p.dispose();}
});

test('object action progress produces distinct finite muscle targets and physical arm movement',()=>{
  const p=new Physics();
  try{
    tick(p,180);const idle={...p.actor.rig.parts.forearmR.body.translation()},samples={};
    for(const activity of ['pick_up','drop','place','throw','push','give','eat']){
      p.actor.activity=activity;p.actor.actionProgress=.45;tick(p,24);const pose=p.actor.rig.snapshot().pose;samples[activity]=structuredClone(pose);
      assert.equal(pose.activity,activity);assert.ok(Object.values(pose.targets).every(t=>Object.values(t).every(Number.isFinite)));
      assert.ok(p.actor.rig.snapshot().bodies.every(part=>Object.values(part.position).every(Number.isFinite)));
    }
    assert.ok(samples.eat.targets.forearmR.y>samples.pick_up.targets.forearmR.y+.5);
    assert.ok(samples.throw.targets.forearmR.z<samples.give.targets.forearmR.z-.4);
    assert.ok(distance(p.actor.rig.parts.forearmR.body.translation(),idle)>.2);
    p.actor.activity='throw';p.actor.actionProgress=.2;p.step();const before=structuredClone(p.actor.rig.pose.targets.forearmR);p.actor.actionProgress=.8;p.step();assert.ok(distance(before,p.actor.rig.pose.targets.forearmR)>.4);
  }finally{p.dispose();}
});

test('printer typing raises both physical forearms and alternates their tapping targets',()=>{
  const p=new Physics();
  try{
    tick(p,180);const left={...p.actor.rig.parts.forearmL.body.translation()},right={...p.actor.rig.parts.forearmR.body.translation()};p.actor.activity='print';tick(p,120);
    assert.ok(p.actor.rig.parts.forearmL.body.translation().y>left.y+.15);assert.ok(p.actor.rig.parts.forearmR.body.translation().y>right.y+.15);
    const first=structuredClone(p.actor.rig.pose.targets);tick(p,10);const next=p.actor.rig.pose.targets;
    const leftDelta=next.forearmL.y-first.forearmL.y,rightDelta=next.forearmR.y-first.forearmR.y;assert.ok(Math.abs(leftDelta)>.001);assert.ok(leftDelta*rightDelta<0);
    assert.ok(p.actor.rig.parts.forearmL.body.rotation().x<-.1);assert.ok(p.actor.rig.parts.forearmR.body.rotation().x<-.1);
  }finally{p.dispose();}
});
