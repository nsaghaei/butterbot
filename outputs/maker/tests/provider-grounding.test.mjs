import test from 'node:test';
import assert from 'node:assert/strict';
import {Providers} from '../providers.mjs';

test('printer generation receives a schema restricted to the downstream object behavior',async()=>{
  const p=new Providers();let request;
  p.generate=async(system,prompt,schema)=>{request={prompt,schema};return {value:{plans:[]}};};
  await p.plan({objective:'Print an orange and eat it',printRequirements:[{action:'eat'}]});
  const variants=request.schema.properties.plans.items.anyOf;
  assert.equal(variants.length,1);
  assert.deepEqual(variants[0].properties.kind.enum,['prop']);
  assert.deepEqual(variants[0].properties.interaction.enum,['display']);
  assert.match(request.prompt,/pairs for this object: prop\/display/);
  await p.plan({objective:'Print a car and drive it',printRequirements:[{action:'use',use:'drive'}]});
  assert.deepEqual(request.schema.properties.plans.items.anyOf[0].properties.kind.enum,['vehicle']);
  await assert.rejects(p.plan({objective:'An impossible meal',printRequirements:[{action:'eat'},{action:'use',use:'drive'}]}),/Incompatible/);
});

test('remaining action planning keeps exact requested coordinates next to the corrective instruction',async()=>{
  const p=new Providers();let prompt;
  p.generate=async(system,text)=>{prompt=text;return {value:{steps:[]}};};
  await p.actionPlan({objective:'Walk to (-4, 5), then dance.'},{availableActions:[{action:'move',x:-2,z:5,label:'Quiet patch'}],correction:'Plan omitted requested coordinates (-4, 5)'});
  assert.match(prompt,/Exact requested coordinate pairs.*\[\{"x":-4,"z":5\}\]/);
  assert.match(prompt,/Latest correction: Plan omitted requested coordinates \(-4, 5\)/);
  assert.match(prompt,/Never snap an explicit coordinate to a named landmark/);
  assert.match(prompt,/Throw\/push coordinates specify an aim direction, not a guaranteed landing position/);
  assert.match(prompt,/retrieve a thrown or pushed item, use approach\(target id\).*actual current position/);
});

test('eating plans receive actual food and held inventory with explicit release and acquisition constraints',async()=>{
  const p=new Providers();let request;
  p.generate=async(system,prompt,schema)=>{request={prompt,schema};return {value:{steps:[]}};};
  const facts={actor:{id:'actor',inventory:['tulip']},objects:[
    {id:'tulip',name:'Orange Tulip',heldBy:'actor',material:'polymer',mass:1.2,dimensions:[.3,.5,.3],attributes:{portable:true,anchored:false,edible:false,servings:0}},
    {id:'food-bowl',name:'Small orange bowl',heldBy:null,material:'food',mass:.4,dimensions:[.3,.15,.3],attributes:{portable:true,anchored:false,edible:true,servings:2}}
  ],planning:{engineProposal:{text:'Eat one serving from Small orange bowl',steps:[{action:'drop',target:'tulip'},{action:'eat',target:'food-bowl'}]}}};
  const before=structuredClone(facts);
  await p.actionPlan({objective:'Eat one serving from Small orange bowl'},facts);
  const lines=request.prompt.split('\n'),handLabel='Current hand and eating constraints (authoritative): ';
  assert.equal(lines[0],'Original objective: Eat one serving from Small orange bowl');assert.ok(lines[1].startsWith(handLabel));assert.ok(lines[2].startsWith('Verified world: '));
  const hands=JSON.parse(lines[1].slice(handLabel.length));
  assert.deepEqual(hands.held,[{id:'tulip',name:'Orange Tulip',edible:false}]);assert.deepEqual(hands.mustExplicitlyReleaseBeforeAnyEating,['tulip']);
  assert.match(hands.eatPrecondition,/empty or holding only the exact food target/);assert.match(hands.ifHoldingDifferentObject,/separate drop\(target held ID\) or place\(x,z\) step before eat/);
  assert.match(hands.ifHoldingDifferentObject,/No implicit release, discard or replacement/);assert.deepEqual(hands.foodCarryLimits,{massKg:12,maxDimensionM:2});
  const supplied=JSON.parse(request.prompt.split('\n').find(line=>line.startsWith('Verified world: ')).slice('Verified world: '.length));
  assert.deepEqual(supplied,facts);assert.deepEqual(facts,before);
  assert.match(request.prompt,/preserve any explicit resource IDs and preparatory drop\/place steps needed to free the hands/);
  assert.match(request.prompt,/Eat acquires and holds the actual food target before timed consumption/);
  assert.match(request.prompt,/requires empty hands or that same food target already held/);
  assert.match(request.prompt,/first plan an explicit drop\(target held ID\) or place\(x,z\) as a separate recorded action/);
  assert.match(request.prompt,/Never silently discard, replace, or consume an unrelated held object/);
  assert.match(request.prompt,/edible=true, servings>0, portable=true, anchored=false, mass<=12kg and maximum dimension<=2m/);
  assert.match(request.prompt,/food target held by another character is unavailable/);
  assert.ok(request.schema.properties.steps.items.properties.action.enum.includes('drop'));
  assert.ok(request.schema.properties.steps.items.properties.action.enum.includes('eat'));
  facts.actor.inventory=['food-bowl'];facts.objects[0].heldBy=null;facts.objects[1].heldBy='actor';
  await p.actionPlan({objective:'Eat the food I am holding'},facts);
  const foodHands=JSON.parse(request.prompt.split('\n')[1].slice(handLabel.length));
  assert.deepEqual(foodHands.held,[{id:'food-bowl',name:'Small orange bowl',edible:true}]);assert.deepEqual(foodHands.mustExplicitlyReleaseBeforeAnyEating,[],'a held edible target must not be forced through drop/reacquisition');
  assert.match(request.prompt,/same food target already held/);
  assert.match(request.prompt,/separate pick_up step is optional for eating because eat itself acquires the food/);
  assert.match(request.prompt,/preserve it if explicitly requested/);
});

test('printed-food planning preserves full-plan references after a verified hand-clearing step',async()=>{
  const p=new Providers();let prompt;
  p.generate=async(_system,text)=>{prompt=text;return {value:{steps:[]}};};
  const prefix=[{action:'drop',target:'tulip',label:'Set down Orange Tulip'}];
  const facts={actor:{id:'actor',inventory:[]},planning:{verifiedPrefix:prefix,nextStepNumber:2,maxNewSteps:7,engineProposal:{text:'Print one edible orange and eat it',steps:[...prefix,{action:'print',label:'Print one small edible orange'},{action:'eat',target:'$step2',label:'Eat the printed orange'}]}}};
  await p.actionPlan({objective:'Print one small edible orange and then eat it'},facts);
  assert.match(prompt,/New steps start at full-plan step 2/);
  assert.match(prompt,/Keep that prefix unchanged; do not repeat completed actions/);
  assert.match(prompt,/preparatory drop is step 1 and print is step 2, eat must target "\$step2"/);
  assert.match(prompt,/count the full plan, including the verified prefix and preparation/);
  assert.match(prompt,/same hand and carry constraints apply to printed food and print-then-eat plans/);
  assert.match(prompt,/PRINT creates one physical object.*does not pick up, place, eat, or use it/);
  const supplied=JSON.parse(prompt.split('\n').find(line=>line.startsWith('Verified world: ')).slice('Verified world: '.length));
  assert.deepEqual(supplied.planning.verifiedPrefix,prefix);assert.equal(supplied.planning.engineProposal.steps[2].target,'$step2');
});

test('prominent hand facts keep unknown edibility unknown and do not invent an occupied hand',async()=>{
  const p=new Providers();let prompt;
  p.generate=async(_system,text)=>{prompt=text;return {value:{steps:[]}};};
  const label='Current hand and eating constraints (authoritative): ';
  await p.actionPlan({objective:'Eat one serving from the Bowl of oranges.'},{actor:{inventory:['uninspected-item']},objects:[{id:'uninspected-item',name:'Sealed parcel'}]});
  let hands=JSON.parse(prompt.split('\n')[1].slice(label.length));assert.deepEqual(hands.held,[{id:'uninspected-item',name:'Sealed parcel',edible:null}]);assert.deepEqual(hands.mustExplicitlyReleaseBeforeAnyEating,[]);assert.match(hands.ifHoldingDifferentObject,/separate drop/);
  await p.actionPlan({objective:'Eat one serving from the Bowl of oranges.'},{actor:{inventory:[]},objects:[{id:'tulip',name:'Orange Tulip',heldBy:'pip',attributes:{edible:false}}]});
  hands=JSON.parse(prompt.split('\n')[1].slice(label.length));assert.deepEqual(hands.held,[]);assert.deepEqual(hands.mustExplicitlyReleaseBeforeAnyEating,[]);
});
