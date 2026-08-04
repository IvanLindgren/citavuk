import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';

/**
 * Холст для письма от руки.
 *
 * Пишут мышью, пальцем или пером — поэтому события указателя, а не мыши и не
 * касаний по отдельности: один набор обработчиков вместо трёх, и перо
 * графического планшета работает само собой.
 *
 * Штрихи хранятся списком точек, а не только рисуются. Это нужно двум вещам
 * сразу: отмене последнего штриха (перерисовать всё, кроме него) и
 * перерисовке при изменении размера окна — растянутый битмап превратился бы в
 * мыло, а на повороте телефона просто исчез бы.
 */

interface Point {
  x: number;
  y: number;
}

export interface HandwritingPadHandle {
  clear: () => void;
  undo: () => void;
  /** Пусто ли поле — по нему видно, есть ли что проверять. */
  isEmpty: () => boolean;
}

export function HandwritingPad({
  ref,
  height = 180,
  disabled = false,
  onChange,
  ariaLabel = 'Поле для письма от руки',
}: {
  ref?: Ref<HandwritingPadHandle>;
  height?: number;
  disabled?: boolean;
  /** Зовётся после каждого изменения: по нему включается кнопка ответа. */
  onChange?: (empty: boolean) => void;
  ariaLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);

  /** Перерисовывает всё с нуля: линовку и поверх неё штрихи. */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const { width, height: canvasHeight } = canvas.getBoundingClientRect();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    // Всё рисование идёт в единицах CSS, а не в пикселях устройства: иначе
    // толщина пера и координаты указателя жили бы в разных системах.
    const ratio = window.devicePixelRatio || 1;
    context.scale(ratio, ratio);

    // Линовка — как в тетради: без опоры буквы уплывают, и написанное
    // выглядит хуже, чем человек умеет на самом деле.
    const baseline = canvasHeight * 0.72;
    context.strokeStyle = 'rgba(128,128,128,0.35)';
    context.lineWidth = 1;
    context.setLineDash([6, 6]);
    for (const y of [canvasHeight * 0.28, baseline]) {
      context.beginPath();
      context.moveTo(12, y);
      context.lineTo(width - 12, y);
      context.stroke();
    }
    context.setLineDash([]);

    // Чернила берут цвет текста темы: на тёмном фоне чёрное перо невидимо.
    context.strokeStyle = getComputedStyle(canvas).color;
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        // Одна точка — это точка над «i», а не отрезок нулевой длины: линия
        // из точки в неё же не рисуется вовсе.
        const [dot] = stroke;
        if (!dot) continue;
        context.beginPath();
        context.arc(dot.x, dot.y, 1.6, 0, Math.PI * 2);
        context.fillStyle = context.strokeStyle;
        context.fill();
        continue;
      }

      context.beginPath();
      context.moveTo(stroke[0]!.x, stroke[0]!.y);
      // Кривая через середины отрезков: ломаная из сырых точек указателя
      // выглядит дёргано даже при аккуратном письме.
      for (let i = 1; i < stroke.length - 1; i++) {
        const current = stroke[i]!;
        const next = stroke[i + 1]!;
        context.quadraticCurveTo(
          current.x,
          current.y,
          (current.x + next.x) / 2,
          (current.y + next.y) / 2,
        );
      }
      const last = stroke[stroke.length - 1]!;
      context.lineTo(last.x, last.y);
      context.stroke();
    }
  }, []);

  /** Подгоняет разрешение холста под размер на экране. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === pixelHeight) return;
    canvas.width = width;
    canvas.height = pixelHeight;
    repaint();
  }, [repaint]);

  useEffect(() => {
    resize();
    const observer = new ResizeObserver(resize);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [resize]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        strokes.current = [];
        repaint();
        onChange?.(true);
      },
      undo: () => {
        strokes.current.pop();
        repaint();
        onChange?.(strokes.current.length === 0);
      },
      isEmpty: () => strokes.current.length === 0,
    }),
    [repaint, onChange],
  );

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      style={{ height, touchAction: 'none' }}
      className={[
        'w-full cursor-crosshair rounded-2xl border-2 border-dashed border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text)]',
        disabled ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
      onPointerDown={(event) => {
        if (disabled) return;
        // Захват указателя обязателен: без него штрих обрывается, стоит увести
        // палец за край холста, а край у него совсем близко.
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        strokes.current.push([pointAt(event)]);
        repaint();
        onChange?.(false);
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        strokes.current[strokes.current.length - 1]?.push(pointAt(event));
        repaint();
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerCancel={() => {
        drawing.current = false;
      }}
    />
  );
}
