import type { AudioCue } from './types';

export function timedWords(cue: AudioCue) {
  let cursor = 0;
  return (cue.words ?? []).flatMap(word => {
    const text = word.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
    if (!text) return [];
    const offset = cue.text.toLowerCase().indexOf(text, cursor);
    if (offset < 0) return [];
    cursor = offset + text.length;
    return [{ ...word, offset, characterEnd: cursor }];
  });
}
export function characterAt(cue: AudioCue, seconds: number) {
  return timedWords(cue).find(w => seconds >= w.start && seconds < w.end)?.offset ?? -1;
}
export function timeAtCharacter(cue: AudioCue, character: number) {
  return timedWords(cue).find(w => character >= w.offset && character < w.characterEnd)?.start ?? cue.start;
}
