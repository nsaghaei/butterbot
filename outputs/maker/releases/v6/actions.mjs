import {objectInfo,worldObjects} from './perception.mjs';
import {retrieveMemory} from './memory.mjs';
export const LANDMARKS={sunny_pad:{x:1,z:1},flower_bed:{x:6,z:-5},quiet_patch:{x:-2,z:5},printer:{x:-5,z:-.8}};
export const ACTIONS=['observe','move','approach','pick_up','place','inspect','use','print','rest','dance','eat','think','speak','ask_for_help'];
export function validatePlanCoverage(objective,steps){
  const t=objective.toLowerCase(),actions=steps.map(s=>s.action);for(const [pattern,action]of [[/\bdance\b/,'dance'],[/\brest\b/,'rest'],[/\beat\b/,'eat'],[/\bpick up\b/,'pick_up']])if(pattern.test(t)&&!new RegExp("(?:don't|do not|without) "+action.replace('_',' ')).test(t)&&!actions.includes(action))throw Error('Plan omitted explicitly requested action: '+action);
  if(/\b(place|put)\b/.test(t)&&!/\b(print|create|make)\b/.test(t)&&!actions.includes('place'))throw Error('Plan omitted placing the existing object');
  const coords=[...t.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)];for(const m of coords)if(!steps.some(a=>['move','place'].includes(a.action)&&Math.abs(a.x-Number(m[1]))<.01&&Math.abs(a.z-Number(m[2]))<.01))throw Error('Plan omitted requested coordinates '+m[0]);
  if(/\bcircle\b/.test(t)){const moves=steps.filter(s=>s.action==='move');if(moves.length<4||Math.hypot(moves[0].x-moves.at(-1).x,moves[0].z-moves.at(-1).z)>1.5)throw Error('A circular route needs at least four waypoints forming a closed loop');}
  return true;
}
export function validatePlanTargets(garden,steps){for(const a of steps){if(['pick_up','use','eat'].includes(a.action)&&!garden.physics.entities.get(a.target)?.design)throw Error('Target unavailable for this physical action: '+a.target);if(['approach','pick_up','inspect','use','eat'].includes(a.action)&&!objectInfo(garden,a.target))throw Error('Plan references unavailable target '+a.target+'. PRINT already includes collection and use; do not invent a future target.');if(['move','place'].includes(a.action)&&(!Number.isFinite(a.x)||!Number.isFinite(a.z)||Math.abs(a.x)>10.5||Math.abs(a.z)>9.5))throw Error('Planned point is outside the garden');if(a.action==='use'&&(!garden.physics.entities.get(a.target)?.design||!objectInfo(garden,a.target).affordances.includes(a.use)))throw Error('Planned interaction is not supported by the target');}return true;}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function validateAction(garden,brain,a){
  if(!a||!ACTIONS.includes(a.action))throw Error('Unsupported action');
  const actor=brain.actor,p=actor.body.translation(),entity=garden.physics.entities.get(a.target),info=objectInfo(garden,a.target),held=[...garden.physics.entities.values()].find(e=>e.carrier===brain.actorId);
  if(['approach','pick_up','inspect','use','eat'].includes(a.action)&&!info)throw Error('Target is unavailable');
  if(entity&&garden.reservations.has(entity.id)&&garden.reservations.get(entity.id)!==brain.actorId)throw Error('Another character has reserved this object');
  if(['move','place'].includes(a.action)&&(!Number.isFinite(a.x)||!Number.isFinite(a.z)||Math.abs(a.x)>10.5||Math.abs(a.z)>9.5))throw Error('Point must be inside the garden');
  if(['pick_up','use','eat'].includes(a.action)&&!entity?.design)throw Error('This fixture only supports approach and inspection');
  if(a.action==='pick_up'&&(!['prop','breakable','soft'].includes(entity.kind)||entity.broken||entity.carried||held||entity.design.mass>12))throw Error('Object cannot be picked up');
  if(a.action==='place'&&!held)throw Error('Nothing is held');
  if(a.action==='use'&&(!entity.design.affordances.includes(a.use)||!['store','sit','rest','display','follow','drive','squish','swing','drape','break'].includes(a.use)))throw Error('Object does not implement that interaction');
  if(a.action==='eat'&&!(entity.edible&&entity.servings>0))throw Error('No edible resource remains');
  if(['pick_up','inspect','use','eat'].includes(a.action)&&distance(p,a.action==='inspect'?(info.approach||info.position):info.position)>(a.action==='inspect'?1.7:2.7))throw Error('Approach the object first');
  return {...a,seconds:Math.min(8,Math.max(2,Number(a.seconds)||3))};
}
export function feasibleActions(garden,brain){
  const offered=[{action:'observe',label:'Observe my surroundings',seconds:2},{action:'rest',label:'Rest here and recover energy',seconds:4},{action:'dance',label:'Dance here for a moment',seconds:4},{action:'print',label:'Go to the idea printer to create something'},{action:'think',label:'Think about the goal and remember useful details'},{action:'ask_for_help',label:'Ask the creator for help with this goal'},{action:'speak',label:'Say what is on my mind'}],p=brain.actor.body.translation();
  for(const [name,point]of Object.entries(LANDMARKS))offered.push({action:'move',label:'Walk to '+name.replaceAll('_',' '),...point});
  const held=[...garden.physics.entities.values()].find(e=>e.carrier===brain.actorId);if(held)offered.push({action:'place',x:1,z:1,label:'Place held object on the sunny pad'});
  for(const fixture of worldObjects(garden).filter(e=>e.kind==='fixture'))offered.push({action:distance(p,fixture.approach||fixture.position)<=1.7?'inspect':'approach',target:fixture.id,label:'Examine '+fixture.name});
  for(const e of garden.physics.entities.values()){if(!e.design)continue;const near=distance(p,garden.physics.position(e))<2.7;if(!near){offered.push({action:'approach',target:e.id,label:'Approach '+e.design.name});continue;}offered.push({action:'inspect',target:e.id,label:'Inspect '+e.design.name});for(const use of e.design.affordances)offered.push({action:'use',target:e.id,use,label:`${use}: ${e.design.name}`});if(['prop','breakable','soft'].includes(e.kind)&&!e.carried&&!held&&!e.broken)offered.push({action:'pick_up',target:e.id,label:'Pick up '+e.design.name});if(e.edible&&e.servings>0)offered.push({action:'eat',target:e.id,label:'Eat one serving of '+e.design.name});}
  return offered.filter(a=>{try{validateAction(garden,brain,a);return true;}catch{return false;}});
}
export function conciseWorld(garden,brain){return {capabilities:ACTIONS,stage:brain.stage,blocker:brain.error||null,availableActions:feasibleActions(garden,brain).slice(0,24),actor:{id:brain.actorId,name:brain.actorName,core:brain.core,style:brain.style,memory:retrieveMemory(brain,brain.objective,3),memoryCatalog:brain.memory.map(m=>({id:m.id,kind:m.kind,updatedAt:m.updatedAt,lastUsed:m.lastUsed})),position:brain.actor.body.translation(),needs:brain.needs,inventory:[...garden.physics.entities.values()].filter(e=>e.carrier===brain.actorId).map(e=>e.id)},lastObservation:brain.lastObservation||null,lastInspection:brain.lastInspection||null,landmarks:LANDMARKS,objects:worldObjects(garden),printer:{owner:garden.printerOwner,queue:garden.queue},recentOutcomes:brain.logs.filter(l=>l.type==='action_outcome').slice(-3).map(l=>l.outcome)};}


