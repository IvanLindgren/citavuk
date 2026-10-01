import { defineConfig } from 'vite';
export default defineConfig({ publicDir:false, build:{outDir:'dist-slot-embed',emptyOutDir:true,target:'es2020',lib:{entry:'src/games/speaking/slotEmbed.ts',name:'SlotEmbed',formats:['iife'],fileName:()=> 'slot_machine.js'}} });
