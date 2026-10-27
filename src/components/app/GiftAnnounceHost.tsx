'use client';

// ============================================================================
// GiftAnnounceHost — «🎁 친구에게 PRO 1개월 선물» 앱 내 안내 자리 (2026-10-08) · 앱 레이아웃에 «하나만»
// ----------------------------------------------------------------------------
// 언제 띄우나(탭·보냄 전까지 최대 3회·48시간 간격·한 실행 최대 1회)·왜 푸시가 아닌가는 lib/gift/giftAnnounce.ts 머리말. 여기는 시점만 잰다.
// 입구 둘: ① 대시보드가 뜬 뒤 3.5초 ② «좋은 순간»(실적 캘린더·장마감 리포트 탭을 읽은 뒤 — useGiftMoment 가 이벤트를 쏜다, 2026-10-27).
// 시트는 띄울 때만 불러온다(레이아웃 번들은 가볍게 — CouponGuideHost 와 같은 방식). 화면을 옮기면 닫는다.
// 막힌 이유는 실행당 사유마다 한 번 센다(share:block:<사유>:gift_pop:<플랫폼>:<ET날짜> — 식별자 없음).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useGiftConfig } from '@/lib/gift/useGift';
import { useGiftMoment } from '@/lib/gift/useGiftMoment';
import { reviewRequestedAt } from '@/hooks/useReviewPrompt';
import { shareBeacon, shareVia } from '@/lib/share/share';
import {
  GIFT_ANNOUNCE_DELAY_MS, GIFT_ANNOUNCE_RETRY_MS, GIFT_BLOCK_METRICS, GIFT_MOMENT_EVENT, giftAnnounceBlock, localeFromPath,
  isEarningsPath, markGiftAnnounced, readOnboarded, type AnnounceBlock, type GiftShowAt, type StoreLike,
} from '@/lib/gift/giftAnnounce';

const GiftAnnounceSheet = dynamic(() => import('./GiftAnnounceSheet').then((m) => m.GiftAnnounceSheet), { ssr: false });

function localStore(): StoreLike | null {
  try { return window.localStorage; } catch { return null; }
}

const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');

/** gift_pop 전용 집계(어디서 띄웠나·막힌 이유) — 같은 /api/share-hit, 서버가 닫힌 목록만 받는다. 응답을 기다리지 않는다. */
function popBeacon(e: string): void {
  try {
    const q = `/api/share-hit?e=${encodeURIComponent(e)}&s=gift_pop&v=${shareVia()}`;
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(q)) return;
    void fetch(q, { method: 'POST', keepalive: true }).catch(() => {});
  } catch { /* 집계 실패는 삼킨다 */ }
}
const COUNTED = new Set<string>(GIFT_BLOCK_METRICS);

// «이번 실행» 상태는 모듈에 둔다 — 언어 변경 등으로 레이아웃이 다시 마운트돼도 같은 웹뷰 실행에서 두 번 띄우지 않는다(관문 10270948 P3).
//   웹뷰가 새로 뜨면(앱 재실행) 모듈도 새로 읽혀 초기화된다 = «한 실행 최대 1회».
const run = { shown: false, dashDone: false, counted: new Set<string>(), onboarded: null as boolean | null };
/** ④ 첫 안내 완료 여부는 «실행 시작 때» 값 — 이번 실행 중에 첫 안내를 마친 새 사용자에겐 띄우지 않는다(재마운트돼도 처음 읽은 값) */
function onboardedAtStart(): boolean {
  if (run.onboarded === null) run.onboarded = readOnboarded(localStore());
  return run.onboarded;
}

export function GiftAnnounceHost() {
  const cfg = useGiftConfig();
  const pathname = usePathname();
  const [locale, setLocale] = useState<string | null>(null);

  // ④ 실행 시작 때 값을 마운트 직후 한 번 고정한다(첫 안내 오버레이가 «마침»을 쓰기 전에)
  useEffect(() => { onboardedAtStart(); }, []);

  const input = useCallback((moment = false) => ({
    live: true, store: localStore(), onboardedAtMount: onboardedAtStart(),
    path: window.location.pathname, dialogOpen: dialogOpen(), now: Date.now(), moment, reviewAt: reviewRequestedAt(),
  }), []);

  const countBlock = useCallback((why: AnnounceBlock) => {
    if (!COUNTED.has(why) || run.counted.has(why)) return;
    run.counted.add(why);
    popBeacon(`block:${why}`);
  }, []);

  /** 띄운다 — 표식을 못 남기면 띄우지 않는다 */
  const show = useCallback((at: GiftShowAt) => {
    if (run.shown) return;
    run.shown = true;
    run.dashDone = true;
    if (!markGiftAnnounced(localStore())) return;
    setLocale(localeFromPath(window.location.pathname));
    shareBeacon('open', 'gift_pop', shareVia());
    popBeacon(`at:${at}`);
  }, []);

  // ① 대시보드 입구
  useEffect(() => {
    if (!cfg || run.dashDone || run.shown || locale) return;
    // 지금 막힌 이유가 «다른 화면»·«시트»가 아니면 이번 실행의 대시보드 입구는 끝(다음 실행·좋은 순간에 다시 본다)
    const pre = giftAnnounceBlock({ ...input(), dialogOpen: false });
    if (pre === 'route') return;              // 대시보드로 오면 다시 잰다
    if (pre) { run.dashDone = true; countBlock(pre); return; }
    let retried = false;
    let t = 0;
    const fire = () => {
      const why = giftAnnounceBlock(input());
      if (why === 'busy' && !retried) { retried = true; t = window.setTimeout(fire, GIFT_ANNOUNCE_RETRY_MS); return; }
      if (why) { if (why !== 'route') { run.dashDone = true; countBlock(why); } return; }
      show('dash');
    };
    t = window.setTimeout(fire, GIFT_ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [cfg, pathname, locale, input, countBlock, show]);

  // ② «좋은 순간» 입구 — 그 화면에서 머문 뒤 useGiftMoment 가 쏜다
  //   실적 캘린더는 경로로 여기서 잰다(화면 파일은 바이트 고정 — tests/earningsReceiptsPage) · 장마감 리포트 탭은 인텔 화면이 잰다(탭 상태는 그 화면만 안다)
  useGiftMoment(!!cfg && isEarningsPath(pathname || ''), 'earn');
  useEffect(() => {
    if (!cfg) return;
    const onMoment = (ev: Event) => {
      if (run.shown || locale) return;
      const where = (ev as CustomEvent<{ where?: unknown }>).detail?.where;
      if (where !== 'earn' && where !== 'report') return;
      const why = giftAnnounceBlock(input(true));
      if (why) { countBlock(why); return; }
      show(where);
    };
    window.addEventListener(GIFT_MOMENT_EVENT, onMoment);
    return () => window.removeEventListener(GIFT_MOMENT_EVENT, onMoment);
  }, [cfg, locale, input, countBlock, show]);

  // 화면을 옮기면(탭 이동·알림 딥링크) 떠 있던 안내는 닫는다 — 이번 실행에선 다시 띄우지 않는다
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setLocale(null);
  }, [pathname]);

  const close = useCallback(() => setLocale(null), []);
  if (!locale) return null;
  return <GiftAnnounceSheet locale={locale} onClose={close} />;
}
