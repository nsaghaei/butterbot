import * as THREE from '/three.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
const vector=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),down=vector(0,-1,0);
export function avatar(id,{mesh}){
  const root=new THREE.Group(),body=new THREE.Group(),spine=new THREE.Group(),head=new THREE.Group();
  root.name='Connected human';root.add(body);body.add(spine);spine.position.y=.08;spine.add(head);head.position.set(0,.77,0);
  const c={skin:'#edb58d',shirt:'#60999b',trim:'#e7eee2',pants:'#435968',shoe:'#b68051',sole:'#f2e5cf',hair:'#553c30',eyes:'#374d55'};
  const ball=(p,r,color,pos=[0,0,0],scale=[1,1,1],outline=true)=>{const o=mesh(new THREE.SphereGeometry(r,20,14),color,p,pos,outline);o.scale.set(...scale);return o;};
  const box=(p,size,color,pos=[0,0,0],outline=true)=>mesh(new THREE.BoxGeometry(...size),color,p,pos,outline);
  const capsule=(p,length,r,color)=>mesh(new THREE.CapsuleGeometry(r,Math.max(.005,length-2*r),6,12),color,p,[0,-length/2,0]);
  const line=(p,points,r,color)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(a=>vector(...a))),12,r,6,false),color,p,[0,0,0],false);

  // One waist/chest/neck hierarchy; overlapping joint surfaces keep the silhouette connected.
  ball(body,.21,c.pants,[0,0,0],[1.06,.74,.73]);
  const torso=mesh(new THREE.CylinderGeometry(.245,.195,.52,20),c.shirt,spine,[0,.25,0]);torso.scale.z=.66;
  ball(spine,.21,c.shirt,[0,.48,0],[1.16,.42,.73]);
  mesh(new THREE.CylinderGeometry(.064,.072,.15,14),c.skin,spine,[0,.63,0]);
  box(spine,[.08,.34,.015],c.trim,[0,.36,.151],false);
  for(const y of [.25,.37,.49])ball(spine,.011,'#d2d6cb',[0,y,.163],[1,1,.5],false);
  for(const side of [-1,1]){const collar=box(spine,[.13,.10,.028],c.trim,[side*.065,.52,.12]);collar.rotation.z=side*.30;}
  box(spine,[.115,.13,.018],'#51868b',[-.105,.35,.146]);
  const pencil=mesh(new THREE.CylinderGeometry(.008,.008,.12,6),'#e9bc64',spine,[-.105,.425,.16]);pencil.rotation.z=-.1;
  const belt=mesh(new THREE.CylinderGeometry(.207,.207,.06,20),'#8d6045',body,[0,.085,0]);belt.scale.z=.76;
  box(body,[.07,.05,.02],'#d8b679',[0,.085,.163]);box(body,[.105,.16,.065],'#98704e',[-.17,-.015,.13]);

  ball(head,.151,c.skin,[0,0,0],[1,1.17,.94]);
  for(const side of [-1,1])ball(head,.035,c.skin,[side*.149,-.012,0],[.65,1,.85]);
  ball(head,.026,c.skin,[0,-.025,.151],[.8,1.2,1]);
  const eyes=[],brows=[];
  for(const side of [-1,1]){
    const eye=new THREE.Group();eye.position.set(side*.055,.027,.126);head.add(eye);eyes.push(eye);
    ball(eye,.044,'#fff9ee',[0,0,0],[1,.77,.45],false);
    ball(eye,.018,c.eyes,[-side*.002,-.001,.019],[.8,1.1,.5],false);
    ball(eye,.006,'#ffffff',[-.006,.008,.025],[1,1,.4],false);
    const brow=box(head,[.075,.012,.012],c.hair,[side*.058,.088,.12],false);brow.rotation.z=side*.08;brows.push(brow);
  }
  line(head,[[-.045,-.092,.127],[0,-.104,.14],[.047,-.089,.124]],.005,'#956057');
  const hair=mesh(new THREE.SphereGeometry(.158,20,14,0,Math.PI*2,0,Math.PI*.48),c.hair,head,[0,.024,-.009]);hair.scale.set(1.02,1.03,1.01);
  ball(head,.061,c.hair,[-.055,.15,.039],[1.4,.58,1]);ball(head,.05,c.hair,[.025,.162,.022],[1.3,.55,1]);

  const arms={},legs={},parts={body,spine,head};
  for(const side of [-1,1]){
    const s=side<0?'L':'R',shoulder=new THREE.Group(),elbow=new THREE.Group(),hand=new THREE.Group();
    spine.add(shoulder);shoulder.position.set(side*.255,.48,0);shoulder.add(elbow);elbow.position.y=-.31;elbow.add(hand);hand.position.y=-.29;
    ball(shoulder,.092,c.shirt,[0,0,0],[1,1,.9],false);capsule(shoulder,.31,.078,c.shirt);
    ball(elbow,.072,c.skin,[0,0,0],[1,1,1],false);capsule(elbow,.29,.059,c.skin);
    mesh(new THREE.CylinderGeometry(.08,.073,.07,12),c.trim,shoulder,[0,-.27,0]);
    ball(hand,.05,c.skin,[0,-.049,0],[.82,1.3,.64]);ball(hand,.023,c.skin,[-side*.04,-.04,.013],[.8,1.35,.8],false);
    arms[s]={upper:shoulder,lower:elbow,end:hand,lengths:[.31,.29],side};parts['upperArm'+s]=shoulder;parts['forearm'+s]=elbow;
    const hip=new THREE.Group(),knee=new THREE.Group(),foot=new THREE.Group();body.add(hip);hip.position.set(side*.117,-.04,0);hip.add(knee);knee.position.y=-.38;knee.add(foot);foot.position.y=-.34;
    ball(hip,.103,c.pants,[0,0,0],[1,.9,.95],false);capsule(hip,.38,.096,c.pants);ball(knee,.084,c.pants,[0,0,0],[1,1,1],false);capsule(knee,.34,.077,c.pants);
    ball(foot,.095,c.shoe,[0,-.036,.055],[.9,.64,1.65]);box(foot,[.175,.036,.30],c.sole,[0,-.082,.05]);
    for(const z of [.015,.065,.11])box(foot,[.10,.008,.014],c.trim,[0,.017,z],false);
    legs[s]={upper:hip,lower:knee,end:foot,lengths:[.38,.34],side};parts['thigh'+s]=hip;parts['shin'+s]=knee;parts['foot'+s]=foot;
  }
  root.userData.parts=parts;root.userData.human={body,spine,head,arms,legs,eyes,brows,clock:0,lastTime:null,speed:0,seated:0,reclining:0,lastPosition:null};
  root.traverse(o=>o.userData.entityId=id);return root;
}

// Fixed-length two-bone IK lets physical targets guide a unified visible body.
function solveChain(root,chain,target,bend){
  const parent=chain.upper.parent,world=root.localToWorld(target.clone()),end=parent.worldToLocal(world).sub(chain.upper.position),length=end.length(),[upper,lower]=chain.lengths;
  const direction=length>.0001?end.clone().divideScalar(length):down.clone(),distance=clamp(length,Math.abs(upper-lower)+.001,upper+lower-.002);
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const perpendicular=bend.clone().addScaledVector(direction,-bend.dot(direction));if(perpendicular.lengthSq()<1e-6)perpendicular.set(1,0,0).addScaledVector(direction,-direction.x);perpendicular.normalize();
  const joint=direction.clone().multiplyScalar(along).addScaledVector(perpendicular,height),endPoint=direction.multiplyScalar(distance);
  chain.upper.quaternion.setFromUnitVectors(down,joint.clone().normalize());
  chain.lower.quaternion.setFromUnitVectors(down,endPoint.sub(joint).normalize().applyQuaternion(chain.upper.quaternion.clone().invert()));
}
function sampleBody(e,previous,name,t){
  const b=e.rig?.bodies?.find(p=>p.name===name),a=previous?.rig?.bodies?.find(p=>p.name===name)||b;if(!b)return null;
  return {position:vector(a.position.x,a.position.y,a.position.z).lerp(vector(b.position.x,b.position.y,b.position.z),t),rotation:new THREE.Quaternion(a.rotation.x,a.rotation.y,a.rotation.z,a.rotation.w).slerp(new THREE.Quaternion(b.rotation.x,b.rotation.y,b.rotation.z,b.rotation.w),t),half:b.half};
}

export function updateAvatar(object,e,previous=e,alpha=1){
  const h=object.userData.human;if(!h)return;
  const t=clamp(alpha,0,1),now=performance.now()/1000,dt=h.lastTime===null?1/60:clamp(now-h.lastTime,.001,.08);h.lastTime=now;h.clock+=dt;
  const position=vector(previous.position.x,previous.position.y,previous.position.z).lerp(vector(e.position.x,e.position.y,e.position.z),t),pelvis=sampleBody(e,previous,'pelvis',t),scale=clamp((pelvis?.half?.x||.25)/.25,.7,1.6);
  const heading=(previous.heading||0)+Math.atan2(Math.sin((e.heading||0)-(previous.heading||0)),Math.cos((e.heading||0)-(previous.heading||0)))*t;
  const rawSpeed=h.lastPosition?Math.min(2.4,Math.hypot(position.x-h.lastPosition.x,position.z-h.lastPosition.z)/dt):0;h.lastPosition=position.clone();h.speed+=(rawSpeed-h.speed)*(1-Math.exp(-8*dt));
  h.seated+=((e.seated&&!e.reclining?1:0)-h.seated)*(1-Math.exp(-12*dt));h.reclining+=((e.reclining?1:0)-h.reclining)*(1-Math.exp(-12*dt));
  const seated=h.seated,lying=h.reclining,standing=1-Math.max(seated,lying),travel=mix(previous.travel||0,e.travel||0,t),phase=travel/(1.35*scale)*Math.PI*2,walk=clamp(h.speed/1.8,0,1)*standing;
  const activity=e.activity||e.rig?.pose?.activity||'idle',progress=clamp(mix(previous.actionProgress||0,e.actionProgress||0,t),0,1),reach=Math.sin(progress*Math.PI),bend=['pick_up','drop','place'].includes(activity)?reach:0;
  const base=Math.max(.005,position.y-.95*scale),seatedBase=position.y-.72-.73*scale,lyingBase=position.y-.22;
  object.position.set(position.x,mix(mix(base,seatedBase,seated),lyingBase,lying),position.z);object.rotation.set(0,heading,0);object.scale.setScalar(scale);
  h.body.position.set(0,mix(.83-.10*bend-.018*Math.abs(Math.sin(phase))*walk,.16,lying),0);
  h.body.rotation.set(lying*Math.PI/2,Math.sin(phase)*.035*walk,Math.sin(phase)*.018*walk);
  h.spine.rotation.set((.035*walk+.40*bend)*(1-lying),-Math.sin(phase)*.065*walk,Math.sin(phase)*.025*walk);
  if(activity==='dance'&&standing>.8){h.body.position.y+=Math.sin(progress*Math.PI*8)*.035;h.spine.rotation.z=Math.sin(progress*Math.PI*8)*.10;}
  const physicalHead=sampleBody(e,previous,'head',t);if(physicalHead){const q=physicalHead.rotation,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));h.head.rotation.y=clamp(Math.atan2(Math.sin(yaw-heading),Math.cos(yaw-heading)),-.5,.5)*standing;}
  h.head.rotation.x=activity==='inspect'?.10:0;
  const blinkPhase=h.clock%4.7,blink=blinkPhase>4.54?Math.max(.10,Math.abs(blinkPhase-4.62)/.08):1;for(const eye of h.eyes)eye.scale.y=blink;
  h.brows[0].rotation.z=-.08+(activity==='inspect'?.12:0);h.brows[1].rotation.z=.08+(activity==='print'?-.06:0);
  object.updateMatrixWorld(true);

  for(const [index,s]of ['L','R'].entries()){
    const chain=h.legs[s],side=chain.side,p=phase+index*Math.PI;
    if(lying>.85){chain.upper.rotation.set(-.03,0,0);chain.lower.rotation.set(.06,0,0);chain.end.rotation.set(0,0,0);continue;}
    let foot=vector(side*.117,.10+Math.max(0,Math.sin(p))*.095*walk,Math.cos(p)*.25*walk+.025);
    const physicalFoot=sampleBody(e,previous,'foot'+s,t);
    if(physicalFoot&&seated<.1&&bend<.1){const observed=object.worldToLocal(physicalFoot.position.clone());observed.x=clamp(observed.x,side*.117-.08,side*.117+.08);observed.y=clamp(observed.y,.08,.27);observed.z=clamp(observed.z,-.34,.34);foot.lerp(observed,.24);}
    if(seated>.01)foot.lerp(vector(side*.15,(.10*scale-object.position.y)/scale,.37),seated);
    solveChain(object,chain,foot,vector(0,0,1));object.updateMatrixWorld(true);
    const parentRotation=chain.lower.getWorldQuaternion(new THREE.Quaternion()),flat=object.getWorldQuaternion(new THREE.Quaternion());
    flat.multiply(new THREE.Quaternion().setFromAxisAngle(vector(1,0,0),Math.max(0,Math.sin(p))*.12*walk));chain.end.quaternion.copy(parentRotation.invert().multiply(flat));
  }
  object.updateMatrixWorld(true);
  for(const [index,s]of ['L','R'].entries()){
    const chain=h.arms[s],side=chain.side,p=phase+index*Math.PI;
    if(lying>.85){chain.upper.rotation.set(0,0,-side*.07);chain.lower.rotation.set(-.10,0,0);continue;}
    let hand=vector(side*.28,.83+.02*Math.sin(p)*walk,-Math.cos(p)*.22*walk+.04);
    const physicalTarget=e.rig?.pose?.targets?.['forearm'+s];
    if(physicalTarget&&['print','push','give','pick_up','drop','place'].includes(activity)){
      const oldTarget=previous.rig?.pose?.targets?.['forearm'+s]||physicalTarget;
      hand=object.worldToLocal(vector(oldTarget.x,oldTarget.y,oldTarget.z).lerp(vector(physicalTarget.x,physicalTarget.y,physicalTarget.z),t));hand.z+=.15;hand.y-=.075;
    }else if(activity==='eat')hand.set(side*.12,1.13+reach*.44,.47-reach*.24);
    else if(activity==='throw'&&s==='R'){const windup=clamp(progress/.45,0,1),release=clamp((progress-.5)/.20,0,1),follow=clamp((progress-.7)/.3,0,1);hand.set(.34,1.2+windup*.42-release*.18-follow*.24,.24-windup*.43+release*.83);}
    else if(activity==='dance')hand.set(side*(.38+.08*Math.cos(progress*20+index)),1.22+.22*Math.sin(progress*20+index),.13);
    else if(activity==='speak'||activity==='think')hand.set(side*.30,1.03+(index===0?.12*Math.sin(progress*8):0),.17);
    else if(physicalTarget&&['idle','move','approach'].includes(activity)){const carryTarget=object.worldToLocal(vector(physicalTarget.x,physicalTarget.y,physicalTarget.z));if(carryTarget.z>.3&&carryTarget.y>1)hand.set(side*.16,1.12,.57);}
    if(seated>.01&&activity==='idle')hand.lerp(vector(side*.18,.77,.40),seated);
    solveChain(object,chain,hand,vector(side*.25,-1,-.18));
  }
  object.updateMatrixWorld(true);h.debug={phase,speed:h.speed,activity,progress,scale,connected:true};
}
