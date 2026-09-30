import { defineConfig } from 'vite';
export default defineConfig({ publicDir:false, build:{outDir:'dist-roulette-embed',emptyOutDir:true,target:'es2020',lib:{entry:'src/games/speaking/rouletteEmbed.ts',name:'RouletteEmbed',formats:['iife'],fileName:()=> 'roulette3d.js'}} });
