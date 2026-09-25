import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,open} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import path from 'node:path';

const copy=value=>value===undefined?null:structuredClone(value);
const stepOf=brain=>({index:brain.planIndex??0,number:(brain.planSteps||[])[brain.planIndex??0]?(brain.planIndex??0)+1:null,total:(brain.planSteps||[]).length,action:copy((brain.planSteps||[])[brain.planIndex??0])});

function contextFor(brain,record){
  const captured=record.decisionSnapshot?.goal,archived=(brain.history||[]).find(h=>h.logs?.some(l=>l.id===record.id));
  return {actorId:brain.actorId,goal:captured?.text??archived?.objective??(record.cycle===brain.cycle?brain.objective:null),goalSource:captured?.source??(record.cycle===brain.cycle?brain.goalSource:null),cycle:record.cycle??brain.cycle,currentStep:captured?{index:captured.step,number:captured.plan?.[captured.step]?captured.step+1:null,total:captured.plan?.length??0,action:copy(captured.plan?.[captured.step])}:record.cycle===brain.cycle?stepOf(brain):null,stage:captured?.stage??archived?.stage??brain.stage,contextSource:captured?'recorded decision snapshot':archived?'archived goal; step unavailable':'state when diagnostic was captured'};
}

function recordReason(record){
  if(record.error)return String(record.error);
  if(record.type==='step_verification'&&record.status==='not_verified')return record.result?.explanation||record.outcome||'Step was not verified';
  if(['failed','rejected','error','stopped'].includes(record.status))return record.outcome||record.result?.description||record.reason||'Record marked '+record.status;
  return null;
}

/** A read-only report from engine data. This never calls a model or retrieves memory. */
export function buildDebugReport(world,{limit=30,journal=null,now=Date.now()}={}){
  const snapshot=world.snapshot(),brain=world.selected,all=[...world.brains.values()];
  const records=all.flatMap(b=>(b.logs||[]).map(record=>({...contextFor(b,record),record}))).sort((a,b)=>(a.record.time??0)-(b.record.time??0));
  const failures=[];
  for(const item of records){
    const r=item.record,reasons=[recordReason(r),...(r.rejections||[]).map(x=>x.reason||x.error),...(r.review?.checks||[]).filter(x=>!x.ok).map(x=>x.label)].filter(Boolean);
    for(const reason of new Set(reasons))failures.push({actorId:item.actorId,recordId:r.id,time:r.time,cycle:r.cycle,currentGoal:item.actorId===brain.actorId&&r.cycle===brain.cycle,type:r.type,status:r.status,reason});
  }
  const events=all.flatMap(b=>(b.events||[]).map(e=>({actorId:b.actorId,kind:e.kind,time:e.time,text:e.text})));
  const timeline=[...events,...records.map(({actorId,record:r})=>({actorId,recordId:r.id,kind:r.type,status:r.status,time:r.time,cycle:r.cycle,question:typeof r.question==='string'?r.question:r.question?.text,selected:r.selected,text:r.error||r.outcome||r.thought||r.result?.description||r.result?.explanation||null}))].sort((a,b)=>(a.time??0)-(b.time??0)).slice(-50);
  const held=(snapshot.entities||[]).filter(e=>e.carrier===brain.actorId).map(e=>({id:e.id,name:e.name,kind:e.kind,mass:e.mass,position:e.position}));
  return copy({schema:1,generatedAt:new Date(now).toISOString(),build:snapshot.build,epoch:snapshot.epoch,worldTime:snapshot.time,selectedActor:brain.actorId,
    current:{actorId:brain.actorId,name:brain.actorName,objective:brain.objective,goalSource:brain.goalSource,cycle:brain.cycle,stage:brain.stage,error:brain.error||null,fullPlan:brain.planSteps||[],currentStep:stepOf(brain),job:brain.job||null,pendingStepEvidence:brain.pendingStepEvidence||null,thought:brain.thought||null,needs:brain.needs,memory:brain.memory||[],physics:(snapshot.entities||[]).find(e=>e.id===brain.actorId)||null,held,activeObjectId:brain.activeId||null,result:brain.result||null},
    execution:{control:snapshot.control,busy:!!brain.busy,busyLabel:brain.busyLabel||'',printer:snapshot.printer,printJob:!!brain.printJob,useJob:!!brain.useJob,answers:brain.answers||[],question:brain.question||null,review:brain.review||null,lastDesignError:brain.lastDesignError||null,attempts:{plan:brain.planAttempts||0,printerPlan:brain.planRepairCount||0,construction:brain.repairCount||0,review:brain.reviewAttempts||0,verification:brain.verificationAttempts||0},providerStatus:{laya:snapshot.inference?.laya,generator:snapshot.inference?.generator},outstandingRequests:snapshot.inference?.activeRequests||Object.values(world.providers?.activeRequests||{})},
    actors:snapshot.actors||[],objects:snapshot.worldObjects||[],latestRecords:records.slice(-Math.min(100,Math.max(1,limit))),failureReasons:failures.slice(-30),timeline,
    priorGoals:(brain.history||[]).slice(-10).map(h=>({objective:h.objective,stage:h.stage,time:h.time,entity:h.entity})),journal:journal?.status()||null,
    limitations:['Model text is generated character dialogue, not hidden reasoning.','Descriptions and object metadata do not verify visual resemblance.','Record context is labeled when reconstructed from the current state; exact model inputs remain in the record.']});
}

/** One asynchronous writer, append-only revisions, with a bounded signature index. */
export class DiagnosticJournal{
  constructor(file,{maxSignatures=5000,onError=error=>console.error('Diagnostic journal:',error.message)}={}){
    this.file=file;this.maxSignatures=Math.min(5000,Math.max(1,maxSignatures));this.signatures=new Map();this.onError=onError;this.lastError=null;this.lastWrite=null;this.appended=0;this.closed=false;this.queue=this.initialize();
    this.queue.catch(error=>this.fail(error));
  }
  fail(error){this.lastError=error.message;this.onError(error);}
  remember(key,value){this.signatures.delete(key);this.signatures.set(key,value);while(this.signatures.size>this.maxSignatures)this.signatures.delete(this.signatures.keys().next().value);}
  async initialize(){
    await mkdir(path.dirname(this.file),{recursive:true});
    try{
      const lines=createInterface({input:createReadStream(this.file,{encoding:'utf8'}),crlfDelay:Infinity});
      for await(const line of lines){try{const entry=JSON.parse(line);if(entry.event==='scene_reset'){this.signatures.clear();continue;}if(entry.key&&entry.signature)this.remember(entry.key,{signature:entry.signature,revision:entry.recordRevision||1});}catch{/* Keep a partial crash line as evidence; later complete lines remain readable. */}}
    }catch(error){if(error.code!=='ENOENT')throw error;}
    // An interrupted append may leave a partial last line. Preserve it and start a fresh line.
    const reader=await open(this.file,'a+');const size=(await reader.stat()).size;
    if(size){const end=Buffer.alloc(1);await reader.read(end,0,1,size-1);if(end[0]!==10)await reader.appendFile('\n');}
    this.handle=reader;
  }
  enqueue(work){
    if(this.closed)return Promise.reject(Error('Diagnostic journal is closed'));
    const next=this.queue.then(work);this.queue=next.catch(error=>{this.fail(error);});return next;
  }
  capture(world,{build}={}){
    // Copy at capture time so pending->accepted mutations cannot change queued evidence.
    const timestamp=new Date().toISOString(),epoch=world.epoch,items=[];
    for(const brain of world.brains.values())for(const record of brain.logs||[]){
      const raw=JSON.stringify(record),signature=createHash('sha256').update(raw).digest('hex');
      items.push({key:brain.actorId+':'+record.id,signature,raw,metadata:{timestamp,build,epoch,...contextFor(brain,record)}});
    }
    return this.enqueue(async()=>{
      if(!this.handle)throw Error('Diagnostic journal is unavailable');
      const changed=[];let batch='';
      for(const item of items){const old=this.signatures.get(item.key);if(old?.signature===item.signature)continue;const revision=(old?.revision||0)+1;
        const prefix=JSON.stringify({...item.metadata,key:item.key,signature:item.signature,recordRevision:revision});
        batch+=prefix.slice(0,-1)+',"record":'+item.raw+'}\n';changed.push({...item,revision});
      }
      if(!batch)return 0;
      await this.handle.appendFile(batch,'utf8');
      for(const item of changed)this.remember(item.key,{signature:item.signature,revision:item.revision});
      this.appended+=changed.length;this.lastWrite=timestamp;this.lastError=null;return changed.length;
    });
  }
  resetScene(world,{build}={}){return this.enqueue(async()=>{if(!this.handle)throw Error('Diagnostic journal is unavailable');await this.handle.appendFile(JSON.stringify({timestamp:new Date().toISOString(),build,epoch:world.epoch,event:'scene_reset'})+'\n');this.signatures.clear();});}
  async flush(){await this.queue;if(!this.handle)throw Error(this.lastError||'Diagnostic journal is unavailable');await this.handle.sync();if(this.lastError)throw Error(this.lastError);}
  async close(){await this.flush();this.closed=true;await this.handle.close();}
  status(){return {file:this.file,format:'append-only JSONL; changed records append a new revision',retainedSignatures:this.signatures.size,maxSignatures:this.maxSignatures,appendedThisProcess:this.appended,lastWrite:this.lastWrite,error:this.lastError};}
}
