import { useEffect, useState } from 'react';
import { HiSpeakerWave } from 'react-icons/hi2';

import {
  getTtsVoice,
  setTtsVoice,
  TTS_VOICE_EVENT,
  type SerbianTtsVoice,
} from '../api/listening';

export function TtsVoicePicker({ compact = false }: { compact?: boolean }) {
  const [voice, updateVoice] = useState<SerbianTtsVoice>(() => getTtsVoice());

  useEffect(() => {
    const onVoice = (event: Event) => {
      const next = (event as CustomEvent<SerbianTtsVoice>).detail;
      if (next === 'sophie' || next === 'nicholas') updateVoice(next);
    };
    window.addEventListener(TTS_VOICE_EVENT, onVoice);
    return () => window.removeEventListener(TTS_VOICE_EVENT, onVoice);
  }, []);

  const choose = (next: SerbianTtsVoice) => {
    updateVoice(next);
    setTtsVoice(next);
  };

  if (compact) {
    return (
      <label
        className="relative grid size-10 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
        title={`Диктор: ${voice === 'sophie' ? 'София' : 'Никола'}`}
      >
        <HiSpeakerWave className="size-5" aria-hidden="true" />
        <select
          value={voice}
          onChange={(event) => choose(event.target.value as SerbianTtsVoice)}
          aria-label="Диктор сербской речи"
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="sophie">София, женский голос</option>
          <option value="nicholas">Никола, мужской голос</option>
        </select>
      </label>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
      <HiSpeakerWave className="size-5" aria-hidden="true" />
      <span>Диктор</span>
      <select
        value={voice}
        onChange={(event) => choose(event.target.value as SerbianTtsVoice)}
        className="rounded-md border border-[var(--line)] bg-[var(--bg-sunken)] px-2.5 py-2 text-[var(--text)]"
      >
        <option value="sophie">София</option>
        <option value="nicholas">Никола</option>
      </select>
    </label>
  );
}
