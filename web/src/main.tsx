import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { installChunkRecovery } from './lib/chunkRecovery';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('В разметке нет элемента #root');
}

function StartupReady() {
  useEffect(() => { window.dispatchEvent(new Event('citavuk-ready')); }, []);
  return null;
}

// Повторный запрос entry после сетевого таймаута не создаёт второй React root.
const bootWindow = window as Window & { __citavukMounted?: boolean };
if (!bootWindow.__citavukMounted) {
  bootWindow.__citavukMounted = true;
  installChunkRecovery();
  createRoot(container).render(
  <StrictMode>
    <App />
    <StartupReady />
  </StrictMode>,
);
}
