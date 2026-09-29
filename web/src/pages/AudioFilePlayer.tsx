import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuClock3, LuFileAudio, LuUsers } from 'react-icons/lu';

import { WordLookupCard } from '../components/WordReader';
import { ErrorNote, Spinner } from '../components/ui';
import {
  getLocalAudioBlob,
  getLocalAudioFile,
  getLocalAudioTranscript,
  type AudioTranscript,
  type AudioTranscriptSegment,
  type AudioTranscriptWord,
  type LocalAudioFile,
} from '../lib/audioFiles';
import { Link, useParams } from '../lib/router';
import { useSeo } from '../lib/seo';
import { tokenize, type Token } from '../lib/tokenize';
import './audio-files.css';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; file: LocalAudioFile; transcript: AudioTranscript; url: string };

export function AudioFilePlayer() {
  const { id = '' } = useParams();
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState<{ segment: number; token: Token; anchor: DOMRect } | null>(null);

  useSeo({ title: state.kind === 'ready' ? `${state.file.title} — Читавук` : 'Звуковой файл — Читавук' });

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    Promise.all([getLocalAudioFile(id), getLocalAudioBlob(id), getLocalAudioTranscript(id)])
      .then(([file, blob, transcript]) => {
        if (!file || !blob || !transcript) throw new Error('Аудиофайл не найден на этом устройстве.');
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = '';
          return;
        }
        setState({ kind: 'ready', file, transcript, url: objectUrl });
      })
      .catch(error => {
        if (!cancelled) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Не удалось открыть запись.' });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const speakerNames = useMemo(() => {
    if (state.kind !== 'ready') return new Map<string, string>();
    return new Map(state.transcript.speakers.map((speaker, index) => [speaker, `Говорящий ${index + 1}`]));
  }, [state]);

  if (state.kind === 'loading') return <main className="audio-player-state"><Spinner className="size-7" /></main>;
  if (state.kind === 'error') return <main className="audio-player-state"><ErrorNote>{state.message}</ErrorNote><Link to="/audio-files">К звуковым файлам</Link></main>;

  return <main className="audio-file-player">
    <header className="audio-player-head">
      <div><Link to="/audio-files">Звуковые файлы</Link><h1>{state.file.title}</h1><p><LuUsers />{state.file.speakerCount} <LuClock3 />{formatTime(state.file.duration)}</p></div>
      <LuFileAudio />
    </header>

    <div className="audio-player-sticky">
      <audio ref={audio} src={state.url} controls preload="metadata" onTimeUpdate={event => setTime(event.currentTarget.currentTime)} />
      <span>{formatTime(time)} / {formatTime(state.file.duration)}</span>
    </div>

    <section className="audio-transcript" aria-label="Расшифровка звукового файла">
      {state.transcript.segments.map((segment, segmentIndex) => <TranscriptSegment
        key={`${segment.start}-${segment.speaker}`}
        segment={segment}
        speaker={speakerNames.get(segment.speaker) ?? segment.speaker}
        currentTime={time}
        onSeek={position => {
          if (!audio.current) return;
          audio.current.currentTime = Math.max(0, position);
          void audio.current.play();
        }}
        onWord={(token, word, anchor) => {
          if (audio.current) {
            audio.current.currentTime = Math.max(0, word.start - 0.06);
            void audio.current.play();
          }
          setSelected({ segment: segmentIndex, token, anchor });
        }}
      />)}
    </section>

    <AnimatePresence>{selected && <WordLookupCard
      key={`${selected.segment}-${selected.token.start}`}
      sentence={state.transcript.segments[selected.segment]!.text}
      token={selected.token}
      anchor={selected.anchor}
      onClose={() => setSelected(null)}
    />}</AnimatePresence>
  </main>;
}

function TranscriptSegment({
  segment,
  speaker,
  currentTime,
  onSeek,
  onWord,
}: {
  segment: AudioTranscriptSegment;
  speaker: string;
  currentTime: number;
  onSeek: (time: number) => void;
  onWord: (token: Token, word: AudioTranscriptWord, anchor: DOMRect) => void;
}) {
  const aligned = useMemo(() => {
    let wordIndex = 0;
    return tokenize(segment.text).map(token => ({
      token,
      word: token.isWord ? segment.words[wordIndex++] : undefined,
    }));
  }, [segment]);
  const active = currentTime >= segment.start && currentTime < segment.end;

  return <article className={active ? 'active' : undefined}>
    <div className="audio-speaker"><strong>{speaker}</strong><button type="button" onClick={() => onSeek(segment.start)}>{formatTime(segment.start)}</button></div>
    <p>{aligned.map(({ token, word }, index) => {
      if (!token.isWord || !word) return <span key={index}>{token.text}</span>;
      const sounding = currentTime >= word.start && currentTime < word.end;
      return <button
        type="button"
        key={index}
        className={sounding ? 'sounding' : undefined}
        onClick={event => onWord(token, word, event.currentTarget.getBoundingClientRect())}
      >{token.text}</button>;
    })}</p>
  </article>;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
