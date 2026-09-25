import {worldObjects} from './perception.mjs';
import {retrieveMemory} from './memory.mjs';
import {ACTIONS} from './actions.mjs';

const positionText=p=>[p.x,p.y,p.z].map(n=>n.toFixed(1)).join(',');
function objectFacts(e){
  return [e.mass?e.mass+'kg':'',...(e.affordances||[]),...Object.entries(e.attributes||{}).filter(([k,v])=>v===true||k==='maxThrowSpeed'&&v>0).map(([k,v])=>v===true?k:k+'='+v),e.servings>0?'servings='+e.servings:''].filter(Boolean).join('/');
}
export function buildDecisionContext(brain){
  const actor=brain.actor,p=actor.body.translation(),entities=[...brain.physics.entities.values()];
  const held=entities.filter(e=>e.carrier===brain.actorId),retrieved=retrieveMemory(brain,brain.objective,2);
  const plan=brain.planSteps||[],step=brain.planIndex||0,current=plan[step];
  const references=[...new Set(plan.slice(step).map(s=>s.target).filter(t=>/^\$step[1-8]$/.test(t||'')))];
  const bindings=Object.fromEntries(references.map(ref=>[ref,brain.stepResults?.[Number(ref.slice(5))-1]?.entityId]).filter(([,id])=>id));
  const snapshot={
    objects:worldObjects(brain.garden),lastObservation:brain.lastObservation||null,lastInspection:brain.lastInspection||null,
    actorId:brain.actorId,core:brain.core||{name:brain.actorName,style:brain.style,interests:[]},
    attributes:{height:actor.height,mass:65,controller:'KCC + physical rig'},
    goal:{completion:brain.pendingStepEvidence||null,text:brain.objective,source:brain.goalSource,plan,step,stage:brain.stage,stepResults:structuredClone(brain.stepResults||{}),bindings},
    needs:{...brain.needs},inventory:{tokens:brain.tokens,held:held.map(e=>({id:e.id,name:e.design.name}))},
    pose:actor.reclining?'reclining':actor.mounted?'driving':actor.walking?'walking':actor.activity||'standing',position:{...p},grounded:actor.controller?.computedGrounded(),
    nearby:entities.filter(e=>e.design&&Math.hypot(brain.physics.position(e).x-p.x,brain.physics.position(e).z-p.z)<3).map(e=>({id:e.id,name:e.design.name,kind:e.kind,affordances:e.design.affordances,position:brain.physics.position(e),servings:e.servings,carrier:e.carrier})),
    printer:{owner:brain.garden?.printerOwner||null,queue:brain.garden?.queue||[]},capabilities:ACTIONS,priorChoices:brain.answers||[],
    outcomes:brain.logs.filter(l=>l.type==='action_outcome').slice(-3).map(l=>l.outcome),blocker:brain.error||null,review:brain.review||null,
    proposedObject:brain.pendingDesign?{name:brain.pendingDesign.name,description:brain.pendingDesign.description,kind:brain.pendingDesign.kind,attributes:brain.pendingDesign.attributes,mass:brain.pendingDesign.mass,dimensions:brain.pendingDesign.dimensions}:null,
    memory:brain.memory.map(m=>({...m})),retrievedMemory:retrieved.map(m=>({...m}))
  };
  const target=bindings[current?.target]||current?.target;
  const variants=[160,90,45,0].map((memoryChars,i)=>{
    const compact=i===3;
    const focus=current?'Current step '+(step+1)+'/'+plan.length+': '+(current.label||current.action)+(target?' [target '+target+']':'')+'. ':'';
    const needs=Object.entries(snapshot.needs).map(([name,value])=>name+' '+Math.round(value)).join(', ');
    const planText=plan.map((s,n)=>(n+1)+(n<step?' done:':n===step?' now:':' later:')+(compact?s.action:s.label||s.action)).join(';')||'pending';
    const essential=focus+'You are '+brain.actorName+'. Objective ('+(brain.goalSource||'user')+'): '+brain.objective+' Personality: '+snapshot.core.style+'. Interests: '+(snapshot.core.interests||[]).join(',')+'. Needs: '+needs+'. Body: '+actor.height.toFixed(1)+'m,65kg. At ('+positionText(p)+'), '+snapshot.pose+'. Held: '+(held.map(e=>e.id).join(',')||'none')+'; tokens '+brain.tokens+'. Stage '+brain.stage+'. Plan: '+planText+'.';
    const evidence=snapshot.goal.completion?' Engine completed current step: '+snapshot.goal.completion.outcome+'. Verify before advancing.':'';
    const prior=snapshot.priorChoices.length?' Choices: '+snapshot.priorChoices.map(a=>a.topic+'='+a.value).join(';')+'.':'';
    const review=brain.stage==='review'?' Unprinted design '+(brain.pendingDesign?.description||brain.pendingDesign?.name||'')+'. Review: '+brain.review?.summary+(brain.review?.checks.some(c=>!c.ok)?'; failed '+brain.review.checks.filter(c=>!c.ok).map(c=>c.label).join(','):'; no physical check failed. Visual resemblance remains unverified')+'.':'';
    const outcome=snapshot.blocker?' Blocker: '+snapshot.blocker.slice(0,compact?80:140)+'.':!compact&&!review?' Last outcome: '+(snapshot.outcomes.at(-1)||'none').slice(0,i?70:110)+'.':'';
    const objects=' Objects (id name xyz): '+snapshot.objects.map(e=>e.id+' '+e.name+' ('+positionText(e.position)+')'+(!compact||e.id===target?' '+objectFacts(e):'')).join(';')+'.';
    const resolved=Object.keys(bindings).length?' Created: '+Object.entries(bindings).map(([ref,id])=>ref+'='+id).join(',')+'.':'';
    const memory=memoryChars&&retrieved.length?' Memory: '+retrieved.map(m=>m.kind+': '+m.text.slice(0,memoryChars)).join(';')+'.':'';
    return {text:essential+evidence+prior+review+outcome+objects+resolved+' Printer: '+(snapshot.printer.owner||'free')+'.'+memory+' Choose an offered option for the current step.',profile:['full relevant notes','short notes','minimum notes','current step and world catalog'][i],compaction:{fullSnapshotLogged:true,objectivePreserved:true,currentStepPreserved:true,completedStepsMarked:true,allNeedsAndCoreInterestsPreserved:true,allPriorChoiceValuesPreserved:true,memoryCharactersPerRetrievedEntry:memoryChars,allObjectNamesAndPositionsPreserved:true,objectCapabilities:compact?'current target only':'all',planLabels:compact?'current step only':'all',fullCacheSize:brain.memory.length}};
  });
  return {snapshot,variants};
}
