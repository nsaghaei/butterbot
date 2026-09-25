export const NAVIGATION_TOLERANCE=.18;

export function executionEvidence(brain){
  const completion=brain.pendingStepEvidence,record=brain.logs.find(l=>l.id===completion?.recordId&&l.type==='action_outcome');
  if(!record)return {record:null,criteria:null};
  const action=completion.job.action,criteria={action};
  if(['move','approach','place'].includes(action)){
    const destination=record.navigation?.goal||completion.job.navigationDestination;
    criteria.navigation={destination:destination?{...destination}:null,toleranceMeters:NAVIGATION_TOLERANCE,horizontalDistanceAtCompletion:destination?Math.hypot(record.endPosition.x-destination.x,record.endPosition.z-destination.z):null};
    criteria.meaning=action==='approach'?'Reach the selected clear point beside the target. This endpoint is deliberately outside the object; touching its center is not required. Use the recorded destination and horizontal tolerance, never an invented object-distance threshold.':action==='place'?'Reach the navigation endpoint, then release the held object at the separately requested placement point. Check objectAtCompletion for that placement; later gravity-driven settling does not undo the recorded release.':'Reach the exact requested ground destination within the horizontal arrival tolerance.';
    if(action==='place')criteria.placementPoint={x:completion.job.x,z:completion.job.z};
  }
  return {record:structuredClone(record),criteria};
}
