// Normalize presentation differences only; retain punctuation, numbers and negation.
const memoryTextKey=text=>text.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();
export function updateMemory(brain,operations){
  if(!Array.isArray(operations)||operations.length>3)throw Error('Reflection may make at most three memory edits');
  const next=brain.memory.map((m,i)=>({...m,accessTick:m.accessTick??i}));let serial=brain.memorySerial||0;let memoryClock=Math.max(brain.memoryClock||0,...next.map(m=>m.accessTick),0);const now=Date.now();
  for(const op of operations){if(!['remember','revise','forget'].includes(op.operation)||!['experience','preference','belief'].includes(op.kind)||typeof op.text!=='string'||op.text.length>180)throw Error('Invalid memory edit');
    const i=next.findIndex(m=>m.id===op.id);if(op.operation!=='remember'&&i<0)throw Error('Memory edit referenced an unknown entry');
    if(op.operation==='forget'){next.splice(i,1);continue;}
    if(!op.text.trim())throw Error('Empty memory');
    if(op.operation==='remember'){
      const key=memoryTextKey(op.text),existing=next.find(m=>m.kind===op.kind&&memoryTextKey(m.text)===key);
      if(existing){Object.assign(existing,{time:brain.time,updatedAt:now,lastUsed:now,accessTick:++memoryClock});continue;}
    }
    const entry={id:op.operation==='remember'?brain.actorId+'-memory-'+(++serial):op.id,text:op.text,kind:op.kind,source:'generated character memory',time:brain.time,createdAt:op.operation==='remember'?now:next[i].createdAt||now,updatedAt:now,lastUsed:now,accessTick:++memoryClock};if(op.operation==='remember')next.push(entry);else next[i]=entry;
  }
  const evicted=[];while(next.length>12){let victim=0;for(let i=1;i<next.length;i++)if(next[i].accessTick<next[victim].accessTick)victim=i;evicted.push(next.splice(victim,1)[0]);}brain.memory=next;brain.memorySerial=serial;brain.memoryClock=memoryClock;brain.lastEvictions=evicted.map(m=>({id:m.id,reason:'least recently used',time:brain.time}));return brain.memory;
}
export function retrieveMemory(brain,query,limit=3){const words=new Set(String(query).toLowerCase().match(/[a-z]{4,}/g)||[]),ranked=brain.memory.map(m=>({m,score:[...words].filter(w=>m.text.toLowerCase().includes(w)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||(b.m.accessTick||0)-(a.m.accessTick||0)).slice(0,limit);const now=Date.now();for(const {m}of ranked){m.lastUsed=now;m.accessTick=++brain.memoryClock;}brain.recalledMemory=ranked.map(x=>x.m);return brain.recalledMemory;}
