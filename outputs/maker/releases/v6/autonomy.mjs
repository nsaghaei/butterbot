import {LANDMARKS,validateAction} from './actions.mjs';
export function goalCandidates(brain){
  const g=brain.garden,food=[...g.physics.entities.values()].find(e=>e.edible&&e.servings>0&&!g.reservations.has(e.id)),goals=[];
  if(brain.needs.energy<80)goals.push({id:'rest',text:'Rest for a moment and recover some energy.',steps:[{action:'rest',seconds:6,label:'Rest and recover energy'}]});
  if(brain.needs.hunger>=35&&food)goals.push({id:'eat',text:'Eat one serving of the garden berries.',steps:[{action:'approach',target:food.id,label:'Approach the berry bowl'},{action:'eat',target:food.id,label:'Eat one existing serving'}]});
  if(brain.needs.fun<85&&brain.needs.energy>25)goals.push({id:'dance',text:'Enjoy a little dance here.',steps:[{action:'dance',seconds:5,label:'Dance for a little fun'}]});
  const landmarks=Object.entries(LANDMARKS).filter(([name])=>name!=='printer'),index=(brain.exploreIndex||0)%landmarks.length,[name,p]=landmarks[index];
  if(brain.needs.energy>20)goals.push({id:'explore',text:'Take a walk to the '+name.replaceAll('_',' ')+'.',steps:[{action:'move',...p,label:'Walk to the '+name.replaceAll('_',' ')}]});
  const object=[...g.physics.entities.values()].find(e=>e.design&&!e.carried&&!e.edible&&!g.reservations.has(e.id));if(object)goals.push({id:'inspect',text:'Have a closer look at '+object.design.name+'.',steps:[{action:'approach',target:object.id,label:'Approach '+object.design.name},{action:'inspect',target:object.id,label:'Inspect '+object.design.name}]});
  if(brain.needs.hunger>=85&&!food)goals.unshift({id:'explain',text:'Explain that no edible food remains, then conserve energy.',steps:[{action:'ask_for_help',label:'Explain the missing food'},{action:'rest',seconds:5,label:'Rest while food is unavailable'}]});
  if(goals.length<2)goals.push({id:'rest',text:'Pause and rest for a moment.',steps:[{action:'rest',seconds:4,label:'Rest briefly'}]});
  return goals.slice(0,4);
}
export function criticalNeedPlan(brain){
  if(brain.needs.energy<=15)return {text:'Rest to recover critically low energy, then resume my goal.',steps:[{action:'rest',seconds:7,label:'Rest before resuming my goal'}]};
  if(brain.needs.hunger>=90){const food=[...brain.physics.entities.values()].find(e=>e.edible&&e.servings>0&&!brain.garden.reservations.has(e.id));if(food)return {text:'Eat one available serving, then resume my goal.',steps:[{action:'approach',target:food.id,label:'Approach available food'},{action:'eat',target:food.id,label:'Eat one real serving'}]};}
  return null;
}
export function changeNeeds(brain,dt){brain.needs.energy=Math.max(0,brain.needs.energy-dt*.018);brain.needs.fun=Math.max(0,brain.needs.fun-dt*.012);brain.needs.hunger=Math.min(100,brain.needs.hunger+dt*.025);}

