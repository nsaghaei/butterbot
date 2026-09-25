import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDesign,validateProposal} from '../design.mjs';
import {Garden} from '../garden.mjs';
const orange={name:'Edible orange',description:'One small orange serving.',kind:'prop',affordances:['display'],mass:.15,attributes:{edible:true,servings:1,portable:true,anchored:false,throwable:true,maxThrowSpeed:4,giftable:true,pushable:true},code:'const g=new THREE.Group();const m=new THREE.Mesh(new THREE.SphereGeometry(.05,12,8),new THREE.MeshToonMaterial({color:0xff9b24}));m.name="orange";g.add(m);return g;'};
test('a realistically light fruit compiles, settles, and is consumed once by a timed action',async()=>{
 const g=new Garden({seedFood:false});try{const b=g.selected,grown=await compileDesign(orange);grown.material='food';const e=g.physics.add(grown,{x:-1,y:.3,z:4});g.designs[e.id]=e.design;for(let i=0;i<120;i++)g.step();assert.ok(Math.abs(e.body.mass()-.15)<.001);assert.ok(Number.isFinite(e.body.translation().y));b.needs.hunger=60;b.startAction({action:'eat',target:e.id,label:'Eat orange'},{advance:false});for(let i=0;i<190;i++)g.step();assert.ok(!g.physics.entities.has(e.id));assert.ok(b.needs.hunger<40);assert.equal(b.logs.filter(l=>l.type==='action_outcome'&&l.action==='eat'&&l.status==='completed').length,1);}finally{g.physics.dispose();}
});
test('small-prop masses retain explicit finite lower and upper bounds',()=>{for(const mass of [0,.001,-1,Infinity,251])assert.throws(()=>validateProposal({...orange,mass}),/Mass for prop/);assert.equal(validateProposal({...orange,mass:.02}).mass,.02);});
