import {worldObjects} from './perception.mjs';
import {retrieveMemory} from './memory.mjs';
import {ACTIONS} from './actions.mjs';

const numberText=(n,digits=1)=>String(Number(n.toFixed(digits)));
const positionText=p=>[p.x,p.y,p.z].map(n=>numberText(n)).join(',');
const pointActions=new Set(['move','place','throw','push']);
function stepContract(step,bindings){
  if(!step)return '';
  const target=step.target?(bindings[step.target]?step.target+'='+bindings[step.target]:step.target):'';
  return [step.action,target,step.use?'use='+step.use:'',step.recipient?'recipient='+step.recipient:'',pointActions.has(step.action)?'('+step.x+','+step.z+')':'',step.action==='throw'?'speed='+(step.speed?step.speed+'m/s':'auto'):'',step.action==='push'?'strength='+(step.strength||'auto'):'',step.seconds&&['rest','dance','observe','inspect','use'].includes(step.action)?step.seconds+'s':'',step.action==='print'?step.label||'':''].filter(Boolean).join(' ');
}
function objectFacts(e,required=false){
  return [e.mass?e.mass+'kg':'',required&&e.dimensions?'size='+e.dimensions.map(n=>numberText(n,3)).join('x')+'m':'',...(e.affordances||[]),...Object.entries(e.attributes||{}).filter(([k,v])=>v===true||k==='maxThrowSpeed'&&v>0||required&&k==='anchored').map(([k,v])=>v===true?k:k+'='+v),e.servings>0?'servings='+e.servings:''].filter(Boolean).join('/');
}
function decisionFeedback(brain,current,step){
  const completion=brain.pendingStepEvidence,rawError=brain.error||null;
  const matched=completion&&completion.stepIndex===step&&JSON.stringify(completion.step)===JSON.stringify(current)&&brain.logs.some(record=>record.id===completion.recordId&&record.cycle===brain.cycle&&record.type==='action_outcome'&&record.status==='completed');
  const verification=matched?brain.logs.findLast(record=>record.type==='step_verification'&&record.cycle===brain.cycle&&record.step===step+1&&record.evidence?.completion?.recordId===completion.recordId):null;
  const unconfirmed=verification?.status==='not_verified'&&verification.result?.complete===false;
  const subjective=unconfirmed&&rawError==='Step not verified: '+verification.result.explanation;
  const capacity=matched&&rawError?.startsWith('Objective and essential decision facts exceed checkpoint capacity;');
  return {engineBlocker:subjective||capacity?null:rawError,verification:unconfirmed?{status:'not_verified',attempts:brain.verificationAttempts||0,recordId:verification.id,explanation:verification.result.explanation}:null,inference:capacity?{code:'context_capacity',message:rawError}:null};
}
export function buildDecisionContext(brain){
  const actor=brain.actor,p=actor.body.translation(),entities=[...brain.physics.entities.values()];
  const held=entities.filter(e=>e.carrier===brain.actorId),retrieved=retrieveMemory(brain,brain.objective,2);
  const plan=brain.planSteps||[],step=brain.planIndex||0,current=plan[step];
  const references=[...new Set(plan.slice(step).map(s=>s.target).filter(t=>/^\$step[1-8]$/.test(t||'')))];
  const bindings=Object.fromEntries(references.map(ref=>[ref,brain.stepResults?.[Number(ref.slice(5))-1]?.entityId]).filter(([,id])=>id));
  const snapshot={
    objects:worldObjects(brain.garden),characters:[...brain.garden.brains.values()].filter(b=>b.actorId!==brain.actorId).map(b=>({id:b.actorId,name:b.actorName,position:{...b.actor.body.translation()},style:b.style,available:brain.garden.social.available(brain,b.actorId)})),lastObservation:brain.lastObservation||null,lastInspection:brain.lastInspection||null,
    actorId:brain.actorId,core:brain.core||{name:brain.actorName,style:brain.style,interests:[]},
    attributes:{height:actor.height,mass:65,controller:'KCC + physical rig'},
    goal:{completion:brain.pendingStepEvidence||null,text:brain.objective,source:brain.goalSource,plan,step,stage:brain.stage,canonicalStep:current?structuredClone(current):null,resolvedStep:current?{...structuredClone(current),...(bindings[current.target]?{target:bindings[current.target]}:{})}:null,stepResults:structuredClone(brain.stepResults||{}),bindings},
    needs:{...brain.needs},inventory:{tokens:brain.tokens,held:held.map(e=>({id:e.id,name:e.design.name}))},
    pose:actor.reclining?'reclining':actor.mounted?'driving':actor.walking?'walking':actor.activity||'standing',position:{...p},grounded:actor.controller?.computedGrounded(),
    nearby:entities.filter(e=>e.design&&Math.hypot(brain.physics.position(e).x-p.x,brain.physics.position(e).z-p.z)<3).map(e=>({id:e.id,name:e.design.name,kind:e.kind,affordances:e.design.affordances,position:brain.physics.position(e),servings:e.servings,carrier:e.carrier})),
    printer:{owner:brain.garden?.printerOwner||null,queue:brain.garden?.queue||[]},capabilities:ACTIONS,priorChoices:brain.answers||[],
    outcomes:brain.logs.filter(l=>l.type==='action_outcome').slice(-3).map(l=>l.outcome),blocker:brain.error||null,feedback:decisionFeedback(brain,current,step),review:brain.review||null,
    proposedObject:brain.pendingDesign?{name:brain.pendingDesign.name,description:brain.pendingDesign.description,kind:brain.pendingDesign.kind,attributes:brain.pendingDesign.attributes,mass:brain.pendingDesign.mass,dimensions:brain.pendingDesign.dimensions}:null,
    memory:brain.memory.map(m=>({...m})),retrievedMemory:retrieved.map(m=>({...m}))
  };
  const requiredTargets=new Set([...plan.slice(step).flatMap(s=>[bindings[s.target]||s.target,s.recipient]),...held.map(e=>e.id)].filter(Boolean));
  const variants=[2,1,0,0,0,0].map((memoryEntries,i)=>{
    const compact=i>=3,dense=i>=4,essentialOnly=i===5;
    const focus=current?'Current step '+(step+1)+'/'+plan.length+': '+stepContract(current,bindings)+(!compact&&current.action!=='print'&&current.label?' ['+current.label+']':'')+'. ':'';
    const needs=Object.entries(snapshot.needs).map(([name,value])=>name+' '+Math.round(value)).join(', ');
    const planText=plan.map((s,n)=>(n+1)+(n<step?' done:':n===step?' now:':dense?':':' later:')+(compact?s.action:s.label||s.action)).join(';')||'pending';
    const essential=focus+(dense?'':'You are ')+brain.actorName+'. Objective ('+(brain.goalSource||'user')+'): '+brain.objective+' Personality: '+snapshot.core.style+'. Interests: '+(snapshot.core.interests||[]).join(',')+'. Needs: '+needs+'. '+(dense?'':'Body: ')+actor.height.toFixed(1)+'m,65kg. At ('+positionText(p)+'), '+snapshot.pose+'. Held: '+(held.map(e=>e.id).join(',')||'none')+'; tokens '+brain.tokens+'. '+(dense?'':'Stage ')+brain.stage+'. Plan: '+(essentialOnly?plan.map(s=>s.action).join('>')||'pending':planText)+'.';
    const evidence=snapshot.goal.completion?(dense?' Engine completed: ':' Engine completed current step: ')+snapshot.goal.completion.outcome+(dense?'.':'. Verify before advancing.'):'';
    const prior=snapshot.priorChoices.length?' Choices: '+snapshot.priorChoices.map(a=>a.topic+'='+a.value).join(';')+'.':'';
    const review=brain.stage==='review'?' Unprinted design '+(brain.pendingDesign?.description||brain.pendingDesign?.name||'')+'. Review: '+brain.review?.summary+(brain.review?.checks.some(c=>!c.ok)?'; failed '+brain.review.checks.filter(c=>!c.ok).map(c=>c.label).join(','):'; no physical check failed. Visual resemblance remains unverified')+'.':'';
    const feedback=snapshot.feedback,verification=feedback.verification?' Verification: unconfirmed, attempt '+feedback.verification.attempts+(feedback.inference?', context capacity':'')+'.':feedback.inference?' Inference: context capacity.' :'';
    const outcome=verification+(feedback.engineBlocker?' Blocker: '+feedback.engineBlocker+'.':!compact&&!review?' Last outcome: '+(snapshot.outcomes.at(-1)||'none')+'.':'');
    const objects=(dense?' Objects xyz: ':' Objects (id name xyz): ')+snapshot.objects.map(e=>e.id+' '+e.name+' ('+positionText(e.position)+')'+(!compact||requiredTargets.has(e.id)?' '+objectFacts(e,requiredTargets.has(e.id)):'')).join(';')+'.';
    const people=snapshot.characters.filter(c=>!compact||brain.stage==='goal_select'||requiredTargets.has(c.id));
    const characters=people.length?' People: '+people.map(c=>c.id+' '+c.name+' ('+positionText(c.position)+') '+(c.available?'available':'busy')).join(';')+'.':'';
    const resolved=Object.keys(bindings).length?' Created: '+Object.entries(bindings).map(([ref,id])=>ref+'='+id).join(',')+'.':'';
    const memory=memoryEntries&&retrieved.length?' Memory: '+retrieved.slice(0,memoryEntries).map(m=>m.kind+': '+m.text).join(';')+'.':'';
    return {text:essential+evidence+prior+review+outcome+objects+characters+resolved+' Printer: '+(snapshot.printer.owner||'free')+'.'+memory+(dense?'':' Choose an offered option for the current step.'),profile:['full relevant notes','one complete memory','world without memory','current step and world catalog','compact step and world catalog','essential step and world catalog'][i],compaction:{fullSnapshotLogged:true,objectivePreserved:true,currentStepPreserved:true,canonicalAndResolvedStepPreserved:true,completedStepsMarked:true,allPlanActionsPreserved:true,allNeedsAndCoreInterestsPreserved:true,allPriorChoiceValuesPreserved:true,retrievedMemoryEntries:Math.min(memoryEntries,retrieved.length),textTruncated:false,allObjectNamesAndPositionsPreserved:true,currentPartnerPreserved:true,characterIds:people.map(c=>c.id),positionPrecisionMeters:.1,dimensionPrecisionMeters:.001,objectCapabilities:compact?'remaining plan targets and held objects':'all',capabilityObjectIds:snapshot.objects.filter(e=>!compact||requiredTargets.has(e.id)).map(e=>e.id),planLabels:compact?'current print intent only':'all',planRepresentation:essentialOnly?'all ordered actions; current step identifies verified prefix':'ordered steps',verificationFeedback:feedback.verification?'status and attempts; full explanation logged':null,omittedFields:[...(memoryEntries<retrieved.length?['some retrieved memory entries']:[]),...(compact?['prior outcome','non-target capabilities','other plan labels',...(people.length<snapshot.characters.length?['non-target characters (full snapshot)']:[])]:[]),...(feedback.verification?['verification explanation (full snapshot)']:[]),...(feedback.inference?['inference error prose (full snapshot)']:[])],fullCacheSize:brain.memory.length}};
  });
  return {snapshot,variants};
}
