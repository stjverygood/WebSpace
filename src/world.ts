import * as T from 'three';

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
export interface SurfaceObstacle { position:T.Vector3; radius:number; height:number }
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
    colliders.push({position:transform.position.clone().add(p.center),radius:size*.8,height:size*(.6+(i%4)*.4)});
  }
  outcrops.count=count;group.add(outcrops);
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

