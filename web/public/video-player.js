/* Оригинальный плеер, без прокси медиа и без сессионных данных Читавука. */
(() => {
  const id=new URLSearchParams(location.search).get('v');
  const feedMode=new URLSearchParams(location.search).get('feed')==='1';
  const error=document.getElementById('error');
  if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id)){error.hidden=false;return;}
  let player;
  const emit=(state,ready=false)=>{
    const data={type:'citavuk-video',id,state,ready,duration:player?.getDuration?.()||0};
    if(window.parent!==window)window.parent.postMessage(data,location.origin);
    if(window.flutter_inappwebview?.callHandler)window.flutter_inappwebview.callHandler('citavukVideo',data).catch(()=>{});
    if(window.webkit?.messageHandlers?.citavukVideo)window.webkit.messageHandlers.citavukVideo.postMessage(JSON.stringify(data));
  };
  window.onYouTubeIframeAPIReady=()=>{
    player=new YT.Player('player',{videoId:id,host:'https://www.youtube-nocookie.com',playerVars:{playsinline:1,controls:1,rel:0,origin:location.origin},events:{
      onReady:()=>{emit(-1,true);if(feedMode&&!document.hidden){player.mute();player.playVideo();}},
      onStateChange:e=>{if(e.data===1)error.hidden=true;emit(e.data);},
      onAutoplayBlocked:()=>emit(5),
      onError:()=>{error.hidden=feedMode;emit(-2);}
    }});
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&player?.pauseVideo)player.pauseVideo();});
  window.addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==window.parent)return;
    if(e.data?.type==='citavuk-pause')player?.pauseVideo?.();
    if(e.data?.type!=='citavuk-control')return;
    if(e.data.action==='pause')player?.pauseVideo?.();
    if(e.data.action==='play'&&!document.hidden)player?.playVideo?.();
    if(e.data.action==='mute'){
      if(e.data.value===true)player?.mute?.();
      if(e.data.value===false)player?.unMute?.();
    }
  });
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{error.hidden=feedMode;emit(-2);};document.head.appendChild(script);
})();
