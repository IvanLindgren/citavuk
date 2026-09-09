import {lazy,Suspense,useEffect,useState} from 'react';
import {useReducedMotion} from 'framer-motion';
import {useAuth} from '../state/auth';
import {refreshStudy} from '../lib/study';
import type {Study} from '../api/personal';
import './study.css';
const Wolf=lazy(()=>import('../course/BoneMascot').then(m=>({default:m.BoneMascot})));

export function StudyRuntime(){
 const {account}=useAuth();
 return account?<StudySession key={account.id}/>:null;
}
function StudySession(){
 const [moment,setMoment]=useState<Study|null>(null);const reduced=useReducedMotion();
 useEffect(()=>{
  void refreshStudy();const online=()=>void refreshStudy();const visible=()=>{if(!document.hidden)void refreshStudy();};
  const celebrate=(e:Event)=>setMoment((e as CustomEvent<Study>).detail);
  window.addEventListener('online',online);document.addEventListener('visibilitychange',visible);window.addEventListener('citavuk-study-celebrate',celebrate);
  return()=>{window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visible);window.removeEventListener('citavuk-study-celebrate',celebrate);};
 },[]);
 useEffect(()=>{if(!moment)return;const id=setTimeout(()=>setMoment(null),5000);return()=>clearTimeout(id);},[moment]);
 if(!moment)return null;
 return <aside className="study-toast" role="status"><button className="study-close" aria-label="Закрыть" onClick={()=>setMoment(null)}>×</button><h2>Огонь зажжён!</h2><div className={`study-scene ${reduced?'is-still':''}`}><Suspense fallback={null}><Wolf key={moment.today} state={reduced?'idle':'stoke'} size={170}/></Suspense><span className="study-match" aria-hidden/><div className="study-stove" aria-hidden><svg viewBox="0 0 120 140"><path d="M48 5h26v30H48z" fill="#6a5141"/><rect x="18" y="30" width="86" height="99" rx="14" fill="#83523c" stroke="#d7b77a" strokeWidth="4"/><path d="M20 55h80M20 105h80" stroke="#bc9271" strokeWidth="3"/><rect x="35" y="58" width="53" height="45" rx="9" fill="#251a19" stroke="#c2a267" strokeWidth="3"/><path className="study-flame" d="M60 98C35 94 48 75 53 73c-2 9 5 8 5 0l7-11c14 19 23 34-5 36z" fill="#ffb629"/><path d="M33 130v7m57-7v7" stroke="#563a31" strokeWidth="7"/></svg><span className="study-stars">✦</span></div></div><p>Твоя серия: <strong>{moment.current} дн.</strong></p></aside>;
}
