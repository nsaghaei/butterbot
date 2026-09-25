import {conciseWorld} from './actions.mjs';
import {lifeNeeds} from './needs.mjs';
import {updateMemory} from './memory.mjs';

const terminal=new Set(['complete','declined','canceled']);
const flatDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const clone=value=>structuredClone(value);
const critical=brain=>brain.needs?.energy<=15||brain.needs?.hunger>=90;
const publicActor=brain=>({id:brain.actorId,name:brain.actorName,style:brain.style||brain.core?.style||'',position:{...brain.actor.body.translation()}});
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};

// The Garden owns inference slots and time. A session owns only its two participants;
// it never aborts a provider's shared request or advances a verified plan itself.
export class SocialSessions {
  constructor(garden){this.garden=garden;this.sessions=new Map();this.members=new Map();this.waiters=new Map();this.history=[];this.nextId=1;this.pauseStartedAt=null;}
  setPaused(paused){
    const now=Date.now();
    if(paused){if(this.pauseStartedAt!==null)return false;this.pauseStartedAt=now;return true;}
    if(this.pauseStartedAt===null)return false;
    // An in-flight response can begin a new phase during a pause. Exclude only
    // that phase's paused portion, not time belonging to its predecessor.
    for(const session of this.sessions.values())session.phaseStartedAt+=Math.max(0,now-Math.max(this.pauseStartedAt,session.phaseStartedAt));
    this.pauseStartedAt=null;return true;
  }
  forActor(id){return this.sessions.get(this.members.get(id))||null;}
  waitingForActor(id){return this.sessions.get(this.waiters.get(id))||null;}
  _brain(id){return this.garden.brains.get(id);}
  _real(brain){return !!brain&&this._brain(brain.actorId)===brain&&this.garden.physics.entities.get(brain.actorId)===brain.actor&&!!brain.actor?.controller;}
  _partnerFree(brain){
    if(!this._real(brain)||brain.busy||brain.dispatched||brain.job||brain.pendingStepEvidence||critical(brain)||brain.actor.mounted)return false;
    if(['idle','complete'].includes(brain.stage))return true;
    return brain.goalSource==='self'&&['goal_select','action_plan'].includes(brain.stage);
  }
  available(brain,targetId){
    const partner=this._brain(targetId);
    return this.canRequest(brain,targetId)&&this._partnerFree(partner);
  }
  _canWaitFor(partner){return this._real(partner)&&!critical(partner)&&(this._partnerFree(partner)||partner.goalSource==='self'&&partner.stage!=='suspended');}
  canRequest(brain,targetId){
    return !!(this._real(brain)&&brain.actorId!==targetId&&!this.forActor(brain.actorId)&&!this.forActor(targetId)&&!this.waitingForActor(brain.actorId)&&!this.waitingForActor(targetId)&&!critical(brain)&&!brain.actor.mounted&&this._canWaitFor(this._brain(targetId)));
  }
  begin(initiator,targetId){
    if(!this.canRequest(initiator,targetId))throw Error('That character is not available for conversation right now');
    const partner=this._brain(targetId),ready=this._partnerFree(partner),participants=[initiator.actorId,targetId],session={
      id:'social-'+this.nextId++,initiatorId:initiator.actorId,partnerId:targetId,participants,
      phase:ready?'invited':'waiting',heldParticipants:ready?[...participants]:[initiator.actorId],revisions:Object.fromEntries(participants.map(id=>[id,this._brain(id).revision])),
      cycles:Object.fromEntries(participants.map(id=>[id,this._brain(id).cycle])),
      createdAt:this.garden.time||0,elapsed:0,phaseElapsed:0,phaseStartedAt:Date.now(),
      topic:String(initiator.job?.text||initiator.objective||'The garden and our current surroundings').slice(0,240),
      transcript:[],participation:Object.fromEntries(participants.map(id=>[id,0])),effectsApplied:false,
      needChanges:null,outcome:null,reason:null,speakerId:null,speech:null,request:null,
      initiatorJob:initiator.job,accepted:false
    };
    this.sessions.set(session.id,session);
    // A busy peer remains outside the session hold so its current physical job and
    // verification can finish. One incoming queue per peer prevents reciprocal waits.
    for(const id of session.heldParticipants)this.members.set(id,session.id);
    if(!ready)this.waiters.set(targetId,session.id);
    this._log(session,session.phase);return session;
  }
  _current(session){
    return this.sessions.get(session.id)===session&&!terminal.has(session.phase)&&session.participants.every(id=>{
      const brain=this._brain(id);
      if(session.phase==='waiting'&&id===session.partnerId)return this.waiters.get(id)===session.id&&!this.forActor(id)&&this._canWaitFor(brain);
      return this._real(brain)&&brain.revision===session.revisions[id]&&brain.cycle===session.cycles[id];
    });
  }
  _changePhase(session,phase){session.phase=phase;session.phaseElapsed=0;session.phaseStartedAt=Date.now();}
  _log(session,status,extra={}){
    for(const id of session.participants)this._brain(id)?.log?.('social',{status,sessionId:session.id,participants:[...session.participants],transcript:clone(session.transcript),...extra});
  }
  _near(session){
    const a=this._brain(session.initiatorId)?.actor,b=this._brain(session.partnerId)?.actor;if(!a||!b)return false;
    const p=a.body.translation(),q=b.body.translation();
    return !a.mounted&&!b.mounted&&!a.seated&&!b.seated&&!a.reclining&&!b.reclining&&flatDistance(p,q)>=1.1&&Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<=2.7;
  }
  _face(session){
    for(const id of session.participants){const brain=this._brain(id),partner=this._brain(session.participants.find(other=>other!==id)),p=brain.actor.body.translation(),q=partner.actor.body.translation();
      if(!brain.actor.goal)brain.actor.heading=Math.atan2(q.x-p.x,q.z-p.z);
      brain.actor.lookPoint={x:q.x,y:q.y+(partner.actor.height||2.3)*.37,z:q.z};
      brain.actor.speaking=session.phase==='speaking'&&session.speakerId===id&&!!session.speech?.started;
      brain.actor.activity=brain.actor.speaking?'speak':session.phase==='speaking'?'listen':null;
      brain.actor.actionProgress=session.phase==='speaking'?clamp(session.speech.elapsed/session.speech.duration,0,1):0;
    }
  }
  _approach(session){
    const physics=this.garden.physics,initiator=this._brain(session.initiatorId),partner=this._brain(session.partnerId);
    for(const brain of [initiator,partner]){physics.standUp(brain.actorId);brain.actor.goal=null;brain.actor.route=null;brain.actor.speaking=false;}
    const here=initiator.actor.body.translation(),center=partner.actor.body.translation(),gap=flatDistance(here,center);
    if(gap>=1.6&&gap<=2.4&&this._near(session)&&physics.groundMoveDestination(here,initiator.actorId).clear){this._changePhase(session,'generating');return;}
    const angle=Math.atan2(here.x-center.x,here.z-center.z),candidates=[];
    for(const radius of [2,2.3,1.7])for(let i=0;i<16;i++){
      const direction=angle+i*Math.PI/8,point={x:center.x+Math.sin(direction)*radius,z:center.z+Math.cos(direction)*radius};
      if(physics.groundMoveDestination(point,initiator.actorId).clear)candidates.push({point,cost:flatDistance(point,here)+Math.abs(radius-2)});
    }
    candidates.sort((a,b)=>a.cost-b.cost);
    // Bound route work, including an enclosed partner: at most six 500-node searches.
    const destination=candidates.slice(0,6).find(({point})=>physics.planGroundRoute(initiator.actorId,point,{maxNodes:500}).ok)?.point;
    if(!destination)throw Error('No clear reachable place to stand near the conversation partner');
    session.destination={...destination};initiator.actor.goal={...destination};this._changePhase(session,'approaching');
  }
  nextRequest(){
    if(this.garden.paused||this.pauseStartedAt!==null)return null;
    for(const session of this.sessions.values()){
      if(!this._current(session)){this._finish(session,'canceled','Conversation participants changed');continue;}
      if(session.request||!['invited','generating'].includes(session.phase))continue;
      const acceptance=session.phase==='invited',brain=this._brain(acceptance?session.partnerId:session.participants[session.transcript.length]);
      if(!brain||brain.busy||brain.dispatched)continue;
      // Merely looking for work does not claim it; the scheduler may have a busy slot.
      const turnIndex=session.transcript.length;
      return {brain,kind:acceptance?'laya':'gemma',purpose:acceptance?'social acceptance':'social turn',run:()=>this._run(session,brain,acceptance,turnIndex)};
    }
    return null;
  }
  async _run(session,brain,acceptance,turnIndex){
    const phase=acceptance?'invited':'generating';
    if(this.garden.paused||this.pauseStartedAt!==null||!this._current(session)||session.phase!==phase||session.request||session.transcript.length!==turnIndex)return;
    const token={},oldBusy=brain.busy,oldLabel=brain.busyLabel,label=acceptance?'Considering a conversation':'Preparing a conversation turn';session.request=token;brain.socialRequestOwner=token;brain.busy=true;brain.busyLabel=label;
    try{
      const partner=this._brain(session.participants.find(id=>id!==brain.actorId));
      let generated;
      if(acceptance){
        // The scheduler marks this brain dispatched before run; eligibility was checked
        // before dispatch and is checked again here without treating our own flags as work.
        if(brain.job||brain.pendingStepEvidence||critical(brain)||brain.actor.mounted||(!['idle','complete'].includes(brain.stage)&&!(brain.goalSource==='self'&&['goal_select','action_plan'].includes(brain.stage))))throw Error('Conversation partner is no longer available');
        generated=await this.garden.providers.socialAcceptance(brain,publicActor(partner),{id:session.id,sessionId:session.id,topic:session.topic});
      }else{
        if(!this._near(session))throw Error('Conversation partners separated before a turn');
        generated=await this.garden.providers.socialTurn(brain,{sessionId:session.id,partner:publicActor(partner),topic:session.topic,transcript:clone(session.transcript),world:conciseWorld(this.garden,brain)});
      }
      if(!this._current(session)||session.request!==token||session.phase!==phase||session.transcript.length!==turnIndex)return;
      if(session.participants.some(id=>critical(this._brain(id))))throw Error('A participant needs urgent food or rest');
      if(!acceptance&&!this._near(session))throw Error('Conversation partners separated while preparing a turn');
      brain.log?.('social_model',{status:'completed',source:acceptance?'laya':'gemma',sessionId:session.id,purpose:acceptance?'acceptance':'turn',...generated});
      if(acceptance){
        const choice=generated.choice??generated.response?.choice;
        if(choice==='decline'){this._finish(session,'declined',partner.actorName+' invited '+brain.actorName+', who declined');return;}
        if(choice!=='accept')throw Error('Conversation acceptance must be accept or decline');
        session.accepted=true;this._log(session,'accepted');
        if(this.garden.paused||this.pauseStartedAt!==null){session.needsApproach=true;this._changePhase(session,'approaching');}else this._approach(session);
      }else{
        const value=generated.value;if(typeof value?.speech!=='string'||!value.speech.trim()||value.speech.length>180||!Array.isArray(value.memory)||value.memory.length>2)throw Error('Invalid bounded conversation turn');
        // Validate against this speaker's private IDs without applying an undelivered memory.
        updateMemory({...brain,memory:clone(brain.memory)},value.memory);
        session.speakerId=brain.actorId;session.speech={speakerId:brain.actorId,speakerName:brain.actorName,text:value.speech.trim(),duration:clamp(value.speech.trim().length/25,2,6),elapsed:0,started:false,memory:clone(value.memory)};
        this._changePhase(session,'speaking');
      }
    }catch(error){
      if(this._current(session)&&session.request===token){brain.log?.('social_model',{status:'failed',sessionId:session.id,error:error.message,diagnostics:error.diagnostics||null});this._finish(session,'canceled','Conversation could not continue: '+error.message);}
    }finally{
      if(session.request===token)session.request=null;
      if(brain.socialRequestOwner===token){delete brain.socialRequestOwner;if(brain.busyLabel===label){brain.busy=oldBusy;brain.busyLabel=oldLabel;}}
    }
  }
  tick(dt){
    if(!Number.isFinite(dt)||dt<0)throw Error('Social elapsed time must be finite and nonnegative');
    if(this.garden.paused||this.pauseStartedAt!==null)return;
    for(const session of [...this.sessions.values()]){
      if(!this._current(session)){this._finish(session,'canceled','Conversation participants changed');continue;}
      if(session.participants.some(id=>critical(this._brain(id)))){this._finish(session,'canceled','A participant needs urgent food or rest');continue;}
      session.elapsed+=dt;session.phaseElapsed+=dt;
      if(session.elapsed>600||session.phaseElapsed>240||Date.now()-session.phaseStartedAt>300000){this._finish(session,'canceled','Conversation timed out');continue;}
      if(session.phase==='waiting'){
        if(session.phaseElapsed>=45){this._finish(session,'canceled','The conversation partner did not become available within 45 seconds');continue;}
        const partner=this._brain(session.partnerId);
        if(this._partnerFree(partner)){
          // No await occurs between checking readiness, capturing the current work
          // revision, and holding the pair for its actual Laya invitation.
          this.waiters.delete(session.partnerId);this.members.set(session.partnerId,session.id);session.heldParticipants.push(session.partnerId);
          session.revisions[session.partnerId]=partner.revision;session.cycles[session.partnerId]=partner.cycle;this._changePhase(session,'invited');this._log(session,'invited');
        }
        this._brain(session.initiatorId).actor.speaking=false;continue;
      }
      if(session.phase==='invited'){for(const id of session.participants)this._brain(id).actor.speaking=false;continue;}
      if(session.needsApproach){
        session.needsApproach=false;
        try{this._approach(session);}catch(error){this._finish(session,'canceled','Conversation could not continue: '+error.message);continue;}
      }
      if(session.phase==='approaching'){
        const actor=this._brain(session.initiatorId).actor;
        if(flatDistance(actor.body.translation(),session.destination)<.2&&this._near(session)){actor.goal=null;actor.route=null;this._changePhase(session,'generating');}
        else if(session.phaseElapsed>35||actor.route?.status==='blocked'&&actor.route.replans>=3){this._finish(session,'canceled','Could not reach the conversation partner');continue;}
      }else if(!this._near(session)){this._finish(session,'canceled','Conversation partners separated');continue;}
      if(session.phase==='speaking'){
        const speech=session.speech,speaker=this._brain(session.speakerId);
        if(!speech.started){speech.started=true;speech.startedAt=this.garden.time||0;speaker.thought={text:speech.text,speech:speech.text,time:speaker.time,duration:speech.duration,sessionId:session.id};}
        const elapsed=Math.min(dt,speech.duration-speech.elapsed);speech.elapsed+=elapsed;
        for(const id of session.participants)session.participation[id]+=elapsed;
        if(speech.elapsed+1e-8>=speech.duration){
          try{updateMemory(speaker,speech.memory);}catch(error){this._finish(session,'canceled','Delivered conversation memory was invalid: '+error.message);continue;}
          session.transcript.push({speakerId:speech.speakerId,speakerName:speech.speakerName,text:speech.text,deliveredAt:this.garden.time||0,duration:speech.duration});
          this._log(session,'delivered',{speakerId:speech.speakerId,text:speech.text,duration:speech.duration});session.speech=null;session.speakerId=null;
          if(session.transcript.length===2){this._complete(session);continue;}
          this._changePhase(session,'generating');
        }
      }
      this._face(session);
    }
  }
  _complete(session){
    if(!this._current(session)||session.effectsApplied||session.transcript.length!==2||!this._near(session))return;
    const seconds=Math.min(10,...session.participants.map(id=>session.participation[id]));
    if(seconds<=0||session.participants.some(id=>!session.transcript.some(turn=>turn.speakerId===id))){this._finish(session,'canceled','Conversation delivery evidence was incomplete');return;}
    const updates=session.participants.map(id=>{const brain=this._brain(id),before=lifeNeeds(brain.needs),after={...before,social:clamp(before.social+4*seconds,0,100),fun:clamp(before.fun+.6*seconds,0,100)};return {brain,before,after};});
    session.needChanges=Object.fromEntries(updates.map(({brain,before,after})=>[brain.actorId,{before,after,delta:{social:after.social-before.social,fun:after.fun-before.fun},seconds}]));
    // Both effects commit synchronously once, after both verified nearby intervals.
    session.effectsApplied=true;for(const {brain,after}of updates)brain.needs=after;
    this._finish(session,'complete','Completed a two-way conversation between '+updates.map(({brain})=>brain.actorName).join(' and '));
  }
  _finish(session,phase,reason){
    if(this.sessions.get(session.id)!==session||terminal.has(session.phase))return;
    const initiator=this._brain(session.initiatorId),sameJob=initiator?.job===session.initiatorJob&&initiator?.job?.action==='socialize'&&initiator.cycle===session.cycles[session.initiatorId];
    // A revision bump can invalidate evidence without replacing the running job.
    // Fail that exact old job rather than leave it stranded in socializing.
    const canFinish=sameJob&&(initiator.revision===session.revisions[session.initiatorId]||phase!=='complete'&&initiator.stage==='socializing');
    this._changePhase(session,phase);session.reason=phase==='complete'?null:reason;session.outcome=reason;session.speech=null;session.speakerId=null;
    if(this.waiters.get(session.partnerId)===session.id)this.waiters.delete(session.partnerId);
    for(const id of session.participants){
      if(this.members.get(id)===session.id){this.members.delete(id);const brain=this._brain(id),actor=brain?.actor||this.garden.physics.entities.get(id);if(actor&&(!brain||brain.revision===session.revisions[id]&&brain.cycle===session.cycles[id]||id===session.initiatorId&&canFinish)){actor.goal=null;actor.route=null;actor.activity=null;actor.actionProgress=0;actor.speaking=false;actor.lookPoint=null;}}
    }
    this.sessions.delete(session.id);this.history.push(this._dto(session));this.history=this.history.slice(-32);
    this._log(session,phase==='complete'?'completed':phase,{outcome:reason,participation:clone(session.participation),needChanges:clone(session.needChanges),effectsApplied:session.effectsApplied});
    if(canFinish){
      initiator.job.socialEvidence=freeze({sessionId:session.id,participants:[...session.participants],accepted:session.accepted,transcript:clone(session.transcript),participation:clone(session.participation),needChanges:clone(session.needChanges),effectsApplied:session.effectsApplied,status:phase==='complete'?'completed':phase,reason:session.reason});
      initiator.actionDone(phase==='complete',reason);
    }
  }
  cancelActor(id,reason='Conversation canceled'){const session=this.forActor(id)||this.waitingForActor(id);if(!session)return false;this._finish(session,'canceled',reason);return true;}
  _dto(session){
    const dto=Object.fromEntries(['id','initiatorId','partnerId','participants','heldParticipants','phase','revisions','cycles','createdAt','elapsed','topic','transcript','participation','effectsApplied','needChanges','outcome','reason','accepted','destination','speakerId'].map(key=>[key,clone(session[key])]));
    dto.speech=session.speech?Object.fromEntries(['speakerId','speakerName','text','duration','elapsed','started'].map(key=>[key,session.speech[key]])):null;return dto;
  }
  snapshot(){return {version:1,nextId:this.nextId,active:[...this.sessions.values()].map(session=>this._dto(session)),history:clone(this.history)};}
  restore(data){
    this.sessions.clear();this.members.clear();this.waiters.clear();this.history=[];this.pauseStartedAt=null;this.nextId=Math.max(1,Number.isSafeInteger(data?.nextId)?data.nextId:1);
    const canceledParticipantIds=new Set(),canceledSessionIds=[],seen=new Set();
    for(const saved of [...(data?.history||[]),...(data?.active||[])]){
      if(!saved?.id||seen.has(saved.id)||!Array.isArray(saved.participants))continue;seen.add(saved.id);
      const session=clone(saved);this.nextId=Math.max(this.nextId,(Number(session.id.replace(/^social-/,''))||0)+1);
      if(!terminal.has(session.phase)){
        const held=session.heldParticipants||(session.phase==='waiting'?[session.initiatorId]:session.participants);
        session.phase='canceled';session.reason='Conversation interrupted by reload';session.outcome=session.reason;session.effectsApplied=false;session.needChanges=null;session.speech=null;session.speakerId=null;canceledSessionIds.push(session.id);
        for(const id of held){canceledParticipantIds.add(id);const actor=this._brain(id)?.actor;if(actor){actor.goal=null;actor.route=null;actor.activity=null;actor.speaking=false;actor.actionProgress=0;actor.lookPoint=null;}}
      }
      this.history.push(session);
    }
    this.history=this.history.slice(-32);return {canceledParticipantIds:[...canceledParticipantIds],canceledSessionIds};
  }
}
