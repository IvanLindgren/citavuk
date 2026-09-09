import {useEffect,useRef,useState} from 'react';
import {getMicroFeed,recordMicroFeedInteraction,type MicroFeedItem} from '../api/microFeed';
import {Button,Spinner} from '../components/ui';
import {Link} from '../lib/router';
import {activeStorageName} from '../lib/db';
import {useAuth} from '../state/auth';

export function VideoFeed(){
 const {account}=useAuth();
 return <VideoSession key={account?.id??'guest'}/>;
}
function VideoSession(){
 const [items,setItems]=useState<MicroFeedItem[]>([]),[index,setIndex]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const abort=useRef<AbortController|null>(null);const pending=useRef(false);const seen=useRef<string[]>([]);
 async function load(){if(pending.current)return;pending.current=true;setBusy(true);setError('');const c=new AbortController();abort.current=c;
  try{const data=await getMicroFeed(seen.current,c.signal,'video');if(!c.signal.aborted){const fresh=data.items.filter(v=>v.videoId&&!seen.current.includes(v.id));seen.current.push(...fresh.map(v=>v.id));setItems(old=>[...old,...fresh]);}}
  catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Видео не загрузились.');}
  finally{pending.current=false;if(!c.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>abort.current?.abort();},[]);
 const item=items[index];
 return <main className="min-h-[80vh] bg-[#101116] px-4 py-5 text-white"><nav className="mx-auto mb-4 flex max-w-3xl gap-4"><Link to="/library">Библиотека</Link><Link to="/vukotok">Тексты</Link><span aria-current="page" className="font-bold">Видео</span></nav>
  <div className="mx-auto max-w-lg">{item?<VideoCard key={item.id} item={item}/>:busy?<Spinner/>:<p>Пока нет новых опубликованных видео. Ролики появятся после проверки сербской речи.</p>}
  {error&&<p role="alert" className="my-4">{error}</p>}
  <div className="mt-4 flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>Предыдущее</Button><Button disabled={busy} onClick={()=>{if(index+1<items.length){setIndex(i=>i+1);if(index+3>=items.length)void load();}else{void load();}}}>{index+1<items.length?'Следующее':'Найти ещё'}</Button></div>
  </div>
 </main>;
}
function VideoCard({item}:{item:MicroFeedItem}){
 const frame=useRef<HTMLIFrameElement>(null);const playing=useRef<number|null>(null);const elapsed=useRef(0);const [error,setError]=useState('');const [reaction,setReaction]=useState(item.reaction);const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const owner=activeStorageName();
  const stop=()=>{if(playing.current!==null){elapsed.current+=performance.now()-playing.current;playing.current=null;}};
  const message=(e:MessageEvent)=>{if(e.origin!==location.origin||e.source!==frame.current?.contentWindow||e.data?.type!=='citavuk-video'||e.data?.id!==item.videoId)return;
    if(e.data.state===1&&!document.hidden){if(playing.current===null)playing.current=performance.now();}else{stop();if(e.data.state===-2)setError('Видео недоступно. Можно перейти к следующему.');}
  };
  const hidden=()=>{if(document.hidden){stop();frame.current?.contentWindow?.postMessage({type:'citavuk-pause'},location.origin);}};
  window.addEventListener('message',message);document.addEventListener('visibilitychange',hidden);
  return()=>{stop();window.removeEventListener('message',message);document.removeEventListener('visibilitychange',hidden);if(elapsed.current>0&&owner===activeStorageName())void recordMicroFeedInteraction(item.id,elapsed.current<2000?'quick_skip':'view',Math.min(3600000,elapsed.current)).catch(()=>{});};
 },[item.id,item.videoId]);
 async function react(value:1|-1){if(busy)return;setBusy(true);try{const next=reaction===value?0:value;await recordMicroFeedInteraction(item.id,next===0?'reaction_cleared':next===1?'like':'dislike');setReaction(next);}catch{setError('Не удалось сохранить реакцию. Попробуй ещё раз.');}finally{setBusy(false);}}
 return <article><h1 className="mb-2 text-xl font-bold">{item.titleLatin}</h1><p className="mb-3 text-sm text-white/65">{item.sourceTitle} · {item.cefr} · {item.videoDuration} сек.</p><iframe ref={frame} className="aspect-[9/16] max-h-[65vh] min-h-[240px] w-full rounded-2xl border-0 bg-black" src={`/video-player.html?v=${encodeURIComponent(item.videoId??'')}`} title={item.titleLatin} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>{error&&<p role="status">{error}</p>}<div className="mt-3 flex flex-wrap gap-3"><button disabled={busy} aria-pressed={reaction===1} onClick={()=>void react(1)} className="rounded-xl border border-white/30 px-4 py-3">Больше такого</button><button disabled={busy} aria-pressed={reaction===-1} onClick={()=>void react(-1)} className="rounded-xl border border-white/30 px-4 py-3">Меньше такого</button><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-3">Открыть на YouTube</a></div></article>;
}
