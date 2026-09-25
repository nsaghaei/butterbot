import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const HELP=`Inspect the running garden without making a model call:
  node debug.mjs
  node debug.mjs --seconds 30 --out evidence/debug-watch.json

Explicitly give the current character a goal, then observe that SAME running game:
  node debug.mjs --goal "Go to the printer and print an orange" --seconds 180 --out evidence/print-attempt.json

Options: --goal TEXT  --seconds 0..3600  --out FILE  --url http://127.0.0.1:8790  --help
Only --goal changes the world. It replaces the selected character's current goal.
Reports preserve exact recorded model inputs/outputs, probabilities and construction errors.
The durable history path is included in the report. No second model instance is started.`;

export function parseArgs(args){
  const options={url:'http://127.0.0.1:8790',seconds:0};let secondsGiven=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(arg==='--help'||arg==='-h'){options.help=true;continue;}
    if(!['--goal','--seconds','--out','--url'].includes(arg))throw Error('Unknown option: '+arg);
    const value=args[++i];if(value===undefined||value.startsWith('--'))throw Error('Missing value for '+arg);
    if(arg==='--seconds'){options.seconds=Number(value);secondsGiven=true;if(!Number.isFinite(options.seconds)||options.seconds<0||options.seconds>3600)throw Error('--seconds must be between 0 and 3600');}
    else options[arg.slice(2)]=value;
  }
  if(options.goal!==undefined){options.goal=options.goal.trim();if(!options.goal||options.goal.length>240)throw Error('--goal must contain 1–240 characters');if(!secondsGiven)options.seconds=120;}
  const url=new URL(options.url);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('--url must be a local HTTP garden server');options.url=url.origin;
  return options;
}

function summary(report){const c=report.current;return `${c.name}: ${c.objective}\nStage: ${c.stage}; step ${c.currentStep.number??'—'}/${c.currentStep.total}${c.currentStep.action?.label?' — '+c.currentStep.action.label:''}${c.error?'\nBlocker: '+c.error:''}\nOutstanding model calls: ${report.execution.outstandingRequests.length}`;}

/** Dependencies are injectable for offline tests. Only an explicit goal issues a POST. */
export async function runDebug(options,{fetchImpl=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,log=console.log,write=async(file,data)=>{await mkdir(path.dirname(path.resolve(file)),{recursive:true});await writeFile(file,data);}}={}){
  const request=async(route,init)=>{const response=await fetchImpl(options.url+route,{...init,signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Garden request failed ('+response.status+')');return data;};
  let report=await request('/api/debug');const actorId=report.selectedActor;
  if(options.goal!==undefined){await request('/api/objective',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actorId,objective:options.goal})});report=await request('/api/debug');}
  const objective=options.goal??report.current.objective,cycle=report.current.cycle,started=now(),samples=[];let previous='',outcome='snapshot';
  while(true){
    const c=report.current,sample={observedAt:report.generatedAt,actorId:c.actorId,objective:c.objective,cycle:c.cycle,stage:c.stage,currentStep:c.currentStep,error:c.error,latestRecordId:report.latestRecords.at(-1)?.record.id||null};samples.push(sample);
    const line=summary(report);if(line!==previous){log(line);previous=line;}
    if(!options.seconds)break;
    if(c.actorId!==actorId||c.objective!==objective||c.cycle!==cycle){outcome='superseded';break;}
    if(['complete','failed','suspended'].includes(c.stage)){outcome=c.stage;break;}
    if(now()-started>=options.seconds*1000){outcome='timeout';break;}
    await wait(Math.min(1000,options.seconds*1000-(now()-started)));report=await request('/api/debug');
  }
  const result={watch:{outcome,requestedGoal:options.goal??null,readOnly:options.goal===undefined,elapsedSeconds:(now()-started)/1000,samples},report};
  if(options.out){await write(options.out,JSON.stringify(result,null,2)+'\n');log('Saved diagnostic report: '+options.out);}
  log('Observation: '+outcome+'.'+(outcome==='timeout'?' The character has not reached a terminal state in this interval.':''));return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const options=parseArgs(process.argv.slice(2));if(options.help)console.log(HELP);else{const result=await runDebug(options);if(['failed','suspended'].includes(result.watch.outcome))process.exitCode=2;}}
  catch(error){console.error('Debug inspection failed: '+error.message);process.exitCode=1;}
}
