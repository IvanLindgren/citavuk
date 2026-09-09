import { useEffect, useId, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import source from '../../../frontend/assets/course/mascot_rig.json';

type Rect = [number, number, number, number];
type Bone = { id: string; parent: string | null; x: number; y: number; part: number | null; rect?: Rect; mirror?: boolean; scale?: number; rotation?: number };
// JSON импортируется при сборке, координаты прямоугольников заданы четвёрками.
const rig = source as unknown as { bones: Bone[]; parts: { rect: Rect; outline: [number, number][] }[]; atlasSize: number; atlas: string };
export function BoneMascot({ state, size, className = '' }: { state: string; size: number; className?: string }) {
  const prefix = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const happy = ['correct', 'lessonComplete', 'finalCelebration', 'checkpoint'].includes(state);
  const thinking = ['thinking', 'hint'].includes(state);
  const active = !reduced && state !== 'idle';
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    if (!active || document.hidden) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / 1600);
      setProgress(next);
      if (next < 1 && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const stopWhenHidden = () => {
      if (document.hidden) { cancelAnimationFrame(frame); setProgress(1); }
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', stopWhenHidden); };
  }, [active, state]);
  const sample = (values: number[]) => {
    const p = (active ? progress : 1) * (values.length - 1);
    const i = Math.min(values.length - 2, Math.floor(p));
    const t = p - i;
    const a = values[i]!;
    const b = values[i + 1]!;
    const m0 = i === 0 ? 0 : (b - values[i - 1]!) / 2;
    const m1 = i + 2 >= values.length ? 0 : (values[i + 2]! - a) / 2;
    return (2*t*t*t-3*t*t+1)*a + (t*t*t-2*t*t+t)*m0 + (-2*t*t*t+3*t*t)*b + (t*t*t-t*t)*m1;
  };
  const angles = (id: string): number[] => {
    if (!active) return [0, 0];
    if(state==='stoke')return ({body:[0,0,10,10,0],head:[0,10,18,12,0],armR:[0,-35,-95,-95,-15,0],forearmR:[0,15,30,30,0],tail:[0,-10,5,0]} as Record<string,number[]>)[id]??[0,0];
    switch (id) {
      case 'head': return happy ? [0, 7, -12, 5, -6, 0] : [0, thinking ? 14 : -12, thinking ? 14 : -6, 0];
      case 'earL': return happy ? [0, 8, 8, -22, 10, -5, 0] : [0, 18, 12, 0];
      case 'earR': return happy ? [0, -8, -8, 18, -12, 5, 0] : [0, -12, -18, 0];
      case 'armL': return happy ? [0, -12, 125, 85, 125, 25, 0] : [0, thinking ? 15 : 40, thinking ? 15 : 32, 0];
      case 'armR': return happy ? [0, 12, -70, -120, -85, -25, 0] : [0, thinking ? -145 : -25, thinking ? -138 : -35, 0];
      case 'tail': return happy ? [0, 0, 24, -18, 26, -16, 15, -8, 0] : [0, -12, 8, 0];
      case 'forearmL': return happy ? [0, -15, -48, -30, -55, -12, 0] : [0, thinking ? -10 : -45, -20, 0];
      case 'forearmR': return happy ? [0, 12, 45, 65, 35, 10, 0] : [0, thinking ? 80 : 40, thinking ? 75 : 20, 0];
      case 'legL': return happy ? [0, 8, -12, 0] : [0, 0];
      case 'legR': return happy ? [0, -8, 12, 0] : [0, 0];
      default: return [0, 0];
    }
  };
  const renderBone = (bone: Bone) => {
    const part = bone.part == null ? null : rig.parts[bone.part];
    const rect = bone.rect;
    const squash = bone.id === 'body' && happy ? sample([1,.92,1.06,1.02,.96,1]) : 1;
    return <g key={bone.id} transform={`translate(${bone.x} ${bone.y}) scale(${bone.scale ?? 1})`}>
      <g transform={`translate(0 ${bone.id === 'body' && happy ? sample([0, 12, -35, -20, 5, -8, 0]) : 0}) rotate(${(bone.rotation ?? 0) + sample(angles(bone.id))}) scale(${1/Math.sqrt(squash)} ${squash})`}>
        {part && rect && <g transform={`translate(${rect[0]} ${rect[1]})`}>
          <svg width={rect[2]} height={rect[3]} viewBox={`0 0 ${part.rect[2]} ${part.rect[3]}`} overflow="hidden">
            <g transform={bone.mirror ? `translate(${part.rect[2]} 0) scale(-1 1)` : undefined} clipPath={`url(#${prefix}-${bone.part})`}>
              <image href={`/course/animations/${rig.atlas}`} x={-part.rect[0]} y={-part.rect[1]} width={rig.atlasSize} height={rig.atlasSize} />
            </g>
          </svg>
        </g>}
        {(bone.id === 'eyeL' || bone.id === 'eyeR') && <g>
          <path d={`M -16 -34 Q 0 ${happy ? -42 : thinking ? -40 : state === 'incorrect' ? -43 : -38} 16 -34`} fill="none" stroke="#342735" strokeWidth="3.5" strokeLinecap="round" />
          <g transform={`scale(1 ${active ? Math.max(0.06, Math.min(1, sample(bone.id === 'eyeL' && happy ? [1,1,0.08,1,0.08,1,1] : [1,0.08,1,1,1,1,1]))) : 1})`}>
            <ellipse rx="18" ry="26" fill="#fff6eb" />
            <g transform={`translate(${thinking ? 5 : 0} ${thinking ? -4 : 0})`}>
              <ellipse rx="13" ry="22" fill="#251f30" />
              <ellipse cy="11" rx="10" ry="8" fill="#514052" />
              <ellipse cx="4" cy="-8" rx="6" ry="8" fill="white" />
              <circle cx="-5" cy="7" r="3" fill="white" />
            </g>
          </g>
        </g>}
        {bone.id === 'mouth' && (happy ? <g>
          <path d="M -19 -4 Q 0 4 19 -4 Q 14 26 0 27 Q -14 26 -19 -4" fill="#642e3b" stroke="#342735" strokeWidth="2.5" />
          <path d="M -14 -2 Q 0 4 14 -2 L 11 5 Q 0 9 -11 5 Z" fill="#fff6eb" />
          <ellipse cy="20" rx="9" ry="5" fill="#ed7d86" />
        </g> : thinking ? <ellipse rx="6" ry="8" fill="#642e3b" stroke="#342735" strokeWidth="2" /> : <path d={state === 'incorrect' ? 'M -17 6 Q 0 -4 17 6' : 'M -17 0 Q -8 13 0 6 Q 8 13 17 0'} fill="none" stroke="#342735" strokeWidth="3" strokeLinecap="round" />)}
        {rig.bones.filter((child) => child.parent === bone.id).map(renderBone)}
      </g>
    </g>;
  };
  return <svg className={`shrink-0 ${className}`} width={size} height={size * 1.25} viewBox="0 0 400 500" role="img" aria-label="Читавук" style={{ overflow: 'visible' }}>
    <defs>{rig.parts.map((part, i) => <clipPath id={`${prefix}-${i}`} key={i}>
      <polygon points={part.outline.map(([x, y]) => `${x * part.rect[2] / 100},${y * part.rect[3] / 100}`).join(' ')} />
    </clipPath>)}</defs>
    <ellipse cx="200" cy="443" rx="68" ry="9" fill="currentColor" opacity="0.08" />
    <g key={state}>{rig.bones.filter((bone) => bone.parent === null).map(renderBone)}</g>
  </svg>;
}
