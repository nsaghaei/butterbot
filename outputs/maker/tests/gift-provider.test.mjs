import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Providers} from '../providers.mjs';
import {closeTokenizer} from '../token-budget.mjs';
import {objectInfo} from '../perception.mjs';

after(closeTokenizer);
const scene=JSON.parse(await readFile(new URL('./fixtures/reclining-tulip-save.json',import.meta.url),'utf8'));
const giver=()=>({id:'actor',name:'Butterbot',style:'inventive, curious',position:{x:2,y:1.185,z:2},giftAvailable:true,giftReady:true,memory:[{id:'giver-secret',text:'PRIVATE_GIVER_MEMORY'}],objective:'PRIVATE_GIVER_OBJECTIVE'});
function fixture(){
  const entities=new Map(scene.world.entities.filter(e=>e.id!=='actor').map(e=>[e.id,{...structuredClone(e),design:structuredClone(scene.designs[e.id]),body:{}}]));
  const actor={height:2.3,body:{translation:()=>({x:1,y:1.185,z:2})},controller:{computedGrounded:()=>true}},physics={entities,position:e=>e.position};
  const b={actorId:'pip',actorName:'Pip',style:'playful, gentle, observant',core:{name:'Pip',style:'playful, gentle, observant',interests:['play','company']},actor,physics,objective:'Approach the berry bowl, then pick it up.',goalSource:'self',stage:'action_plan',planSteps:[{action:'approach',target:'snack-bowl',label:'Approach berry bowl'},{action:'pick_up',target:'snack-bowl',label:'Pick up berry bowl'}],planIndex:0,needs:{energy:62,fun:51,hunger:22,hygiene:80,comfort:72,social:25},memory:[{id:'pip-own',kind:'preference',text:'I do not want to drop my own berry bowl to take another object.',accessTick:1}],memoryClock:1,tokens:3,logs:[],answers:[],stepResults:{},cycle:2};
  const peer=giver(),peerBrain={actorId:peer.id,actorName:peer.name,style:peer.style,actor:{body:{translation:()=>peer.position}},memory:peer.memory,objective:peer.objective};
  b.garden={physics,printerOwner:null,queue:[],selected:b,brains:new Map([[b.actorId,b],[peer.id,peerBrain]]),social:{available:()=>true,canRequest:()=>true,canReceiveGift:()=>true,canRequestGift:()=>true,giftAvailable:()=>true,giftReady:()=>true}};
  const entity=entities.get('item-1');entity.carried=true;entity.carrier='actor';
  const object=objectInfo(b.garden,'item-1');object.memory='PRIVATE_OBJECT_EXTENSION';object.attributes.privateNote='PRIVATE_ATTRIBUTE_EXTENSION';
  return {b,entity,session:{id:'gift-1',topic:'Give Orange Tulip to Pip.',object}};
}

test('gift consent fits the actual checkpoint with exact capabilities, own plans and private-memory separation',async()=>{
  const {b,entity,session}=fixture(),p=new Providers(),original=globalThis.fetch;let request;
  const probabilities={accept:.28,decline:.72};
  globalThis.fetch=async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({results:{[request.requests[0].id]:{do:{choice:'decline',probabilities}}},usage:{tokens:400}})};};
  try{
    const result=await p.giftAcceptance(b,giver(),session),gift=result.decisionSnapshot.giftInvitation.object;
    assert.equal(result.choice,'decline');assert.deepEqual(result.response.probabilities,probabilities);assert.deepEqual(result.request,request);assert.deepEqual(Object.keys(result.choices),['accept','decline']);assert.deepEqual(request.requests[0].questions.do.criteria,result.choices);
    assert.equal(result.tokenBudget.stateLimit,511-result.tokenBudget.headerTokens);assert.ok(result.tokenBudget.stateTokens<=result.tokenBudget.stateLimit);assert.ok(result.tokenBudget.stateTokens+result.tokenBudget.headerTokens<512);assert.equal(result.tokenBudget.compaction.textTruncated,false);assert.equal(result.tokenBudget.compaction.allGiftAttributesPreserved,true);
    assert.ok(result.state.includes(b.objective));assert.match(result.state,/Current step 1\/2: approach snack-bowl/);assert.match(result.state,/Plan:.*approach.*pick_up/);assert.match(result.state,/Occupies hands; consider plan/);
    assert.ok(result.state.includes(gift.id+' '+gift.name));assert.ok(result.state.includes(gift.mass+'kg'));assert.ok(result.state.includes('size='+gift.dimensions.join('x')+'m'));assert.match(result.state,/heldBy=actor/);
    assert.ok(result.state.includes(giver().style));assert.ok(result.state.includes('(2,1.2,2)'));assert.equal(result.tokenBudget.compaction.giverPublicProfilePreserved,true);
    for(const [key,value]of Object.entries(gift.attributes))assert.ok(result.state.includes(key+'='+value),key+' must reach the acceptance model');
    for(const object of result.decisionSnapshot.objects){const xyz=[object.position.x,object.position.y,object.position.z].map(n=>String(Number(n.toFixed(1)))).join(',');assert.ok(result.state.includes(object.id+' '+object.name+' ('+xyz+')'),object.id+' lost its name/position');}
    assert.equal(result.decisionSnapshot.memory[0].text,b.memory[0].text);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_GIVER|giver-secret|PRIVATE_OBJECT_EXTENSION|PRIVATE_ATTRIBUTE_EXTENSION/);assert.equal(result.decisionSnapshot.giftInvitation.partner.giftReady,true);
    assert.equal(entity.carrier,'actor','A provider decision cannot transfer ownership');assert.equal(b.memory.length,1);assert.deepEqual(p.activeRequests,{});
    console.log('Furnished gift consent:',result.tokenBudget.stateTokens,'of',result.tokenBudget.stateLimit,'state tokens');
  }finally{globalThis.fetch=original;}
});

test('gift consent keeps a current held item and exact upcoming pickup visible to the recipient',async()=>{
  const {b,session}=fixture(),p=new Providers();b.physics.entities.get('snack-bowl').carrier='pip';let offered;
  p.decide=async(state,question,choices,id,context)=>{offered={state,context};return {state,response:{choice:'decline'},request:{id,question,choices}};};
  const result=await p.giftAcceptance(b,giver(),session);
  assert.equal(result.choice,'decline');assert.match(offered.state,/Held: snack-bowl/);assert.equal(offered.context.snapshot.goal.canonicalStep.target,'snack-bowl');assert.deepEqual(offered.context.snapshot.inventory.held.map(e=>e.id),['snack-bowl']);assert.equal(session.object.heldBy,'actor');
  for(const variant of offered.context.variants){assert.ok(variant.text.includes('Butterbot(actor)'));assert.ok(variant.text.includes('(2,1.2,2)'));assert.ok(variant.text.includes(giver().style));assert.equal(variant.compaction.giverPublicProfilePreserved,true);}
});

test('malformed or no-longer-held offers never reach Laya and invalid choices retain their diagnostics',async()=>{
  const {b,session}=fixture(),p=new Providers();let calls=0;p.decide=async()=>{calls++;return {response:{choice:'accept'}};};
  for(const override of [{mass:NaN},{dimensions:[1,2]},{attributes:{giftable:true}},{heldBy:'other'},{id:''}])await assert.rejects(p.giftAcceptance(b,giver(),{...session,object:{...session.object,...override}}),/Gift offer/);
  await assert.rejects(p.giftAcceptance(b,{...giver(),id:'pip'},session),/another character/);assert.equal(calls,0);
  await assert.rejects(p.giftAcceptance(b,giver(),{...session,object:{...session.object,name:'An invented replacement'}}),/current world object catalog/);assert.equal(calls,0);
  p.decide=async(state,question,choices,id)=>({state,request:{id,question,choices},response:{choice:'take_without_consent',probabilities:{take_without_consent:1}}});
  await assert.rejects(p.giftAcceptance(b,giver(),session),error=>{assert.match(error.message,/offered accept or decline/);assert.equal(error.diagnostics.response.choice,'take_without_consent');assert.equal(error.diagnostics.decisionSnapshot.giftInvitation.object.id,'item-1');assert.deepEqual(Object.keys(error.diagnostics.request.choices),['accept','decline']);return true;});
  p.decide=async()=>({response:{choice:'accept',probabilities:{accept:.9,decline:.1}}});
  const accepted=await p.giftAcceptance(b,giver(),session);assert.equal(accepted.choice,'accept');assert.equal(b.physics.entities.get('item-1').carrier,'actor','Acceptance alone cannot transfer the gift');
});

test('gift planning uses request/readiness facts and preserves explicit movement before consented delivery',async()=>{
  const p=new Providers();let sent;p.generate=async(system,prompt,schema)=>{sent={system,prompt,schema};return {value:{steps:[]}};};
  const facts={characters:[{id:'pip',name:'Pip',giftAvailable:true,giftReady:false}]};
  await p.actionPlan({objective:'Pick up Orange Tulip and give it to Pip.'},facts);
  assert.match(sent.prompt,/giftAvailable \(may request\) and giftReady \(ready for consent now\)/);assert.match(sent.prompt,/finish its current SELF activity and verification.*waits up to 45 seconds/);assert.match(sent.prompt,/Never interrupt a user goal, urgent need, or another paired interaction/);
  assert.match(sent.prompt,/giftAvailable may be true while that current SELF activity temporarily occupies the hands/);assert.match(sent.prompt,/eating a held serving; this allows queuing only/);
  assert.match(sent.prompt,/Never interrupt an existing pickup or force a drop/);assert.match(sent.prompt,/Once the recipient becomes ready, consent and physical transfer require empty hands/);assert.match(sent.prompt,/If a pickup finishes with an item still held, the gift cannot proceed/);
  assert.match(sent.prompt,/Give includes the request, bounded wait, ready recipient accept\/decline decision, approach within 2m, and actual physical handoff/);assert.match(sent.prompt,/recipient needs empty hands and may reject/);assert.match(sent.prompt,/Waiting or acceptance transfers nothing/);assert.match(sent.prompt,/plan pick_up then give, without a separate approach solely for the handoff/);
  const objective='Pick up Orange Tulip, carry it to (2,3), approach Pip, then give it to Pip.';await p.actionPlan({objective},facts);
  assert.ok(sent.prompt.includes('AUTHORITATIVE REQUEST: '+objective));assert.match(sent.prompt,/Exact requested coordinate pairs.*\[{"x":2,"z":3}\]/);assert.match(sent.prompt,/Preserve any explicitly requested separate approach, carrying waypoint, and every other ordered user step/);assert.match(sent.prompt,/"giftAvailable":true,"giftReady":false/);
});

test('gift audits require consent, one physical contact transfer and the completed gesture, while retaining legacy evidence rules',async()=>{
  const p=new Providers();let prompt;p.generate=async(_system,text)=>{prompt=text;return {value:{complete:false,explanation:'The gesture remains unfinished.'}};};
  const giftEvidence={status:'transferred',kind:'gift',accepted:true,objectId:'item-1',giverId:'actor',recipientId:'pip',transferred:true,transferCount:1,transferredAt:5,before:{carrier:'actor'},after:{carrier:'pip',owner:'pip',carried:true},giverPosition:{x:0,y:1.2,z:0},recipientPosition:{x:1.5,y:1.2,z:0},distanceAtTransfer:1.5,gesture:{duration:1.4,elapsed:.8,completed:false}};
  const world={objective:'Give Orange Tulip to Pip.',planSteps:[{action:'give',target:'item-1',recipient:'pip'}],planIndex:0},evidence={completion:{job:{giftEvidence}}};await p.verifyStep(world,evidence);
  assert.ok(prompt.includes(JSON.stringify(evidence)));assert.match(prompt,/require status="completed", kind="gift", accepted=true/);assert.match(prompt,/matching objectId\/giverId\/recipientId, transferred=true and transferCount=1/);assert.match(prompt,/after\.carrier=recipientId, after\.owner=recipientId/);assert.match(prompt,/distanceAtTransfer<=2m/);assert.match(prompt,/gesture\.completed=true/);assert.match(prompt,/invitation or acceptance alone is not a handoff/);assert.match(prompt,/status="transferred" means contact occurred but the full gesture is unfinished/);assert.match(prompt,/status="canceled" is not successful completion/);
  const legacy={completion:{job:{action:'give',target:'item-1',recipient:'pip'},objectAtCompletion:{id:'item-1',carrier:'pip',carried:true}}};await p.verifyStep(world,legacy);assert.ok(prompt.includes(JSON.stringify(legacy)));assert.match(prompt,/legacy physical give without giftEvidence.*objectAtCompletion.*exact object carried by the requested recipient/);
});
