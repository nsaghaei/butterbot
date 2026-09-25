import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Providers} from '../providers.mjs';
import {fitDecisionContext,closeTokenizer} from '../token-budget.mjs';

after(closeTokenizer);
const saved=JSON.parse(await readFile(new URL('./fixtures/gift-acceptance-context.json',import.meta.url),'utf8'));
const xyz=p=>[p.x,p.y,p.z].map(n=>String(Number(n.toFixed(1)))).join(',');
function fixture(){
  const entities=new Map(saved.objects.filter(o=>o.kind!=='fixture').map(o=>[o.id,{...structuredClone(o),design:structuredClone(o),carrier:o.heldBy,carried:!!o.heldBy,body:{}}]));
  const physics={entities,position:e=>e.position},garden={physics,printerOwner:null,queue:[],brains:new Map(),social:{canRequest:()=>false,available:()=>false,canReceiveGift:()=>false}};
  const info=saved.actor,e={id:info.id,name:info.name,height:2.3,position:{...info.position},body:{translation:()=>e.position},controller:{computedGrounded:()=>true}};entities.set(e.id,e);
  const b={actorId:info.id,actorName:info.name,style:info.style,core:{name:info.name,style:info.style,interests:[...info.interests]},actor:e,physics,garden,objective:info.objective,goalSource:info.goalSource,stage:info.stage,planSteps:structuredClone(info.planSteps),planIndex:info.planIndex,needs:{...info.needs},tokens:3,memory:[],memoryClock:0,logs:[],answers:[],stepResults:{},cycle:22,error:saved.error,navigationFailure:structuredClone(saved.navigationFailure)};
  const giver={...structuredClone(saved.invitation.partner),memory:[{text:'PRIVATE DONOR MEMORY'}],objective:'PRIVATE DONOR GOAL'},peer={actorId:giver.id,actorName:giver.name,style:giver.style,actor:{body:{translation:()=>giver.position}}};
  garden.brains.set(b.actorId,b);garden.brains.set(giver.id,peer);garden.selected=b;
  const session={...structuredClone(saved.invitation),id:'gift-capacity-fixture'};return {b,giver,session};
}
function assertFacts(result,b,giver,session){
  assert.equal(result.tokenBudget.stateLimit,511-result.tokenBudget.headerTokens);assert.ok(result.tokenBudget.stateTokens<=result.tokenBudget.stateLimit);assert.ok(result.tokenBudget.stateTokens+result.tokenBudget.headerTokens<512);assert.equal(result.tokenBudget.compaction.textTruncated,false);
  assert.ok(result.state.includes(b.objective));assert.ok(result.state.includes(session.topic));assert.match(result.state,/Current step 1\/1: move \(1,1\)/);assert.match(result.state,/Plan:[^.]*\bmove\b/);assert.match(result.state,/Held: none/);
  assert.ok(result.state.includes(b.style));for(const interest of b.core.interests)assert.ok(result.state.includes(interest));for(const [key,value]of Object.entries(b.needs))assert.ok(result.state.includes(key+' '+Math.round(value)));
  for(const o of result.decisionSnapshot.objects)assert.ok(result.state.includes(o.id+' '+o.name+' ('+xyz(o.position)+')'),'Missing object '+o.id);
  const gift=session.object;assert.ok(result.state.includes(gift.mass+'kg'));assert.ok(result.state.includes('size='+gift.dimensions.join('x')+'m'));assert.ok(result.state.includes('heldBy='+gift.heldBy));for(const [key,value]of Object.entries(gift.attributes)){if(typeof value==='boolean'){const group=result.state.match(new RegExp('(?:^| )'+value+':([a-zA-Z,]+)'));assert.ok(result.state.includes(key+'='+value)||group?.[1].split(',').includes(key),'Missing gift '+key+'='+value);}else assert.ok(result.state.includes(key+'='+value),'Missing gift '+key);}
  for(const fact of [giver.id,giver.name,xyz(giver.position),giver.style])assert.ok(result.state.includes(fact),'Missing public giver '+fact);
  if(!result.state.includes(saved.error)){assert.match(result.state,/Current destination blocked by item-1/);assert.match(result.state,/Approach object or clear ground/);}assert.equal(result.decisionSnapshot.blocker,saved.error);assert.deepEqual(result.decisionSnapshot.giftNavigationBlocker,b.navigationFailure);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE DONOR/);assert.deepEqual(result.response.probabilities,{accept:.7,decline:.3});assert.equal(b.physics.entities.get(gift.id).carrier,'actor','Consent preparation cannot transfer the object');
}

test('actual 377-token blocked-walk gift now fits its measured checkpoint room with full facts and goals',async()=>{
  const {b,giver,session}=fixture(),p=new Providers();
  p.decide=async(_state,question,choices,id,context)=>{
    // Reproduce the captured legacy text, then require today's selected profile
    // to retain the additional giver facts that its older prefix did not carry.
    const historicalProfiles=context.variants.slice(0,7).map(v=>({...v,text:v.text.replace(' at('+xyz(giver.position)+'): '+giver.style+'->','->')}));
    const priorProfiles=await fitDecisionContext({...context,variants:historicalProfiles},question,choices);assert.equal(priorProfiles.tokenBudget.stateLimit,511-priorProfiles.tokenBudget.headerTokens);assert.equal(Math.min(...priorProfiles.tokenBudget.profiles.map(v=>v.stateTokens)),saved.previousMinimum);assert.ok(priorProfiles.tokenBudget.stateTokens>362,'The previously rejected gift retains its facts using real checkpoint room');
    return {...await fitDecisionContext(context,question,choices),response:{choice:'accept',probabilities:{accept:.7,decline:.3}}};
  };
  const result=await p.giftAcceptance(b,giver,session);assertFacts(result,b,giver,session);
  console.log('Actual gift acceptance:',result.tokenBudget.stateTokens,'of',result.tokenBudget.stateLimit);
});

test('gift-specific fallback still preserves a longer recipient goal and exact attributes when explicitly exercised',async()=>{
  const {b,giver,session}=fixture(),p=new Providers();b.objective='Take a walk to the sunny pad, then observe the garden before choosing another activity.';
  p.decide=async(_state,question,choices,id,context)=>({...await fitDecisionContext({...context,variants:[context.variants.at(-1)]},question,choices),response:{choice:'accept',probabilities:{accept:.7,decline:.3}}});
  const result=await p.giftAcceptance(b,giver,session);assertFacts(result,b,giver,session);assert.equal(b.planIndex,0);assert.deepEqual(b.stepResults,{});
  console.log('Longer recipient goal fallback:',result.tokenBudget.stateTokens,'of',result.tokenBudget.stateLimit);
});

test('unmatched blocker prose is never compacted into an invented physical explanation',async()=>{
  const {b,giver,session}=fixture(),p=new Providers();b.navigationFailure.reason='A different past obstacle';let inspected=false;
  p.decide=async(_state,question,choices,id,context)=>{const profile=context.variants.at(-1);assert.ok(profile.text.includes(saved.error));assert.equal(profile.compaction.navigationBlocker,'full original');assert.equal(context.snapshot.giftNavigationBlocker,undefined);inspected=true;return {response:{choice:'decline'}};};
  await p.giftAcceptance(b,giver,session);assert.equal(inspected,true);
});

test('a different current destination cannot inherit the earlier blocked point',async()=>{
  const {b,giver,session}=fixture(),p=new Providers();b.planSteps[0].x=2;
  p.decide=async(_state,question,choices,id,context)=>({...await fitDecisionContext({...context,variants:[context.variants.at(-1)]},question,choices),response:{choice:'decline'}});
  const result=await p.giftAcceptance(b,giver,session);assert.match(result.state,/Current step 1\/1: move \(2,1\)/);assert.match(result.state,/Blocked move\(1,1\): item-1/);assert.doesNotMatch(result.state,/Current destination blocked/);
});

test('larger irreducible acceptance contexts fail honestly with their complete diagnostic snapshot',async()=>{
  const {b,giver,session}=fixture(),p=new Providers();b.objective='Walk around the garden, inspect every resting place, observe all the plants, return to the sunny pad, then decide where to spend the afternoon while keeping the printed orange safe for later.';
  for(let i=0;i<16;i++){const id='sculpture-'+i,original=b.physics.entities.get('item-1'),position={x:i%8-4,y:.5,z:Math.floor(i/8)+2};b.physics.entities.set(id,{...original,id,name:'Distinct sculpture '+i,position,design:{...original.design,name:'Distinct sculpture '+i}});}
  p.decide=async(_state,question,choices,id,context)=>({...await fitDecisionContext(context,question,choices),response:{choice:'accept'}});
  await assert.rejects(p.giftAcceptance(b,giver,session),error=>{assert.match(error.message,/no facts were silently truncated/);assert.equal(error.tokenBudget.stateLimit,511-error.tokenBudget.headerTokens);assert.ok(Math.min(...error.tokenBudget.profiles.map(p=>p.stateTokens))>error.tokenBudget.stateLimit);assert.equal(error.diagnostics.decisionSnapshot.goal.text,b.objective);assert.deepEqual(error.diagnostics.decisionSnapshot.giftInvitation.object,session.object);assert.equal(error.diagnostics.decisionSnapshot.objects.length,saved.objects.length+16);assert.equal(error.diagnostics.decisionSnapshot.blocker,saved.error);return true;});
});
