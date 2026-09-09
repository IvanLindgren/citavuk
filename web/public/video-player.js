/* Оригинальный плеер, без прокси медиа и без сессионных данных Читавука. */
(() => {
  const id=new URLSearchParams(location.search).get('v');
  const error=document.getElementById('error');
  if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id)){error.hidden=false;return;}
  let player;
  const emit=(state)=>{
    const data={type:'citavuk-video',id,state};
    if(window.parent!==window)window.parent.postMessage(data,location.origin);
    if(window.flutter_inappwebview?.callHandler)window.flutter_inappwebview.callHandler('citavukVideo',data).catch(()=>{});
    if(window.webkit?.messageHandlers?.citavukVideo)window.webkit.messageHandlers.citavukVideo.postMessage(JSON.stringify(data));
  };
  window.onYouTubeIframeAPIReady=()=>{
    player=new YT.Player('player',{videoId:id,host:'https://www.youtube-nocookie.com',playerVars:{playsinline:1,controls:1,rel:0,origin:location.origin},events:{onStateChange:e=>emit(e.data),onError:()=>{error.hidden=false;emit(-2);}}});
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&player?.pauseVideo)player.pauseVideo();});
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='citavuk-pause')player?.pauseVideo?.();});
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{error.hidden=false;emit(-2);};document.head.appendChild(script);
})();
