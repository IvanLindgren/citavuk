import {useEffect,useState} from 'react';
import type {Study} from '../api/personal';
import {readStudy} from './study';
export function useStudy(){
 const [study,setStudy]=useState(readStudy);
 useEffect(()=>{const change=(event:Event)=>setStudy((event as CustomEvent<Study>).detail);window.addEventListener('citavuk-study',change);return()=>window.removeEventListener('citavuk-study',change);},[]);
 return study;
}
