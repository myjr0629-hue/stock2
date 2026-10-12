// src/hooks/useLiveQuotes.ts
// ============================================================================
// 여러 종목 실시간 가격 훅(공용) — useLivePrice 의 여러 종목판. 대시보드 카드·목록처럼 «행마다 한 숫자»인 화면이 쓴다.
//   실시간  공용 가격 허브 연결(WebSocketProvider — 대시보드 «지수 LIVE»·cmd·movers·flow 와 같은 연결·같은 구독 경로)
//   예비    /api/live/quotes 여러 종목 한 번에(30개씩 — A4) · 허브가 붙어 있으면 60초(확인만) · 끊기면 30초 · 장 마감 5분
//           · 한 사람이 1분에 묻는 종목 60개 이하(liveQuotesRefreshMs) · 화면이 숨으면 멈춘다(SWR)
//   숫자    liveDisplay(calcPriceDisplay 로 세션·시간외 선택) — src/utils/liveQuote.ts
// 구독: 보이는 동안만 잡는다 — 화면을 떠나면(3초 여유 — 다음 화면이 같은 종목을 잡으면 끊지 않는다)·앱이 뒤로 가면 놓는다(release).
//   다른 화면이 잡고 있는 종목은 허브 구독이 남는다(종목마다 센다). 상한 100종목(LIVE_QUOTES_MAX).
// ============================================================================
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import {
  clockSession, fetchLiveQuotes, liveDisplay, liveQuotesRefreshMs, normLiveSession, tickMismatch, LIVE_QUOTES_MAX,
  type LiveDisplay, type LiveSession,
} from '@/utils/liveQuote';

export interface LiveQuotesResult {
  /** 종목별 한 숫자 — 아직 없는 종목은 키가 없다(뼈대로 기다린다) */
  quotes: Record<string, LiveDisplay>;
  /** 가격 허브에 붙어 있다 */
  connected: boolean;
  /** 아직 값도 없고 시세 응답도 안 온 종목이 있다(종목을 새로 담은 직후 포함 — 그 행만 뼈대) */
  pending: boolean;
  /** 이 종목을 물은 시세 응답이 왔다(값이 없으면 «—»로 정해진다) */
  settled: (t: string) => boolean;
  /** 마지막 시세 요청이 실패했다(한 묶음이라도) — 값은 남아 있을 수 있다 */
  failed: boolean;
  /** 시세가 알려 준 지금 세션 */
  session: LiveSession | null;
  refresh: () => void;
}

/** 구독을 놓기 전 여유 — 화면을 옮길 때 다음 화면이 같은 종목을 잡으면 허브에 unsubscribe → subscribe 를 오가지 않는다 */
const RELEASE_GRACE_MS = 3_000;

export function useLiveQuotes(tickers: readonly string[]): LiveQuotesResult {
  // 보이는 순서의 앞 100종목 · 요청 키는 정렬(순서만 바뀌면 다시 묻지 않는다)
  const list = useMemo(() => [...new Set(tickers.map((t) => String(t || '').toUpperCase()).filter(Boolean))].slice(0, LIVE_QUOTES_MAX), [tickers]);
  const key = useMemo(() => [...list].sort().join(','), [list]);
  // 공용 연결 — 인자 없이 불러 자동 구독(놓지 않는다)은 쓰지 않고, 아래에서 잡고 놓는다
  const { connected, prices, subscribe, release } = useRealtimeData();

  // 가격 허브 구독 — 보일 때만
  useEffect(() => {
    if (!key) return;
    const tk = key.split(',');
    let held = false;
    const hold = () => { if (!held) { subscribe(tk); held = true; } };
    const drop = () => { if (held) { release(tk); held = false; } };
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') hold();
    const onVis = () => { if (document.visibilityState === 'hidden') drop(); else hold(); };
    const onResume = () => hold();
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('app:resume', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('app:resume', onResume);
      if (held) setTimeout(() => release(tk), RELEASE_GRACE_MS);
    };
  }, [key, subscribe, release]);

  // 예비 시세 — 허브 상태·세션·종목 수로 간격을 정한다
  const { data, error, mutate } = useSWR(
    key ? ['live-quotes', key] : null,
    ([, k]: [string, string]) => fetchLiveQuotes(k.split(',')),
    {
      refreshInterval: (latest) => liveQuotesRefreshMs(list.length, connected, latest?.session ?? null),
      dedupingInterval: 5_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      errorRetryCount: 2,
    },
  );

  // 첫 시세 전 세션 추정(마운트 때 한 번) — 정규장이면 허브의 구독 즉시 값을 곧바로 쓴다. 시세가 오면 서버 세션이 이긴다
  const [guess] = useState(() => clockSession(Date.now()));
  const { quotes, mismatch } = useMemo(() => {
    const out: Record<string, LiveDisplay> = {};
    let off = 0;
    for (const t of list) {
      const p = prices.get(t);
      const tick = p ? { price: p.price, changePct: p.changePct, ts: p.ts } : undefined;
      const rest = data?.data[t];
      const d = liveDisplay(rest, tick, { wsConnected: connected, session: data?.session ?? guess, restAt: data?.at });
      if (d) out[t] = d;
      if (connected && tickMismatch(rest, tick, normLiveSession(rest?.session ?? data?.session ?? guess))) off += 1;
    }
    return { quotes: out, mismatch: off };
  }, [list, data, prices, connected, guess]);

  // 허브 틱이 시세 기준에서 2% 넘게 벗어난 종목이 있으면(급등락 — 또는 허브가 굳은 값) 시세를 앞당겨 기준을 새로 잡는다.
  //   간격 하한 = 끊김 때 예비 간격(1인 분당 60종목 이하) — 굳은 허브가 계속 어긋나도 요청이 불어나지 않는다
  const lastAnchor = useRef(0);
  const anchorGapMs = liveQuotesRefreshMs(list.length, false, data?.session ?? guess);
  useEffect(() => {
    if (!mismatch || !key) return;
    const now = Date.now();
    if (now - lastAnchor.current < anchorGapMs) return;
    lastAnchor.current = now;
    void mutate();
  }, [mismatch, key, anchorGapMs, mutate]);

  const refresh = useCallback(() => { void mutate(); }, [mutate]);
  // 응답이 물은 종목 — 목록이 바뀌면(종목 추가) 새 응답이 올 때까지 이전 응답을 들고 있으므로(keepPreviousData) 종목마다 가른다
  const asked = useMemo(() => new Set(data?.asked ?? []), [data]);
  const settled = useCallback((t: string) => asked.has(t) || (!!error && !data), [asked, error, data]);
  const pending = !!key && list.some((t) => !quotes[t] && !settled(t));
  return {
    quotes,
    connected,
    pending,
    settled,
    failed: !!error || (data?.failed ?? 0) > 0,
    session: data?.session ?? null,
    refresh,
  };
}
