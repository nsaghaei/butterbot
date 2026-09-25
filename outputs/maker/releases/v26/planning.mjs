export const PAIRS={prop:['display','store','sit','rest','wash'],vehicle:['drive'],character:['follow'],soft:['squish'],rope:['swing'],cloth:['drape'],breakable:['break']};

export function creationPairs(requirements=[]){
  if(!Array.isArray(requirements))throw Error('Required creation behaviors must be an array');
  const uses=[...new Set(requirements.filter(a=>a.action==='use').map(a=>a.use))],edible=requirements.some(a=>a.action==='eat'),pairs={};
  for(const [kind,interactions]of Object.entries(PAIRS)){
    if(edible&&kind!=='prop'||!uses.every(use=>interactions.includes(use)))continue;
    const allowed=uses.length?interactions.filter(use=>uses.includes(use)):edible?['display']:[...interactions];
    if(allowed.length)pairs[kind]=allowed;
  }
  if(!Object.keys(pairs).length)throw Error('Incompatible required creation behaviors: '+[...(edible?['eat']:[]),...uses.map(use=>'use/'+use)].join(', '));
  return pairs;
}

export function validatePlans(objective,value,requirements=[]){
  const accepted=[],rejected=[],ids=new Set(),plans=value?.plans;
  if(!Array.isArray(plans)||plans.length>4)return {accepted,rejected:[{reason:'Expected at most four concrete plans',value}]};
  const pairs=creationPairs(requirements),edibleRequired=requirements.some(a=>a.action==='eat'),allowed=Object.entries(pairs).flatMap(([kind,uses])=>uses.map(use=>kind+'/'+use)).join(', ');
  for(const plan of plans){
    // Older saved/sample plans lack this field. Only an explicit engine dependency
    // supplies their default; object names and free-form objective text do not.
    const edible=plan?.edible===undefined?edibleRequired:plan.edible;let reason=null;
    if(!plan||!/^[a-z][a-z0-9_]{0,15}$/.test(plan.id)||ids.has(plan.id))reason='Invalid or repeated plan ID';
    else if(typeof plan.label!=='string'||!plan.label.trim()||plan.label.length>220)reason='Plan label is missing or too long';
    else if(!PAIRS[plan.kind]?.includes(plan.interaction))reason=`${plan.kind}/${plan.interaction} is not an implemented physical behavior`;
    else if(!pairs[plan.kind]?.includes(plan.interaction))reason=`Required later actions need ${allowed}; ${plan.kind}/${plan.interaction} is incompatible`;
    else if(typeof edible!=='boolean')reason='Plan edible capability must be a boolean';
    else if(edible&&plan.kind!=='prop')reason='Edible capability requires a prop with food material';
    else if(edibleRequired&&!edible)reason='Required later eating needs an edible=true creation plan';
    else if(/plush|squish/i.test(objective)&&plan.kind!=='soft')reason='A squishy plush requires soft/squish';
    else if(/\bbed\b/i.test(objective)&&!(plan.kind==='prop'&&plan.interaction==='rest'))reason='A usable bed requires a rigid supporting prop with rest behavior';
    if(reason)rejected.push({plan,reason});else{ids.add(plan.id);accepted.push({...plan,edible});}
  }
  return {accepted,rejected};
}
