import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getQuickJS} from 'quickjs-emscripten';
const require=createRequire(import.meta.url);
try{
  const source=await readFile(require.resolve('three'),'utf8');
  const QuickJS=await getQuickJS(),runtime=QuickJS.newRuntime();
  runtime.setMemoryLimit(96*1024*1024);runtime.setMaxStackSize(1024*1024);
  let deadline=Date.now()+5000;runtime.setInterruptHandler(()=>Date.now()>deadline);
  const vm=runtime.newContext();
  function evaluate(code){const result=vm.evalCode(code);if(result.error){const error=vm.dump(result.error);result.error.dispose();throw Error(error.message||JSON.stringify(error));}const value=vm.dump(result.value);result.value.dispose();return value;}
  evaluate(`var exports={}; var console={log(){},warn(){},error(){}}; var AbortController=class{constructor(){this.signal={}}abort(){}}; ${source}; const THREE=Object.freeze(exports);`);
  deadline=Date.now()+1500;
  // This VM has no host functions, module loader, filesystem, DOM, fetch, sockets or process.
  const output=evaluate(`(()=>{const root=(()=>{const creation=new THREE.Group();function addMesh(geometry,color,x=0,y=0,z=0,name=""){const m=new THREE.Mesh(geometry,new THREE.MeshToonMaterial({color}));m.position.set(x,y,z);m.name=name;creation.add(m);return m;}return (()=>{${workerData.code}\n})();})();
    if(!root || !root.isObject3D) throw Error('Return a THREE.Group or Object3D root');
    root.updateMatrixWorld(true);let count=0,total=0;const meshes=[];
    root.traverse(o=>{if(!o.isMesh)return;if(++count>96)throw Error('Maximum 96 meshes');
      const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);const a=g.attributes.position;
      if(!a||a.count>50000)throw Error('Invalid geometry');total+=a.count;if(total>60000)throw Error('Vertex budget exceeded');
      const positions=[];for(let i=0;i<a.count;i++)positions.push(a.getX(i),a.getY(i),a.getZ(i));
      const index=g.index?Array.from(g.index.array):null;
      const material=Array.isArray(o.material)?o.material[0]:o.material;
      meshes.push({name:String(o.name||'').slice(0,60),positions,index,color:material?.color?.getHex()??0x52bed1});
    });return JSON.stringify({meshes});})()`);
  if(typeof output!=='string'||output.length>5_000_000)throw Error('Compiled geometry exceeds output limit');
  parentPort.postMessage({ok:true,compiled:JSON.parse(output)});vm.dispose();runtime.dispose();
}catch(error){parentPort.postMessage({ok:false,error:error.message});}

