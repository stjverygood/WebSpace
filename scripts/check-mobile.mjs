import assert from 'node:assert/strict';
class Element extends EventTarget {
  style={}; onclick=null; disabled=false;
  classList={add(){},remove(){}};
  setPointerCapture(){}
  getBoundingClientRect(){return {left:0,top:0,width:118,height:118};}
}
const elements=new Map();
globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}};
const windowEvents=new EventTarget();globalThis.addEventListener=windowEvents.addEventListener.bind(windowEvents);
const {MobileControls}=await import('../src/mobile.ts');
let enabled=true,onFoot=false,jumps=0,interactions=0,launches=0,look=[];
const controls=new MobileControls({enabled:()=>enabled,onFoot:()=>onFoot,look:(x,y)=>look.push([x,y]),interact:()=>interactions++,takeoff:()=>launches++,jump:()=>jumps++});
const send=(id,type,pointerId,x=59,y=59)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId,clientX:x,clientY:y,pointerType:'touch'});document.getElementById(id).dispatchEvent(e);};
send('joystick','pointerdown',1,59,19);assert.ok(controls.keys.has('ArrowUp'));
send('touch-forward','pointerdown',2);assert.ok(controls.keys.has('KeyW'));
send('joystick','pointerup',1);assert.ok(controls.keys.has('KeyW'),'forward button keeps its own thrust after releasing joystick');
send('universe','pointerdown',3,100,200);send('universe','pointermove',3,120,210);assert.deepEqual(look,[[15,7.5]]);
assert.ok(controls.keys.has('KeyW'),'camera finger does not cancel held button');
send('universe','pointercancel',3);send('universe','pointermove',3,150,230);assert.equal(look.length,1);
send('touch-forward','pointercancel',2);assert.equal(controls.keys.size,0,'pointer cancellation releases thrust');
onFoot=true;send('touch-boost','pointerdown',4);assert.ok(controls.keys.has('ShiftLeft'));assert.ok(!controls.keys.has('KeyW'),'sprint does not force walking');
send('joystick','pointerdown',5,100,19);assert.ok(controls.keys.has('KeyD'));assert.ok(controls.keys.has('KeyW'));
const walkingKeys=[...controls.keys].sort();send('touch-forward','pointerdown',8);assert.deepEqual([...controls.keys].sort(),walkingKeys,'ship throttle is inert while walking');
send('joystick','lostpointercapture',5);assert.deepEqual([...controls.keys],['ShiftLeft'],'lost joystick capture preserves the sprint finger');
controls.reset();assert.equal(controls.keys.size,0);assert.equal(elements.get('joystick-thumb').style.transform,'translate(0px,0px)');
enabled=false;send('joystick','pointerdown',6,59,0);send('touch-boost','pointerdown',7);elements.get('touch-action').onclick();assert.equal(controls.keys.size,0);assert.equal(interactions,0,'paused controls are inert');
enabled=true;elements.get('touch-action').onclick();elements.get('touch-launch').onclick();elements.get('touch-jump').onclick();assert.deepEqual([interactions,launches,jumps],[1,1,1]);
console.log('PASS: multi-finger input ownership, joystick, camera drag, sprint, pointer cancellation, lost capture, pause reset and action buttons.');
