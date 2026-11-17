// 발표 알림(earnings_flash)의 뜨기·고정 값 → «발표 전 예상» 고정값(lib/earnings/frozenExpected). 순수 함수.
//   발표 알림 모듈과 고정값 모듈이 서로를 부르지 않게(순환 import 금지) 이 파일에 따로 둔다.
import { parseFlashEvent, snapUsable, type ExpectedSnap, type FlashEntry } from '@/lib/signals/earningsFlash';
import { baseSessionOfEvent, checkFrozen, type FrozenExpected } from './frozenExpected';

/** 뜬 값(또는 고정에 쓴 값) → 고정 기록 */
export function frozenFromFlashSnap(e: FlashEntry, snap: ExpectedSnap): FrozenExpected | null {
  return checkFrozen({
    v: 1, ticker: e.ticker.toUpperCase(), date: e.date, hour: e.hour, pct: snap.pct, expiry: snap.expiry ?? null, session: snap.session,
    basis: snap.basis ?? null, src: 'flash', capturedAt: snap.capturedAt,
  });
}

/**
 * Upstash 의 발표 알림 키(고정 이벤트 ev · 뜬 값 exp) → 고정값. 고정 이벤트가 있으면 그 숫자(사용자가 받은 알림 숫자)가 이긴다.
 *   만기·세션은 같은 숫자의 뜬 값에서, 없으면 세션 = 기준 세션 · 만기 = 모름(null).
 */
export function frozenFromFlashKeys(e: FlashEntry, evRaw: unknown, expRaw: unknown): FrozenExpected | null {
  const exp = snapUsable(e, expRaw);
  const ev = parseFlashEvent(evRaw);
  if (ev && ev.ticker === e.ticker && ev.date === e.date && ev.hour === e.hour) {
    const same = exp && exp.pct === ev.expectedPct ? exp : null;
    const base = baseSessionOfEvent(e.date, e.hour);
    if (!base) return null;
    return checkFrozen({
      v: 1, ticker: e.ticker.toUpperCase(), date: e.date, hour: e.hour, pct: ev.expectedPct, expiry: same?.expiry ?? null,
      session: same?.session ?? base, basis: same?.basis ?? null, src: 'flash', capturedAt: same?.capturedAt ?? ev.decidedAt,
    });
  }
  return exp ? frozenFromFlashSnap(e, exp) : null;
}
