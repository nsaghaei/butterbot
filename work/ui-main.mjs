printer.traverse(o=>o.userData.entityId='printer');
const dialogueNodes=new Map();
function actorColor(id){return id==='pip'?'#bd7468':'#548e91';}
function ensureActorAvatar(id){if(objects.get(id)?.userData.appearance==='robot')return;const old=objects.get(id);if(old)disposeObject(old);loading.delete(id);designs.delete(id);const model=avatar(id,{mesh,mat,textSprite});scene.add(model);objects.set(id,model);}
ensureActorAvatar('actor');selected=null;
function actorDialogue(actor,snapshot){
  const session=snapshot.social?.active?.find(s=>s.participants?.includes(actor.id)),speech=session?.phase==='speaking'&&session.speech?.speakerId===actor.id?session.speech:null;
  if(speech?.text)return {name:actor.name||actor.id,text:speech.text,kind:'speech'};
  const thought=actor.thought,age=(actor.time??snapshot.time)-thought?.time;
  if(!thought||!Number.isFinite(age)||age<0||age>9||(session&&thought.time<session.createdAt))return null;
  const text=thought.speech||thought.text;return text?{name:actor.name||actor.id,text,kind:thought.speech?'speech':'thought'}:null;
}
function placeDialogueBubble(anchor,size,bounds,occupied){
  const pad=8,gap=7,w=Math.min(size.width,Math.max(1,bounds.width-pad*2)),h=Math.min(size.height,Math.max(1,bounds.height-pad*2)),clamp=(n,min,max)=>Math.max(min,Math.min(n,max));
  const preferred={x:anchor.x-w/2,y:anchor.y-h-12},candidates=[preferred];
  for(const other of occupied)candidates.push({x:preferred.x,y:other.y-h-gap},{x:preferred.x,y:other.y+other.height+gap},{x:other.x-w-gap,y:preferred.y},{x:other.x+other.width+gap,y:preferred.y});
  let best=null,bestScore=Infinity;
  for(const candidate of candidates){const box={x:clamp(candidate.x,pad,Math.max(pad,bounds.width-w-pad)),y:clamp(candidate.y,pad,Math.max(pad,bounds.height-h-pad)),width:w,height:h};const overlap=occupied.reduce((sum,o)=>sum+Math.max(0,Math.min(box.x+w+gap,o.x+o.width)-Math.max(box.x-gap,o.x))*Math.max(0,Math.min(box.y+h+gap,o.y+o.height)-Math.max(box.y-gap,o.y)),0),score=overlap*1e6+(box.x-preferred.x)**2+(box.y-preferred.y)**2;if(score<bestScore){bestScore=score;best=box;}}
  return best;
}
function layoutDialogueBubbles(items,bounds){
  const boxes=[];for(const item of items)boxes.push(placeDialogueBubble(item.anchor,item.size,bounds,boxes));
  const overlaps=boxes.some((b,i)=>boxes.slice(i+1).some(o=>b.x<o.x+o.width&&b.x+b.width>o.x&&b.y<o.y+o.height&&b.y+b.height>o.y)),total=boxes.reduce((n,b)=>n+b.height,0)+Math.max(0,boxes.length-1)*7;
  if(overlaps&&total<=bounds.height-16){let top=Math.max(8,Math.min(bounds.height-total-8,items.reduce((n,item)=>n+item.anchor.y,0)/items.length-total));for(const box of boxes){box.y=top;top+=box.height+7;}}
  return boxes;
}
function updateActorDialogue(){
  const items=[],ids=new Set((state.actors||[]).map(a=>a.id));
  for(const [id,node]of dialogueNodes)if(!ids.has(id)){node.remove();dialogueNodes.delete(id);}
  for(const actor of state.actors||[]){const e=state.entities.find(e=>e.id===actor.id),dialogue=actorDialogue(actor,state);let node=dialogueNodes.get(actor.id);
    if(!e||!dialogue){if(node)node.hidden=true;continue;}
    const point=new THREE.Vector3(e.position.x,e.position.y+1.5,e.position.z).project(camera);
    if(point.z<-1||point.z>1||Math.abs(point.x)>1.15||Math.abs(point.y)>1.15){if(node)node.hidden=true;continue;}
    if(!node){node=document.createElement('div');node.className='actor-bubble';node.append(document.createElement('strong'),document.createElement('span'));node.style.setProperty('--actor-color',actorColor(actor.id));host.append(node);dialogueNodes.set(actor.id,node);}
    node.hidden=false;node.classList.toggle('spoken',dialogue.kind==='speech');const label=dialogue.name+(dialogue.kind==='thought'?' · thinking':''),text=friendlyLabel(dialogue.text),limit=host.clientHeight<280?100:190;node.firstChild.textContent=label;node.lastChild.textContent=text.length>limit?text.slice(0,limit-3).trimEnd()+'…':text;node.title=dialogue.name+': '+text;
    items.push({node,anchor:{x:(point.x*.5+.5)*host.clientWidth,y:(-point.y*.5+.5)*host.clientHeight},size:{width:node.offsetWidth,height:node.offsetHeight}});
  }
  const boxes=layoutDialogueBubbles(items,{width:host.clientWidth,height:host.clientHeight});items.forEach((item,i)=>{item.node.style.left=boxes[i].x+'px';item.node.style.top=boxes[i].y+'px';});
}
const washEffects=new Map();
function updateWashEffects(){
  const live=new Set();for(const e of state.entities){const effect=e.washEffect;if(!effect?.active)continue;live.add(e.id);let visual=washEffects.get(e.id);
    if(!visual){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(144),3));visual=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xb5eff8,size:.052,transparent:true,opacity:.8,depthWrite:false}));visual.frustumCulled=false;scene.add(visual);washEffects.set(e.id,visual);}
    const positions=visual.geometry.attributes.position,top=effect.outlet,fall=Math.max(.1,top.y-effect.floor);
    for(let i=0;i<48;i++){const phase=(state.time*1.1+i*.137)%1,angle=i*2.399963,radius=.08+phase*.16;positions.setXYZ(i,top.x+Math.cos(angle)*radius,top.y-phase*fall,top.z+Math.sin(angle)*radius);}positions.needsUpdate=true;
  }
  for(const [id,visual]of washEffects)if(!live.has(id)){scene.remove(visual);visual.geometry.dispose();visual.material.dispose();washEffects.delete(id);}
}
function generated(d){const g=new THREE.Group();for(const [i,m]of d.meshes.entries()){const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(m.positions,3));if(m.index)geom.setIndex(m.index);geom.computeVertexNormals();const child=mesh(geom,m.color,g);child.userData.meshIndex=i;child.userData.role=m.name;child.userData.original=new Float32Array(m.positions);}return g;}
async function getDesign(e){if(objects.get(e.id)?.userData.appearance==='robot'||loading.has(e.id)||designs.has(e.id)||!e.design)return;const request=Symbol(e.id),epoch=state?.epoch;loading.set(e.id,request);try{const r=await fetch('/api/design/'+encodeURIComponent(e.id));if(!r.ok)return;const d=await r.json();if(loading.get(e.id)!==request||state?.epoch!==epoch||!state.entities.some(item=>item.id===e.id))return;designs.set(e.id,d);let g;
  if(e.cage){g=generated(d);g.userData.cage=true;for(const child of g.children){const original=child.userData.original,bindings=[];for(let i=0;i<original.length;i+=3){const point=[original[i]+e.softOrigin.x,original[i+1]+e.softOrigin.y,original[i+2]+e.softOrigin.z],neighbors=[];for(let j=0;j<e.softRest.length;j+=3)neighbors.push({node:j,d:Math.hypot(point[0]-e.softRest[j],point[1]-e.softRest[j+1],point[2]-e.softRest[j+2])});neighbors.sort((a,b)=>a.d-b.d);const near=neighbors.slice(0,4),sum=near.reduce((n,a)=>n+1/Math.max(.001,a.d*a.d),0);bindings.push(near.map(a=>({node:a.node,weight:1/Math.max(.001,a.d*a.d)/sum})));}child.userData.bindings=bindings;}}
  else if(e.kind==='cloth'){g=new THREE.Group();const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(e.softPositions,3));geom.setIndex(e.softIndices);geom.computeVertexNormals();const m=mesh(geom,d.meshes[0].color,g);m.material=mat(d.meshes[0].color).clone();m.material.side=THREE.DoubleSide;g.userData.softMesh=m;}
  else if(e.kind==='rope'){g=new THREE.Group();g.userData.rope=true;}
  else g=generated(d);
  g.userData.design=d;g.traverse(o=>o.userData.entityId=e.id);objects.set(e.id,g);scene.add(g);
  if(e.kind==='vehicle'){g.userData.wheels=[];for(const w of e.wheels){const wg=new THREE.Group();g.add(wg);const tire=cylinder(w.radius,w.radius,.2,'#343342',wg,[0,0,0],16);tire.rotation.z=Math.PI/2;const hub=cylinder(w.radius*.5,w.radius*.5,.22,'#efcd6b',wg,[0,0,0],12);hub.rotation.z=Math.PI/2;g.userData.wheels.push(wg);}}
}catch(error){if(loading.get(e.id)===request)toast(error.message);}finally{if(loading.get(e.id)===request)loading.delete(e.id);}}
function disposeObject(o){const geometries=new Set(),materials=new Set(),shared=new Set([...mats.values(),outline]);o.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const material of Array.isArray(n.material)?n.material:[n.material])if(material&&!shared.has(material))materials.add(material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.remove(o);}
function syncEntityObjects(){
  const actorIds=new Set((state.actors||[]).map(a=>a.id)),liveIds=new Set([...state.entities.map(e=>e.id),...actorIds]);
  for(const [id,object]of objects)if(!liveIds.has(id)){disposeObject(object);objects.delete(id);designs.delete(id);loading.delete(id);}
  for(const id of actorIds)ensureActorAvatar(id);
  for(const id of designs.keys())if(!liveIds.has(id))designs.delete(id);
  for(const id of loading.keys())if(!liveIds.has(id))loading.delete(id);
  const selectableIds=new Set([...liveIds,...(state.worldObjects||[]).map(o=>o.id),'printer']);if(selected&&!selectableIds.has(selected))selected=state.actorId||'actor';
}
let audioContext=null,soundMuted=localStorage.getItem('garden-sound-muted')==='true',bellPrimed=false,bellEpoch=null,connectionAlive=false,pauseInFlight=false,selectionInFlight=false;
const acceptedPrompts=new Map(),soundButton=$('#sound-toggle');
function renderSoundControl(){soundButton.setAttribute('aria-pressed',String(soundMuted));soundButton.setAttribute('aria-label',soundMuted?'Unmute printer sound':'Mute printer sound');soundButton.title=soundMuted?'Printer sound off':'Printer sound on';soundButton.classList.toggle('muted',soundMuted);}
async function unlockSound(){if(soundMuted)return;const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;try{audioContext??=new Audio();if(audioContext.state==='suspended')await audioContext.resume();}catch{}}
document.addEventListener('pointerdown',unlockSound,{passive:true});document.addEventListener('keydown',unlockSound);
soundButton.onclick=()=>{soundMuted=!soundMuted;localStorage.setItem('garden-sound-muted',String(soundMuted));renderSoundControl();if(!soundMuted)void unlockSound();};renderSoundControl();
function printerBell(){if(soundMuted||audioContext?.state!=='running')return;const now=audioContext.currentTime;for(const [delay,frequency]of [[0,784],[.17,1046.5]]){const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,now+delay);gain.gain.linearRampToValueAtTime(.055,now+delay+.012);gain.gain.exponentialRampToValueAtTime(.001,now+delay+.4);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(now+delay);oscillator.stop(now+delay+.43);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}}
function updatePrinterEvents(){
  const prime=!bellPrimed||bellEpoch!==state.epoch;let accepted=false;
  if(prime){acceptedPrompts.clear();bellEpoch=state.epoch;}
  for(const record of state.logs||[])if(record.type==='laya'&&!['goal','activity','step','social'].includes(record.scope)){if(!prime&&record.status==='accepted'&&acceptedPrompts.get(record.id)!=='accepted')accepted=true;acceptedPrompts.set(record.id,record.status);}
  bellPrimed=true;if(accepted)printerBell();updatePrinterScreen(state);
}
const stream=new EventSource('/api/events');stream.onmessage=event=>{prev=state;state=JSON.parse(event.data);received=performance.now();connectionAlive=true;if(prev&&state.epoch!==prev.epoch){for(const [id,o]of objects)if(id!=='actor'){disposeObject(o);objects.delete(id);}designs.clear();loading.clear();feedActor=null;if(previewGroup){disposeObject(previewGroup);previewGroup=null;previewKey=null;}}syncEntityObjects();for(const e of state.entities)void getDesign(e);updatePrinterEvents();renderUI();};stream.onerror=()=>{bellPrimed=false;connectionAlive=false;$('#busy').textContent='Reconnecting to the garden…';renderPauseControl();renderRequestControls();renderSelection();};
let feedActor=null;const rows=new Map(),memoryRows=new Map();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function makeFeed(areaId,checkId,badgeId){
  const area=$('#'+areaId),check=$('#'+checkId),badge=$('#'+badgeId);let frame=0,last=0,until=0,unseen=0;
  function stop(){cancelAnimationFrame(frame);frame=0;check.checked=false;}
  function tick(now){const target=Math.max(0,area.scrollHeight-area.clientHeight),delta=target-area.scrollTop;area.scrollTop+=delta*(1-Math.exp(-Math.min(40,now-last)/65));last=now;if(now<until||Math.abs(delta)>1)frame=requestAnimationFrame(tick);else{area.scrollTop=target;frame=0;}}
  function follow(animate=true){if(!check.checked)return;unseen=0;badge.hidden=true;if(reducedMotion.matches||!animate){area.scrollTop=area.scrollHeight;return;}until=performance.now()+430;if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}}
  function changed(count=1,animate=true){if(check.checked)follow(animate);else if(count){unseen+=count;badge.textContent=unseen+' new ↓';badge.hidden=false;}}
  area.addEventListener('wheel',stop,{passive:true});area.addEventListener('touchstart',stop,{passive:true});area.addEventListener('keydown',e=>{if(['ArrowUp','PageUp','Home'].includes(e.key))stop();});area.addEventListener('pointerdown',e=>{if(e.offsetX>=area.clientWidth-14)stop();});
  area.addEventListener('scroll',()=>{if(!frame&&area.scrollHeight-area.clientHeight-area.scrollTop<3){check.checked=true;unseen=0;badge.hidden=true;}});
  check.onchange=()=>check.checked?follow():stop();badge.onclick=()=>{check.checked=true;follow();};
  return {area,check,changed,follow};
}
const activityFeed=makeFeed('panel-scroll','follow','feed-latest'),memoryFeed=makeFeed('memory-scroll','memory-follow','memory-latest');
function setActivityCollapsed(collapsed){$('main').classList.toggle('activity-collapsed',collapsed);$('#activity-toggle').setAttribute('aria-expanded',String(!collapsed));$('#activity-toggle-label').textContent=collapsed?'Show activity':'Hide activity';localStorage.setItem('garden-mobile-collapsed',String(collapsed));if(!collapsed)requestAnimationFrame(()=>{activityFeed.follow(false);memoryFeed.follow(false);});}
setActivityCollapsed(localStorage.getItem('garden-mobile-collapsed')==='true');$('#activity-toggle').onclick=()=>setActivityCollapsed(!$('main').classList.contains('activity-collapsed'));
function freshSnapshot(){return !!state&&connectionAlive&&performance.now()-received<3500;}
let actorSelection=null,objectiveInFlight=false;
function reconcileActorSelection(){
  if(!actorSelection)return;
  if(state?.epoch!==actorSelection.epoch||!state.actors?.some(a=>a.id===actorSelection.actorId)||(actorSelection.confirmed&&state.actorId===actorSelection.actorId&&freshSnapshot()))actorSelection=null;
}
function renderRequestControls(){
  const blocked=!!actorSelection||objectiveInFlight||selectionInFlight||!freshSnapshot();
  $('#objective-input').disabled=blocked;$('#send').disabled=blocked;$('#retry-request').disabled=blocked;$('#talk-form').setAttribute('aria-busy',String(!!actorSelection||objectiveInFlight));
  for(const button of $$('#cast [data-actor]'))button.disabled=blocked;
  if(actorSelection){const name=state.actors.find(a=>a.id===actorSelection.actorId)?.name||actorSelection.actorId;$('#talk-label').textContent='Switching to '+name+'…';$('#send').ariaLabel='Waiting for '+name+' selection';}
  else if(state){$('#talk-label').textContent='Tell '+state.actorName+' something';$('#send').ariaLabel='Send to '+state.actorName;}
}
async function selectActor(actorId){
  if(actorSelection||objectiveInFlight||selectionInFlight||!freshSnapshot()||!state.actors.some(a=>a.id===actorId)||actorId===state.actorId)return;
  const request={actorId,epoch:state.epoch,confirmed:false};actorSelection=request;selected=null;renderUI();
  try{await post('/api/select',{actorId});if(actorSelection===request)request.confirmed=true;}
  catch(error){if(actorSelection===request){actorSelection=null;toast(error.message);}}
  finally{reconcileActorSelection();renderUI();}
}
async function submitCharacterObjective(objective,clearInput=false,resume=false){
  if(!objective||actorSelection||objectiveInFlight||selectionInFlight||!freshSnapshot())return false;
  const actorId=state.actorId,name=state.actorName,epoch=state.epoch;objectiveInFlight=true;renderRequestControls();renderSelection();
  try{await post(resume?'/api/resume':'/api/objective',resume?{actorId,objective,cycle:state.lastUserGoal?.cycle??state.cycle}:{actorId,objective});if(state.epoch===epoch){if(clearInput)$('#objective-input').value='';const message=resume?'Continuing '+name+'’s request':'Sent to '+name;$('#send-status').textContent=message;setTimeout(()=>{if($('#send-status').textContent===message)$('#send-status').textContent='';},4000);}return true;}
  catch(error){toast(error.message);return false;}
  finally{objectiveInFlight=false;renderRequestControls();renderSelection();}
}
function renderPauseControl(){const paused=!!state?.control?.paused;$('#pause-state').hidden=!paused;$('#pause-control').textContent=pauseInFlight?'Please wait…':paused?'Resume':'Pause';$('#pause-control').setAttribute('aria-pressed',String(paused));$('#pause-control').disabled=pauseInFlight||!freshSnapshot();}
$('#pause-control').onclick=async()=>{if(pauseInFlight||!freshSnapshot())return;pauseInFlight=true;renderPauseControl();try{await post('/api/control',{paused:!state.control.paused});}catch(error){toast(error.message);}finally{pauseInFlight=false;renderPauseControl();}};
function scrollAnchor(area,selector){const top=area.getBoundingClientRect().top,node=[...area.querySelectorAll(selector)].find(n=>n.getBoundingClientRect().bottom>top);return node?{node,offset:node.getBoundingClientRect().top-top}:null;}
function restoreAnchor(area,anchor,fallback){if(anchor?.node.isConnected)area.scrollTop+=anchor.node.getBoundingClientRect().top-area.getBoundingClientRect().top-anchor.offset;else area.scrollTop=fallback;}

const divider=$('#feed-divider'),feeds=$('#feeds');let split=Number(localStorage.getItem('garden-feed-split')||50),dragging=false;
function setSplit(value){split=Math.min(80,Math.max(20,value));feeds.style.gridTemplateRows=split+'fr 8px '+(100-split)+'fr';divider.setAttribute('aria-valuenow',String(Math.round(split)));localStorage.setItem('garden-feed-split',String(split));activityFeed.follow(false);memoryFeed.follow(false);}
setSplit(split);
divider.onpointerdown=e=>{dragging=true;divider.setPointerCapture(e.pointerId);document.body.classList.add('resizing-feeds');};
divider.onpointermove=e=>{if(dragging){const rect=feeds.getBoundingClientRect();setSplit((e.clientY-rect.top)/rect.height*100);}};
function endResize(){dragging=false;document.body.classList.remove('resizing-feeds');}
divider.onpointerup=endResize;divider.onpointercancel=endResize;divider.ondblclick=()=>setSplit(50);divider.onkeydown=e=>{if(['ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();setSplit(e.key==='Home'?50:split+(e.key==='ArrowUp'?-5:5));}};
function feedTone(record){
  if(['social','social_model'].includes(record.type)||record.scope==='social'||record.action==='socialize')return 'social-dialog';
  if(record.type==='step_verification'||record.scope==='step')return 'verification';
  if(['inspection','observation'].includes(record.type)||['inspect','observe'].includes(record.action))return 'observation';
  if((record.type==='laya'&&!['goal','activity','step'].includes(record.scope))||['design','plan','creator'].includes(record.type))return 'printer-dialog';
  if(['reflection','activity_plan','goal'].includes(record.type)||record.scope==='goal'||['think','speak','ask_for_help'].includes(record.action))return 'planning';
  return 'action';
}
function feedStartsOpen(record){return ['laya','social','social_model'].includes(record.type);}
function socialWaitingStatus(snapshot){
  const session=snapshot.social?.active?.find(s=>s.phase==='waiting'&&s.initiatorId===snapshot.actorId);if(!session)return '';
  const partner=snapshot.actors?.find(a=>a.id===session.partnerId)?.name||snapshot.characters?.find(a=>a.id===session.partnerId)?.name||session.partnerId||'the other character';
  return 'Waiting for '+partner+' to finish their activity';
}
function socialActivityStatus(snapshot){
  const waiting=socialWaitingStatus(snapshot);if(waiting)return waiting;
  const session=snapshot.social?.active?.find(s=>s.kind==='gift'&&s.participants?.includes(snapshot.actorId));if(!session)return '';
  const name=id=>snapshot.actors?.find(a=>a.id===id)?.name||id,object=snapshot.worldObjects?.find(o=>o.id===session.objectId)?.name||snapshot.entities?.find(o=>o.id===session.objectId)?.name||'the gift',giver=snapshot.actorId===session.initiatorId,partner=name(giver?session.partnerId:session.initiatorId);
  if(session.phase==='invited')return giver?'Waiting for '+partner+' to accept '+object:'Deciding whether to accept '+object+' from '+partner;
  if(session.phase==='approaching')return giver?'Bringing '+object+' to '+partner:'Waiting to receive '+object+' from '+partner;
  if(session.phase==='giving')return session.transferred?'Finishing the handoff of '+object:giver?'Handing '+object+' to '+partner:'Receiving '+object+' from '+partner;
  return '';
}
function planStatus(snapshot){
  const plan=snapshot.planSteps||[],index=snapshot.planIndex||0;
  if(snapshot.stage==='failed')return plan.length?'Plan blocked · '+(plan[index]?.label||'No further step available'):'Request blocked · no executable plan';
  if(snapshot.stage==='suspended')return 'Plan paused';
  const social=socialActivityStatus(snapshot);if(social)return social;
  if(plan.length)return index>=plan.length?'Plan completed':(snapshot.stage==='verify_step'?'Verifying ':snapshot.stage==='awaiting_step_done'?'Assessing ':'Step ')+(index+1)+' of '+plan.length+' · '+(plan[index]?.label||'');
  if(snapshot.stage==='action_plan')return 'Gemma is preparing the plan';
  if(snapshot.stage==='goal_select')return 'Choosing a personal goal';
  if(snapshot.stage?.startsWith('social'))return 'Conversation in progress';
  return snapshot.stage==='complete'?'Goal completed':'No active plan';
}
function socialRecordMarkup(record,snapshot){
  if(record.kind==='gift'||record.giftEvidence?.kind==='gift')return giftRecordMarkup(record,snapshot);
  const name=id=>snapshot.actors?.find(a=>a.id===id)?.name||snapshot.characters?.find(a=>a.id===id)?.name||id||'Character',participants=(record.participants||[]).map(name).join(' & '),transcript=record.transcript||[];
  const session=[...(snapshot.social?.active||[]),...(snapshot.social?.history||[])].find(s=>s.id===record.sessionId),waiting='Waiting for '+name(record.partnerId||session?.partnerId||record.participants?.[1])+' to finish their activity';
  const phase={waiting,invited:'Invitation sent',accepted:'Invitation accepted',approaching:'Getting together',generating:'Choosing what to say',speaking:'Talking',delivered:'Speech delivered',complete:'Conversation completed',completed:'Conversation completed',declined:'Invitation declined',canceled:'Conversation interrupted'}[record.status]||title(record.status),outcome=record.reason||record.outcome;
  return `<summary><span class="eyebrow">Conversation · ${clock(record.time)} · ${esc(phase)}</span><span class="question">${esc(participants||'Conversation')}</span>${outcome?`<span class="answer">${esc(friendlyLabel(outcome))}</span>`:''}</summary><div class="details"><div class="social-transcript">${transcript.map(line=>`<p><strong style="--actor-color:${actorColor(line.speakerId)}">${esc(line.speakerName||name(line.speakerId))}</strong><span>“${esc(friendlyLabel(line.text))}”</span></p>`).join('')||'<p class="note">No words delivered yet.</p>'}</div><details><summary>Actual input & output</summary><pre>${esc(JSON.stringify(record,null,2))}</pre></details></div>`;
}
function giftRecordMarkup(record,snapshot){
  const evidence=record.giftEvidence,name=id=>snapshot.actors?.find(a=>a.id===id)?.name||snapshot.characters?.find(a=>a.id===id)?.name||id||'Character',giverId=evidence?.giverId||record.participants?.[0],recipientId=evidence?.recipientId||record.participants?.[1],giver=name(giverId),recipient=name(recipientId),objectId=record.objectId||evidence?.objectId,object=record.objectName||snapshot.worldObjects?.find(o=>o.id===objectId)?.name||snapshot.entities?.find(o=>o.id===objectId)?.name||objectId||'Gift';
  const transferred=evidence?.transferred===true&&evidence.transferCount===1&&evidence.after?.carried===true&&evidence.after.carrier===recipientId;
  const phases={waiting:'Waiting for '+recipient+' to finish their activity',invited:'Gift offered',accepted:'Gift accepted',approaching:'Bringing the gift over',giving:'Handoff in progress',transferred:'Physical transfer recorded',complete:'Handoff completed',completed:'Handoff completed',declined:'Gift declined',canceled:'Handoff interrupted'},phase=phases[record.status]||title(record.status);
  const proof=transferred?recipient+' received '+object+(record.status==='canceled'?'; the physical transfer remains recorded.':'.'):['declined','canceled'].includes(record.status)?'No completed transfer is recorded in this event.':record.status==='accepted'?'Acceptance recorded; the physical handoff is still to come.':'The object has not been transferred in this event.';
  const summary=record.reason||record.outcome||proof,detail=summary===proof?'':`<p class="note">${esc(proof)}</p>`;
  return `<summary><span class="eyebrow">Gift · ${clock(record.time)} · ${esc(phase)}</span><span class="question">${esc(giver)} → ${esc(recipient)} · ${esc(object)}</span><span class="answer">${esc(friendlyLabel(summary))}</span></summary><div class="details">${detail}<details><summary>Actual input & output</summary><pre>${esc(JSON.stringify(record,null,2))}</pre></details></div>`;
}
function socialModelMarkup(record,snapshot){
  const gift=record.kind==='gift'||/gift\s*acceptance/i.test(record.purpose||''),acceptance=gift||record.purpose==='acceptance'||record.source==='laya',speaker=record.input?.speaker,speakerId=speaker?.id||record.actorId||snapshot.actorId,name=speaker?.name||snapshot.actors?.find(a=>a.id===speakerId)?.name||snapshot.actorName||'Character',raw=`<details><summary>Actual input & output</summary><pre>${esc(JSON.stringify(record,null,2))}</pre></details>`;
  if(acceptance){
    const choices=record.choices||{},choice=record.response?.choice??record.choice,probabilities=record.response?.probabilities||{},selected=Object.hasOwn(choices,choice)?choices[choice]:null,answer=record.error||selected||(record.status==='completed'?'No valid choice recorded':'Choosing a response…');
    const options=Object.entries(choices).map(([key,label],i)=>{const p=Array.isArray(probabilities)?probabilities[i]:probabilities[key];return `<div class="option ${choice===key?'picked':''}"><span>${choice===key?'✓ ':''}${esc(friendlyLabel(label))}</span>${Number.isFinite(p)?`<strong>${(p*100).toFixed(1)}%</strong>`:''}</div>`;}).join('');
    return `<summary><span class="eyebrow">${gift?'Gift choice':'Conversation choice'} · ${esc(name)} · ${clock(record.time)}</span><span class="question">${esc(record.question||(gift?'Accept this gift?':'Accept the conversation invitation?'))}</span><span class="answer">${esc(friendlyLabel(answer))}</span></summary><div class="details">${options}${raw}</div>`;
  }
  const speech=record.value?.speech,failed=record.status==='failed',label=failed?'Speech generation failed':speech?'Generated speech':'Generating speech',text=record.error||speech||'Preparing a conversation turn…';
  return `<summary><span class="eyebrow">${esc(label)} · ${esc(name)} · ${clock(record.time)}</span><span class="question">${esc(name)}${speech?'’s proposed words':''}</span></summary><div class="details"><div class="social-transcript"><p><strong style="--actor-color:${actorColor(speakerId)}">${esc(name)}</strong><span>${speech?'“':''}${esc(friendlyLabel(text))}${speech?'”':''}</span></p></div>${speech?'<p class="note">Generated only. Delivery is recorded in conversation cards.</p>':''}${raw}</div>`;
}
function reflectionMarkup(record){
  const diagnostic=record.prompt||record.diagnostics||record.result;
  return `<span class="thought-label">${record.status==='failed'?'Thought unavailable':'Thought'} · ${clock(record.time)}</span><p>${esc(friendlyLabel(record.thought||record.error||record.reason))}</p>${record.speech?`<p class="speech">“${esc(friendlyLabel(record.speech))}”</p>`:''}${diagnostic?`<details><summary>Actual input & output</summary><pre>${esc(JSON.stringify(record,null,2))}</pre></details>`:''}`;
}
function needEffectMarkup(record){
  const effect=record.needFulfillment;if(record.type!=='action_outcome'||record.status!=='completed'||!effect)return '';
  const format=value=>String(Number(value.toFixed(1))),duration=Number.isFinite(effect.elapsed)&&effect.elapsed>=0?' · '+format(effect.elapsed)+' s of action':'';
  const changes=['energy','fun','hunger','hygiene','social','comfort'].flatMap(key=>{
    const before=effect.before?.[key],after=effect.after?.[key];if(!Number.isFinite(before)||!Number.isFinite(after)||before<0||before>100||after<0||after>100)return [];
    const delta=after-before;if(Math.abs(delta)<.05)return [];
    const improved=key==='hunger'?delta<0:delta>0,label=title(key),detail=label+' '+format(before)+' → '+format(after)+' points'+duration+' · recorded engine effect';
    return [`<span class="need-effect ${improved?'improved':'reduced'}" title="${esc(detail)}" aria-label="${esc(detail)}">${esc(label)} ${delta>0?'+':'−'}${format(Math.abs(delta))}</span>`];
  });
  return changes.length?'<span class="need-effects">'+changes.join('<span class="need-effect-separator" aria-hidden="true"> · </span>')+'</span>':'';
}
const movementColors=['#e8bd3f','#62ae97','#7fa1d3','#b294cf','#e6a362'],movementActions=new Set(['move','approach','place']);
function friendlyLabel(value){return String(value??'').replace(/[([]\s*(?:x\s*[:=]\s*)?-?\d+(?:\.\d+)?\s*,\s*(?:[yz]\s*[:=]\s*)?-?\d+(?:\.\d+)?(?:\s*,\s*(?:z\s*[:=]\s*)?-?\d+(?:\.\d+)?)?\s*[)\]]/gi,'the marked spot');}
function movementColor(key,ordinal=0){if(key===null)return movementColors[ordinal%movementColors.length];let hash=0;for(const c of key)hash=(hash*31+c.charCodeAt(0))>>>0;return movementColors[hash%movementColors.length];}
function destinationName(target,point){const info=state?.worldObjects?.find(o=>o.id===target);if(info)return info.name;if(point){const near=state?.worldObjects?.find(o=>{const p=o.approach||o.position;return p&&Math.hypot(p.x-point.x,p.z-point.z)<.3;});if(near)return near.name;}return 'the marked spot';}
function movementForRecord(record){if(record.type!=='action_outcome'||!movementActions.has(record.action))return null;const start=record.jobStart??record.job?.start,point=record.destination||null,key=start===undefined?null:String(record.cycle)+':'+start,ordinal=(state?.logs||[]).filter(r=>r.type==='action_outcome'&&movementActions.has(r.action)).findIndex(r=>r.id===record.id);return {key,color:movementColor(key,Math.max(0,ordinal)),label:destinationName(record.action==='approach'?record.target:null,point),point};}
function activeMovement(){const actor=state?.entities?.find(e=>e.id===state.actorId),point=actor?.goal;if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return null;const job=state.job,key=job?.start===undefined?null:String(state.cycle)+':'+job.start,ordinal=(state.logs||[]).filter(r=>r.type==='action_outcome'&&movementActions.has(r.action)).length;return {key:key||state.cycle+':'+point.x+':'+point.z,color:movementColor(key,ordinal),label:destinationName(job?.action==='approach'?job.target:null,point),point:{x:point.x,z:point.z}};}
function movementSwatch(meta){return meta?`<span class="movement-swatch" style="--movement-color:${meta.color}" aria-hidden="true"></span>`:'';}
let lastDestination=null,arrivalAt=null,markerEpoch=null,hadDestination=false;
function updateMovementMarker(){
  if(markerEpoch!==state?.epoch){lastDestination=null;arrivalAt=null;hadDestination=false;markerEpoch=state?.epoch;}
  const current=activeMovement();renderMovementRoute(current,state?.entities?.find(e=>e.id===state.actorId));if(current){lastDestination=current;arrivalAt=null;hadDestination=true;renderDestinationMarker(current,reducedMotion.matches?0:state.time);return;}
  if(hadDestination){hadDestination=false;const actor=state.entities.find(e=>e.id===state.actorId),p=actor?.position;arrivalAt=p&&Math.hypot(p.x-lastDestination.point.x,p.z-lastDestination.point.z)<.9?state.time:null;}
  if(arrivalAt!==null&&lastDestination){const progress=Math.min(1,(state.time-arrivalAt)/1.25);renderDestinationMarker(lastDestination,reducedMotion.matches?0:state.time,1-progress,1+.4*progress);if(progress===1)arrivalAt=null;}else renderDestinationMarker(null,0);
}
function renderUI(){
  reconcileActorSelection();renderPauseControl();$('#activity-summary').textContent=state.control.paused?'Simulation paused':socialActivityStatus(state)||title(state.job?.action||state.stage);
  const plan=state.planSteps||[],index=state.planIndex||0,move=activeMovement();$('#plan-progress').innerHTML=movementSwatch(move)+esc(friendlyLabel(planStatus(state)));const planSignature=JSON.stringify([plan,index,move?.key]);if($('#plan-list').dataset.signature!==planSignature){$('#plan-list').dataset.signature=planSignature;$('#plan-list').innerHTML=plan.map((step,n)=>'<li class="'+(n<index?'done':n===index?'current':'')+'">'+(n===index?movementSwatch(move):'')+esc(friendlyLabel(step.label||step.action))+'</li>').join('');}
  $('#character-name').textContent=state.actorName;$('#character-style').textContent=state.style||'';$('#stage').textContent=title(state.stage);$('#objective').textContent=friendlyLabel(state.objective);$('.goal>span').textContent=(state.goalSource==='user'?'Your goal':state.goalSource==='need interruption'?'Temporary need · your goal will resume':'Self-selected goal');$('#talk-label').textContent='Tell '+state.actorName+' something';$('#send').ariaLabel='Send to '+state.actorName;$('#needs').innerHTML=Object.entries(state.needs||{}).map(([key,n])=>`<div class="need"><span>${title(key)} <small>${Math.round(n)}</small></span><i><b style="width:${key==='hunger'?100-n:n}%"></b></i></div>`).join('');
  $('#cast').hidden=state.actors.length<2;const castSignature=JSON.stringify(state.actors.map(a=>[a.id,a.name,a.id===state.actorId,a.stage]));if($('#cast').dataset.signature!==castSignature){$('#cast').dataset.signature=castSignature;$('#cast').innerHTML=state.actors.map(a=>`<button type="button" class="${a.id===state.actorId?'active':''}" style="--actor-color:${actorColor(a.id)}" data-actor="${esc(a.id)}" aria-pressed="${a.id===state.actorId}">${esc(a.name)}<small>${a.stage==='idle'?'○':a.stage==='complete'?'✓':a.stage==='failed'?'!':'·'}</small></button>`).join('');$$('#cast [data-actor]').forEach(b=>b.onclick=()=>void selectActor(b.dataset.actor));}
  renderRequestControls();
  $$('[data-brain]').forEach(el=>el.classList.toggle('active',state.inference.activeRequests?.some(r=>r.kind===el.dataset.brain&&r.actorId===state.actorId)));
  $('#busy').textContent=friendlyLabel(state.error||socialActivityStatus(state)||state.inference.label||(state.job?title(state.job.action)+'…':state.stage==='idle'?'Ready to listen':state.stage==='complete'?'Planned actions completed':state.stage==='suspended'?'Tell me to continue, or give me a new goal':title(state.stage)));
  const request=state.lastUserGoal,requestStatus=$('#request-status'),failedRequest=request?.status==='failed';requestStatus.hidden=!request?.text||(state.goalSource==='user'&&!failedRequest);if(!requestStatus.hidden){$('#request-state').textContent=failedRequest?'Request blocked:':request.status==='completed'?'Request completed:':'Your request:';$('#request-text').textContent=friendlyLabel(request.text);requestStatus.title=[request.text,request.error].filter(Boolean).map(friendlyLabel).join('\n');requestStatus.classList.toggle('failed-request',failedRequest);$('#retry-request').hidden=!failedRequest;}
  const scroll=$('#panel-scroll'),scrollTop=scroll.scrollTop,anchor=scrollAnchor(scroll,'.entry'),firstLoad=feedActor!==state.actorId;let added=0,changed=0;if(firstLoad){feedActor=state.actorId;rows.clear();memoryRows.clear();$('#history').replaceChildren();$('#memory-list').replaceChildren();$('#memory-list').dataset.signature='';}
  const shown=state.logs.filter(l=>['laya','reflection','action_outcome','error','activity_plan','plan','outcome','design','goal','inspection','observation','step_verification','social','social_model'].includes(l.type));
  for(const record of shown){const signature=JSON.stringify(record),existing=rows.get(record.id);if(existing?.signature===signature)continue;const open=existing?.node.open??feedStartsOpen(record),rawOpen=existing?.node.querySelector('details[open]'),node=existing?.node||document.createElement(record.type==='reflection'?'div':'details');changed++;node.className='entry '+record.type+' '+record.status+' '+feedTone(record)+(record.type==='reflection'?' thought':'')+(['failed','rejected','not_verified','unsupported'].includes(record.status)||record.type==='error'?' failure':'');node.dataset.record=record.id;const movement=movementForRecord(record);if(movement)node.style.setProperty('--movement-color',movement.color);if(record.type!=='reflection')node.open=open;
    if(record.type==='reflection'){node.innerHTML=reflectionMarkup(record);}
    else if(record.type==='social'){node.innerHTML=socialRecordMarkup(record,state);}
    else if(record.type==='social_model'){node.innerHTML=socialModelMarkup(record,state);}
    else {const question=record.question||({activity_plan:record.status==='unsupported'?'I can’t do that':'A possible plan',plan:'Printer · choosing a design',action_outcome:title(record.action==='use'?(record.needFulfillment?.kind||record.use||'use'):record.action)+' · outcome',design:'Printer · design validation',outcome:'Physical outcome',error:'A blocker'})[record.type]||title(record.type),answer=movement&&['move','approach'].includes(record.action)&&record.status==='completed'?'Reached '+movement.label:record.selected||record.outcome||record.error||record.result?.description||record.proposal?.name||record.plan?.explanation||'Considering the options…',probs=record.response?.probabilities||{};node.innerHTML=`<summary><span class="eyebrow">${esc(record.scope==='goal'?'Goal':record.scope==='activity'?'Activity':record.scope==='step'?'Verification':record.scope==='social'?'Conversation':record.type==='laya'?'Printer':record.type.replaceAll('_',' '))} · ${clock(record.time)} · ${esc(record.status)}</span><span class="question">${movementSwatch(movement)}${esc(friendlyLabel(question))}</span><span class="answer">${esc(friendlyLabel(answer))}</span>${needEffectMarkup(record)}</summary><div class="details">${Object.entries(record.choices||{}).map(([key,label],i)=>{const p=Array.isArray(probs)?probs[i]:probs[key];return `<div class="option ${record.response?.choice===key?'picked':''}"><span>${record.response?.choice===key?'✓ ':''}${esc(friendlyLabel(label))}</span>${typeof p==='number'?`<strong>${(p*100).toFixed(1)}%</strong>`:''}</div>`;}).join('')}${record.plan?record.plan.steps?.map(a=>`<div class="option">${esc(friendlyLabel(a.label))}</div>`).join('')||'':''}${record.plans?record.plans.map(p=>`<div class="option">${esc(friendlyLabel(p.label))}</div>`).join(''):''}${record.review?record.review.checks.map(c=>`<div class="option">${c.ok?'✓':'!'} ${esc(c.label)}: ${esc(c.evidence)}</div>`).join(''):''}${record.timing?'<p class="note">'+(record.timing.computeMs/1000).toFixed(1)+'s generating · '+(record.timing.queueAndOverheadMs/1000).toFixed(1)+'s waiting/overhead</p>':''}${record.response?'<p class="note">Probabilities show model preference, not correctness.</p>':''}<details><summary>Actual input & output</summary><pre>${esc(JSON.stringify(record,null,2))}</pre></details></div>`;}
    if(rawOpen&&node.querySelector('details'))node.querySelector('details').open=true;if(!existing){$('#history').appendChild(node);added++;if(!firstLoad&&!reducedMotion.matches){const height=node.getBoundingClientRect().height,margin=getComputedStyle(node).marginBottom;node.animate([{height:'0px',opacity:0,transform:'translateY(12px)',marginBottom:'0px'},{height:height+'px',opacity:1,transform:'translateY(0)',marginBottom:margin}],{duration:340,easing:'cubic-bezier(.2,.7,.2,1)'});}}rows.set(record.id,{node,signature});
  }
  const keep=new Set(shown.map(l=>l.id));for(const [id,row]of rows)if(!keep.has(id)){row.node.remove();rows.delete(id);}
  const offered=state.currentChoice;$('#current-question').innerHTML=offered&&['question','review','choose_plan'].includes(state.stage)?`<div class="pending"><span>Printer · ${title(state.stage)}</span><h3>${esc(offered.question)}</h3>${Object.values(offered.choices).map(x=>`<p>${esc(x)}</p>`).join('')}${state.review&&state.stage==='review'?`<p>${esc(state.review.summary)}</p><p>${esc(state.review.unverified)}</p>`:''}</div>`:'';
  const memoryScroll=$('#memory-scroll'),memoryTop=memoryScroll.scrollTop,memoryAnchor=scrollAnchor(memoryScroll,'.memory');$('#core-content').textContent=(state.core?.style||state.style)+' · '+(state.core?.interests||[]).join(', ');
  $('#memory-count').textContent=state.memory?.length||0;const memories=state.memory||[],memorySignature=JSON.stringify(memories.map(m=>[m.id,m.kind,m.text,m.time])),memoryChanged=$('#memory-list').dataset.signature!==memorySignature;
  if(memoryChanged){
    const list=$('#memory-list');list.dataset.signature=memorySignature;let newMemories=0;
    if(memories.length)list.querySelector('.memory-empty')?.remove();
    for(const m of memories){let node=memoryRows.get(m.id);const html=`<small>${esc(m.kind)} · ${clock(m.time)}</small>${esc(m.text)}`;if(!node){node=document.createElement('div');node.className='memory';node.dataset.memory=m.id;memoryRows.set(m.id,node);list.appendChild(node);newMemories++;}if(node.innerHTML!==html)node.innerHTML=html;}
    const ids=new Set(memories.map(m=>m.id));for(const [id,node]of memoryRows)if(!ids.has(id)){node.remove();memoryRows.delete(id);}
    if(!memories.length&&!list.querySelector('.memory-empty')){const empty=document.createElement('p');empty.className='note memory-empty';empty.textContent='No memories yet.';list.appendChild(empty);}
    if(memoryFeed.check.checked)memoryFeed.changed(newMemories,!firstLoad);else{restoreAnchor(memoryScroll,memoryAnchor,memoryTop);memoryFeed.changed(newMemories);}
  }
  $('#actions-list').innerHTML=state.actions.map(a=>`<span class="action-tag">${esc(friendlyLabel(a.label))}</span>`).join('');
  $('#diagnostic-content').innerHTML=`<p class="note">Laya: ${state.inference.laya.ready?'ready':'unavailable'} · Creator: ${esc(state.inference.generator.model)} · ${state.inference.generator.ready?'ready':'unavailable'}<br>Mode: ${esc(state.control.mode)}. Fixed physics: 60 Hz.<br>Memory and reflections are generated character content, not authoritative world state.</p><p class="note">${esc(state.physics.coupling)}</p><p class="note">Character movement uses KCC navigation with connected dynamic bodies, joint limits and PD drives. Soft shapes use an ellipsoid deformation cage.</p><a href="/api/debug" target="_blank" rel="noopener">Debug session</a> · <a href="/api/debug/export">Export debug</a>`;
  if(activityFeed.check.checked){if(changed)activityFeed.changed(added,!firstLoad);}else{restoreAnchor(scroll,anchor,scrollTop);if(added)activityFeed.changed(added);}
  renderSelection();
}
function selectionInfo(id){return state?.worldObjects?.find(o=>o.id===id)||state?.characters?.find(o=>o.id===id)||null;}
function actionKey(action){return JSON.stringify([action.action,action.target||'',action.use||'',action.recipient||'',action.label||'']);}
function selectionActions(id){const keys=new Set();return (state?.actions||[]).filter(a=>a.target===id&&!keys.has(actionKey(a))&&keys.add(actionKey(a)));}
function objectRequest(action,info){
  const target=info.name+' ('+info.id+')',point=`(${Number(action.x).toFixed(2)}, ${Number(action.z).toFixed(2)})`;
  const recipient=state.worldObjects?.find(o=>o.id===action.recipient)||state.entities.find(e=>e.id===action.recipient),recipientName=recipient?.name||action.recipient;
  const requests={approach:`Approach ${target}.`,inspect:`Inspect ${target}.`,pick_up:`Pick up ${target}.`,eat:`Eat one serving from ${target}.`,drop:`Drop ${target}.`,place:`Place ${target} at ${point}.`,throw:`Throw ${target} toward ${point} at ${action.speed||6}m/s.`,push:`Push ${target} toward ${point} with strength ${action.strength||1}.`,give:`Give ${target} to ${recipientName} (${action.recipient}).`,use:`Use ${target} for ${action.use}.`,socialize:`Chat with ${target}.`};
  return requests[action.action]||null;
}
function renderSelection(){
  const card=$('#selection-card'),info=selectionInfo(selected);if(!state||!info){card.hidden=true;return;}card.hidden=false;
  const attrs=info.attributes||{},actions=selectionActions(selected),canRequest=freshSnapshot()&&!selectionInFlight&&!actorSelection&&!objectiveInFlight;
  const facts=[['Mass',Number.isFinite(info.mass)?Number(info.mass.toFixed(2))+' kg':'Fixed fixture'],['Size',(info.dimensions||[]).map(n=>Number(n.toFixed(2))).join(' × ')+' m'],['Material',info.material&&info.material!=='unspecified'?title(info.material):'Not specified'],['Handling',attrs.anchored?'Anchored':attrs.portable?'Portable':'Not portable'],['Food',attrs.edible?(attrs.servings||0)+' servings':'Not edible']];
  if(attrs.throwable)facts.push(['Throw limit',attrs.maxThrowSpeed+' m/s']);
  const signature=JSON.stringify([state.epoch,state.actorId,selected,info.name,info.description,facts,actions.map(a=>[actionKey(a),a.label]),canRequest,info.blockedActions]);if(card.dataset.signature===signature)return;card.dataset.signature=signature;const limitsOpen=!!card.querySelector('.object-limits[open]');
  card.innerHTML=`<div class="selection-heading"><h3>${esc(info.name)}</h3><button id="selection-close" type="button" aria-label="Close object information">×</button></div><p>${esc(info.description||'')}</p><dl class="object-facts">${facts.map(([name,value])=>`<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}</dl><p class="object-action-caption">Ask ${esc(state.actorName)} to…</p><div class="object-actions">${actions.map(a=>`<button type="button" data-action-key="${esc(actionKey(a))}" data-object-id="${esc(info.id)}" data-actor-id="${esc(state.actorId)}" data-epoch="${esc(state.epoch)}" ${canRequest?'':'disabled'}>${esc(friendlyLabel(a.label||title(a.action)))}</button>`).join('')||'<p class="note">No action is available from here right now.</p>'}</div>${info.blockedActions&&Object.keys(info.blockedActions).length?`<details class="object-limits" ${limitsOpen?'open':''}><summary>Physical limits</summary>${[...new Set(Object.values(info.blockedActions))].map(reason=>`<p>${esc(reason)}</p>`).join('')}</details>`:''}`;
}
$('#selection-card').addEventListener('click',async event=>{
  if(event.target.closest('#selection-close')){selected=null;renderSelection();return;}
  const button=event.target.closest('button[data-action-key]');if(!button||selectionInFlight||actorSelection||objectiveInFlight||!freshSnapshot())return;
  if(button.dataset.objectId!==selected||button.dataset.epoch!==String(state.epoch)||button.dataset.actorId!==state.actorId)return;
  const info=selectionInfo(selected),action=selectionActions(selected).find(a=>actionKey(a)===button.dataset.actionKey);
  if(!info||!action){toast('That action is no longer available.');renderSelection();return;}
  const objective=objectRequest(action,info);if(!objective)return;
  if(objective.length>240){toast('This request is too long. Use the message box to describe it.');return;}
  const epoch=state.epoch;selectionInFlight=true;renderRequestControls();renderSelection();try{await post('/api/objective',{actorId:state.actorId,objective});if(state.epoch===epoch)toast(state.control.paused?'Request sent. Resume the simulation to continue.':'Request sent to '+state.actorName);}catch(error){toast(error.message);}finally{selectionInFlight=false;renderRequestControls();renderSelection();}
});
$('#reset-scene').onclick=async()=>{const button=$('#reset-scene');button.disabled=true;try{await post('/api/reset',{seed:'garden-'+Date.now()});selected=null;feedActor=null;toast('Scene, goals and memories reset');}catch(error){toast(error.message);}finally{button.disabled=false;}};
$('#retry-request').onclick=async()=>{const request=state.lastUserGoal;if(request?.text&&request.status==='failed')await submitCharacterObjective(request.text,false,true);};
$('#talk-form').onsubmit=async event=>{event.preventDefault();const text=$('#objective-input').value.trim();if(!text)return;const goal=/^(continue|resume|keep going)[.!]?$/i.test(text)?state?.objective:text;await submitCharacterObjective(goal,true);};
$('#objective-input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#talk-form').requestSubmit();}};
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();function cast(event){const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,camera);return ray.intersectObjects(scene.children,true);}
let pointerStart;renderer.domElement.addEventListener('pointerdown',e=>pointerStart=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!state||!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>4)return;const hit=cast(e).find(h=>h.object.userData.entityId);if(hit){selected=hit.object.userData.entityId;renderSelection();}else{selected=null;renderSelection();}});
new ResizeObserver(()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);camera.aspect=w/h;camera.fov=camera.aspect<1?Math.min(80,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(43)/2)/camera.aspect))):43;camera.updateProjectionMatrix();renderer.setSize(w,h);}).observe(host);
let previewGroup=null,previewKey=null,frames=0,lastFps=performance.now(),lastFrame=0,decorativeTime=0;
function animate(now){requestAnimationFrame(animate);controls.update();const elapsed=Math.min(100,now-(lastFrame||now));lastFrame=now;if(!reducedMotion.matches&&!state?.control?.paused){decorativeTime+=elapsed;animateEnvironment(decorativeTime);}if(state){updateMovementMarker();updateWashEffects();const alpha=Math.min(1,(now-received)/125),old=new Map(prev?.entities.map(e=>[e.id,e])||[]);
  for(const e of state.entities){const o=objects.get(e.id);if(!o)continue;const a=old.get(e.id)||e;if(e.design?.attributes?.edible)for(const child of o.children){const match=/^orange_serving_(\d+)$/.exec(child.userData.role||'');if(match)child.visible=Number(match[1])<e.servings;}if(o.userData.parts){updateAvatar(o,e,a,alpha);continue;}
    const p=new THREE.Vector3(a.position.x,a.position.y,a.position.z).lerp(new THREE.Vector3(e.position.x,e.position.y,e.position.z),alpha);
    if(e.softPositions){const positions=e.softPositions.map((n,i)=>(a.softPositions?.[i]??n)+(n-(a.softPositions?.[i]??n))*alpha);
      if(e.cage){for(const child of o.children){const arr=child.geometry.attributes.position.array,original=child.userData.original;for(let i=0;i<arr.length;i+=3){const near=child.userData.bindings[i/3];for(let k=0;k<3;k++)arr[i+k]=original[i+k]+[e.softOrigin.x,e.softOrigin.y,e.softOrigin.z][k]+near.reduce((n,b)=>n+(positions[b.node+k]-e.softRest[b.node+k])*b.weight,0);}child.geometry.attributes.position.needsUpdate=true;child.geometry.computeVertexNormals();child.geometry.computeBoundingSphere();}}
      else if(e.kind==='rope'){const pts=[];for(let i=0;i<positions.length;i+=3)pts.push(new THREE.Vector3(...positions.slice(i,i+3)));const geom=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),30,.065,7,false);if(o.children[0]){o.children[0].geometry.dispose();o.remove(o.children[0]);}mesh(geom,designs.get(e.id).meshes[0].color,o);}
      else {const geom=o.userData.softMesh.geometry;geom.attributes.position.array.set(positions);geom.attributes.position.needsUpdate=true;geom.computeVertexNormals();geom.computeBoundingSphere();}continue;
    }
    if(e.broken&&e.fragments){o.position.set(0,0,0);o.quaternion.identity();for(const f of e.fragments){const m=o.children.find(m=>m.userData.meshIndex===f.mesh);if(m){m.position.set(f.position.x,f.position.y,f.position.z);m.quaternion.set(f.rotation.x,f.rotation.y,f.rotation.z,f.rotation.w);m.position.sub(new THREE.Vector3(...f.center).applyQuaternion(m.quaternion));}}continue;}
    o.position.copy(p);o.quaternion.set(e.rotation.x,e.rotation.y,e.rotation.z,e.rotation.w);if(e.kind==='character'){o.rotation.y=e.heading;for(const child of o.children){const role=child.userData.role,b=e.rig?.bodies.find(b=>b.name.toLowerCase()===role?.toLowerCase());if(!b)continue;const original=child.userData.original,center=new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(original,3)).getCenter(new THREE.Vector3());child.quaternion.set(b.rotation.x,b.rotation.y,b.rotation.z,b.rotation.w);const inverse=o.quaternion.clone().invert();child.quaternion.premultiply(inverse);child.position.set(b.position.x-p.x,b.position.y-p.y,b.position.z-p.z).applyQuaternion(inverse).sub(center.applyQuaternion(child.quaternion));}}
    if(o.userData.wheels)e.wheels.forEach((w,i)=>{const wheel=o.userData.wheels[i];wheel.position.set(w.point.x,w.point.y-w.suspension,w.point.z);wheel.rotation.set(w.rotation,w.steering,0);});
    if(e.stored&&!o.userData.tokens){o.userData.tokens=true;for(let i=0;i<e.stored;i++)sphere(.11,['#f5ca5e','#ee8b77','#94b9e5'][i%3],o,[(i-1)*.27,.05,0],10);}
  }
  if(state.preview){const key=state.preview.record;if(previewKey!==key){if(previewGroup)disposeObject(previewGroup);previewGroup=generated(state.preview);previewGroup.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.55;}});scene.add(previewGroup);previewKey=key;}previewGroup.position.copy(printer.localToWorld(new THREE.Vector3(0,.82+state.preview.dimensions[1]/2,0)));nozzle.position.x=state.stage==='printing'?Math.sin(state.time*8)*.7:0;}else if(previewGroup){disposeObject(previewGroup);previewGroup=null;previewKey=null;nozzle.position.x=0;}
  updateActorDialogue();
}renderer.render(scene,camera);frames++;if(now-lastFps>2000){$('#fps').textContent=Math.round(frames*1000/(now-lastFps))+' fps';frames=0;lastFps=now;}}
requestAnimationFrame(animate);
