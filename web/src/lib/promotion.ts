import { useEffect, useState } from 'react';

/** Один ненавязанный показ за вкладку; окна действий всегда важнее промо. */
let claimed = false;
export function usePromotionSlot(wanted: boolean): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (!wanted) { setAllowed(false); return; }
    if (claimed) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || document.querySelector('[aria-modal="true"]')) return;
      if (claimed) { window.clearInterval(timer); return; }
      claimed = true;
      setAllowed(true);
      window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [wanted]);
  return wanted && allowed;
}
