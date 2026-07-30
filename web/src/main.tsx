import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { installChunkRecovery } from './lib/chunkRecovery';
import './index.css';

installChunkRecovery();

const container = document.getElementById('root');
if (!container) {
  throw new Error('В разметке нет элемента #root');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
