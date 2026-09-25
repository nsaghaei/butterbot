import test from 'node:test';
import assert from 'node:assert/strict';
import {Providers} from '../providers.mjs';

const schema={type:'object',properties:{thought:{type:'string'}},required:['thought'],additionalProperties:false};
async function mocked(reply,run){const original=globalThis.fetch;globalThis.fetch=reply;try{return await run();}finally{globalThis.fetch=original;}}
const response=data=>async()=>({ok:true,status:200,json:async()=>structuredClone(data)});

test('malformed model JSON retains exact request, raw reply, output limit, finish reason and compute diagnostics',async()=>{
  const p=new Providers(),raw='{\n "thought": "The gift has arrived',data={model:'test-gemma',done:true,done_reason:'length',message:{content:raw},prompt_eval_count:8023,eval_count:169,prompt_eval_duration:200000000,eval_duration:900000000,load_duration:30000000,total_duration:1200000000};
  await mocked(response(data),async()=>{
    await assert.rejects(p.generate('Read only reflection.','The gift is verified.',schema,600),error=>{const d=error.diagnostics;assert.equal(d.system,'Read only reflection.');assert.equal(d.prompt,'The gift is verified.');assert.equal(d.raw,raw);assert.equal(d.rawLength,raw.length);assert.equal(d.rawTruncated,false);assert.equal(d.model,'test-gemma');assert.equal(d.maxOutputTokens,600);assert.equal(d.contextTokens,8192);assert.equal(d.finishReason,'length');assert.equal(d.responseMetadata.done,true);assert.equal(d.httpStatus,200);assert.equal(d.usage.outputTokens,169);assert.equal(d.usage.promptTokens,8023);assert.equal(d.usage.promptTokens+d.usage.outputTokens,d.contextTokens);assert.ok(d.usage.outputTokens<d.maxOutputTokens,'context exhaustion remains distinguishable from the output budget');assert.equal(d.timing.computeMs,1100);assert.equal(d.timing.loadMs,30);assert.ok(Number.isFinite(d.elapsedMs));assert.equal(d.parseError.name,'SyntaxError');assert.equal(d.generationError.message,error.message);assert.equal('value' in d,false);return true;});
  });assert.deepEqual(p.activeRequests,{});assert.equal(p.generatorAbort,null);assert.equal(p.calls.generator,1);
});

test('oversized output remains rejected and diagnostic raw capture is explicitly bounded',async()=>{
  const p=new Providers(),raw='x'.repeat(60001);
  await mocked(response({message:{content:raw},done_reason:'stop'}),async()=>assert.rejects(p.generate('system','prompt',schema),error=>{assert.match(error.message,/no bounded JSON/);assert.equal(error.diagnostics.raw.length,60000);assert.equal(error.diagnostics.rawLength,60001);assert.equal(error.diagnostics.rawTruncated,true);assert.equal(error.diagnostics.parseError,undefined);return true;}));
});

test('OpenAI incomplete output is rejected even if partial JSON parses, without exposing credentials',async()=>{
  const p=new Providers();p.provider='openai';const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-private-key';
  try{await mocked(async(_url,request)=>{const body=JSON.parse(request.body);assert.equal(body.max_output_tokens,600);assert.deepEqual(body.text.format.schema,schema);return {ok:true,status:200,json:async()=>({id:'response-fixture',model:'test-openai',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:42,output_tokens:600,total_tokens:642,output_tokens_details:{reasoning_tokens:20}},output:[{type:'message',content:[{type:'output_text',text:'{"thought":"Done"}'}]}]})};},async()=>assert.rejects(p.generate('system','prompt',schema,600),error=>{const d=error.diagnostics;assert.match(error.message,/incomplete.*max_output_tokens/);assert.equal(d.raw,'{"thought":"Done"}');assert.equal(d.finishReason,'max_output_tokens');assert.equal(d.responseMetadata.status,'incomplete');assert.equal(d.responseMetadata.id,'response-fixture');assert.equal(d.usage.output_tokens_details.reasoning_tokens,20);assert.equal('value' in d,false);assert.doesNotMatch(JSON.stringify(d),/test-private-key|Authorization/);return true;}));}finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
  assert.deepEqual(p.activeRequests,{});assert.equal(p.generatorAbort,null);
});

test('provider and transport failures retain the request and available response metadata',async()=>{
  const p=new Providers();
  await mocked(async()=>({ok:false,status:503,json:async()=>({error:'Model unavailable'})}),async()=>assert.rejects(p.generate('system','original prompt',schema,400),error=>{assert.equal(error.diagnostics.httpStatus,503);assert.equal(error.diagnostics.prompt,'original prompt');assert.equal(error.diagnostics.responseMetadata.error.message,'Model unavailable');assert.equal(error.diagnostics.raw,null);return true;}));
  await mocked(async()=>{throw Error('Offline connection interrupted');},async()=>assert.rejects(p.generate('system','second prompt',schema,400),error=>{assert.equal(error.diagnostics.httpStatus,null);assert.equal(error.diagnostics.prompt,'second prompt');assert.equal(error.diagnostics.raw,null);assert.equal(error.diagnostics.maxOutputTokens,400);return true;}));
  assert.deepEqual(p.activeRequests,{});assert.equal(p.generatorAbort,null);
});

test('complete generation returns parsed value and the same raw response evidence without rewriting JSON',async()=>{
  const p=new Providers(),raw='{ "thought": "Finished." }';
  await mocked(response({model:'test-gemma',message:{content:raw},done:true,done_reason:'stop',eval_count:12}),async()=>{const result=await p.generate('system','prompt',schema);assert.deepEqual(result.value,{thought:'Finished.'});assert.equal(result.raw,raw);assert.equal(result.finishReason,'stop');assert.equal(result.usage.outputTokens,12);assert.equal(result.parseError,undefined);assert.equal(result.maxOutputTokens,2600);});
});

test('reflection alone reserves a larger bounded context and output allowance while preserving full memory and schema',async()=>{
  const p=new Providers(),requests=[],memory=Array.from({length:12},(_,i)=>({id:'own-'+i,kind:'experience',text:'Distinct engine-supported observation '+i}));
  await mocked(async(_url,request)=>{const body=JSON.parse(request.body);requests.push(body);return {ok:true,status:200,json:async()=>({message:{content:'{"thought":"The gift is delivered.","speech":"","memory":[],"proposedActions":[]}'},done_reason:'stop'})};},async()=>{
    const result=await p.reflect({actorName:'Butterbot',style:'curious',memory},{actor:{id:'actor'}},'Completed goal');assert.equal(result.contextTokens,12288);assert.equal(result.maxOutputTokens,1500);assert.deepEqual(requests[0].options,{num_ctx:12288,num_predict:1500,temperature:.35,seed:17});
    for(const entry of memory)assert.ok(requests[0].messages[1].content.includes(JSON.stringify(entry)));
    assert.equal(requests[0].format.properties.memory.maxItems,3);assert.equal(requests[0].format.properties.proposedActions.maxItems,3);assert.equal(requests[0].format.additionalProperties,false);
    await p.generate('system','ordinary call',schema,400);assert.equal(requests[1].options.num_ctx,8192);assert.equal(requests[1].options.num_predict,400);
  });
});
