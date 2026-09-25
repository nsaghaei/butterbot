import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Garden} from '../garden.mjs';
import {Providers} from '../providers.mjs';
import {closeTokenizer} from '../token-budget.mjs';

after(closeTokenizer);
function fixture(kind){
  const p=new Providers();p.laya.ready=true;p.generator.ready=true;p.healthTime=Date.now();
  const g=new Garden({providers:p,seedFood:false}),b=g.selected;
  if(kind!=='goal'){g.assign('actor',kind==='printer'?'Print one small ornament.':'Observe the garden.');b.planSteps=[{action:'observe',seconds:2,label:'Observe the garden'}];b.stage='action_decide';}
  if(kind==='completion'){b.startAction(b.planSteps[0]);for(let i=0;i<125;i++)g.step();assert.equal(b.stage,'awaiting_step_done');}
  if(kind==='printer'){b.stage='question';b.question={topic:'form',text:'Which shape?',choices:[{id:'a',label:'Round',value:'round'}]};}
  b.nextCall=0;return {g,b,p};
}
const engineState=(g,b)=>structuredClone({objective:b.objective,planSteps:b.planSteps,planIndex:b.planIndex,stepResults:b.stepResults,pendingStepEvidence:b.pendingStepEvidence,answers:b.answers,needs:b.needs,entities:g.physics.snapshot()});
async function withFetch(fetch,run){const before=globalThis.fetch;globalThis.fetch=fetch;try{return await run();}finally{globalThis.fetch=before;}}
const scopes={activity:'activity',completion:'step',goal:'goal'};

for(const kind of ['activity','completion','goal','printer'])test(kind+' preflight rejection closes the pending decision and retains both budgets without executing it',async()=>{
  const {g,b}=fixture(kind),before=engineState(g,b),adapter={checkpointLimit:512,encodedTokens:512,strictMargin:1,reason:'Packed input would reach the checkpoint limit'};let request;
  try{await withFetch(async(_url,options)=>{request=JSON.parse(options.body);return {ok:false,status:400,json:async()=>({error:'Adapter preflight rejected this input',tokenBudget:adapter})};},()=>b.poll());
    assert.ok(request,'The fixture must reach the mocked adapter boundary');assert.deepEqual(engineState(g,b),before,'No action, answer, memory, or progress may be fabricated after failed inference');
    const record=b.logs.findLast(l=>l.type==='laya');assert.equal(record.status,'rejected');if(scopes[kind])assert.equal(record.scope,scopes[kind]);assert.equal(record.response,undefined);
    assert.deepEqual(record.request,request);assert.equal(record.state,request.requests[0].state);assert.deepEqual(record.adapterTokenBudget,adapter);assert.deepEqual(record.diagnostics.adapterTokenBudget,adapter);assert.equal(record.tokenBudget.stateLimit,511-record.tokenBudget.headerTokens);assert.deepEqual(record.diagnostics.tokenBudget,record.tokenBudget);
    assert.equal(record.decisionSnapshot.goal.text,b.objective);assert.equal(record.decisionSnapshot.objects.length,g.snapshot().worldObjects.length);assert.ok(!b.logs.some(l=>l.type==='laya'&&l.status==='pending'));
    const failure=b.logs.findLast(l=>l.type==='error');if(kind!=='goal'){assert.deepEqual(failure.adapterTokenBudget,adapter);assert.deepEqual(failure.request,request);}assert.equal(b.busy,false);
  }finally{g.physics.dispose();}
});

for(const kind of ['activity','completion','goal','printer'])test(kind+' accepted decisions retain exact adapter packing and every offered probability',async()=>{
  const {g,b}=fixture(kind),packing={do:{encodedTokens:240,checkpointLimit:512,strictMargin:1,markerPositions:[3,19]}};let probabilities;
  try{await withFetch(async(_url,options)=>{const request=JSON.parse(options.body),entry=request.requests[0],ids=Object.keys(entry.questions.do.criteria);probabilities=Object.fromEntries(ids.map((id,i)=>[id,i===0?1:0]));return {ok:true,status:200,json:async()=>({results:{[entry.id]:{do:{choice:ids[0],probabilities}}},packing:{[entry.id]:packing}})};},()=>b.poll());
    const record=b.logs.findLast(l=>l.type==='laya');assert.equal(record.status,'accepted',record.error||b.error);assert.deepEqual(record.adapterPacking,packing);assert.deepEqual(record.response.probabilities,probabilities);assert.deepEqual(Object.keys(record.choices),Object.keys(probabilities));assert.equal(record.tokenBudget.stateLimit,511-record.tokenBudget.headerTokens);
  }finally{g.physics.dispose();}
});

test('a local tokenizer failure keeps its budget and full decision snapshot even without an adapter request',async()=>{
  const {g,b,p}=fixture('activity'),budget={checkpointLimit:512,headerTokens:220,headLimit:192,reason:'Header exceeds checkpoint budget'};
  try{p.decide=async()=>{const error=Error('Question exceeds checkpoint header budget');error.tokenBudget=budget;throw error;};await b.poll();const record=b.logs.findLast(l=>l.type==='laya');assert.equal(record.status,'rejected');assert.deepEqual(record.tokenBudget,budget);assert.equal(record.decisionSnapshot.goal.text,b.objective);assert.equal(record.request,undefined);assert.deepEqual(b.logs.findLast(l=>l.type==='error').tokenBudget,budget);assert.equal(b.job,null);assert.equal(b.planIndex,0);
  }finally{g.physics.dispose();}
});

for(const kind of ['activity','completion','goal','printer'])test(kind+' stale failure retains diagnostics but cannot alter the replacement goal',async()=>{
  const {g,b,p}=fixture(kind);let reject;
  try{p.decide=()=>new Promise((_resolve,rejectPending)=>reject=rejectPending);const pending=b.poll();await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof reject,'function');const record=b.logs.findLast(l=>l.type==='laya');g.assign('actor','Dance here.');const afterAssign=engineState(g,b),stage=b.stage,revision=b.revision;
    const error=Error('Old preflight failed');error.tokenBudget={checkpointLimit:512,encodedTokens:512};error.diagnostics={state:record.state,request:{id:record.id},adapterTokenBudget:error.tokenBudget};reject(error);await pending;
    assert.equal(record.status,'discarded');assert.deepEqual(record.diagnostics.request,{id:record.id});assert.deepEqual(record.adapterTokenBudget,error.tokenBudget);assert.equal(b.stage,stage);assert.equal(b.revision,revision);assert.equal(b.error,null);assert.deepEqual(engineState(g,b),afterAssign);assert.ok(!b.logs.some(l=>l.type==='error'&&l.cycle===b.cycle));
  }finally{g.physics.dispose();}
});
