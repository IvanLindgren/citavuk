const RECOVERY_KEY = 'citavuk-chunk-recovery-v1';
const RECOVERY_WINDOW_MS = 30_000;

interface RecoveryRecord {
  path: string;
  at: number;
}

interface ChunkRecoveryOptions {
  now?: () => number;
  reload?: () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  path?: () => string;
}

/**
 * Vite emits this event when a lazy page chunk cannot be loaded. This most
 * often happens when a tab was opened before a deployment and still refers to
 * the previous build. Reload once to pick up the current index and chunk map.
 */
export function installChunkRecovery(
  options: ChunkRecoveryOptions = {},
): () => void {
  const now = options.now ?? Date.now;
  const reload = options.reload ?? (() => window.location.reload());
  const storage = options.storage ?? window.sessionStorage;
  const path = options.path ?? (() => window.location.pathname);

  const onPreloadError = (event: Event) => {
    const currentPath = path();
    const currentTime = now();
    const previous = readRecord(storage);

    if (
      previous &&
      previous.path === currentPath &&
      currentTime - previous.at < RECOVERY_WINDOW_MS
    ) {
      // The automatic reload has already been attempted. Let the rejected
      // import reach React's error boundary instead of creating a reload loop.
      return;
    }

    storage.setItem(
      RECOVERY_KEY,
      JSON.stringify({ path: currentPath, at: currentTime } satisfies RecoveryRecord),
    );
    event.preventDefault();
    reload();
  };

  window.addEventListener('vite:preloadError', onPreloadError);

  const cleanupTimer = window.setTimeout(() => {
    const previous = readRecord(storage);
    if (previous && now() - previous.at >= RECOVERY_WINDOW_MS) {
      storage.removeItem(RECOVERY_KEY);
    }
  }, RECOVERY_WINDOW_MS);

  return () => {
    window.removeEventListener('vite:preloadError', onPreloadError);
    window.clearTimeout(cleanupTimer);
  };
}

function readRecord(
  storage: Pick<Storage, 'getItem'>,
): RecoveryRecord | null {
  try {
    const parsed = JSON.parse(storage.getItem(RECOVERY_KEY) ?? '') as RecoveryRecord;
    return typeof parsed?.path === 'string' && Number.isFinite(parsed.at)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
