'use client';

// ============================================================================
// BlackFridaySheet — «블랙프라이데이 · PRO 연간 첫 1년 50%» 안내 카드 (2026-11-22) · 판정·문구·가격은 lib/app/blackFriday
// ----------------------------------------------------------------------------
// 틀은 ProPaywall 유리 카드(선물 안내와 같은 방식). 담는 것: 머리 줄 · 제목 · 한 줄 설명 · 할인가 줄 · [연간] · [월간] · 3.1.2 고지 · [다음에]
// 단추 = 코드가 채워진 애플 적용 창(lib/app/redeem openBlackFridayRedeem) — 누르면 시트는 닫는다(돌아오면 PRO 재확인).
// 앱 동작은 선물 안내와 같은 공용 훅: 뒤로가기 = 닫기 · 네이티브 배너 내리기 · 맨 위 층만 Esc·Tab.
// ============================================================================

import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import p from './ProPaywall.module.css';
import s from './BlackFridaySheet.module.css';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { BF_COPY, toBfLang, type BfPlan, type BfPriceView } from '@/lib/app/blackFriday';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

export function BlackFridaySheet({ locale, prices, onClose }: {
  locale: string;
  prices: { annual: BfPriceView; monthly: BfPriceView };
  onClose: () => void;
}) {
  const lang = toBfLang(locale);
  const c = BF_COPY[lang];
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
    const src: FunnelSrc = plan === 'annual' ? 'bf_sy' : 'bf_sm';
    void import('@/lib/app/redeem').then((m) => m.openBlackFridayRedeem(plan, src)).catch(() => {});
    onClose();
  };

  const a = prices.annual, m = prices.monthly;
  return (
    <div
      className={p.overlay}
      style={{ zIndex: 10060 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-bf-sheet=""
    >
      <div ref={sheetRef} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
        <button ref={closeBtnRef} type="button" className={p.close} onClick={onClose} aria-label={c.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={p.head}>
          <span className={`${p.eyebrow} ${s.eyebrow}`}>{c.eyebrow}</span>
          <h1 className={`${p.title} ${s.title}`} id={titleId}>{c.title}</h1>
          <p className={`${p.lede} ${s.lede}`}>{c.lede}</p>
          <p className={s.offer} data-bf-offer="">{c.annualSub(a.regular, a.offer)}</p>
        </div>

        <button type="button" className={`${p.cta} ${s.cta}`} onClick={() => go('annual')} data-bf-plan="annual">
          {c.annualCta(a.offer)}
        </button>
        <button type="button" className={s.alt} onClick={() => go('monthly')} data-bf-plan="monthly">
          {c.monthlyCta(m.regular, m.offer)}
        </button>

        <p className={p.fine} data-bf-fine="">{c.fine(a.regular, m.regular)}</p>
        <button type="button" className={s.later} onClick={onClose}>{c.later}</button>
      </div>
    </div>
  );
}
