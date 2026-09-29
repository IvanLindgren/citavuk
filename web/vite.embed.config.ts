import { defineConfig } from 'vite';

/**
 * Сборка 3D-машинки для приложения: один самодостаточный IIFE без React и без
 * остального сайта. Дальше `scripts/build-typewriter-embed.mjs` вкладывает его в
 * HTML вместе со шрифтами.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    lib: {
      entry: 'src/games/cases/typewriterEmbed.ts',
      name: 'TypewriterEmbed',
      formats: ['iife'],
      fileName: () => 'typewriter3d.js',
    },
  },
});
