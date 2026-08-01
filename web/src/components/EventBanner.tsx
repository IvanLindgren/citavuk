import { LuArrowRight, LuSparkles } from 'react-icons/lu';

import { odysseyAvailable } from '../events/odyssey';
import { Link, useRouter } from '../lib/router';

export function EventBanner() {
  const { path } = useRouter();
  if (!odysseyAvailable() || path.startsWith('/events')) return null;

  return (
    <Link
      to="/events"
      className="group block border-y border-[#c69a52]/60 bg-[#7f2630] text-white"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
        <LuSparkles className="size-5 shrink-0 text-[#f2ca81]" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug sm:text-base">
          Событие Одиссея уже доступно: читайте Одиссею на сербском и получите
          эксклюзивное украшение для вашей читалки
        </p>
        <LuArrowRight
          className="size-5 shrink-0 transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
