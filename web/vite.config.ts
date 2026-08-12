import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Отпечаток картинок сада.
 *
 * Всё в public/ отдаётся под собственным именем, а nginx ставит на /img месяц
 * кеша. Перерисованный спрайт из-за этого до месяца не доезжал до тех, кто уже
 * заходил в сад. Хеш содержимого попадает в адреса как ?v= и меняется ровно
 * тогда, когда меняется рисунок.
 */
function gardenArtHash(): string {
  const root = join(__dirname, 'public', 'img', 'garden');
  const hash = createHash('md5');
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.webp')) hash.update(entry.name).update(readFileSync(path));
    }
  };
  try {
    walk(root);
  } catch {
    return 'dev';
  }
  return hash.digest('hex').slice(0, 8);
}

export default defineConfig(({ mode }) => {
  // Корневой .env общий для Go, Flutter и React. В web-bundle попадает только
  // публичный client_id; client secret намеренно не читается и не публикуется.
  const rootEnv = loadEnv(mode, '..', '');
  const googleClientId =
    rootEnv.VITE_GOOGLE_CLIENT_ID?.trim() ||
    rootEnv.GOOGLE_CLIENT_ID_WEB?.trim() ||
    '';
  const devApiTarget =
    rootEnv.CITAVUK_DEV_API?.trim() ||
    'https://api.citavuk.ru';

  return {
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
      __GARDEN_ART__: JSON.stringify(gardenArtHash()),
    },
    plugins: [react(), tailwindcss()],
  build: {
    // Ассеты кладём в отдельную папку с хешами в именах: nginx отдаёт их с
    // «вечным» кешем, а index.html — без кеша, поэтому обновление сайта
    // подхватывается сразу, а картинки и шрифты не перекачиваются.
    assetsDir: 'assets',
    // Мелочь вроде иконок инлайнится в CSS и экономит запросы, но крупные
    // файлы должны оставаться отдельными — иначе они попадут в тот же бандл,
    // который обязан перекачиваться при каждом изменении кода.
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          // Библиотека анимаций весит заметно и меняется реже нашего кода:
          // отдельный чанк переживает выкатки и остаётся в кеше браузера.
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // В разработке API проксируется: так путь совпадает с production и не
      // приходится думать про CORS.
      //
      // По умолчанию — боевой сервер, чтобы `npm run dev` работал сразу, без
      // поднятого рядом Go. Для локального сервера задайте
      // CITAVUK_DEV_API=http://127.0.0.1:8090.
      '/v1': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/audio': {
        target: devApiTarget,
        changeOrigin: true,
      },
      '/documents': {
        target: devApiTarget,
        changeOrigin: true,
      },
    },
  },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
