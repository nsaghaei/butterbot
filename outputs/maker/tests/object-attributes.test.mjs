import test from 'node:test';
import assert from 'node:assert/strict';
import {attributesFor,normalizeAttributes,capabilityBlockers} from '../object-attributes.mjs';
import {validateAction,validatePlanTargets,validatePlanCoverage,feasibleActions,conciseWorld,LANDMARKS} from '../actions.mjs';
import {objectInfo,observeSurroundings} from '../perception.mjs';
import {PRINTER} from '../environment-layout.mjs';

function fixture(){
  const actor={id:'actor',name:'Wobble',kind:'character',height:2.3,radius:.32,controller:{},body:{translation:()=>({x:0,y:1.2,z:0})}};
  const entities=new Map([[actor.id,actor]]),garden={physics:{entities,position:e=>e.position||e.body.translation()},reservations:new Map(),selectedActor:'actor',printerOwner:null,queue:[]};
  const brain={actor,actorId:'actor',actorName:'Wobble',garden,core:{name:'Wobble'},memory:[],needs:{energy:80},logs:[],objective:'Explore',stage:'action_decide',time:0};
  const add=(id,{name=id,mass=1,dimensions=[.3,.3,.3],attributes={},position={x:1,y:.3,z:0},kind='prop',...extra}={})=>{const e={id,kind,design:{name,kind,mass,dimensions,attributes,affordances:['display']},position,body:{translation:()=>position,isDynamic:()=>!attributes.anchored},...extra};entities.set(id,e);return e;};
  return {garden,brain,add,entities};
}

test('nonthrowable objects normalize zero and legacy positive throw limits without enabling throwing',()=>{
  for(const kind of ['soft','vehicle','character','rope','cloth','fixture'])for(const speed of [undefined,0,6]){
    const raw=speed===undefined?{}:{maxThrowSpeed:speed},attrs=normalizeAttributes(raw,kind,kind==='vehicle'?90:1,[.4,.4,.4]);
    assert.equal(attrs.throwable,false,kind);assert.equal(attrs.maxThrowSpeed,0,kind);
  }
  const {garden,brain,add}=fixture(),keepsake=add('keepsake',{attributes:{throwable:false,maxThrowSpeed:6}});keepsake.carried=true;keepsake.carrier='actor';
  assert.equal(attributesFor(keepsake).maxThrowSpeed,0);assert.throws(()=>validateAction(garden,brain,{action:'throw',target:keepsake.id,x:4,z:0,speed:1}),/cannot be thrown/);assert.ok(!feasibleActions(garden,brain).some(a=>a.action==='throw'));
});

test('actually throwable objects retain the 1–10m/s limit and reject zero or malformed speeds',()=>{
  assert.equal(normalizeAttributes({},'prop',1,[.4,.4,.4]).maxThrowSpeed,6);
  for(const speed of [1,4,10])assert.equal(normalizeAttributes({throwable:true,maxThrowSpeed:speed},'prop',1,[.4,.4,.4]).maxThrowSpeed,speed);
  for(const speed of [0,.5,-1,11,NaN,Infinity,'4'])assert.throws(()=>normalizeAttributes({throwable:true,maxThrowSpeed:speed},'prop',1,[.4,.4,.4]),/throw speed/);
  for(const speed of [-1,11,NaN,Infinity,'0'])assert.throws(()=>normalizeAttributes({throwable:false,maxThrowSpeed:speed},'soft',1,[.4,.4,.4]),/throw speed/);
  const anchored=normalizeAttributes({anchored:true,portable:true,throwable:true,maxThrowSpeed:0},'prop',1,[.4,.4,.4]);assert.equal(anchored.throwable,false);assert.equal(anchored.maxThrowSpeed,0);
});

test('exact generated soft and anchored attributes with zero throw speed compile successfully',async()=>{
  const {compileDesign}=await import('../design.mjs');
  const common={edible:false,servings:0,throwable:false,maxThrowSpeed:0};
  for(const proposal of [
    {name:'Soft cushion',kind:'soft',mass:1,affordances:['squish'],attributes:{...common,portable:true,anchored:false,giftable:true,pushable:true}},
    {name:'Anchored tree',kind:'prop',mass:150,affordances:['display'],attributes:{...common,portable:false,anchored:true,giftable:false,pushable:false}}
  ]){
    const design=await compileDesign({...proposal,code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshToonMaterial({color:0x72aa55})));return g;'});
    assert.equal(design.attributes.maxThrowSpeed,0);assert.equal(design.attributes.throwable,false);assert.equal(design.attributes.anchored,proposal.attributes.anchored);
  }
});

test('explicit throw, push, give and drop requests cannot be omitted from an activity plan',()=>{
  for(const action of ['throw','push','give','drop']){
    assert.throws(()=>validatePlanCoverage(action+' the cube.',[{action:'inspect'}]),new RegExp(action));
    assert.equal(validatePlanCoverage(action+' the cube.',[{action}]),true);
    assert.equal(validatePlanCoverage('Do not '+action+' the cube. Observe instead.',[{action:'observe'}]),true);
    assert.throws(()=>validatePlanCoverage('Do not '+action+' the vase, then '+action+' the cube.',[{action:'observe'}]),new RegExp(action));
  }
  assert.equal(validatePlanCoverage('Throw the cube at (3, 4).',[{action:'throw',x:3,z:4}]),true);
  assert.equal(validatePlanCoverage('Push the cube to (-2, 3).',[{action:'push',x:-2,z:3}]),true);
});

test('heavy, oversized and anchored objects have truthful capability blockers',()=>{
  const {garden,brain,add}=fixture();
  const heavy=add('statue',{mass:150}),wide=add('wide',{dimensions:[2.5,.3,.3]}),tree=add('tree',{attributes:{anchored:true,portable:true,throwable:true,giftable:true,pushable:true}});
  assert.match(capabilityBlockers(heavy).pick_up,/150kg/);assert.match(capabilityBlockers(heavy).push,/130kg/);
  assert.match(capabilityBlockers(wide).pick_up,/2.5m/);assert.match(capabilityBlockers(tree).pick_up,/anchored/);
  for(const e of [heavy,wide,tree]){
    assert.throws(()=>validateAction(garden,brain,{action:'pick_up',target:e.id}),/limit|anchored/);
    assert.throws(()=>validatePlanTargets(garden,[{action:'pick_up',target:e.id}]),/limit|anchored/);
    assert.ok(!objectInfo(garden,e.id).availableUses.includes('pick_up'));
  }
  assert.equal(attributesFor(tree).portable,false);assert.equal(attributesFor(tree).throwable,false);
  assert.ok(!feasibleActions(garden,brain).some(a=>a.target==='tree'&&['pick_up','throw','give','push'].includes(a.action)));
});

test('a name or appearance cannot make an orange edible and finite food stops at zero servings',()=>{
  const {garden,brain,add}=fixture();const ornament=add('orange',{name:'Orange'}),food=add('food',{name:'Actual orange',attributes:{edible:true,servings:2}});
  assert.equal(attributesFor(ornament).edible,false);assert.throws(()=>validateAction(garden,brain,{action:'eat',target:'orange'}),/not edible/);
  assert.doesNotThrow(()=>validateAction(garden,brain,{action:'eat',target:'food'}));
  food.edible=true;food.servings=0;assert.equal(attributesFor(food).servings,0);assert.throws(()=>validateAction(garden,brain,{action:'eat',target:'food'}),/No edible resource/);
  assert.ok(!feasibleActions(garden,brain).some(a=>a.action==='eat'));
  assert.throws(()=>normalizeAttributes({edible:true,servings:1},'vehicle',90),/Only a food prop/);
});

test('actual characters without generated designs can be approached and inspected using their current positions',()=>{
  const {garden,brain,entities}=fixture(),friend={id:'friend',name:'Pat',kind:'character',height:2.3,radius:.32,controller:{},body:{translation:()=>({x:5,y:1.2,z:0})}};entities.set(friend.id,friend);
  const info=objectInfo(garden,'friend');assert.equal(info.name,'Pat');assert.equal(info.position.x,5);
  assert.doesNotThrow(()=>validatePlanTargets(garden,[{action:'approach',target:'friend'}]));
  assert.doesNotThrow(()=>validateAction(garden,brain,{action:'approach',target:'friend'}));
  assert.ok(feasibleActions(garden,brain).some(a=>a.action==='approach'&&a.target==='friend'));
  assert.throws(()=>validateAction(garden,brain,{action:'inspect',target:'friend'}),/Approach/);
  friend.body.translation=()=>({x:1,y:1.2,z:0});assert.doesNotThrow(()=>validateAction(garden,brain,{action:'inspect',target:'friend'}));
  assert.throws(()=>validateAction(garden,brain,{action:'pick_up',target:'friend'}),/only supports approach/);
});

test('holding, force, recipient and reservation preconditions are checked before committing actions',()=>{
  const {garden,brain,add,entities}=fixture();const cube=add('cube',{attributes:{maxThrowSpeed:4}}),other=add('other');
  assert.throws(()=>validateAction(garden,brain,{action:'throw',target:'cube',x:4,z:0}),/Nothing is held/);
  cube.carried=true;cube.carrier='actor';cube.owner='actor';
  assert.equal(validateAction(garden,brain,{action:'throw',target:'cube',x:4,z:0}).speed,4);
  assert.throws(()=>validateAction(garden,brain,{action:'throw',target:'cube',x:4,z:0,speed:5}),/at most 4/);
  assert.throws(()=>validateAction(garden,brain,{action:'drop',target:'other'}),/not held/);
  assert.throws(()=>validateAction(garden,brain,{action:'give',target:'cube',recipient:'missing'}),/existing character/);
  assert.throws(()=>validateAction(garden,brain,{action:'give',target:'cube',recipient:'actor'}),/yourself/);
  const recipient={id:'friend',name:'Pat',kind:'character',height:2.3,radius:.32,controller:{},body:{translation:()=>({x:3,y:1.2,z:0})}};entities.set(recipient.id,recipient);
  assert.throws(()=>validateAction(garden,brain,{action:'give',target:'cube',recipient:'friend'}),/own brain/);
  garden.brains=new Map([['actor',brain],['friend',{actor:recipient,actorId:'friend'}]]);garden.social={canGiveRequest:()=>![...entities.values()].some(e=>e.carrier==='friend')};
  assert.doesNotThrow(()=>validateAction(garden,brain,{action:'give',target:'cube',recipient:'friend'}),'A gift request may begin far away; the coordinated handoff enforces distance at contact');
  recipient.body.translation=()=>({x:1.5,y:1.2,z:0});assert.doesNotThrow(()=>validateAction(garden,brain,{action:'give',target:'cube',recipient:'friend'}));
  other.carried=true;other.carrier='friend';assert.throws(()=>validateAction(garden,brain,{action:'give',target:'cube',recipient:'friend'}),/hands/);
  other.design.attributes={edible:true,servings:1};assert.throws(()=>validateAction(garden,brain,{action:'eat',target:'other'}),/held by another/);
  other.carried=false;other.carrier=null;assert.throws(()=>validateAction(garden,brain,{action:'push',target:'other',x:5,z:0,strength:4}),/between 1 and 3/);
  garden.reservations.set('other','friend');assert.throws(()=>validateAction(garden,brain,{action:'push',target:'other',x:5,z:0}),/reserved/);
});

test('perception and action landmarks share the relocated printer and model facts avoid a duplicate blocker catalog',()=>{
  const {garden,brain,add}=fixture();const owned=add('owned',{mass:150});owned.owner='friend';
  const printer=objectInfo(garden,'printer');assert.deepEqual(printer.position,PRINTER.position);assert.deepEqual(printer.approach,PRINTER.approach);
  assert.deepEqual(LANDMARKS.printer,{x:PRINTER.approach.x,z:PRINTER.approach.z});assert.deepEqual(observeSurroundings(garden,brain).landmarks.printer,LANDMARKS.printer);
  const facts=conciseWorld(garden,brain);assert.equal(facts.objects.find(e=>e.id==='owned').owner,'friend');
  assert.match(facts.objects.find(e=>e.id==='owned').blockedActions.pick_up,/150kg/);assert.equal('actionBlockers' in facts,false);
});

test('custom food attributes, remaining servings and ownership survive a real world save and restore',async()=>{
  const [{Garden},{compileDesign}]=await Promise.all([import('../garden.mjs'),import('../design.mjs')]);
  const design=await compileDesign({name:'Food cube',kind:'prop',mass:1,affordances:['display'],attributes:{edible:true,servings:3,maxThrowSpeed:4},code:'const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshToonMaterial({color:0xcc9933})));return g;'});
  const g=new Garden({seedFood:false}),restored=new Garden({seedFood:false});
  try{
    const e=g.physics.add(design,{x:2,y:.3,z:2});g.designs[e.id]=e.design;e.servings=1;e.owner='previous-recipient';
    restored.restore(g.save());const saved=restored.physics.entities.get(e.id),info=objectInfo(restored,e.id);
    assert.equal(saved.servings,1);assert.equal(saved.edible,true);assert.equal(saved.owner,'previous-recipient');
    assert.equal(info.attributes.maxThrowSpeed,4);assert.equal(info.attributes.servings,1);assert.equal(info.owner,'previous-recipient');
  }finally{g.physics.dispose();restored.physics.dispose();}
});
