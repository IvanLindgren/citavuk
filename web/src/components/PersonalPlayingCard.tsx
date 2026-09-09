import {useRef} from 'react';
import {motion,useInView,useMotionValue,useReducedMotion,useSpring,useTransform} from 'framer-motion';
import {LuArrowRight,LuCheck,LuLock} from 'react-icons/lu';
import {PlayingCardFrame,lessonSuit} from './PlayingCardFrame';
import './playing-card.css';

const kinds:Record<string,string>={reading:'Чтение',grammar:'Грамматика',vocabulary:'Лексика',listening:'Понимание речи',writing:'Письмо'};
export function PersonalPlayingCard({day,month,kind,title,ready,today,completed,onOpen}:{day:number;month:number;kind:string;title:string;ready:boolean;today:boolean;completed?:string;onOpen:()=>void}) {
 const ref=useRef<HTMLButtonElement>(null),reduced=useReducedMotion();
 const inView=useInView(ref,{once:true,amount:.35});
 const x=useMotionValue(0),y=useMotionValue(0);
 const rx=useSpring(useTransform(y,[-1,1],[4,-4]),{stiffness:170,damping:22});
 const ry=useSpring(useTransform(x,[-1,1],[-5,5]),{stiffness:170,damping:22});
 const lightX=useTransform(x,[-1,1],['15%','85%']);
 const lightY=useTransform(y,[-1,1],['15%','85%']);
 const reset=()=>{x.set(0);y.set(0);};
 return <motion.button ref={ref} type="button"
  className={`personal-card ${ready?'is-open':'is-closed'} ${today&&ready?'is-today':''} ${inView?'is-revealed':''}`}
  disabled={!ready} aria-label={`Карта ${day}. ${title}. ${ready?(completed||'Открыть'):'Закрыта'}`}
  onClick={onOpen} onPointerLeave={reset} onBlur={reset}
  onPointerMove={e=>{if(reduced||e.pointerType!=='mouse')return;const b=e.currentTarget.getBoundingClientRect();x.set(Math.max(-1,Math.min(1,(e.clientX-b.left)/b.width*2-1)));y.set(Math.max(-1,Math.min(1,(e.clientY-b.top)/b.height*2-1)));}}
  style={reduced?undefined:{rotateX:rx,rotateY:ry,transformPerspective:900}}
  whileTap={reduced?undefined:{scale:.975}}>
  <span className="playing-surface" aria-hidden="true">
   {ready&&<img className="playing-art" src={`/personal/months/${String(month).padStart(2,'0')}.webp`} alt="" loading="lazy" decoding="async"/>}
   <span className="playing-depth"/>
  </span>
  <PlayingCardFrame back={!ready}/>
  <span className="playing-index" aria-hidden="true">{day}<span>{lessonSuit(kind)}</span></span>
  <span className="playing-index is-reversed" aria-hidden="true">{day}<span>{lessonSuit(kind)}</span></span>
  <span className="playing-kind">{kinds[kind]||'Урок'}</span>
  <span className="playing-caption"><span className="playing-label">{today&&ready?'Твоя карта сегодня':completed?'В твоей коллекции':ready?'Открытая карта':'Впереди новое открытие'}</span>
   <span className="personal-card-title">{title}</span>
   <span className="personal-card-bottom">{completed?<><LuCheck/>{completed}</>:ready?<>Открыть карту <LuArrowRight/></>:<><LuLock/>День {day}</>}</span>
  </span>
  <motion.span className="playing-lacquer" aria-hidden="true" style={reduced?undefined:{backgroundPositionX:lightX,backgroundPositionY:lightY}}/>
  <span className="playing-sheen" aria-hidden="true"/>
  {today&&ready&&<><img className="playing-glow" src="/personal/decor/glow.png" alt=""/><img className="playing-edge-star" src="/personal/decor/glint.png" alt=""/></>}
 </motion.button>;
}
