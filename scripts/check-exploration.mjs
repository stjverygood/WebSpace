import assert from 'node:assert/strict';
import * as T from 'three';
import { Expedition, Walker } from '../src/exploration.ts';
import { planets, createPlanet, groundRadius, surfaceObstacles } from '../src/world.ts';
const step=(actor,seconds,dt=1/120)=>{for(let t=0;t<seconds;t+=dt)actor.update(dt);};
const results=[];
for(const p of planets){
  createPlanet(p);
  const e=new Expedition();e.navigate(p);step(e,45);
  e.interact();assert.ok(e.pendingExit,'F requests safe landing before exit');
  step(e,30);assert.ok(e.onFoot,`auto exit after landing on ${p.name}`);
  assert.equal(e.flight.mode,'landed');assert.equal(e.walker.body,p);
  assert.ok(e.walker.grounded);assert.ok(Math.abs(e.walker.altitude-.04)<.001,'feet match rendered triangle');
  assert.ok(e.canBoard,'spawn within boarding range');
  const parked=e.flight.position.clone();
  e.walker.jump();e.update(1/120);assert.ok(!e.canBoard,'cannot board in midair');
  e.interact();assert.ok(e.onFoot,'F cannot board in midair');
  let apex=0,airtime=0;
  for(let i=0;i<1200;i++){
    e.update(1/120);apex=Math.max(apex,e.walker.altitude-.04);airtime+=1/120;
    if(e.walker.grounded)break;
  }
  assert.ok(e.walker.grounded,'jump lands back on ground');
  assert.ok(Math.abs(apex-6.2**2/(2*p.gravity))<.08,`${p.name}: gravity controls apex`);
  assert.ok(Math.abs(airtime-2*6.2/p.gravity)<.06,'gravity controls flight time');
  assert.ok(e.flight.position.distanceTo(parked)<.0001,'ship stays parked while outside');
  e.interact();assert.ok(!e.onFoot,'near ship F boards');assert.equal(e.flight.mode,'landed','boarding does not auto take off');
  e.takeoff();step(e,4);assert.equal(e.flight.mode,'manual','R takes off after boarding');
  results.push({planet:p.name,gravity:p.gravity,apex:+apex.toFixed(2),airtime:+airtime.toFixed(2)});
  e.reset();assert.ok(!e.onFoot&&!e.pendingExit);assert.equal(e.flight.mode,'manual');
}
assert.ok(results[1].apex>results[0].apex&&results[0].apex>results[2].apex,'lower gravity gives higher jumps');
const e=new Expedition();e.navigate(planets[0]);step(e,45);e.interact();step(e,30);
const p=e.walker.body;
let normal=e.walker.normal.clone().applyAxisAngle(new T.Vector3(1,0,0),.4);
e.walker.spawn(p,p.center.clone().addScaledVector(normal,groundRadius(p,normal)),e.walker.forward);
assert.ok(!e.canBoard);e.interact();assert.ok(e.onFoot,'cannot board remotely');
e.navigate(planets[1]);assert.ok(e.onFoot&&e.flight.mode==='landed','cannot remotely fly parked ship');
const w=new Walker();
for(let i=0;i<100;i++){
  normal=new T.Vector3(Math.cos(i*2.4),.5,Math.sin(i*2.4)).normalize();
  const pos=p.center.clone().addScaledVector(normal,groundRadius(p,normal));
  if(surfaceObstacles(p).every(o=>pos.distanceTo(o.position)>o.radius+8)){w.spawn(p,pos,new T.Vector3(0,0,-1));break;}
}
const before=w.position.clone();w.keys.add('KeyW');step(w,2);w.keys.clear();
assert.ok(w.position.distanceTo(before)>4,'W moves character across terrain');
assert.ok(w.altitude>=.039,'walking does not penetrate ground');
const worldUp=new T.Vector3(0,1,0).applyQuaternion(w.rotation);
assert.ok(worldUp.dot(w.normal)>.999,'character stays upright on spherical world');
const f=new Expedition();f.interact();assert.ok(!f.onFoot&&!f.pendingExit,'cannot exit ship in space');
console.table(results);console.log('PASS: automatic safe disembarkation, ground walking, gravity-specific jumps, airborne/distance boarding guards, reboarding, takeoff, parked ship persistence and reset.');
