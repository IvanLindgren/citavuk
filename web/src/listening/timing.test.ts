import { expect, it } from 'vitest';
import { characterAt, timeAtCharacter } from './timing';
it('uses actual ASR word times including repeated words', () => {
  const cue = {text:'Ovo je ovo.',start:1,end:5,words:[{text:'Ovo',start:1,end:1.5},{text:'je',start:2,end:2.2},{text:'ovo.',start:4,end:4.6}]};
  expect(characterAt(cue,4.1)).toBe(7);
  expect(timeAtCharacter(cue,8)).toBe(4);
  expect(characterAt(cue,3)).toBe(-1);
  expect(characterAt({text:'Bez vremena',start:0,end:10},5)).toBe(-1);
});
