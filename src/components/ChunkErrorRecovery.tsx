'use client';

import { useEffect } from 'react';

// Recover from Next.js code-split ChunkLoadError instead of dying on a white
// "Application error: a client-side exception has occurred" screen.
//
// On a slow/flaky network (subway, weak signal, an App Store reviewer throttling
// the connection, a cold emulator), a lazily-imported JS chunk can time out. Next
// then throws ChunkLoadError → the React error boundary shows a dead-end white
// screen with no way back. This is a remote-webview app (SIGNUM/UC/WIM all load
// www.signumhq.com), so every user is exposed to it.
//
// Fix: when a ChunkLoadError surfaces (sync throw OR the dynamic-import promise
// rejection), reload once to re-fetch the chunk from the now-warm CDN. Guarded by
// a per-session counter so a genuinely unreachable chunk (offline) can't loop —
// after MAX reloads we stop and let the error boundary render, and any non-chunk
// error is ignored entirely (normal operation is untouched).
export function ChunkErrorRecovery() {
  useEffect(() => {
    const KEY = 'chunkReloadCount';
    const MAX = 2;

    const isChunkError = (e: unknown): boolean => {
      const any = e as any;
      const err = any?.reason ?? any?.error ?? any;
      const name = err?.name || '';
      const msg = err?.message || any?.message || '';
      return name === 'ChunkLoadError' || /Loading chunk\s+[\w-]+\s+failed|ChunkLoadError|Importing a module script failed/i.test(String(msg));
    };

    const onError = (e: Event) => {
      if (!isChunkError(e)) return;
      let count = 0;
      try { count = parseInt(sessionStorage.getItem(KEY) || '0', 10) || 0; } catch { /* storage off */ }
      if (count >= MAX) return; // give up — let the error boundary show rather than loop
      try { sessionStorage.setItem(KEY, String(count + 1)); } catch { /* noop */ }
      // Re-fetch from the same URL; the chunk usually loads on the second try.
      window.location.reload();
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    // A clean full load means chunks are resolving again — reset the counter so a
    // future flaky moment gets its own fresh retry budget.
    const reset = () => { try { sessionStorage.removeItem(KEY); } catch { /* noop */ } };
    if (document.readyState === 'complete') setTimeout(reset, 4000);
    else window.addEventListener('load', () => setTimeout(reset, 4000), { once: true });

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, []);

  return null;
}
