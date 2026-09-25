import {sameAction} from './action-identity.mjs';
import {PRINTER} from './environment-layout.mjs';
import {beginObjectJob,tickObjectJob} from './object-jobs.mjs';
import {objectInfo,worldObjects,observeSurroundings} from './perception.mjs';
import {goalCandidates,criticalNeedPlan} from './autonomy.mjs';
import {lifeNeeds,tickNeeds,fulfillNeed,accommodationDesigns} from './needs.mjs';
import {updateMemory,retrieveMemory} from './memory.mjs';
import {buildDecisionContext} from './decision-context.mjs';
import {Physics} from './physics.mjs';
import {MakerWorld,PRESETS} from './world.mjs';
import {Providers} from './providers.mjs';
import {compileDesign} from './design.mjs';
import {ACTIONS,validatePlanTargets,validatePlanCoverage,validateAction,resolveActionReferences,printDependencies,feasibleActions,conciseWorld} from './actions.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const terminal=new Set(['idle','complete','failed','suspended']);
const foodDesign=await compileDesign({name:'Garden berry bowl',kind:'prop',mass:.4,affordances:['display'],code:"const g=new THREE.Group();for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),new THREE.MeshToonMaterial({color:0xe56775}));m.position.set(Math.cos(i*1.25)*.16,.12,Math.sin(i*1.25)*.16);g.add(m);}return g;"});
foodDesign.source='authored finite food resource';foodDesign.material='food';
const accommodationItems=await Promise.all(accommodationDesigns().map(async item=>{const design=await compileDesign(item.proposal);design.source='authored accommodation';design.material=design.attributes.edible?'food':item.id==='garden-shower'?'metal':'wood';return {...item,design,position:{...item.position,y:design.dimensions[1]/2+.02}};}));
export class ActorBrain extends MakerWorld {
  newObjective(...args){super.newObjective(...args);this.stepResults={};this.printIntent=null;this.printRequirements=[];this.selfGoalProposal=null;this.navigationRecoveries=0;this.navigationFailure=null;}
  constructor(garden,id,name){super({physics:garden.physics,providers:garden.providers,actorId:id,actorName:name,seed:garden.seed,interaction:'display'});this.garden=garden;this.stage='goal_select';this.goalSource='self';this.objective='Find something worthwhile to do in the garden.';this.goalReadyAt=0;this.userPriorityAt=0;this.needs=lifeNeeds();this.memory=[];this.memorySerial=0;this.memoryClock=0;this.style={actor:'inventive, curious, gently theatrical',pip:'playful, gentle, observant',june:'calm, patient, inventive'}[id]||'curious';this.core=Object.freeze({name,style:this.style,interests:Object.freeze(id==='pip'?['play','company']:id==='june'?['craft','quiet places']:['exploration','useful things'])});this.nextReflection=Date.now()+20000;this.pendingReflection=null;this.planSteps=[];this.planIndex=0;this.job=null;this.suggestions=[];this.reservePrinter=id=>garden.reservePrinter(id);this.releasePrinter=()=>garden.releasePrinter(id);}
  assign(objective){this.pendingStepEvidence=null;this.verificationAttempts=0;this.goalSource='user';this.userPriorityAt=Date.now();this.suspendedGoal=null;this.reflectionChoices=0;this.stallReplans=0;this.planAttempts=0;this.planError=null;this.garden.cancelReservations(this.actorId);this.newObjective('display',objective);this.lastUserGoal={text:this.objective,status:'active',cycle:this.cycle,assignedAt:this.time};this.stage='action_plan';this.planSteps=[];this.planIndex=0;this.alternatives=0;this.job=null;this.actor.activity=null;this.humanPending=null;this.reviewAttempts=0;this.pendingReflection='A new goal was assigned';}
  stateForModel(){this.decisionContext=buildDecisionContext(this);return this.decisionContext.variants[0].text;}
  log(type,data){return super.log(type,type==='laya'?{...data,decisionSnapshot:this.decisionContext?.snapshot,contextProfiles:this.decisionContext?.variants.map(v=>({profile:v.profile,...v.compaction})),candidateContracts:Object.entries(data.choices||{}).map(([id,label])=>({id,label,...(data.scope==='activity'?this.candidateContracts?.find(c=>c.id===id):{})}))}:data);}
  async reflect(reason){
    const revision=this.revision,cycle=this.cycle;this.busy=true;this.busyLabel=this.actorName+' is reflecting';this.pendingReflection=null;
    try{const generated=await this.providers.reflect(this,conciseWorld(this.garden,this),reason);if(this.revision!==revision||this.cycle!==cycle||this.paused||this.garden.paused){this.log('reflection',{source:'gemma',status:'discarded',reason:'State changed'});return;}
      const value=generated.value;if(typeof value.thought!=='string'||value.thought.length>240||typeof value.speech!=='string'||value.speech.length>180)throw Error('Reflection exceeds dialogue budget');updateMemory(this,value.memory);const accepted=[],rejected=[];for(const a of (value.proposedActions||[]).slice(0,3)){try{accepted.push(validateAction(this.garden,this,a));}catch(error){rejected.push({action:a,error:error.message});}}this.suggestions=accepted;
      this.thought={text:value.thought,speech:value.speech,time:this.time};this.log('reflection',{source:this.providers.provider,status:'accepted',thought:value.thought,speech:value.speech,memoryEdits:value.memory,acceptedSuggestions:accepted,rejectedSuggestions:rejected,elapsedMs:generated.elapsedMs,prompt:generated.prompt,usage:generated.usage});
      if(this.stage==='reflecting'){const help=this.job?.action==='ask_for_help';this.actionDone(true,help?'Asked for help and reviewed current facts':'Expressed a generated character reflection');if(help&&!this.pendingStepEvidence&&this.stage!=='complete'&&this.stage!=='failed')this.stage='action_plan';}
    }catch(error){this.log('reflection',{source:this.providers.provider,status:this.revision===revision?'failed':'discarded',error:error.message});if(this.revision===revision&&this.stage==='reflecting')this.actionDone(false,'Reflection unavailable: '+error.message);}
    finally{this.busy=false;this.busyLabel='';this.nextReflection=Date.now()+90000;}
  }
  hasStepEvidence(){const e=this.pendingStepEvidence;return !!e&&e.stepIndex===this.planIndex&&JSON.stringify(e.step)===JSON.stringify(this.planSteps[this.planIndex])&&this.logs.some(l=>l.id===e.recordId&&l.type==='action_outcome'&&l.status==='completed');}
  verifiedPrefix(){
    const prefix=this.planSteps.slice(0,this.planIndex);
    for(let i=0;i<prefix.length;i++){
      const result=this.stepResults?.[i];
      if(result?.status==='verified'&&result.cycle===this.cycle&&JSON.stringify(result.step)===JSON.stringify(prefix[i]))continue;
      // Older saves predate stepResults but still contain the original verification evidence.
      const record=this.logs.findLast(l=>l.type==='step_verification'&&l.status==='verified'&&l.cycle===this.cycle&&l.step===i+1&&JSON.stringify(l.evidence?.completion?.step)===JSON.stringify(prefix[i]));
      if(!record)throw Error('Cannot replan over an unverified completed step '+(i+1));
      this.stepResults??={};this.stepResults[i]={status:'verified',stepIndex:i,cycle:this.cycle,step:structuredClone(prefix[i]),action:prefix[i].action,recordId:record.evidence.completion.recordId,verificationRecordId:record.id,verifiedAt:record.time,outcome:record.evidence.completion.outcome};
    }
    return prefix;
  }
  async pollStepCompletion(){
    if(this.busy||this.paused||this.garden.paused||Date.now()<this.nextCall||this.mode==='manual')return;
    const revision=this.revision;this.busy=true;let record,attemptStarted=false;
    try{
      if(!this.hasStepEvidence())throw Error('Step completion has no matching successful engine outcome');
      if(this.stage==='awaiting_step_done'){
        const question='Judge only the current plan step, not the whole objective. Should Gemma confirm or examine its recorded outcome?',choices={done:'Done with this step — ask Gemma to verify',check:'Ask Gemma to check this step’s outcome'};
        this.busyLabel='Laya is assessing the completed action';record=this.log('laya',{source:'laya',scope:'step',status:'pending',question,choices,state:this.stateForModel()});const result=await this.providers.decide(record.state,question,choices,record.id,this.decisionContext);Object.assign(record,result);
        if(revision!==this.revision||this.garden.paused){record.status='discarded';return;}
        const choice=result.response?.choice;if(!choices[choice])throw Error('Invalid completion choice');record.selected=choices[choice];record.status='accepted';this.revision++;
        this.stage='verify_step';record.outcome=choice==='done'?'Requested independent verification; step has not advanced':'Requested an evidence check; the successful action will not be repeated';
      }else{
        this.busyLabel='Gemma is checking step '+(this.planIndex+1)+' against observed outcomes';this.verificationAttempts=(this.verificationAttempts||0)+1;attemptStarted=true;
        const evidence={completion:structuredClone(this.pendingStepEvidence),facts:conciseWorld(this.garden,this)};
        const generated=await this.providers.verifyStep(this,evidence);record=this.log('step_verification',{source:this.providers.provider||'gemma',status:'pending',step:this.planIndex+1,evidence,prompt:generated.prompt,result:generated.value,elapsedMs:generated.elapsedMs});
        if(revision!==this.revision||this.garden.paused){record.status='discarded';return;}
        if(typeof generated.value?.complete!=='boolean'||typeof generated.value?.explanation!=='string')throw Error('Invalid step verification response');
        if(generated.value.complete&&this.hasStepEvidence()){
          const completed=this.pendingStepEvidence,job=completed.job;
          if(completed.step.action==='print'&&(!job.createdEntityId||!job.creationRecordId||!this.physics.entities.has(job.createdEntityId)||!this.logs.some(l=>l.id===job.creationRecordId&&l.type==='creation'&&l.status==='created'&&l.entity===job.createdEntityId&&l.cycle===this.cycle)))throw Error('The print step has no matching created object in this goal');
          record.status='verified';record.outcome=generated.value.explanation;this.stepResults??={};this.stepResults[this.planIndex]={status:'verified',stepIndex:this.planIndex,cycle:this.cycle,step:structuredClone(completed.step),action:completed.step.action,recordId:completed.recordId,verificationRecordId:record.id,verifiedAt:this.time,outcome:completed.outcome,...(completed.step.action==='print'?{entityId:job.createdEntityId,creationRecordId:job.creationRecordId}:{})};this.planIndex++;this.pendingStepEvidence=null;this.verificationAttempts=0;this.reflectionChoices=0;this.alternatives=0;this.error=null;this.stage='action_decide';if(this.planIndex>=this.planSteps.length)this.finishPlan();
        }else{
          record.status='not_verified';record.outcome=generated.value.explanation;this.error='Step not verified: '+generated.value.explanation;this.stage=this.verificationAttempts>=3?'failed':'awaiting_step_done';if(this.stage==='failed'){this.goalReadyAt=this.time+20;this.pendingReflection=this.error;this.nextReflection=0;}
        }
      }
    }catch(error){if(revision!==this.revision)return;if(record){record.status='rejected';record.error=error.message;}this.error=error.message;if(!attemptStarted)this.verificationAttempts=(this.verificationAttempts||0)+1;this.stage=this.verificationAttempts>=3?'failed':'awaiting_step_done';if(this.stage==='failed'){this.goalReadyAt=this.time+20;this.pendingReflection=this.error;this.nextReflection=0;}this.log('error',{scope:'step',status:'failed',error:error.message});}
    finally{this.busy=false;this.busyLabel='';this.nextCall=Date.now()+1200;}
  }
  async chooseGoal(){const revision=this.revision;this.busy=true;this.busyLabel='Laya is choosing a personal goal';try{const candidates=goalCandidates(this),choices=Object.fromEntries(candidates.map(g=>[g.id,g.text])),question='Choose a feasible next goal that fits your current needs and character style.',record=this.log('laya',{source:'laya',scope:'goal',status:'pending',question,choices,state:this.stateForModel()});const result=await this.providers.decide(record.state,question,choices,record.id,this.decisionContext);Object.assign(record,result);if(this.revision!==revision||this.garden.paused){record.status='discarded';return;}const goal=candidates.find(g=>g.id===result.response?.choice);if(!goal)throw Error('Invalid self goal choice');record.status='accepted';record.selected=goal.text;record.outcome='Self-selected goal';this.newObjective('display',goal.text);this.goalSource='self';this.selfGoalProposal=structuredClone(goal);this.planSteps=[];this.planIndex=0;this.alternatives=0;this.reflectionChoices=0;this.stage='action_plan';this.exploreIndex=(this.exploreIndex||0)+(goal.id==='explore'?1:0);this.pendingReflection='I selected a personal goal';}catch(error){this.error=error.message;this.nextCall=Date.now()+10000;}finally{this.busy=false;this.busyLabel='';this.nextCall=Math.max(this.nextCall,Date.now()+1800);}}
  async poll(){
    if(['awaiting_step_done','verify_step'].includes(this.stage))return this.pollStepCompletion();
    if(this.stage==='goal_select'&&!this.paused&&!this.garden.paused&&!this.busy&&Date.now()>=this.nextCall&&this.time>=this.goalReadyAt)return this.chooseGoal();
    if(this.stage==='action_decide'&&this.goalSource==='user'&&!this.suspendedGoal){const need=criticalNeedPlan(this);if(need){this.suspendedGoal={objective:this.objective,planSteps:this.planSteps,planIndex:this.planIndex,stepResults:this.stepResults,goalSource:this.goalSource,selfGoalProposal:this.selfGoalProposal,printIntent:this.printIntent,printRequirements:this.printRequirements,navigationRecoveries:this.navigationRecoveries,navigationFailure:this.navigationFailure};this.objective=need.text;this.navigationRecoveries=0;this.navigationFailure=null;this.selfGoalProposal=structuredClone(need);this.planSteps=[];this.planIndex=0;this.stepResults={};this.planAttempts=0;this.planError=null;this.stage='action_plan';this.goalSource='need interruption';this.revision++;this.log('goal',{status:'interrupted',scope:'goal',outcome:'Temporarily interrupted user goal for a critical need; it will resume.'});}}
    if(terminal.has(this.stage)||this.paused||this.garden.paused||this.busy||Date.now()<this.nextCall||this.mode==='manual')return;
    if(!['action_plan','action_decide'].includes(this.stage))return super.poll();
    const revision=this.revision,cycle=this.cycle;let attemptedAction=null;this.busy=true;const still=()=>revision===this.revision&&cycle===this.cycle&&!this.paused&&!this.garden.paused;
    try{
      if(this.stage==='action_plan'){
        this.busyLabel='Creator is proposing a general activity plan';if(!this.providers.generator.ready)throw Error('Creator unavailable; no scripted fallback');
        const prefix=this.verifiedPrefix(),generated=await this.providers.actionPlan(this,{...conciseWorld(this.garden,this),correction:this.planError||null,planning:{engineProposal:this.selfGoalProposal||null,navigationFailure:this.navigationFailure||null,verifiedPrefix:prefix,stepResults:this.stepResults||{},nextStepNumber:prefix.length+1,maxNewSteps:8-prefix.length}});if(!still())return;
        const plan=generated.value;this.log('activity_plan',{source:this.providers.provider,status:'proposed',plan,prompt:generated.prompt,elapsedMs:generated.elapsedMs,timing:generated.timing,usage:generated.usage});
        if(!plan.supported)throw Error(plan.explanation||'This goal has no supported engine plan');
        if(!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>8-prefix.length||plan.steps.some(a=>!ACTIONS.includes(a.action)||typeof a.label!=='string'||a.label.length>160))throw Error('Invalid activity plan');
        if(prefix.length&&plan.steps.length>=prefix.length&&prefix.every((step,i)=>sameAction(step,plan.steps[i])))throw Error('Replan repeated the verified prefix; return only the remaining steps');
        const combined=[...prefix,...plan.steps];validatePlanTargets(this.garden,combined,this.actorId,{startIndex:prefix.length,stepResults:this.stepResults||{},cycle:this.cycle});validatePlanCoverage(this.objective,combined);this.planError=null;this.error=null;this.planAttempts=0;this.pendingStepEvidence=null;this.planSteps=combined;this.planIndex=prefix.length;this.stage='action_decide';return;
      }
      const canonicalStep=this.planSteps[this.planIndex];if(!canonicalStep){this.finishPlan();return;}const intended=resolveActionReferences(this.garden,this,canonicalStep);attemptedAction=intended;let options=[];
      try{options.push(validateAction(this.garden,this,intended));}catch(error){
        // A target can have moved while another persistent job was running.
        const target=objectInfo(this.garden,intended.action==='give'?intended.recipient:intended.target),reach=intended.action==='inspect'?1.7:intended.action==='give'?2:2.7;if(target&&['pick_up','inspect','use','eat','push','give'].includes(intended.action)&&distance(this.actor.body.translation(),intended.action==='inspect'?(target.approach||target.position):target.position)>reach)options.push({action:'approach',target:target.id,label:'Approach '+target.name+' for this step',preparatory:true});else throw error;
      }
      // A committed plan offers its current action or a bounded request for help, not unrelated detours.
      options.push(intended.action==='ask_for_help'?{action:'think',label:'Check the current step before asking for help'}:{action:'ask_for_help',label:'Ask for help with this step'});
      this.candidateContracts=options.map((a,i)=>({id:'a'+i,...a}));const choices=Object.fromEntries(options.map((a,i)=>['a'+i,a.label||a.action])),question='Which next action best advances your current objective?';
      this.busyLabel='Laya is choosing its next activity';const record=this.log('laya',{source:this.mode==='demo'?'scripted':'laya',status:'pending',scope:'activity',state:this.stateForModel(),question,choices,revision,canonicalStep:structuredClone(canonicalStep),resolvedStep:structuredClone(intended),stepResults:structuredClone(this.stepResults||{})});
      const started=Date.now(),result=this.mode==='demo'?{response:{choice:'a0'}}:await this.providers.decide(record.state,question,choices,record.id,this.decisionContext);Object.assign(record,result,{elapsedMs:Date.now()-started});
      if(!still()){record.status='discarded';record.error='World changed during inference';return;}
      const index=Number(result.response?.choice?.slice(1));if(!Number.isInteger(index)||!options[index])throw Error('Invalid activity choice');
      const action=options[index];attemptedAction=action;record.selected=choices[result.response.choice];
      try{this.startAction(action,{advance:!action.preparatory&&(index===0||sameAction(action,intended))});this.revision++;record.status='accepted';record.outcome='Validated job started';this.error=null;}catch(error){record.status='rejected';record.error=error.message;record.outcome='Not executed: preconditions changed';throw error;}
    }catch(error){if(!still())return;if(['move','approach','place'].includes(attemptedAction?.action)&&/^(?:Walking destination is occupied by |No clear ground approach within )/.test(error.message)){this.job={...attemptedAction,start:this.time,startPosition:{...this.actor.body.translation()},advance:false,executionStarted:false};this.actionDone(false,'Not executed: '+error.message);return;}this.error=error.message;this.planError=error.message;const repair=this.stage==='action_plan'&&(this.planAttempts=(this.planAttempts||0)+1)<3;this.stage=repair?'action_plan':'failed';if(!repair){this.goalReadyAt=this.time+20;this.pendingReflection='Explain blocked goal: '+error.message;this.nextReflection=0;}this.log('error',{status:'failed',scope:'activity',error:error.message});this.garden.releasePrinter(this.actorId);}
    finally{this.busy=false;this.busyLabel='';this.nextCall=Date.now()+1200;}
  }
  startAction(input,{advance=true}={}){
    const a=validateAction(this.garden,this,input),approach=a.action==='approach'?(objectInfo(this.garden,a.target).approach||this.physics.interactionApproach(a.target,this.actorId)):null;this.job={...a,advance,start:this.time,startPosition:{...this.actor.body.translation()},lastDistance:Infinity,stuck:0};
    if(['think','speak','ask_for_help'].includes(a.action)){this.reflectionChoices=(this.reflectionChoices||0)+1;if(this.reflectionChoices>2){this.actionDone(false,'Repeated reflection made no progress; this goal is blocked');return;}this.stage='reflecting';this.pendingReflection='Laya selected '+a.action;this.nextReflection=0;return;}
    if(a.target)this.garden.reservations.set(a.target,this.actorId);
    if(a.action==='print'){this.printIntent=a.label||this.objective;this.printRequirements=advance&&this.planSteps[this.planIndex]?.action==='print'?printDependencies(this.planSteps,this.planIndex):[];this.result=null;this.activeId=null;this.pendingDesign=null;this.review=null;this.lastDesignError=null;this.question=null;this.waitCount=0;this.inspectCount=0;this.commitFailures=0;this.planRepairCount=0;this.planRejection=null;this.routeWatch=null;this.plans=[];this.plan=null;this.stage='planning';this.questionTopics=this.printRequirements.some(r=>r.action==='eat')?['form','size','detail']:['form','size','material','detail'];this.material=this.printRequirements.some(r=>r.action==='eat')?'food':null;this.answers=[];this.refreshes=0;this.repairCount=0;this.reviewAttempts=0;this.printJob=true;return;}
    this.stage='acting';this.actor.activity=a.action;if(beginObjectJob(this,a))return;
    if(a.action==='move'||a.action==='place')this.actor.goal={x:a.x,z:a.z+(a.action==='place'?1.2:0)};
    if(a.action==='approach')this.actor.goal={x:approach.x,z:approach.z};
    if(a.action==='observe')this.job.seconds=2;
    if(a.action==='inspect'){this.job.seconds=2;this.actor.activity='inspect';this.actor.lookPoint=objectInfo(this.garden,a.target).position;}
    if(a.action==='use'){
      const e=this.physics.entities.get(a.target);this.activeId=e.id;this.interaction=a.use;this.kind=e.kind;this.placement=this.physics.position(e);this.stage='use';this.applyChoice('use',{outcome:''});this.printJob=false;this.useJob=true;
    }
  }
  step(dt){
    if(this.paused)return;if((this.printJob||this.useJob)&&['complete','failed'].includes(this.stage)){const ok=this.stage==='complete',outcome=this.result?.description||this.error;this.printJob=false;this.useJob=false;if(this.job)this.actionDone(ok,outcome||'Creation did not complete');}tickNeeds(this,dt);if(this.stage==='failed'&&this.suspendedGoal&&this.goalSource==='need interruption')this.resumeSuspendedGoal(false,this.error||this.result?.description);this.captureUserResult();if(['complete','failed'].includes(this.stage)&&this.time>=(this.goalReadyAt||0)){this.stage='goal_select';this.goalSource='self';this.objective='Find a feasible next goal from my current needs and surroundings.';this.error=null;this.planSteps=[];this.planIndex=0;}
    if(this.stage==='acting'){
      this.time+=dt;this.metrics.ticks++;const job=this.job,p=this.actor.body.translation();if(!job)return;if(tickObjectJob(this,job))return;this.actor.actionProgress=Math.min(1,(this.time-job.start)/Math.max(.1,job.seconds||3));
      if(['move','approach','place'].includes(job.action)){
        const remaining=distance(p,this.actor.goal);job.progressPosition??={...job.startPosition};if(distance(p,job.progressPosition)>=.08){job.stuck=0;job.progressPosition={x:p.x,z:p.z};}else job.stuck+=dt;job.lastDistance=remaining;
        if(remaining<.18){this.actor.goal=null;
          if(job.action==='place'){const held=[...this.physics.entities.values()].find(e=>e.carrier===this.actorId);try{this.physics.place(held.id,{x:job.x,y:held.design.dimensions[1]/2+.12,z:job.z});this.actionDone(true,`Placed ${held.design.name} at (${job.x}, ${job.z})`);}catch(error){this.actionDone(false,error.message);}}
          else this.actionDone(true,`Reached (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
        }else if(job.stuck>4||this.time-job.start>35)this.actionDone(false,'Route blocked or destination unreachable; job stopped');
      }else if(this.time-job.start>=job.seconds){if(job.action==='observe'){this.lastObservation=observeSurroundings(this.garden,this);this.log('observation',{status:'observed',observation:this.lastObservation,outcome:'Observed '+this.lastObservation.objects.length+' nearby objects and '+this.lastObservation.characters.length+' other characters within 6m'});this.actionDone(true,'Observed surroundings: '+this.lastObservation.objects.map(o=>o.name+' '+o.distance.toFixed(1)+'m').join(';'));this.nextReflection=0;return;}if(job.action==='inspect'){try{validateAction(this.garden,this,job);this.lastInspection={...objectInfo(this.garden,job.target),observedAt:this.time};const info=this.lastInspection;this.log('inspection',{status:'observed',object:info,outcome:info.name+': '+info.description+' Verified uses: '+info.affordances.join(', ')});this.actionDone(true,'Inspected '+info.name+': '+info.description+' Supported uses: '+info.affordances.join(', '));this.nextReflection=0;}catch(error){this.actionDone(false,error.message);}return;}this.actionDone(true,`${job.action} completed for ${job.seconds} seconds`);}
      return;
    }
    super.step(dt);
    if(this.stage==='queued'&&this.garden.printerOwner===this.actorId){this.actor.goal={x:PRINTER.approach.x,z:PRINTER.approach.z};this.stage='approaching';}
    if(['placement','placing','settling','use','interacting','complete','failed'].includes(this.stage)&&this.garden.printerOwner===this.actorId)this.garden.releasePrinter(this.actorId);
    if((this.printJob||this.useJob)&&['complete','failed'].includes(this.stage)){const result=this.result;this.printJob=false;this.useJob=false;this.actionDone(this.stage==='complete',result?.description||this.error||'Nested action failed');}
  }
  actionDone(ok,outcome){const job=this.job;if(!job){this.printJob=false;this.useJob=false;return;}if(['move','approach','place'].includes(job.action))job.navigationDestination=this.actor.goal?{...this.actor.goal}:Number.isFinite(job.x)&&Number.isFinite(job.z)?{x:job.x,z:job.z}:null;if(ok&&['rest','dance'].includes(job.action))this.completeAccommodation(job.action,Math.min(job.seconds,this.time-job.start));if(ok&&job.action==='eat'&&job.consumedServings===1)this.completeAccommodation('eat',this.time-job.start);if(job.target&&!this.physics.entities.has(job.target)){delete this.garden.designs[job.target];for(const brain of this.garden.brains.values())delete brain.designs[job.target];}const outcomeRecord=this.log('action_outcome',{scope:'activity',goalSource:this.goalSource,status:ok?'completed':'failed',action:job.action,use:job.use||null,target:job.target,targetReference:job.targetReference||null,jobStart:job.start,startPosition:job.startPosition,endPosition:{...this.actor.body.translation()},destination:Number.isFinite(job.x)&&Number.isFinite(job.z)?{x:job.x,z:job.z}:null,createdEntityId:job.createdEntityId||null,creationRecordId:job.creationRecordId||null,needFulfillment:job.needFulfillment||null,executionStarted:job.executionStarted!==false,outcome});this.event(outcome,ok?'completed':'failed');this.pendingReflection=ok?'An action completed':'An action failed: '+outcome;if(job?.target)this.garden.reservations.delete(job.target);this.actor.activity=null;this.actor.actionProgress=0;this.actor.goal=null;this.job=null;
    if(!ok){if(this.recoverNavigation(job,outcome,outcomeRecord.id))return;this.stage='failed';this.error=outcome;this.goalReadyAt=this.time+15;return;}if(job?.advance){this.pendingStepEvidence={stepIndex:this.planIndex,step:structuredClone(this.planSteps[this.planIndex]),job:structuredClone(job),outcome,recordId:outcomeRecord.id,completedAt:this.time};this.verificationAttempts=0;this.stage='awaiting_step_done';return;}else this.alternatives=(this.alternatives||0)+1;if(this.hasStepEvidence()){this.stage='awaiting_step_done';return;}
    if(this.alternatives>=2&&this.stage!=='failed'&&this.planIndex<this.planSteps.length){this.stallReplans=(this.stallReplans||0)+1;if(this.stallReplans<=2){this.stage='action_plan';this.planError='Recent actions did not advance the objective. Propose only relevant feasible actions using recorded outcomes.';this.alternatives=0;return;}}
    if(this.alternatives>4){this.stage='failed';this.error='Action budget reached without finishing the proposed plan';return;}
    this.stage='action_decide';if(this.planIndex>=this.planSteps.length)this.finishPlan();
  }
  recoverNavigation(job,outcome,recordId){
    if(!['move','approach','place'].includes(job.action)||!this.planSteps[this.planIndex]||(this.navigationRecoveries||0)>=2)return false;
    const destination=job.navigationDestination;let destinationCheck=null;
    if(destination&&this.physics.groundMoveDestination)try{destinationCheck=this.physics.groundMoveDestination(destination,this.actorId);}catch(error){destinationCheck={error:error.message};}
    const blocker=destinationCheck?.blocker||null;
    this.navigationRecoveries=(this.navigationRecoveries||0)+1;
    this.navigationFailure={recordId,attempt:this.navigationRecoveries,action:job.action,target:job.target||null,destination,position:{...this.actor.body.translation()},reason:outcome,blocker,destinationCheck};
    const correction=blocker?` Requested destination is blocked by ${blocker.name}${blocker.id?' ('+blocker.id+')':''}. Use approach(target id) for furniture; do not move into its solid center.`:' Reconsider the blocked route using current positions and clear ground waypoints; use approach(target id) when interacting with furniture.';
    this.planError=`Navigation recovery ${this.navigationRecoveries}/2 after failed ${job.action}: ${outcome}.${correction} Preserve the verified prefix and replan only the remaining objective.`;
    this.error=outcome;this.pendingStepEvidence=null;this.planAttempts=0;this.alternatives=0;this.stage='action_plan';this.revision++;
    this.log('navigation_recovery',{source:'engine',scope:'activity',status:'requested',...this.navigationFailure,correction:this.planError});return true;
  }
  completeAccommodation(kind,elapsed){
    const job=this.job;if(!job||job.needFulfillment)return false;
    const expected=job.action==='use'?{rest:'sleep',sit:'sit',wash:'wash'}[job.use]:job.action;
    if(kind!==expected||!['eat','rest','sleep','sit','wash','dance'].includes(kind))throw Error('Need fulfillment does not match the current physical action');
    if(kind==='eat'&&job.consumedServings!==1)throw Error('Eating fulfillment requires one actually consumed serving');
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>this.time-job.start+.05)throw Error('Need fulfillment requires actual elapsed action time');
    if(elapsed===0)return false;
    const before={...this.needs};fulfillNeed(this,kind,elapsed);job.needFulfillment={kind,elapsed,before,after:{...this.needs}};return true;
  }
  resumeSuspendedGoal(ok,reason=''){
    const saved=this.suspendedGoal;if(!saved)return false;
    this.garden.cancelReservations(this.actorId);this.suspendedGoal=null;Object.assign(this,saved);this.job=null;this.printJob=false;this.useJob=false;this.pendingStepEvidence=null;this.error=null;this.planError=null;this.planAttempts=0;this.verificationAttempts=0;this.selfGoalProposal=saved.selfGoalProposal||null;this.navigationRecoveries=saved.navigationRecoveries||0;this.navigationFailure=saved.navigationFailure||null;this.stage='action_decide';this.revision++;
    if(!ok)this.needInterruptCooldownUntil=this.time+60;
    this.log('goal',{scope:'goal',status:'resumed',outcome:(ok?'Critical need addressed':'Need interruption failed: '+reason)+'; resumed user goal: '+this.objective});return true;
  }
  finishPlan(){if(this.suspendedGoal){this.resumeSuspendedGoal(true);return;}this.goalReadyAt=this.time+12;this.stage='complete';this.result={ok:true,description:'Planned actions completed with engine outcome checks. Open-ended visual intent remains inspectable.',time:this.time,evaluator:'activity plan'};}
  captureUserResult(){if(this.goalSource==='user'&&['complete','failed'].includes(this.stage)){this.lastUserGoal={...this.lastUserGoal,text:this.objective,cycle:this.cycle,status:this.stage==='complete'?'completed':'failed',error:this.stage==='failed'?(this.error||this.result?.description||'Goal remains unfinished'):null,finishedAt:this.time,planSteps:structuredClone(this.planSteps),planIndex:this.planIndex};}}
  snapshot(){return {...super.snapshot(),lastUserGoal:this.lastUserGoal||null,actorId:this.actorId,actorName:this.actorName,goalSource:this.goalSource,needs:this.needs,memory:this.memory,core:this.core,style:this.style,thought:this.thought,job:this.job,planSteps:this.planSteps,planIndex:this.planIndex,stepResults:this.stepResults||{},printIntent:this.printIntent||null,printRequirements:this.printRequirements||[],review:this.review,pendingStepEvidence:this.pendingStepEvidence,verificationAttempts:this.verificationAttempts,navigationRecoveries:this.navigationRecoveries||0,navigationFailure:this.navigationFailure||null,currentChoice:this.choices()};}
}
export class Garden {
  constructor({seed='sunny-17',providers=new Providers(),cast='single',seedFood=true,furnished=false}={}){
    this.seed=seed;this.providers=providers;this.physics=new Physics();this.epoch=Date.now();this.revision=1;this.time=0;this.paused=false;this.speed=1;this.mode='live';this.designs={};this.brains=new Map();this.selectedActor='actor';this.printerOwner=null;this.queue=[];this.reservations=new Map();this.polling=false;this.slots={gemma:false,laya:false};this.inFlight=new Set();this.roundRobin=0;this.reflectionCursor=0;this.actionPolls=0;this.metrics={ticks:0,maxStepMs:0};
    this.cast=cast;if(cast==='ensemble'){this.physics.character('pip',{x:2,y:1.2,z:4});this.physics.character('june',{x:4,y:1.2,z:1});}
    for(const [id,name]of (cast==='ensemble'?[['actor','Butterbot'],['pip','Pip'],['june','June']]:[['actor','Butterbot']])){const e=this.physics.entities.get(id);e.name=name;this.brains.set(id,new ActorBrain(this,id,name));}
    if(seedFood){const food=this.physics.add(foodDesign,{x:-6,y:.5,z:5}),oldId=food.id;this.physics.entities.delete(oldId);food.id='berries';food.edible=true;food.servings=3;this.physics.entities.set(food.id,food);this.physics.proxies.set(food.id,this.physics.proxies.get(oldId));this.physics.proxies.delete(oldId);this.designs.berries=foodDesign;}
    this.accommodationsInstalled=false;if(furnished)this.ensureAccommodations();
  }
  ensureAccommodations(){
    if(this.accommodationsInstalled)return [];
    const added=[];
    for(const {id,design,position}of accommodationItems){
      if(this.physics.entities.has(id))continue;
      const e=this.physics.add(structuredClone(design),position),oldId=e.id,proxy=this.physics.proxies.get(oldId);
      this.physics.entities.delete(oldId);this.physics.proxies.delete(oldId);e.id=id;this.physics.entities.set(id,e);if(proxy)this.physics.proxies.set(id,proxy);this.designs[id]=e.design;added.push(id);
    }
    this.accommodationsInstalled=true;return added;
  }
  get selected(){return this.brains.get(this.selectedActor)||this.brains.get('actor');}
  get logs(){return [...this.brains.values()].flatMap(b=>b.logs);}
  get history(){return [...this.brains.values()].flatMap(b=>b.history);}
  reservePrinter(id){if(this.printerOwner===id)return true;if(!this.printerOwner){this.printerOwner=id;return true;}if(!this.queue.includes(id))this.queue.push(id);return false;}
  releasePrinter(id){if(this.printerOwner!==id)return;this.printerOwner=this.queue.shift()||null;}
  cancelReservations(id){this.queue=this.queue.filter(x=>x!==id);this.releasePrinter(id);for(const [object,owner]of this.reservations)if(owner===id)this.reservations.delete(object);}
  assign(id,objective){if(this.providers.generatorAbort&&(this.providers.generatorOwner===id||this.providers.generatorPurpose==='reflection'))this.providers.generatorAbort.abort('Superseded by a user goal');const b=this.brains.get(id);if(!b)throw Error('Unknown controllable character');b.assign(objective);this.revision++;}
  event(text,kind){this.selected.event(text,kind);}
  interrupt(id,reason){const b=this.brains.get(id);if(!b)return;b.revision++;b.stage='suspended';b.error=reason;b.actor.goal=null;b.actor.activity=null;this.cancelReservations(id);b.event(reason,'observer');}
  invalidateObject(id){for(const b of this.brains.values()){b.revision++;if(b.activeId===id||b.job?.target===id||b.actorId===id||this.physics.entities.get(id)?.carrier===b.actorId)this.interrupt(b.actorId,'Autonomy suspended by direct manipulation. Resume replans from current state.');}}
  step(dt=1/60){if(this.paused)return;this.time+=dt;this.physics.step(dt);for(const b of this.brains.values()){b.paused=false;b.speed=this.speed;b.mode=this.mode;b.step(dt);const target=this.physics.entities.get(b.job?.target);b.actor.lookPoint=objectInfo(this,b.job?.target)?.position|| (target?this.physics.position(target):['question','printing','review'].includes(b.stage)?PRINTER.center:null);if(b.job?.action==='observe'){const p=b.actor.body.translation();b.actor.lookPoint={x:p.x+Math.sin(b.time*2)*2,z:p.z+Math.cos(b.time*2)*2};}b.actor.speaking=!!b.thought&&b.time-b.thought.time<6;if(['question','needs_question','review','preview','printing','needs_design'].includes(b.stage)){b.actor.activity='print';b.actor.heading=PRINTER.heading;b.actor.lookPoint={...PRINTER.keyboard,y:1.8};}Object.assign(this.designs,b.designs);}this.metrics.ticks++;}
  async poll(){
    if(this.paused)return;if(Date.now()-this.providers.healthTime>30000&&!this.healthPromise){this.healthPromise=this.providers.health().finally(()=>this.healthPromise=null);}
    const all=[...this.brains.values()],jobs=[],activeUser=all.some(b=>b.goalSource==='user'&&!terminal.has(b.stage));
    const order=all.map((b,i)=>({b,i})).sort((a,c)=>((c.b.goalSource==='user'?100:0)-(a.b.goalSource==='user'?100:0))||((a.i-this.roundRobin+all.length)%all.length-(c.i-this.roundRobin+all.length)%all.length));
    const launch=(b,kind,fn,purpose)=>{this.slots[kind]=true;b.dispatched=true;this.providers[kind==='gemma'?'generatorOwner':'layaOwner']=b.actorId;if(kind==='gemma')this.providers.generatorPurpose=purpose;const promise=Promise.resolve().then(fn).catch(error=>b.log('error',{status:'failed',error:error.message})).finally(()=>{this.slots[kind]=false;b.dispatched=false;this.inFlight.delete(promise);});this.inFlight.add(promise);jobs.push(promise);this.roundRobin=(all.indexOf(b)+1)%all.length;};
    for(const {b}of order){if(b.busy||b.dispatched||Date.now()<b.nextCall||b.paused||this.mode==='manual')continue;const kind=['action_plan','planning','needs_question','needs_design','verify_step'].includes(b.stage)?'gemma':b.stage==='goal_select'||b.stage==='action_decide'||b.stage==='awaiting_step_done'||b.choices()?'laya':null;if(!kind||this.slots[kind])continue;if(kind==='gemma'&&!this.providers.generator.ready)continue;if(kind==='laya'&&!this.providers.laya.ready)continue;launch(b,kind,()=>b.poll(),'action');}
    if(this.mode!=='manual'&&!this.slots.gemma&&this.providers.generator.ready){for(const {b}of order){if(b.busy||b.dispatched||b.paused||Date.now()<b.nextReflection)continue;const explicit=b.stage==='reflecting',blocked=b.stage==='failed'&&b.pendingReflection;if(!explicit&&!blocked&&activeUser)continue;launch(b,'gemma',()=>b.reflect(b.pendingReflection||'Reflect on current circumstances'),explicit?'escalation':'reflection');break;}}
    await Promise.allSettled(jobs);
  }
  snapshot(){const s=this.selected.snapshot();return {...s,worldObjects:worldObjects(this),lastInspection:this.selected.lastInspection||null,lastObservation:this.selected.lastObservation||null,schema:2,build:'2026-09-25.13',seed:this.seed,epoch:this.epoch,revision:this.revision,time:this.time,control:{paused:this.paused,speed:this.speed,mode:this.mode},metrics:this.metrics,actors:[...this.brains.values()].map(b=>({id:b.actorId,name:b.actorName,objective:b.objective,stage:b.stage,needs:b.needs})),selectedActor:this.selectedActor,printer:{owner:this.printerOwner,queue:this.queue},actions:feasibleActions(this,this.selected),inference:{...s.inference,activeRequests:Object.values(this.providers.activeRequests||{}),busy:this.selected.busy,label:this.selected.busyLabel||''}};}
  save(){const fields=['actorName','objective','interaction','kind','answers','question','questionTopics','material','stage','activeId','result','repairCount','cycle','revision','time','tokens','logs','history','events','nextLog','pendingDesign','review','reviewAttempts','planSteps','planIndex','stepResults','printIntent','printRequirements','job','placement','stageUntil','useStart','printJob','useJob','goalReadyAt','nextReflection','pendingReflection','needs','goalSource','goalReadyAt','suspendedGoal','exploreIndex','reflectionChoices','stallReplans','memory','memorySerial','memoryClock','lastEvictions','style','thought','pendingStepEvidence','verificationAttempts','lastInspection','lastObservation','lastUserGoal','washStarted','washArrivalStart','plans','plan','alternatives','error','selfGoalProposal','needInterruptCooldownUntil','navigationRecoveries','navigationFailure','planError','planAttempts'];return {version:2,accommodationsInstalled:this.accommodationsInstalled,world:this.snapshot(),designs:this.designs,brains:[...this.brains.values()].map(b=>({id:b.actorId,...Object.fromEntries(fields.map(k=>[k,b[k]]))})),printerOwner:this.printerOwner,queue:this.queue,reservations:[...this.reservations]};}
  restore(data){
    const old=data.world;if(!old)return;this.accommodationsInstalled=!!data.accommodationsInstalled;for(const {id}of accommodationItems)if(this.physics.entities.get(id)?.design.source==='authored accommodation'&&!old.entities?.some(e=>e.id===id)){this.physics.remove(id);delete this.designs[id];}this.seed=old.seed||this.seed;this.time=old.time||0;this.designs={...this.designs,...data.designs};
    for(const saved of old.entities||[]){let e=this.physics.entities.get(saved.id);if(this.cast==='single'&&['pip','june'].includes(saved.id))continue;if(!e&&this.designs[saved.id]){e=this.physics.add(this.designs[saved.id],saved.position);if(e.id!==saved.id){const proxy=this.physics.proxies.get(e.id);this.physics.proxies.delete(e.id);this.physics.entities.delete(e.id);e.id=saved.id;if(proxy)this.physics.proxies.set(e.id,proxy);this.physics.entities.set(saved.id,e);}this.physics.serial=Math.max(this.physics.serial,Number(saved.id.split('-')[1])||0);}if(!e)continue;e.owner=saved.owner||'actor';e.stored=saved.stored||0;if(saved.edible||e.edible){e.edible=!!saved.edible;e.servings=saved.servings??e.servings??0;}e.travel=saved.travel||0;if(e.body){e.body.setTranslation(saved.position,true);e.body.setRotation(saved.rotation,true);e.body.setLinvel(saved.velocity||{x:0,y:0,z:0},true);e.rig?.resetAt(saved.position);}if(e.soft&&saved.softPositions?.length===this.physics.softPositions(e).length){const nodes=e.soft.get_m_nodes();for(let i=0;i<nodes.size();i++){const p=nodes.at(i).get_m_x();p.setX(saved.softPositions[i*3]);p.setY(saved.softPositions[i*3+1]);p.setZ(saved.softPositions[i*3+2]);}}}
    if(data.brains){for(const saved of data.brains){if(this.cast==='single'&&saved.id!==(old.selectedActor||'actor'))continue;const b=this.brains.get(this.cast==='single'?'actor':saved.id);if(!b)continue;Object.assign(b,saved);b.needs=lifeNeeds(saved.needs);b.revision++;b.busy=false;b.nextCall=0;b.designs=this.designs;if(this.cast==='single'){b.actorId='actor';const name=saved.actorName||old.entities?.find(e=>e.id===(old.selectedActor||'actor'))?.name||b.actorName;b.actorName=name==='Agent Wobble'?'Butterbot':name;b.actor.name=b.actorName;b.core=Object.freeze({...b.core,name:b.actorName});b.style=b.core.style;}if(!saved.goalSource||(saved.goalSource==='self'&&!saved.logs?.some(l=>l.scope==='goal'&&l.selected===saved.objective)&&!/^Find |^Choose a goal/.test(saved.objective))){b.goalSource='user';if(b.stage==='failed'){b.stage='action_plan';b.error=null;b.planAttempts=0;}}this.selectedActor=this.cast==='single'?'actor':old.selectedActor||'actor';if(['idle','suspended'].includes(b.stage)){if(/^Choose a goal for/.test(b.objective)){b.stage='goal_select';b.goalSource='self';b.objective='Find something worthwhile to do in the garden.';}else{b.stage='action_plan';b.goalSource='user';b.error=null;}}if(b.stage==='reflecting'){b.pendingReflection='Continue interrupted reflection';b.nextReflection=0;}if(b.job?.action==='use'&&b.job.use==='wash'&&b.stage==='interacting'){b.washStarted=false;b.washArrivalStart=b.time;b.actor.washing=null;}}}
    else {const b=this.brains.get('actor');for(const k of ['time','objective','interaction','kind','answers','logs','history','events','cycle','activeId','result'])if(old[k]!==undefined)b[k]=old[k];b.nextLog=1+Math.max(0,...b.logs.map(l=>Number(l.id.split('-').at(-1))||0));b.tokens=old.entities?.reduce((n,e)=>n-(e.stored||0),3)??3;b.stage='suspended';b.error='Scene preserved during upgrade. Resume this goal to use the new general activity loop.';}
    if(this.cast==='single'){const source=old.entities?.find(e=>e.id===(old.selectedActor||'actor'));if(source){this.physics.actor.body.setTranslation(source.position,true);this.physics.actor.rig.resetAt(source.position);}}
    for(const saved of old.entities||[]){const e=this.physics.entities.get(saved.id);if(!e)continue;e.goal=saved.goal||null;e.heading=saved.heading||0;e.followId=saved.followId||null;if(e.vehicle&&saved.drive)e.drive=saved.drive;if(e.controller){e.mounted=saved.mounted||null;e.seated=saved.seated||false;e.reclining=saved.reclining||false;if(e.mounted||e.reclining||e.seated)e.collider.setEnabled(false);}if(saved.broken&&!e.broken&&e.kind==='breakable'){this.physics.break(e);for(const f of e.fragments){const was=saved.fragments?.find(x=>x.mesh===f.mesh);if(was){f.body.setTranslation(was.position,true);f.body.setRotation(was.rotation,true);}}}if(e.soft&&saved.softRest){e.rest=saved.softRest;e.position=saved.softOrigin||e.position;e.indices=saved.softIndices||e.indices;}if(saved.carried&&!(this.cast==='single'&&saved.carrier!==(old.selectedActor||'actor'))){try{this.physics.carry(e.id,this.cast==='single'?'actor':saved.carrier||'actor');}catch(error){const b=this.brains.get(saved.carrier||'actor');if(b){b.stage='action_plan';b.error='Replanning after restored grip: '+error.message;}}}}
    if(this.cast==='single'){const selected=old.selectedActor||'actor',source=old.entities?.find(e=>e.id===selected),actor=this.physics.actor;if(source&&selected!=='actor'){actor.body.setTranslation(source.position,true);actor.rig.resetAt(source.position);actor.goal=source.goal||null;actor.heading=source.heading||0;actor.mounted=source.mounted||null;actor.seated=source.seated||false;actor.reclining=source.reclining||false;if(actor.mounted||actor.reclining||actor.seated)actor.collider.setEnabled(false);}this.printerOwner=data.printerOwner===selected?'actor':null;this.queue=[];this.reservations=new Map((data.reservations||[]).filter(([id,owner])=>owner===selected).map(([id])=>[id,'actor']));for(const e of this.physics.entities.values()){if(e.owner===selected)e.owner='actor';if(e.followId&&['pip','june'].includes(e.followId))e.followId=e.followId===selected?'actor':null;}if(this.selected.stage==='queued')this.printerOwner='actor';}else{this.printerOwner=data.printerOwner||null;this.queue=data.queue||[];this.reservations=new Map(data.reservations||[]);}
    for(const b of this.brains.values()){if(b.stage==='approaching'||b.stage==='acting'&&b.job?.action==='approach'&&b.job.target==='printer')b.actor.goal={x:PRINTER.approach.x,z:PRINTER.approach.z};}
    // Heading and posture must be restored before placing the connected limbs.
    // No physics frame may run with an upright rig inside a reclining body.
    for(const entity of this.physics.entities.values())entity.rig?.resetAt(entity.body.translation());
    this.mode=old.control?.mode||'live';this.paused=old.control?.paused||false;
  }
}







