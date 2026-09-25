import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildDecisionContext} from '../decision-context.mjs';
import {fitDecisionContext,closeTokenizer} from '../token-budget.mjs';
import {Providers} from '../providers.mjs';
import {objectInfo} from '../perception.mjs';

after(closeTokenizer);
const saved=JSON.parse(await readFile(new URL('./fixtures/printed-gift-context.json',import.meta.url),'utf8'));
const completionQuestion='Judge only the current plan step, not the whole objective. Should Gemma confirm or examine its recorded outcome?';
const completionChoices={done:'Done with this step — ask Gemma to verify',check:'Ask Gemma to check this step’s outcome'};
const positionText=p=>[p.x,p.y,p.z].map(n=>String(Number(n.toFixed(1)))).join(',');
function fixture(){
  const entities=new Map(saved.objects.filter(o=>o.kind!=='fixture').map(o=>[o.id,{...structuredClone(o),design:structuredClone(o),carrier:o.heldBy,carried:!!o.heldBy,body:{}}]));
  const physics={entities,position:e=>e.position},social={canRequest:()=>true,available:()=>true,canReceiveGift:(_brain,id)=>![...entities.values()].some(e=>e.carrier===id)},garden={physics,social,printerOwner:null,queue:[],brains:new Map()};
  for(const info of [saved.actor,saved.peer]){
    const e={id:info.id,name:info.name,height:2.3,position:{...info.position},body:{translation:()=>e.position},controller:{computedGrounded:()=>true}};entities.set(e.id,e);
    const actor=info.id==='actor';const b={actorId:info.id,actorName:info.name,style:info.style,core:{name:info.name,style:info.style,interests:actor?saved.actor.interests:['play','company']},actor:e,physics,garden,objective:actor?saved.objective:info.objective,goalSource:actor?'user':'self',stage:actor?'action_decide':'complete',planSteps:actor?structuredClone(saved.planSteps):[{action:'observe',seconds:2,label:'Observe surroundings'}],planIndex:actor?saved.planIndex:1,stepResults:actor?structuredClone(saved.stepResults):{},cycle:actor?saved.cycle:14,needs:{...info.needs},tokens:3,memory:[],memoryClock:0,logs:[],answers:actor?structuredClone(saved.answers):[],error:null};garden.brains.set(e.id,b);
  }
  garden.selected=garden.brains.get('actor');return {garden,b:garden.selected,peer:garden.brains.get('pip'),item:entities.get('item-6')};
}
function assertPreserved(b,context,fit){
  assert.equal(fit.tokenBudget.stateLimit,511-fit.tokenBudget.headerTokens);assert.ok(fit.tokenBudget.stateTokens<=fit.tokenBudget.stateLimit);assert.ok(fit.tokenBudget.stateTokens+fit.tokenBudget.headerTokens<512);assert.equal(fit.tokenBudget.compaction.textTruncated,false);assert.ok(fit.state.includes(b.objective));
  for(const o of context.snapshot.objects)assert.ok(fit.state.includes(o.id+' '+o.name+' ('+positionText(o.position)+')'),o.id+' catalog facts missing');
  for(const a of saved.answers)assert.ok(fit.state.includes(a.topic+'='+a.value),'Missing exact selected '+a.topic);
  assert.ok(fit.state.includes('$step1=item-6'));assert.match(fit.state,/Plan:.*print.*pick_up.*give/);
  assert.match(fit.state,new RegExp('Current step '+(b.planIndex+1)+'/3: '+b.planSteps[b.planIndex].action));
  assert.ok(fit.state.includes('pip Pip ('+positionText(saved.peer.position)+')'));
  for(const fact of ['0.15kg','size=0.21x0.252x0.215m','portable','anchored=false','edible','servings=1','throwable','maxThrowSpeed=5','giftable','pushable'])assert.ok(fit.state.includes(fact),'Missing '+fact);
  for(const need of Object.keys(b.needs))assert.ok(fit.state.includes(need));
  assert.equal(fit.tokenBudget.compaction.allPlanActionsPreserved,true);assert.equal(fit.tokenBudget.compaction.allPriorChoiceValuesPreserved,true);
}

test('the recorded printed gift fits pickup, give and both physical completion decisions with every required fact',async()=>{
  const {b,item}=fixture(),counts=[];
  const original=buildDecisionContext(b);
  const formerlyRejected=await fitDecisionContext({...original,variants:original.variants.slice(0,6)},saved.question,saved.choices);
  assert.equal(Math.min(...formerlyRejected.tokenBudget.profiles.map(p=>p.stateTokens)),371);assert.ok(formerlyRejected.tokenBudget.stateTokens>362,'The original 371-token fixture now has legitimate checkpoint room');assertPreserved(b,original,formerlyRejected);
  for(const index of [1,2])for(const complete of [false,true]){
    b.planIndex=index;b.stage=complete?'awaiting_step_done':'action_decide';item.carrier=index===1?(complete?'actor':null):(complete?'pip':'actor');item.carried=!!item.carrier;
    b.pendingStepEvidence=complete?{stepIndex:index,step:structuredClone(b.planSteps[index]),outcome:index===1?'Picked up Small Edible Orange':'Gave Small Edible Orange to Pip after consent and a physical handoff'}:null;
    const context=buildDecisionContext(b),fit=await fitDecisionContext(context,complete?completionQuestion:saved.question,complete?completionChoices:{a0:b.planSteps[index].label,a1:'Ask for help with this step'});
    assertPreserved(b,context,fit);if(complete)assert.ok(fit.state.includes(b.pendingStepEvidence.outcome));
    counts.push({action:b.planSteps[index].action,stage:b.stage,tokens:fit.tokenBudget.stateTokens,profile:fit.tokenBudget.profile});
  }
  console.log('Printed gift contexts:',JSON.stringify(counts));
});

test('the prior inference-capacity error cannot become an oversized physical blocker before pickup',async()=>{
  const {b}=fixture();b.error='Objective and essential decision facts exceed checkpoint capacity; no facts were silently truncated (smallest state 371 tokens; limit 362; header 35)';
  const context=buildDecisionContext(b),fit=await fitDecisionContext(context,saved.question,saved.choices);
  assertPreserved(b,context,fit);assert.equal(context.snapshot.blocker,b.error);assert.equal(context.snapshot.feedback.inference.message,b.error);assert.equal(context.snapshot.feedback.engineBlocker,null);assert.equal(b.pendingStepEvidence,undefined);
  assert.match(fit.state,/Inference: context capacity/);assert.ok(!fit.state.includes(b.error));
  b.error='Small Edible Orange is held by Pip';const blocked=buildDecisionContext(b);assert.equal(blocked.snapshot.feedback.engineBlocker,b.error);assert.ok(blocked.variants.every(v=>v.text.includes(b.error)));
});

test('consent to the newly printed orange fits with the whole public catalog and exact offer attributes',async()=>{
  const {garden,b,peer,item}=fixture(),p=new Providers();item.carrier='actor';item.carried=true;
  p.decide=async(_state,question,choices,id,context)=>({...await fitDecisionContext(context,question,choices),response:{choice:'accept',probabilities:{accept:.7,decline:.3}}});
  const result=await p.giftAcceptance(peer,{id:b.actorId,name:b.actorName,style:b.style,position:b.actor.body.translation()},{id:'fixture-gift',topic:saved.objective,object:objectInfo(garden,item.id)});
  assert.equal(result.tokenBudget.stateLimit,511-result.tokenBudget.headerTokens);assert.ok(result.tokenBudget.stateTokens<=result.tokenBudget.stateLimit);assert.ok(result.tokenBudget.stateTokens+result.tokenBudget.headerTokens<512);assert.ok(result.state.includes(peer.objective));
  for(const o of result.decisionSnapshot.objects)assert.ok(result.state.includes(o.id+' '+o.name+' ('+positionText(o.position)+')'));
  for(const [key,value]of Object.entries(item.attributes))assert.ok(result.state.includes(key+'='+value));
  assert.match(result.state,/heldBy=actor/);assert.equal(result.tokenBudget.compaction.textTruncated,false);assert.equal(result.tokenBudget.compaction.allGiftAttributesPreserved,true);
  console.log('Printed orange gift consent:',result.tokenBudget.stateTokens,'of',result.tokenBudget.stateLimit,result.tokenBudget.profile);
});
