import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildDebugReport,DiagnosticJournal} from '../diagnostics.mjs';
import {parseArgs,runDebug} from '../debug.mjs';

function fixture(){
  const brain={actorId:'actor',actorName:'Agent Wobble',objective:'Print an orange',goalSource:'user',cycle:4,stage:'needs_design',planIndex:1,planSteps:[{action:'approach',target:'printer',label:'Approach printer'},{action:'print',label:'Print an orange'}],logs:[],history:[],events:[],needs:{energy:85},memory:[],answers:[],printJob:true,repairCount:1,error:'Unexpected extra parenthesis'};
  return {selected:brain,selectedActor:'actor',epoch:22,brains:new Map([['actor',brain]]),providers:{activeRequests:{7:{token:7,kind:'gemma',actorId:'actor',purpose:'design',context:'Precise input'}}},snapshot(){return {build:'fixture',epoch:this.epoch,time:10,control:{mode:'live',paused:false},entities:[{id:'actor',position:{x:-5,y:1.2,z:-.8},mass:65,grounded:true},{id:'orange',name:'Orange',carrier:'actor',mass:.2,position:{x:-5,y:1,z:-.5}}],worldObjects:[{id:'printer',name:'Idea printer',position:{x:-5,y:1,z:-3.5},description:'Fabricates objects'}],inference:{activeRequests:Object.values(this.providers.activeRequests),laya:{ready:true},generator:{ready:true}},printer:{owner:'actor',queue:[]}};}};
}
async function temporary(fn){const dir=await mkdtemp(path.join(os.tmpdir(),'garden-diagnostics-'));try{await fn(path.join(dir,'debug','history.jsonl'),dir);}finally{await rm(dir,{recursive:true,force:true});}}
const lines=async file=>(await readFile(file,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));

test('debug report retains exact decision evidence and readable current physics, plan and failures',()=>{
  const world=fixture(),b=world.selected;
  b.logs.push({id:'r1',cycle:3,time:1,type:'error',status:'failed',error:'Old blocked goal'});
  b.logs.push({id:'r2',cycle:4,time:2,type:'laya',status:'accepted',question:'Choose material',choices:{a:'Polymer',b:'Wood'},response:{choice:'a',probabilities:{a:.8,b:.2}},request:{phase:'description',state:'Exact full state'},decisionSnapshot:{goal:{text:b.objective,source:'user',step:1,plan:b.planSteps,stage:'question'}}});
  b.logs.push({id:'r3',cycle:4,time:3,type:'design',status:'rejected',prompt:'Exact construction prompt',proposal:{name:'Orange',code:'return makeOrange());'},error:'Unexpected extra parenthesis'});
  const before=JSON.stringify(b),report=buildDebugReport(world,{now:0});
  assert.equal(JSON.stringify(b),before);assert.deepEqual(report.latestRecords.at(-1).record,b.logs.at(-1));
  assert.equal(report.latestRecords[1].record.response.probabilities.a,.8);assert.equal(report.current.currentStep.number,2);assert.equal(report.current.fullPlan.length,2);
  assert.equal(report.current.physics.grounded,true);assert.equal(report.current.held[0].name,'Orange');assert.equal(report.objects[0].id,'printer');assert.equal(report.execution.outstandingRequests[0].context,'Precise input');
  assert.equal(report.failureReasons[0].currentGoal,false);assert.equal(report.failureReasons[1].currentGoal,true);
  report.latestRecords.at(-1).record.proposal.code='mutated report';assert.equal(b.logs.at(-1).proposal.code,'return makeOrange());');
});

test('latest records are bounded and timeline includes thoughts, choices and events without invoking models',()=>{
  const world=fixture();world.providers.reflect=()=>assert.fail('must not infer');
  world.selected.logs=Array.from({length:40},(_,i)=>({id:'r'+i,time:i,cycle:4,type:i===39?'reflection':'laya',thought:i===39?'That failed; the code needs repair.':null,selected:'Try material A'}));
  world.selected.events.push({time:40,kind:'printed',text:'An object materialized'});
  const report=buildDebugReport(world);assert.equal(report.latestRecords.length,30);assert.equal(report.latestRecords[0].record.id,'r10');assert.equal(report.timeline.at(-1).kind,'printed');assert.match(report.timeline.at(-2).text,/repair/);
});

test('journal serializes pending and accepted revisions, deduplicates, flushes and resumes after restart',async()=>temporary(async file=>{
  const world=fixture(),record={id:'r1',cycle:4,time:1,type:'laya',status:'pending',choices:{a:'Print',b:'Revise'},state:'Full input'};world.selected.logs.push(record);
  const journal=new DiagnosticJournal(file),first=journal.capture(world,{build:'fixture'});
  record.status='accepted';record.response={choice:'a',probabilities:{a:.9,b:.1}};const second=journal.capture(world,{build:'fixture'}),third=journal.capture(world,{build:'fixture'});
  assert.deepEqual(await Promise.all([first,second,third]),[1,1,0]);await journal.flush();const entries=await lines(file);
  assert.deepEqual(entries.map(e=>e.recordRevision),[1,2]);assert.deepEqual(entries.map(e=>e.record.status),['pending','accepted']);assert.equal(entries[0].goal,'Print an orange');assert.equal(entries[0].currentStep.number,2);assert.equal(entries[1].record.response.probabilities.a,.9);await journal.close();
  const restarted=new DiagnosticJournal(file);assert.equal(await restarted.capture(world,{build:'next-release'}),0);record.status='rejected';record.error='State changed';assert.equal(await restarted.capture(world,{build:'next-release'}),1);await restarted.close();assert.equal((await lines(file)).at(-1).recordRevision,3);
}));

test('journal resets preserve old evidence even when new scene reuses identical record IDs',async()=>temporary(async file=>{
  const world=fixture();world.selected.logs=[{id:'r1',cycle:1,time:0,type:'laya',status:'pending'}];const journal=new DiagnosticJournal(file);
  await journal.capture(world,{build:'fixture'});world.epoch=23;await journal.resetScene(world,{build:'fixture'});await journal.capture(world,{build:'fixture'});await journal.close();
  const entries=await lines(file);assert.equal(entries.length,3);assert.equal(entries[1].event,'scene_reset');assert.equal(entries[0].epoch,22);assert.equal(entries[2].epoch,23);
  const restarted=new DiagnosticJournal(file);assert.equal(await restarted.capture(world,{build:'fixture'}),0);await restarted.close();
}));

test('signature memory stays bounded and an interrupted trailing line is preserved',async()=>temporary(async(file,dir)=>{
  const file2=path.join(dir,'interrupted.jsonl');await writeFile(file2,'{"interrupted":');
  const world=fixture(),journal=new DiagnosticJournal(file2,{maxSignatures:3});
  for(let i=0;i<8;i++){world.selected.logs=[{id:'r'+i,cycle:4,time:i,type:'outcome',status:'completed'}];await journal.capture(world,{build:'fixture'});}
  assert.equal(journal.status().retainedSignatures,3);await journal.close();const text=await readFile(file2,'utf8');assert.ok(text.startsWith('{"interrupted":\n'));assert.equal(text.trim().split('\n').length,9);
}));

test('CLI is read-only by default and only exports the fetched report',async()=>{
  const report=buildDebugReport(fixture()),calls=[],writes=[];
  const result=await runDebug(parseArgs(['--out','evidence/report.json']),{fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>report};},write:async(...args)=>writes.push(args),log:()=>{}});
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,undefined);assert.ok(calls[0].url.endsWith('/api/debug'));assert.equal(result.watch.readOnly,true);assert.equal(result.watch.outcome,'snapshot');assert.equal(JSON.parse(writes[0][1]).report.latestRecords.length,0);
});

test('explicit goal CLI uses existing actor then observes a failure with exact retained evidence',async()=>{
  const world=fixture(),calls=[];let now=0,polls=0;
  const result=await runDebug(parseArgs(['--goal','Go print an orange','--seconds','10']),{now:()=>now,wait:async ms=>{now+=ms;},log:()=>{},fetchImpl:async(url,init)=>{
    calls.push({url,init});if(init.method==='POST'){const value=JSON.parse(init.body);assert.equal(value.actorId,'actor');world.selected.objective=value.objective;world.selected.cycle++;return {ok:true,json:async()=>({ok:true})};}
    if(++polls===3){world.selected.stage='failed';world.selected.logs.push({id:'bad-code',cycle:5,time:12,type:'design',status:'rejected',error:'Compiler syntax error',proposal:{code:'return );'}});}
    return {ok:true,json:async()=>buildDebugReport(world)};
  }});
  assert.equal(calls.filter(c=>c.init.method==='POST').length,1);assert.equal(result.watch.outcome,'failed');assert.equal(result.watch.readOnly,false);assert.equal(result.report.latestRecords[0].record.proposal.code,'return );');assert.equal(result.watch.elapsedSeconds,1);
});

test('CLI reports a bounded timeout or superseded objective rather than claiming success',async()=>{
  for(const supersede of [false,true]){const world=fixture();let now=0;
    const result=await runDebug(parseArgs(['--seconds','2']),{now:()=>now,wait:async ms=>{now+=ms;if(supersede)world.selected.objective='Dance instead';},log:()=>{},fetchImpl:async()=>({ok:true,json:async()=>buildDebugReport(world)})});
    assert.equal(result.watch.outcome,supersede?'superseded':'timeout');assert.equal(result.watch.elapsedSeconds,supersede?1:2);
  }
  assert.throws(()=>parseArgs(['--url','https://example.com']),/local HTTP/);assert.throws(()=>parseArgs(['--seconds','NaN']),/between/);assert.throws(()=>parseArgs(['--goal',' ']),/1–240/);
});
