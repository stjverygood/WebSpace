import * as T from 'three';
const UP=new T.Vector3(0,1,0);

export interface Planet {
  name: string; code: string; description: string; type: string;
  center: T.Vector3; radius: number; seed: number; colors: number[];
  atmosphere: number; gravity: number; ring?: boolean;
}
export const planets: Planet[] = [
  {name:'苍蓝星',code:'AURELIA · 04B',description:'海洋、山脉，以及尚未被命名的远方。',type:'海洋 / 山脉',center:new T.Vector3(350,-80,-1100),radius:300,seed:1.7,colors:[0x24555e,0x41818a,0x8aa99a,0xb7baa1,0xd7d0b3],gravity:9.8,atmosphere:0x72b8c9},
  {name:'赤砂星',code:'EMBER · 09C',description:'风穿过赤色峡谷，时间在这里慢了下来。',type:'荒漠 / 峡谷',center:new T.Vector3(-1050,-310,-500),radius:210,seed:4.3,colors:[0x714442,0x995b4c,0xb97959,0xd79c72,0xe0c29c],gravity:3.7,atmosphere:0xdc9171},
  {name:'环带星',code:'VESPER · 12A',description:'穿过冰尘构成的光环，抵达安静的灰色高地。',type:'岩原 / 冰尘环',center:new T.Vector3(-900,430,-2700),radius:440,seed:8.6,colors:[0x535c70,0x7a8191,0xa7a9ac,0xbfc1b7,0xe1dbc5],gravity:14.5,atmosphere:0xaab2de,ring:true},
];

// The same continuous radial field drives the rendered vertices and collisions.
export function terrain(p: Planet, n: T.Vector3): number {
  const s=p.seed;
  const broad=Math.sin(n.x*4.1+s)*Math.cos(n.y*4.8-s)+Math.sin(n.z*5.3+n.x*2+s)*.55;
  const detail=Math.sin(n.x*18+n.z*7+s)*Math.cos(n.y*17+n.z*4)*.19;
  const ridges=Math.abs(Math.sin(n.x*10+n.y*6+s)*Math.sin(n.z*11-n.y*4))*.36;
  return (broad+detail+ridges-.12)*p.radius*.045;
}
export function surfaceRadius(p: Planet,n: T.Vector3): number {
  return p.radius+Math.max(p.seed===1.7?0:-p.radius*.02, terrain(p,n));
}
export function nearest(position: T.Vector3) {
  let body=planets[0],distance=Infinity;
  for(const p of planets){const d=position.distanceTo(p.center)-p.radius;if(d<distance){body=p;distance=d;}}
  const normal=position.clone().sub(body.center).normalize();
  return {body,normal,altitude:position.distanceTo(body.center)-surfaceRadius(body,normal)};
}

const groundMeshes=new Map<Planet,T.Mesh>();
export interface SurfaceObstacle { position:T.Vector3; radius:number; height:number; vehicleBlocking?:boolean }
const obstacles=new Map<Planet,SurfaceObstacle[]>();
const groundRay=new T.Raycaster();
// Match the actual flat triangles under the astronaut's feet, not the smooth
// procedural field used to construct the planet's vertices.
export function groundRadius(p:Planet,normal:T.Vector3):number {
  const mesh=groundMeshes.get(p);
  if(!mesh)return surfaceRadius(p,normal);
  groundRay.set(normal.clone().multiplyScalar(p.radius+100),normal.clone().negate());
  const hit=groundRay.intersectObject(mesh,false)[0];
  return hit?hit.point.length():surfaceRadius(p,normal);
}
export function surfaceObstacles(p:Planet):readonly SurfaceObstacle[]{return obstacles.get(p)??[];}

function addSettlement(p:Planet,group:T.Group,colliders:SurfaceObstacle[]){
  const scale=T.MathUtils.clamp(p.radius/300,.72,1.25);
  const anchor=p.center.clone().negate().normalize();
  const east=new T.Vector3().crossVectors(anchor,UP).normalize();
  const north=new T.Vector3().crossVectors(anchor,east).normalize();
  const pointAt=(x:number,z:number,lift=0)=>{
    const normal=anchor.clone().addScaledVector(east,x/p.radius).addScaledVector(north,z/p.radius).normalize();
    return normal.multiplyScalar(groundRadius(p,normal)+lift);
  };
  const road=new T.MeshStandardMaterial({color:0x353c40,roughness:.96,flatShading:true});
  const shoulder=new T.MeshStandardMaterial({color:0x747970,roughness:.98,flatShading:true});
  const marking=new T.MeshStandardMaterial({color:0xd7c99e,roughness:.88,flatShading:true});
  const makeRibbon=(path:number[][],width:number,material:T.Material,lift=.2)=>{
    const samples:T.Vector3[]=[];
    for(let s=0;s<path.length-1;s++){
      const a=path[s],b=path[s+1],dx=b[0]-a[0],dz=b[1]-a[1],steps=Math.max(2,Math.ceil(Math.hypot(dx,dz)/7));
      for(let i=0;i<steps;i++){const t=i/steps;samples.push(new T.Vector3(a[0]+dx*t,a[1]+dz*t,0));}
    }
    const last=path[path.length-1];samples.push(new T.Vector3(last[0],last[1],0));
    const vertices:number[]=[],indices:number[]=[];
    for(let i=0;i<samples.length;i++){
      const before=samples[Math.max(0,i-1)],after=samples[Math.min(samples.length-1,i+1)];
      const dx=after.x-before.x,dz=after.y-before.y,length=Math.hypot(dx,dz)||1;
      const px=-dz/length*width/2,pz=dx/length*width/2;
      const left=pointAt(samples[i].x+px,samples[i].y+pz,lift),right=pointAt(samples[i].x-px,samples[i].y-pz,lift);
      vertices.push(left.x,left.y,left.z,right.x,right.y,right.z);
      if(i<samples.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const surfaceMaterial=material.clone();surfaceMaterial.side=T.DoubleSide;group.add(new T.Mesh(geometry,surfaceMaterial));
  };
  const mainPath=[[-180,44],[0,44],[190,44]],crossPath=[[65,-165],[65,0],[65,175]];
  makeRibbon(mainPath,11*scale,shoulder,.28);makeRibbon(mainPath,8.2*scale,road,.38);
  makeRibbon(crossPath,10*scale,shoulder,.3);makeRibbon(crossPath,7.2*scale,road,.4);
  for(let x=-150;x<180;x+=25)makeRibbon([[x,44],[x+3.2,44]],.22*scale,marking,.47);

  const steel=new T.MeshStandardMaterial({color:0xa6b0aa,roughness:.72,metalness:.24,flatShading:true});
  const pale=new T.MeshStandardMaterial({color:0xc7c6b6,roughness:.9,flatShading:true});
  const dark=new T.MeshStandardMaterial({color:0x29383b,roughness:.56,metalness:.34,flatShading:true});
  const glass=new T.MeshStandardMaterial({color:0x24444a,roughness:.28,metalness:.52,flatShading:true});
  const accent=new T.MeshStandardMaterial({color:p.colors[1],roughness:.86,flatShading:true});
  const box=(parent:T.Group,size:number[],position:number[],material:T.Material)=>{const m=new T.Mesh(new T.BoxGeometry(...size as [number,number,number]),material);m.position.fromArray(position);parent.add(m);return m;};
  const cylinder=(parent:T.Group,radius:number,height:number,position:number[],material:T.Material,segments=8)=>{const m=new T.Mesh(new T.CylinderGeometry(radius,radius,height,segments),material);m.position.fromArray(position);parent.add(m);return m;};
  const place=(x:number,z:number,heading:number)=>{
    const normal=anchor.clone().addScaledVector(east,x/p.radius).addScaledVector(north,z/p.radius).normalize();
    const object=new T.Group();object.position.copy(pointAt(x,z,.18));
    const forward=north.clone().applyAxisAngle(normal,heading);
    object.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(),forward,normal));group.add(object);return object;
  };
  const building=(kind:number,x:number,z:number,heading:number)=>{
    const root=place(x,z,heading),model=new T.Group();model.scale.setScalar(scale);root.add(model);
    box(model,[12,.55,11],[0,.28,0],dark);
    if(kind===0){
      cylinder(model,4.8,5.2,[0,3,0],pale,6);const dome=new T.Mesh(new T.ConeGeometry(5.2,3.3,6),steel);dome.position.y=7.1;model.add(dome);
      for(const side of [-1,1])box(model,[.16,1.8,3.2],[side*4.65,3.2,0],glass);
    }else if(kind===1){
      box(model,[15,6,12],[0,3,0],steel);box(model,[13,4.8,.16],[0,2.9,-6.08],glass);
      box(model,[16,.45,13],[0,6.2,0],dark);box(model,[9,.2,.2],[0,5.8,6.12],accent);
    }else if(kind===2){
      cylinder(model,1.25,15,[0,7.5,0],steel,6);cylinder(model,2.5,.5,[0,14,0],dark,6);cylinder(model,1.9,.5,[0,15,0],accent,6);
      for(const y of [5,9,12]){const band=box(model,[4,.18,.18],[0,y,0],dark);band.rotation.z=.15;}
      const antenna=new T.Mesh(new T.ConeGeometry(.25,4,5),steel);antenna.position.y=17.2;model.add(antenna);
    }else if(kind===3){
      box(model,[10,5.5,9],[0,2.75,0],pale);box(model,[7,.22,7],[0,5.65,0],dark);
      for(const side of [-1,1]){const panel=new T.Mesh(new T.BoxGeometry(4,.12,5),glass);panel.position.set(side*6,4.1,0);panel.rotation.z=side*-.12;model.add(panel);}
      box(model,[2,2.7,.18],[0,2.4,-4.62],glass);
    }else{
      box(model,[9,4,8],[0,2,0],steel);const roof=new T.Mesh(new T.ConeGeometry(7,4,4),pale);roof.position.y=6;roof.rotation.y=Math.PI/4;model.add(roof);
      cylinder(model,.18,8,[0,9,0],dark,6);
    }
    const radius=(kind===1?11:kind===2?5:8)*scale,height=(kind===2?17:kind===1?7:9)*scale;
    colliders.push({position:p.center.clone().add(pointAt(x,z,height*.5)),radius,height,vehicleBlocking:true});
  };
  const parkedVehicle=(kind:number,x:number,z:number,heading:number)=>{
    const root=place(x,z,heading),model=new T.Group();model.scale.setScalar(scale);root.add(model);
    const frame=kind===0?dark:kind===1?steel:accent;
    box(model,[2.3,.48,4.6],[0,.88,0],dark);
    if(kind===0){
      box(model,[2.5,.65,2.6],[0,1.32,.45],accent);box(model,[1.85,1.1,1.65],[0,2,-.45],glass);
      for(const side of [-1,1]){const rail=box(model,[.12,1.45,.12],[side*.94,1.9,-.43],steel);rail.rotation.x=.16;}
      box(model,[2.5,.16,.2],[0,2.75,-.45],steel);
    }else if(kind===1){
      box(model,[2.6,1.65,2.5],[0,1.65,.52],frame);box(model,[2.4,1.12,1.55],[0,2.1,-1.35],glass);
      box(model,[2.75,.12,2.7],[0,2.56,.52],steel);
    }else{
      box(model,[2.4,.8,2.15],[0,1.32,.7],steel);box(model,[2.05,1.25,1.5],[0,2.2,-.52],glass);
      box(model,[2.6,.24,.18],[0,2.9,-.52],accent);box(model,[2.9,.12,2.2],[0,2.3,1.9],dark);
    }
    const axleZ=kind===2?[-1.6,0,1.6]:[-1.55,1.55];
    for(const side of [-1,1])for(const z of axleZ){
      const wheel=new T.Mesh(new T.CylinderGeometry(kind===2?.62:.57,kind===2?.62:.57,.42,8),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(side*1.18,.58,z);model.add(wheel);
      const hub=new T.Mesh(new T.CylinderGeometry(.2,.2,.44,6),steel);hub.rotation.z=Math.PI/2;hub.position.set(side*1.18,.58,z);model.add(hub);
    }
    colliders.push({position:p.center.clone().add(pointAt(x,z,1.1*scale)),radius:4.3*scale,height:2.5*scale,vehicleBlocking:true});
  };
  [
    [0,112,16,.25],[1,125,86,-.12],[2,8,106,.62],[3,168,-18,.36],[4,-48,82,-.3],
  ].forEach(([kind,x,z,heading])=>building(kind,x*scale,z*scale,heading));
  [
    [0,18,69,.08],[1,113,32,.1],[2,91,124,-.5],[1,174,72,.4],
  ].forEach(([kind,x,z,heading])=>parkedVehicle(kind,x*scale,z*scale,heading));
}

export function createPlanet(p:Planet):T.Group {
  const group=new T.Group();group.position.copy(p.center);
  const geo=new T.IcosahedronGeometry(p.radius,10);
  const vertices=geo.getAttribute('position');
  const colors:number[]=[];
  const palette=p.colors.map(c=>new T.Color(c));
  const n=new T.Vector3();
  for(let i=0;i<vertices.count;i+=3){
    let h=0;
    for(let j=0;j<3;j++){
      n.fromBufferAttribute(vertices,i+j).normalize();
      h+=terrain(p,n)/3;
      n.multiplyScalar(surfaceRadius(p,n));
      vertices.setXYZ(i+j,n.x,n.y,n.z);
    }
    const band=p.seed===1.7?(h<0?0:h<2?1:h<8?2:h<15?3:4):T.MathUtils.clamp(Math.floor((h/p.radius+.08)*28),0,4);
    const c=palette[band].clone().multiplyScalar(.94+Math.sin(i*37.13)*.035);
    for(let j=0;j<3;j++)colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const ground=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.92,metalness:.04}));
  group.add(ground);
  groundMeshes.set(p,new T.Mesh(geo,new T.MeshBasicMaterial()));
  const colliders:SurfaceObstacle[]=[];obstacles.set(p,colliders);
  // Surface outcrops provide a human-scale reference during low flight.
  const outcrops=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:p.colors[3],roughness:.95,flatShading:true}),420);
  const transform=new T.Object3D();let count=0;
  for(let i=0;i<1100&&count<420;i++){
    const y=1-2*(i+.5)/1100,angle=i*2.399963+p.seed;
    const direction=new T.Vector3(Math.sqrt(1-y*y)*Math.cos(angle),y,Math.sqrt(1-y*y)*Math.sin(angle));
    if(p.seed===1.7&&terrain(p,direction)<2)continue;
    const size=.8+(Math.sin(i*74.31)+1)*1.7;
    transform.position.copy(direction).multiplyScalar(surfaceRadius(p,direction)+size*.2);
    transform.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);
    transform.rotateY(i*1.73);transform.scale.set(size*.8,size*(.6+(i%4)*.4),size);
    transform.updateMatrix();outcrops.setMatrixAt(count++,transform.matrix);
    const height=size*(.6+(i%4)*.4);
    // Small, partly buried decorative outcrops should not abruptly stop a vehicle.
    colliders.push({position:transform.position.clone().add(p.center),radius:size*.8,height,vehicleBlocking:size>3.8&&height>3.4});
  }
  outcrops.count=count;group.add(outcrops);
  addSettlement(p,group,colliders);
  const atmosphere=new T.Mesh(new T.SphereGeometry(p.radius*1.075,64,48),new T.ShaderMaterial({
    uniforms:{tint:{value:new T.Color(p.atmosphere)}},transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,
    vertexShader:`varying vec3 vNormal; varying vec3 vView; void main(){ vec4 view=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-view.xyz);gl_Position=projectionMatrix*view; }`,
    fragmentShader:`uniform vec3 tint; varying vec3 vNormal; varying vec3 vView; void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),3.5); gl_FragColor=vec4(tint,rim*.38);}`,
  }));group.add(atmosphere);
  if(p.ring){
    const rings=new T.Group();rings.rotation.set(.35,.1,-.3);
    for(let i=0;i<5;i++){
      const mesh=new T.Mesh(new T.RingGeometry(p.radius*(1.38+i*.16),p.radius*(1.49+i*.16),160),new T.MeshBasicMaterial({color:[0x9eabae,0x777f88,0xb4bab3,0x7d8d96,0xa2a9a6][i],side:T.DoubleSide,transparent:true,opacity:[.35,.18,.47,.14,.25][i],depthWrite:false}));
      mesh.rotation.x=Math.PI/2;rings.add(mesh);
    }group.add(rings);
  }
  return group;
}

