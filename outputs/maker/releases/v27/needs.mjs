// Need points are gameplay values. Hunger rises toward 100; the other bars fall.
// Garden calls fulfillment only after its corresponding physical action succeeds.
export const NEED_DEFAULTS=Object.freeze({energy:85,fun:65,hunger:25,hygiene:80,social:65,comfort:75});
export const NEED_RATES=Object.freeze({hunger:.075,energy:.08,fun:.075,hygiene:.075,social:.055,comfort:.0675});
const clamp=value=>Math.max(0,Math.min(100,value));
const elapsedTime=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Elapsed time must be a finite nonnegative number');return value;};
const trait=(brain,key)=>{const value=brain.core?.traits?.[key];return value===true?1:typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;};

export function lifeNeeds(initial={}){
  if(!initial||typeof initial!=='object'||Array.isArray(initial))throw Error('Initial needs must be an object');
  return Object.fromEntries(Object.entries(NEED_DEFAULTS).map(([key,fallback])=>[key,clamp(typeof initial[key]==='number'&&Number.isFinite(initial[key])?initial[key]:fallback)]));
}

export function tickNeeds(brain,dt){
  elapsedTime(dt);const next=lifeNeeds(brain.needs),activity=brain.actor?.activity||brain.job?.action,active=activity==='dance'?1.65:brain.actor?.walking?1.25:1;
  const rates={
    hunger:NEED_RATES.hunger*(active>1?1.15:1),
    energy:NEED_RATES.energy*(1-.2*trait(brain,'energetic'))*active,
    fun:NEED_RATES.fun*(1+.25*trait(brain,'playful')),
    hygiene:NEED_RATES.hygiene*(1-.2*trait(brain,'neat'))*(activity==='dance'?1.4:1),
    social:NEED_RATES.social*(1+.25*trait(brain,'sociable')),
    comfort:NEED_RATES.comfort*(1-.25*trait(brain,'resilient'))*(brain.actor?.walking?1.15:1)
  };
  for(const key of Object.keys(next))next[key]=clamp(next[key]+rates[key]*dt*(key==='hunger'?1:-1));
  brain.needs=next;return next;
}

export function fulfillNeed(brain,kind,elapsed=1){
  elapsedTime(elapsed);const next=lifeNeeds(brain.needs);
  const effects={rest:{energy:2.6,comfort:.8},sleep:{energy:4.5,comfort:2},wash:{hygiene:8,comfort:1},sit:{comfort:4,energy:.5},dance:{fun:3,energy:-.65,hygiene:-.2},socialize:{social:4,fun:.6}};
  if(kind==='socialize'){
    const entities=brain.garden?.physics?.entities||brain.physics?.entities,partner=entities?.get(brain.job?.target),actor=brain.actor||entities?.get(brain.actorId);
    if(!actor?.controller||!partner?.controller||partner.id===brain.actorId)throw Error('Social fulfillment requires another real character participant');
    const a=actor.body.translation(),b=partner.body.translation();if(Math.hypot(a.x-b.x,a.z-b.z)>2.7)throw Error('Social participant must be nearby');
  }
  if(kind==='eat'){
    // One successful serving-consumption event, never one call per animation tick.
    if(elapsed>0){next.hunger=clamp(next.hunger-28);next.energy=clamp(next.energy+2);next.comfort=clamp(next.comfort+3);}
  }else{
    const effect=effects[kind];if(!effect)throw Error('Unsupported need fulfillment: '+kind);
    for(const [key,rate]of Object.entries(effect))next[key]=clamp(next[key]+rate*elapsed);
  }
  brain.needs=next;return next;
}

const anchored={portable:false,anchored:true,edible:false,servings:0,throwable:false,giftable:false,pushable:false};
const build=`const g=new THREE.Group();function box(name,x,y,z,w,h,d,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshToonMaterial({color}));m.name=name;m.position.set(x,y,z);g.add(m);return m;}function cylinder(name,x,y,z,r,h,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),new THREE.MeshToonMaterial({color}));m.name=name;m.position.set(x,y,z);g.add(m);return m;}`;

export function accommodationDesigns(){
  return [
    {id:'home-bed',position:{x:6,y:.55,z:5},proposal:{
      name:'Garden daybed',description:'A sturdy wooden daybed with a soft teal mattress and a cream pillow. Supports lying down to rest.',kind:'prop',mass:48,affordances:['rest'],attributes:{...anchored},
      code:build+`for(const x of [-.55,.55])for(const z of [-.92,.92])box('wood_leg',x,.16,z,.12,.32,.12,0x936244);box('wood_frame',0,.34,0,1.35,.16,2.25,0xb18356);box('mattress',0,.52,0,1.23,.22,2.08,0x69aeb1);box('pillow',0,.69,-.72,.85,.16,.44,0xffeac7);box('headboard',0,.72,-1.10,1.35,.70,.12,0xb18356);return g;`
    }},
    {id:'garden-shower',position:{x:7,y:1.38,z:-3},proposal:{
      name:'Garden shower',description:'An anchored shower with a tiled tray, drain, upright pipe and overhead showerhead. Supports washing.',kind:'prop',mass:72,affordances:['wash'],attributes:{...anchored},
      code:build+`box('shower_tray',0,.06,0,1.65,.12,1.65,0xe6ede6);box('tray_rim_left',-.79,.13,0,.07,.16,1.65,0x83bbc0);box('tray_rim_right',.79,.13,0,.07,.16,1.65,0x83bbc0);box('tray_rim_back',0,.13,-.79,1.65,.16,.07,0x83bbc0);cylinder('drain',0,.128,.16,.095,.012,0x667a7d);cylinder('water_pipe',-.70,1.37,-.65,.035,2.62,0x94aeb3);const arm=box('overhead_pipe',-.35,2.68,-.325,.07,.07,Math.hypot(.70,.65),0x94aeb3);arm.rotation.y=Math.atan2(.70,.65);cylinder('shower_head',0,2.68,0,.17,.07,0xc3d5d5);box('tap_panel',-.70,1.15,-.59,.24,.30,.06,0x72a4ae);for(const x of [-.77,-.63])cylinder('water_tap',x,1.18,-.54,.045,.055,x<-.70?0xc96d61:0x568cae);return g;`
    }},
    {id:'park-bench',position:{x:2,y:.65,z:-5},proposal:{
      name:'Park bench',description:'An anchored wooden bench with a slatted seat and back. Supports sitting for comfort.',kind:'prop',mass:36,affordances:['sit'],attributes:{...anchored},
      code:build+`for(const x of [-.68,.68]){box('bench_leg',x,.28,0,.10,.56,.56,0x576c67);box('back_support',x,.84,-.27,.075,.76,.075,0x576c67);}for(const z of [-.21,0,.21])box('seat_slat',0,.57,z,1.7,.12,.18,0xc28e55);for(const y of [.84,1.08])box('back_slat',0,y,-.29,1.7,.19,.10,0xc28e55);return g;`
    }},
    {id:'snack-bowl',position:{x:3,y:.26,z:1},proposal:{
      name:'Bowl of oranges',description:'A blue bowl containing six edible orange servings. Each eating action consumes one serving; the supply is finite.',kind:'prop',mass:1.8,affordances:['display'],attributes:{portable:true,anchored:false,edible:true,servings:6,throwable:false,giftable:true,pushable:true},
      code:build+`cylinder('bowl_base',0,.08,0,.31,.12,0x779fc3);const rim=new THREE.Mesh(new THREE.TorusGeometry(.30,.045,8,20),new THREE.MeshToonMaterial({color:0x90b6d4}));rim.name='bowl_rim';rim.rotation.x=Math.PI/2;rim.position.y=.16;g.add(rim);for(let i=0;i<6;i++){const angle=i*Math.PI/3,m=new THREE.Mesh(new THREE.SphereGeometry(.095,12,8),new THREE.MeshToonMaterial({color:i%2?0xef982d:0xf3ae3d}));m.name='orange_serving_'+i;m.position.set(Math.cos(angle)*.17,.23,Math.sin(angle)*.17);g.add(m);}return g;`
    }}
  ];
}
