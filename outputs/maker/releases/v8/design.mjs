import {Worker} from 'node:worker_threads';
import {normalizeAttributes} from './object-attributes.mjs';
export const KINDS=['prop','character','vehicle','soft','rope','cloth','breakable'];
export const AFFORDANCES=['store','sit','rest','display','follow','drive','squish','swing','drape','break'];
export function validateProposal(p){
  if(!p||typeof p!=='object'||typeof p.code!=='string'||p.code.length>24000)throw Error('Design needs at most 24,000 characters of Three.js construction code');
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw Error('Design needs a short name');
  if(!Array.isArray(p.affordances)||!p.affordances.length||p.affordances.some(a=>!AFFORDANCES.includes(a)))throw Error('Unsupported affordance');
  if(p.description!==undefined&&(typeof p.description!=='string'||p.description.length>240))throw Error('Description must be at most 240 characters');const kind=p.kind||'prop';if(!KINDS.includes(kind))throw Error('Unsupported runtime kind');
  const supported={prop:['store','sit','rest','display'],character:['follow'],vehicle:['drive'],soft:['squish'],rope:['swing'],cloth:['drape'],breakable:['break']}[kind];
  if(p.affordances.some(a=>!supported.includes(a)))throw Error('Affordance does not match runtime kind');
  if(typeof p.mass!=='number'||!Number.isFinite(p.mass)||p.mass<.2||p.mass>(['vehicle','prop','breakable'].includes(kind)?250:kind==='character'?90:12))throw Error('Mass is outside the runtime budget');
  if(p.anchor!==undefined&&(!Array.isArray(p.anchor)||p.anchor.length!==3||!p.anchor.every(Number.isFinite)))throw Error('Anchor must be [x,y,z]');
  const attributes=normalizeAttributes(p.attributes,kind,p.mass);
  return {description:p.description||p.name+'. Supported interactions: '+p.affordances.join(', ')+'.',descriptionSource:p.description?'creator':'engine',name:p.name,code:p.code,kind,affordances:[...new Set(p.affordances)],mass:p.mass,anchor:p.anchor||null,attributes,attributeInput:{...(p.attributes||{})}};
}
export function validateGeometry(data,proposal){
  if(!Array.isArray(data?.meshes)||data.meshes.length<1||data.meshes.length>96)throw Error('Design must contain 1–96 meshes');
  let vertices=0,triangles=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const m of data.meshes){if(!Array.isArray(m.positions)||!m.positions.length||m.positions.length%3||m.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>20))throw Error('Invalid vertex positions');
    const count=m.positions.length/3;vertices+=count;
    if(m.index!==null&&(!Array.isArray(m.index)||m.index.length%3||m.index.some(i=>!Number.isInteger(i)||i<0||i>=count)))throw Error('Invalid triangle indices');
    if(!m.index&&count%3)throw Error('Unindexed mesh must contain complete triangles');
    triangles+=(m.index?m.index.length:count)/3;
    if(!Number.isInteger(m.color)||m.color<0||m.color>0xffffff)throw Error('Invalid material color');
    for(let i=0;i<m.positions.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],m.positions[i]);max[axis]=Math.max(max[axis],m.positions[i]);}
  }
  if(vertices>60000||triangles>50000)throw Error('Geometry budget exceeded');
  const dimensions=max.map((n,i)=>n-min[i]);if(dimensions.some((n,i)=>(n<.001&&!(proposal.kind==='cloth'&&i===2))||n>(proposal.kind==='vehicle'?5:3))||dimensions[1]>3)throw Error('Object exceeds physical size budget');
  const center=max.map((n,i)=>(n+min[i])/2),anchor=(proposal.anchor||center).map((n,i)=>n-center[i]);
  if(anchor.some((n,i)=>Math.abs(n)>dimensions[i]/2+.15))throw Error('Interaction anchor lies outside the object');
  const colliders=[];
  for(const m of data.meshes){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<m.positions.length;i++){const axis=i%3;m.positions[i]-=center[axis];lo[axis]=Math.min(lo[axis],m.positions[i]);hi[axis]=Math.max(hi[axis],m.positions[i]);}colliders.push({center:lo.map((n,i)=>(n+hi[i])/2),half:lo.map((n,i)=>Math.max(.025,(hi[i]-n)/2))});}
  // Use a bounded compound of local mesh boxes; this is an explicit approximation, not arbitrary mesh physics.
  const physicsColliders=colliders.length<=32?colliders:[{center:[0,0,0],half:dimensions.map(n=>n/2)}];
  if(proposal.kind==='soft'&&(data.meshes.length>24||vertices>12000))throw Error('Soft assembly supports up to 24 meshes and 12,000 vertices with an Ammo deformation cage');
  if(proposal.kind==='breakable'&&(data.meshes.length<2||data.meshes.length>16))throw Error('Breakable assembly needs 2–16 separate solid mesh pieces');
  const attributes=normalizeAttributes(proposal.attributeInput??proposal.attributes,proposal.kind,proposal.mass,dimensions);
  return {description:proposal.description,descriptionSource:proposal.descriptionSource,name:proposal.name,kind:proposal.kind,meshes:data.meshes,dimensions,anchor,affordances:proposal.affordances,mass:proposal.mass,attributes,colliders:physicsColliders,stats:{meshes:data.meshes.length,vertices,triangles,colliders:physicsColliders.length},colliderPolicy:proposal.kind==='vehicle'?'Bounded chassis box plus four raycast wheels':proposal.kind==='character'?'Character capsule':colliders.length<=32?'Compound mesh bounding boxes':'Overall bounding box (over 32 mesh parts)'};
}
export async function compileDesign(proposal){
  const clean=validateProposal(proposal);
  const compiled=await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./compiler-worker.mjs',import.meta.url),{execArgv:[],workerData:{code:clean.code},resourceLimits:{maxOldGenerationSizeMb:160,stackSizeMb:4}});
    const timer=setTimeout(()=>{void worker.terminate();reject(Error('Construction code exceeded 8-second wall-clock limit'));},8000);
    worker.once('message',result=>{clearTimeout(timer);void worker.terminate();result.ok?resolve(result.compiled):reject(Error(result.error));});worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('exit',code=>{if(code!==0){clearTimeout(timer);reject(Error('Construction worker terminated'));}});
  });return validateGeometry(compiled,clean);
}
export function sampleQuestions(){return [
  {id:'purpose',text:'What should your creation help you do?',choices:{store:'Hold my three garden tokens.',sit:'Give me a seat to rest on.',display:'Make a colorful garden sculpture.'}},
  {id:'shape',text:'Which construction do you want?',choices:{rounded:'Rounded forms with a broad stable base.',angular:'A geometric design with sturdy flat pieces.',playful:'A playful assembly with decorative curves.'}},
  {id:'color',text:'Which color palette should the printer use?',choices:{teal:'Teal, sunny yellow, and cream.',coral:'Coral red, lavender, and cream.',blue:'Blue, orange, and cream.'}}
];}
export function sampleDesign(selections,interaction='store'){
  const answer=Object.fromEntries(selections.map(s=>[s.questionId,s.key]));const purpose=answer.purpose||interaction;const palettes={teal:[0x30bcb3,0xffce42],coral:[0xf26762,0xab82d7],blue:[0x449bdf,0xffac47]};const [color,accent]=palettes[answer.color]||palettes.teal;
  const base=`const root=new THREE.Group();function part(g,c,x,y,z){const m=new THREE.Mesh(g,new THREE.MeshToonMaterial({color:c}));m.position.set(x,y,z);root.add(m);return m;}\n`;
  if(purpose==='rest')return {name:'Sample · Garden bed',kind:'prop',affordances:['rest'],mass:6,code:base+`part(new THREE.BoxGeometry(1.1,.22,2.2),0xae87c4,0,.55,0);part(new THREE.BoxGeometry(.95,.16,.4),0xffe7b6,0,.74,-.75);for(const x of [-.43,.43])for(const z of [-.9,.9])part(new THREE.BoxGeometry(.12,.45,.12),0x997450,x,.22,z);return root;`};
  if(purpose==='sit')return {name:'Sample · Sunbeam chair',affordances:['sit'],mass:3,anchor:[0,.74,0],code:base+`part(new THREE.BoxGeometry(1.2,.18,1.1),${color},0,.67,0);for(const x of [-.46,.46])for(const z of [-.4,.4])part(new THREE.CylinderGeometry(.08,.11,.6,10),${accent},x,.3,z);part(new THREE.BoxGeometry(1.2,.85,.16),${color},0,1.15,-.48);for(const x of [-.44,0,.44])part(new THREE.SphereGeometry(.09,10,8),${accent},x,1.38,-.36);return root;`};
  if(purpose==='display')return {name:'Sample · Orbit garden sculpture',affordances:['display'],mass:3,anchor:[0,.55,0],code:base+`part(new THREE.CylinderGeometry(.65,.78,.2,18),${accent},0,.1,0);part(new THREE.CylinderGeometry(.11,.18,1.2,12),${color},0,.7,0);for(let i=0;i<3;i++){const ring=part(new THREE.TorusGeometry(.5,.08,8,24),i%2?${accent}:${color},0,1.1,0);ring.rotation.set(i*.65,i*.8,0);}part(new THREE.SphereGeometry(.24,16,12),0xffeee0,0,1.1,0);return root;`};
  const round=answer.shape!=='angular';
  return {name:'Sample · Pocket garden caddy',affordances:['store'],mass:2.4,anchor:[0,.45,0],code:base+`part(new THREE.BoxGeometry(1.4,.15,1.05),${accent},0,.15,0);for(const x of [-.65,.65])part(new THREE.BoxGeometry(.12,.55,1.05),${color},x,.43,0);for(const z of [-.48,.48])part(new THREE.BoxGeometry(1.3,.55,.12),${color},0,.43,z);${round?`for(const x of [-.55,.55]){const h=part(new THREE.TorusGeometry(.2,.055,8,18),${accent},x,.64,0);h.rotation.y=Math.PI/2;}`:''}for(const x of [-.45,0,.45])part(new THREE.SphereGeometry(.06,8,6),0xffeee0,x,.46,.56);return root;`};
}

