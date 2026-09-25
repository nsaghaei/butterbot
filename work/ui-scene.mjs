const host=$('#scene'),scene=new THREE.Scene();
scene.background=new THREE.Color('#a9dcf0');scene.fog=new THREE.Fog('#cbe5df',44,110);
const camera=new THREE.PerspectiveCamera(43,1,.1,180);camera.position.set(15,12,20);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(-1,.9,-1);controls.enableDamping=true;controls.dampingFactor=.08;controls.maxPolarAngle=Math.PI*.47;controls.minDistance=6;controls.maxDistance=48;controls.update();
const gradient=new THREE.DataTexture(new Uint8Array([115,205,255]),3,1,THREE.RedFormat);gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
const outline=new THREE.MeshBasicMaterial({color:'#343842',side:THREE.BackSide});const mats=new Map();
function mat(color){const key=String(color);if(!mats.has(key))mats.set(key,new THREE.MeshToonMaterial({color,gradientMap:gradient}));return mats.get(key);}
function mesh(geom,color,parent=scene,pos=[0,0,0],lines=true){const m=new THREE.Mesh(geom,mat(color));m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);if(lines){const edge=new THREE.Mesh(geom,outline);edge.scale.setScalar(1.025);edge.castShadow=false;m.add(edge);}return m;}
const box=(w,h,d,c,p,pos,lines=true)=>mesh(new THREE.BoxGeometry(w,h,d),c,p,pos,lines),sphere=(r,c,p,pos,s=16)=>mesh(new THREE.SphereGeometry(r,s,12),c,p,pos),cylinder=(a,b,h,c,p,pos,n=12)=>mesh(new THREE.CylinderGeometry(a,b,h,n),c,p,pos);
function boxes(instances,color){const m=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat(color),instances.length),dummy=new THREE.Object3D();instances.forEach(({p,s},i)=>{dummy.position.set(...p);dummy.scale.set(...s);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
scene.add(new THREE.HemisphereLight('#fff6dd','#75985e',1.75));const sun=new THREE.DirectionalLight('#fff4d9',2.1);sun.position.set(-9,22,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:23,bottom:-23,near:.5,far:80});sun.shadow.normalBias=.035;scene.add(sun);
const ground=box(130,.3,100,'#a8ce70',scene,[0,-.2,-12],false);ground.userData.ground=true;
// One uninterrupted lawn. Subtle organic color patches keep it from reading as a tiled floor.
for(const [x,z,sx,sz]of [[-4,4,5,3],[6,2,4,5],[-2,-6,5,2]]){const patch=mesh(new THREE.CircleGeometry(1,48),'#aed477',scene,[x,-.041,z],false);patch.rotation.x=-Math.PI/2;patch.scale.set(sx,sz,1);}
const posts=[];for(const side of [-1,1])for(let z=-12;z<=12;z++)posts.push({p:[side*13,.77,z],s:[.14,1.54,.19]});for(let x=-12;x<=12;x++)posts.push({p:[x,.77,-12],s:[.19,1.54,.14]});boxes(posts,'#fff3d7');
const rails=[];for(const y of [.42,1.13]){rails.push({p:[0,y,-12],s:[26,.13,.14]});for(const x of [-13,13])rails.push({p:[x,y,0],s:[.14,.13,24]});}boxes(rails,'#ecdfbc');
const lowFront=[];for(let x=-13;x<=13;x+=1.3)lowFront.push({p:[x,.27,12],s:[.12,.54,.14]});lowFront.push({p:[0,.29,12],s:[26,.09,.12]});boxes(lowFront,'#eee1c2');

// Background neighborhood is decorative; it does not add simulated objects or actions.
box(130,.07,6,'#7e8d95',scene,[0,-.015,-17.3],false);
box(130,.13,1.7,'#e5dece',scene,[0,.015,-13.45],false);box(130,.13,1.7,'#e5dece',scene,[0,.015,-21.15],false);
boxes(Array.from({length:25},(_,i)=>({p:[i*5-60,.028,-17.3],s:[2,.01,.12]})),'#f4eac4');
boxes([{p:[0,.11,-14.25],s:[130,.19,.17]},{p:[0,.11,-20.35],s:[130,.19,.17]}],'#f0e7d6');
function house(x,z,color,roofColor,scale=1){
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);scene.add(g);
  box(6.3,4.9,5,color,g,[0,2.45,0]);box(6.6,.2,5.3,'#fff0d0',g,[0,4.85,0]);
  const roof=mesh(new THREE.ConeGeometry(5.15,2.25,4),roofColor,g,[0,6.05,0]);roof.rotation.y=Math.PI/4;roof.scale.z=.85;
  box(.6,1.8,.8,'#bf8567',g,[1.65,6.1,-.65]);box(.79,.15,.95,'#e6c6a1',g,[1.65,7,-.65]);
  for(const x of [-1.85,1.85])for(const y of [1.7,3.65]){box(1.32,1.24,.15,'#fff2d2',g,[x,y,2.55]);box(1.06,.99,.07,'#86c1d4',g,[x,y,2.65]);box(.065,1,.07,'#ffefd0',g,[x,y,2.7]);box(1.08,.06,.075,'#ffefd0',g,[x,y,2.7]);box(1.5,.11,.35,'#f4dfb8',g,[x,y-.65,2.64]);}
  box(1.06,2.12,.13,'#557b7d',g,[0,1.07,2.57]);sphere(.055,'#f3ca62',g,[.34,1.04,2.68],8);box(1.6,.18,.8,'#d8c8aa',g,[0,.08,2.87]);
  const porch=box(2.4,.15,1.5,roofColor,g,[0,2.75,2.85]);porch.rotation.x=.11;
  for(const xx of [-.94,.94])cylinder(.055,.065,2.65,'#f9eacb',g,[xx,1.34,3.38],8);
  const lawn=mesh(new THREE.CircleGeometry(4.2,32),'#99c76a',g,[0,-.025,4.1],false);lawn.rotation.x=-Math.PI/2; lawn.scale.y=.55;
  return g;
}
house(-15,-27,'#f0b988','#a85f55',1.08);house(-4,-29,'#c4b5dc','#796c94',1.15);house(8,-28,'#e4cf83','#aa7660');house(19,-27,'#b3d2b5','#6a8883',1.1);
function tree(x,z,scale=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);scene.add(g);cylinder(.22,.34,2.8,'#aa8359',g,[0,1.4,0]);sphere(1.45,'#76ad55',g,[0,3.2,0],12);sphere(1.08,'#8dbd62',g,[-.9,2.95,.2],12);sphere(1.08,'#92bf65',g,[.85,3.45,.1],12);return g;}
tree(-16,-9,1.15);tree(16,-9,1.35);tree(17,6,1.6);tree(-17,7,1.4);tree(-24,-24,1.6);tree(27,-25,1.7);
for(const [x,z]of [[-11,-22.1],[3,-22.1],[15,-22.1]]){cylinder(.07,.09,4.5,'#648085',scene,[x,2.25,z],8);box(.55,.13,.45,'#f7e6bb',scene,[x,4.45,z]);sphere(.18,'#ffedb7',scene,[x,4.2,z],10);}
for(const [x,y,z,s]of [[-20,15,-43,2],[1,19,-54,2.7],[25,15,-48,2.1]]){const cloud=new THREE.Group();cloud.position.set(x,y,z);scene.add(cloud);for(const [dx,dy,r]of [[-1,0,.8],[0,.3,1.1],[1.15,0,.8]]){const m=mesh(new THREE.SphereGeometry(r*s,12,8),'#fff7e7',cloud,[dx*s,dy*s,0],false);m.scale.z=.6;}}
const passingCars=[];
function neighborhoodCar(color,direction,offset){
  const g=new THREE.Group();scene.add(g);box(1.65,.58,3.1,color,g,[0,.64,0]);box(1.43,.67,1.55,color,g,[0,1.23,-.18]);box(1.26,.45,.035,'#c6e4e5',g,[0,1.26,.62]);box(1.26,.45,.035,'#abcfd7',g,[0,1.26,-.98]);
  for(const side of [-1,1]){box(.035,.44,1.30,'#bddde0',g,[side*.73,1.25,-.17]);box(.06,.51,.07,color,g,[side*.76,1.24,-.15]);box(.18,.11,.34,color,g,[side*.90,1.05,.35]);}
  const wheels=[];for(const x of [-.79,.79])for(const z of [-.93,.97]){const wheel=new THREE.Group();g.add(wheel);wheel.position.set(x,.41,z);const tire=cylinder(.32,.32,.20,'#41494b',wheel,[0,0,0],12);tire.rotation.z=Math.PI/2;const hub=cylinder(.15,.15,.215,'#d7ded2',wheel,[0,0,0],10);hub.rotation.z=Math.PI/2;wheels.push(wheel);}
  for(const x of [-.52,.52]){box(.27,.15,.045,'#ffeac0',g,[x,.73,1.58]);box(.26,.13,.045,'#d88f79',g,[x,.72,-1.58]);}box(1.46,.13,.10,'#d8ded2',g,[0,.43,1.58]);
  g.rotation.y=direction*Math.PI/2;passingCars.push({group:g,wheels,direction,offset});
}
neighborhoodCar('#78bfc1',1,0);neighborhoodCar('#edaf81',-1,28);neighborhoodCar('#e4d49b',1,53);
function animateEnvironment(now){const elapsed=now/1000;for(const car of passingCars){const travel=(elapsed*2.7+car.offset)%95;car.group.position.set((travel-47.5)*car.direction,0,car.direction>0?-16:-18.5);for(const wheel of car.wheels)wheel.rotation.x=elapsed*7*car.direction;}}
animateEnvironment(0);

// This is the same fixed planter represented by the engine.
const planter=new THREE.Group();scene.add(planter);box(4,1,1.6,'#cd9469',planter,[6,.5,-7]);box(3.8,.15,1.4,'#76583c',planter,[6,1.05,-7]);for(let i=0;i<7;i++){const x=4.5+i*.5;cylinder(.028,.028,.55,'#62915c',planter,[x,1.35,-7],7);sphere(.14,i%2?'#f9d66f':'#eda0ad',planter,[x,1.7,-7],8);}planter.traverse(o=>o.userData.entityId='planter');
const printer=new THREE.Group();printer.position.set(PRINTER.center.x,PRINTER.center.y-1,PRINTER.center.z);printer.rotation.y=PRINTER.rotationY;scene.add(printer);
box(3.4,.55,2.6,'#8e80af',printer,[0,.30,0]);box(3,.18,2.3,'#ffe1a0',printer,[0,.67,0]);box(3.4,.45,2.6,'#baa7d3',printer,[0,3.15,0]);
for(const x of [-1.45,1.45])for(const z of [-1.05,1.05])box(.15,2.35,.15,'#eedfc2',printer,[x,1.94,z]);
box(2.68,.10,.14,'#8c819b',printer,[0,2.92,0]);const nozzle=cylinder(.18,.075,.4,'#706e83',printer,[0,2.68,0]);
for(const x of [-1.18,1.18])sphere(.075,'#f3d48a',printer,[x,3.14,1.35],10);
box(1.55,.82,.13,'#59596d',printer,[0,1.94,1.37]);
const printerCanvas=document.createElement('canvas');printerCanvas.width=640;printerCanvas.height=320;const printerContext=printerCanvas.getContext('2d'),printerTexture=new THREE.CanvasTexture(printerCanvas);printerTexture.colorSpace=THREE.SRGBColorSpace;
const printerDisplay=new THREE.Mesh(new THREE.PlaneGeometry(1.38,.68),new THREE.MeshBasicMaterial({map:printerTexture}));printerDisplay.position.set(0,1.94,1.445);printer.add(printerDisplay);
printer.updateMatrixWorld(true);const keyboard=new THREE.Group();keyboard.position.copy(printer.worldToLocal(new THREE.Vector3(PRINTER.keyboard.x,PRINTER.keyboard.y,PRINTER.keyboard.z)));printer.add(keyboard);
box(1.5,.12,.53,'#8c839f',keyboard,[0,-.05,0]);for(let row=0;row<3;row++)for(let col=0;col<9;col++)box(.113,.035,.10,row===2&&col>1&&col<7?'#e8ddef':'#f6e8d4',keyboard,[(col-4)*.143,.025,-.13+row*.14],false);
box(.44,.035,.075,'#d3badf',keyboard,[0,.028,.17],false);for(const side of [-1,1])box(.08,.56,.09,'#b8abc4',keyboard,[side*.62,-.32,-.19]);
let printerScreenSignature='';
function updatePrinterScreen(current){
  const latest=[...(current?.logs||[])].reverse().find(l=>l.type==='laya'&&l.status==='accepted'&&!['goal','activity','step'].includes(l.scope));
  const heading=current?.stage==='printing'?'MAKING YOUR IDEA':current?.stage==='needs_design'?'SHAPING YOUR IDEA':current?.stage==='review'?'READY FOR REVIEW':'READY TO CREATE';
  const message=current?.currentChoice?.question||latest?.selected||'A little curiosity goes a long way.';
  const signature=heading+'|'+message;if(signature===printerScreenSignature)return;printerScreenSignature=signature;
  const g=printerContext;g.fillStyle='#d0e9dc';g.fillRect(0,0,640,320);g.fillStyle='#619787';g.fillRect(28,29,7,28);g.fillStyle='#49796d';g.font='600 25px Segoe UI';g.fillText(heading,51,51);g.fillStyle='#436c61';g.font='29px Segoe UI';
  let line='',y=112;for(const word of String(message).split(/\s+/)){const trial=line?line+' '+word:word;if(g.measureText(trial).width>555&&line){g.fillText(line,35,y);line=word;y+=42;if(y>250)break;}else line=trial;}if(y<=250)g.fillText(line,35,y);g.fillStyle='#96beaa';g.fillRect(35,284,570,3);printerTexture.needsUpdate=true;
}
updatePrinterScreen(null);
const destinationMarker=new THREE.Group();scene.add(destinationMarker);destinationMarker.visible=false;
const markerRingMaterial=new THREE.MeshBasicMaterial({color:'#f2c84b',transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide}),markerDiscMaterial=new THREE.MeshBasicMaterial({color:'#f2c84b',transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide});
const markerRing=new THREE.Mesh(new THREE.RingGeometry(.39,.48,64,1,0,Math.PI*1.72),markerRingMaterial),markerDisc=new THREE.Mesh(new THREE.CircleGeometry(.34,40),markerDiscMaterial);markerRing.rotation.x=markerDisc.rotation.x=-Math.PI/2;markerDisc.position.y=-.004;destinationMarker.add(markerRing,markerDisc);
function renderDestinationMarker(meta,elapsed,opacity=1,scale=1){destinationMarker.visible=!!meta&&opacity>0;if(!destinationMarker.visible)return;destinationMarker.position.set(meta.point.x,.026,meta.point.z);destinationMarker.rotation.y=elapsed*.7;destinationMarker.scale.setScalar(scale);markerRingMaterial.color.set(meta.color);markerDiscMaterial.color.set(meta.color);markerRingMaterial.opacity=.92*opacity;markerDiscMaterial.opacity=.14*opacity;}
function textSprite(text,color='#39483d',bg='#fff8df'){const c=document.createElement('canvas');c.width=512;c.height=100;const g=c.getContext('2d');g.fillStyle=bg;g.strokeStyle='#59604f';g.lineWidth=4;g.beginPath();g.roundRect(5,5,502,90,20);g.fill();g.stroke();g.fillStyle=color;g.font='bold 32px Segoe UI';g.textAlign='center';g.fillText(text,256,61);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));s.scale.set(3.6,.7,1);return s;}
