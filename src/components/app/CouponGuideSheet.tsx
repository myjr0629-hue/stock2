'use client';

// ============================================================================
// CouponGuideSheet — 안드로이드 «🎟 쿠폰 코드 입력»을 누르면 뜨는 짧은 안내 + [계속] (2026-10-06)
// ----------------------------------------------------------------------------
// 순서·근거·문구는 lib/app/couponGuide.ts 머리말. 요점: 쿠폰 = 구독 첫 30일 무료 → 코드를 넣은 «뒤» «구독»까지 해야 PRO.
// [계속] = 기존 구매 경로 그대로(useProStatus().purchase('monthly', src) → services/revenueCat.purchasePro → RevenueCat 월간 패키지).
//   취소는 조용히(페이월과 같다) · 실패는 «실패했습니다» · 결제는 됐는데 권한이 아직이면 3초·8초 다시 읽고 그래도면 안내 한 줄.
//   구매가 끝나 PRO 면 공용 상태(proEntitlement)에 바로 알리고 닫는다 — useProStatus 화면들은 SDK 리스너로 같이 바뀐다.
// 틀은 ProPaywall 과 같은 유리 카드(ProPaywall.module.css) — 결제 «전» 화면이 한 모양이게.
// 앱 동작(«내 종목» 시트와 같은 공용 훅): 안드로이드 뒤로가기 = 닫기(useBackToClose) · 네이티브 배너 내리기(useBannerSuppression)
//   · 맨 위 층만 Esc·Tab(useLayer — 아래 «내 종목» 시트는 inert) · 열리면 닫기 단추에 초점, 닫히면 누른 자리로.
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import p from './ProPaywall.module.css';
import s from './CouponGuideSheet.module.css';
import { useProStatus } from '@/hooks/useProStatus';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { couponGuideCopy, runCouponPurchase, type CouponGuideRequest } from '@/lib/app/couponGuide';
import { refreshProAfterRedeem } from '@/lib/app/redeem';
import { isPreviewHost, notifyProPurchased } from '@/lib/app/proEntitlement';

// 퍼널 측정 — 동적 import(실패해도 구매 흐름과 무관). 안드로이드 앱은 funnel.ts 가 아직 보내지 않는다(FUNNEL_SEND_ANDROID).
const funnel = () => import('@/lib/app/funnel');

export function CouponGuideSheet({ req, onClose }: { req: CouponGuideRequest; onClose: () => void }) {
  const t = couponGuideCopy(req.locale);
  const titleId = useId();
  const { isPro, ready, offers, purchase, iapAvailable, refreshOffers } = useProStatus();
  // 브라우저(프리뷰 ?sgandroid=1)에선 결제 플러그인이 없다 — 가격 자리만 표시하고 [계속]은 «실패» 안내로 끝난다
  const preview = !iapAvailable && isPreviewHost();
  const monthly = offers.find((o) => o.plan === 'monthly') ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busyRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useBackToClose(true, onClose);
  // 네이티브 배너 내리기 — 단, 설정 화면에서는 걸지 않는다: 설정은 화면 전체를 setBannerSuppressed(true) 로 이미 내려 두었고
  //   (훅의 개수 세기 밖), 이 시트가 닫힐 때 훅이 «억제 해제»를 보내면 설정 위로 배너가 다시 뜬다(ValueWall GatePaywall 주석과 같은 이유).
  const [onSettings] = useState(() => typeof window !== 'undefined' && /\/app-view\/settings(\/|$)/.test(window.location.pathname));
  useBannerSuppression(!onSettings);
  const isTop = useLayer(true, onClose, sheetRef);

  // 가격(스토어 현지 문자열) — 비어 있으면 한 번 더 받는다(콜드스타트에 오퍼링을 놓친 사용자)
  useEffect(() => {
    if (!monthly && !preview) void refreshOffers();
  }, [monthly, preview, refreshOffers]);

  // 다른 길(SDK 리스너·복귀 동기화)로 PRO 가 되면 할 일이 없다 — 구매 흐름 중이면 흐름이 직접 닫는다
  useEffect(() => {
    if (isPro && !busyRef.current) onClose();
  }, [isPro, onClose]);

  // 초점: 열리면 닫기(첫 페인트에 보이는 컨트롤), 닫히면 누른 자리로
  useEffect(() => {
    const back = req.trigger;
    const id = window.setTimeout(() => closeBtnRef.current?.focus({ preventScroll: true }), 40);
    return () => {
      window.clearTimeout(id);
      if (back && document.contains(back)) {
        try { back.focus({ preventScroll: true }); } catch { /* noop */ }
      }
    };
  }, [req.trigger]);

  // Tab 은 이 시트 안에서만(맨 위 층일 때)
  const trapTab = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !isTop()) return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
    )).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [isTop]);

  const onContinue = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    const r = await runCouponPurchase({
      purchase: () => purchase('monthly', req.src),
      recheck: () => refreshProAfterRedeem('sheet'),
      notifyPro: () => notifyProPurchased(true),
      track: (stage) => { void funnel().then((m) => m.trackFunnel(stage, { src: req.src })).catch(() => {}); },
    });
    busyRef.current = false;
    setBusy(false);
    if (r === 'pro') { onClose(); return; }
    if (r === 'pending') setNote(t.pending);
    else if (r === 'error') setNote(t.failed);
    // 'cancelled' — 사용자가 구글 결제 창을 직접 닫았다. 실패가 아니다(페이월과 같이 조용히 둔다)
  }, [purchase, req.src, onClose, t.pending, t.failed]);

  const after = monthly
    ? t.after(monthly.priceString)
    : preview ? t.after(t.pricePlaceholder) : ready ? t.unavailable : '···';
  const canBuy = !!monthly || preview;

  return (
    <div
      className={p.overlay}
      style={{ zIndex: 10060 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-coupon-guide=""
    >
      <div ref={sheetRef} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
        {/* 닫기 — 첫 페인트에 보이고 44×44 이상 */}
        <button ref={closeBtnRef} type="button" className={p.close} onClick={onClose} aria-label={t.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={p.head}>
          <span className={p.eyebrow}>{t.eyebrow}</span>
          <h1 className={p.title} id={titleId}>{t.title}</h1>
          <p className={p.lede}>{t.lede}</p>
        </div>

        <ol className={s.steps}>
          {t.steps.map((line, i) => (
            <li key={i} className={i === t.steps.length - 1 ? `${s.step} ${s.stepKey}` : s.step}>
              <span className={s.num} aria-hidden="true">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <p className={s.saved}>{t.saved}</p>

        <div className={s.free}>
          <span className={s.freeHead}>{t.freeHead}</span>
          <span className={s.after}>{after}</span>
        </div>

        <button type="button" className={`${p.cta} ${s.ctaTall}`} onClick={onContinue} disabled={busy || !canBuy}>
          {busy ? t.busy : t.cta}
        </button>

        {note && <p className={p.note} role="status">{note}</p>}

        <p className={p.fine}>{t.fine}</p>
      </div>
    </div>
  );
}
