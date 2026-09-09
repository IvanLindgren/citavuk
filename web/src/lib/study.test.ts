import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {Study} from '../api/personal';
const session=vi.hoisted(()=>({owner:'citavuk-user-a'}));
vi.mock('./db',()=>({activeStorageName:()=>session.owner}));
import {acceptStudy,readStudy,recordStudy,flushStudy} from './study';
import {setToken} from '../api/client';
const state=(asOf='2026-09-09T10:00:00Z'):Study=>({timezone:'Europe/Belgrade',today:'2026-09-09',current:2,longest:2,freezes:2,activeDays:2,todayActive:true,newDay:true,days:[],asOf});
beforeEach(()=>{session.owner='citavuk-user-a';localStorage.clear();setToken('cookie');});
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
it('не переносит поздний ответ в другой аккаунт и не откатывает снимок',()=>{
 acceptStudy(state());acceptStudy({...state('2026-09-09T09:00:00Z'),current:1});expect(readStudy()?.current).toBe(2);
 session.owner='citavuk-user-b';acceptStudy(state(),'citavuk-user-a');expect(readStudy()).toBeNull();
});
it('сцена один раз после действия, а не при фоновой загрузке',()=>{
 const listener=vi.fn();window.addEventListener('citavuk-study-celebrate',listener);
 acceptStudy(state());expect(listener).not.toHaveBeenCalled();
 acceptStudy(state(),session.owner,true);acceptStudy(state(),session.owner,true);expect(listener).toHaveBeenCalledTimes(1);
 window.removeEventListener('citavuk-study-celebrate',listener);
});
it('при сетевой ошибке событие остаётся, повтор использует тот же id',async()=>{
 const fetch=vi.fn().mockRejectedValue(new TypeError('offline'));vi.stubGlobal('fetch',fetch);
 recordStudy('exercise','lesson-1');await new Promise(resolve=>setTimeout(resolve,10));
 const key=Object.keys(localStorage).find(k=>k.startsWith('citavuk-study-outbox'))!;
 const event=JSON.parse(localStorage.getItem(key)!);expect(event.eventId).toBeTruthy();
 fetch.mockResolvedValue(new Response(JSON.stringify(state())));await flushStudy();
 expect(JSON.parse(fetch.mock.calls.at(-1)![1].body).eventId).toBe(event.eventId);
 expect(localStorage.getItem(key)).toBeNull();
});
