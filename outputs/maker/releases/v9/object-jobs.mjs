import {validateAction} from './actions.mjs';
const durations={pick_up:1.1,drop:.9,throw:1.2,push:1.8,give:1.4,eat:3};
export function beginObjectJob(brain,action){if(!(action.action in durations))return false;const job=brain.job;job.seconds=durations[action.action];job.effectApplied=false;job.objectName=brain.physics.entities.get(action.target)?.design?.name||'object';brain.actor.actionProgress=0;const target=brain.physics.entities.get(action.action==='give'?action.recipient:action.target);if(target){const p=brain.physics.position(target),a=brain.actor.body.translation();brain.actor.heading=Math.atan2(p.x-a.x,p.z-a.z);brain.actor.lookPoint=p;}return true;}
export function tickObjectJob(brain,job){if(!(job.action in durations))return false;const elapsed=brain.time-job.start,progress=Math.min(1,elapsed/job.seconds);brain.actor.actionProgress=progress;
  try{
    if(job.action==='eat'&&!job.foodHeld&&progress>.15){const e=brain.physics.entities.get(job.target);validateAction(brain.garden,brain,job);if(!e.carried&&!([...brain.physics.entities.values()].some(x=>x.carrier===brain.actorId))){try{brain.physics.carry(e.id,brain.actorId);job.foodHeld=true;}catch{job.foodHeld=true;}}else job.foodHeld=true;}
    if(!job.effectApplied&&progress>=(job.action==='eat'?1:.52)){
      validateAction(brain.garden,brain,job);const e=brain.physics.entities.get(job.target);job.effectApplied=true;
      if(job.action==='pick_up'){brain.physics.carry(e.id,brain.actorId);job.effectOutcome='Picked up '+job.objectName;}
      if(job.action==='drop'){brain.physics.release(e.id);job.effectOutcome='Released '+job.objectName+' to fall under gravity';}
      if(job.action==='throw'){const result=brain.physics.throwObject(e.id,brain.actorId,job);job.effectOutcome='Threw '+job.objectName+' at '+Number(result?.speed??job.speed).toFixed(1)+' m/s within its limit';job.effectResult=result;}
      if(job.action==='push'){job.pushStart={...brain.physics.position(e)};job.effectResult=brain.physics.pushObject(e.id,brain.actorId,job);job.effectOutcome='Pushed '+job.objectName;}
      if(job.action==='give'){const recipient=brain.physics.entities.get(job.recipient);brain.physics.giftObject(e.id,brain.actorId,job.recipient);job.effectOutcome='Gave '+job.objectName+' to '+(recipient.name||recipient.design?.name||recipient.id);}
      if(job.action==='eat'){e.servings--;brain.needs.hunger=Math.max(0,brain.needs.hunger-25);job.effectOutcome='Consumed one edible serving of '+job.objectName+'; '+e.servings+' remain';if(e.servings===0&&e.id!=='berries'){brain.physics.remove(e.id);delete brain.garden.designs[e.id];}else if(e.carrier===brain.actorId)brain.physics.release(e.id);}
    }
    if(progress>=1){if(job.action==='push'){const p=brain.physics.position(brain.physics.entities.get(job.target)),moved=Math.hypot(p.x-job.pushStart.x,p.z-job.pushStart.z);if(moved<.025)throw Error('The push was blocked; the object did not move');job.effectOutcome+='; it moved '+moved.toFixed(2)+' m';}brain.actor.actionProgress=0;brain.actionDone(true,job.effectOutcome||'Object interaction completed');}
  }catch(error){brain.actor.actionProgress=0;brain.actionDone(false,error.message);}return true;
}
