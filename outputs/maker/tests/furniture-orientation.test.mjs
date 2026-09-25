import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {rotate} from '../physics.mjs';

for(const yaw of [0,Math.PI/2])for(const [id,use]of [['home-bed','rest'],['park-bench','sit']]){
  test(`${use} faces the furniture's ${use==='rest'?'pillow':'front'} at rotation ${yaw}`,()=>{
    const g=new Garden({seedFood:false,furnished:true});try{
      const b=g.selected,e=g.physics.entities.get(id),p=e.body.translation(),q={x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)};
      e.body.setRotation(q,true);const near={x:p.x,y:1.2,z:p.z+2};b.actor.body.setTranslation(near,true);b.actor.body.setNextKinematicTranslation(near);b.actor.heading=.83;
      b.planSteps=[{action:'use',target:id,use,label:'Use the furniture'}];b.startAction(b.planSteps[0]);
      const expected=rotate([0,0,use==='rest'?-1:1],q),actual={x:Math.sin(b.actor.heading),z:Math.cos(b.actor.heading)};
      assert.ok(Math.hypot(actual.x-expected.x,actual.z-expected.z)<.001);
      assert.equal(b.actor.seated,true);assert.equal(b.actor.reclining,use==='rest');assert.equal(b.actor.lookPoint,null);
      const surfaceIndex=e.design.meshes.findIndex(mesh=>mesh.name===(use==='rest'?'mattress':'seat_slat')),surface=e.design.colliders[surfaceIndex];assert.ok(surface,'authored furniture has a named usable surface');
      const expectedHeight=p.y+surface.center[1]+surface.half[1]+(use==='rest'?.22:.72);assert.ok(Math.abs(b.actor.body.translation().y-expectedHeight)<.001,'body rests on the mattress/seat, above the frame');
      for(let i=0;i<370;i++)g.step();assert.equal(b.stage,'awaiting_step_done',b.error||b.result?.description);
      assert.ok(Math.abs(Math.sin(b.actor.heading)-expected.x)<.001);
    }finally{g.physics.dispose();}
  });
}
