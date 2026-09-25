import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';

const providers={generator:{ready:true},laya:{ready:true},healthTime:Date.now(),calls:{}};
function legacyBedSave(){
  const g=new Garden({providers,seedFood:false,furnished:true});try{
    // Reproduce the old save's frame-based rest placement (.44m frame + .22m posture offset).
    const a=g.physics.actor;a.body.setTranslation({x:6,y:.6599999666213989,z:5},true);a.seated=true;a.reclining=true;a.collider.setEnabled(false);a.heading=Math.PI;
    return g.save();
  }finally{g.physics.dispose();}
}

test('an old reclining save stands on the actual mattress before any physics tick or route repair',()=>{
  const saved=legacyBedSave(),g=new Garden({providers,seedFood:false});try{
    g.restore(saved);const b=g.selected,a=b.actor;assert.equal(a.reclining,true);assert.equal(a.body.translation().y,saved.world.entities.find(e=>e.id==='actor').position.y);
    const here={...a.body.translation()};b.assign('Walk to (6, 8).');assert.equal(a.seated,false);assert.equal(a.reclining,false);assert.equal(a.collider.isEnabled(),true);
    assert.equal(a.body.translation().x,here.x);assert.equal(a.body.translation().z,here.z);assert.ok(Math.abs(a.body.translation().y-(.65+a.height/2+.035))<.001,'upright center is above the mattress, not embedded over the lower wood frame');
    const goal={x:6,z:8},route=g.physics.planGroundRoute('actor',goal);assert.equal(route.ok,true,route.reason);
    const step={action:'move',...goal,label:'Walk away from the bed'};b.planSteps=[step];b.stage='action_decide';b.startAction(step);
    for(let i=0;i<900&&b.stage==='acting';i++)g.step();assert.equal(b.stage,'awaiting_step_done',b.error);assert.equal(b.navigationRecoveries,0);assert.ok(Math.hypot(a.body.translation().x-goal.x,a.body.translation().z-goal.z)<.18);assert.equal(b.logs.filter(l=>l.type==='action_outcome'&&l.status==='failed').length,0);
  }finally{g.physics.dispose();}
});

test('a support moved after creation is queried at its current transform during immediate stand-up',()=>{
  const g=new Garden({providers,seedFood:false,furnished:true});try{
    const bed=g.physics.entities.get('home-bed'),a=g.physics.actor;bed.body.setTranslation({x:4,y:bed.body.translation().y+.3,z:3},true);bed.body.setRotation({x:0,y:Math.sin(.6),z:0,w:Math.cos(.6)},true);
    a.body.setTranslation({x:4,y:.96,z:3},true);a.seated=true;a.reclining=true;a.collider.setEnabled(false);g.physics.standUp();
    assert.ok(Math.abs(a.body.translation().y-(.95+a.height/2+.035))<.001);assert.equal(a.body.translation().x,4);assert.equal(a.body.translation().z,3);assert.equal(g.physics.planGroundRoute('actor',{x:4,z:6}).ok,true);
  }finally{g.physics.dispose();}
});
