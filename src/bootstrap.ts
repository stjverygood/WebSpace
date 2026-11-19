import './launch.css';
import { enterPortrait, needsPortrait } from './display';

const button=document.getElementById('launch-game') as HTMLButtonElement;
const launcher=document.getElementById('launcher')!;
const overlay=document.getElementById('rotate-overlay')!;
let loading=false;
let game:typeof import('./main')|undefined;
const touchLayout=()=>matchMedia('(any-pointer: coarse), (max-width: 700px), (max-width: 1024px) and (max-height: 600px)').matches;
const isFullscreen=()=>Boolean(document.fullscreenElement);

function updateLauncherOrientation(){
  if(launcher.hidden)return;
  const blocked=needsPortrait(innerWidth,innerHeight,touchLayout());
  overlay.classList.toggle('hidden',!blocked);
  launcher.inert=blocked;
  document.body.classList.toggle('launcher-rotation',blocked);
  document.documentElement.classList.toggle('portrait-entry',blocked);
}

async function requestPortrait(){
  const root=document.documentElement as HTMLElement&{webkitRequestFullscreen?:()=>Promise<void>|void};
  const orientation=screen.orientation as ScreenOrientation&{lock?:(value:string)=>Promise<void>};
  const result=await enterPortrait({
    isFullscreen,
    requestFullscreen:root.requestFullscreen?()=>root.requestFullscreen({navigationUI:'hide'}):root.webkitRequestFullscreen?()=>root.webkitRequestFullscreen!():undefined,
    lockLandscape:touchLayout()&&orientation?.lock?()=>orientation.lock!('portrait'):undefined,
  });
  if(!result.fullscreen)$('rotate-note').textContent='浏览器不支持全屏竖屏，请开启自动旋转并手动竖置手机。';
  else if(!result.locked)$('rotate-note').textContent='已进入全屏；请开启自动旋转并竖置手机。';
  updateLauncherOrientation();
}

function $(id:string){return document.getElementById(id)!;}
document.getElementById('rotate-fullscreen')!.onclick=()=>void requestPortrait();
addEventListener('resize',updateLauncherOrientation);
addEventListener('orientationchange',updateLauncherOrientation);
document.addEventListener('fullscreenchange',updateLauncherOrientation);
screen.orientation?.addEventListener('change',updateLauncherOrientation);
updateLauncherOrientation();

async function launch(){
  if(loading)return;
  if(game){
    document.getElementById('game-root')!.hidden=false;
    launcher.hidden=true;
    document.body.classList.remove('launcher-rotation');document.documentElement.classList.remove('portrait-entry');
    game.enterGame();
    return;
  }
  loading=true;button.disabled=true;button.setAttribute('aria-busy','true');
  button.innerHTML='载入中 <span class="launch-spinner" aria-hidden="true"></span>';
  if(matchMedia('(any-pointer: coarse), (max-width: 700px), (max-width: 1024px) and (max-height: 600px)').matches){
    try{void document.documentElement.requestFullscreen?.({navigationUI:'hide'}).catch(()=>{});}catch{/* Manual portrait play is still available. */}
  }
  try{
    game=await import('./main');
    document.getElementById('game-root')!.hidden=false;
    launcher.hidden=true;
    document.body.classList.remove('launcher-rotation');document.documentElement.classList.remove('portrait-entry');
    game.enterGame();
  }catch{
    document.getElementById('game-root')!.hidden=true;
    document.getElementById('launcher')!.hidden=false;
    button.textContent='重新加载';
  }finally{
    loading=false;button.disabled=false;button.removeAttribute('aria-busy');
    if(game)button.textContent='开始游戏';
  }
}

button.onclick=launch;
