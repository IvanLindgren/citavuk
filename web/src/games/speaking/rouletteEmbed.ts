import { createRouletteScene, type RouletteScene, type RouletteGenre } from './rouletteScene';

function notify(type:string) {
  const bridge=(window as unknown as {flutter_inappwebview?:{callHandler(name:string,payload:unknown):Promise<unknown>}}).flutter_inappwebview;
  void bridge?.callHandler('roulette',{type}).catch(()=>{});
}
let scene:RouletteScene|null=null,lastSpin=0;
try {
  scene=createRouletteScene(document.querySelector('canvas')!,{landed:()=>notify('landed'),tick:()=>{},failed:()=>notify('failed')});
  notify('ready');
  window.addEventListener('flutterInAppWebViewPlatformReady',()=>notify(scene?'ready':'failed'));
} catch {notify('failed');}
const api = {
  setState(value:{genres:RouletteGenre[];spinId:number;genre?:string;reduced:boolean}){
    if(!scene)return;scene.setGenres(value.genres);
    if(value.spinId>lastSpin&&value.genre){lastSpin=value.spinId;scene.spin(value.genre,value.reduced);}
  }
};
(window as unknown as {Roulette:typeof api}).Roulette=api;
window.addEventListener('pagehide',()=>scene?.dispose(),{once:true});
