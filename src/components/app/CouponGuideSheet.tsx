'use client';

// ============================================================================
// CouponGuideSheet — 안드로이드 «🎟 쿠폰 코드 입력»을 누르면 뜨는 짧은 안내 + [① Play 스토어에서 적용] (2026-10-06 · 10-23 결제 분리)
// ----------------------------------------------------------------------------
// 순서·근거·문구는 lib/app/couponGuide.ts 머리말.
// ★2026-10-23 결제 안전(10/19 뽐뿌 «쿠폰 쓰려다 결제됐다»): 이 시트에는 구매 단추가 없다 — useProStatus().purchase 를 쓰지 않는다.
//   단추 하나 = Play 코드 등록 화면 열기(couponRedeemFlow). 앱으로 돌아오면 RevenueCat 고객 정보를 새로 읽어
//   PRO 활성이면 «적용됨»(공용 상태 proEntitlement 에 알리고 잠시 뒤 닫음), 아니면 «아직 적용되지 않았습니다 — 등록 화면에서 코드를 입력해 주세요».
//   구독 구매는 일반 페이월(ProPaywall)만 한다.
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
import { couponGuideCopy, couponRedeemFlow, type CouponGuideRequest, type CouponRedeemFlow, type CouponRedeemPhase } from '@/lib/app/couponGuide';
import { PLAY_REDEEM_URL, refreshProAfterRedeem } from '@/lib/app/redeem';
import { openExternalUrl } from '@/lib/native/capacitorBridge';
import { isPreviewHost, notifyProPurchased } from '@/lib/app/proEntitlement';

// 퍼널 측정 — 동적 import(실패해도 쿠폰 흐름과 무관). 안드로이드 앱은 funnel.ts 가 아직 보내지 않는다(FUNNEL_SEND_ANDROID).
const funnel = () => import('@/lib/app/funnel');

/** «적용됨»을 보여 준 뒤 닫기까지 */
export const COUPON_APPLIED_CLOSE_MS = 1500;

export function CouponGuideSheet({ req, onClose }: { req: CouponGuideRequest; onClose: () => void }) {
  const t = couponGuideCopy(req.locale);
  const titleId = useId();
  // 구매 함수(purchase)는 받지 않는다 — 이 시트에서 결제로 가는 길 0
  const { isPro, ready, offers, iapAvailable, refreshOffers } = useProStatus();
  // 브라우저(프리뷰 ?sgandroid=1)에선 결제 플러그인이 없다 — 가격 자리만 표시
  const preview = !iapAvailable && isPreviewHost();
  const monthly = offers.find((o) => o.plan === 'monthly') ?? null;
  const [phase, setPhase] = useState<CouponRedeemPhase>('idle');
  const flowRef = useRef<CouponRedeemFlow | null>(null);
  if (!flowRef.current) {
    flowRef.current = couponRedeemFlow({
      open: () => openExternalUrl(PLAY_REDEEM_URL),
      // 앱 밖(Play 스토어)에서 생긴 변화 — 캐시 무효화 → syncPurchases → getCustomerInfo, 3초·8초 다시(redeem.ts 'url' 순서)
      checkPro: () => refreshProAfterRedeem('url'),
      notifyPro: () => notifyProPurchased(true),
      onPhase: setPhase,
      track: (stage) => { void funnel().then((m) => m.trackFunnel(stage, { src: req.src })).catch(() => {}); },
    });
  }
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

  // 등록 화면에서 돌아옴 → PRO 다시 읽기. 가려짐(비활성·hidden) 뒤의 활성·visible 만 복귀로 본다.
  //   browserFinished 는 쓰지 않는다 — 안드로이드 맞춤 탭이 Play 스토어 앱으로 넘기며 곧바로 닫혀 «등록 전» 확인이 될 수 있다.
  useEffect(() => {
    const flow = flowRef.current!;
    let disposed = false;
    const offs: Array<() => void> = [];
    const keep = (remove: () => Promise<unknown>) => {
      const off = () => { void remove().catch(() => {}); };
      if (disposed) off(); else offs.push(off);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flow.away(); else void flow.back();
    };
    document.addEventListener('visibilitychange', visibility);
    void import('@capacitor/app')
      .then(({ App }) => App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
        if (isActive) void flow.back(); else flow.away();
      }))
      .then((l) => keep(() => l.remove()))
      .catch(() => { /* 웹·플러그인 없음 — visibilitychange 만 */ });
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      offs.forEach((off) => off());
    };
  }, []);

  // 이미 PRO(다른 길 — SDK 리스너·복귀 동기화)면 할 일이 없다: 등록을 시작하기 전이면 바로 닫고,
  //   등록 뒤에 PRO 가 되면 «적용됨»을 잠깐 보여 주고 닫는다.
  const showApplied = phase === 'applied' || (isPro && phase !== 'idle');
  useEffect(() => {
    if (isPro && phase === 'idle') { onClose(); return; }
    if (!showApplied) return;
    const id = window.setTimeout(onClose, COUPON_APPLIED_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [isPro, phase, showApplied, onClose]);

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
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [isTop]);

  const onRedeem = useCallback(() => { void flowRef.current!.start(); }, []);

  const after = monthly
    ? t.after(monthly.priceString)
    : preview ? t.after(t.pricePlaceholder) : ready ? t.unavailable : '···';
  const working = phase === 'opening' || phase === 'checking';
  const note = showApplied ? t.applied
    : phase === 'not_applied' ? t.notApplied
      : phase === 'open_failed' ? t.redeemUnavailable
        : null;

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

        <p className={p.note} id={`${titleId}-warning`}>{t.warning}</p>

        {/* 이 시트의 유일한 단추 — 등록 화면 열기(구매 아님) */}
        <button type="button" className={`${p.cta} ${s.ctaTall}`} onClick={onRedeem} disabled={working || showApplied}
          aria-describedby={`${titleId}-warning`} data-coupon-redeem="">
          {working ? t.busy : t.redeemCta}
        </button>

        {note && <p className={p.note} role="status">{note}</p>}

        <p className={p.fine}>{t.fine}</p>
      </div>
    </div>
  );
}
