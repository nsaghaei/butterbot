const BOOLEAN_KEYS=['portable','anchored','edible','throwable','giftable','pushable'];
const KEYS=new Set([...BOOLEAN_KEYS,'servings','maxThrowSpeed']);
const PORTABLE_KINDS=new Set(['prop','breakable','soft']);
const RIGID_KINDS=new Set(['prop','breakable']);
const DYNAMIC_KINDS=new Set(['prop','breakable','soft','vehicle']);
const KINDS=new Set(['prop','breakable','soft','vehicle','character','rope','cloth','fixture']);

export function normalizeAttributes(raw,kind,mass,dimensions){
  if(raw===undefined)raw={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Object attributes must be an object');
  for(const key of Object.keys(raw))if(!KEYS.has(key))throw Error('Unknown object attribute: '+key);
  for(const key of BOOLEAN_KEYS)if(raw[key]!==undefined&&typeof raw[key]!=='boolean')throw Error(key+' must be a boolean');
  if(!KINDS.has(kind))throw Error('Unsupported object kind for attributes');
  if(typeof mass!=='number'||!Number.isFinite(mass)||mass<0||mass>250)throw Error('Object mass must be a finite number from 0 to 250kg');
  if(dimensions!==undefined&&(!Array.isArray(dimensions)||dimensions.length!==3||dimensions.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0)))throw Error('Object dimensions must be three finite nonnegative numbers');
  const anchored=raw.anchored??['rope','cloth','fixture'].includes(kind);
  let portable=raw.portable??(PORTABLE_KINDS.has(kind)&&mass<=12&&(!dimensions||Math.max(...dimensions)<=2));
  const edible=raw.edible??false;
  const servings=raw.servings??(edible?1:0);
  const maxThrowSpeed=raw.maxThrowSpeed??6;
  if(!Number.isInteger(servings)||servings<0||servings>100)throw Error('Servings must be an integer from 0 to 100');
  if(typeof maxThrowSpeed!=='number'||!Number.isFinite(maxThrowSpeed)||maxThrowSpeed<1||maxThrowSpeed>10)throw Error('Maximum throw speed must be between 1 and 10m/s');
  if(edible&&kind!=='prop')throw Error('Only a food prop can be edible');
  if(!edible&&servings!==0)throw Error('A non-edible object must have zero servings');
  let throwable=raw.throwable??(portable&&RIGID_KINDS.has(kind));
  let giftable=raw.giftable??portable;
  let pushable=raw.pushable??DYNAMIC_KINDS.has(kind);
  if(anchored){portable=false;throwable=false;giftable=false;pushable=false;}
  if(portable&&!PORTABLE_KINDS.has(kind))throw Error('This object kind cannot be portable');
  if(throwable&&(!RIGID_KINDS.has(kind)||!portable))throw Error('Only a portable rigid prop or breakable object can be thrown');
  if(giftable&&!portable)throw Error('Only a portable object can be given');
  if(pushable&&!DYNAMIC_KINDS.has(kind))throw Error('This object kind cannot be pushed');
  return {portable,anchored,edible,servings,throwable,maxThrowSpeed,giftable,pushable};
}

export function attributesFor(entity){
  if(!entity||typeof entity!=='object')throw Error('An entity is required for object attributes');
  const design=entity.design||{},kind=entity.kind||design.kind||'character',raw={...(design.attributes||{})};
  if(entity.edible!==undefined)raw.edible=entity.edible;
  if(entity.servings!==undefined)raw.servings=entity.servings;
  if(raw.edible===false&&entity.servings===undefined)raw.servings=0;
  return normalizeAttributes(raw,kind,design.mass??(kind==='character'?65:0),design.dimensions);
}

const numberLabel=value=>Number(value.toFixed(2)).toString();
export function liftingBlocker(entity){
  const name=entity.design?.name||entity.name||'Object',mass=entity.design?.mass??65,size=entity.design?.dimensions,attrs=attributesFor(entity);
  if(mass>12)return `${name} weighs ${numberLabel(mass)}kg; lifting limit is 12kg`;
  if(size&&Math.max(...size)>2)return `${name} is ${numberLabel(Math.max(...size))}m across; carrying limit is 2m`;
  if(attrs.anchored)return name+' is anchored and cannot be lifted';
  if(!attrs.portable)return name+' is not portable';
  if(entity.broken)return name+' is broken into separate pieces and cannot be lifted as one object';
  return null;
}

export function capabilityBlockers(entity){
  const attrs=attributesFor(entity),name=entity.design?.name||entity.name||'Object',mass=entity.design?.mass??65,blocked={};
  const lift=liftingBlocker(entity);if(lift)blocked.pick_up=lift;
  if(!attrs.edible)blocked.eat=name+' is not edible';else if(attrs.servings<=0)blocked.eat='No edible resource remains in '+name;
  if(lift||!attrs.throwable)blocked.throw=lift||name+' cannot be thrown';
  if(lift||!attrs.giftable)blocked.give=lift||name+' cannot be given';
  if(attrs.anchored)blocked.push=name+' is anchored and cannot be pushed';
  else if(mass>130)blocked.push=`${name} weighs ${numberLabel(mass)}kg; pushing limit is 130kg`;
  else if(!attrs.pushable)blocked.push=name+' cannot be pushed';
  else if(entity.broken)blocked.push=name+' is broken into separate pieces';
  return blocked;
}
