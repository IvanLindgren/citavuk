import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { SpeakingGenre, SpeakingTopic } from '../../api/speaking';
import type { RouletteScene } from './rouletteScene';

let audio: AudioContext | null=null;
function tick(){try{audio??=new AudioContext();if(audio.state==='suspended')void audio.resume();const now=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.setValueAtTime(1100,now);gain.gain.setValueAtTime(.018,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.025);osc.connect(gain).connect(audio.destination);osc.start(now);osc.stop(now+.03);}catch{/* Звук необязателен. */}}

export interface ReelProps {pool:SpeakingTopic[];genres:SpeakingGenre[];spinId:number;target:SpeakingTopic|null;muted:boolean;onLanded:()=>void}

export function Reel(props: ReelProps) {
  const canvas=useRef<HTMLCanvasElement>(null),scene=useRef<RouletteScene|null>(null),live=useRef(props),lastSpin=useRef(0),landedSpin=useRef(0);live.current=props;
  const landed=()=>{if(live.current.spinId>landedSpin.current){landedSpin.current=live.current.spinId;live.current.onLanded();}};
  const reduced=useReducedMotion();const reducedRef=useRef(reduced);reducedRef.current=reduced;
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{let alive=true;void import('./rouletteScene').then(({createRouletteScene})=>{
    if(!alive||!canvas.current)return;
    try{scene.current=createRouletteScene(canvas.current,{landed,tick:()=>{if(!live.current.muted)tick();},failed:()=>{if(alive){setFailed(true);landed();}}});setReady(true);}catch{if(alive)setFailed(true);}
  }).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;scene.current?.dispose();scene.current=null;};},[]);
  const poolKey=props.pool.map(t=>t.genre).filter((v,i,a)=>a.indexOf(v)===i).join(',');
  useEffect(()=>{if(!ready||!scene.current)return;const ids=new Set(live.current.pool.map(t=>t.genre));scene.current.setGenres(live.current.genres.filter(g=>ids.has(g.id)));},[ready,poolKey,props.genres]);
  useEffect(()=>{if(!props.spinId||!props.target||props.spinId===lastSpin.current)return;if(!ready&&!failed)return;lastSpin.current=props.spinId;if(failed){landed();return;}scene.current?.spin(props.target.genre,Boolean(reducedRef.current));},[ready,failed,props.spinId,props.target,props.onLanded]);
  return <div className="relative mx-auto aspect-[1.32] w-full max-w-2xl" role="img" aria-label="Рулетка тем">
    {!failed&&<canvas ref={canvas} className="size-full" aria-hidden="true"/>}
    {failed&&<div className="grid h-full place-content-center rounded-full border-[12px] border-gold/50 bg-[var(--bg-sunken)] p-8 text-center"><span className="font-display text-2xl">{props.target?.ru??'Случайная тема'}</span></div>}
  </div>;
}
