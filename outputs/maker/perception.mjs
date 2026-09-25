import {attributesFor,capabilityBlockers} from './object-attributes.mjs';
const fixtureAttributes={portable:false,anchored:true,edible:false,servings:0,throwable:false,maxThrowSpeed:6,giftable:false,pushable:false};
export const FIXTURES=[
  {id:'printer',name:'Idea printer',description:'A fixed fabrication station. Approach its front to design and print supported physical objects.',kind:'fixture',position:{x:-5,y:1,z:-3.5},approach:{x:-5,y:1,z:-.8},dimensions:[3.4,2,2.6],affordances:['print']},
  {id:'planter',name:'Flower bed',description:'A fixed raised planter of decorative flowers. It is an obstacle; these flowers are not edible resources.',kind:'fixture',position:{x:6,y:.5,z:-7},dimensions:[4,1,1.6],affordances:['inspect']}
];
export function objectInfo(garden,id){
  const e=garden.physics.entities.get(id);
  if(e?.design){
    const attributes=attributesFor(e),blockedActions=capabilityBlockers(e),availableUses=new Set(['inspect',...e.design.affordances]);
    if(!blockedActions.pick_up){availableUses.add('pick_up');availableUses.add('place');availableUses.add('drop');}
    for(const action of ['throw','give','push','eat'])if(!blockedActions[action])availableUses.add(action);
    return {id:e.id,name:e.design.name,description:e.design.description||`${e.design.name}. Supported interactions: ${e.design.affordances.join(', ')}.`,descriptionSource:e.design.descriptionSource||'engine',kind:e.kind,position:{...garden.physics.position(e)},affordances:[...e.design.affordances],availableUses:[...availableUses],blockedActions,material:e.design.material||'unspecified',mass:e.design.mass,dimensions:[...e.design.dimensions],attributes,heldBy:e.carrier||null,edible:attributes.edible,servings:attributes.servings};
  }
  const fixture=FIXTURES.find(f=>f.id===id);if(!fixture)return null;
  return {...fixture,position:{...fixture.position},dimensions:[...fixture.dimensions],mass:null,attributes:{...fixtureAttributes},availableUses:['inspect',...fixture.affordances.filter(a=>a!=='inspect')],blockedActions:{pick_up:fixture.name+' is an anchored fixture',throw:fixture.name+' is an anchored fixture',give:fixture.name+' is an anchored fixture',push:fixture.name+' is an anchored fixture',eat:fixture.name+' is not edible'},edible:false,servings:0};
}
export function worldObjects(garden){return [...FIXTURES.map(f=>objectInfo(garden,f.id)),...[...garden.physics.entities.values()].filter(e=>e.design).map(e=>objectInfo(garden,e.id))];}
export function observeSurroundings(garden,brain){const position={...brain.actor.body.translation()},radius=6,distance=p=>Math.hypot(p.x-position.x,p.z-position.z);return {observedAt:brain.time,position,radius,objects:worldObjects(garden).map(o=>({...o,distance:distance(o.position)})).filter(o=>o.distance<=radius).sort((a,b)=>a.distance-b.distance),characters:[...garden.physics.entities.values()].filter(e=>e.controller&&e.id!==brain.actorId).map(e=>({id:e.id,name:e.name||e.design?.name||e.id,position:{...garden.physics.position(e)},distance:distance(garden.physics.position(e))})).filter(e=>e.distance<=radius),held:[...garden.physics.entities.values()].filter(e=>e.carrier===brain.actorId).map(e=>e.id),bounds:{x:[-13,13],z:[-12,12]},landmarks:{sunny_pad:{x:1,z:1},flower_bed:{x:6,z:-5},quiet_patch:{x:-2,z:5},printer:{x:-5,z:-.8}},printerAvailability:{owner:garden.printerOwner,queue:[...garden.queue]},method:'Engine proximity within 6m; descriptions are object metadata; no camera or occlusion inference.'};}
