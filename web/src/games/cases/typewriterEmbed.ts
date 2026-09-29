/**
 * Точка входа для приложения: та же 3D-машинка, что на сайте, внутри WebView.
 *
 * Сцена (`typewriterScene.ts`) одна на сайт и приложение, поэтому лапы, клавиши и
 * лист выглядят и двигаются одинаково; здесь только мост. Flutter вызывает
 * `window.TW.setPaper(...)` и `window.TW.strike(...)`, а нажатия по клавишам и
 * состояние сцены возвращаются обработчиком `tw`.
 *
 * Собирается `scripts/build-typewriter-embed.mjs` в один HTML-файл рядом с
 * ассетами приложения.
 */

import { inputFromKeyboard } from './keyboard';
import { createTypewriterScene, type PaperState, type TypewriterScene } from './typewriterScene';

interface Bridge {
  callHandler(name: string, ...args: unknown[]): Promise<unknown>;
}

declare global {
  interface Window {
    flutter_inappwebview?: Bridge;
    TW?: {
      setPaper(state: PaperState): void;
      strike(key: string): void;
    };
  }
}

const pending: Record<string, unknown>[] = [];

function send(message: Record<string, unknown>) {
  const bridge = window.flutter_inappwebview;
  if (bridge?.callHandler) {
    void bridge.callHandler('tw', message);
    return;
  }
  // Мост появляется чуть позже загрузки страницы.
  pending.push(message);
}

window.addEventListener('flutterInAppWebViewPlatformReady', () => {
  for (const message of pending.splice(0)) send(message);
});

function start() {
  const canvas = document.getElementById('tw-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  let scene: TypewriterScene;
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    scene = createTypewriterScene(canvas, { lowPower: coarse || (navigator.hardwareConcurrency ?? 8) <= 4 });
  } catch {
    send({ type: 'failed' });
    return;
  }

  const fit = () => scene.resize(window.innerWidth, window.innerHeight);
  new ResizeObserver(fit).observe(document.body);
  fit();

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    send({ type: 'failed' });
  });

  // Удар по нажатию пальца начинается сразу, не дожидаясь круга через Flutter:
  // иначе на телефоне между касанием и лапой была бы заметная пауза. Ответное
  // strike() от Flutter для той же клавиши сцена пропускает.
  let local: { key: string; at: number } | null = null;
  const strike = (key: string) => {
    local = { key, at: performance.now() };
    scene.strike(key);
  };

  canvas.addEventListener('pointerdown', (event) => {
    const key = scene.pick(event.clientX, event.clientY, event.pointerType !== 'mouse');
    if (!key) return;
    event.preventDefault();
    strike(key);
    send({ type: 'key', key });
  });
  // Физическая клавиатура. На десктопе после щелчка по машинке фокус остаётся у
  // WebView, а не у Flutter, поэтому нажатия передаются наверх той же
  // раскладкой, что и на сайте (`keyboard.ts`).
  window.addEventListener('keydown', (event) => {
    const input = inputFromKeyboard(event);
    if (!input) return;
    event.preventDefault();
    const keys = input.kind === 'text' ? [...input.text] : [input.kind];
    for (const key of keys) {
      strike(key);
      send({ type: 'key', key });
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    canvas.style.cursor = scene.pick(event.clientX, event.clientY, false) ? 'pointer' : '';
  });

  window.TW = {
    setPaper: (state) => scene.setPaper(state),
    strike: (key) => {
      if (local && local.key === key && performance.now() - local.at < 350) return;
      scene.strike(key);
    },
  };
  send({ type: 'ready' });
}

start();
