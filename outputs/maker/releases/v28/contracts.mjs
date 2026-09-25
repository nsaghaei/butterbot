export function requirements(objective){
  const text=objective.toLowerCase();return {soft:/squish|plush|cuddly|soft/.test(text),species:/red[ -]panda/.test(text)?'red panda':null};
}
export function reviewDesign(design,objective){
  const req=requirements(objective),checks=[];
  const check=(label,ok,evidence)=>checks.push({label,ok:!!ok,evidence});
  check('Supported physical behavior',!req.soft||(design.kind==='soft'&&design.affordances.includes('squish')),design.kind+' / '+design.affordances.join(', '));
  check('Compatible soft material',!req.soft||['foam','rubber'].includes(design.material),`${design.material}; stiffness ${design.properties?.stiffness}`);
  check('Safe bounded geometry',design.stats.vertices<=60000&&design.dimensions.every(n=>n<=5),`${design.stats.meshes} meshes; ${design.dimensions.map(n=>n.toFixed(2)).join(' × ')} m`);
  if(req.species==='red panda'){
    const named=pattern=>design.meshes.filter(m=>pattern.test(m.name||'')),color=m=>[(m.color>>16)&255,(m.color>>8)&255,m.color&255],rust=m=>{const [r,g,b]=color(m);return r>110&&r>g*1.2&&g>b*.8;},cream=m=>color(m).every(n=>n>145),dark=m=>color(m).every(n=>n<135);
    check('Rust colored body geometry',named(/body|torso/).some(rust),'Named body mesh must have a red-brown vertex material');
    check('Paired pale face markings',named(/face_mask|cheek_patch/).filter(cream).length>=2,'At least two separate pale facial patch meshes');
    check('Dark eye markings',named(/eye_patch/).filter(dark).length>=2,'At least two dark eye patch meshes');
    check('Ringed tail geometry',named(/tail_ring/).length>=3&&new Set(named(/tail_ring/).map(m=>m.color)).size>=2,'At least three separately colored tail bands');
    check('Paired ears and paws',named(/ear/).length>=2&&named(/paw/).length>=2,'Separate ear and paw geometry');
  }
  return {checks,ok:checks.every(c=>c.ok),unverified:req.species?'Recognizability is not proven by these structural/color checks; inspect the live preview.':'Open-ended visual similarity is not automatically verified.',summary:`${design.name}; ${design.kind}; ${design.material}; ${design.mass.toFixed(1)} kg; ${checks.filter(c=>c.ok).length}/${checks.length} contract checks passed`};
}
