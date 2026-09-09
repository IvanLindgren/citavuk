import {useEffect, useMemo, useRef, useState} from 'react';
import {ttsAudioUrl} from '../api/listening';
import {speechChunks} from '../lib/speech';

/** Озвучка по запросу: не загружаем тридцать аудиоуроков при открытии колоды. */
export function PersonalAudio({text}:{text:string}) {
  const chunks=useMemo(()=>speechChunks(text),[text]);
  const [part,setPart]=useState(0),[error,setError]=useState('');
  const audio=useRef<HTMLAudioElement>(null),continuePlaying=useRef(false);
  useEffect(()=>{
    const player=audio.current;
    if(continuePlaying.current && player){
      continuePlaying.current=false;
      void player.play().catch(()=>setError('Нажми воспроизведение, чтобы продолжить.'));
    }
  },[part]);
  useEffect(()=>{const pause=()=>{if(document.hidden)audio.current?.pause();};document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause);},[]);
  if(!chunks.length)return null;
  return <section aria-label="Озвучка урока">
    <p>Послушай текст <small>Часть {part+1} из {chunks.length}</small></p>
    <audio ref={audio} controls preload="none" src={ttsAudioUrl(chunks[part]!)}
      onEnded={()=>{if(part+1<chunks.length){continuePlaying.current=true;setPart(part+1);}}}
      onError={()=>setError('Озвучка не загрузилась. Попробуй ещё раз.')} />
    <div className="personal-actions">
      <button type="button" disabled={part===0} onClick={()=>{setError('');setPart(part-1);}}>Предыдущая часть</button>
      <button type="button" disabled={part+1===chunks.length} onClick={()=>{setError('');setPart(part+1);}}>Следующая часть</button>
    </div>{error&&<p role="status">{error}</p>}
  </section>;
}
