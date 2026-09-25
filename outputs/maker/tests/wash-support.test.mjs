import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDesign} from '../design.mjs';
import {accommodationDesigns} from '../needs.mjs';
import {Physics} from '../physics.mjs';
import {MakerWorld} from '../world.mjs';
import {objectInfo} from '../perception.mjs';

const proposal=accommodationDesigns().find(item=>item.id==='garden-shower').proposal;
const shower=await compileDesign(proposal);
const ticks=(world,n)=>{for(let i=0;i<n;i++)world.step(1/60);};
function install(physics){return physics.add(structuredClone(shower),{x:-1,y:shower.dimensions[1]/2+.02,z:1});}

test('wash designs require a supporting tray, real overhead clearance and an anchored body',async()=>{
  assert.ok(shower.washStation.outlet[1]-shower.washStation.stand[1]>=2.4);
  await assert.rejects(compileDesign({...proposal,attributes:{anchored:false}}),/anchored/);
  await assert.rejects(compileDesign({...proposal,code:proposal.code.replace("'shower_tray'","'decorative_plate'")}),/shower_tray/);
  await assert.rejects(compileDesign({...proposal,code:proposal.code.replace("'shower_head',0,2.68,0","'shower_head',0,1.8,0")}),/overhead/);
  await assert.rejects(compileDesign({...proposal,code:proposal.code.replace('return g;',"box('obstruction',0,1,0,.3,1.5,.3,0xaaaaaa);return g;")}),/obstructed/);
});

test('a robot walks onto the physical shower tray before water can activate',()=>{
  const p=new Physics();try{
    const e=install(p);ticks(p,60);
    const initial=p.washStation(e.id);assert.equal(initial.inside,false);
    assert.throws(()=>p.beginWash(e.id),/Stand on the shower tray/);
    const info=objectInfo({physics:p},e.id);assert.deepEqual(info.approach,initial.position);assert.ok(info.availableUses.includes('wash'));
    p.actor.goal={x:initial.position.x,z:initial.position.z};ticks(p,360);
    const reached=p.washStation(e.id,'actor',{requireInside:true});assert.equal(reached.inside,true);
    assert.ok(p.actor.travel>1.5);assert.ok(Math.abs(p.actor.body.translation().y-p.actor.height/2-reached.supportHeight)<.22);
    p.beginWash(e.id);p.actor.actionProgress=.4;const state=p.snapshot(),effect=state.find(item=>item.id===e.id).washEffect;
    assert.equal(effect.active,true);assert.equal(effect.actorId,'actor');assert.equal(effect.progress,.4);assert.equal(typeof effect.floor,'number');assert.equal(state.find(item=>item.id==='actor').washing,e.id);
    p.standUp();assert.equal(p.snapshot().find(item=>item.id===e.id).washEffect.active,false);assert.equal(p.actor.washing,null);
  }finally{p.dispose();}
});

test('shower preconditions reject distant actors, tilted plumbing and blocked standing space',()=>{
  const p=new Physics();try{
    const e=install(p);ticks(p,30);e.body.setTranslation({x:8,y:shower.dimensions[1]/2+.02,z:5},true);
    assert.throws(()=>p.washStation(e.id),/Approach/);
    e.body.setTranslation({x:-1,y:shower.dimensions[1]/2+.02,z:1},true);e.body.setRotation({x:Math.sin(.2),y:0,z:0,w:Math.cos(.2)},true);
    assert.throws(()=>p.washStation(e.id),/upright/);e.body.setRotation({x:0,y:0,z:0,w:1},true);
    const station=p.washStation(e.id);p.fixedBox('obstruction',{x:station.position.x,y:station.supportHeight+.6,z:station.position.z},{x:.2,y:.6,z:.2});
    assert.throws(()=>p.washStation(e.id),/blocked/);const info=objectInfo({physics:p},e.id);assert.ok(info.blockedActions.wash);assert.ok(!info.availableUses.includes('wash'));
  }finally{p.dispose();}
});

test('character gravity still accelerates an airborne body and settles without floating',()=>{
  const p=new Physics();try{
    const a=p.actor;a.body.setTranslation({x:0,y:5,z:4},true);a.body.setNextKinematicTranslation({x:0,y:5,z:4});
    p.step();const early=a.verticalVelocity;ticks(p,20);assert.ok(a.verticalVelocity<early);assert.ok(a.body.translation().y<5&&a.body.translation().y>1.5);
    ticks(p,160);const y=a.body.translation().y;assert.ok(y>1&&y<1.25);assert.equal(a.controller.computedGrounded(),true);ticks(p,60);assert.ok(Math.abs(a.body.translation().y-y)<.02);
  }finally{p.dispose();}
});

test('world starts its six-second wash clock after arrival and fulfills only on completion',()=>{
  const world=new MakerWorld({interaction:'wash',providers:{}});try{
    const e=install(world.physics),fulfilled=[];world.completeAccommodation=(kind,elapsed)=>fulfilled.push({kind,elapsed});ticks(world,60);
    world.activeId=e.id;world.stage='use';world.applyChoice('use',{outcome:''});assert.equal(world.washStarted,false);
    for(let i=0;i<600&&!world.washStarted;i++)world.step();assert.equal(world.washStarted,true,world.error);
    const arrival=world.time;ticks(world,300);assert.equal(world.stage,'interacting');assert.deepEqual(fulfilled,[]);
    for(let i=0;i<90&&world.stage==='interacting';i++)world.step();assert.equal(world.stage,'complete',world.result?.description);assert.ok(world.time-arrival>=6);
    assert.deepEqual(fulfilled,[{kind:'wash',elapsed:6}]);assert.equal(world.actor.washing,null);assert.equal(world.physics.snapshot().find(item=>item.id===e.id).washEffect.active,false);
  }finally{world.physics.dispose();}
});

test('leaving the shower or removing its body prevents completion and clears water effects',()=>{
  const world=new MakerWorld({interaction:'wash',providers:{}});try{
    const e=install(world.physics),fulfilled=[];world.completeAccommodation=(...args)=>fulfilled.push(args);ticks(world,60);world.activeId=e.id;world.stage='use';world.applyChoice('use',{outcome:''});
    for(let i=0;i<600&&!world.washStarted;i++)world.step();assert.equal(world.washStarted,true);
    const p=world.actor.body.translation();world.actor.body.setTranslation({...p,x:p.x+1},true);world.actor.body.setNextKinematicTranslation({...p,x:p.x+1});world.step();
    assert.equal(world.stage,'failed');assert.deepEqual(fulfilled,[]);assert.equal(world.actor.washing,null);
    world.actor.body.setTranslation(world.physics.washStation(e.id).position,true);world.physics.beginWash(e.id);assert.equal(e.washingBy,'actor');world.physics.remove(e.id);assert.equal(world.actor.washing,null);
  }finally{world.physics.dispose();}
});
