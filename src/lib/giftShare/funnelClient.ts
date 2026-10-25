import { validEvent } from './funnel.cjs';
import type { ShareOutcome } from '@/lib/share/share';

/** 쿼리에는 닫힌 목록 4개만. URL·토큰·코드·ref·기기값은 보내지 않는다. */
export function giftFunnel(stage: string, surface: string, platform: string, detail = 'all'): void {
  try {
    if (!validEvent(stage, surface, platform, detail)) return;
    const q = `/api/gift/event?e=${stage}&s=${surface}&p=${platform}&d=${detail}`;
    try { if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(q)) return; } catch { /* fetch 폴백 */ }
    void fetch(q, { method: 'POST', keepalive: true }).catch(() => {});
  } catch { /* 계측 실패는 공유를 막지 않는다 */ }
}

export function giftPayloadMetric(payload: { url: string }, surface: string, via: string, gate: string): string {
  let kind = 'content';
  try {
    const q = new URL(payload.url).searchParams;
    kind = q.has('gift') ? 'attached' : q.has('code') ? 'legacy' : surface.startsWith('gift_') ? 'general' : 'content';
  } catch { /* 공유 내용은 바꾸지 않는다 */ }
  giftFunnel('payload', surface, via, kind);
  if (kind !== 'attached' && kind !== 'legacy') giftFunnel('gate', surface, via, gate);
  return kind;
}

export function giftOutcomeMetric(out: ShareOutcome, surface: string, via: string, kind: string): void {
  giftFunnel(out === 'shared' ? 'sheet' : out === 'copied' ? 'copy' : out === 'cancelled' ? 'cancel' : 'failed', surface, via, kind);
}
