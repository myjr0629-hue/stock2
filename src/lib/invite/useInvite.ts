'use client';

// ============================================================================
// 공유 카드 클라이언트 — 공유 단추 3곳이 같이 쓴다 (2026-10-14, 브랜치 feat/viral-loop)
// ----------------------------------------------------------------------------
// ① 서버 설정(/api/invite/config)은 «끄기 스위치»일 뿐이다 — 읽는 동안·실패했을 때는 «켜짐»으로 본다(공유 링크는 코드·설정이 필요 없다:
//    카드 페이지가 서버에서 쿠폰 CTA 를 붙인다). 서버가 share:false 라고 «대답한» 때만 단추를 지운다. 세션 저장소·메모리에 10분 둔다.
// ② 공유는 «클릭 핸들러에서 곧바로» 부른다 — iOS 는 사용자 제스처가 살아 있을 때만 시스템 공유 시트를 연다. 링크에 필요한 값(기기 id·플랫폼)은 전부
//    눌리기 전에 동기로 정해진다(lib/invite/identity — 동기 SHA-256). share() 는 await 없이 shareOrCopy 로 간다.
// ③ 링크는 문구 끝에 붙은 «한 문자열»로 간다(lib/share/share.shareOrCopy — iOS «복사»가 text·url 을 따로 받으면 링크를 떨군다).
// ④ 측정: 탭·보냄은 기존 공유 퍼널 비콘(/api/share-hit, 표면 sh_pick·sh_line·sh_earn). 보냄에는 익명 초대 id 를 실어 «그날 서로 다른 초대자»를 센다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { shareBeacon, shareOrCopy, shareVia, type ShareOutcome } from '@/lib/share/share';
import { usePreparedGift } from '@/lib/giftShare/usePreparedGift';
import { INVITE_COPY } from './copy';
import { getInviteRef, markInviteShared } from './identity';
import { SHARE_SURFACE, buildShareCardUrl, toInviteLang, type ShareKind } from './kinds';

export interface InviteClientConfig { share: boolean; rewards: boolean }

const CACHE_KEY = 'signumhq.inv.cfg';
const TTL_MS = 10 * 60_000;
type Cached = { at: number; cfg: InviteClientConfig };
let mem: Cached | null = null;
let inflight: Promise<InviteClientConfig | null> | null = null;

export function parseInviteConfig(j: unknown): InviteClientConfig | null {
  const o = (j && typeof j === 'object' ? j : {}) as { share?: unknown; rewards?: unknown };
  if (typeof o.share !== 'boolean') return null;
  return { share: o.share, rewards: o.rewards === true };
}

function readSession(): Cached | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null') as { at?: number; cfg?: unknown } | null;
    const cfg = c ? parseInviteConfig(c.cfg) : null;
    if (c && typeof c.at === 'number' && cfg && Date.now() - c.at < TTL_MS) return { at: c.at, cfg };
  } catch { /* 저장소 막힘·깨진 값 */ }
  return null;
}

/** 서버 설정 읽기(캐시 → 네트워크). 실패는 null(캐시하지 않는다 — 다음에 다시). */
export function loadInviteConfig(): Promise<InviteClientConfig | null> {
  if (mem && Date.now() - mem.at < TTL_MS) return Promise.resolve(mem.cfg);
  const s = readSession();
  if (s) { mem = s; return Promise.resolve(s.cfg); }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/invite/config', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const cfg = parseInviteConfig(await r.json());
      if (!cfg) return null;
      mem = { at: Date.now(), cfg };
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: mem.at, cfg })); } catch { /* 저장소 막힘 */ }
      return cfg;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 서버 설정 — null = 아직 모름·실패(공유 단추는 «켜짐»으로 본다) */
export function useInviteConfig(): InviteClientConfig | null {
  const [cfg, setCfg] = useState<InviteClientConfig | null>(() => (mem && Date.now() - mem.at < TTL_MS ? mem.cfg : null));
  useEffect(() => {
    let dead = false;
    void loadInviteConfig().then((c) => { if (!dead && c) setCfg(c); });
    return () => { dead = true; };
  }, []);
  return cfg;
}

/** 공유 단추를 그릴지 — 서버가 «끄라»고 대답한 때만 false */
export function useInviteShareEnabled(): boolean {
  const cfg = useInviteConfig();
  return cfg ? cfg.share : true;
}

/**
 * 공유 실행 — 단추 클릭 핸들러에서 `void share(ticker, line)` 로 «곧바로» 부른다.
 * 돌려주는 값: 'shared'(시스템 시트 완료) · 'copied'(링크 복사 — 호출자가 «복사했어요» 토스트) · 'cancelled' · 'failed' · null(이미 실행 중).
 * line = 화면에 이미 그려진 줄(공유 문구에 싣는다 — 새로 지어내지 않는다).
 */
export function useInviteShare(kind: ShareKind, locale: string) {
  const gift = usePreparedGift();
  const busy = useRef(false);
  const share = useCallback(async (ticker: string, line: string | null): Promise<ShareOutcome | null> => {
    if (busy.current) return null;
    busy.current = true;
    const lang = toInviteLang(locale);
    const surface = SHARE_SURFACE[kind];
    const via = shareVia();
    const ref = getInviteRef();
    shareBeacon('tap', surface, via);
    let out: ShareOutcome = 'failed';
    try {
      const payload = gift.payload({
        title: INVITE_COPY[lang].shareTitle(ticker),
        text: INVITE_COPY[lang].shareText[kind](ticker, line),
        url: buildShareCardUrl(kind, { locale: lang, ticker, ref, via }),
      }, locale, via, ref);
      out = await shareOrCopy(payload);
      gift.complete(out, payload, via);
    } finally {
      busy.current = false;
    }
    if (out === 'shared' || out === 'copied') {
      shareBeacon('sent', surface, via, ref);
      markInviteShared();
    }
    return out;
  }, [kind, locale, gift]);
  return share;
}
