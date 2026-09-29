import { useEffect, useRef, useState } from 'react';

import { Typewriter, type KeyStrike, type PrintedLine } from './Typewriter';
import { createTypewriterScene, type TypewriterScene } from './typewriterScene';

export interface TypewriterProps {
  lines: PrintedLine[];
  before: string;
  typed: string;
  after: string;
  strike: KeyStrike | null;
  returning: boolean;
  onKey: (key: string) => void;
}

/**
 * Объёмная машинка. Без WebGL (старый телефон, выключенное ускорение) —
 * прежняя плоская.
 */
export default function Typewriter3D(props: TypewriterProps) {
  const { lines, before, typed, after, strike, returning, onKey } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TypewriterScene | null>(null);
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Холст свой на каждый запуск: у освобождённого контекст WebGL потерян
    // навсегда, а React в разработке монтирует компонент дважды.
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 h-full w-full touch-manipulation [mask-image:linear-gradient(to_bottom,transparent,#000_56px)]';
    canvas.setAttribute('aria-hidden', 'true');
    wrap.prepend(canvas);
    let scene: TypewriterScene;
    try {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      scene = createTypewriterScene(canvas, { lowPower: coarse || (navigator.hardwareConcurrency ?? 8) <= 4 });
    } catch {
      canvas.remove();
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) scene.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(wrap);
    const onLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      sceneRef.current = null;
      scene.dispose();
      canvas.remove();
    };
  }, []);

  // Пока каретка возвращается, строка уже ушла на лист, а новая ещё пуста.
  useEffect(() => {
    sceneRef.current?.setPaper(
      returning
        ? { lines, before: '', typed: '', after: '' }
        : { lines, before, typed, after },
    );
  }, [lines, before, typed, after, returning]);

  useEffect(() => {
    if (strike) sceneRef.current?.strike(strike.key);
  }, [strike]);

  if (failed) return <Typewriter {...props} />;

  return (
    <div
      ref={wrapRef}
      className="relative min-h-[380px] w-full flex-1 select-none"
      onPointerDown={(event) => {
        const key = sceneRef.current?.pick(event.clientX, event.clientY, event.pointerType !== 'mouse');
        if (!key) return;
        event.preventDefault();
        onKeyRef.current(key);
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const key = sceneRef.current?.pick(event.clientX, event.clientY, false);
        event.currentTarget.style.cursor = key ? 'pointer' : '';
      }}
    >
      <p className="sr-only" aria-live="polite">
        {[before, typed].filter(Boolean).join(' ')}
      </p>
    </div>
  );
}
