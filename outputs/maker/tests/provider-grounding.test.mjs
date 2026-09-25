import test from 'node:test';
import assert from 'node:assert/strict';
import {Providers} from '../providers.mjs';

test('printer generation receives a schema restricted to the downstream object behavior',async()=>{
  const p=new Providers();let request;
  p.generate=async(system,prompt,schema)=>{request={prompt,schema};return {value:{plans:[]}};};
  await p.plan({objective:'Print an orange and eat it',printRequirements:[{action:'eat'}]});
  const variants=request.schema.properties.plans.items.anyOf;
  assert.equal(variants.length,1);
  assert.deepEqual(variants[0].properties.kind.enum,['prop']);
  assert.deepEqual(variants[0].properties.interaction.enum,['display']);
  assert.match(request.prompt,/pairs for this object: prop\/display/);
  await p.plan({objective:'Print a car and drive it',printRequirements:[{action:'use',use:'drive'}]});
  assert.deepEqual(request.schema.properties.plans.items.anyOf[0].properties.kind.enum,['vehicle']);
  await assert.rejects(p.plan({objective:'An impossible meal',printRequirements:[{action:'eat'},{action:'use',use:'drive'}]}),/Incompatible/);
});

test('remaining action planning keeps exact requested coordinates next to the corrective instruction',async()=>{
  const p=new Providers();let prompt;
  p.generate=async(system,text)=>{prompt=text;return {value:{steps:[]}};};
  await p.actionPlan({objective:'Walk to (-4, 5), then dance.'},{availableActions:[{action:'move',x:-2,z:5,label:'Quiet patch'}],correction:'Plan omitted requested coordinates (-4, 5)'});
  assert.match(prompt,/Exact requested coordinate pairs.*\[\{"x":-4,"z":5\}\]/);
  assert.match(prompt,/Latest correction: Plan omitted requested coordinates \(-4, 5\)/);
  assert.match(prompt,/Never snap an explicit coordinate to a named landmark/);
});
