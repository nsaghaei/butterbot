import * as THREE from '/three.js';
export function avatar(id,{mesh,mat,textSprite}){
  const root=new THREE.Group(),parts={};root.userData.parts=parts;
  const skin='#f4bc8d',hair='#5c4035',shirt='#edd99c',pants='#627585',boot='#d39048';
  const ball=(p,r,c,x=0,y=0,z=0,scale=[1,1,1])=>{const m=mesh(new THREE.SphereGeometry(r,18,12),c,p,[x,y,z]);m.scale.set(...scale);return m;};
  const capsule=(p,r,len,c)=>mesh(new THREE.CapsuleGeometry(r,Math.max(.02,len-r*2),5,10),c,p);
  const line=(p,points,r,c)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),12,r,6,false),c,p);
  for(const name of ['pelvis','torso','head','upperArmL','forearmL','upperArmR','forearmR','thighL','shinL','footL','thighR','shinR','footR']){const g=new THREE.Group();root.add(g);parts[name]=g;
    if(name==='head'){
      ball(g,.285,skin,0,.02,0,[.95,1.2,.9]);for(const side of [-1,1]){ball(g,.072,skin,side*.275,0,0,[.7,1.1,.8]);ball(g,.10,'#fffced',side*.102,.035,.235,[.85,1.12,.48]);ball(g,.038,'#31313d',side*.098,.031,.286,[1,1.2,.6]);ball(g,.012,'#ffffff',side*.10-.01,.044,.31);line(g,[[side*.19,.17,.20],[side*.11,.20+(side<0?.04:0),.235],[side*.045,.155,.245]],.026,hair);}
      ball(g,.093,skin,0,-.025,.285,[.72,1.28,1.2]);line(g,[[-.09,-.16,.215],[0,-.18,.25],[.10,-.135,.215]],.012,'#86504b');
      for(let i=0;i<7;i++){const t=(i/6)*Math.PI;ball(g,.10,hair,Math.cos(t)*.23,.25+Math.sin(t)*.035,-.10,[1.15,.9,1.2]);}for(const [x,y,z,r]of [[-.1,.34,-.03,.11],[.01,.40,-.02,.10],[.10,.33,-.08,.12]])ball(g,r,hair,x,y,z,[.85,1.2,1]);
      const glasses=new THREE.Group();g.add(glasses);for(const side of [-1,1]){const rim=mesh(new THREE.TorusGeometry(.108,.013,6,22),'#56515a',glasses,[side*.108,.038,.28]);rim.scale.y=1.08;}mesh(new THREE.BoxGeometry(.06,.018,.02),'#56515a',glasses,[0,.06,.29]);
    }else if(name==='torso'){
      ball(g,.25,shirt,0,0,0,[.94,1.17,.74]);mesh(new THREE.BoxGeometry(.09,.32,.035),'#bd6858',g,[0,-.035,.193]);const knot=mesh(new THREE.BoxGeometry(.08,.08,.04),'#b6594e',g,[0,.14,.196]);knot.rotation.z=Math.PI/4;for(const side of [-1,1]){const lapel=mesh(new THREE.BoxGeometry(.13,.16,.035),'#fff0c8',g,[side*.095,.17,.17]);lapel.rotation.z=side*.5;}mesh(new THREE.BoxGeometry(.13,.14,.025),'#dfc78c',g,[-.13,0,.183]);const pencil=mesh(new THREE.CylinderGeometry(.013,.013,.19,6),'#de8850',g,[-.14,.08,.205]);pencil.rotation.z=-.15;
    }else if(name==='pelvis'){
      ball(g,.22,pants,0,0,0,[1.03,.76,.8]);mesh(new THREE.BoxGeometry(.48,.09,.38),'#8d6045',g,[0,.09,0]);mesh(new THREE.BoxGeometry(.10,.075,.03),'#e4c46c',g,[0,.09,.21]);mesh(new THREE.BoxGeometry(.13,.20,.10),'#ae8255',g,[-.22,-.02,.16]);const hammer=mesh(new THREE.CylinderGeometry(.022,.026,.28,7),'#b99264',g,[.23,-.06,.10]);hammer.rotation.z=-.13;mesh(new THREE.BoxGeometry(.15,.08,.08),'#899694',g,[.24,.1,.1]);
    }else if(name.startsWith('upperArm'))capsule(g,.085,.37,shirt);
    else if(name.startsWith('forearm')){capsule(g,.064,.34,skin);ball(g,.078,skin,0,-.16,.015,[.85,1.2,.7]);mesh(new THREE.CylinderGeometry(.085,.085,.065,10),'#fff0cf',g,[0,.14,0]);}
    else if(name.startsWith('thigh'))capsule(g,.09,.42,pants);
    else if(name.startsWith('shin'))capsule(g,.075,.33,pants);
    else {ball(g,.20,boot,0,.005,.075,[.88,.54,1.6]);mesh(new THREE.BoxGeometry(.30,.065,.47),'#675744',g,[0,-.06,.055]);for(const z of [-.015,.055,.12])mesh(new THREE.BoxGeometry(.17,.012,.022),'#f7e4b2',g,[0,.095,z]);}
  }
  root.traverse(o=>o.userData.entityId=id);return root;
}
export function updateAvatar(object,e,previous,alpha){const old=new Map((previous?.rig?.bodies||[]).map(b=>[b.name,b]));for(const b of e.rig?.bodies||[]){const group=object.userData.parts[b.name];if(!group)continue;const a=old.get(b.name)||b;group.position.set(a.position.x,a.position.y,a.position.z).lerp(new THREE.Vector3(b.position.x,b.position.y,b.position.z),alpha);group.quaternion.set(a.rotation.x,a.rotation.y,a.rotation.z,a.rotation.w).slerp(new THREE.Quaternion(b.rotation.x,b.rotation.y,b.rotation.z,b.rotation.w),alpha);}}
