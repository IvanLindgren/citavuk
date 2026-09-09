import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BoneMascot } from './src/course/BoneMascot';
import './src/index.css';
function Preview() {
  const [state, setState] = useState('idle');
  const [run, setRun] = useState(0);
  return <main style={{ padding: 32, textAlign: 'center' }}><h1>Читавук: скелет и реакции</h1><div style={{ display: 'flex', justifyContent: 'center', gap: 24, margin: 24 }}>{[['idle','Покой'],['thinking','Думает'],['correct','Верно'],['incorrect','Ошибка'],['lessonComplete','Урок пройден']].map(([id,label]) => <button key={id} onClick={() => {setState(id);setRun(run+1);}}>{label}</button>)}</div><div style={{ display: 'flex', justifyContent: 'center', background:'#f7efdc', borderRadius:24, padding:24 }}><BoneMascot key={run} state={state} size={400}/></div></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
