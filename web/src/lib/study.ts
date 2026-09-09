import {request,getToken,ApiError} from '../api/client';
import {activeStorageName} from './db';
import type {Study} from '../api/personal';

const queuePrefix=(owner:string)=>`citavuk-study-outbox-v1:${owner}:`;
let running=false;
export const studyCacheKey=(owner=activeStorageName())=>`citavuk-study-v1:${owner}`;
export function readStudy():Study|null {try{return JSON.parse(localStorage.getItem(studyCacheKey())??'null') as Study|null;}catch{return null;}}
export function acceptStudy(data:Study,owner=activeStorageName(),userAction=false){
 if(owner!==activeStorageName())return;
 const previous=readStudy();
 const momentKey=`citavuk-study-moment-v1:${owner}`;
 if(userAction&&data.todayActive&&(!previous||data.today===previous.today)){
   try{if(localStorage.getItem(momentKey)!==data.today){localStorage.setItem(momentKey,data.today);window.dispatchEvent(new CustomEvent('citavuk-study-celebrate',{detail:data}));}}catch{/* Без хранилища не повторяем сцену на каждом ответе. */}
 }
 if(previous?.asOf&&data.asOf&&Date.parse(previous.asOf)>Date.parse(data.asOf))return;
 try{localStorage.setItem(studyCacheKey(owner),JSON.stringify(data));}catch{/* Частный режим: показ возможен и без кеша. */}
 window.dispatchEvent(new CustomEvent('citavuk-study',{detail:data}));
}
export async function refreshStudy(){
 const owner=activeStorageName();if(!getToken()||!owner.startsWith('citavuk-user-'))return;
 try{
  let data=await request<Study>('/v1/study',{timeoutMs:8000});
  if(owner!==activeStorageName())return;
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  // После первого занятия пояс уже закреплён. Не пытаемся менять его на
  // каждом экране: это создавало ложные 409 рядом с созданием колоды.
  if(data.activeDays===0&&data.timezone!==timezone){
   try{data=await request<Study>('/v1/study',{method:'PUT',body:{timezone},timeoutMs:8000});}
   catch(error){
    if(!(error instanceof ApiError)||error.status!==409)throw error;
    // Другое устройство могло завершить первое занятие между GET и PUT.
    if(owner!==activeStorageName())return;
    data=await request<Study>('/v1/study',{timeoutMs:8000});
   }
  }
  acceptStudy(data,owner);
  void flushStudy();
 }catch{/* Офлайн сохраняется снимок. */}
}
export function recordStudy(source:'exercise'|'course'|'review'|'daily',reference:string,answered=1,owner=activeStorageName()){
 if(owner!==activeStorageName()||!getToken()||!owner.startsWith('citavuk-user-')||!reference.trim()||answered<1||answered>1000)return;
 const event={eventId:crypto.randomUUID(),source,reference:reference.slice(0,200),answered,occurredAt:new Date().toISOString()};
 try{
   const keys=Object.keys(localStorage).filter(k=>k.startsWith(queuePrefix(owner)));
   if(keys.length>=300)return; // Уже накоплено достаточно событий для догоняющей синхронизации.
   localStorage.setItem(queuePrefix(owner)+event.eventId,JSON.stringify(event));
 }catch{return;}
 void flushStudy();
}
export async function flushStudy(){
 if(running||!getToken())return;
 const owner=activeStorageName(),prefix=queuePrefix(owner);running=true;
 try{
  // Одна запись на событие: два окна не затирают очередь друг друга.
  const keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix)).slice(0,300);
  for(const key of keys){
   if(owner!==activeStorageName())break;
   const raw=localStorage.getItem(key);if(!raw)continue;
   let event:unknown;try{event=JSON.parse(raw);}catch{localStorage.removeItem(key);continue;}
   try {
     const data=await request<Study>('/v1/study/attempts',{method:'POST',body:event,timeoutMs:8000});
     localStorage.removeItem(key);acceptStudy(data,owner,true);
   } catch(error) {
     if(error instanceof ApiError && (error.status===400||error.status===422))localStorage.removeItem(key);
     else throw error;
   }
  }
 }catch{/* Повторяем то же eventId после восстановления сети. */}
 finally{running=false;if(owner!==activeStorageName()&&getToken())void flushStudy();}
}
