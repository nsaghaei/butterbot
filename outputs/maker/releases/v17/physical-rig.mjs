// Hybrid physical animation: navigation is a KCC; these are dynamic, jointed bodies.
// Bounded PD muscles track balance and stepping targets. This is not unassisted locomotion.
const v=(x=0,y=0,z=0)=>({x,y,z});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class PhysicalRig {
  constructor(R,world,actor){
    this.R=R;this.world=world;this.actor=actor;this.parts={};this.joints=[];this.phase=0;this.strength=1;this.shoveTime=0;this.time=0;this.contacts=0;this.stumbleCount=0;this.feet={};this.scale=actor.height/1.9;
    const p=actor.body.translation();this.center={x:p.x,y:p.y-actor.height/2,z:p.z};this.heading=actor.heading;this.speed=0;this.last={...p};
    const definitions={pelvis:[0,.83,0,.25,.15,.18,12],torso:[0,1.15,0,.28,.23,.18,17],head:[0,1.64,0,.31,.29,.27,8]};
    for(const side of [-1,1]){const s=side<0?'L':'R';Object.assign(definitions,{['upperArm'+s]:[side*.40,1.16,0,.085,.19,.095,2],['forearm'+s]:[side*.42,.82,.025,.08,.17,.085,1.5],['thigh'+s]:[side*.16,.62,0,.11,.21,.13,5],['shin'+s]:[side*.16,.27,.015,.09,.17,.10,3],['foot'+s]:[side*.16,.075,.09,.13,.075,.22,1]});}
    for(const [name,d] of Object.entries(definitions)){const [x,y,z,hx,hy,hz,mass]=d.map((n,i)=>i<6?n*this.scale:n),body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x+x,this.center.y+y,p.z+z).setLinearDamping(1.2).setAngularDamping(2.4).setCcdEnabled(true));const collider=world.createCollider(R.ColliderDesc.cuboid(hx,hy,hz).setMass(mass).setFriction(name.startsWith('foot')?1.8:.55).setCollisionGroups(0x00020001),body);this.parts[name]={body,collider,rest:v(x,y,z),half:v(hx,hy,hz),mass};}
    const joint=(a,b,worldAnchor,axis,min,max)=>{const pa=this.parts[a].rest,pb=this.parts[b].rest,A=v(...worldAnchor.map((n,i)=>n*this.scale-[pa.x,pa.y,pa.z][i])),B=v(...worldAnchor.map((n,i)=>n*this.scale-[pb.x,pb.y,pb.z][i]));const j=world.createImpulseJoint(R.JointData.revolute(A,B,axis),this.parts[a].body,this.parts[b].body,true);j.setLimits(min,max);j.configureMotorPosition(0,30,6);this.joints.push({j,a,b});};
    joint('pelvis','torso',[0,.96,0],v(0,0,1),-.3,.3);joint('torso','head',[0,1.40,0],v(0,1,0),-.5,.5);
    for(const side of [-1,1]){const s=side<0?'L':'R';joint('torso','upperArm'+s,[side*.34,1.32,0],v(1,0,0),-1.8,1.1);joint('upperArm'+s,'forearm'+s,[side*.42,.98,0],v(1,0,0),-1.7,.15);joint('pelvis','thigh'+s,[side*.16,.79,0],v(1,0,0),-1,1);joint('thigh'+s,'shin'+s,[side*.16,.44,0],v(1,0,0),-.1,1.5);joint('shin'+s,'foot'+s,[side*.16,.12,.04],v(1,0,0),-.65,.65);}
  }
  shove(amount=2){this.parts.torso.body.applyImpulse(v(amount*4,amount*.25,0),true);this.strength=.28;this.shoveTime=this.time;this.stumbleCount++;}
  resetAt(position){
    // Initialize the connected limbs in one consistent pose. Upright positions
    // with reclining rotations stretch the joints and inject solver impulses.
    const a=this.actor,base=position.y-a.height/2,heading=a.heading||0,cos=Math.cos(heading),sin=Math.sin(heading),half=heading/2;
    const rotation=a.reclining?{x:Math.cos(half)*Math.SQRT1_2,y:Math.sin(half)*Math.SQRT1_2,z:-Math.sin(half)*Math.SQRT1_2,w:Math.cos(half)*Math.SQRT1_2}:{x:0,y:Math.sin(half),z:0,w:Math.cos(half)};
    for(const part of Object.values(this.parts)){
      let {x,y,z}=part.rest;if(a.reclining)[y,z]=[.95*this.scale-z,y-.95*this.scale];
      part.body.setTranslation(v(position.x+x*cos+z*sin,base+y,position.z-x*sin+z*cos),true);part.body.setRotation(rotation,true);
      part.body.setLinvel(v(),true);part.body.setAngvel(v(),true);part.body.resetForces(false);part.body.resetTorques(false);
    }
    for(const {j}of this.joints)j.configureMotorPosition(0,30,6);
    this.center=v(position.x,base,position.z);this.last={...position};this.heading=heading;this.feet={};this.speed=0;this.acceleration=0;this.turnRate=0;this.phase=0;this.strength=1;this.error=0;this.recovering=false;
  }
  step(dt){
    this.time+=dt;const previousSpeed=this.speed;const a=this.actor,p=a.body.translation(),rawSpeed=Math.hypot(p.x-this.last.x,p.z-this.last.z)/dt;this.last={...p};this.speed+=(Math.min(2.3,rawSpeed)-this.speed)*Math.min(1,dt*6);
    const turn=Math.atan2(Math.sin(a.heading-this.heading),Math.cos(a.heading-this.heading));this.heading+=turn*Math.min(1,dt*6);this.acceleration=(this.speed-previousSpeed)/dt;this.turnRate=turn/dt;const stride=.38*this.scale;this.phase+=dt*(this.speed>.08?this.speed/(stride*2)*Math.PI*2:0);this.strength=Math.min(1,this.strength+dt*.65);
    this.center.x+=(p.x-this.center.x)*Math.min(1,dt*14);this.center.z+=(p.z-this.center.z)*Math.min(1,dt*14);this.center.y=p.y-a.height/2;
    const cos=Math.cos(this.heading),sin=Math.sin(this.heading),point=(x,y,z)=>{if(a.reclining){const oldY=y;y=.95*this.scale-z;z=oldY-.95*this.scale;}return v(this.center.x+x*cos+z*sin,this.center.y+y,this.center.z-x*sin+z*cos);},targets={},pitches={};
    for(const [name,part]of Object.entries(this.parts))targets[name]=point(part.rest.x,part.rest.y,part.rest.z);
    const walking=this.speed>.15,carry=a.carrying,pose=a.activity,progress=clamp(Number(a.actionProgress)||0,0,1),reach=Math.sin(progress*Math.PI);
    if(a.reclining)for(const j of this.joints)j.j.configureMotorPosition(0,30*this.strength,6);
    for(const [idx,s]of ['L','R'].entries()){if(a.reclining)continue;
      const side=idx?1:-1,phase=(this.phase+idx*Math.PI)%(2*Math.PI),swing=phase<Math.PI,step=.38*Math.min(1,this.speed/1.8)*this.scale;
      const footName='foot'+s,rest=this.parts[footName].rest;
      if(!this.feet[s])this.feet[s]=targets[footName];
      if(walking&&swing){this.feet[s]=point(rest.x,rest.y+Math.sin(phase)*.18*this.scale,rest.z+(-1+2*phase/Math.PI)*step);}
      else if(!walking){const desired=point(rest.x,rest.y,rest.z);for(const k of ['x','y','z'])this.feet[s][k]+=(desired[k]-this.feet[s][k])*Math.min(1,dt*5);}
      const f=this.feet[s];targets[footName]={...f};targets['shin'+s]=v((f.x+targets['thigh'+s].x)*.5,this.center.y+.28*this.scale,(f.z+targets['thigh'+s].z)*.5);
      const armZ=carry?0:Math.sin(phase)*step*.9;targets['forearm'+s]=point(side*.42*this.scale,(carry?1.15:.82)*this.scale,carry?.46*this.scale:armZ);
      if(pose==='print'){
        const tap=Math.sin(this.time*9+idx*Math.PI)*.026;
        targets['upperArm'+s]=point(side*.36*this.scale,1.23*this.scale,.12*this.scale);
        targets['forearm'+s]=point(side*.28*this.scale,(1.20+tap)*this.scale,.46*this.scale);
        pitches['upperArm'+s]=-.45;pitches['forearm'+s]=-1.08;
      }
      if(a.speaking&&idx===0)targets['forearm'+s]=point(-.49*this.scale,(1.22+.08*Math.sin(this.time*4))*this.scale,.22*this.scale);
      if(pose==='dance'){targets['forearm'+s]=point(side*.60*this.scale,(1.2+.15*Math.sin(this.time*4+idx))*this.scale,.15);targets.torso.x+=Math.sin(this.time*3)*.06;}
      if(['pick_up','drop','place'].includes(pose)){
        targets['upperArm'+s]=point(side*.34*this.scale,(1.15-reach*.18)*this.scale,reach*.18*this.scale);
        targets['forearm'+s]=point(side*.25*this.scale,(1.10-reach*.54)*this.scale,(.40+reach*.20)*this.scale);
        pitches['upperArm'+s]=-.55*reach;pitches['forearm'+s]=-.8*reach;
      }
      if(['push','give'].includes(pose)){
        targets['upperArm'+s]=point(side*.35*this.scale,1.20*this.scale,(.10+reach*.10)*this.scale);
        targets['forearm'+s]=point(side*(pose==='give'?.24:.36)*this.scale,1.14*this.scale,(.40+reach*.30)*this.scale);
        pitches['upperArm'+s]=-.70-reach*.25;pitches['forearm'+s]=-1.05-reach*.30;
      }
      if(pose==='eat'){
        targets['forearm'+s]=point(side*.18*this.scale,(1.12+reach*.39)*this.scale,(.45-reach*.14)*this.scale);
        pitches['upperArm'+s]=-.7;pitches['forearm'+s]=-1.2-reach*.9;
      }
      if(pose==='throw'&&idx===1){
        const windup=Math.min(1,progress/.45),release=clamp((progress-.5)/.2,0,1),follow=clamp((progress-.7)/.3,0,1);
        targets['upperArm'+s]=point(.39*this.scale,(1.21+windup*.15-follow*.10)*this.scale,(.08-windup*.05+release*.13)*this.scale);
        targets['forearm'+s]=point(.41*this.scale,(1.22+windup*.36-release*.20-follow*.30)*this.scale,(.25-windup*.38+release*.80)*this.scale);
        pitches['upperArm'+s]=-.55-windup*.85+follow*.65;pitches['forearm'+s]=-1.05-windup*1.25+release*1.0+follow*.6;
      }
      for(const j of this.joints){if(j.b==='thigh'+s)j.j.configureMotorPosition(walking?Math.cos(phase)*.35:0,35*this.strength,8);if(j.b==='shin'+s)j.j.configureMotorPosition(walking&&swing?.5*Math.sin(phase):.06,30*this.strength,6);if(j.b==='upperArm'+s)j.j.configureMotorPosition(pitches[j.b]??(carry?-1:walking?-Math.cos(phase)*.40:0),22*this.strength,6);if(j.b==='forearm'+s)j.j.configureMotorPosition(pitches[j.b]===undefined?0:clamp(pitches[j.b]-(pitches['upperArm'+s]||0),-1.7,.15),20*this.strength,6);}
    }
    if(!a.reclining){const sway=Math.sin(this.phase)*.035*Math.min(1,this.speed),lean=Math.max(-.10,Math.min(.12,this.acceleration*.025))+this.speed*.015;for(const name of ['pelvis','torso','head']){const gain=name==='pelvis'?.5:1;targets[name].x+=(sway*cos+lean*sin)*gain;targets[name].z+=(-sway*sin+lean*cos)*gain;}targets.pelvis.y+=Math.abs(Math.sin(this.phase))*.02*Math.min(1,this.speed);}
    if(!a.reclining&&['pick_up','drop','place','push'].includes(pose))for(const name of ['torso','head']){const lean=reach*(pose==='push'?.10:.20)*this.scale;targets[name].x+=sin*lean;targets[name].z+=cos*lean;targets[name].y-=reach*.10*this.scale;pitches[name]=reach*.20;}
    this.pose={activity:pose||'idle',progress,targets:Object.fromEntries(Object.entries(targets).filter(([name])=>['head','torso','forearmL','forearmR'].includes(name)).map(([name,target])=>[name,{...target}]))};
    this.contacts=0;let error=0;
    for(const [name,part]of Object.entries(this.parts)){
      const body=part.body,t=targets[name],q=body.translation(),vel=body.linvel(),foot=name.startsWith('foot'),gain=(foot?100:45)*this.strength,damping=foot?17:12;
      body.resetForces(false);body.resetTorques(false);const force=v();for(const axis of ['x','y','z'])force[axis]=part.mass*clamp((t[axis]-q[axis])*gain-vel[axis]*damping+(axis==='y'?9.81:0),-80,80);body.addForce(force,true);
      const rot=body.rotation(),ang=body.angvel();let angle=this.heading;if(name==='head'&&a.lookPoint){const wanted=Math.atan2(a.lookPoint.x-q.x,a.lookPoint.z-q.z),d=Math.atan2(Math.sin(wanted-angle),Math.cos(wanted-angle));angle+=clamp(d,-.5,.5);}const pitch=pitches[name]||0,target=a.reclining?{x:Math.cos(this.heading/2)*Math.SQRT1_2,y:Math.sin(this.heading/2)*Math.SQRT1_2,z:-Math.sin(this.heading/2)*Math.SQRT1_2,w:Math.cos(this.heading/2)*Math.SQRT1_2}:{x:Math.cos(angle/2)*Math.sin(pitch/2),y:Math.sin(angle/2)*Math.cos(pitch/2),z:-Math.sin(angle/2)*Math.sin(pitch/2),w:Math.cos(angle/2)*Math.cos(pitch/2)},sign=target.w*rot.w+target.x*rot.x+target.y*rot.y+target.z*rot.z<0?-1:1;
      const err=v(-target.w*rot.x+target.x*rot.w-target.y*rot.z+target.z*rot.y,-target.w*rot.y+target.x*rot.z+target.y*rot.w-target.z*rot.x,-target.w*rot.z-target.x*rot.y+target.y*rot.x+target.z*rot.w);body.addTorque(v(...['x','y','z'].map(k=>clamp(err[k]*sign*12*this.strength-ang[k]*1.8,-12,12))),true);
      error+=Math.hypot(q.x-t.x,q.y-t.y,q.z-t.z);if(foot)this.world.contactPairsWith(part.collider,()=>this.contacts++);
    }
    this.error=error/Object.keys(this.parts).length;if(this.error>.36&&this.time-this.shoveTime>2){this.strength=Math.min(this.strength,.65);this.shoveTime=this.time;this.stumbleCount++;}this.recovering=this.strength<.98||this.error>.20;
  }
  snapshot(){return {model:'Dynamic jointed rig with PD muscles + KCC navigation',contacts:this.contacts,error:this.error||0,recovering:this.recovering,stumbles:this.stumbleCount,joints:this.joints.length,pose:this.pose,bodies:Object.entries(this.parts).map(([name,p])=>({name,position:p.body.translation(),rotation:p.body.rotation(),half:p.half,mass:p.mass}))};}
  dispose(){for(const joint of this.joints)this.world.removeImpulseJoint(joint.j,true);this.joints=[];for(const part of Object.values(this.parts))this.world.removeRigidBody(part.body);this.parts={};}
}

