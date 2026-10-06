'use client';

// ============================================================================
// «친구에게 PRO 1개월 선물» 클라이언트 — 설정(카드)·대시보드(작은 단추)가 같이 쓴다 (2026-10-06, 브랜치 feat/gift-pro)
// ----------------------------------------------------------------------------
// ① 서버가 선물 코드를 «켠 때만»(GIFT_PROMO_CODE) 입구가 그려진다 — /api/gift/config. 꺼져 있으면 null → 화면은 예전 그대로.
//    설정은 열릴 때마다 읽으니 모듈 메모리(10분)·sessionStorage(같은 앱 세션)에 둔다. 실패는 캐시하지 않는다(다음에 다시 시도).
// ② 공유는 «클릭 핸들러에서 곧바로» 부른다 — iOS 는 사용자 제스처가 살아 있을 때만 시스템 공유 시트를 연다.
//    그래서 코드·id·링크는 눌리기 «전에» 다 준비돼 있고(config 가 와야 입구가 보인다), share() 는 await 없이 shareOrCopy 로 간다.
// ③ 링크는 문구 끝에 붙은 «한 문자열»로 간다(lib/share/share.shareOrCopy — iOS «복사»가 text·url 을 따로 받으면 링크를 떨군다).
// ④ 측정: 탭·보냄은 기존 공유 퍼널 비콘(/api/share-hit, 표면 gift_set·gift_dash). 받은 쪽 클릭·쿠폰 받기는 /app 이 센다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { shareBeacon, shareOrCopy, shareVia, type ShareOutcome } from '@/lib/share/share';
import { GIFT_COPY, buildGiftUrl, getGiftRef, giftShareText, toGiftLang, type GiftSurface } from './gift';

export interface GiftConfig { code: string; android: boolean }

const CACHE_KEY = 'signumhq.gift.cfg';
const TTL_MS = 10 * 60_000;
type Cached = { at: number; cfg: GiftConfig | null };
let mem: Cached | null = null;
let inflight: Promise<GiftConfig | null> | null = null;

/** 응답 검사 — live 이고 코드가 형식에 맞을 때만 켜진다. */
export function parseGiftConfig(j: unknown): GiftConfig | null {
  const o = (j && typeof j === 'object' ? j : {}) as { live?: unknown; code?: unknown; android?: unknown };
  return o.live === true && typeof o.code === 'string' && /^[A-Z0-9]{4,24}$/.test(o.code)
    ? { code: o.code, android: o.android === true }
    : null;
}

function readSession(): Cached | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null') as { at?: number; cfg?: unknown } | null;
    if (c && typeof c.at === 'number' && Date.now() - c.at < TTL_MS) return { at: c.at, cfg: c.cfg ? parseGiftConfig(c.cfg) : null };
  } catch { /* 저장소 막힘·깨진 값 */ }
  return null;
}

/** 서버 설정 읽기(캐시 → 네트워크). 꺼짐·실패는 null. */
export function loadGiftConfig(): Promise<GiftConfig | null> {
  if (mem && Date.now() - mem.at < TTL_MS) return Promise.resolve(mem.cfg);
  const s = readSession();
  if (s) { mem = s; return Promise.resolve(s.cfg); }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/gift/config', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const body = await r.json();
      const cfg = parseGiftConfig(body);
      mem = { at: Date.now(), cfg };
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: mem.at, cfg: body && body.live === true ? body : null })); } catch { /* 저장소 막힘 */ }
      return cfg;
    } catch {
      return null;   // 네트워크 실패 — 캐시하지 않는다
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 선물 입구를 그릴지 — null 이면 그리지 않는다(서버 꺼짐·로딩·실패). */
export function useGiftConfig(): GiftConfig | null {
  const [cfg, setCfg] = useState<GiftConfig | null>(null);
  useEffect(() => {
    let dead = false;
    void loadGiftConfig().then((c) => { if (!dead) setCfg(c); });
    return () => { dead = true; };
  }, []);
  return cfg;
}

/**
 * 공유 실행 — 입구(카드·단추) 클릭 핸들러에서 `void share()` 로 «곧바로» 부른다.
 * 돌려주는 값: 'shared'(시스템 시트 완료) · 'copied'(링크 복사 — 호출자가 «복사했어요» 토스트) · 'cancelled' · 'failed' · null(입구가 꺼져 있거나 이미 실행 중).
 */
export function useGiftShare(locale: string, surface: GiftSurface) {
  const cfg = useGiftConfig();
  const busy = useRef(false);
  const share = useCallback(async (): Promise<ShareOutcome | null> => {
    if (!cfg || busy.current) return null;
    busy.current = true;
    const lang = toGiftLang(locale);
    const via = shareVia();
    shareBeacon('tap', surface, via);
    let out: ShareOutcome = 'failed';
    try {
      out = await shareOrCopy({
        title: GIFT_COPY[lang].shareTitle,
        text: giftShareText(lang, cfg.android),
        url: buildGiftUrl(cfg.code, getGiftRef(), lang),
      });
    } finally {
      busy.current = false;
    }
    if (out === 'shared' || out === 'copied') shareBeacon('sent', surface, via);
    return out;
  }, [cfg, locale, surface]);
  return { cfg, share };
}
