// Labels and unused schema fields must not split one physical action into two choices.
export function sameAction(a,b){
 if(!a||!b||a.action!==b.action)return false;
 const fields={move:['x','z'],approach:['target'],place:['target','x','z'],pick_up:['target'],drop:['target'],throw:['target','x','z','speed'],push:['target','x','z','strength'],give:['target','recipient'],inspect:['target'],eat:['target'],use:['target','use']}[a.action]||[];
 return fields.every(key=>['x','z','speed','strength'].includes(key)?Math.abs((Number(a[key])||0)-(Number(b[key])||0))<.01:String(a[key]||'')===String(b[key]||''));
}
