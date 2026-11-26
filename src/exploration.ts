import * as T from 'three';
import { Flight } from './flight.ts';
import { groundRadius, planets, surfaceObstacles, type Planet } from './world.ts';

const UP=new T.Vector3(0,1,0);
const FORWARD=new T.Vector3(0,0,-1);
function surfaceNormal(body:Planet,preferred:T.Vector3,clearance:number){
  const base=preferred.clone().normalize();
  let tangent=new T.Vector3().crossVectors(base,UP);
  if(tangent.lengthSq()<.001)tangent.crossVectors(base,new T.Vector3(1,0,0));
  tangent.normalize();const bitangent=new T.Vector3().crossVectors(base,tangent).normalize();
  for(let i=0;i<100;i++){
    const ring=i===0?0:Math.ceil(i/10)*.035,angle=i*2.399963;
    const normal=base.clone().multiplyScalar(Math.cos(ring))
      .addScaledVector(tangent,Math.sin(ring)*Math.cos(angle))
      .addScaledVector(bitangent,Math.sin(ring)*Math.sin(angle)).normalize();
    const point=body.center.clone().addScaledVector(normal,groundRadius(body,normal)+clearance);
    if(!surfaceObstacles(body).some(o=>point.distanceTo(o.position)<o.radius+clearance))return normal;
  }
  return base;
}

export class GroundVehicle {
  body:Planet;
  position=new T.Vector3();
  forward=new T.Vector3(0,0,-1);
  rotation=new T.Quaternion();
  speed=0;
  constructor(body:Planet){this.body=body;}
  get normal(){return this.position.clone().sub(this.body.center).normalize();}
  spawn(normal:T.Vector3,heading:T.Vector3){
    const n=surfaceNormal(this.body,normal,2.8);
    this.position.copy(this.body.center).addScaledVector(n,groundRadius(this.body,n)+.04);
    this.forward.copy(heading).addScaledVector(n,-heading.dot(n));
    if(this.forward.lengthSq()<.001)this.forward.copy(FORWARD).addScaledVector(n,-FORWARD.dot(n));
    this.forward.normalize();this.speed=0;this.updateRotation();
  }
  update(dt:number,keys:Set<string>){
    dt=Math.min(dt,.04);const n=this.normal;
    const left=keys.has('CarLeft')||keys.has('ArrowLeft')||keys.has('KeyA');
    const right=keys.has('CarRight')||keys.has('ArrowRight')||keys.has('KeyD');
    const steer=(right?1:0)-(left?1:0);
    const throttle=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
    const turnRate=.55+Math.min(Math.abs(this.speed)/8,1)*.85;
    this.forward.applyAxisAngle(n,-steer*turnRate*dt).normalize();
    this.speed=T.MathUtils.clamp(this.speed+throttle*13*dt,-8,24);
    this.speed*=Math.exp(-dt*(throttle===0?.8:.14));
    const candidate=this.position.clone().addScaledVector(this.forward,this.speed*dt);
    const nextNormal=candidate.clone().sub(this.body.center).normalize();
    candidate.copy(this.body.center).addScaledVector(nextNormal,groundRadius(this.body,nextNormal)+.04);
    const blocked=surfaceObstacles(this.body).some(o=>{
      if(!o.vehicleBlocking)return false;
      const offset=candidate.clone().sub(o.position);offset.addScaledVector(nextNormal,-offset.dot(nextNormal));
      return offset.length()<o.radius+1.05&&o.height>1.1;
    });
    if(blocked)this.speed=0;else this.position.copy(candidate);
    this.forward.addScaledVector(nextNormal,-this.forward.dot(nextNormal)).normalize();
    this.updateRotation();
  }
  private updateRotation(){
    this.rotation.setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(),this.forward,this.normal));
  }
}

export class Walker {
  // Position is the foot contact point; model height is 1.85 metres.
  position=new T.Vector3();
  body:Planet=planets[0];
  forward=new T.Vector3(0,0,-1);
  facing=new T.Vector3(0,0,-1);
  velocity=new T.Vector3();
  verticalSpeed=0;
  pitch=.25;
  grounded=true;
  jumpBuffer=0;
  coyoteTime=.1;
  travel=0;
  keys:Set<string>;
  constructor(keys=new Set<string>()){this.keys=keys;}
  get normal(){return this.position.clone().sub(this.body.center).normalize();}
  get speed(){return this.velocity.length();}
  get altitude(){return this.position.distanceTo(this.body.center)-groundRadius(this.body,this.normal);}
  spawn(body:Planet,position:T.Vector3,forward:T.Vector3){
    this.body=body;const normal=position.clone().sub(body.center).normalize();
    this.position.copy(body.center).addScaledVector(normal,groundRadius(body,normal)+.04);
    this.forward.copy(forward).addScaledVector(normal,-forward.dot(normal));
    if(this.forward.lengthSq()<.001)this.forward.crossVectors(new T.Vector3(1,0,0),normal);
    if(this.forward.lengthSq()<.001)this.forward.crossVectors(new T.Vector3(0,0,1),normal);
    this.forward.normalize();this.facing.copy(this.forward);this.velocity.set(0,0,0);
    this.verticalSpeed=0;this.pitch=.25;this.grounded=true;this.jumpBuffer=0;this.coyoteTime=.1;this.travel=0;
  }
  look(x:number,y:number){this.forward.applyAxisAngle(this.normal,-x*.0032).normalize();this.pitch=T.MathUtils.clamp(this.pitch+y*.0032,-Math.PI/2+.005,1.05);}
  jump(){this.jumpBuffer=.14;}
  update(dt:number,shipPosition?:T.Vector3,vehiclePosition?:T.Vector3){
    dt=Math.min(dt,.04);
    const key=(s:string)=>this.keys.has(s)?1:0;
    const oldNormal=this.normal;
    this.look((key('ArrowRight')-key('ArrowLeft'))*dt*500,(key('ArrowDown')-key('ArrowUp'))*dt*400);
    const right=new T.Vector3().crossVectors(this.forward,oldNormal).normalize();
    const direction=this.forward.clone().multiplyScalar(key('KeyW')-key('KeyS')).addScaledVector(right,key('KeyD')-key('KeyA'));
    const moving=direction.lengthSq()>.001;
    const sprint=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight');
    const desired=direction.normalize().multiplyScalar(moving?(sprint?7:4.2):0);
    this.velocity.lerp(desired,1-Math.exp(-dt*(this.grounded?14:3)));
    this.velocity.addScaledVector(oldNormal,-this.velocity.dot(oldNormal));
    if(moving){this.facing.lerp(direction,1-Math.exp(-dt*13)).normalize();}
    this.coyoteTime=this.grounded?.1:Math.max(0,this.coyoteTime-dt);
    if(this.jumpBuffer>0&&this.coyoteTime>0){this.verticalSpeed=6.2;this.grounded=false;this.coyoteTime=0;this.jumpBuffer=0;}
    this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
    // Ground contact follows the triangle mesh; airborne motion follows gravity.
    const wasGrounded=this.grounded;
    this.verticalSpeed-=this.body.gravity*dt;
    const candidate=this.position.clone().addScaledVector(this.velocity,dt);
    const radial=candidate.clone().sub(this.body.center).normalize();
    const ground=groundRadius(this.body,radial)+.04;
    let height=candidate.distanceTo(this.body.center)+this.verticalSpeed*dt;
    if((wasGrounded&&this.verticalSpeed<=0)||height<=ground){height=ground;this.verticalSpeed=0;this.grounded=true;}
    else this.grounded=false;
    candidate.copy(this.body.center).addScaledVector(radial,height);
    // Keep the astronaut outside rocks and the parked ship hull. Jumps can clear low rocks.
    const blockers=surfaceObstacles(this.body);
    let blocked=false;
    const aboveGround=height-ground;
    for(const obstacle of blockers){
      if(aboveGround>obstacle.height*1.15)continue;
      const offset=candidate.clone().sub(obstacle.position);offset.addScaledVector(radial,-offset.dot(radial));
      if(offset.length()<obstacle.radius+.34){blocked=true;break;}
    }
    if(shipPosition){const offset=candidate.clone().sub(shipPosition);offset.addScaledVector(radial,-offset.dot(radial));if(offset.length()<3.7&&aboveGround<4)blocked=true;}
    if(vehiclePosition){const offset=candidate.clone().sub(vehiclePosition);offset.addScaledVector(radial,-offset.dot(radial));if(offset.length()<3.4&&aboveGround<2.5)blocked=true;}
    if(blocked){
      const previousNormal=this.normal;const oldGround=groundRadius(this.body,previousNormal)+.04;
      this.position.copy(this.body.center).addScaledVector(previousNormal,oldGround+Math.max(0,aboveGround));this.velocity.set(0,0,0);
    }else this.position.copy(candidate);
    const transport=new T.Quaternion().setFromUnitVectors(oldNormal,this.normal);
    this.forward.applyQuaternion(transport).normalize();this.facing.applyQuaternion(transport).normalize();this.velocity.applyQuaternion(transport);
    this.travel+=this.speed*dt;
  }
  get rotation(){return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(),this.facing,this.normal));}
}

export class Expedition {
  flight=new Flight();
  walker=new Walker(this.flight.keys);
  vehicles=Array.from({length:60},()=>new GroundVehicle(planets[0]));
  private mountedVehicle:GroundVehicle|null=null;
  onFoot=false;
  inVehicle=false;
  pendingExit=false;
  onNotice=(message:string)=>{void message;};
  constructor(){this.flight.onNotice=message=>this.onNotice(message);}
  get vehicle(){
    if(this.mountedVehicle)return this.mountedVehicle;
    const body=this.onFoot?this.walker.body:this.flight.local.body;
    const reference=this.onFoot?this.walker.position:this.flight.position;
    return this.vehicles.filter(v=>v.body===body).sort((a,b)=>a.position.distanceToSquared(reference)-b.position.distanceToSquared(reference))[0]??this.vehicles[0];
  }
  get vehicleDistance(){return this.walker.position.distanceTo(this.vehicle.position);}
  get shipDistance(){return (this.inVehicle?this.vehicle.position:this.walker.position).distanceTo(this.flight.position);}
  get canBoard(){return this.onFoot&&this.shipDistance<9&&this.walker.grounded;}
  get canBoardVehicle(){return this.onFoot&&this.vehicleDistance<5&&this.walker.grounded;}
  reset(){this.onFoot=false;this.inVehicle=false;this.pendingExit=false;this.flight.reset();}
  beginOnPlanet(){
    this.reset();this.mountedVehicle=null;const body=planets[0];
    const towardOrigin=new T.Vector3().sub(body.center).normalize();
    const tangent=new T.Vector3().crossVectors(towardOrigin,UP).normalize();
    const playerNormal=surfaceNormal(body,towardOrigin,1);
    const shipNormal=surfaceNormal(body,playerNormal.clone().applyAxisAngle(tangent,.018),6);
    const playerPoint=body.center.clone().addScaledVector(playerNormal,groundRadius(body,playerNormal)+.04);
    const playerHeading=tangent.clone();
    this.walker.spawn(body,playerPoint,playerHeading);
    this.onFoot=true;
    const rnd=()=>Math.random();
    for(let i=0;i<this.vehicles.length;i++){
      const vehicle=this.vehicles[i],y=rnd()*2-1,a=rnd()*Math.PI*2,normal=new T.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a));
      if(i<16){const theta=i<4?.055+rnd()*.035:.09+rnd()*.32,phi=rnd()*Math.PI*2,base=playerNormal.clone(),side=new T.Vector3().crossVectors(base,UP).normalize(),other=new T.Vector3().crossVectors(base,side).normalize();normal.copy(base).multiplyScalar(Math.cos(theta)).addScaledVector(side,Math.sin(theta)*Math.cos(phi)).addScaledVector(other,Math.sin(theta)*Math.sin(phi)).normalize();}
      const heading=new T.Vector3(-Math.sin(a),0,Math.cos(a)).projectOnPlane(normal).normalize();vehicle.spawn(normal,heading);
    }
    this.flight.position.copy(body.center).addScaledVector(shipNormal,groundRadius(body,shipNormal)+2.8);
    this.flight.landBody=body;this.flight.landNormal.copy(shipNormal);this.flight.mode='landed';
    const shipHeading=playerPoint.clone().sub(this.flight.position).addScaledVector(shipNormal,-playerPoint.clone().sub(this.flight.position).dot(shipNormal)).normalize();
    this.flight.rotation.setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(),shipHeading,shipNormal));
  }
  disembark(){
    const f=this.flight;const body=f.local.body;
    const right=new T.Vector3(1,0,0).applyQuaternion(f.rotation);
    let spot=f.position.clone().addScaledVector(right,7.2);
    // Choose an unobstructed point outside either wing before leaving the cockpit.
    for(let i=0;i<16;i++){
      const offset=right.clone().applyAxisAngle(f.local.normal,i*Math.PI/8).multiplyScalar(7.2+Math.floor(i/8)*2);
      const candidate=f.position.clone().add(offset);const n=candidate.clone().sub(body.center).normalize();
      candidate.copy(body.center).addScaledVector(n,groundRadius(body,n)+.04);
      if(!surfaceObstacles(body).some(o=>candidate.distanceTo(o.position)<o.radius+1)){spot=candidate;break;}
    }
    this.walker.spawn(body,spot,new T.Vector3(0,0,-1).applyQuaternion(f.rotation));
    this.onFoot=true;this.pendingExit=false;f.keys.clear();f.mouseX=0;f.mouseY=0;
    this.onNotice(`已下船 · ${body.name}重力 ${body.gravity.toFixed(1)} m/s² · 空格跳跃`);
  }
  interact(){
    if(this.inVehicle){
      const vehicle=this.vehicle,n=vehicle.normal;
      const right=new T.Vector3().crossVectors(vehicle.forward,n).normalize();
      const exitPoint=vehicle.position.clone().addScaledVector(right,5.6);
      this.walker.spawn(vehicle.body,exitPoint,vehicle.forward);this.inVehicle=false;this.onFoot=true;this.mountedVehicle=null;
      this.flight.keys.clear();this.onNotice('已下车');return;
    }
    if(this.onFoot){
      if(this.canBoardVehicle){this.mountedVehicle=this.vehicle;this.inVehicle=true;this.onFoot=false;this.flight.keys.clear();this.onNotice('已上车 · W/S 前进后退 · A/D 转向 · F 下车');return;}
      if(!this.canBoard){this.onNotice(this.shipDistance>=9?'请靠近飞船至 9 m 内登船':'请落地后再登船');return;}
      this.onFoot=false;this.flight.keys.clear();this.flight.mouseX=0;this.flight.mouseY=0;
      this.onNotice('已登船 · R 起飞 · F 再次下船');return;
    }
    if(this.flight.mode==='landed'){this.disembark();return;}
    if(this.flight.mode==='landing'){this.pendingExit=true;this.onNotice('正在降落 · 落稳后自动下船');return;}
    if(this.flight.mode==='takeoff'){this.onNotice('起飞中，暂时无法下船');return;}
    if(this.flight.local.altitude>90){this.onNotice('靠近地表至 90 m 内，按 F 降落并下船');return;}
    if(this.flight.speed>20){this.onNotice('请按住 S 反向推进减速至 20 m/s 以下再下船');return;}
    this.pendingExit=true;this.flight.interact();this.onNotice('正在降落 · 落稳后自动下船');
  }
  takeoff(){
    if(this.onFoot||this.inVehicle){this.onNotice('请先离开车辆或登上飞船');return;}
    if(this.flight.mode==='landed')this.flight.interact();
  }
  update(dt:number){
    if(this.inVehicle){this.vehicle.update(dt,this.flight.keys);}
    else if(this.onFoot){this.walker.look(this.flight.mouseX,this.flight.mouseY);this.flight.mouseX=0;this.flight.mouseY=0;this.walker.update(dt,this.flight.position,this.vehicle.position);}
    else{this.flight.update(dt);if(this.pendingExit&&this.flight.mode==='landed')this.disembark();}
  }
}

export function createAstronaut(){
  const root=new T.Group();
  const suit=new T.MeshStandardMaterial({color:0xe2e2cf,roughness:.8,flatShading:true});
  const dark=new T.MeshStandardMaterial({color:0x253a43,roughness:.6,flatShading:true});
  const visor=new T.MeshStandardMaterial({color:0x133e4b,metalness:.75,roughness:.2});
  const trim=new T.MeshStandardMaterial({color:0x89bdac,roughness:.6});
  function box(parent:T.Group,material:T.Material,size:number[],position:number[]){const m=new T.Mesh(new T.BoxGeometry(...size as [number,number,number]),material);m.position.fromArray(position);parent.add(m);return m;}
  box(root,suit,[.6,.68,.36],[0,1.13,0]);box(root,dark,[.49,.18,.34],[0,.75,0]);
  box(root,dark,[.43,.52,.24],[0,1.15,.28]);box(root,trim,[.21,.18,.06],[.15,1.24,-.2]);
  const helmet=new T.Mesh(new T.IcosahedronGeometry(.36,1),suit);helmet.position.y=1.71;helmet.scale.set(1,.96,.95);root.add(helmet);
  const glass=new T.Mesh(new T.IcosahedronGeometry(.31,1),visor);glass.scale.set(1,.64,.42);glass.position.set(0,1.73,-.245);root.add(glass);
  const arms:T.Group[]=[],legs:T.Group[]=[];
  for(const side of [-1,1]){
    const arm=new T.Group();arm.position.set(side*.42,1.38,0);box(arm,suit,[.23,.48,.25],[0,-.22,0]);box(arm,dark,[.22,.15,.24],[0,-.52,0]);root.add(arm);arms.push(arm);
    const leg=new T.Group();leg.position.set(side*.18,.74,0);box(leg,suit,[.25,.5,.28],[0,-.24,0]);box(leg,dark,[.28,.2,.4],[0,-.62,-.05]);root.add(leg);legs.push(leg);
  }
  return {root,animate(walker:Walker){
    const gait=Math.sin(walker.travel*2.1)*Math.min(walker.speed/4.2,1)*.65;
    for(let i=0;i<2;i++){legs[i].rotation.x=walker.grounded?gait*(i===0?1:-1):-.28;arms[i].rotation.x=walker.grounded?-gait*(i===0?1:-1):-.5;arms[i].rotation.z=walker.grounded?(i===0?.08:-.08):(i===0?.35:-.35);}
    root.position.copy(walker.position);root.quaternion.copy(walker.rotation);
  }};
}
