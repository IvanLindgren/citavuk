/**
 * Встраиваемая страница автомата для приложения: та же сцена, что на сайте,
 * внутри WebView. Flutter присылает состояние через `window.SlotMachine.setState`,
 * а страница отвечает через обработчик `slot`: ready | pull | landed | failed.
 */
import { SLOT_ASSETS, type SlotAssets } from './slotAssets';
import { createSlotScene, type SlotGenre, type SlotScene, type SlotTopic } from './slotScene';

interface SlotState {
  genres: SlotGenre[];
  topics: SlotTopic[];
  title: string;
  spinId: number;
  topicId?: string;
  reduced: boolean;
}

function notify(type: string) {
  const bridge = (window as unknown as { flutter_inappwebview?: { callHandler(name: string, payload: unknown): Promise<unknown> } }).flutter_inappwebview;
  void bridge?.callHandler('slot', { type }).catch(() => {});
}

// Рисунок Читавука и шрифты build-slot-embed.mjs кладёт в страницу data-URL-ами: у WebView нет origin сайта.
const packed = (window as unknown as { __SLOT_FILES__?: Record<string, string> }).__SLOT_FILES__ ?? {};
const files = Object.fromEntries(
  Object.entries(packed).map(([url, value]) => [url, value.startsWith('svg:') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value.slice(4))}` : value]),
);
const assets: SlotAssets = {
  wolf: Object.fromEntries(Object.entries(SLOT_ASSETS.wolf).map(([part, url]) => [part, files[url] ?? ''])) as SlotAssets['wolf'],
  fonts: SLOT_ASSETS.fonts.filter((font) => files[font.url]).map((font) => ({ ...font, url: files[font.url]! })),
};
let scene: SlotScene | null = null;
let lastSpin = 0;
let lastData = '';
try {
  scene = createSlotScene(document.querySelector('canvas')!, { landed: () => notify('landed'), pull: () => notify('pull'), failed: () => notify('failed') }, assets);
  notify('ready');
  window.addEventListener('flutterInAppWebViewPlatformReady', () => notify(scene ? 'ready' : 'failed'));
} catch {
  notify('failed');
}

const api = {
  setState(value: SlotState) {
    if (!scene) return;
    // Flutter присылает состояние при каждой перерисовке экрана: пул переустанавливаем, только если он сменился.
    const data = `${value.genres.map((genre) => genre.id).join(',')}#${value.topics.map((topic) => topic.id).join(',')}`;
    if (data !== lastData) {
      lastData = data;
      scene.setData(value.genres, value.topics);
    }
    scene.setTitle(value.title);
    const topic = value.topics.find((item) => item.id === value.topicId);
    if (value.spinId > lastSpin && topic) {
      lastSpin = value.spinId;
      scene.spin(topic, value.reduced);
    }
  },
};
(window as unknown as { SlotMachine: typeof api }).SlotMachine = api;
window.addEventListener('pagehide', () => scene?.dispose(), { once: true });
