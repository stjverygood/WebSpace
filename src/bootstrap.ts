import './launch.css';

const button=document.getElementById('launch-game') as HTMLButtonElement;
let loading=false;
let game:typeof import('./main')|undefined;

async function launch(){
  if(loading)return;
  if(game){
    document.getElementById('game-root')!.hidden=false;
    document.getElementById('launcher')!.hidden=true;
    game.enterGame();
    return;
  }
  loading=true;button.disabled=true;button.setAttribute('aria-busy','true');
  button.innerHTML='载入中 <span class="launch-spinner" aria-hidden="true"></span>';
  if(matchMedia('(any-pointer: coarse), (max-width: 700px), (max-width: 1024px) and (max-height: 600px)').matches){
    try{void document.documentElement.requestFullscreen?.({navigationUI:'hide'}).catch(()=>{});}catch{/* Manual landscape play is still available. */}
  }
  try{
    game=await import('./main');
    document.getElementById('game-root')!.hidden=false;
    document.getElementById('launcher')!.hidden=true;
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
