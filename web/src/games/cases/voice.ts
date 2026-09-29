/**
 * Голосовой режим игры: распознавание речи браузера (Web Speech API).
 *
 * Слушаем непрерывно и с промежуточными результатами: ответ засчитывается,
 * как только нужная форма прозвучала, не дожидаясь конца фразы. Chrome
 * сам останавливает распознавание после паузы — перезапускаем его, пока
 * голосовой режим включён.
 */

import { normalizeAnswer, DIACRITIC_BASE } from './data';

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupported(): boolean {
  return recognitionCtor() !== null;
}

export type VoiceError = 'denied' | 'network' | 'language' | 'other';

export interface VoiceHandlers {
  /**
   * Варианты услышанного; final — фраза закончена. index — номер фразы в
   * текущем сеансе: промежуточные результаты одной фразы приходят с одним
   * номером и растут, пока человек говорит.
   */
  onHeard: (alternatives: string[], final: boolean, index: string) => void;
  onError: (error: VoiceError) => void;
  onListening?: (listening: boolean) => void;
}

export function startVoice(handlers: VoiceHandlers): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError('other');
    return () => {};
  }
  let stopped = false;
  let recognition: Recognition | null = null;
  let session = 0;

  const launch = () => {
    if (stopped) return;
    session += 1;
    const current = session;
    recognition = new Ctor();
    recognition.lang = 'sr-RS';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const alternatives: string[] = [];
        for (let j = 0; j < result.length; j += 1) alternatives.push(result[j]!.transcript);
        handlers.onHeard(alternatives, result.isFinal, `${current}:${i}`);
      }
    };
    recognition.onerror = (event) => {
      // Тишина и сброс по паузе — обычное дело, их лечит перезапуск.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopped = true;
        handlers.onError('denied');
      } else if (event.error === 'network') {
        handlers.onError('network');
      } else if (event.error === 'language-not-supported') {
        stopped = true;
        handlers.onError('language');
      } else {
        handlers.onError('other');
      }
    };
    recognition.onend = () => {
      handlers.onListening?.(false);
      if (!stopped) window.setTimeout(launch, 150);
    };
    try {
      recognition.start();
      handlers.onListening?.(true);
    } catch {
      handlers.onError('other');
    }
  };

  launch();
  return () => {
    stopped = true;
    try {
      recognition?.abort();
    } catch {
      // Уже остановлено.
    }
  };
}

export function words(value: string): string[] {
  return normalizeAnswer(value).replace(/[.,!?;:"«»()]/g, ' ').split(/\s+/).filter(Boolean);
}

function fold(value: string): string {
  let out = '';
  for (const ch of value) out += ch === 'đ' ? 'dj' : DIACRITIC_BASE[ch] ?? ch;
  return out;
}

/**
 * Прозвучал ли где-то в фразе один из верных ответов — целыми словами.
 * Распознаватель иногда теряет чёрточки (особенно в латинице), поэтому
 * сравнение идёт без них: голосом диакритику «ошибиться» нельзя.
 */
export function spokenAnswer(alternatives: string[], answers: string[]): string | null {
  for (const heard of alternatives) {
    const said = words(heard).map(fold);
    for (const answer of answers) {
      const target = words(answer).map(fold);
      if (!target.length) continue;
      for (let i = 0; i + target.length <= said.length; i += 1) {
        if (target.every((word, k) => said[i + k] === word)) return answer;
      }
    }
  }
  return null;
}
