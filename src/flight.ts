import * as T from 'three';
import { nearest, planets, surfaceRadius, type Planet } from './world.ts';

const X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1);
export type FlightMode='manual'|'landing'|'landed'|'takeoff';
export class Flight {
  position=new T.Vector3(0,30,50);
  rotation=new T.Quaternion();
  velocity=new T.Vector3();
  mode:FlightMode='manual';
  destination=new T.Vector3();
  landBody:Planet=planets[0];
  landNormal=new T.Vector3();
  elapsed=0;
  keys=new Set<string>();
  mouseX=0;mouseY=0;
  onNotice=(message:string)=>{void message;};
  get speed(){return this.velocity.length();}
  get local(){return nearest(this.position);}
  reset(){this.position.set(0,30,50);this.rotation.identity();this.velocity.set(0,0,0);this.mode='manual';this.keys.clear();this.mouseX=0;this.mouseY=0;}
  interact(){
    if(this.mode==='landed'){
      this.mode='takeoff';this.elapsed=0;this.onNotice('起飞程序启动');return;
    }
    if(this.mode==='landing'||this.mode==='takeoff')return;
    const local=this.local;
    if(local.altitude>90){this.onNotice('请靠近地表至 90 m 以内再降落');return;}
    if(this.speed>20){this.onNotice('速度过高 · 按住空格制动至 20 m/s 以下');return;}
    this.landBody=local.body;this.landNormal.copy(local.normal);
    this.destination.copy(local.body.center).addScaledVector(local.normal,surfaceRadius(local.body,local.normal)+2.8);
    this.mode='landing';this.onNotice('辅助降落启动 · 正在稳定姿态');
  }
  tangentAttitude(normal:T.Vector3){
    const forward=new T.Vector3(0,0,-1).applyQuaternion(this.rotation);
    forward.addScaledVector(normal,-forward.dot(normal));
    if(forward.lengthSq()<.001)forward.crossVectors(X,normal);
    if(forward.lengthSq()<.001)forward.crossVectors(Z,normal);
    forward.normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(),forward,normal));
  }
  update(dt:number){
    dt=Math.min(dt,.04);
    const key=(code:string)=>this.keys.has(code)?1:0;
    if(this.mode==='landed'){this.velocity.set(0,0,0);return;}
    if(this.mode==='landing'){
      this.rotation.slerp(this.tangentAttitude(this.landNormal),1-Math.exp(-dt*2));
      const delta=this.destination.clone().sub(this.position);
      const desired=delta.clone().multiplyScalar(.85).clampLength(0,9);
      this.velocity.lerp(desired,1-Math.exp(-dt*3));
      this.position.addScaledVector(this.velocity,dt);
      if(delta.length()<.18&&this.speed<.5){this.position.copy(this.destination);this.mode='landed';this.velocity.set(0,0,0);this.onNotice(`已抵达${this.landBody.name} · F 下船探索 / R 起飞`);}
      return;
    }
    if(this.mode==='takeoff'){
      this.elapsed+=dt;this.velocity.lerp(this.landNormal.clone().multiplyScalar(13),1-Math.exp(-dt*2));
      this.position.addScaledVector(this.velocity,dt);
      if(this.elapsed>3.3){this.mode='manual';this.onNotice('起飞完成 · 已恢复手动驾驶');}return;
    }
    const yaw=(key('ArrowLeft')-key('ArrowRight'))*dt*1.05-this.mouseX*.0018;
    const pitch=(key('ArrowUp')-key('ArrowDown'))*dt*.85-this.mouseY*.0018;
    this.rotation.multiply(new T.Quaternion().setFromAxisAngle(Y,yaw));
    this.rotation.multiply(new T.Quaternion().setFromAxisAngle(X,pitch));
    this.rotation.multiply(new T.Quaternion().setFromAxisAngle(Z,(key('KeyQ')-key('KeyE'))*dt*1.1));
    this.rotation.normalize();
    const proximity=this.local;
    const boost=key('ShiftLeft')||key('ShiftRight');
    const acceleration=boost?90:28;
    const direction=new T.Vector3(key('KeyD')-key('KeyA'),0,-key('KeyW')+key('KeyS')*.55).applyQuaternion(this.rotation);
    this.velocity.addScaledVector(direction,acceleration*dt);
    this.velocity.multiplyScalar(Math.exp(-dt*(key('Space')?3.5:.13)));
    const speedLimit=proximity.altitude<70?35:proximity.altitude<180?80:boost?260:90;
    if(this.speed>speedLimit)this.velocity.multiplyScalar(Math.max(speedLimit/this.speed,Math.exp(-dt*2)));
    this.position.addScaledVector(this.velocity,dt);
    this.mouseX=0;this.mouseY=0;
    // Prevent tunnelling into the spherical terrain and remove inward velocity.
    const local=this.local;
    if(local.altitude<2.8){
      this.position.addScaledVector(local.normal,2.8-local.altitude);
      const inward=this.velocity.dot(local.normal);
      if(inward<0)this.velocity.addScaledVector(local.normal,-inward);
      this.velocity.multiplyScalar(Math.exp(-dt*2));
    }
  }
}


