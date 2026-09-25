import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../../../work/ui-main.mjs',import.meta.url),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'UI helper boundaries exist');return source.slice(a,b);}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function helpers(extra={}){const context=vm.createContext({esc,title:s=>String(s),clock:n=>String(n),...extra});vm.runInContext(section('function actorColor','function updateActorDialogue').replace("ensureActorAvatar('actor');selected=null;",'')+section('function feedTone','function needEffectMarkup')+section('function friendlyLabel','function movementColor')+section('function selectionInfo','function renderSelection'),context);return context;}
const plain=value=>JSON.parse(JSON.stringify(value));
function requestFixture(){
  const nodes=new Map(['objective-input','send','retry-request','talk-form','talk-label','send-status'].map(id=>['#'+id,{disabled:false,textContent:'',value:'A quick new goal',attributes:{},setAttribute(k,v){this.attributes[k]=v;}}])),buttons=[{disabled:false},{disabled:false}],requests=[],errors=[];
  const context=vm.createContext({state:{epoch:1,actorId:'actor',actorName:'Butterbot',actors:[{id:'actor',name:'Butterbot'},{id:'pip',name:'Pip'}]},selectionInFlight:false,selected:null,freshSnapshot:()=>true,$:id=>nodes.get(id),$$:()=>buttons,renderSelection:()=>{},toast:error=>errors.push(error),setTimeout:()=>0,post:(path,data)=>{const request={path,data};requests.push(request);if(path!=='/api/select')return Promise.resolve({ok:true});return new Promise((resolve,reject)=>Object.assign(request,{resolve,reject}));}});
  context.renderUI=()=>{context.reconcileActorSelection();context.renderRequestControls();};vm.runInContext(section('let actorSelection','function renderPauseControl'),context);return {context,nodes,buttons,requests,errors};
}

test('cast reconciliation creates each robot once, retains physical objects, and removes a departed actor',()=>{
  const objects=new Map(),designs=new Map(),loading=new Map(),created=[],removed=[],scene={add:o=>created.push(o)};
  const context=helpers({objects,designs,loading,scene,mesh:null,mat:null,textSprite:null,avatar:id=>({id,userData:{appearance:'robot'}}),disposeObject:o=>removed.push(o),selected:'pip',state:{actorId:'actor',actors:[{id:'actor'},{id:'pip'}],entities:[{id:'actor'},{id:'pip'},{id:'flower'}]}});
  objects.set('flower',{id:'flower',userData:{}});vm.runInContext(section('function syncEntityObjects','let audioContext'),context);
  context.syncEntityObjects();const primary=objects.get('actor'),pip=objects.get('pip');assert.equal(created.length,2);assert.equal(objects.get('flower').id,'flower');
  context.syncEntityObjects();assert.equal(created.length,2);assert.equal(objects.get('pip'),pip);
  context.state={actorId:'actor',actors:[{id:'actor'}],entities:[{id:'actor'},{id:'flower'}]};context.syncEntityObjects();assert.equal(objects.get('actor'),primary);assert.equal(objects.has('pip'),false);assert.deepEqual(removed,[pip]);assert.equal(context.selected,'actor');
});

test('each actor speaks from their own delivered thought or current social turn, never another actor or an old epoch',()=>{
  const h=helpers(),butter={id:'actor',name:'Butterbot',thought:{text:'A new invention.',time:18}},pip={id:'pip',name:'Pip',thought:{speech:'Hello!',time:19}},snapshot={time:20,thought:{speech:'Selected actor must not leak'},social:{active:[]}};
  assert.deepEqual(plain(h.actorDialogue(butter,snapshot)),{name:'Butterbot',text:'A new invention.',kind:'thought'});assert.equal(h.actorDialogue(pip,snapshot).text,'Hello!');
  snapshot.social.active=[{participants:['actor','pip'],createdAt:19,phase:'speaking',speech:{speakerId:'actor',text:'Shall we explore?'}}];assert.equal(h.actorDialogue(butter,snapshot).text,'Shall we explore?');assert.equal(h.actorDialogue(pip,snapshot).text,'Hello!');
  snapshot.social.active[0].phase='generating';assert.equal(h.actorDialogue(butter,snapshot),null);snapshot.social.active=[];snapshot.time=40;assert.equal(h.actorDialogue(pip,snapshot),null);snapshot.time=1;assert.equal(h.actorDialogue(pip,snapshot),null);
});

test('two nearby conversation bubbles fit separately inside a 375 by 213 mobile garden',()=>{
  const h=helpers(),bounds={width:375,height:213},items=[{anchor:{x:180,y:170},size:{width:210,height:85}},{anchor:{x:183,y:171},size:{width:210,height:85}}],boxes=h.layoutDialogueBubbles(items,bounds);
  for(const b of boxes){assert.ok(b.x>=8&&b.y>=8);assert.ok(b.x+b.width<=bounds.width-8);assert.ok(b.y+b.height<=bounds.height-8);}
  const [a,b]=boxes;assert.ok(a.y+a.height<=b.y||b.y+b.height<=a.y||a.x+a.width<=b.x||b.x+b.width<=a.x);assert.deepEqual(plain(h.layoutDialogueBubbles(items,bounds)),plain(boxes),'same snapshot keeps stable bubble positions');
});

test('newcomer dialogue ages against its own clock in an older garden',()=>{
  const h=helpers(),pip={id:'pip',name:'Pip',time:10,thought:{speech:'Hello, Butterbot!',time:9}},snapshot={time:4759,social:{active:[]}};
  assert.equal(h.actorDialogue(pip,snapshot)?.text,'Hello, Butterbot!');pip.time=19;assert.equal(h.actorDialogue(pip,snapshot),null);
  delete pip.time;snapshot.time=10;assert.equal(h.actorDialogue(pip,snapshot)?.text,'Hello, Butterbot!','older snapshots still use the garden clock');
});

test('plan row distinguishes a rejected request, autonomous goal selection and actual pending planning',()=>{
  const h=helpers();assert.match(h.planStatus({stage:'failed',planSteps:[]}),/blocked.*no executable/i);assert.equal(h.planStatus({stage:'action_plan',planSteps:[]}),'Gemma is preparing the plan');assert.equal(h.planStatus({stage:'goal_select'}),'Choosing a personal goal');assert.equal(h.planStatus({stage:'socializing'}),'Conversation in progress');assert.equal(h.planStatus({stage:'idle'}),'No active plan');assert.match(h.planStatus({stage:'failed',planSteps:[{label:'Talk with Pip'}],planIndex:0}),/Plan blocked.*Talk with Pip/);
});

test('social cards label actual speakers, retain full diagnostics, escape generated text, and avoid printer classification',()=>{
  const h=helpers(),snapshot={actors:[{id:'actor',name:'Butterbot'},{id:'pip',name:'Pip'}]},record={type:'social',status:'complete',time:1,participants:['actor','pip'],transcript:[{speakerId:'pip',text:'<script>hello</script>'}],prompt:'full diagnostic prompt'};
  const html=h.socialRecordMarkup(record,snapshot);assert.match(html,/Butterbot &amp; Pip/);assert.match(html,/>Pip<\/strong>/);assert.ok(!html.includes('<script>'));assert.match(html,/full diagnostic prompt/);assert.match(html,/Actual input &amp; output|Actual input & output/);assert.equal(h.feedTone(record),'social-dialog');assert.equal(h.feedTone({type:'laya',scope:'social'}),'social-dialog');
});

test('character inspection and chat requests use public character metadata and explicit target IDs',()=>{
  const context=helpers({state:{characters:[{id:'pip',name:'Pip',description:'Playful robot'}],worldObjects:[],entities:[],actions:[{action:'socialize',target:'pip',label:'Chat with Pip'},{action:'inspect',target:'flower'}]}}),info=context.selectionInfo('pip');assert.equal(info.description,'Playful robot');const actions=context.selectionActions('pip');assert.equal(actions.length,1);assert.equal(context.objectRequest(actions[0],info),'Chat with Pip (pip).');context.state.actions=[];assert.equal(context.selectionActions('pip').length,0,'a removed current action cannot be reused');
});

test('social invitation decisions open with the selected answer and every keyed probability',()=>{
  const h=helpers(),snapshot={actorId:'pip',actorName:'Pip',actors:[{id:'pip',name:'Pip'}]},record={type:'social_model',source:'laya',purpose:'acceptance',status:'completed',time:12,question:'Accept the conversation invitation?',choices:{accept:'Accept and chat briefly',decline:'Decline and continue my activity'},choice:'accept',response:{choice:'accept',probabilities:{accept:.82,decline:.18}},prompt:'Exact original model input'};
  const html=h.socialModelMarkup(record,snapshot);assert.match(html,/Conversation choice · Pip/);assert.match(html,/<span class="answer">Accept and chat briefly<\/span>/);assert.match(html,/option picked/);assert.match(html,/82\.0%/);assert.match(html,/18\.0%/);assert.match(html,/Decline and continue my activity/);assert.match(html,/Exact original model input/);assert.ok(!html.includes('Considering the options'));assert.equal(h.feedStartsOpen(record),true);assert.equal(h.feedTone(record),'social-dialog');
});

test('declined social invitation supports array probabilities without presenting it as accepted',()=>{
  const h=helpers(),record={type:'social_model',purpose:'acceptance',status:'completed',time:2,choices:{accept:'Accept',decline:'Decline'},choice:'decline',response:{probabilities:[.04,.96]}};
  const html=h.socialModelMarkup(record,{actorName:'Pip'});assert.match(html,/<span class="answer">Decline<\/span>/);assert.match(html,/<span>✓ Decline<\/span>/);assert.match(html,/4\.0%/);assert.match(html,/96\.0%/);
});

test('generated turns name the real speaker and remain proposals until an engine delivery record exists',()=>{
  const h=helpers(),snapshot={actorId:'pip',actorName:'Pip',actors:[{id:'actor',name:'Butterbot'},{id:'pip',name:'Pip'}]},record={type:'social_model',source:'gemma',purpose:'turn',status:'completed',time:3,input:{speaker:{id:'actor',name:'Butterbot'}},value:{speech:'<A bright idea!>',memory:[]},prompt:'Full turn input'};
  const html=h.socialModelMarkup(record,snapshot);assert.match(html,/Generated speech · Butterbot/);assert.match(html,/&lt;A bright idea!&gt;/);assert.match(html,/Generated only\. Delivery is recorded in conversation cards\./);assert.ok(!html.includes('Speech delivered'));assert.match(html,/Full turn input/);assert.equal(h.feedStartsOpen(record),true);
  const delivered=h.socialRecordMarkup({type:'social',status:'delivered',time:4,participants:['actor','pip'],transcript:[{speakerId:'actor',speakerName:'Butterbot',text:'<A bright idea!>'}]},snapshot);assert.match(delivered,/Speech delivered/);assert.ok(!delivered.includes('Generated only'));
});

test('a failed social model turn reports its error instead of implying speech was generated',()=>{
  const h=helpers(),html=h.socialModelMarkup({type:'social_model',status:'failed',time:4,error:'Provider unavailable'}, {actorId:'pip',actorName:'Pip'});assert.match(html,/Speech generation failed/);assert.match(html,/Provider unavailable/);assert.ok(!html.includes('Generated only'));assert.ok(!html.includes('proposed words'));
});

test('queued conversation names the busy partner without implying acceptance or hiding their own activity',()=>{
  const h=helpers(),snapshot={actorId:'actor',stage:'socializing',actors:[{id:'actor',name:'Butterbot'},{id:'pip',name:'Pip'}],planSteps:[{action:'socialize',label:'Chat with Pip'}],social:{active:[{id:'social-3',initiatorId:'actor',partnerId:'pip',participants:['actor','pip'],phase:'waiting',accepted:false}],history:[]}};
  assert.equal(h.socialWaitingStatus(snapshot),'Waiting for Pip to finish their activity');assert.equal(h.planStatus(snapshot),'Waiting for Pip to finish their activity');
  const html=h.socialRecordMarkup({type:'social',status:'waiting',sessionId:'social-3',participants:['actor','pip'],time:5},snapshot);assert.match(html,/Waiting for Pip to finish their activity/);assert.ok(!html.includes('Invitation accepted'));assert.match(html,/No words delivered yet/);
  snapshot.actorId='pip';snapshot.stage='acting';snapshot.planSteps=[{label:'Walk around the garden'}];assert.equal(h.socialWaitingStatus(snapshot),'');assert.match(h.planStatus(snapshot),/Walk around the garden/);
  snapshot.actorId='actor';snapshot.social.active[0].phase='invited';assert.equal(h.socialWaitingStatus(snapshot),'','being invited is distinct from waiting for availability');
});

test('gift acceptance shows all consent probabilities and never labels the decision as conversation',()=>{
  const h=helpers(),record={type:'social_model',kind:'gift',purpose:'gift acceptance',source:'laya',status:'completed',time:1,choices:{accept:'Accept the Orange Tulip',decline:'Decline the gift'},response:{choice:'accept',probabilities:{accept:.75,decline:.25}}},html=h.socialModelMarkup(record,{actorId:'pip',actorName:'Pip'});
  assert.match(html,/Gift choice · Pip/);assert.match(html,/75\.0%/);assert.match(html,/25\.0%/);assert.match(html,/✓ Accept the Orange Tulip/);assert.ok(!html.includes('Conversation choice'));assert.ok(!html.includes('received'));assert.equal(h.feedStartsOpen(record),true);
});

test('gift cards distinguish consent from physical transfer and retain proof after cancellation',()=>{
  const h=helpers(),snapshot={actors:[{id:'actor',name:'Butterbot'},{id:'pip',name:'Pip'}],worldObjects:[{id:'flower',name:'Orange Tulip'}]},base={type:'social',kind:'gift',objectId:'flower',participants:['actor','pip'],time:2};
  const accepted=h.socialRecordMarkup({...base,status:'accepted'},snapshot);assert.match(accepted,/Gift accepted/);assert.match(accepted,/Acceptance recorded; the physical handoff is still to come/);assert.ok(!accepted.includes('Conversation'));assert.ok(!accepted.includes('Pip received'));
  const evidence={kind:'gift',objectId:'flower',giverId:'actor',recipientId:'pip',transferred:true,transferCount:1,after:{owner:'pip',carrier:'pip',carried:true},gesture:{duration:1.4,elapsed:.8,completed:false}};
  const canceled=h.socialRecordMarkup({...base,status:'canceled',giftEvidence:evidence,reason:'Recipient reassigned'},snapshot);assert.match(canceled,/Handoff interrupted/);assert.match(canceled,/Pip received Orange Tulip; the physical transfer remains recorded/);assert.match(canceled,/Recipient reassigned/);assert.match(canceled,/transferCount/);
  const completed=h.socialRecordMarkup({...base,status:'completed',giftEvidence:{...evidence,gesture:{duration:1.4,elapsed:1.4,completed:true}}},snapshot);assert.match(completed,/Handoff completed/);assert.match(completed,/Pip received Orange Tulip/);
  const unproven=h.socialRecordMarkup({...base,status:'canceled',giftEvidence:{...evidence,after:{carrier:'actor',carried:true}}},snapshot);assert.ok(!unproven.includes('Pip received Orange Tulip'));
});

test('active gift status names giver, recipient and object without calling it a conversation',()=>{
  const h=helpers(),session={kind:'gift',initiatorId:'actor',partnerId:'pip',participants:['actor','pip'],objectId:'flower',phase:'invited',transferred:false},snapshot={actorId:'actor',stage:'socializing',actors:[{id:'actor',name:'Butterbot'},{id:'pip',name:'Pip'}],worldObjects:[{id:'flower',name:'Orange Tulip'}],social:{active:[session]}};
  assert.equal(h.planStatus(snapshot),'Waiting for Pip to accept Orange Tulip');session.phase='giving';assert.equal(h.socialActivityStatus(snapshot),'Handing Orange Tulip to Pip');snapshot.actorId='pip';assert.equal(h.socialActivityStatus(snapshot),'Receiving Orange Tulip from Butterbot');session.transferred=true;assert.equal(h.planStatus(snapshot),'Finishing the handoff of Orange Tulip');
});

test('character selection disables real request controls until API acknowledgment and the selected SSE state both arrive',async()=>{
  const {context:c,nodes,buttons,requests}=requestFixture(),switching=c.selectActor('pip');assert.equal(nodes.get('#send').disabled,true);assert.equal(nodes.get('#objective-input').disabled,true);assert.ok(buttons.every(b=>b.disabled));assert.equal(nodes.get('#talk-label').textContent,'Switching to Pip…');
  assert.equal(await c.submitCharacterObjective('Dance'),false);assert.equal(requests.length,1,'quick submission must not target Butterbot');requests[0].resolve({ok:true});await switching;assert.equal(nodes.get('#send').disabled,true,'HTTP completion alone does not confirm the selected snapshot');assert.equal(await c.submitCharacterObjective('Dance'),false);
  c.state={...c.state,actorId:'pip',actorName:'Pip'};c.renderUI();assert.equal(nodes.get('#send').disabled,false);assert.equal(nodes.get('#talk-label').textContent,'Tell Pip something');assert.equal(await c.submitCharacterObjective('Dance',true),true);assert.deepEqual(plain(requests.at(-1).data),{actorId:'pip',objective:'Dance'});assert.equal(nodes.get('#objective-input').value,'');
});

test('the Retry button continues the identified failed request instead of assigning a duplicate objective',async()=>{
  const {context:c,nodes,requests}=requestFixture();c.state.lastUserGoal={status:'failed',text:'Print an orange, then give it to Pip.',cycle:189};
  vm.runInContext(section("$('#retry-request').onclick=", "$('#talk-form').onsubmit="),c);
  await nodes.get('#retry-request').onclick();assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/resume');
  assert.deepEqual(plain(requests[0].data),{actorId:'actor',objective:c.state.lastUserGoal.text,cycle:189});
  assert.equal(nodes.get('#objective-input').value,'A quick new goal','retry leaves any draft message alone');
  assert.equal(nodes.get('#send-status').textContent,'Continuing Butterbot’s request');
  c.state.lastUserGoal.status='active';await nodes.get('#retry-request').onclick();assert.equal(requests.length,1);
});

test('selection also waits when SSE arrives first, and a failed or superseded selection cannot leave controls locked',async()=>{
  const {context:c,nodes,requests,errors}=requestFixture(),switching=c.selectActor('pip');c.state={...c.state,actorId:'pip',actorName:'Pip'};c.renderUI();assert.equal(nodes.get('#send').disabled,true,'SSE alone does not acknowledge the request');requests[0].resolve({ok:true});await switching;assert.equal(nodes.get('#send').disabled,false);
  const failing=c.selectActor('actor');requests[1].reject(Error('Selection unavailable'));await failing;assert.equal(nodes.get('#send').disabled,false);assert.equal(nodes.get('#talk-label').textContent,'Tell Pip something');assert.deepEqual(errors,['Selection unavailable']);
  const stale=c.selectActor('actor');c.state={...c.state,epoch:2};c.renderUI();requests[2].resolve({ok:true});await stale;assert.equal(nodes.get('#send').disabled,false);assert.equal(nodes.get('#talk-label').textContent,'Tell Pip something','old response cannot override the current actor');
});
