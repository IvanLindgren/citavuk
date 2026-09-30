import { expect, it } from 'vitest';
import { rouletteStop, rouletteProgress, ROULETTE_SPIN_MS } from './rouletteMath';
it('every sector lands at the same pointer without using frame count',()=>{
 for(const count of [1,2,15])for(let i=0;i<count;i++)for(const current of [0,27,84]){
  const to=rouletteStop(i,count,current),angle=(i+.5)*2*Math.PI/count+to;
  expect(to).toBeGreaterThan(current+4*2*Math.PI);expect(Math.sin(angle)).toBeCloseTo(1,8);expect(Math.cos(angle)).toBeCloseTo(0,8);
 }
 expect(rouletteProgress(0)).toBe(0);expect(rouletteProgress(ROULETTE_SPIN_MS)).toBe(1);
});
