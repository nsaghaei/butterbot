import {LANDMARKS} from './actions.mjs';
import {attributesFor,liftingBlocker} from './object-attributes.mjs';
import {tickNeeds} from './needs.mjs';

const nameOf=entity=>entity.design?.name||entity.name||entity.id;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const available=(brain,entity)=>!entity.broken&&(!entity.carrier||entity.carrier===brain.actorId)&&(!brain.garden.reservations.has(entity.id)||brain.garden.reservations.get(entity.id)===brain.actorId);
function nearbyObjects(brain){
  const p=brain.actor.body.translation();
  return [...brain.garden.physics.entities.values()].filter(e=>e.design&&(e.body||e.soft||e.fragments?.length)&&available(brain,e)).map(entity=>({entity,distance:distance(p,brain.garden.physics.position(entity))})).filter(o=>Number.isFinite(o.distance)).sort((a,b)=>a.distance-b.distance||a.entity.id.localeCompare(b.entity.id));
}
function accommodationGoal(objects,use,id,verb){
  const found=objects.find(({entity})=>entity.design.affordances.includes(use));if(!found)return null;
  const {entity,distance:away}=found,name=nameOf(entity);
  return {id,text:verb+' at '+name+'.',steps:[...(away>2.7?[{action:'approach',target:entity.id,label:'Approach '+name}]:[]),{action:'use',target:entity.id,use,seconds:6,label:verb+' at '+name}]};
}
function restGoal(critical=false,objects=[]){return accommodationGoal(objects,'rest','rest','Rest')||{id:'rest',text:critical?'Rest here to recover critically low energy.':'Rest here to recover energy.',steps:[{action:'rest',seconds:critical?7:6,label:'Rest here and recover energy'}]};}
function foodGoal(brain,objects){
  const held=[...brain.garden.physics.entities.values()].find(entity=>entity.carrier===brain.actorId);
  const foods=objects.filter(({entity})=>{const attrs=attributesFor(entity);return attrs.edible&&attrs.servings>0&&!liftingBlocker(entity);});
  const found=foods.find(({entity})=>entity.id===held?.id)||foods[0];
  const freeHands=held&&held.id!==found?.entity.id?[{action:'drop',target:held.id,label:'Drop '+nameOf(held)+' here to free my hands'}]:[];
  const prefix=freeHands.length?'Drop '+nameOf(held)+' here to free my hands, then ':'';
  if(found){const {entity,distance:away}=found,name=nameOf(entity);return {id:'eat',text:prefix+(prefix?'eat':'Eat')+' one available serving of '+name+'.',steps:[...freeHands,...(away>2.7?[{action:'approach',target:entity.id,label:'Approach '+name}]:[]),{action:'eat',target:entity.id,label:'Eat one serving of '+name}]};}
  const owner=brain.garden.printerOwner,generatorReady=brain.providers?.generator?.ready===true;
  if(generatorReady&&(!owner||owner===brain.actorId))return {id:'print_food',text:prefix+(prefix?'print':'Print')+' one small edible orange, then eat it to relieve hunger.',steps:[...freeHands,{action:'print',label:'Print one small edible orange with one serving, made from food'},{action:'eat',target:'$step'+(freeHands.length+1),label:'Eat the printed orange'}]};
  const reason=!generatorReady?'the food generator is unavailable':'the printer is currently in use by another character';
  return {id:'explain',text:'Ask for help: no edible serving is available and '+reason+'.',steps:[{action:'ask_for_help',label:'Explain the missing food and unavailable '+(!generatorReady?'generator':'printer')}]};
}

// These are grounded engine proposals. Selecting or planning one does not fulfill a need.
export function goalCandidates(brain){
  const objects=nearbyObjects(brain),{energy,hunger,fun,hygiene,comfort}=brain.needs;
  if(energy<=15)return [restGoal(true,objects)];
  const food=hunger>=35?foodGoal(brain,objects):null;
  if(hunger>=85)return [food];
  const needs=[];
  if(food)needs.push({priority:hunger,goal:food});
  if(energy<65)needs.push({priority:100-energy,goal:restGoal(false,objects)});
  if(hygiene<55)needs.push({priority:100-hygiene,goal:accommodationGoal(objects,'wash','wash','Wash')||{id:'wash_help',text:'Ask for help finding a usable shower; none is currently available.',steps:[{action:'ask_for_help',label:'Explain that no usable shower is available'}]}});
  if(comfort<55)needs.push({priority:100-comfort,goal:accommodationGoal(objects,'sit','sit','Sit comfortably')||{...restGoal(false,objects),id:'comfort',text:'Rest to recover some comfort.'}});
  if(brain.needs.social<65){const partner=[...brain.garden.brains.values()].find(other=>brain.garden.social.available(brain,other.actorId));if(partner)needs.push({priority:100-brain.needs.social,goal:{id:'socialize',text:'Chat with '+partner.actorName+' to enjoy some company.',steps:[{action:'socialize',target:partner.actorId,label:'Chat with '+partner.actorName}]}});}
  if(fun<70&&energy>25)needs.push({priority:100-fun,goal:{id:'dance',text:'Enjoy a little dance here to improve my mood.',steps:[{action:'dance',seconds:5,label:'Dance here for a little fun'}]}});
  needs.sort((a,b)=>b.priority-a.priority);
  // Do not let an optional outing displace a substantial physical need.
  if(hunger>=65||energy<=35||hygiene<=25||comfort<=25)return needs.filter(({goal})=>goal.id!=='dance').map(({goal})=>goal).slice(0,4);
  const goals=needs.map(({goal})=>goal);
  const interesting=objects.find(({entity})=>!entity.carried&&!attributesFor(entity).edible&&brain.lastInspection?.id!==entity.id);
  if(interesting){const {entity,distance:away}=interesting,name=nameOf(entity);goals.push({id:'inspect',text:'Have a closer look at '+name+'.',steps:[...(away>1.7?[{action:'approach',target:entity.id,label:'Approach '+name}]:[]),{action:'inspect',target:entity.id,seconds:2,label:'Inspect '+name}]});}
  if(!brain.lastObservation||brain.time-(brain.lastObservation.observedAt??0)>30)goals.push({id:'observe',text:'Observe the objects and activity around me from here.',steps:[{action:'observe',seconds:2,label:'Observe my surroundings'}]});
  const landmarks=Object.entries(LANDMARKS).filter(([name])=>name!=='printer'),p=brain.actor.body.translation();
  for(let offset=0;offset<landmarks.length;offset++){const [name,point]=landmarks[((brain.exploreIndex||0)+offset)%landmarks.length];if(distance(p,point)>1){goals.push({id:'explore',text:'Take a walk to the '+name.replaceAll('_',' ')+'.',steps:[{action:'move',...point,label:'Walk to the '+name.replaceAll('_',' ')}]});break;}}
  return goals.length?goals.slice(0,4):[restGoal()];
}

function imminentRelief(brain,need){
  const index=brain.planIndex||0,steps=(brain.planSteps||[]).slice(index),first=steps[0];
  if(need==='energy')return first?.action==='rest'||first?.action==='use'&&first.use==='rest'||first?.action==='approach'&&steps[1]?.action==='use'&&steps[1].use==='rest'&&first.target===steps[1].target;
  const eatIndex=steps.findIndex(step=>step.action==='eat');
  if(eatIndex<0||eatIndex>4)return false;
  const prerequisites=steps.slice(0,eatIndex),target=steps[eatIndex].target,printIndex=prerequisites.findIndex(step=>step.action==='print');
  if(printIndex>=0&&target!=='$step'+(index+printIndex+1))return false;
  const held=[...brain.garden.physics.entities.values()].find(entity=>entity.carrier===brain.actorId);
  const source=/^\$step([1-8])$/.exec(target||''),foodId=source?brain.stepResults?.[Number(source[1])-1]?.entityId:target;
  const freeing=held&&held.id!==foodId&&['drop','place'].includes(first?.action)&&(!first.target||first.target===held.id);
  if(held&&held.id!==foodId&&!freeing)return false;
  return prerequisites.every((step,i)=>{
    if(i===0&&freeing)return true;
    if(step.action==='print')return i===printIndex;
    return ['approach','pick_up'].includes(step.action)&&(step.target===target||step.action==='approach'&&step.target==='printer'&&printIndex>i);
  });
}

export function criticalNeedPlan(brain){
  if(brain.time<(brain.needInterruptCooldownUntil||0))return null;
  if(brain.needs.energy<=15)return imminentRelief(brain,'energy')?null:restGoal(true,nearbyObjects(brain));
  if(brain.needs.hunger>=90&&!imminentRelief(brain,'hunger')){const goal=foodGoal(brain,nearbyObjects(brain));
    // An explanation cannot resolve hunger: avoid repeatedly interrupting the same user goal with it.
    if(goal.id!=='explain')return goal;
  }
  return null;
}
export function changeNeeds(brain,dt){return tickNeeds(brain,dt);}

