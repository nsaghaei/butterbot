import {objectInfo,worldObjects} from './perception.mjs';
import {retrieveMemory} from './memory.mjs';
import {attributesFor,liftingBlocker,capabilityBlockers} from './object-attributes.mjs';
export const LANDMARKS={sunny_pad:{x:1,z:1},flower_bed:{x:6,z:-5},quiet_patch:{x:-2,z:5},printer:{x:-5,z:-.8}};
export const ACTIONS=['observe','move','approach','pick_up','place','drop','throw','push','give','inspect','use','print','rest','dance','eat','think','speak','ask_for_help'];
export function validatePlanCoverage(objective,steps){
  const t=objective.toLowerCase(),actions=steps.map(s=>s.action);for(const [pattern,action]of [[/\bdance\b/,'dance'],[/\brest\b/,'rest'],[/\beat\b/,'eat'],[/\bpick up\b/,'pick_up']])if(pattern.test(t)&&!new RegExp("(?:don't|do not|without) "+action.replace('_',' ')).test(t)&&!actions.includes(action))throw Error('Plan omitted explicitly requested action: '+action);
  if(/\b(place|put)\b/.test(t)&&!/\b(print|create|make)\b/.test(t)&&!actions.includes('place'))throw Error('Plan omitted placing the existing object');
  const coords=[...t.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)];for(const m of coords)if(!steps.some(a=>['move','place'].includes(a.action)&&Math.abs(a.x-Number(m[1]))<.01&&Math.abs(a.z-Number(m[2]))<.01))throw Error('Plan omitted requested coordinates '+m[0]);
  if(/\bcircle\b/.test(t)){const moves=steps.filter(s=>s.action==='move');if(moves.length<4||Math.hypot(moves[0].x-moves.at(-1).x,moves[0].z-moves.at(-1).z)>1.5)throw Error('A circular route needs at least four waypoints forming a closed loop');}
  return true;
}
const TARGET_ACTIONS=new Set(['approach','pick_up','inspect','use','eat','drop','throw','push','give']);
const PHYSICAL_ACTIONS=new Set(['pick_up','use','eat','drop','throw','push','give']);
const POINT_ACTIONS=new Set(['move','place','throw','push']);
function checkPoint(a){if(!Number.isFinite(a.x)||!Number.isFinite(a.z)||Math.abs(a.x)>10.5||Math.abs(a.z)>9.5)throw Error('Point must be inside the garden');}
function normalizeForce(a,entity){
  const normalized={...a};
  if(a.action==='throw'){
    const limit=attributesFor(entity).maxThrowSpeed,speed=a.speed===undefined||a.speed===0?Math.min(6,limit):a.speed;
    if(typeof speed!=='number'||!Number.isFinite(speed)||speed<=0||speed>limit)throw Error(`Throw speed must be above 0 and at most ${limit}m/s`);
    normalized.speed=speed;
  }
  if(a.action==='push'){
    const strength=a.strength===undefined||a.strength===0?1:a.strength;
    if(typeof strength!=='number'||!Number.isFinite(strength)||strength<1||strength>3)throw Error('Push strength must be between 1 and 3');
    normalized.strength=strength;
  }
  return normalized;
}
function checkCapability(entity,a){
  const blocked=capabilityBlockers(entity);
  if(['pick_up','throw','give','push','eat'].includes(a.action)&&blocked[a.action])throw Error(blocked[a.action]);
  if(a.action==='use'&&(!entity.design.affordances.includes(a.use)||!['store','sit','rest','display','follow','drive','squish','swing','drape','break'].includes(a.use)))throw Error('Object does not implement that interaction');
}
export function validatePlanTargets(garden,steps,actorId=garden.selectedActor){
  for(const a of steps){
    if(!a||!ACTIONS.includes(a.action))throw Error('Unsupported action');
    const entity=garden.physics.entities.get(a.target),info=objectInfo(garden,a.target);
    if(TARGET_ACTIONS.has(a.action)&&!info)throw Error('Plan references unavailable target '+a.target+'. PRINT already includes collection and use; do not invent a future target.');
    if(PHYSICAL_ACTIONS.has(a.action)&&!entity?.design)throw Error('This fixture only supports approach and inspection');
    if(POINT_ACTIONS.has(a.action))checkPoint(a);
    if(PHYSICAL_ACTIONS.has(a.action)){checkCapability(entity,a);normalizeForce(a,entity);}
    if(a.action==='give'){
      const recipient=garden.physics.entities.get(a.recipient);
      if(!recipient?.controller)throw Error('Gift recipient must be an existing character');
      if(recipient.id===actorId)throw Error('Cannot give an object to yourself');
    }
  }
  return true;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function validateAction(garden,brain,a){
  if(!a||!ACTIONS.includes(a.action))throw Error('Unsupported action');
  const actor=brain.actor,p=actor.body.translation(),held=[...garden.physics.entities.values()].find(e=>e.carrier===brain.actorId);
  if(['drop','place'].includes(a.action)&&!a.target&&held)a={...a,target:held.id};
  const entity=garden.physics.entities.get(a.target),info=objectInfo(garden,a.target);
  if(TARGET_ACTIONS.has(a.action)&&!info)throw Error('Target is unavailable');
  if(entity&&garden.reservations.has(entity.id)&&garden.reservations.get(entity.id)!==brain.actorId)throw Error('Another character has reserved this object');
  if(POINT_ACTIONS.has(a.action))checkPoint(a);
  if(PHYSICAL_ACTIONS.has(a.action)&&!entity?.design)throw Error('This fixture only supports approach and inspection');
  if(PHYSICAL_ACTIONS.has(a.action))checkCapability(entity,a);
  if(a.action==='pick_up'){
    const blocker=liftingBlocker(entity);if(blocker)throw Error(blocker);
    if(entity.carried||entity.carrier)throw Error(entity.design.name+' is already being carried');
    if(held)throw Error('Hands are occupied by '+held.design.name);
  }
  if(['place','drop','throw','give'].includes(a.action)){
    if(!held)throw Error('Nothing is held; pick up the object first');
    if(a.target&&held.id!==a.target)throw Error('The requested object is not held');
  }
  if(a.action==='throw'&&distance(p,a)<.05)throw Error('Choose a throw destination away from the character');
  if(a.action==='push'){
    if(entity.carried||entity.carrier)throw Error('Put down '+entity.design.name+' before pushing it');
    if(entity.body?.isDynamic&& !entity.body.isDynamic())throw Error(entity.design.name+' is not a free dynamic body');
    if(distance(info.position,a)<.05)throw Error('Choose a push destination away from the object');
  }
  if(a.action==='give'){
    const recipient=garden.physics.entities.get(a.recipient);
    if(!recipient?.controller)throw Error('Gift recipient must be an existing character');
    if(recipient.id===brain.actorId)throw Error('Cannot give an object to yourself');
    if(distance(p,recipient.body.translation())>2)throw Error('Approach the recipient to within 2m before giving');
    if([...garden.physics.entities.values()].some(e=>e.carrier===recipient.id))throw Error('The recipient already has an object in their hands');
  }
  if(['pick_up','inspect','use','eat','push'].includes(a.action)&&distance(p,a.action==='inspect'?(info.approach||info.position):info.position)>(a.action==='inspect'?1.7:2.7))throw Error('Approach the object first');
  return {...normalizeForce(a,entity),seconds:Math.min(8,Math.max(2,Number(a.seconds)||3))};
}
export function feasibleActions(garden,brain){
  const offered=[{action:'observe',label:'Observe my surroundings',seconds:2},{action:'rest',label:'Rest here and recover energy',seconds:4},{action:'dance',label:'Dance here for a moment',seconds:4},{action:'print',label:'Go to the idea printer to create something'},{action:'think',label:'Think about the goal and remember useful details'},{action:'ask_for_help',label:'Ask the creator for help with this goal'},{action:'speak',label:'Say what is on my mind'}],p=brain.actor.body.translation();
  for(const [name,point]of Object.entries(LANDMARKS))offered.push({action:'move',label:'Walk to '+name.replaceAll('_',' '),...point});
  const held=[...garden.physics.entities.values()].find(e=>e.carrier===brain.actorId);
  const boundedPoint=(origin,dx,dz)=>({x:Math.max(-10.5,Math.min(10.5,origin.x+dx)),z:Math.max(-9.5,Math.min(9.5,origin.z+dz))});
  if(held){
    offered.push({action:'place',target:held.id,x:1,z:1,label:'Place '+held.design.name+' on the sunny pad'},{action:'drop',target:held.id,label:'Drop '+held.design.name+' here'});
    const heading=brain.actor.heading||0;let aim=boundedPoint(p,Math.sin(heading)*3,Math.cos(heading)*3);
    if(distance(p,aim)<.1)aim=boundedPoint(p,-Math.sin(heading)*3,-Math.cos(heading)*3);
    offered.push({action:'throw',target:held.id,...aim,speed:Math.min(6,attributesFor(held).maxThrowSpeed),label:'Throw '+held.design.name+' ahead'});
    for(const recipient of garden.physics.entities.values())if(recipient.controller&&recipient.id!==brain.actorId)offered.push({action:'give',target:held.id,recipient:recipient.id,label:'Give '+held.design.name+' to '+(recipient.name||recipient.design?.name||recipient.id)});
  }
  for(const fixture of worldObjects(garden).filter(e=>e.kind==='fixture'))offered.push({action:distance(p,fixture.approach||fixture.position)<=1.7?'inspect':'approach',target:fixture.id,label:'Examine '+fixture.name});
  for(const e of garden.physics.entities.values()){
    if(!e.design)continue;const position=garden.physics.position(e),near=distance(p,position)<2.7;
    if(!near){offered.push({action:'approach',target:e.id,label:'Approach '+e.design.name});continue;}
    offered.push({action:'inspect',target:e.id,label:'Inspect '+e.design.name});
    for(const use of e.design.affordances)offered.push({action:'use',target:e.id,use,label:`${use}: ${e.design.name}`});
    const attrs=attributesFor(e);
    if(attrs.portable&&!e.carried&&!held&&!e.broken)offered.push({action:'pick_up',target:e.id,label:'Pick up '+e.design.name});
    if(attrs.edible&&attrs.servings>0)offered.push({action:'eat',target:e.id,label:'Eat one serving of '+e.design.name});
    if(attrs.pushable){const dx=position.x-p.x,dz=position.z-p.z,length=Math.hypot(dx,dz)||1,aim=boundedPoint(position,dx/length*2,(Math.abs(dx)+Math.abs(dz)<.01?1:dz/length)*2);offered.push({action:'push',target:e.id,...aim,strength:1,label:'Push '+e.design.name+' away'});}
  }
  return offered.filter(a=>{try{validateAction(garden,brain,a);return true;}catch{return false;}});
}
export function conciseWorld(garden,brain){const objects=worldObjects(garden);return {capabilities:ACTIONS,stage:brain.stage,blocker:brain.error||null,availableActions:feasibleActions(garden,brain).slice(0,24),physicalLimits:{liftMassKg:12,carryMaxDimensionM:2,pushMassKg:130,giftDistanceM:2},actor:{id:brain.actorId,name:brain.actorName,core:brain.core,style:brain.style,memory:retrieveMemory(brain,brain.objective,3),memoryCatalog:brain.memory.map(m=>({id:m.id,kind:m.kind,updatedAt:m.updatedAt,lastUsed:m.lastUsed})),position:brain.actor.body.translation(),needs:brain.needs,inventory:[...garden.physics.entities.values()].filter(e=>e.carrier===brain.actorId).map(e=>e.id)},characters:[...garden.physics.entities.values()].filter(e=>e.controller).map(e=>({id:e.id,name:e.name||e.design?.name||e.id,position:{...garden.physics.position(e)},held:[...garden.physics.entities.values()].filter(o=>o.carrier===e.id).map(o=>o.id)})),lastObservation:brain.lastObservation||null,lastInspection:brain.lastInspection||null,landmarks:LANDMARKS,objects,actionBlockers:objects.filter(o=>Object.keys(o.blockedActions).length).map(o=>({id:o.id,name:o.name,blocked:o.blockedActions})),printer:{owner:garden.printerOwner,queue:garden.queue},recentOutcomes:brain.logs.filter(l=>l.type==='action_outcome').slice(-3).map(l=>l.outcome)};}


