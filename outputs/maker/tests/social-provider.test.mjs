import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Providers,actionPlanSchema} from '../providers.mjs';
import {buildDecisionContext} from '../decision-context.mjs';
import {closeTokenizer} from '../token-budget.mjs';

after(closeTokenizer);
const scene=JSON.parse(await readFile(new URL('./fixtures/reclining-tulip-save.json',import.meta.url),'utf8'));
function brain(){
  const entities=new Map(scene.world.entities.filter(e=>e.id!=='actor').map(saved=>[saved.id,{...structuredClone(saved),design:structuredClone(scene.designs[saved.id]),body:{}}]));
  const actor={height:2.3,body:{translation:()=>({x:1,y:1.185,z:2})},controller:{computedGrounded:()=>true}};
  const physics={entities,position:e=>e.position};
  const b={actorId:'pip',actorName:'Pip',style:'playful, gentle, observant',core:{name:'Pip',style:'playful, gentle, observant',interests:['play','company'],traits:{sociable:.9}},actor,physics,objective:'Observe the garden, then rest at Garden daybed.',goalSource:'self',stage:'action_decide',planSteps:[{action:'observe',seconds:2,label:'Observe the garden'},{action:'approach',target:'home-bed',label:'Approach Garden daybed'},{action:'use',target:'home-bed',use:'rest',seconds:6,label:'Rest at Garden daybed'}],planIndex:0,needs:{energy:62,fun:51,hunger:22,hygiene:80,comfort:72,social:25},memory:Array.from({length:12},(_,i)=>({id:'pip-memory-'+(i+1),kind:i%2?'preference':'experience',text:i===11?'I do not like loud games near the garden flowers.':'I noticed garden detail '+(i+1)+' while observing this quiet place.',accessTick:i})),memoryClock:12,tokens:3,logs:[],answers:[],stepResults:{},cycle:2};
  const peer=partner(),peerBrain={actorId:peer.id,actorName:peer.name,style:peer.style,actor:{body:{translation:()=>peer.position}},memory:peer.memory,objective:peer.objective};
  b.garden={physics,printerOwner:null,queue:[],selected:b,brains:new Map([[b.actorId,b],[peer.id,peerBrain]]),social:{available:()=>true,canRequest:()=>true,canReceiveGift:()=>true}};return b;
}
const partner=()=>({id:'actor',name:'Butterbot',style:'inventive, curious',position:{x:2,y:1.185,z:2},conversational:true,socialAvailable:true,socialReady:true,held:[],memory:[{id:'actor-memory-1',text:'BUTTERBOT_PRIVATE_ORANGE_CODE'}],objective:'BUTTERBOT_PRIVATE_OBJECTIVE'});
function session(b,extra={}){
  const peer=partner();return {sessionId:'chat-1',partner:peer,topic:'gentle games among the garden flowers',topicInitiator:{id:peer.id,name:peer.name},transcript:[{speakerId:'actor',speakerName:'Butterbot',text:'Would you enjoy a quiet game by the flowers?',deliveredAt:12,duration:3}],world:{actor:{id:b.actorId,position:b.actor.body.translation(),needs:b.needs,inventory:[]},objects:buildDecisionContext(b).snapshot.objects,characters:[peer],printer:{owner:null,queue:[]},recentOutcomes:['Observed the nearby garden objects.']},...extra};
}

test('social turn uses the speaker full private store and only public partner facts plus delivered dialogue',async()=>{
  const b=brain(),p=new Providers(),input=session(b),before=structuredClone(b.memory);let sent;
  const value={speech:'A quiet game sounds lovely. Let’s leave the flowers undisturbed.',memory:[{operation:'revise',id:'pip-memory-12',text:'I prefer quiet games that leave garden flowers undisturbed.',kind:'preference'}]};
  p.generate=async(system,prompt,schema,maxTokens)=>{sent={system,prompt,schema,maxTokens};return {value,raw:JSON.stringify(value),usage:{promptTokens:512,outputTokens:49},elapsedMs:12};};
  const result=await p.socialTurn(b,input);
  assert.deepEqual(result.value,value);assert.deepEqual(result.usage,{promptTokens:512,outputTokens:49});assert.equal(result.raw,JSON.stringify(value));assert.equal(result.prompt,sent.prompt);assert.deepEqual(result.input.memory,before.map(({id,kind,text})=>({id,kind,text})));assert.deepEqual(b.memory,before,'Provider proposals must not apply edits before physical speech delivery');
  for(const m of before)assert.ok(result.prompt.includes(m.id)&&result.prompt.includes(m.text),'Full own store includes '+m.id);
  assert.match(result.prompt,/Would you enjoy a quiet game/);assert.match(result.prompt,/Butterbot/);assert.doesNotMatch(result.prompt,/BUTTERBOT_PRIVATE|actor-memory-1/);
  assert.equal(result.input.partner.socialReady,true);assert.equal(result.input.world.characters[0].socialReady,true);
  assert.equal(sent.schema.properties.speech.maxLength,180);assert.equal(sent.schema.properties.memory.maxItems,2);
  const revisions=sent.schema.properties.memory.items.anyOf.find(s=>s.properties.operation.enum.includes('revise'));
  assert.deepEqual(revisions.properties.id.enum,before.map(m=>m.id));assert.equal(sent.maxTokens,500);
  assert.match(result.prompt,/pending exchange as already completed/);assert.match(result.prompt,/attributed speech/);assert.match(result.prompt,/qualifications and negation/);
});

test('social output rejects private-ID edits, overlong speech and malformed edits while preserving diagnostics',async()=>{
  const b=brain(),p=new Providers(),input=session(b),before=structuredClone(b.memory);
  for(const value of [
    {speech:'Hello.',memory:[{operation:'revise',id:'actor-memory-1',text:'A fabricated private update.',kind:'belief'}]},
    {speech:'x'.repeat(181),memory:[]},
    {speech:'Hello.',memory:Array.from({length:3},()=>({operation:'remember',id:'',text:'A new preference.',kind:'preference'}))},
    {speech:'Hello.',memory:[{operation:'remember',id:'pip-memory-1',text:'A new preference.',kind:'preference'}]},
    {speech:'Hello.',memory:[{operation:'forget',id:'pip-memory-1',text:'',kind:'belief'}]}
  ]){
    p.generate=async()=>({value,raw:JSON.stringify(value),usage:{outputTokens:12}});
    await assert.rejects(p.socialTurn(b,input),error=>{assert.deepEqual(error.diagnostics.value,value);assert.equal(error.diagnostics.raw,JSON.stringify(value));assert.match(error.diagnostics.prompt,/full editable memory store/);return true;});
  }
  assert.deepEqual(b.memory,before);
});

test('social context rejects undelivered or nonparticipant dialogue and another character’s private world',async()=>{
  const b=brain(),p=new Providers();let calls=0;p.generate=async()=>{calls++;return {value:{speech:'Hello.',memory:[]}};};
  for(const transcript of [[{speakerId:'actor',text:'Pending words'}],[{speakerId:'actor',text:'Pending words',deliveredAt:2,status:'pending'}],[{speakerId:'other',text:'An invented bystander',deliveredAt:2}],[{speakerId:'actor',text:'Words',deliveredAt:2,delivered:false}]])await assert.rejects(p.socialTurn(b,session(b,{transcript})),/actual delivered participant speech/);
  const wrong=session(b);wrong.world.actor.id='actor';await assert.rejects(p.socialTurn(b,wrong),/world must belong to the speaking character/);assert.equal(calls,0);
});

test('the orange recipient sees its own perspective and the unchanged topic addressed to the giver',async()=>{
  const b=brain(),p=new Providers(),topic='Reflect on the orange you just gave to Pip.';
  const legacyMemory={id:'pip-memory-6',kind:'experience',text:'The act of sharing the orange with Pip created a moment of genuine connection and warmth in the garden.'};
  b.memory[5]={...b.memory[5],...legacyMemory};
  const input=session(b,{topic,topicInitiator:{...partner(),privatePlan:'INITIATOR_PRIVATE_PLAN'},transcript:[{speakerId:'actor',text:'Sharing that small orange felt like a lovely way to bring warmth to our afternoon.',deliveredAt:5366.8,duration:5.84}]});
  input.world.actor.inventory=['item-6'];input.world.objects.push({id:'item-6',name:'Small Edible Orange',position:{x:1,y:1.4,z:2},owner:'pip',heldBy:'pip',mass:.15,edible:true,servings:1});
  const before=structuredClone(b.memory);
  const value={speech:'Thank you for the orange. I am enjoying this quiet moment.',memory:[]};
  p.generate=async()=>({value,raw:JSON.stringify(value)});
  const result=await p.socialTurn(b,input);
  assert.equal(result.input.topic,topic);assert.deepEqual(result.input.topicInitiator,{id:'actor',name:'Butterbot'});
  assert.match(result.prompt,/^Current speaker: Pip \(pip\)/);assert.match(result.prompt,/Conversation partner: Butterbot \(actor\)/);assert.match(result.prompt,/Original topic addressee: Butterbot \(actor\)/);
  assert.ok(result.prompt.indexOf('Original topic addressee:')<result.prompt.indexOf('full editable memory store:'));
  assert.match(result.prompt,/second-person wording in the TOPIC addresses that actor/);assert.match(result.prompt,/attribution identifies perspective, not proof/);
  assert.match(result.prompt,/Form new memories from the current speaker's own perspective/);assert.match(result.prompt,/identities of giver, recipient and speaker distinct/);
  assert.equal(result.input.world.objects.find(o=>o.id==='item-6').heldBy,'pip');assert.deepEqual(result.input.world.actor.inventory,['item-6']);
  assert.ok(result.input.memory.some(m=>m.id===legacyMemory.id&&m.text===legacyMemory.text));assert.deepEqual(b.memory,before,'Existing memories remain available for model curation, without automatic correction');
  assert.deepEqual(result.value,value,'Perspective guidance does not replace model-generated dialogue');assert.doesNotMatch(JSON.stringify(result),/BUTTERBOT_PRIVATE|INITIATOR_PRIVATE_PLAN|actor-memory-1/);
});

test('conversation generation requires public participant topic provenance and never guesses the addressee',async()=>{
  const b=brain(),p=new Providers();let calls=0;p.generate=async()=>{calls++;return {value:{speech:'Hello.',memory:[]}};};
  for(const topicInitiator of [undefined,null,{id:'someone-else',name:'Stranger'},{id:'actor',name:''}])await assert.rejects(p.socialTurn(b,session(b,{topicInitiator})),/topic initiator/);
  assert.equal(calls,0);
  const input=session(b,{topic:'Describe what you noticed here.',topicInitiator:{id:'pip',name:'Pip'}});
  const result=await p.socialTurn(b,input);assert.equal(calls,1);assert.match(result.prompt,/Original topic addressee: Pip \(pip\)/);assert.equal(result.input.topic,input.topic);
});

test('ambiguous delivered speech stays distinct from a similarly named historical object and reversed gift event',async()=>{
  const b=brain(),p=new Providers();
  b.memory=[{id:'pip-memory-2',kind:'experience',text:'I gave the Blue Glass Vase to Butterbot yesterday.'}];
  const input=session(b,{topic:'Discuss the blue glass you gave to Pip.',transcript:[{speakerId:'actor',text:'Sharing that blue glass was a lovely moment.',deliveredAt:18,duration:2}]});
  input.world.objects=[{id:'old-vase',name:'Blue Glass Vase',owner:'actor',heldBy:null},{id:'new-bottle',name:'Blue Glass Bottle',owner:'pip',heldBy:'pip'}];input.world.actor.inventory=['new-bottle'];
  const before=structuredClone(b.memory),value={speech:'Thank you. It is a beautiful color.',memory:[{operation:'remember',id:'',text:'Butterbot described sharing blue glass as lovely; the specific object was not named.',kind:'belief'}]};
  p.generate=async()=>({value,raw:JSON.stringify(value)});const result=await p.socialTurn(b,input);
  assert.deepEqual(result.input.memory,before.map(({id,kind,text})=>({id,kind,text})));assert.deepEqual(result.input.world.objects,input.world.objects);assert.deepEqual(result.input.transcript,input.transcript);
  assert.match(result.prompt,/Different object IDs identify different objects/);assert.match(result.prompt,/Delivered speech may concern a different event or object/);
  assert.match(result.prompt,/require evidence linking the same object, participants, giver\/recipient direction and event/);assert.match(result.prompt,/current ownership or a vague reference alone is not that link/);
  assert.match(result.prompt,/leave the historical event unchanged/);assert.match(result.prompt,/explicitly attributed statement with its uncertainty/);assert.match(result.prompt,/Never merge separate events merely to avoid adding a memory/);
  assert.ok(result.prompt.indexOf('Keep event and object identities separate.')<result.prompt.indexOf('full editable memory store:'));
  assert.deepEqual(result.value,value);assert.deepEqual(b.memory,before);
});

test('failed social generation retains raw output, capacity and finish diagnostics alongside its exact private input',async()=>{
  const b=brain(),p=new Providers(),input=session(b),before=structuredClone(b.memory),raw='{"speech":"A partial reply',previous=globalThis.fetch;let request;p.provider='ollama';
  globalThis.fetch=async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({model:'test-social-gemma',message:{content:raw},done:true,done_reason:'length',prompt_eval_count:7992,eval_count:200,prompt_eval_duration:100000000,eval_duration:300000000})};};
  try{
    await assert.rejects(p.socialTurn(b,input),error=>{const d=error.diagnostics;assert.equal(d.raw,raw);assert.equal(d.rawLength,raw.length);assert.equal(d.rawTruncated,false);assert.equal(d.finishReason,'length');assert.equal(d.maxOutputTokens,500);assert.equal(d.contextTokens,8192);assert.equal(d.usage.promptTokens,7992);assert.equal(d.usage.outputTokens,200);assert.equal(d.timing.computeMs,400);assert.equal(d.parseError.name,'SyntaxError');assert.equal(d.generationError.message,error.message);assert.equal(d.responseMetadata.done_reason,'length');assert.equal(d.prompt,request.messages[1].content);assert.deepEqual(d.schema,request.format);assert.deepEqual(d.input.memory,before.map(({id,kind,text})=>({id,kind,text})));assert.deepEqual(d.input.topicInitiator,input.topicInitiator);assert.doesNotMatch(JSON.stringify(d),/BUTTERBOT_PRIVATE|actor-memory-1/);return true;});
    assert.deepEqual(b.memory,before);assert.deepEqual(p.activeRequests,{});assert.equal(p.generatorAbort,null);
  }finally{globalThis.fetch=previous;}
});

test('a furnished recipient invitation fits the actual Laya tokenizer and logs every choice and probability',async()=>{
  const b=brain(),p=new Providers(),oldFetch=globalThis.fetch;let sent;
  const probabilities={accept:.73,decline:.27};
  globalThis.fetch=async(url,options)=>{assert.match(url,/\/api\/decide$/);sent=JSON.parse(options.body);return {ok:true,json:async()=>({results:{[sent.requests[0].id]:{do:{choice:'accept',probabilities}}},usage:{tokens:400}})};};
  try{
    const result=await p.socialAcceptance(b,partner(),{id:'chat-1',topic:'gentle games among the garden flowers',memory:'UNRELATED_SESSION_SECRET'});
    assert.equal(result.choice,'accept');assert.deepEqual(result.response.probabilities,probabilities);assert.deepEqual(result.request,sent);assert.equal(result.state,sent.requests[0].state);assert.deepEqual(sent.requests[0].questions.do.criteria,result.choices);assert.deepEqual(Object.keys(result.choices),['accept','decline']);
    assert.equal(result.tokenBudget.stateLimit,511-result.tokenBudget.headerTokens);assert.ok(result.tokenBudget.stateTokens<=result.tokenBudget.stateLimit);assert.ok(result.tokenBudget.stateTokens+result.tokenBudget.headerTokens<512);assert.equal(result.tokenBudget.compaction.textTruncated,false);
    assert.ok(result.state.includes(b.objective));assert.match(result.state,/Current step 1\/3: observe/);const planText=result.state.split(' Plan: ')[1].split('.')[0];let cursor=0;for(const step of b.planSteps){const indices=[step.action,step.label].filter(Boolean).map(text=>({text,index:planText.indexOf(text,cursor)})).filter(item=>item.index>=cursor);assert.ok(indices.length,'Ordered plan lost '+step.action);const first=indices.sort((a,b)=>a.index-b.index)[0];cursor=first.index+first.text.length;}assert.match(result.state,/Butterbot\(actor\).*\(2\.0,2\.0\).*gentle games/);
    for(const object of result.decisionSnapshot.objects){const xyz=[object.position.x,object.position.y,object.position.z].map(n=>String(Number(n.toFixed(1)))).join(',');assert.ok(result.state.includes(object.id+' '+object.name+' ('+xyz+')'),object.id+' must preserve its name and position');}
    for(const need of Object.keys(b.needs))assert.ok(result.state.includes(need));assert.doesNotMatch(JSON.stringify(result),/BUTTERBOT_PRIVATE|UNRELATED_SESSION_SECRET/);
    assert.equal(result.decisionSnapshot.memory.length,12);assert.equal(result.decisionSnapshot.socialInvitation.partner.id,'actor');assert.equal(result.tokenBudget.compaction.publicInvitationPreserved,true);assert.deepEqual(p.activeRequests,{});
    console.log('Furnished social acceptance:',result.tokenBudget.stateTokens,'of',result.tokenBudget.stateLimit,'state tokens');
  }finally{globalThis.fetch=oldFetch;}
});

test('social acceptance rejects an unoffered choice with its complete request and response available for debugging',async()=>{
  const b=brain(),p=new Providers();p.decide=async(state,question,choices,id)=>({state,request:{id,question,choices},response:{choice:'invented',probabilities:{invented:1}}});
  await assert.rejects(p.socialAcceptance(b,partner(),{id:'chat-bad',topic:'garden games'}),error=>{assert.match(error.message,/offered accept or decline/);assert.equal(error.diagnostics.response.choice,'invented');assert.deepEqual(error.diagnostics.request.choices,{accept:'Accept and chat briefly',decline:'Decline and continue my activity'});return true;});
});

test('action planning exposes real available conversation partners without inventing conversation from a controller',async()=>{
  const p=new Providers();let sent;p.generate=async(system,prompt,schema)=>{sent={system,prompt,schema};return {value:{steps:[]}};};
  await p.actionPlan({objective:'Talk with Pip about the garden.'},{characters:[{id:'pip',name:'Pip',conversational:true,socialAvailable:true,socialReady:false},{id:'printed-toy',name:'Toy',conversational:false,socialAvailable:false,socialReady:false}]});
  assert.ok(actionPlanSchema.properties.steps.items.properties.action.enum.includes('socialize'));assert.match(sent.system,/conversational and socialAvailable.*both are true/);assert.match(sent.system,/controller or printed follower alone is not/);assert.match(sent.system,/acceptance and successful conversation are not guaranteed/i);assert.match(sent.prompt,/"id":"pip","name":"Pip","conversational":true,"socialAvailable":true/);
  assert.match(sent.prompt,/"socialReady":false/);assert.match(sent.system,/socialAvailable means a conversation may be requested/);assert.match(sent.system,/socialReady means the partner is ready for the acceptance decision now/);
  assert.match(sent.system,/finish their current personal activity and its verification.*waits up to 45 seconds/);assert.match(sent.system,/Waiting gives no social fulfillment/);assert.match(sent.system,/Never interrupt a user goal, urgent need, or another conversation/);
  assert.match(sent.system,/simple chat request, use one socialize step/);assert.match(sent.system,/do not add a standalone approach solely to enable the conversation/);assert.match(sent.system,/Socialize includes the request.*acceptance decision, approach/);
  const explicit='Approach Pip, then chat about the garden, then dance.';
  await p.actionPlan({objective:explicit},{characters:[{id:'pip',name:'Pip',conversational:true,socialAvailable:true,socialReady:false}]});
  assert.ok(sent.prompt.includes('Original objective: '+explicit));assert.ok(sent.prompt.includes('AUTHORITATIVE REQUEST: '+explicit));assert.match(sent.system,/explicitly requests a separate approach or movement step.*preserve that ordered step and every other requested action/);assert.match(sent.system,/do not rewrite an explicit multi-step objective/);
});

test('the independent verifier receives actual social delivery evidence and distinguishes invitation from completion',async()=>{
  const p=new Providers();let sent;p.generate=async(system,prompt,schema)=>{sent={system,prompt,schema};return {value:{complete:false,explanation:'No speech has been delivered.'}};};
  const evidence={completion:{job:{socialEvidence:{status:'invited',effectsApplied:false,transcript:[]}}}};
  await p.verifyStep({objective:'Talk with Pip.',planSteps:[{action:'socialize',target:'pip'}],planIndex:0},evidence);
  assert.match(sent.prompt,/completion\.job\.socialEvidence with status="completed"/);assert.match(sent.prompt,/accepted participant pair/);assert.match(sent.prompt,/both speakers with completed nearby speech durations/);assert.match(sent.prompt,/effectsApplied=true exactly once/);assert.match(sent.prompt,/generated but undelivered speech/);assert.ok(sent.prompt.includes(JSON.stringify(evidence)));
});
