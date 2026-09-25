import * as THREE from '/three.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
const vector=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),down=vector(0,-1,0);
export function avatar(id,{mesh}){
  const root=new THREE.Group(),body=new THREE.Group(),spine=new THREE.Group(),head=new THREE.Group();
  root.name='Connected expressive robot';root.add(body);body.add(spine);spine.position.y=.08;spine.add(head);head.position.set(0,.77,0);
  const c=id==='pip'?{shell:'#f5e2d3',metal:'#ab9c98',joint:'#574c52',teal:'#d68e80',screen:'#3f3038',light:'#ffe0b4',accent:'#b86461',sole:'#78676a'}:{shell:'#e6ece5',metal:'#899da2',joint:'#354b54',teal:'#61999c',screen:'#19343f',light:'#a3edf0',accent:'#dea54b',sole:'#536970'};
  const ball=(p,r,color,pos=[0,0,0],scale=[1,1,1],outline=true)=>{const o=mesh(new THREE.SphereGeometry(r,20,14),color,p,pos,outline);o.scale.set(...scale);return o;};
  const box=(p,size,color,pos=[0,0,0],outline=true)=>mesh(new THREE.BoxGeometry(...size),color,p,pos,outline);
  const capsule=(p,length,r,color)=>mesh(new THREE.CapsuleGeometry(r,Math.max(.005,length-2*r),6,12),color,p,[0,-length/2,0]);
  const line=(p,points,r,color)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(a=>vector(...a))),12,r,6,false),color,p,[0,0,0],false);
  const rounded=(parent,w,h,d,r,color,pos=[0,0,0],outline=true)=>{
    const x=-w/2,y=-h/2,shape=new THREE.Shape();r=Math.min(r,w/2,h/2);
    shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
    const bevel=Math.min(.009,d/4,r/3),geometry=new THREE.ExtrudeGeometry(shape,{depth:d-2*bevel,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:6});geometry.translate(0,0,-d/2+bevel);return mesh(geometry,color,parent,pos,outline);
  };

  // Attached shell sections and exposed joint bearings share the same connected skeleton.
  rounded(body,.38,.25,.28,.07,c.teal);
  mesh(new THREE.CylinderGeometry(.145,.155,.17,16),c.joint,body,[0,.13,0]);
  rounded(spine,.46,.49,.31,.085,c.shell,[0,.27,0]);
  rounded(spine,.19,.14,.018,.028,c.screen,[0,.37,.167]);
  ball(spine,.036,c.light,[0,.375,.182],[1,1,.30],false);
  for(const x of [-.13,.13])ball(spine,.014,c.metal,[x,.43,.165],[1,1,.35],false);
  for(const y of [.10,.15,.20])rounded(spine,.15,.014,.015,.006,c.joint,[0,y,.166],false);
  rounded(spine,.13,.035,.018,.012,c.accent,[-.125,.28,.166],false);
  rounded(spine,.29,.31,.10,.035,c.teal,[0,.28,-.18]);
  mesh(new THREE.CylinderGeometry(.066,.075,.16,16),c.metal,spine,[0,.63,0]);
  for(const y of [.59,.64,.69])mesh(new THREE.TorusGeometry(.068,.007,6,16),c.joint,spine,[0,y,0],false).rotation.x=Math.PI/2;

  rounded(head,.36,.29,.28,.068,c.shell,[0,.012,0]);
  rounded(head,.295,.204,.022,.049,c.screen,[0,.005,.148]);
  for(const side of [-1,1]){
    const hinge=mesh(new THREE.CylinderGeometry(.047,.047,.033,16),c.teal,head,[side*.188,.015,0]);hinge.rotation.z=Math.PI/2;
    ball(head,.020,c.metal,[side*.207,.015,0],[.45,1,1],false);
  }
  mesh(new THREE.CylinderGeometry(.012,.012,.085,10),c.metal,head,[.10,.197,0]);
  ball(head,.024,c.accent,[.10,.249,0]);
  const eyes=[],brows=[];
  for(const side of [-1,1]){
    const eye=new THREE.Group();eye.position.set(side*.065,.018,.164);head.add(eye);eyes.push(eye);
    rounded(eye,.043,.057,.006,.018,c.light,[0,0,0],false);
    const brow=rounded(head,.055,.009,.006,.004,c.light,[side*.065,.066,.165],false);brow.rotation.z=side*.08;brows.push(brow);
  }
  line(head,[[-.035,-.041,.166],[0,-.051,.167],[.035,-.041,.166]],.004,c.light);

  const arms={},legs={},parts={body,spine,head};
  for(const side of [-1,1]){
    const s=side<0?'L':'R',shoulder=new THREE.Group(),elbow=new THREE.Group(),hand=new THREE.Group();
    spine.add(shoulder);shoulder.position.set(side*.255,.48,0);shoulder.add(elbow);elbow.position.y=-.31;elbow.add(hand);hand.position.y=-.29;
    ball(shoulder,.091,c.joint,[0,0,0],[1,1,.9],false);capsule(shoulder,.29,.076,c.shell);
    ball(elbow,.073,c.joint,[0,0,0],[1,1,1],false);capsule(elbow,.27,.067,c.teal);
    mesh(new THREE.CylinderGeometry(.077,.077,.039,12),c.metal,shoulder,[0,-.264,0]);
    ball(hand,.041,c.joint,[0,0,0],[1,1,1],false);rounded(hand,.085,.084,.060,.024,c.shell,[0,-.051,0]);
    for(const x of [-.026,0,.026])rounded(hand,.021,.048,.039,.009,c.metal,[x,-.103,.008],false);
    rounded(hand,.028,.055,.042,.01,c.teal,[-side*.052,-.053,.010]);
    arms[s]={upper:shoulder,lower:elbow,end:hand,lengths:[.31,.29],side};parts['upperArm'+s]=shoulder;parts['forearm'+s]=elbow;
    const hip=new THREE.Group(),knee=new THREE.Group(),foot=new THREE.Group();body.add(hip);hip.position.set(side*.117,-.04,0);hip.add(knee);knee.position.y=-.38;knee.add(foot);foot.position.y=-.34;
    ball(hip,.101,c.joint,[0,0,0],[1,.9,.95],false);capsule(hip,.36,.09,c.shell);ball(knee,.084,c.joint,[0,0,0],[1,1,1],false);capsule(knee,.32,.076,c.teal);
    rounded(knee,.10,.09,.023,.025,c.shell,[0,-.075,.071]);
    ball(foot,.055,c.joint,[0,0,0],[1,1,1],false);rounded(foot,.18,.095,.255,.035,c.shell,[0,-.038,.047]);
    rounded(foot,.181,.030,.258,.030,c.sole,[0,-.083,.047]);rounded(foot,.10,.023,.014,.006,c.accent,[0,-.026,.181],false);
    legs[s]={upper:hip,lower:knee,end:foot,lengths:[.38,.34],side};parts['thigh'+s]=hip;parts['shin'+s]=knee;parts['foot'+s]=foot;
  }
  root.userData.parts=parts;root.userData.appearance='robot';root.userData.palette={...c};root.userData.human={body,spine,head,arms,legs,eyes,brows,clock:id==='pip'?1.3:0,lastTime:null,speed:0,seated:0,reclining:0,lastPosition:null};
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
  h.head.rotation.x=activity==='inspect'?.10:activity==='listen'&&standing>.8?.035+Math.sin(h.clock*2.6)*.045:0;
  const blinkPhase=h.clock%4.7,blink=blinkPhase>4.54?Math.max(.10,Math.abs(blinkPhase-4.62)/.08):1;for(const eye of h.eyes)eye.scale.y=blink*(1-lying*.85);
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
    if(physicalTarget&&['print','push','give','receive','pick_up','drop','place'].includes(activity)){
      const oldTarget=previous.rig?.pose?.targets?.['forearm'+s]||physicalTarget;
      hand=object.worldToLocal(vector(oldTarget.x,oldTarget.y,oldTarget.z).lerp(vector(physicalTarget.x,physicalTarget.y,physicalTarget.z),t));hand.z+=.15;hand.y-=.075;
    }else if(activity==='receive')hand.set(side*.16,1.10+.05*Math.sin(progress*Math.PI),.50+.08*Math.sin(progress*Math.PI));
    else if(activity==='wash')hand.set(side*(.18+.07*Math.sin(progress*28+index)),1.22+.18*Math.sin(progress*20+index),.28);
    else if(activity==='eat')hand.set(side*.12,1.13+reach*.44,.47-reach*.24);
    else if(activity==='throw'&&s==='R'){const windup=clamp(progress/.45,0,1),release=clamp((progress-.5)/.20,0,1),follow=clamp((progress-.7)/.3,0,1);hand.set(.34,1.2+windup*.42-release*.18-follow*.24,.24-windup*.43+release*.83);}
    else if(activity==='dance')hand.set(side*(.38+.08*Math.cos(progress*20+index)),1.22+.22*Math.sin(progress*20+index),.13);
    else if(activity==='speak'||activity==='think')hand.set(side*.30,1.03+(index===0?.12*Math.sin(progress*8):0),.17);
    else if(physicalTarget&&['idle','move','approach'].includes(activity)){const carryTarget=object.worldToLocal(vector(physicalTarget.x,physicalTarget.y,physicalTarget.z));if(carryTarget.z>.3&&carryTarget.y>1)hand.set(side*.16,1.12,.57);}
    if(seated>.01&&activity==='idle')hand.lerp(vector(side*.18,.77,.40),seated);
    solveChain(object,chain,hand,vector(side*.25,-1,-.18));
  }
  object.updateMatrixWorld(true);h.debug={phase,speed:h.speed,activity,progress,scale,connected:true};
}
