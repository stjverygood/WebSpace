import * as T from 'three';
import { createPlanet, nearest, planets, groundRadius, surfaceRadius } from './world';
import { Expedition, createAstronaut } from './exploration';
import { MobileControls } from './mobile';
import './style.css';
import './surface.css';
import './responsive.css';

const $=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
const canvas=$<HTMLCanvasElement>('universe');
const touchLayout=()=>matchMedia('(pointer: coarse), (max-width: 700px)').matches;
document.body.classList.toggle('touch-layout',touchLayout());
const keyboardKeys=new Set<string>();
let renderer:T.WebGLRenderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}
catch{ $('error').textContent='当前浏览器无法启动 WebGL。请使用支持硬件加速的桌面浏览器打开。';$('error').classList.remove('hidden');throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,touchLayout()?1.5:1.8));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
const scene=new T.Scene();scene.background=new T.Color(0x050b13);
const camera=new T.PerspectiveCamera(53,innerWidth/innerHeight,.15,18000);
const expedition=new Expedition();
const flight=expedition.flight;
let active=false,paused=false,selected=0,drag=false,uiTime=0,noticeTimer=0,lastOnFoot=false;
let clockTime=0,last=performance.now();
const labels={manual:'自由巡航',navigation:'自动导航',landing:'辅助降落',landed:'已着陆',takeoff:'起飞中'};
function notify(message:string){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=window.setTimeout(()=>$('notice').classList.remove('visible'),4200);}
expedition.onNotice=notify;

// A deterministic starfield keeps the composition consistent across restarts.
let seed=817;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const starPositions:number[]=[],starColors:number[]=[];
for(let i=0;i<4200;i++){
  const z=random()*2-1,a=random()*Math.PI*2,r=7200+random()*900;
  const t=Math.sqrt(1-z*z);starPositions.push(r*t*Math.cos(a),r*z,r*t*Math.sin(a));
  const color=new T.Color([0x9bb9cf,0xe6e7da,0x7ca5bd,0xcdb79a][Math.floor(random()*4)]).multiplyScalar(.35+random()*.8);
  starColors.push(color.r,color.g,color.b);
}
const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(starPositions,3));starGeo.setAttribute('color',new T.Float32BufferAttribute(starColors,3));
const stars=new T.Points(starGeo,new T.PointsMaterial({size:2.9,vertexColors:true,sizeAttenuation:true,transparent:true,opacity:.85,depthWrite:false}));scene.add(stars);
// Sparse, soft galactic dust rather than a bright wallpaper.
const dustPositions:number[]=[],dustColors:number[]=[];
for(let i=0;i<1500;i++){
  const a=random()*Math.PI*2,z=(random()-.5)*.25,r=6900;
  dustPositions.push(Math.cos(a)*r,z*r+Math.sin(a)*1600,Math.sin(a)*r);
  const c=new T.Color(0x30525e).multiplyScalar(random()*.25);dustColors.push(c.r,c.g,c.b);
}
const dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.Float32BufferAttribute(dustPositions,3));dustGeo.setAttribute('color',new T.Float32BufferAttribute(dustColors,3));
scene.add(new T.Points(dustGeo,new T.PointsMaterial({size:13,vertexColors:true,transparent:true,opacity:.4,depthWrite:false})));
scene.add(new T.HemisphereLight(0xbed5dd,0x24373e,1.6));
const sunlight=new T.DirectionalLight(0xffe2bb,3.3);sunlight.position.set(-2000,1800,1800);scene.add(sunlight);
const fill=new T.DirectionalLight(0x78bed2,.7);fill.position.set(1200,200,100);scene.add(fill);
for(const p of planets)scene.add(createPlanet(p));

const sunPosition=new T.Vector3(-3200,1000,-5200);
const sun=new T.Mesh(new T.SphereGeometry(64,24,16),new T.MeshBasicMaterial({color:0xffe2b0}));sun.position.copy(sunPosition);scene.add(sun);
const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
const ctx=glowCanvas.getContext('2d')!;const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
gradient.addColorStop(0,'rgba(255,234,194,.65)');gradient.addColorStop(.08,'rgba(255,216,164,.32)');gradient.addColorStop(.3,'rgba(255,190,132,.08)');gradient.addColorStop(1,'rgba(255,170,110,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
const glow=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));glow.position.copy(sunPosition);glow.scale.set(1900,1900,1);scene.add(glow);

// One instanced draw call for the entire asteroid field.
const rocks=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:0x7b7972,roughness:1,flatShading:true}),190);
const dummy=new T.Object3D();
for(let i=0;i<190;i++){
  const angle=random()*Math.PI*2,radius=500+random()*200;
  dummy.position.set(-530+Math.cos(angle)*radius,170+(random()-.5)*140,-1600+Math.sin(angle)*radius);
  dummy.rotation.set(random()*6,random()*6,random()*6);const size=1.5+random()*8;dummy.scale.set(size,size*(.5+random()),size*(.5+random()));dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
}scene.add(rocks);

function buildShip(){
  const ship=new T.Group();
  const ivory=new T.MeshStandardMaterial({color:0xe2e2ce,roughness:.52,metalness:.35,flatShading:true});
  const dark=new T.MeshStandardMaterial({color:0x26353c,roughness:.5,metalness:.6,flatShading:true});
  const edge=new T.MeshStandardMaterial({color:0x839697,roughness:.5,metalness:.65,flatShading:true});
  function hull(vertices:number[],indices:number[],material:T.Material){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const m=new T.Mesh(g,material);ship.add(m);return m;}
  hull([0,.1,-5.6, -1.2,.25,-.2, 1.2,.25,-.2, -1.1,.05,3.3, 1.1,.05,3.3, 0,1.05,.3, 0,-.65,.7], [0,1,5,0,5,2,1,3,5,2,5,4,3,4,5,0,6,1,0,2,6,1,6,3,2,4,6,3,6,4],ivory);
  for(const side of [-1,1]){
    hull([side*.75,0,-1.9, side*5.1,-.3,2.5, side*4.7,-.4,3.4, side*.9,-.22,2.7,side*2.0,.3,1.6],side===1?[0,4,1,1,4,2,2,4,3,3,4,0,0,1,3,1,2,3]:[0,1,4,1,2,4,2,3,4,3,0,4,0,3,1,1,3,2],ivory);
    const nacelle=new T.Mesh(new T.CylinderGeometry(.46,.38,3.3,6),dark);nacelle.rotation.x=Math.PI/2;nacelle.position.set(side*1.6,-.05,1.65);ship.add(nacelle);
    const nozzle=new T.Mesh(new T.CylinderGeometry(.33,.48,.8,8),edge);nozzle.rotation.x=Math.PI/2;nozzle.position.set(side*1.6,-.05,3.55);ship.add(nozzle);
    const stripe=new T.Mesh(new T.BoxGeometry(.14,.04,1.7),dark);stripe.position.set(side*3.25,-.07,2.18);stripe.rotation.y=side*-.57;ship.add(stripe);
    const light=new T.Mesh(new T.BoxGeometry(.1,.08,.5),new T.MeshBasicMaterial({color:side===1?0xffa992:0xb9efd9}));light.position.set(side*4.6,-.26,2.67);ship.add(light);
    const fin=new T.Mesh(new T.ConeGeometry(.48,1.9,3),dark);fin.position.set(side*.9,.8,2.5);fin.rotation.x=-.28;fin.scale.z=1.5;ship.add(fin);
  }
  const cockpit=new T.Mesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:0x163d4b,metalness:.8,roughness:.2,emissive:0x153b47,emissiveIntensity:.3}));cockpit.scale.set(.65,.5,1.6);cockpit.position.set(0,.75,-.7);ship.add(cockpit);
  const engines:T.Mesh[]=[];
  for(const side of [-1,1]){
    const flame=new T.Mesh(new T.ConeGeometry(.28,2.4,8),new T.MeshBasicMaterial({color:0x9ce4ef,transparent:true,opacity:.75,depthWrite:false,blending:T.AdditiveBlending}));flame.rotation.x=-Math.PI/2;flame.position.set(side*1.6,-.05,4.7);ship.add(flame);engines.push(flame);
    const core=new T.Mesh(new T.CircleGeometry(.28,12),new T.MeshBasicMaterial({color:0xd6ffff,side:T.DoubleSide}));core.position.set(side*1.6,-.05,3.99);ship.add(core);
  }
  return {ship,engines};
}
const {ship,engines}=buildShip();scene.add(ship);
const astronaut=createAstronaut();scene.add(astronaut.root);astronaut.root.visible=false;
const contactShadow=new T.Mesh(new T.CircleGeometry(.6,24),new T.MeshBasicMaterial({color:0x07191d,transparent:true,opacity:.2,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));scene.add(contactShadow);contactShadow.visible=false;
const motionGeometry=new T.BufferGeometry();const motionPositions=new Float32Array(80*6);motionGeometry.setAttribute('position',new T.BufferAttribute(motionPositions,3));
const motionMaterial=new T.LineBasicMaterial({color:0xa1c8d4,transparent:true,opacity:0,depthWrite:false});const motion=new T.LineSegments(motionGeometry,motionMaterial);scene.add(motion);
const mist=new T.FogExp2(0x7d9c9e,0);scene.fog=mist;
const bars=$('speed-bars');for(let i=0;i<12;i++)bars.append(document.createElement('b'));

// Sound is synthesized locally, only after a user gesture, with a short fade.
let audio:AudioContext|undefined,engineGain:GainNode|undefined,oscillator:OscillatorNode|undefined,soundEnabled=false;
function initAudio(){
  if(audio)return;
  audio=new AudioContext();oscillator=audio.createOscillator();engineGain=audio.createGain();
  const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=160;
  oscillator.type='sawtooth';oscillator.frequency.value=36;engineGain.gain.value=0;
  oscillator.connect(filter);filter.connect(engineGain);engineGain.connect(audio.destination);oscillator.start();
}
$('sound').onclick=()=>{try{initAudio();soundEnabled=!soundEnabled;void audio?.resume();$('sound-state').textContent=soundEnabled?'开':'关';$('sound').setAttribute('aria-pressed',String(soundEnabled));}catch{notify('此浏览器暂不支持音频');}};

const mobile=new MobileControls({enabled:()=>active&&!paused,onFoot:()=>expedition.onFoot,look:(x,y)=>{flight.mouseX+=x;flight.mouseY+=y;},interact:()=>expedition.interact(),takeoff:()=>expedition.takeoff(),jump:()=>{if(expedition.onFoot)expedition.walker.jump();}});
function release(){drag=false;keyboardKeys.clear();mobile.reset();flight.keys.clear();flight.mouseX=0;flight.mouseY=0;if(document.pointerLockElement)document.exitPointerLock();}
function menuView(){
  $('pause-menu').classList.remove('hidden');$('instructions-view').classList.add('hidden');
  document.querySelector('.modal')?.setAttribute('aria-labelledby','modal-title');
}
function pause(){paused=true;release();menuView();document.body.classList.add('is-paused');$('pause-overlay').classList.remove('hidden');$('resume').focus();}
function lock(){if(touchLayout())return;try{const result=canvas.requestPointerLock();if(result)void result.catch(()=>{});}catch{/* Drag and keyboard controls remain available. */}}
function resume(){paused=false;document.body.classList.remove('is-paused');$('pause-overlay').classList.add('hidden');if(active){canvas.focus();lock();}else $('start').focus();}
function showManual(platform:'desktop'|'mobile'){
  const isMobile=platform==='mobile';
  $('manual-desktop').classList.toggle('hidden',isMobile);$('manual-mobile').classList.toggle('hidden',!isMobile);
  $('manual-desktop-tab').setAttribute('aria-selected',String(!isMobile));$('manual-mobile-tab').setAttribute('aria-selected',String(isMobile));
}
function start(){active=true;paused=false;document.body.classList.remove('is-paused');document.body.classList.add('active-flight');$('intro').classList.add('departed');$('intro').inert=true;$('pause-overlay').classList.add('hidden');$('reticle').classList.remove('hidden');lock();notify(touchLayout()?'左下摇杆移动 · 滑动右侧转向 · 右上角暂停':'W 推进 · 鼠标转向 · 空格制动 · N 自动前往目标');}
$('start').onclick=start;
$('resume').onclick=resume;
$('pause-button').onclick=pause;$('pause-shortcut').onclick=pause;
$('show-instructions').onclick=()=>{
  $('pause-menu').classList.add('hidden');$('instructions-view').classList.remove('hidden');
  document.querySelector('.modal')?.setAttribute('aria-labelledby','instructions-title');
  showManual(touchLayout()?'mobile':'desktop');$('instructions-back').focus();
};
$('instructions-back').onclick=()=>{menuView();$('show-instructions').focus();};
$('manual-desktop-tab').onclick=()=>showManual('desktop');$('manual-mobile-tab').onclick=()=>showManual('mobile');
$('home').onclick=e=>{e.preventDefault();pause();};
$('reset').onclick=()=>{release();expedition.reset();camera.position.copy(flight.position).add(new T.Vector3(0,7,24));selected=0;updateCard();paused=false;active=false;document.body.classList.remove('active-flight','on-foot','is-paused');$('intro').classList.remove('departed');$('intro').inert=false;$('pause-overlay').classList.add('hidden');$('reticle').classList.add('hidden');$('start').focus();notify('已返回出发点');};
function updateCard(){const p=planets[selected];$('planet-name').textContent=p.name;$('planet-code').textContent=p.code;$('planet-description').textContent=p.description;$('planet-type').textContent=p.type;$('planet-index').textContent=`0${selected+1} / 03`;$('marker-name').textContent=p.name;}
$('next').onclick=()=>{selected=(selected+1)%planets.length;updateCard();};
$('previous').onclick=()=>{selected=(selected+planets.length-1)%planets.length;updateCard();};
function navigate(){if(paused)return;if(!active)start();if(flight.mode==='navigation'){flight.cancel();release();return;}expedition.navigate(planets[selected]);release();}
$('approach').onclick=navigate;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;if(active&&!paused){drag=true;if(!document.pointerLockElement)lock();}});
addEventListener('mouseup',()=>drag=false);
addEventListener('mousemove',e=>{if(active&&!paused&&(document.pointerLockElement===canvas||drag)){flight.mouseX+=T.MathUtils.clamp(e.movementX,-80,80);flight.mouseY+=T.MathUtils.clamp(e.movementY,-80,80);}});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){drag=false;flight.mouseX=0;flight.mouseY=0;}});
addEventListener('keydown',e=>{
  if(paused){
    if(e.code==='Escape'&&!e.repeat){e.preventDefault();if(!$('instructions-view').classList.contains('hidden')){menuView();$('show-instructions').focus();}else resume();}
    if(e.code==='Tab'){
      const visible=Array.from(document.querySelectorAll<HTMLElement>('.modal button')).filter(el=>el.getClientRects().length>0);
      const first=visible[0],last=visible[visible.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }return;
  }
  if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)&&active)e.preventDefault();
  if(e.code==='Escape'&&!e.repeat){pause();return;}
  if(!active||paused||e.repeat)return;
  if(e.code==='KeyF'){expedition.interact();return;}
  if(e.code==='KeyR'){expedition.takeoff();return;}
  if(e.code==='Space'&&expedition.onFoot){expedition.walker.jump();return;}
  if(e.code==='KeyN'){if(flight.mode==='navigation')flight.cancel();else navigate();return;}
  keyboardKeys.add(e.code);
});
addEventListener('keyup',e=>keyboardKeys.delete(e.code));
addEventListener('blur',()=>{if(active&&!paused)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)pause();});
$('landing-prompt').onclick=()=>expedition.interact();
$('takeoff-prompt').onclick=()=>expedition.takeoff();
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,touchLayout()?1.5:1.8));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();document.body.classList.toggle('touch-layout',touchLayout());mobile.reset();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();notify('图形上下文已丢失，请刷新页面重新进入');});

const cameraPosition=new T.Vector3(),cameraLook=new T.Vector3(),worldUp=new T.Vector3(0,1,0),projection=new T.Vector3();
camera.position.copy(flight.position).add(new T.Vector3(0,7,24));
function frame(now:number){
  const dt=Math.min((now-last)/1000,.04);last=now;
  if(!paused){clockTime+=dt;if(active){
    flight.keys.clear();for(const code of keyboardKeys)flight.keys.add(code);for(const code of mobile.keys)flight.keys.add(code);
    expedition.update(dt);
  }}
  if(lastOnFoot!==expedition.onFoot){keyboardKeys.clear();mobile.reset();flight.keys.clear();lastOnFoot=expedition.onFoot;}
  const onFoot=expedition.onFoot,walker=expedition.walker;
  const actorPosition=onFoot?walker.position:flight.position;
  const actorSpeed=onFoot?walker.speed:flight.speed;
  const local=onFoot?{...nearest(walker.position),altitude:walker.altitude}:flight.local;
  const near=T.MathUtils.clamp(1-local.altitude/110,0,1);
  document.body.classList.toggle('on-foot',onFoot);
  astronaut.root.visible=onFoot;astronaut.animate(walker);
  contactShadow.visible=onFoot;
  if(onFoot){
    const normal=walker.normal;
    contactShadow.position.copy(walker.body.center).addScaledVector(normal,groundRadius(walker.body,normal)+.025);
    contactShadow.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);
    (contactShadow.material as T.MeshBasicMaterial).opacity=.2/(1+walker.altitude*.3);
    contactShadow.scale.setScalar(1+Math.min(walker.altitude,6)*.08);
  }
  ship.position.copy(flight.position);ship.quaternion.copy(flight.rotation);
  if(!active){ship.position.y+=Math.sin(clockTime*.65)*.45;ship.rotateZ(Math.sin(clockTime*.3)*.025);}
  const boosting=flight.keys.has('ShiftLeft')&&flight.keys.has('KeyW');
  for(let i=0;i<engines.length;i++){const engine=engines[i];engine.scale.y=(flight.mode==='landed'?.05:boosting?2.4:.45+flight.speed/130)*(1+Math.sin(clockTime*35+i)*.07);engine.visible=flight.mode!=='landed';}
  const desiredCamera=new T.Vector3(0,active?5.2:6.5,active?21+Math.min(flight.speed/50,5):23).applyQuaternion(flight.rotation).add(ship.position);
  const desiredLook=new T.Vector3(active?0:3.5,active?1:2.3,active&&local.altitude<25?-12:-28).applyQuaternion(flight.rotation).add(ship.position);
  const cameraUp=onFoot?walker.normal:new T.Vector3(0,1,0).applyQuaternion(flight.rotation);
  if(onFoot){
    desiredLook.copy(walker.position).addScaledVector(cameraUp,1.25);
    desiredCamera.copy(desiredLook).addScaledVector(walker.forward,-7.8*Math.cos(walker.pitch)).addScaledVector(cameraUp,7.8*Math.sin(walker.pitch)+1);
  }
  cameraPosition.copy(desiredCamera);
  // A chase camera must remain above terrain even when the player flies towards it.
  for(const p of planets){const radial=cameraPosition.clone().sub(p.center);const direction=radial.clone().normalize();const safe=(onFoot?groundRadius(p,direction):surfaceRadius(p,direction))+(onFoot?.65:4);if(radial.length()<safe)cameraPosition.copy(p.center).addScaledVector(direction,safe);}
  if(!paused){camera.position.lerp(cameraPosition,1-Math.exp(-dt*(onFoot?8:4)));cameraLook.lerp(desiredLook,1-Math.exp(-dt*(onFoot?9:5)));worldUp.lerp(cameraUp,1-Math.exp(-dt*6));}
  // Clamp the interpolated camera too, so entering a hillside never clips through it.
  if(onFoot){const radial=camera.position.clone().sub(walker.body.center);const direction=radial.clone().normalize();const safe=groundRadius(walker.body,direction)+.65;if(radial.length()<safe)camera.position.copy(walker.body.center).addScaledVector(direction,safe);}
  camera.up.copy(worldUp).normalize();camera.lookAt(cameraLook);
  const portrait=touchLayout()&&camera.aspect<1;
  const fov=onFoot?(portrait?64:58):(portrait?68:53)+(active?Math.min(flight.speed/35,7):0);camera.fov=T.MathUtils.lerp(camera.fov,fov,.04);camera.updateProjectionMatrix();
  stars.position.copy(camera.position);
  mist.color.setHex(local.body.atmosphere);mist.density=near*near*.00085;
  (scene.background as T.Color).set(0x050b13).lerp(new T.Color(local.body.atmosphere).multiplyScalar(.28),near*near*.8);
  (stars.material as T.PointsMaterial).opacity=.85*(1-near*.85);
  motionMaterial.opacity=active&&!onFoot?T.MathUtils.clamp((flight.speed-90)/500,0,.22):0;
  if(motionMaterial.opacity>0&&!paused){
    for(let i=0;i<80;i++){
      const a=i*2.39996,r=15+(i%9)*4,z=-80+((clockTime*flight.speed*.5+i*13)%130);
      const v1=new T.Vector3(Math.cos(a)*r,Math.sin(a)*r,z).applyQuaternion(flight.rotation).add(flight.position);
      const v2=new T.Vector3(0,0,Math.min(flight.speed*.025,8)).applyQuaternion(flight.rotation).add(v1);
      motionPositions.set([v1.x,v1.y,v1.z,v2.x,v2.y,v2.z],i*6);
    }motionGeometry.getAttribute('position').needsUpdate=true;motionGeometry.computeBoundingSphere();
  }
  if(audio&&engineGain&&oscillator){engineGain.gain.setTargetAtTime(soundEnabled&&active&&!paused&&flight.mode!=='landed'?.012+flight.speed*.00006:0,audio.currentTime,.25);oscillator.frequency.setTargetAtTime(32+flight.speed*.16,audio.currentTime,.2);}
  uiTime+=dt;
  if(uiTime>.08){
    uiTime=0;$('speed').textContent=onFoot?actorSpeed.toFixed(1):Math.round(actorSpeed).toString();
    Array.from(bars.children).forEach((el,i)=>el.classList.toggle('on',i<Math.ceil(actorSpeed/(onFoot?7:260)*12)));
    const distance=Math.max(0,actorPosition.distanceTo(planets[selected].center)-planets[selected].radius);
    $('target-distance').textContent=distance>=1000?`${(distance/1000).toFixed(2)} km`:`${distance.toFixed(0)} m`;
    $('flight-mode').textContent=paused?'已暂停':onFoot?(walker.grounded?'地表探索':'腾空中'):active?labels[flight.mode]:'等待启航';
    $('coordinates').textContent=`X ${actorPosition.x.toFixed(0).padStart(5,'0')}   Y ${actorPosition.y.toFixed(0).padStart(5,'0')}   Z ${actorPosition.z.toFixed(0).padStart(5,'0')}`;
    $('alt-label').innerHTML=onFoot?'LOCAL GRAVITY <span>当地重力</span>':local.altitude<180?'ALTITUDE <span>地表高度</span>':'FLIGHT LOG <span>航行记录</span>';
    $('altitude').textContent=onFoot?`${walker.body.gravity.toFixed(1)} m/s² · ${(walker.body.gravity/9.8).toFixed(2)} g`:local.altitude<180?`${Math.max(0,local.altitude-2.8).toFixed(1)} m · ${local.body.name}`:flight.mode==='navigation'?`前往 ${flight.target.name} · 自动减速`:'一切未知，皆可抵达。';
    $('surface-info').classList.toggle('hidden',!onFoot);
    $('surface-planet').textContent=walker.body.name;
    $('surface-gravity').textContent=`GRAVITY ${walker.body.gravity.toFixed(1)} m/s² · ${(walker.body.gravity/9.8).toFixed(2)} g`;
    if(onFoot){const toShip=flight.position.clone().sub(walker.position);const right=new T.Vector3().crossVectors(walker.forward,walker.normal);$('ship-bearing').style.transform=`rotate(${Math.atan2(toShip.dot(right),toShip.dot(walker.forward))*180/Math.PI}deg)`;}
    $('ship-distance').textContent=`${expedition.shipDistance.toFixed(0)} m`;
    $('surface-state').textContent=walker.grounded?'靴下是一个新的世界。':`离地 ${Math.max(0,walker.altitude-.04).toFixed(1)} m`;
    $('boost-label').textContent=onFoot?'奔跑':'加速';$('space-label').textContent=onFoot?'跳跃':'制动';$('interact-label').textContent=onFoot?'登船':'下船';
    const canLand=active&&(onFoot?expedition.canBoard:(local.altitude<90&&flight.speed<20||flight.mode==='landed'));
    $('landing-prompt').classList.toggle('hidden',!canLand||!onFoot&&(flight.mode==='landing'||flight.mode==='takeoff'));
    $('landing-text').textContent=onFoot?'登上飞船':flight.mode==='landed'?'离开飞船 · 地表探索':'降落并下船';
    $('touch-boost').textContent=onFoot?'奔跑':'加速';$('joystick-label').textContent=onFoot?'移动':'推进 / 平移';
    $('touch-action').textContent=onFoot?'登船':'下船';
    $<HTMLButtonElement>('touch-action').disabled=onFoot?!expedition.canBoard:!canLand||flight.mode==='landing'||flight.mode==='takeoff';
    $('touch-launch').classList.toggle('hidden',onFoot||flight.mode!=='landed');
    $('approach').innerHTML=flight.mode==='navigation'?'取消导航 <span>×</span>':'设为航向 <span>↗</span>';
    $('takeoff-prompt').classList.toggle('hidden',!active||onFoot||flight.mode!=='landed');
    projection.copy(onFoot?flight.position:planets[selected].center).project(camera);
    $('marker-name').textContent=onFoot?`飞船 · ${expedition.shipDistance.toFixed(0)} m`:planets[selected].name;
    const visible=active&&projection.z<1&&projection.z>0&&Math.abs(projection.x)<.85&&Math.abs(projection.y)<.75&&(onFoot||distance>180);
    $('target-marker').classList.toggle('hidden',!visible);
    if(visible){$('target-marker').style.left=`${(projection.x*.5+.5)*innerWidth}px`;$('target-marker').style.top=`${(-projection.y*.5+.5)*innerHeight}px`;}
  }
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
cameraLook.copy(flight.position).add(new T.Vector3(3.5,2.3,-28));
updateCard();requestAnimationFrame(frame);

// A read-only snapshot supports reproducible diagnostics without changing gameplay.
Object.defineProperty(window,'astral',{value:{snapshot:()=>({mode:expedition.onFoot?'on-foot':flight.mode,active,paused,speed:expedition.onFoot?expedition.walker.speed:flight.speed,altitude:expedition.onFoot?expedition.walker.altitude:flight.local.altitude,gravity:expedition.onFoot?expedition.walker.body.gravity:flight.local.body.gravity,grounded:expedition.walker.grounded,shipDistance:expedition.shipDistance,planet:expedition.onFoot?expedition.walker.body.name:flight.local.body.name,position:(expedition.onFoot?expedition.walker.position:flight.position).toArray(),renderer:renderer.info.render})},writable:false});
