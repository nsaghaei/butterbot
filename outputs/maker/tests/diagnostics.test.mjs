import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
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

test('isolated HTTP debug endpoints are read-only and export, save and graceful shutdown preserve evidence',{timeout:20000},async()=>temporary(async(file,dir)=>{
  // Real Garden, physics and server; every provider fetch is intercepted in the child.
  const {Garden}=await import('../garden.mjs');
  const garden=new Garden({seedFood:false}),brain=garden.selected;
  garden.mode='manual';garden.paused=true;brain.goalSource='user';brain.objective='Offline printer failure fixture';brain.stage='failed';brain.error='Unexpected extra parenthesis';brain.planSteps=[{action:'approach',target:'printer',label:'Approach printer'},{action:'print',label:'Print a test prop'}];brain.planIndex=1;
  brain.logs=[{id:'offline-decision',cycle:brain.cycle,time:1,type:'laya',status:'accepted',question:'Print this design?',choices:{a:'Print',b:'Revise'},response:{choice:'a',probabilities:{a:.75,b:.25}},request:{state:'Exact original decision input'}},{id:'offline-failure',cycle:brain.cycle,time:2,type:'design',status:'rejected',prompt:'Exact original construction input',proposal:{code:'return createProp());'},error:brain.error}];
  const saveFile=path.join(dir,'isolated-save.json');await writeFile(saveFile,JSON.stringify(garden.save()));garden.physics.dispose();
  const reservation=net.createServer();await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const bootstrap=path.join(dir,'offline-server.mjs');await writeFile(bootstrap,`globalThis.fetch=async (url)=>{process.send?.({type:'provider-call',url:String(url)});throw Error('Offline diagnostic test: no network provider access');};\nawait import(${JSON.stringify(new URL('../server-v2.mjs',import.meta.url).href)});\nprocess.on('message',message=>{if(message==='graceful-shutdown')process.emit('SIGTERM');});\n`);
  const child=spawn(process.execPath,[bootstrap],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,PORT:String(port),SAVE_FILE:saveFile,NO_RESTORE:'0',GENERATOR_PROVIDER:'ollama',LAYA_URL:'http://127.0.0.1:1',GENERATOR_URL:'http://127.0.0.1:1'}});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal}))),providerCalls=[];let output='';child.stderr.on('data',chunk=>output+=chunk);child.on('message',message=>{if(message.type==='provider-call')providerCalls.push(message.url);});
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Isolated server did not start: '+output)),8000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Maker Garden:')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Isolated server exited: '+output));});});
    const url='http://127.0.0.1:'+port,read=async route=>{const response=await fetch(url+route,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);return response.json();},post=async(route,data={})=>{const response=await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});assert.equal(response.status,200,await response.text());};
    const before=await read('/api/state'),report=await read('/api/debug');assert.equal(report.current.objective,'Offline printer failure fixture');assert.equal(report.current.currentStep.number,2);assert.equal(report.latestRecords[0].record.response.probabilities.a,.75);assert.equal(report.latestRecords[1].record.proposal.code,'return createProp());');
    const downloaded=await fetch(url+'/api/debug/export');assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-disposition'),/attachment.*garden-debug\.json/);const exported=await downloaded.json();assert.deepEqual(exported.latestRecords,report.latestRecords);assert.equal(exported.journal.file,path.join(dir,'debug','history.jsonl'));
    const after=await read('/api/state');for(const key of ['objective','cycle','stage','planSteps','planIndex','memory','entities'])assert.deepEqual(after[key],before[key],key+' changed after read-only debug requests');assert.deepEqual(after.inference.calls,{laya:0,generator:0});
    assert.ok(providerCalls.length<=2);assert.ok(providerCalls.every(u=>u==='http://127.0.0.1:1/api/health'||u==='http://127.0.0.1:1/api/tags'));
    const journalFile=path.join(dir,'debug','history.jsonl');assert.deepEqual((await lines(journalFile)).map(e=>e.record.id),['offline-decision','offline-failure']);await post('/api/save');const saved=JSON.parse(await readFile(saveFile,'utf8'));assert.equal(saved.brains[0].logs[1].error,'Unexpected extra parenthesis');assert.equal((await lines(journalFile)).length,2,'export/save must not append duplicate records');
    const layout=await fetch(url+'/environment-layout.mjs');assert.equal(layout.status,200);assert.match(layout.headers.get('content-type'),/javascript/);assert.match(await layout.text(),/export /);
    const foreign=await fetch(url+'/api/debug',{headers:{Origin:'https://example.com'}});assert.equal(foreign.status,403);
    await post('/api/resume');const resumed=await read('/api/debug');assert.ok(resumed.current.cycle>saved.brains[0].cycle);assert.equal(resumed.current.objective,'Offline printer failure fixture');await post('/api/control',{paused:false});
    child.send('graceful-shutdown');const result=await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Graceful shutdown did not finish: '+output)),5000);timer.unref();})]);assert.equal(result.code,0,output);
    const shutDownSave=JSON.parse(await readFile(saveFile,'utf8'));assert.equal(shutDownSave.brains[0].cycle,resumed.current.cycle);assert.equal(shutDownSave.world.control.paused,false,'shutdown must preserve the previous pause preference');assert.equal((await lines(journalFile)).length,2);
  }finally{if(child.exitCode===null){child.kill();await exited;}}
}));
