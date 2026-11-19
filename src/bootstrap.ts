import './launch.css';

const button=document.getElementById('launch-game') as HTMLButtonElement;
const status=document.getElementById('launch-status')!;
let loading=false;
button.onclick=async()=>{
  if(loading)return;
  loading=true;button.disabled=true;button.setAttribute('aria-busy','true');
  button.innerHTML='正在进入星海 <span class="launch-spinner"></span>';
  status.textContent='正在加载游戏，请稍候…';
  // Request fullscreen during the original gesture. The scene remains a lazy import.
  if(matchMedia('(any-pointer: coarse), (max-width: 700px), (max-width: 1024px) and (max-height: 600px)').matches){
    try{void document.documentElement.requestFullscreen?.({navigationUI:'hide'}).catch(()=>{});}catch{/* Manual landscape play is still available. */}
  }
  try{
    const game=await import('./main');
    document.getElementById('game-root')!.hidden=false;
    document.getElementById('launcher')!.hidden=true;
    game.enterGame();
  }catch{
    document.getElementById('game-root')!.hidden=true;
    document.getElementById('launcher')!.hidden=false;
    status.textContent='加载失败。请检查网络与浏览器图形支持后重新加载。';
    button.disabled=false;button.removeAttribute('aria-busy');button.textContent='重新加载';
    button.onclick=()=>location.reload();
  }
};
