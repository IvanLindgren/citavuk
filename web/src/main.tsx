import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { installChunkRecovery } from './lib/chunkRecovery';
import { revealI18n, startI18n } from './lib/i18n';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('В разметке нет элемента #root');
}

function StartupReady() {
  useEffect(() => {
    revealI18n();
    window.dispatchEvent(new Event('citavuk-ready'));
  }, []);
  return null;
}

// Повторный запрос entry после сетевого таймаута не создаёт второй React root.
const bootWindow = window as Window & { __citavukMounted?: boolean };
if (!bootWindow.__citavukMounted) {
  bootWindow.__citavukMounted = true;
  installChunkRecovery();
  // Словарь нужен до первой отрисовки: иначе страница мигнёт по-русски.
  void startI18n().catch(() => {}).then(() => createRoot(container).render(
  <StrictMode>
    <App />
    <StartupReady />
  </StrictMode>,
  ));
}
