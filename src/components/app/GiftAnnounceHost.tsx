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
import { loadGiftConfig, useGiftConfig } from '@/lib/gift/useGift';
import { useGiftMoment } from '@/lib/gift/useGiftMoment';
import { reviewRequestedAt } from '@/hooks/useReviewPrompt';
import { shareBeacon, shareVia } from '@/lib/share/share';
import {
  GIFT_ANNOUNCE_DELAY_MS, GIFT_ANNOUNCE_RETRY_MS, GIFT_BLOCK_METRICS, GIFT_MOMENT_EVENT, giftAnnounceBlock, localeFromPath,
  isEarningsPath, markDashChecked, markGiftAnnounced, readOnboarded, resumeRecheckDue, timerWokeLate,
  type AnnounceBlock, type GiftShowAt, type StoreLike,
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
  /** 안내 시트가 열려 있나(재개 판정이 읽는다) */
  const sheetOpenRef = useRef(false);
  sheetOpenRef.current = !!locale;
  /** 걸려 있는 대시보드 타이머 취소(백그라운드 진입 때 부른다) — 아직 판정 전이었으면 true */
  const dashCancelRef = useRef<(() => boolean) | null>(null);
  /** 대시보드 판정이 백그라운드 때문에 빠졌다(타이머 취소·늦게 깨어남) — 다음 재개에 6시간 조건 없이 판정한다(관문 10271937) */
  const dashMissedRef = useRef(false);

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

  /** 띄운다 — 표식을 못 남기면 띄우지 않는다. again = 앱 재개 재판정(이번 실행에 이미 띄웠어도 — 48시간 간격·횟수는 표식이 지킨다) */
  const show = useCallback((at: GiftShowAt, again = false) => {
    if (run.shown && !again) return;
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
    if (pre) { run.dashDone = true; markDashChecked(localStore(), Date.now()); countBlock(pre); return; }
    const native = shareVia() !== 'web';
    let retried = false;
    let t = 0;
    let pending = true;
    let armedAt = Date.now();
    let delay = GIFT_ANNOUNCE_DELAY_MS;
    const fire = () => {
      pending = false;
      // 네이티브: 백그라운드에서 멈췄다 늦게 깨어난 타이머면 띄우지 않는다(재개 재판정이 맡는다 — 빠짐 표식)
      if (native && timerWokeLate(armedAt, delay, Date.now())) { dashMissedRef.current = true; return; }
      const why = giftAnnounceBlock(input());
      if (why === 'busy' && !retried) {
        retried = true; armedAt = Date.now(); delay = GIFT_ANNOUNCE_RETRY_MS; pending = true;
        t = window.setTimeout(fire, GIFT_ANNOUNCE_RETRY_MS); return;
      }
      if (why) { if (why !== 'route') { run.dashDone = true; markDashChecked(localStore(), Date.now()); countBlock(why); } return; }
      markDashChecked(localStore(), Date.now());
      show('dash');
    };
    t = window.setTimeout(fire, GIFT_ANNOUNCE_DELAY_MS);
    const cancel = () => { window.clearTimeout(t); const was = pending; pending = false; return was; };
    dashCancelRef.current = cancel;
    return () => { cancel(); if (dashCancelRef.current === cancel) dashCancelRef.current = null; };
  }, [cfg, pathname, locale, input, countBlock, show]);

  // ③ 앱 재개 재판정(네이티브만 — app:resume 은 NativeAppProvider 가 네이티브에서만 쏜다, 웹 동작 그대로)
  //   대시보드 · 시트 닫힘 · 마지막 대시보드 판정 6시간+ 일 때만 → 설정을 다시 읽고 → 3.5초 뒤 giftAnnounceBlock 1회.
  //   백그라운드 진입(appStateChange isActive=false) 때 걸린 대시보드·재개 타이머는 취소한다.
  useEffect(() => {
    let dead = false;
    let seq = 0;
    let timer = 0;
    let handle: { remove: () => Promise<void> | void } | null = null;
    const cancelAll = () => { seq++; window.clearTimeout(timer); if (dashCancelRef.current?.()) dashMissedRef.current = true; };
    const onResume = () => {
      seq++;
      window.clearTimeout(timer);
      // 백그라운드 때문에 빠진 대시보드 판정은 6시간 조건 없이(기존 동작 복원) · 아니면 마지막 판정 6시간+ 일 때만
      const missed = dashMissedRef.current;
      if (!resumeRecheckDue(localStore(), Date.now(), window.location.pathname, sheetOpenRef.current, missed)) return;
      dashMissedRef.current = false;
      const my = seq;
      void loadGiftConfig().then((c) => {                 // 설정 캐시 10분 — 6시간 뒤엔 서버에서 새로 읽는다. 꺼졌거나 못 읽으면 판정 안 함
        if (dead || my !== seq || !c) return;
        const armedAt = Date.now();
        timer = window.setTimeout(() => {
          if (dead || my !== seq || sheetOpenRef.current) return;
          if (timerWokeLate(armedAt, GIFT_ANNOUNCE_DELAY_MS, Date.now())) return;
          const why = giftAnnounceBlock(input());
          if (why === 'route') return;                    // 대시보드를 떠났다 — 다음 재개에 다시 본다
          markDashChecked(localStore(), Date.now());
          if (why) { countBlock(why); return; }
          show('dash', true);
        }, GIFT_ANNOUNCE_DELAY_MS);
      });
    };
    document.addEventListener('app:resume', onResume);
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || dead) return;
        const { App } = await import('@capacitor/app');
        const h = await App.addListener('appStateChange', ({ isActive }) => { if (!isActive) cancelAll(); });
        if (dead) { void h.remove(); return; }
        handle = h;
      } catch { /* 웹 미리보기·플러그인 없음 */ }
    })();
    return () => {
      dead = true;
      window.clearTimeout(timer);
      document.removeEventListener('app:resume', onResume);
      if (handle) void handle.remove();
    };
  }, [input, countBlock, show]);

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
