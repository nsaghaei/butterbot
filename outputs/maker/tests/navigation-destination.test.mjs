import test from 'node:test';
import assert from 'node:assert/strict';
import {Physics} from '../physics.mjs';
import {compileDesign} from '../design.mjs';
import {accommodationDesigns} from '../needs.mjs';
import {PRINTER} from '../environment-layout.mjs';

const furniture=await Promise.all(accommodationDesigns().filter(a=>['park-bench','home-bed'].includes(a.id)).map(async a=>({...a,design:await compileDesign(a.proposal)})));
const box=(name,half)=>({name,kind:'prop',mass:3,dimensions:half.map(n=>n*2),attributes:{anchored:true},affordances:['display'],colliders:[{center:[0,0,0],half}],meshes:[]});

test('bench and bed centers identify their actual solid furniture while clear user coordinates remain valid',()=>{
  const p=new Physics();try{
    for(const f of furniture){const e=p.add(f.design,{...f.position,y:f.design.dimensions[1]/2+.02});const result=p.groundMoveDestination(f.position);
      assert.equal(result.clear,false);assert.deepEqual(result.blocker,{id:e.id,name:f.proposal.name,kind:'prop'});assert.equal(result.position.x,f.position.x);assert.equal(result.position.z,f.position.z);
    }
    const before={...p.actor.body.translation()},goal=p.actor.goal,clear=p.groundMoveDestination({x:-4,z:5});assert.equal(clear.clear,true);assert.equal(clear.blocker,null);assert.equal(clear.position.x,-4);assert.equal(clear.position.z,5);
    assert.deepEqual({...p.actor.body.translation()},before);assert.equal(p.actor.goal,goal);
  }finally{p.dispose();}
});

test('fixed printer, keyboard and planter blockers retain stable fixture identities',()=>{
  const p=new Physics();try{
    for(const point of [PRINTER.center,PRINTER.keyboard]){const result=p.groundMoveDestination(point);assert.equal(result.clear,false);assert.equal(result.blocker.id,'printer');assert.match(result.blocker.name,/Printer/);}
    assert.equal(p.groundMoveDestination({x:6,z:-7}).blocker.id,'planter');assert.equal(p.groundMoveDestination(PRINTER.approach).clear,true);
  }finally{p.dispose();}
});

test('destination occupancy uses rotated collider geometry rather than a broad bounding box',()=>{
  const p=new Physics();try{
    const e=p.add(box('Diagonal railing',[1.5,.5,.08]),{x:0,y:1,z:0});e.body.setRotation({x:0,y:Math.sin(Math.PI/8),z:0,w:Math.cos(Math.PI/8)},true);
    assert.equal(p.groundMoveDestination({x:.9,z:.9}).clear,true);assert.equal(p.groundMoveDestination({x:.8,z:-.8}).blocker.id,e.id);
    e.body.setTranslation({x:4,y:1,z:0},true);assert.equal(p.groundMoveDestination({x:.8,z:-.8}).clear,true);assert.equal(p.groundMoveDestination({x:4.8,z:-.8}).blocker.id,e.id);
  }finally{p.dispose();}
});

test('destination checks ignore the actor, sensors and noninteracting groups but include another character',()=>{
  const p=new Physics();try{
    const here=p.actor.body.translation();assert.equal(p.groundMoveDestination(here).clear,true);
    const obstacle=p.fixedBox('Test obstacle',{x:4,y:1,z:4},{x:.4,y:1,z:.4});assert.equal(p.groundMoveDestination({x:4,z:4}).blocker.id,'Test obstacle');
    obstacle.setSensor(true);assert.equal(p.groundMoveDestination({x:4,z:4}).clear,true);obstacle.setSensor(false);obstacle.setEnabled(false);assert.equal(p.groundMoveDestination({x:4,z:4}).clear,true);
    obstacle.setEnabled(true);obstacle.setCollisionGroups(0x00020001);assert.equal(p.groundMoveDestination({x:4,z:4}).clear,true);
    const other=p.character('visitor',{x:4,y:1.2,z:4});other.name='Visitor';assert.deepEqual(p.groundMoveDestination({x:4,z:4}).blocker,{id:'visitor',name:'Visitor',kind:'character'});
    assert.equal(p.groundMoveDestination({x:4,z:4},'visitor').clear,true);
    assert.throws(()=>p.groundMoveDestination({x:NaN,z:4}),/finite/);assert.throws(()=>p.groundMoveDestination({x:4,z:4},'missing'),/real character/);
  }finally{p.dispose();}
});
