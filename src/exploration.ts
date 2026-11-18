import * as T from 'three';
import { Flight } from './flight.ts';
import { groundRadius, planets, surfaceObstacles, type Planet } from './world.ts';

const UP=new T.Vector3(0,1,0);
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
  look(x:number,y:number){this.forward.applyAxisAngle(this.normal,-x*.0025).normalize();this.pitch=T.MathUtils.clamp(this.pitch+y*.0025,-.3,1.05);}
  jump(){this.jumpBuffer=.14;}
  update(dt:number,shipPosition?:T.Vector3){
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
  onFoot=false;
  pendingExit=false;
  onNotice=(message:string)=>{void message;};
  constructor(){this.flight.onNotice=message=>this.onNotice(message);}
  get shipDistance(){return this.walker.position.distanceTo(this.flight.position);}
  get canBoard(){return this.onFoot&&this.shipDistance<9&&this.walker.grounded;}
  reset(){this.onFoot=false;this.pendingExit=false;this.flight.reset();}
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
    if(this.onFoot){
      if(!this.canBoard){this.onNotice(this.shipDistance>=9?'请靠近飞船至 9 m 内登船':'请落地后再登船');return;}
      this.onFoot=false;this.flight.keys.clear();this.flight.mouseX=0;this.flight.mouseY=0;
      this.onNotice('已登船 · R 起飞 · F 再次下船');return;
    }
    if(this.flight.mode==='landed'){this.disembark();return;}
    if(this.flight.mode==='landing'){this.pendingExit=true;this.onNotice('正在降落 · 落稳后自动下船');return;}
    if(this.flight.mode==='takeoff'){this.onNotice('起飞中，暂时无法下船');return;}
    if(this.flight.local.altitude>90){this.onNotice('靠近地表至 90 m 内，按 F 降落并下船');return;}
    if(this.flight.speed>20){this.onNotice('请按住空格制动至 20 m/s 以下再下船');return;}
    this.pendingExit=true;this.flight.interact();this.onNotice('正在降落 · 落稳后自动下船');
  }
  takeoff(){
    if(this.onFoot){this.onNotice('请靠近飞船按 F 登船');return;}
    if(this.flight.mode==='landed')this.flight.interact();
  }
  navigate(body:Planet){
    if(this.onFoot){this.onNotice('请返回飞船后再启航');return;}
    if(this.flight.mode==='landed'){this.onNotice('请先按 R 起飞');return;}
    this.pendingExit=false;this.flight.navigate(body);
  }
  update(dt:number){
    if(this.onFoot){this.walker.look(this.flight.mouseX,this.flight.mouseY);this.flight.mouseX=0;this.flight.mouseY=0;this.walker.update(dt,this.flight.position);}
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
