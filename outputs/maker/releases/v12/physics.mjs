import {PRINTER,GARDEN_BOUNDS} from './environment-layout.mjs';
import {PhysicalRig} from './physical-rig.mjs';
import {attributesFor,normalizeAttributes} from './object-attributes.mjs';
import RAPIER from '@dimforge/rapier3d-compat';
import AmmoFactory from './vendor/ammo.cjs';
import {readFile} from 'node:fs/promises';
await RAPIER.init();
const Ammo=await AmmoFactory({wasmBinary:await readFile(new URL('./vendor/ammo.wasm.wasm',import.meta.url))});
const vec=(x=0,y=0,z=0)=>({x,y,z});
const flatDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const identity={x:0,y:0,z:0,w:1};
function colliderBounds(c){
  const shape=c.shape,p=c.translation(),q=c.rotation();let half;
  if(shape.halfExtents)half=[shape.halfExtents.x,shape.halfExtents.y,shape.halfExtents.z];
  else if(Number.isFinite(shape.radius))half=[shape.radius,(shape.halfHeight||0)+shape.radius,shape.radius];
  else return {minX:-Infinity,maxX:Infinity,minY:-Infinity,maxY:Infinity,minZ:-Infinity,maxZ:Infinity};
  const axes=[[half[0],0,0],[0,half[1],0],[0,0,half[2]]].map(v=>rotate(v,q)),extent=k=>axes.reduce((sum,v)=>sum+Math.abs(v[k]),0);
  return {minX:p.x-extent('x'),maxX:p.x+extent('x'),minY:p.y-extent('y'),maxY:p.y+extent('y'),minZ:p.z-extent('z'),maxZ:p.z+extent('z')};
}
class RouteHeap{
  constructor(){this.nodes=[];}
  before(a,b){return a.f<b.f||a.f===b.f&&(a.h<b.h||a.h===b.h&&a.order<b.order);}
  push(node){const a=this.nodes;a.push(node);let i=a.length-1;while(i){const p=(i-1)>>1;if(!this.before(a[i],a[p]))break;[a[i],a[p]]=[a[p],a[i]];i=p;}}
  pop(){const a=this.nodes,first=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){let n=i,l=i*2+1,r=l+1;if(l<a.length&&this.before(a[l],a[n]))n=l;if(r<a.length&&this.before(a[r],a[n]))n=r;if(n===i)break;[a[i],a[n]]=[a[n],a[i]];i=n;}}return first;}
}
export class Physics {
  constructor(){
    this.world=new RAPIER.World(vec(0,-9.81,0));this.world.timestep=1/60;this.entities=new Map();this.staticColliders=new Map();this.serial=0;
    this.config=new Ammo.btSoftBodyRigidBodyCollisionConfiguration();this.dispatcher=new Ammo.btCollisionDispatcher(this.config);this.broadphase=new Ammo.btDbvtBroadphase();this.solver=new Ammo.btSequentialImpulseConstraintSolver();this.softSolver=new Ammo.btDefaultSoftBodySolver();
    this.softWorld=new Ammo.btSoftRigidDynamicsWorld(this.dispatcher,this.broadphase,this.solver,this.config,this.softSolver);const gravity=new Ammo.btVector3(0,-9.81,0);this.softWorld.setGravity(gravity);this.softWorld.getWorldInfo().set_m_gravity(gravity);Ammo.destroy(gravity);this.helpers=new Ammo.btSoftBodyHelpers();this.proxies=new Map();this.ammoOwned=[];this.ammoResources=new Map();
    this.fixedBox('ground',vec(0,-.2,0),vec(30,.2,30));
    for(const [id,p,h]of [['back',vec(0,1,-12),vec(13,1,.15)],['left',vec(-13,1,0),vec(.15,1,12)],['right',vec(13,1,0),vec(.15,1,12)],['front',vec(0,.4,12),vec(13,.4,.15)],['printer',PRINTER.center,vec(1.3,1,1.7)],['keyboard',PRINTER.keyboard,vec(.43,.06,.68)],['planter',vec(6,.5,-7),vec(2,.5,.8)]])this.fixedBox(id,p,h);
    this.actor=this.character('actor',vec(-1,1.2,3));
  }
  ammoBox(position,half){const extent=new Ammo.btVector3(half.x,half.y,half.z),shape=new Ammo.btBoxShape(extent),transform=new Ammo.btTransform(),origin=new Ammo.btVector3(position.x,position.y,position.z);transform.setIdentity();transform.setOrigin(origin);Ammo.destroy(extent);Ammo.destroy(origin);const motion=new Ammo.btDefaultMotionState(transform),inertia=new Ammo.btVector3(0,0,0),info=new Ammo.btRigidBodyConstructionInfo(0,motion,shape,inertia),body=new Ammo.btRigidBody(info);body.setCollisionFlags(body.getCollisionFlags()|2);body.setActivationState(4);this.softWorld.addRigidBody(body);const resources=[body,info,motion,transform,shape,inertia];this.ammoOwned.push(...resources);this.ammoResources.set(body,resources);return body;}
  removeProxy(id){const proxy=this.proxies.get(id);if(!proxy)return;this.softWorld.removeRigidBody(proxy);this.proxies.delete(id);const resources=this.ammoResources.get(proxy)||[];this.ammoResources.delete(proxy);const removed=new Set(resources);this.ammoOwned=this.ammoOwned.filter(resource=>!removed.has(resource));for(const resource of resources)Ammo.destroy(resource);}
  fixedBox(id,position,half){const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x,half.y,half.z).setTranslation(position.x,position.y,position.z).setFriction(.8));this.staticColliders.set(collider.handle,{id:id==='keyboard'?'printer':id,name:{ground:'Garden ground',printer:'Printer',keyboard:'Printer keyboard',planter:'Flower bed',front:'Garden front boundary',back:'Garden back boundary',left:'Garden left boundary',right:'Garden right boundary'}[id]||id,kind:'fixture'});this.ammoBox(position,half);return collider;}
  character(id,position,design=null){const height=design?Math.min(2.7,Math.max(1.1,design.dimensions[1])):2.3,radius=design?Math.min(.5,Math.max(.25,Math.max(design.dimensions[0],design.dimensions[2])*.35)):.32;
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y,position.z));const collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(height/2-radius,radius).setMass(65).setCollisionGroups(0x00040005),body);const controller=this.world.createCharacterController(.015);controller.enableAutostep(.25,.2,true);controller.enableSnapToGround(.3);controller.setApplyImpulsesToDynamicBodies(true);controller.setCharacterMass(65);
    const e={id,kind:'character',body,collider,controller,height,radius,heading:0,walking:false,goal:null,design,travel:0};this.entities.set(id,e);e.rig=new PhysicalRig(RAPIER,this.world,e);this.proxies.set(id,this.ammoBox(position,vec(radius,height/2,radius)));return e;
  }
  add(design,position=vec(1,2,0)){
    if(this.entities.size>=48)throw Error('World entity budget reached (48)');const id=`item-${++this.serial}`;
    design={...design,attributes:normalizeAttributes(design.attributes,design.kind,design.mass,design.dimensions)};
    if(design.kind==='character')return this.character(id,vec(position.x,design.dimensions[1]/2+.05,position.z),design);
    if(['soft','rope','cloth'].includes(design.kind))return this.addSoft(id,design,position);
    const body=this.world.createRigidBody((design.attributes.anchored?RAPIER.RigidBodyDesc.fixed():RAPIER.RigidBodyDesc.dynamic()).setTranslation(position.x,position.y,position.z).setLinearDamping(.25).setAngularDamping(.5).setCcdEnabled(true));const e={id,kind:design.kind,body,design,edible:design.attributes.edible,servings:design.attributes.servings,carried:false,stored:0,travel:0,broken:false};
    if(design.kind==='vehicle'){
      const [w,h,d]=design.dimensions;this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.4,w/2-.18),Math.max(.18,h*.22),Math.max(.6,d/2-.15)).setTranslation(0,-h*.1,0).setMass(design.mass),body);
      const v=this.world.createVehicleController(body);v.indexUpAxis=1;v.setIndexForwardAxis=2;
      e.wheels=[];for(const x of [-w*.46,w*.46])for(const z of [-d*.34,d*.34]){const radius=Math.max(.22,Math.min(.4,h*.3)),point=vec(x,-h*.15,z);v.addWheel(point,vec(0,-1,0),vec(-1,0,0),.3,radius);const i=e.wheels.length;v.setWheelSuspensionStiffness(i,28);v.setWheelSuspensionCompression(i,4.4);v.setWheelSuspensionRelaxation(i,3.5);v.setWheelMaxSuspensionForce(i,12000);v.setWheelFrictionSlip(i,2);e.wheels.push({point,radius});}e.vehicle=v;e.drive={throttle:0,steer:0,brake:1};
    }else for(const c of design.colliders){this.world.createCollider(RAPIER.ColliderDesc.cuboid(...c.half).setTranslation(...c.center).setMass(design.mass/design.colliders.length).setFriction(design.properties?.friction??.8).setRestitution(design.properties?.bounce??.13),body);}
    this.entities.set(id,e);this.proxies.set(id,this.ammoBox(position,vec(...design.dimensions.map(n=>Math.max(.04,n/2)))));return e;
  }
  addSoft(id,design,p){
    let soft,indices=[],kind=design.kind;
    if(kind==='rope'){
      const length=Math.max(1,design.dimensions[1]);const a=new Ammo.btVector3(p.x,p.y+length/2,p.z),b=new Ammo.btVector3(p.x+.5,p.y-length/2,p.z);soft=this.helpers.CreateRope(this.softWorld.getWorldInfo(),a,b,18,1);Ammo.destroy(a);Ammo.destroy(b);
    }else if(kind==='cloth'){
      const w=Math.max(1,design.dimensions[0]),h=Math.max(1,design.dimensions[1]);const corners=[new Ammo.btVector3(p.x-w/2,p.y+h/2,p.z),new Ammo.btVector3(p.x+w/2,p.y+h/2,p.z),new Ammo.btVector3(p.x-w/2,p.y-h/2,p.z),new Ammo.btVector3(p.x+w/2,p.y-h/2,p.z)];soft=this.helpers.CreatePatch(this.softWorld.getWorldInfo(),...corners,10,10,3,true);corners.forEach(v=>Ammo.destroy(v));
    }else if(kind==='soft'){
      const radii=design.dimensions.map(n=>Math.max(.15,n/2)),center=new Ammo.btVector3(p.x,p.y,p.z),radius=new Ammo.btVector3(...radii);soft=this.helpers.CreateEllipsoid(this.softWorld.getWorldInfo(),center,radius,96);Ammo.destroy(center);Ammo.destroy(radius);
    }else{
      const mesh=design.meshes[0],points=[],map=new Map(),remap=[];
      for(let i=0;i<mesh.positions.length;i+=3){const xyz=mesh.positions.slice(i,i+3),key=xyz.map(n=>Math.round(n*100000)/100000).join(',');if(!map.has(key)){map.set(key,points.length/3);points.push(xyz[0]+p.x,xyz[1]+p.y,xyz[2]+p.z);}remap.push(map.get(key));}
      const raw=mesh.index||Array.from({length:remap.length},(_,i)=>i);for(let i=0;i<raw.length;i+=3){const tri=raw.slice(i,i+3).map(i=>remap[i]);if(new Set(tri).size===3)indices.push(...tri);}
      const edges=new Map();for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=indices[i+j],b=indices[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');edges.set(key,(edges.get(key)||0)+1);}if([...edges.values()].some(n=>n!==2))throw Error('Soft volume must be a closed watertight surface');
      if(points.length/3>650)throw Error('Soft-body node budget exceeded');soft=this.helpers.CreateFromTriMesh(this.softWorld.getWorldInfo(),points,indices,indices.length/3,true);
    }
    const cfg=soft.get_m_cfg();cfg.set_viterations(15);cfg.set_piterations(15);cfg.set_collisions(0x11);cfg.set_kDF(design.properties?.friction??.6);cfg.set_kDP(.03);if(kind==='soft'){cfg.set_kPR(60);cfg.set_kVC(.5);}const mat=soft.get_m_materials().at(0);mat.set_m_kLST(design.properties?.stiffness??.65);mat.set_m_kAST(.7);soft.setTotalMass(design.mass,false);Ammo.castObject(soft,Ammo.btCollisionObject).getCollisionShape().setMargin(.06);this.softWorld.addSoftBody(soft,1,-1);soft.setActivationState(4);
    const nodes=soft.get_m_nodes(),lookup=new Map();for(let i=0;i<nodes.size();i++)lookup.set(Ammo.getPointer(nodes.at(i)),i);indices=[];const faces=soft.get_m_faces();for(let i=0;i<faces.size();i++)for(let j=0;j<3;j++)indices.push(lookup.get(Ammo.getPointer(faces.at(i).get_m_n(j))));
    if(kind==='soft'&&design.attributes.anchored)for(const i of Array.from({length:nodes.size()},(_,i)=>i).sort((a,b)=>nodes.at(a).get_m_x().y()-nodes.at(b).get_m_x().y()).slice(0,4))nodes.at(i).set_m_im(0);
    const e={id,kind,design,soft,indices,position:p,edible:design.attributes.edible,servings:design.attributes.servings,carried:false,travel:0,cage:kind==='soft'};this.entities.set(id,e);e.rest=this.softPositions(e);e.restEdges=[];for(let i=0;i<e.rest.length/3-1;i++){const j=i+1;e.restEdges.push([i,j,Math.hypot(...[0,1,2].map(k=>e.rest[i*3+k]-e.rest[j*3+k]))]);}return e;
  }
  softPositions(e){const nodes=e.soft.get_m_nodes(),positions=[];for(let i=0;i<nodes.size();i++){const p=nodes.at(i).get_m_x();positions.push(p.x(),p.y(),p.z());}return positions;}
  position(e){if(e.body)return e.body.translation();if(e.fragments?.length){const p=e.fragments.map(f=>f.body.translation()),n=p.length;return vec(p.reduce((v,a)=>v+a.x,0)/n,p.reduce((v,a)=>v+a.y,0)/n,p.reduce((v,a)=>v+a.z,0)/n);}const points=this.softPositions(e),n=points.length/3;return vec(points.filter((_,i)=>i%3===0).reduce((a,b)=>a+b,0)/n,points.filter((_,i)=>i%3===1).reduce((a,b)=>a+b,0)/n,points.filter((_,i)=>i%3===2).reduce((a,b)=>a+b,0)/n);}
  navigationQuery(actorId='actor',{clearance=0,includeSoft=false}={}){
    const actor=this.entities.get(actorId);if(!actor?.controller)throw Error('Movement destination requires a real character');
    const radius=actor.radius+clearance,shape=new RAPIER.Capsule(actor.height/2-radius,radius),bodyEntities=new Map(),obstacles=[];
    for(const e of this.entities.values()){if(e.body)bodyEntities.set(e.body.handle,e);for(const f of e.fragments||[])bodyEntities.set(f.body.handle,e);}
    this.world.propagateModifiedBodyPositionsToColliders();
    this.world.forEachCollider(c=>{const groups=c.collisionGroups(),body=c.parent();if(!c.isEnabled()||c.isSensor()||body?.handle===actor.body.handle||!(groups>>>16&5)||!(groups&4))return;const e=bodyEntities.get(body?.handle);obstacles.push({collider:c,...colliderBounds(c),blocker:e?{id:e.id,name:e.name||e.design?.name||e.id,kind:e.kind}:{...(this.staticColliders.get(c.handle)||{id:null,name:'Physical obstacle',kind:'fixture'})}});});
    if(includeSoft)for(const e of this.entities.values())if(e.soft&&!e.carried){const nodes=this.softPositions(e),bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};for(let i=0;i<nodes.length;i+=3)for(const [j,k]of ['X','Y','Z'].entries()){bounds['min'+k]=Math.min(bounds['min'+k],nodes[i+j]);bounds['max'+k]=Math.max(bounds['max'+k],nodes[i+j]);}obstacles.push({...bounds,blocker:{id:e.id,name:e.design.name,kind:e.kind}});}
    const query={actor,radius,shape,obstacles,checks:0};query.precise=clearance?{actor,radius:actor.radius,shape:new RAPIER.Capsule(actor.height/2-actor.radius,actor.radius),obstacles,checks:0}:query;return query;
  }
  groundMoveDestination({x,z},actorId='actor',{query=null,floor=0,stepHeight=0}={}){
    if(!Number.isFinite(x)||!Number.isFinite(z))throw Error('Movement destination must contain finite x and z coordinates');
    query??=this.navigationQuery(actorId);const {actor,radius,shape}=query,position=vec(x,floor+actor.height/2+.035,z);let blocker=null;query.checks++;
    for(const obstacle of query.obstacles){if(x+radius<obstacle.minX||x-radius>obstacle.maxX||z+radius<obstacle.minZ||z-radius>obstacle.maxZ||position.y+actor.height/2<obstacle.minY||floor+.035>obstacle.maxY||stepHeight>0&&obstacle.collider&&obstacle.maxY<=stepHeight+.001)continue;if(!obstacle.collider||obstacle.collider.intersectsShape(shape,position,identity)){blocker=obstacle.blocker;break;}}
    return {clear:!blocker,position,blocker};
  }
  navigationSurface(point,actorId,query,maxFloor=.25){
    const {x,z}=point;if(Math.abs(x)>GARDEN_BOUNDS.x-query.radius-.15||Math.abs(z)>GARDEN_BOUNDS.z-query.radius-.15)return {clear:false,floor:0};
    let floor=0;const ray=new RAPIER.Ray(vec(x,maxFloor+.06,z),vec(0,-1,0));
    for(const o of query.obstacles){if(!o.collider||o.maxY>maxFloor+.001||o.maxY<floor||x<o.minX||x>o.maxX||z<o.minZ||z>o.maxZ)continue;const hit=o.collider.castRay(ray,maxFloor+.08,true);if(hit>=0){const height=maxFloor+.06-hit;if(height<=maxFloor+.001)floor=Math.max(floor,height);}}
    return {...this.groundMoveDestination(point,actorId,{query,floor,stepHeight:maxFloor}),floor};
  }
  navigationSegment(from,to,actorId,query,{start=from,startFloor=0,goal=null}={}){
    const length=flatDistance(from,to),steps=Math.max(1,Math.ceil(length/.22));let previousFloor=null;
    for(let i=0;i<=steps;i++){if(i===0&&startFloor>.25&&flatDistance(from,start)<.01){previousFloor=startFloor;continue;}const t=i/steps,point={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t},raised=startFloor>.25&&flatDistance(point,start)<2.6,surface=this.navigationSurface(point,actorId,flatDistance(point,start)<.6||goal&&flatDistance(point,goal)<.6?query.precise:query,raised?startFloor+.08:.25);if(!surface.clear||previousFloor!==null&&surface.floor-previousFloor>.26)return false;previousFloor=surface.floor;}
    return true;
  }
  planGroundRoute(actorId,target,{maxNodes=900}={}){
    if(!Number.isFinite(target?.x)||!Number.isFinite(target?.z))throw Error('Movement destination must contain finite x and z coordinates');
    maxNodes=Math.min(1500,Math.max(1,Math.floor(Number(maxNodes)||900)));const started=performance.now(),query=this.navigationQuery(actorId,{clearance:.10,includeSoft:true}),actor=query.actor,p=actor.body.translation(),start={x:p.x,z:p.z},goal={x:target.x,z:target.z},startFloor=Math.max(0,p.y-actor.height/2-.035),context={start,startFloor,goal};let expanded=0;
    const finish=(ok,waypoints=[],reason=null)=>({ok,waypoints,expanded,reason,checks:query.checks,elapsedMs:performance.now()-started});
    if(!this.navigationSurface(goal,actorId,query.precise).clear)return finish(false,[],'Requested destination is occupied or outside the garden');
    if(this.navigationSegment(start,goal,actorId,query,context))return finish(true,[goal]);
    const grid=.5,open=new RouteHeap(),nodes=new Map(),cache=new Map(),closed=new Set();let order=0;
    const key=(x,z)=>x+','+z,point=(x,z)=>({x:x*grid,z:z*grid}),clear=pt=>{const k=key(pt.x,pt.z);if(!cache.has(k))cache.set(k,this.navigationSurface(pt,actorId,flatDistance(pt,start)<.6||flatDistance(pt,goal)<.6?query.precise:query,startFloor>.25&&flatDistance(pt,start)<2.6?startFloor+.08:.25).clear);return cache.get(k);};
    const enqueue=(k,pt,g,parent)=>{const old=nodes.get(k);if(old&&old.g<=g)return;const h=flatDistance(pt,goal),node={key:k,point:pt,g,h,f:g+h,parent,order:order++};nodes.set(k,node);open.push(node);};
    const sx=Math.round(start.x/grid),sz=Math.round(start.z/grid);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const pt=point(sx+dx,sz+dz);if(clear(pt)&&this.navigationSegment(start,pt,actorId,query,context))enqueue(key(sx+dx,sz+dz),pt,flatDistance(start,pt),null);}
    let found=null;const directions=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
    while(open.nodes.length&&expanded<maxNodes){const node=open.pop();if(closed.has(node.key)||nodes.get(node.key)!==node)continue;closed.add(node.key);expanded++;
      if(flatDistance(node.point,goal)<.8&&this.navigationSegment(node.point,goal,actorId,query,context)){found=node;break;}
      const ix=Math.round(node.point.x/grid),iz=Math.round(node.point.z/grid);for(const [dx,dz]of directions){const k=key(ix+dx,iz+dz);if(closed.has(k))continue;const pt=point(ix+dx,iz+dz);if(!clear(pt)||!this.navigationSegment(node.point,pt,actorId,query,context))continue;enqueue(k,pt,node.g+grid*Math.hypot(dx,dz),node);}
    }
    if(!found)return finish(false,[],expanded>=maxNodes?'Route search reached its bounded node budget':'No ground route reaches the requested destination');
    const raw=[goal];for(let n=found;n;n=n.parent)raw.unshift(n.point);raw.unshift(start);const waypoints=[];let i=0;
    while(i<raw.length-1){let next=raw.length-1;while(next>i+1&&!this.navigationSegment(raw[i],raw[next],actorId,query,context))next--;waypoints.push(raw[next]);i=next;}
    return finish(true,waypoints);
  }
  routeTarget(actor,target,dt){
    actor.navigationTime=(actor.navigationTime||0)+dt;const now=actor.navigationTime,p=actor.body.translation();if(!target){actor.route=null;return null;}
    const changed=!actor.route||flatDistance(actor.route.goal,target)>(actor.followId?.3:.00001);
    const plan=replans=>{const result=this.planGroundRoute(actor.id,target);actor.route={goal:{x:target.x,z:target.z},waypoints:result.waypoints,index:0,status:result.ok?'moving':'blocked',reason:result.reason,expanded:result.expanded,checks:result.checks,planningMs:result.elapsedMs,replans,plannedAt:now,checkAt:now+.5,lastProgressAt:now,lastProgressPosition:{x:p.x,z:p.z}};};
    if(changed)plan(0);let route=actor.route;
    if(flatDistance(p,target)<.14){route.status='arrived';return target;}
    if(route.status==='blocked'){if(now>=route.checkAt&&route.replans<3){plan(route.replans+1);route=actor.route;}else return null;}
    if(route.status!=='moving')return null;
    while(route.index<route.waypoints.length-1&&flatDistance(p,route.waypoints[route.index])<.16)route.index++;
    if(flatDistance(p,route.lastProgressPosition)>.04){route.lastProgressPosition={x:p.x,z:p.z};route.lastProgressAt=now;}
    if(now>=route.checkAt){route.checkAt=now+.5;const query=this.navigationQuery(actor.id,{clearance:.08,includeSoft:true}),clear=this.navigationSegment(p,route.waypoints[route.index],actor.id,query,{start:p,startFloor:Math.max(0,p.y-actor.height/2-.035),goal:route.goal}),stalled=now-route.lastProgressAt>.9;
      if(!clear||stalled){if(route.replans<3){plan(route.replans+1);route=actor.route;}else{route.status='blocked';route.reason='Route remained obstructed after three bounded reroutes';return null;}}
    }
    if(route.status!=='moving')return null;return route.waypoints[route.index];
  }
  interactionApproach(id,actorId='actor',{reach=2.7}={}){
    const target=this.entities.get(id),actor=this.entities.get(actorId);
    if(!target)throw Error('Unknown object to approach');if(!actor?.controller||id===actorId)throw Error('Approach requires a different physical target and a real character');
    if(!Number.isFinite(reach)||reach<=0)throw Error('Interaction reach must be a finite positive distance');
    const center=this.position(target),here=actor.body.translation(),angle=Math.atan2(here.x-center.x,here.z-center.z);
    // Ammo soft objects have no Rapier navigation collider. Keep the destination outside their actual node footprint too.
    let softBounds=null;if(target.soft){softBounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};const nodes=this.softPositions(target);for(let i=0;i<nodes.length;i+=3){softBounds.minX=Math.min(softBounds.minX,nodes[i]);softBounds.maxX=Math.max(softBounds.maxX,nodes[i]);softBounds.minZ=Math.min(softBounds.minZ,nodes[i+2]);softBounds.maxZ=Math.max(softBounds.maxZ,nodes[i+2]);}}
    for(const radius of [1.35,1.7,2.1,2.5]){
      if(radius>reach-.1)continue;let best=null,bestDistance=Infinity;
      for(let i=0;i<16;i++){
        const direction=angle+i*Math.PI/8,point={x:center.x+Math.sin(direction)*radius,z:center.z+Math.cos(direction)*radius};
        if(Math.abs(point.x)>GARDEN_BOUNDS.x-actor.radius||Math.abs(point.z)>GARDEN_BOUNDS.z-actor.radius)continue;
        if(softBounds){const dx=Math.max(softBounds.minX-point.x,0,point.x-softBounds.maxX),dz=Math.max(softBounds.minZ-point.z,0,point.z-softBounds.maxZ);if(Math.hypot(dx,dz)<actor.radius+.05)continue;}
        if(!this.groundMoveDestination(point,actorId).clear)continue;
        const distance=Math.hypot(point.x-here.x,point.z-here.z);if(distance<bestDistance){best=point;bestDistance=distance;}
      }
      if(best)return best;
    }
    throw Error('No clear ground approach within '+reach+'m of '+(target.name||target.design?.name||id));
  }
  standUp(actorId='actor'){
    const actor=this.entities.get(actorId);if(!actor?.controller)throw Error('Unknown character');
    if(actor.washing)this.endWash(actorId);
    if(actor.mounted||(!actor.seated&&!actor.reclining))return false;
    const p=actor.body.translation(),origin=vec(p.x,p.y+.5,p.z);
    this.world.propagateModifiedBodyPositionsToColliders();
    const support=this.world.castRay(new RAPIER.Ray(origin,vec(0,-1,0)),actor.height+1,true,undefined,0x00040005,actor.collider,actor.body,collider=>!collider.parent()?.isKinematic());
    // Existing seated and reclining placements offset the capsule center above the support.
    // Lift its center to an upright capsule height before reenabling navigation collisions.
    const supportHeight=support?origin.y-support.timeOfImpact:p.y-(actor.reclining?.22:.72),upright=vec(p.x,Math.max(p.y,supportHeight+actor.height/2+.035),p.z);
    actor.body.setTranslation(upright,true);actor.body.setNextKinematicTranslation(upright);actor.seated=false;actor.reclining=false;actor.collider.setEnabled(true);actor.motionVelocity=vec();actor.walking=false;
    if(actor.rig){actor.rig.feet={};actor.rig.last={...upright};}
    this.world.propagateModifiedBodyPositionsToColliders();return true;
  }
  washStation(id,actorId='actor',{requireNear=true,requireInside=false}={}){
    const e=this.entities.get(id),actor=this.entities.get(actorId),station=e?.design?.washStation;
    if(!actor?.controller)throw Error('Washing requires a real character');
    if(!e?.body||e.kind!=='prop'||!e.design.affordances.includes('wash')||!attributesFor(e).anchored||!station||e.broken||e.carried)throw Error('Washing requires an anchored shower with a verified tray and overhead outlet');
    if(e.washingBy&&e.washingBy!==actorId)throw Error('This shower is already in use');
    const q=e.body.rotation(),up=rotate([0,1,0],q),velocity=e.body.linvel();if(up.y<.995||Math.hypot(velocity.x,velocity.y,velocity.z)>.1)throw Error('The shower must be upright and stable');
    const p=e.body.translation(),point=local=>{const r=rotate(local,q);return vec(p.x+r.x,p.y+r.y,p.z+r.z);},floor=point(station.stand),outlet=point(station.outlet),position=vec(floor.x,floor.y+actor.height/2+.035,floor.z),a=actor.body.translation();
    if(outlet.y-floor.y<actor.height+.07)throw Error('The shower outlet is too low for this character');
    if(requireNear&&Math.hypot(a.x-position.x,a.z-position.z)>2.7)throw Error('Approach the shower before using it');
    this.world.propagateModifiedBodyPositionsToColliders();
    const ray=new RAPIER.Ray(vec(floor.x,floor.y+.05,floor.z),vec(0,-1,0));let support=false;
    for(let i=0;i<e.body.numColliders();i++)if(e.body.collider(i).isEnabled()&&e.body.collider(i).intersectsRay(ray,.10))support=true;
    if(!support)throw Error('The shower tray no longer supports its standing point');
    // Test current collider transforms directly so newly installed obstacles count before the next simulation tick.
    const shape=new RAPIER.Capsule(actor.height/2-actor.radius,actor.radius);let occupied=false;
    this.world.forEachCollider(c=>{const groups=c.collisionGroups();if(c.isEnabled()&&!c.isSensor()&&c.parent()?.handle!==actor.body.handle&&(groups>>>16&5)&&(groups&4)&&c.intersectsShape(shape,position,{x:0,y:0,z:0,w:1}))occupied=true;});
    if(occupied)throw Error('The shower standing area is blocked by a physical object');
    const inside=Math.hypot(a.x-position.x,a.z-position.z)<=.24&&Math.abs((a.y-actor.height/2)-floor.y)<=.22&&!actor.seated&&!actor.reclining&&!actor.mounted;
    if(requireInside&&!inside)throw Error('Stand on the shower tray below the outlet before washing');
    return {position,outlet,supportHeight:floor.y,seconds:station.seconds,inside,approach:{...position}};
  }
  beginWash(id,actorId='actor'){
    const station=this.washStation(id,actorId,{requireInside:true}),actor=this.entities.get(actorId),e=this.entities.get(id);
    if(actor.washing&&actor.washing!==id)this.endWash(actorId);
    actor.washing=id;actor.activity='wash';actor.actionProgress=0;actor.goal=null;actor.motionVelocity=vec();e.washingBy=actorId;return station;
  }
  endWash(actorId='actor'){
    const actor=this.entities.get(actorId);if(!actor?.washing)return false;const e=this.entities.get(actor.washing);
    if(e?.washingBy===actorId)e.washingBy=null;actor.washing=null;if(actor.activity==='wash')actor.activity=null;actor.actionProgress=0;return true;
  }
  move(e,target,dt){
    if(target&&(e.seated||e.reclining)&&!e.mounted)this.standUp(e.id);if(!target)e.route=null;
    if(e.mounted||e.seated||e.reclining){e.walking=false;return false;}
    const p=e.body.translation(),remaining=target?flatDistance(p,target):Infinity,waypoint=this.routeTarget(e,target,dt),dx=waypoint?waypoint.x-p.x:0,dz=waypoint?waypoint.z-p.z:0,length=Math.hypot(dx,dz),speed=waypoint?Math.min(2.3,Math.sqrt(10*Math.max(0,length-.09))):0,wanted=vec(length?dx/length*speed:0,0,length?dz/length*speed:0);
    e.motionVelocity??=vec();const change=vec(wanted.x-e.motionVelocity.x,0,wanted.z-e.motionVelocity.z),magnitude=Math.hypot(change.x,change.z),f=Math.min(1,5*dt/Math.max(.001,magnitude));e.motionVelocity.x+=change.x*f;e.motionVelocity.z+=change.z*f;e.walking=Math.hypot(e.motionVelocity.x,e.motionVelocity.z)>.08;
    if(e.walking){const heading=Math.atan2(e.motionVelocity.x,e.motionVelocity.z),turn=Math.atan2(Math.sin(heading-e.heading),Math.cos(heading-e.heading));e.heading+=Math.max(-4*dt,Math.min(4*dt,turn));}
    e.verticalVelocity=e.controller.computedGrounded()?-.8:Math.max(-9.81,(e.verticalVelocity||0)-9.81*dt);const desired=vec(e.motionVelocity.x*dt,e.verticalVelocity*dt,e.motionVelocity.z*dt);e.controller.computeColliderMovement(e.collider,desired,undefined,0x00040005);const v=e.controller.computedMovement();e.body.setNextKinematicTranslation(vec(p.x+v.x,p.y+v.y,p.z+v.z));e.travel+=Math.hypot(v.x,v.z);return remaining<.15;
  }
  carry(id,actorId='actor'){const actor=this.entities.get(actorId),e=this.entities.get(id);if(!actor?.controller)throw Error('Unknown actor');if(!e||!['prop','breakable','soft'].includes(e.kind)||e.broken||e.design.mass>12||Math.max(...e.design.dimensions)>2||!attributesFor(e).portable||attributesFor(e).anchored)throw Error('This entity cannot be carried');if(e.carried||[...this.entities.values()].some(o=>o.carrier===actorId))throw Error('Hands or object already occupied');const p=this.position(e);if(Math.hypot(actor.body.translation().x-p.x,actor.body.translation().z-p.z)>3)throw Error('Actor is too far away');if(e.body){e.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);for(let i=0;i<e.body.numColliders();i++)e.body.collider(i).setCollisionGroups(0x00080001);}if(e.soft){const nodes=e.soft.get_m_nodes();e.savedInverseMass=Array.from({length:nodes.size()},(_,i)=>nodes.at(i).get_m_im());e.gripNodes=Array.from({length:nodes.size()},(_,i)=>i).sort((a,b)=>nodes.at(b).get_m_x().y()-nodes.at(a).get_m_x().y()).slice(0,4);for(const i of e.gripNodes)nodes.at(i).set_m_im(0);e.heldOffsets=this.softPositions(e).map((n,i)=>n-[p.x,p.y,p.z][i%3]);}e.throwCollisionTime=0;e.carried=true;e.carrier=actorId;this.carried=id;return e;}
  release(id,point){const e=this.entities.get(id);if(!e?.carried)throw Error('Not carrying this object');e.carried=false;e.carrier=null;this.carried=null;if(e.soft){const nodes=e.soft.get_m_nodes();for(let i=0;i<nodes.size();i++)nodes.at(i).set_m_im(e.savedInverseMass?.[i]??nodes.size()/e.design.mass);e.savedInverseMass=null;if(point)this.translateSoft(e,point);return;}e.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);for(let i=0;i<e.body.numColliders();i++)e.body.collider(i).setCollisionGroups(0xffffffff);if(point)e.body.setTranslation(point,true);e.body.setLinvel(vec(),true);e.body.setAngvel(vec(),true);}
  translateSoft(e,point){const current=this.position(e),nodes=e.soft.get_m_nodes();for(let i=0;i<nodes.size();i++){const node=nodes.at(i),p=node.get_m_x();p.setX(p.x()+point.x-current.x);p.setY(p.y()+point.y-current.y);p.setZ(p.z()+point.z-current.z);const q=node.get_m_q();q.setX(p.x());q.setY(p.y());q.setZ(p.z());const vel=node.get_m_v();vel.setX(0);vel.setY(0);vel.setZ(0);}}
  clearPlacement(e,target){if(![target.x,target.y,target.z].every(Number.isFinite)||Math.abs(target.x)>11||Math.abs(target.z)>10||target.y<e.design.dimensions[1]/2+.02||target.y>5)throw Error('Placement is outside the garden');const [w,h,d]=e.design.dimensions;const hit=this.world.intersectionWithShape(target,{x:0,y:0,z:0,w:1},new RAPIER.Cuboid(w/2,h/2,d/2),undefined,0x00010005,undefined,e.body);if(hit)throw Error('Placement intersects a body or obstacle');for(const other of this.entities.values()){if(other.id===e.id||!other.soft)continue;const p=this.position(other);if(Math.abs(p.x-target.x)<(w+other.design.dimensions[0])/2&&Math.abs(p.z-target.z)<(d+other.design.dimensions[2])/2&&Math.abs(p.y-target.y)<(h+other.design.dimensions[1])/2)throw Error('Placement intersects a soft object');}return true;}
  place(id,target){const e=this.entities.get(id);if(!e?.carried)throw Error('Pick up the object before placing it');this.clearPlacement(e,target);this.release(id,target);}
  gripPosition(actor){
    const p=actor.body.translation(),scale=actor.height/1.9,progress=Math.max(0,Math.min(1,Number(actor.actionProgress)||0)),reach=Math.sin(Math.PI*progress);let x=0,y=1.18,z=.72;
    if(['pick_up','drop','place'].includes(actor.activity)){y-=reach*.52;z+=reach*.12;}
    if(actor.activity==='eat'){x=.12;y+=reach*.36;z-=reach*.42;}
    if(actor.activity==='give'){y=1.17;z=.64+reach*.23;}
    if(actor.activity==='throw'){const windup=Math.min(1,progress/.45);x=.39;if(progress<.5){y=1.28+windup*.30;z=.28-windup*.48;}else{const release=Math.min(1,(progress-.5)/.2);y=1.58-release*.22;z=-.20+release*1.13;}}
    const c=Math.cos(actor.heading),s=Math.sin(actor.heading);return vec(p.x+(x*c+z*s)*scale,p.y-actor.height/2+y*scale,p.z+(-x*s+z*c)*scale);
  }
  throwObject(id,actorId='actor',{x,z,speed}={}){
    const actor=this.entities.get(actorId),e=this.entities.get(id),attributes=e?attributesFor(e):null;
    if(!actor?.controller||!e?.body||e.carrier!==actorId||!e.carried)throw Error('Throw requires a held rigid object');
    if(!['prop','breakable'].includes(e.kind)||e.broken||!attributes.throwable||attributes.anchored)throw Error('Object cannot be thrown');
    const limit=Math.min(10,attributes.maxThrowSpeed),launch=speed===undefined||speed===0?Math.min(6,limit):speed;
    if(!Number.isFinite(launch)||launch<=0||launch>limit)throw Error('Throw speed exceeds the object limit');
    if((x!==undefined||z!==undefined)&&(!Number.isFinite(x)||!Number.isFinite(z)))throw Error('Throw aim must have finite x and z');
    const position={...e.body.translation()},dx=x===undefined?Math.sin(actor.heading):x-position.x,dz=z===undefined?Math.cos(actor.heading):z-position.z,length=Math.hypot(dx,dz);
    if(length<.001)throw Error('Throw aim must differ from the held position');
    const horizontal=launch*Math.cos(Math.PI/9),velocity=vec(dx/length*horizontal,launch*Math.sin(Math.PI/9),dz/length*horizontal);
    this.release(id);for(let i=0;i<e.body.numColliders();i++)e.body.collider(i).setCollisionGroups(0x00080001);e.throwCollisionTime=.25;e.body.setLinvel(velocity,true);
    return {id,position,velocity,speed:launch};
  }
  pushObject(id,actorId='actor',{x,z,strength}={}){
    const actor=this.entities.get(actorId),e=this.entities.get(id),attributes=e?attributesFor(e):null;
    if(!actor?.controller||!e?.design||!attributes.pushable||attributes.anchored||e.carried||e.broken||e.design.mass>130||(!e.soft&&!e.body?.isDynamic()))throw Error('Object cannot be pushed');
    const actorPosition=actor.body.translation(),position=this.position(e),distance=Math.hypot(position.x-actorPosition.x,position.z-actorPosition.z);if(distance>2.7)throw Error('Approach the object before pushing');
    const amount=strength===undefined||strength===0?1:strength;if(!Number.isFinite(amount)||amount<1||amount>3)throw Error('Push strength must be from 1 to 3');
    if((x!==undefined||z!==undefined)&&(!Number.isFinite(x)||!Number.isFinite(z)))throw Error('Push aim must have finite x and z');
    const dx=x===undefined?position.x-actorPosition.x:x-position.x,dz=z===undefined?position.z-actorPosition.z:z-position.z,length=Math.hypot(dx,dz);if(length<.001)throw Error('Push aim must differ from the object position');
    const force=Math.min(20,e.design.mass*.8*amount),impulse=vec(dx/length*force,0,dz/length*force);
    if(e.soft){const nodes=e.soft.get_m_nodes();for(let i=0;i<nodes.size();i++){const node=nodes.at(i);if(node.get_m_im()<=0)continue;const velocity=node.get_m_v();velocity.setX(velocity.x()+impulse.x/e.design.mass);velocity.setZ(velocity.z()+impulse.z/e.design.mass);}}else e.body.applyImpulse(impulse,true);
    return {id,impulse};
  }
  giftObject(id,actorId='actor',recipientId){
    const actor=this.entities.get(actorId),recipient=this.entities.get(recipientId),e=this.entities.get(id);
    if(!actor?.controller||!recipient?.controller||actorId===recipientId)throw Error('Gift recipient must be another character');
    if(!e?.carried||e.carrier!==actorId||!attributesFor(e).giftable)throw Error('Gift requires a held giftable object');
    if(Math.hypot(actor.body.translation().x-recipient.body.translation().x,actor.body.translation().z-recipient.body.translation().z)>2)throw Error('Approach the recipient before giving');
    if([...this.entities.values()].some(other=>other.carrier===recipientId))throw Error('Recipient hands are occupied');
    if(Math.hypot(this.position(e).x-recipient.body.translation().x,this.position(e).z-recipient.body.translation().z)>3)throw Error('Held object is beyond the recipient reach');
    this.release(id);this.carry(id,recipientId);e.owner=recipientId;return e;
  }
  remove(id){
    const e=this.entities.get(id);if(!e)return false;
    if(e.washing)this.endWash(id);if(e.washingBy)this.endWash(e.washingBy);
    for(const other of this.entities.values()){if(other.carrier===id)this.release(other.id);if(other.followId===id){other.followId=null;other.goal=null;}if(other.mounted===id){other.mounted=null;other.collider?.setEnabled(true);}}
    if(this.carried===id)this.carried=null;
    if(e.vehicle)this.world.removeVehicleController(e.vehicle);if(e.controller)this.world.removeCharacterController(e.controller);e.rig?.dispose();
    if(e.body)this.world.removeRigidBody(e.body);for(const fragment of e.fragments||[])this.world.removeRigidBody(fragment.body);
    if(e.soft){this.softWorld.removeSoftBody(e.soft);Ammo.destroy(e.soft);}
    this.removeProxy(id);this.entities.delete(id);return true;
  }
  drag(id,target){const e=this.entities.get(id);if(!e?.body||e.kind==="character"||e.carried||attributesFor(e).anchored)throw Error("Select a free rigid object");this.clearPlacement(e,target);const p=e.body.translation();for(let t=.1;t<1;t+=.1)this.clearPlacement(e,vec(p.x+(target.x-p.x)*t,Math.max(e.design.dimensions[1]/2+.025,p.y+(target.y-p.y)*t),p.z+(target.z-p.z)*t));e.dragTarget=target;e.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);}
  endDrag(id){const e=this.entities.get(id);if(!e?.dragTarget)return;e.dragTarget=null;e.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);e.body.setLinvel(vec(),true);e.body.setAngvel(vec(),true);}
  impulse(id,amount=2){const e=this.entities.get(id);if(!e)throw Error('Unknown entity');if(e.soft){const force=new Ammo.btVector3(amount*8,0,-amount*4);e.soft.addForce(force);Ammo.destroy(force);return;}if(e.rig){e.rig.shove(amount);return;}if(e.kind==='breakable'){this.break(e);return;}if(e.body&&e.kind!=='character')e.body.applyImpulse(vec(amount,amount*.45,-amount*.3),true);}
  break(e){if(e.broken)return;e.broken=true;const p=e.body.translation(),rotation=e.body.rotation();this.world.removeRigidBody(e.body);e.body=null;this.removeProxy(e.id);e.fragments=[];
    for(let i=0;i<e.design.meshes.length;i++){const c=e.design.colliders[i],v=rotate(c.center,rotation),body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x+v.x,p.y+v.y,p.z+v.z).setRotation(rotation).setCcdEnabled(true));this.world.createCollider(RAPIER.ColliderDesc.cuboid(...c.half).setMass(e.design.mass/e.design.meshes.length),body);body.applyImpulse(vec((i%3-1)*.5,.3,((i*7)%3-1)*.5),true);e.fragments.push({body,mesh:i,center:c.center});}this.entities.set(e.id,e);
  }
  step(dt=1/60){
    for(const e of this.entities.values()){
      if(e.throwCollisionTime>0){e.throwCollisionTime=Math.max(0,e.throwCollisionTime-dt);if(e.throwCollisionTime===0&&e.body&&!e.carried)for(let i=0;i<e.body.numColliders();i++)e.body.collider(i).setCollisionGroups(0xffffffff);}
      if(e.followId){const leader=this.entities.get(e.followId),p=leader?.body.translation();if(p)e.goal={x:p.x-1.3,z:p.z-1.3};}
      if(e.kind==='character'&&!e.mounted)this.move(e,e.goal,dt);if(e.rig){e.carrying=[...this.entities.values()].some(o=>o.carrier===e.id);e.rig.step(dt);}
      if(e.vehicle&&!e.dragTarget){if(Math.abs(e.drive.throttle)>.001)e.body.wakeUp();for(let i=0;i<4;i++){e.vehicle.setWheelEngineForce(i,e.drive.throttle*e.design.mass*.8);e.vehicle.setWheelBrake(i,e.drive.brake*e.design.mass*.2);e.vehicle.setWheelSteering(i,i%2===0?e.drive.steer*.42:0);}e.vehicle.updateVehicle(dt);const p=e.body.translation();if(e.lastPosition)e.travel+=Math.hypot(p.x-e.lastPosition.x,p.z-e.lastPosition.z);e.lastPosition=p;}
      if(e.carried){const carrier=this.entities.get(e.carrier||'actor'),heading=carrier.heading,target=this.gripPosition(carrier);if(e.body){e.body.setNextKinematicTranslation(target);e.body.setNextKinematicRotation({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)});}else{const nodes=e.soft.get_m_nodes();for(const i of e.gripNodes){const node=nodes.at(i),p=node.get_m_x(),q=node.get_m_q();p.setX(target.x+e.heldOffsets[i*3]);p.setY(target.y+e.heldOffsets[i*3+1]);p.setZ(target.z+e.heldOffsets[i*3+2]);q.setX(p.x());q.setY(p.y());q.setZ(p.z());const velocity=node.get_m_v();velocity.setX(0);velocity.setY(0);velocity.setZ(0);}}}
      if(e.dragTarget){const p=e.body.translation(),t=e.dragTarget,len=Math.hypot(t.x-p.x,t.y-p.y,t.z-p.z),f=Math.min(1,dt*3/Math.max(.001,len));e.body.setNextKinematicTranslation(vec(p.x+(t.x-p.x)*f,p.y+(t.y-p.y)*f,p.z+(t.z-p.z)*f));}
    }
    this.world.step();
    for(const [id,proxy]of this.proxies){const e=this.entities.get(id);if(!e?.body)continue;const p=e.body.translation(),q=e.body.rotation(),t=new Ammo.btTransform();t.setIdentity();const origin=new Ammo.btVector3(p.x,p.y,p.z),rotation=new Ammo.btQuaternion(q.x,q.y,q.z,q.w);t.setOrigin(origin);t.setRotation(rotation);proxy.setWorldTransform(t);proxy.getMotionState().setWorldTransform(t);Ammo.destroy(t);Ammo.destroy(origin);Ammo.destroy(rotation);}
    this.softWorld.stepSimulation(dt,1,dt);
    for(const e of this.entities.values())if(e.kind==='breakable'&&e.body&&!e.carried&&!e.broken){const v=e.body.linvel(),speed=Math.hypot(v.x,v.y,v.z);if((e.lastSpeed||0)>6&&speed<e.lastSpeed*.35)this.break(e);e.lastSpeed=speed;}
  }
  snapshot(){return [...this.entities.values()].map(e=>{let position=e.body?e.body.translation():e.soft||e.fragments?this.position(e):vec();const out={id:e.id,kind:e.kind,position,rotation:e.body?e.body.rotation():{x:0,y:0,z:0,w:1},velocity:e.body?e.body.linvel():vec(),mass:e.design?.mass||65,physicalMass:e.body?.mass()??e.design?.mass??65,attributes:e.design?attributesFor(e):null,name:e.name||e.design?.name||'Agent Wobble',description:e.design?.description||null,owner:e.owner,carrier:e.carrier,goal:e.goal,followId:e.followId,drive:e.drive,mounted:e.mounted,seated:e.seated,reclining:e.reclining,activity:e.activity||null,actionProgress:e.actionProgress||0,design:e.design?{name:e.design.name,description:e.design.description,attributes:attributesFor(e),dimensions:e.design.dimensions,stats:e.design.stats,affordances:e.design.affordances,colliderPolicy:e.design.colliderPolicy,anchor:e.design.anchor}:null,edible:!!e.edible,servings:e.servings||0,carried:!!e.carried,stored:e.stored||0,travel:e.travel||0,walking:e.walking||false,heading:e.heading||0,grounded:e.controller?.computedGrounded()||false,broken:e.broken||false};
      if(e.controller)out.route=e.route?{goal:{...e.route.goal},waypoints:e.route.waypoints.map(p=>({...p})),index:e.route.index,status:e.route.status,reason:e.route.reason,expanded:e.route.expanded,replans:e.route.replans,planningMs:e.route.planningMs}:null;
      out.washing=e.washing||null;if(e.design?.washStation){out.design.washStation=structuredClone(e.design.washStation);const q=e.body.rotation(),point=local=>{const r=rotate(local,q);return vec(position.x+r.x,position.y+r.y,position.z+r.z);},washer=this.entities.get(e.washingBy);out.washingBy=washer?.washing===e.id?washer.id:null;out.washEffect={active:!!out.washingBy,actorId:out.washingBy,outlet:point(e.design.washStation.outlet),floor:point(e.design.washStation.stand).y,progress:washer?.actionProgress||0};}
      if(e.rig)out.rig=e.rig.snapshot();if(e.soft){out.softPositions=this.softPositions(e);out.softIndices=e.indices;out.cage=e.cage;out.softRest=e.rest;out.softOrigin=e.position;out.deformation=Math.max(0,...e.restEdges.map(([i,j,length])=>Math.abs(Math.hypot(...[0,1,2].map(k=>out.softPositions[i*3+k]-out.softPositions[j*3+k]))-length)));out.nodeMotion=Math.max(...out.softPositions.map((n,i)=>Math.abs(n-e.rest[i])));}
      if(e.vehicle){out.speed=e.vehicle.currentVehicleSpeed();out.wheels=e.wheels.map((w,i)=>({...w,rotation:e.vehicle.wheelRotation(i),steering:e.vehicle.wheelSteering(i),suspension:e.vehicle.wheelSuspensionLength(i),contact:e.vehicle.wheelIsInContact(i)}));}
      if(e.fragments)out.fragments=e.fragments.map(f=>({mesh:f.mesh,center:f.center,position:f.body.translation(),rotation:f.body.rotation()}));return out;});}
  dispose(){this.world.free();for(const e of this.entities.values())if(e.soft){this.softWorld.removeSoftBody(e.soft);Ammo.destroy(e.soft);}for(const item of this.ammoOwned)Ammo.destroy(item);Ammo.destroy(this.helpers);Ammo.destroy(this.softWorld);Ammo.destroy(this.softSolver);Ammo.destroy(this.solver);Ammo.destroy(this.broadphase);Ammo.destroy(this.dispatcher);Ammo.destroy(this.config);}
}
export function rotate(v,q){const [x,y,z]=v,tx=2*(q.y*z-q.z*y),ty=2*(q.z*x-q.x*z),tz=2*(q.x*y-q.y*x);return {x:x+q.w*tx+q.y*tz-q.z*ty,y:y+q.w*ty+q.z*tx-q.x*tz,z:z+q.w*tz+q.x*ty-q.y*tx};}







