'use client';

// ============================================================================
// WarmBfSheet — «PRO가 {날짜}에 끝나요 · 블프 50%» 웜 카드 (2026-11-24) · 판정·문구·단추 배치는 lib/app/warmBf
// ----------------------------------------------------------------------------
// 틀은 블프 1회 시트와 같다(ProPaywall 유리 카드 + BlackFridaySheet.module.css). 담는 것:
//   머리 줄(블프·12/2까지) · 제목(끝나는 날) · 한 줄 설명 · 할인가 줄(+월 환산) · «PRO로 계속 쓰는 것»(체험 종료 안내와 같은 검증 문구 2줄)
//   · [주 단추] · [둘째 단추(있을 때만)] · 3.1.2 고지(지금 PRO 유지·애플 창에서 확인 후 결제·할인 범위·정가 자동 갱신·해지) · 다른 요금제 보기 · 다음에
// 단추 = 블프 코드가 채워진 애플 적용 창(lib/app/redeem openWarmBfRedeem) — 누르면 카드는 닫는다. 결제는 애플 창에서만.
// ============================================================================

import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import p from './ProPaywall.module.css';
import s from './BlackFridaySheet.module.css';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { BF_COPY, type BfPlan, type BfPriceView } from '@/lib/app/blackFriday';
import { WARM_COPY, toWarmLang } from '@/lib/app/warmBf';
import { trialEndDateText, trialSaveCopy, trialWatchlistLine } from '@/lib/app/trialSave';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

export type WarmSrcs = { annual: FunnelSrc; monthly: FunnelSrc };

export function WarmBfSheet({ locale, expiresAt, plans, prices, perMonth, watchCount, srcs, preview, onClose, onOther }: {
  locale: string;
  expiresAt: number;
  plans: { primary: BfPlan; secondary: BfPlan | null };
  prices: { annual: BfPriceView; monthly: BfPriceView };
  perMonth: string | null;
  watchCount: number;
  srcs: WarmSrcs;
  preview: boolean;
  onClose: () => void;
  onOther: () => void;
}) {
  const lang = toWarmLang(locale);
  const c = WARM_COPY[lang];
  const bf = BF_COPY[lang];
  const ts = trialSaveCopy(lang);
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useBackToClose(true, onClose);
  useBannerSuppression(true);
  const isTop = useLayer(true, onClose, sheetRef);

  useEffect(() => {
    const id = window.setTimeout(() => closeBtnRef.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(id);
  }, []);

  const trapTab = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !isTop()) return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href]'))
      .filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [isTop]);

  const go = (plan: BfPlan) => {
    const src = plan === 'annual' ? srcs.annual : srcs.monthly;
    // 미리보기(프리뷰 호스트)는 openWarmBfRedeem 이 새 탭으로 주소만 연다 — 결제·계측 없음(프리뷰 퍼널은 fxp)
    if (!preview) void import('@/lib/app/redeem').then((m) => m.openWarmBfRedeem(plan, src)).catch(() => {});
    onClose();
  };

  const a = prices.annual, m = prices.monthly;
  const date = trialEndDateText(expiresAt, lang).replace(/ /g, ' ');
  const offerLine = plans.primary === 'annual'
    ? `${bf.annualSub(a.regular, a.offer)}${perMonth ? ` · ${c.perMonth(perMonth)}` : ''}`
    : c.monthlySub(m.regular, m.offer);
  const label = (plan: BfPlan) => (plan === 'annual' ? bf.annualCta(a.offer) : bf.monthlyCta(m.regular, m.offer));
  return (
    <div
      className={p.overlay}
      style={{ zIndex: 10060 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-warm-bf=""
    >
      <div ref={sheetRef} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
        <button ref={closeBtnRef} type="button" className={p.close} onClick={onClose} aria-label={bf.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={p.head}>
          <span className={`${p.eyebrow} ${s.eyebrow}`}>{bf.eyebrow}</span>
          <h1 className={`${p.title} ${s.title}`} id={titleId}>{c.title(date)}</h1>
          <p className={`${p.lede} ${s.lede}`}>{c.lede(plans.primary)}</p>
          <p className={s.offer} data-warm-offer={plans.primary}>{offerLine}</p>
        </div>

        <p className={p.fine} style={{ textAlign: 'left', marginTop: 4 }}>{ts.keep}</p>
        <ul className={p.benefits} data-warm-keep="">
          <li className={p.benefit}>{trialWatchlistLine(watchCount, lang)}</li>
          <li className={p.benefit}>{ts.unlocked}</li>
        </ul>

        <button type="button" className={`${p.cta} ${s.cta}`} onClick={() => go(plans.primary)} data-warm-plan={plans.primary}>
          {label(plans.primary)}
        </button>
        {plans.secondary && (
          <button type="button" className={s.alt} onClick={() => go(plans.secondary as BfPlan)} data-warm-plan={plans.secondary}>
            {label(plans.secondary)}
          </button>
        )}

        <p className={p.fine} data-warm-fine="">{c.fine(date, a.regular, m.regular)}</p>
        <button type="button" className={p.link} style={{ display: 'block', margin: '4px auto 0' }} onClick={onOther} data-warm-other="">{c.other}</button>
        <button type="button" className={s.later} onClick={onClose}>{bf.later}</button>
      </div>
    </div>
  );
}
