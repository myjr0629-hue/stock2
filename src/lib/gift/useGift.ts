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
import { SHARE_ORIGIN, shareBeacon, shareOrCopy, shareVia, type ShareOutcome } from '@/lib/share/share';
import { useGiftVisibility } from '@/lib/giftShare/useGiftVisibility';
import { usePreparedGift } from '@/lib/giftShare/usePreparedGift';
import { giftFunnel, giftPayloadMetric, giftOutcomeMetric } from '@/lib/giftShare/funnelClient';
import { GIFT_COPY, buildGiftUrl, giftShareText, toGiftLang, type GiftSurface } from './gift';
// ★2026-10-14 선물 링크의 초대자 id 도 공유 카드와 «같은 신원»(비공개 열쇠 → 공개 id)을 쓴다 — 친구가 설치하면 선물한 사람도 선물함에 PRO 1개월 코드를 받는다(lib/invite).
import { getInviteRef, markInviteShared } from '@/lib/invite/identity';

export interface GiftConfig { code: string; android: boolean }

/** 준비 모듈이 만든 링크에 서버 예약 토큰이 실렸나(형식만 본다 — 값은 다루지 않는다). */
function hasGiftToken(url: string): boolean {
  try { return /^[A-Za-z0-9_-]{43}$/.test(new URL(url).searchParams.get('gift') || ''); } catch { return false; }
}

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
  const visibleRef = useGiftVisibility(surface);
  const preparedGift = usePreparedGift();
  const busy = useRef(false);
  const share = useCallback(async (): Promise<ShareOutcome | null> => {
    giftFunnel('tap', surface, shareVia());
    if (!cfg || busy.current) { giftFunnel('gate', surface, shareVia(), !cfg ? 'cfg_missing' : 'busy'); return null; }
    busy.current = true;
    const lang = toGiftLang(locale);
    const via = shareVia();
    const ref = getInviteRef();
    shareBeacon('tap', surface, via);
    let out: ShareOutcome = 'failed';
    try {
      // 플래그 꺼짐 확정 = 운영 기존 선물 그대로(공개 맞춤 코드 링크·문구 바이트 동일). 켜짐·미확정은 준비 모듈의 단일 판정만.
      // ★2026-10-26 켜짐이어도 서버 예약 토큰이 «이 순간» 없으면(설정 조회 중·기기 하루 한도·재고 없음 등) 선물 메뉴가
      //   선물 없는 일반 안내를 보내지 않게, 기존 운영 선물(공개 맞춤 코드 — 이미 공개된 번호)로 되돌아간다. 새 토큰 발급과 무관.
      const legacy = {
        title: GIFT_COPY[lang].shareTitle,
        text: giftShareText(lang, cfg.android),
        url: buildGiftUrl(cfg.code, ref, lang),
      };
      const prepared = preparedGift.confirmedOff() ? null : preparedGift.payload({
        title: GIFT_COPY[lang].shareTitle,
        // 선물 URL은 준비 모듈의 단일 판정 뒤에만 만든다. 기존 설정 캐시는 발급 근거가 아니다.
        url: `${SHARE_ORIGIN}/app`,
      }, locale, via, ref, true);
      const attached = prepared !== null && hasGiftToken(prepared.url);
      const payload = attached ? prepared : legacy;
      // 대체된 경우에도 «왜 토큰이 없었나»는 그대로 센다(기존 gate 사유 목록).
      if (prepared && !attached) giftFunnel('gate', surface, via, preparedGift.gateReason());
      const payloadKind = giftPayloadMetric(payload, surface, via, preparedGift.gateReason());
      out = await shareOrCopy(payload);
      giftOutcomeMetric(out, surface, via, payloadKind);
      preparedGift.complete(out, payload, via);
    } finally {
      busy.current = false;
    }
    if (out === 'shared' || out === 'copied') { shareBeacon('sent', surface, via, ref); markInviteShared(); }
    return out;
  }, [cfg, locale, surface, preparedGift]);
  return { cfg, share, visibleRef };
}
