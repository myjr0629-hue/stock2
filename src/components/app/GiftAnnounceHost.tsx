'use client';

// ============================================================================
// GiftAnnounceHost — «🎁 친구에게 PRO 1개월 선물» 앱 내 1회 안내 자리 (2026-10-08) · 앱 레이아웃에 «하나만»
// ----------------------------------------------------------------------------
// 언제 띄우나(기기마다 평생 1회)·왜 푸시가 아닌가는 lib/gift/giftAnnounce.ts 머리말. 여기는 시점만 잰다.
// 시트는 띄울 때만 불러온다(레이아웃 번들은 가볍게 — CouponGuideHost 와 같은 방식). 화면을 옮기면 닫는다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useGiftConfig } from '@/lib/gift/useGift';
import { shareBeacon, shareVia } from '@/lib/share/share';
import {
  GIFT_ANNOUNCE_DELAY_MS, GIFT_ANNOUNCE_RETRY_MS, giftAnnounceBlock, localeFromPath, markGiftAnnounced, readOnboarded,
  type StoreLike,
} from '@/lib/gift/giftAnnounce';

const GiftAnnounceSheet = dynamic(() => import('./GiftAnnounceSheet').then((m) => m.GiftAnnounceSheet), { ssr: false });

function localStore(): StoreLike | null {
  try { return window.localStorage; } catch { return null; }
}

const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');

export function GiftAnnounceHost() {
  const cfg = useGiftConfig();
  const pathname = usePathname();
  const onboarded = useRef<boolean | null>(null);
  const done = useRef(false);   // 이번 실행에서 띄웠거나 포기했다
  const [locale, setLocale] = useState<string | null>(null);

  // ④ 첫 안내 완료 여부는 «실행 시작 때» 값 — 이번 실행 중에 첫 안내를 마친 새 사용자에겐 띄우지 않는다
  if (onboarded.current === null && typeof window !== 'undefined') onboarded.current = readOnboarded(localStore());

  useEffect(() => {
    if (!cfg || done.current || locale) return;
    const input = () => ({
      live: true, store: localStore(), onboardedAtMount: onboarded.current === true,
      path: window.location.pathname, dialogOpen: dialogOpen(),
    });
    // 지금 막힌 이유가 «다른 화면»·«시트»가 아니면 이번 실행은 끝(다음 실행에 다시 본다)
    const pre = giftAnnounceBlock({ ...input(), dialogOpen: false });
    if (pre === 'route') return;              // 대시보드로 오면 다시 잰다
    if (pre) { done.current = true; return; }
    let retried = false;
    let t = 0;
    const fire = () => {
      const why = giftAnnounceBlock(input());
      if (why === 'busy' && !retried) { retried = true; t = window.setTimeout(fire, GIFT_ANNOUNCE_RETRY_MS); return; }
      if (why) { if (why !== 'route') done.current = true; return; }
      done.current = true;
      if (!markGiftAnnounced(localStore())) return;
      setLocale(localeFromPath(window.location.pathname));
      shareBeacon('open', 'gift_pop', shareVia());
    };
    t = window.setTimeout(fire, GIFT_ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [cfg, pathname, locale]);

  // 화면을 옮기면(탭 이동·알림 딥링크) 떠 있던 안내는 닫는다 — 다시 띄우지 않는다(평생 1회)
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
