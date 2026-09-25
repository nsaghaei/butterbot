import test from 'node:test';
import assert from 'node:assert/strict';
import {Physics} from '../physics.mjs';
import {compileDesign} from '../design.mjs';
import {accommodationDesigns} from '../needs.mjs';

const bed=await compileDesign(accommodationDesigns().find(a=>a.id==='home-bed').proposal);
const ticks=(p,n)=>{for(let i=0;i<n;i++)p.step();};
const box=(name,half)=>({name,kind:'prop',mass:3,dimensions:half.map(n=>n*2),attributes:{anchored:true},affordances:['display'],colliders:[{center:[0,0,0],half}],meshes:[]});

test('a physical robot walks from the bench side to a clear bed approach within interaction reach',()=>{
  const p=new Physics();try{
    const e=p.add(structuredClone(bed),{x:6,y:bed.dimensions[1]/2+.02,z:5}),actor=p.actor;actor.body.setTranslation({x:2,y:1.2,z:-3.5},true);actor.body.setNextKinematicTranslation({x:2,y:1.2,z:-3.5});actor.rig.resetAt(actor.body.translation());ticks(p,30);
    const center=p.position(e),here={...actor.body.translation()},length=Math.hypot(here.x-center.x,here.z-center.z),oldApproach={x:center.x+(here.x-center.x)/length*1.35,z:center.z+(here.z-center.z)/length*1.35};
    assert.equal(p.groundMoveDestination(oldApproach).clear,false,'the previous fixed center offset fell inside this bed');
    const point=p.interactionApproach(e.id);assert.equal(p.groundMoveDestination(point).clear,true);assert.ok(Math.hypot(point.x-center.x,point.z-center.z)<2.7);assert.deepEqual({...actor.body.translation()},here);
    actor.goal=point;for(let i=0;i<900&&Math.hypot(actor.body.translation().x-point.x,actor.body.translation().z-point.z)>.15;i++)p.step();
    assert.ok(Math.hypot(actor.body.translation().x-point.x,actor.body.translation().z-point.z)<.15);assert.ok(Math.hypot(actor.body.translation().x-center.x,actor.body.translation().z-center.z)<2.7);assert.ok(actor.travel>6);assert.equal(p.groundMoveDestination(point).clear,true);
  }finally{p.dispose();}
});

test('a small object uses the nearest point toward the actor on the first clear ring',()=>{
  const p=new Physics();try{
    const e=p.add(box('Small box',[.25,.25,.25]),{x:3,y:.25,z:2}),here=p.actor.body.translation(),point=p.interactionApproach(e.id),center=p.position(e),distance=Math.hypot(here.x-center.x,here.z-center.z);
    assert.ok(Math.abs(Math.hypot(point.x-center.x,point.z-center.z)-1.35)<1e-9);
    assert.ok(Math.abs(point.x-(center.x+(here.x-center.x)/distance*1.35))<1e-9);assert.ok(Math.abs(point.z-(center.z+(here.z-center.z)/distance*1.35))<1e-9);
    assert.throws(()=>p.interactionApproach(e.id,'actor',{reach:1}),/No clear ground approach/);
  }finally{p.dispose();}
});

test('surrounded targets fail explicitly without moving the character or inventing an approach',()=>{
  const p=new Physics();try{
    const e=p.add(box('Enclosed box',[.3,.3,.3]),{x:4,y:.3,z:4});p.fixedBox('Blocked zone',{x:4,y:1,z:4},{x:3,y:1,z:3});const before={...p.actor.body.translation()};
    assert.throws(()=>p.interactionApproach(e.id),/No clear ground approach within 2.7m of Enclosed box/);assert.deepEqual({...p.actor.body.translation()},before);assert.equal(p.actor.goal,null);
  }finally{p.dispose();}
});

test('large soft objects use their current solver-node footprint when selecting a clear approach',()=>{
  const p=new Physics();try{
    const e=p.add({...box('Soft cushion',[1.45,.5,1.45]),kind:'soft',attributes:{anchored:false},affordances:['squish']},{x:3,y:.6,z:2}),point=p.interactionApproach(e.id),nodes=p.softPositions(e),xs=nodes.filter((_,i)=>i%3===0),zs=nodes.filter((_,i)=>i%3===2),dx=Math.max(Math.min(...xs)-point.x,0,point.x-Math.max(...xs)),dz=Math.max(Math.min(...zs)-point.z,0,point.z-Math.max(...zs));
    assert.ok(Math.hypot(dx,dz)>=p.actor.radius+.05);assert.ok(Math.hypot(point.x-p.position(e).x,point.z-p.position(e).z)<=2.6);
  }finally{p.dispose();}
});
