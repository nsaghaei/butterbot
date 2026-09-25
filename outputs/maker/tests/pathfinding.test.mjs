import test from 'node:test';
import assert from 'node:assert/strict';
import {Physics} from '../physics.mjs';
import {compileDesign} from '../design.mjs';
import {accommodationDesigns} from '../needs.mjs';

const furniture=await Promise.all(accommodationDesigns().filter(a=>['home-bed','park-bench'].includes(a.id)).map(async a=>({id:a.id,design:await compileDesign(a.proposal)})));
const ticks=(p,n)=>{for(let i=0;i<n;i++)p.step();};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function positionActor(p,position){p.actor.body.setTranslation(position,true);p.actor.body.setNextKinematicTranslation(position);p.actor.rig.resetAt(position);ticks(p,30);}
function walk(p,goal,limit=1200){let frames=0,maxStep=0,maxDistance=distance(p.actor.body.translation(),goal);for(;frames<limit&&distance(p.actor.body.translation(),goal)>.15;frames++){const before={...p.actor.body.translation()};p.step();maxStep=Math.max(maxStep,distance(before,p.actor.body.translation()));maxDistance=Math.max(maxDistance,distance(p.actor.body.translation(),goal));}return {frames,maxStep,maxDistance};}

test('an open route preserves the exact final goal and is planned once across hundreds of frames',()=>{
  const p=new Physics();try{
    ticks(p,30);let calls=0;const plan=p.planGroundRoute.bind(p);p.planGroundRoute=(...args)=>{calls++;return plan(...args);};const goal={x:-4.13,z:5.07};p.actor.goal=goal;const result=walk(p,goal);ticks(p,180);
    assert.equal(calls,1);assert.equal(p.actor.goal,goal);assert.ok(distance(p.actor.body.translation(),goal)<.15);assert.equal(p.actor.route.status,'arrived');assert.deepEqual(p.actor.route.waypoints,[goal]);assert.ok(result.maxStep<.07);
    p.actor.goal=null;p.step();assert.equal(p.actor.route,null);
  }finally{p.dispose();}
});

for(const {id,design}of furniture)test('a real walk deterministically detours around '+id+' without changing the requested coordinates',()=>{
  const p=new Physics();try{
    p.add(structuredClone(design),{x:1,y:design.dimensions[1]/2+.02,z:3});positionActor(p,{x:-2,y:1.2,z:3});const goal={x:4,z:3},route=p.planGroundRoute('actor',goal),again=p.planGroundRoute('actor',goal);
    assert.equal(route.ok,true,route.reason);assert.ok(route.waypoints.length>1);assert.deepEqual(route.waypoints,again.waypoints);assert.ok(route.expanded<=900);p.actor.goal=goal;const result=walk(p,goal);
    assert.ok(distance(p.actor.body.translation(),goal)<.15,p.actor.route?.reason);assert.equal(p.actor.goal,goal);assert.ok(p.actor.travel>6.1);assert.ok(result.maxStep<.07);assert.ok(p.actor.route.replans<=3);assert.ok(p.actor.route.waypoints.some(point=>Math.abs(point.z-3)>.4));
    const snapshot=p.snapshot().find(e=>e.id==='actor');assert.deepEqual(snapshot.route.goal,goal);assert.ok(snapshot.route.waypoints.length>1);
  }finally{p.dispose();}
});

test('a U-shaped obstacle permits the necessary initial detour away from the final destination',()=>{
  const p=new Physics();try{
    p.fixedBox('front of U',{x:0,y:1,z:1.5},{x:1.6,y:1,z:.1});for(const x of [-1.5,1.5])p.fixedBox('side of U '+x,{x,y:1,z:2.5},{x:.1,y:1,z:1});positionActor(p,{x:0,y:1.2,z:3});const goal={x:0,z:-2},before=distance(p.actor.body.translation(),goal);p.actor.goal=goal;const result=walk(p,goal);
    assert.ok(result.maxDistance>before+.5);assert.ok(distance(p.actor.body.translation(),goal)<.15,p.actor.route?.reason);assert.equal(p.actor.goal,goal);assert.ok(result.maxStep<.07);
  }finally{p.dispose();}
});

test('an unreachable enclosure respects the search budget and only retries three times',()=>{
  const p=new Physics();try{
    for(const x of [2.5,5.5])p.fixedBox('enclosure side '+x,{x,y:1,z:4},{x:.1,y:1,z:1.6});for(const z of [2.5,5.5])p.fixedBox('enclosure end '+z,{x:4,y:1,z},{x:1.6,y:1,z:.1});ticks(p,30);const goal={x:4,z:4};assert.equal(p.groundMoveDestination(goal).clear,true);
    const limited=p.planGroundRoute('actor',goal,{maxNodes:80});assert.equal(limited.ok,false);assert.ok(limited.expanded<=80);assert.match(limited.reason,/budget|No ground route/);
    let calls=0;const plan=p.planGroundRoute.bind(p);p.planGroundRoute=(...args)=>{calls++;return plan(...args);};const before={...p.actor.body.translation()};p.actor.goal=goal;ticks(p,360);assert.equal(calls,4);assert.equal(p.actor.route.status,'blocked');assert.equal(p.actor.route.replans,3);assert.equal(p.actor.goal,goal);assert.ok(distance(before,p.actor.body.translation())<.03);
    assert.equal(p.planGroundRoute('actor',{x:14,z:0}).ok,false);assert.equal(p.planGroundRoute('actor',{x:0,z:13}).ok,false);
  }finally{p.dispose();}
});

for(const blocker of ['object','character'])test('a new '+blocker+' on the route triggers a bounded physical detour',()=>{
  const p=new Physics();try{
    positionActor(p,{x:-3,y:1.2,z:3});const goal={x:5,z:3};p.actor.goal=goal;ticks(p,45);assert.equal(p.actor.route.replans,0);
    if(blocker==='character')p.character('visitor',{x:1,y:1.2,z:3});
    else p.add({name:'Heavy moveable cabinet',kind:'prop',mass:80,dimensions:[.8,1.8,1.6],attributes:{anchored:false},affordances:['display'],colliders:[{center:[0,0,0],half:[.4,.9,.8]}],meshes:[]},{x:1,y:.92,z:3});
    const result=walk(p,goal);assert.ok(distance(p.actor.body.translation(),goal)<.15,p.actor.route?.reason);assert.ok(p.actor.route.replans>=1&&p.actor.route.replans<=3);assert.equal(p.actor.goal,goal);assert.ok(result.maxStep<.07);
  }finally{p.dispose();}
});
