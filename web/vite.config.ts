import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Корневой .env общий для Go, Flutter и React. В web-bundle попадает только
  // публичный client_id; client secret намеренно не читается и не публикуется.
  const rootEnv = loadEnv(mode, '..', '');
  const googleClientId =
    rootEnv.VITE_GOOGLE_CLIENT_ID?.trim() ||
    rootEnv.GOOGLE_CLIENT_ID_WEB?.trim() ||
    '';

  return {
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
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
      // поднятого рядом Go. Если правите сам сервер, поменяйте адрес на
      // http://127.0.0.1:8090 (переменная окружения потребовала бы типов Node
      // ради одной строки).
      '/v1': {
        target: 'https://api.citavuk.ru',
        changeOrigin: true,
      },
      '/audio': {
        target: 'https://api.citavuk.ru',
        changeOrigin: true,
      },
      '/documents': {
        target: 'https://api.citavuk.ru',
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
