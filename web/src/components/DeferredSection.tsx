import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';

/** Тяжёлые инструменты ниже первого экрана не задерживают запуск навигации. */
export function DeferredSection({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '100px' });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={root}><Suspense fallback={fallback}>{visible ? children : fallback}</Suspense></div>;
}
