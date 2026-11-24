'use client';

// ============================================================================
// AndroidBfSheet — 안드로이드 블프 «진짜 할인» 카드 (2026-11-24 오후) · 판정·문구·오퍼 검증은 lib/app/androidBf
// ----------------------------------------------------------------------------
// 틀은 iOS 블프 1회 시트(BlackFridaySheet)·웜 카드(WarmBfSheet)와 같다 — ProPaywall 유리 카드 + BlackFridaySheet.module.css.
//   kind 'sheet': 머리 줄 · 제목 · 한 줄 설명 · 할인가 줄 · [연간 첫 1년 50%] · [월간 첫 달 50%] · 고지 · [다음에]
//   kind 'warm' : 머리 줄 · «PRO가 {날짜}에 끝나요» · 한 줄 설명 · 할인가 줄(+월 환산) · «PRO로 계속 쓰는 것» 2줄 · [주 단추] · 고지 · 다른 요금제 보기 · [다음에]
// 단추 = 앱 안 Google Play 결제(useProStatus.purchaseOffer → purchaseSubscriptionOption — 개발자 결정 오퍼). 결제 창은 Play 가 띄운다.
//   성공 = 닫기 · 취소 = 그대로(다른 단추를 고를 수 있게) · 오류 = 시트(무료)는 «지금도 무료» 재확인 뒤 정가 페이월(onFallback — 죽은 단추 없음) ·
//   웜(체험 중)은 카드에 «다시 시도» 한 줄(정가 페이월에서 지금 체험 상품을 고르면 Play 가 «이미 소유»로 거절 — 관문 11241325 ②). 웜엔 «다른 요금제 보기»도 없다.
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import p from './ProPaywall.module.css';
import s from './BlackFridaySheet.module.css';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useProStatus } from '@/hooks/useProStatus';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { BF_COPY, BF_VALID_UNTIL, bfLive, toBfLang } from '@/lib/app/blackFriday';
import { WARM_COPY, warmAnnualPerMonth } from '@/lib/app/warmBf';
import { ANDROID_BF_COPY, type AndroidBfPick } from '@/lib/app/androidBf';
import { trialEndDateText, trialSaveCopy, trialWatchlistLine } from '@/lib/app/trialSave';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

export type AndroidBfView = {
  locale: string;
  kind: 'sheet' | 'warm';
  /** 앞이 주 단추 — 비어 있으면 화면을 만들지 않는다(게이트가 거른다) */
  buttons: AndroidBfPick[];
  /** 웜일 때만 — 지금 체험이 끝나는 시각 */
  expiresAt: number | null;
  watchCount: number;
  preview: boolean;
};

export function androidBfSrc(kind: 'sheet' | 'warm', plan: 'annual' | 'monthly'): FunnelSrc {
  if (kind === 'warm') return plan === 'annual' ? 'warm_bf_and_y' : 'warm_bf_and_m';
  return plan === 'annual' ? 'bf_and_y' : 'bf_and_m';
}

export function AndroidBfSheet({ view, onClose, onFallback, confirm }: {
  view: AndroidBfView;
  onClose: () => void;
  onFallback: (() => Promise<boolean>) | null;
  /** 결제 직전 «지금도 이 단추를 살 수 있는 사람인가»(캐시 비운 새 고객 정보 — 관문 11241339 ①). 'no' = 카드를 닫는다 · 'unknown'(조회 실패) = «다시 시도» 줄 */
  confirm: (plan: 'annual' | 'monthly') => Promise<'ok' | 'no' | 'unknown'>;
}) {
  const lang = toBfLang(view.locale);
  const bf = BF_COPY[lang];
  const ac = ANDROID_BF_COPY[lang];
  const wc = WARM_COPY[lang];
  const ts = trialSaveCopy(lang);
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const { purchaseOffer } = useProStatus();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);

  // 닫힌 뒤(뒤로가기·Esc·화면 이동 포함)엔 진행 중이던 결제 확인이 끝나도 결제 창을 열지 않는다(관문 11241343)
  const closedRef = useRef(false);
  useEffect(() => { closedRef.current = false; return () => { closedRef.current = true; }; }, []);
  const close = useCallback(() => { closedRef.current = true; onClose(); }, [onClose]);
  useBackToClose(true, close);
  useBannerSuppression(true);
  const isTop = useLayer(true, close, sheetRef);

  useEffect(() => {
    const id = window.setTimeout(() => closeBtnRef.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(id);
  }, []);
  // 블프 기간이 끝나는 순간 열린 카드도 닫는다(웜 카드와 같다) — 결제 중이면 결과를 기다린다
  useEffect(() => {
    const check = () => { if (!bfLive(Date.now()) && !busyRef.current) close(); };
    check();
    const left = BF_VALID_UNTIL - Date.now();
    const t = left > 0 && left < 2 ** 31 - 1 ? window.setTimeout(check, left + 50) : 0;
    document.addEventListener('visibilitychange', check);
    return () => { if (t) window.clearTimeout(t); document.removeEventListener('visibilitychange', check); };
  }, [close]);

  const trapTab = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !isTop()) return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href]'))
      .filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [isTop]);

  const buy = async (pick: AndroidBfPick) => {
    if (busyRef.current) return;
    if (!bfLive(Date.now())) { close(); return; }
    // 프리뷰(로컬·*.vercel.app 확인 모드)는 결제·계측 없이 닫기만
    if (view.preview) { close(); return; }
    const src = androidBfSrc(view.kind, pick.plan);
    busyRef.current = true; setBusy(true); setFailed(false);
    void import('@/lib/app/funnel').then((m) => m.trackFunnel('cta', { src })).catch(() => {});
    // 카드를 연 뒤 다른 기기에서 구독했거나 체험 갱신을 다시 켰으면 사지 않고 닫는다(이중 구독·이미 소유 방지)
    let still: 'ok' | 'no' | 'unknown' = 'unknown';
    try { still = await confirm(pick.plan); } catch { still = 'unknown'; }
    if (closedRef.current) { busyRef.current = false; return; }
    if (still === 'no' || !bfLive(Date.now())) { busyRef.current = false; setBusy(false); close(); return; }
    // 조회 실패·늦음은 사지 않고 «다시 시도» 줄(말없이 닫지 않는다 — 관문 11241342)
    if (still !== 'ok') { busyRef.current = false; setBusy(false); setFailed(true); return; }
    let ok = false, cancelled = false;
    try {
      const r = await purchaseOffer(pick, src);
      ok = r.ok; cancelled = !!r.cancelled;
    } catch { /* 오류 = 정가 페이월 */ }
    if (ok) { busyRef.current = false; setBusy(false); close(); return; }
    // 결제 창이 떠 있는 사이 블프가 끝났으면(12/2 07:00 UTC) 결과와 무관하게 닫는다 — 끝난 할인 카드를 남기지 않는다(관문 11241339 ②)
    if (!bfLive(Date.now())) { busyRef.current = false; setBusy(false); close(); return; }
    if (cancelled) { busyRef.current = false; setBusy(false); return; }
    // 시트(무료)만 정가 페이월로 — 게이트가 새 고객 정보로 «지금도 무료»를 확인한 경우만 넘어간다(아니면 false → «다시 시도» 줄)
    let moved = false;
    if (onFallback && !closedRef.current) { try { moved = await onFallback(); } catch { moved = false; } }
    busyRef.current = false; setBusy(false);
    if (!moved) setFailed(true);
  };

  const [primary, secondary] = view.buttons;
  const a = view.buttons.find((b) => b.plan === 'annual') ?? null;
  const m = view.buttons.find((b) => b.plan === 'monthly') ?? null;
  const label = (b: AndroidBfPick) => (b.plan === 'annual' ? bf.annualCta(b.priceString) : ac.monthlyCta(b.priceString));
  const warm = view.kind === 'warm' && view.expiresAt != null;
  const date = warm ? trialEndDateText(view.expiresAt as number, lang).replace(/ /g, ' ') : '';
  const perMonth = warm && primary.plan === 'annual' ? warmAnnualPerMonth(primary.offerAmount, primary.currency, view.locale) : null;
  const offerLine = primary.plan === 'annual'
    ? `${bf.annualSub(primary.regularPriceString, primary.priceString)}${perMonth ? ` · ${wc.perMonth(perMonth)}` : ''}`
    : ac.monthlySub(primary.regularPriceString, primary.priceString);
  const title = warm ? wc.title(date) : (a ? bf.title : ac.titleMonthly);
  const lede = warm ? (primary.plan === 'annual' ? wc.lede('annual') : ac.monthlyLede) : bf.lede;

  return (
    <div
      className={p.overlay}
      style={{ zIndex: 10060 }}
      onClick={(e) => { if (e.target === e.currentTarget && !busyRef.current) close(); }}
      data-android-bf={view.kind}
    >
      <div ref={sheetRef} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy || undefined} onKeyDown={trapTab}>
        <button ref={closeBtnRef} type="button" className={p.close} onClick={close} aria-label={bf.close} disabled={busy}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={p.head}>
          <span className={`${p.eyebrow} ${s.eyebrow}`}>{bf.eyebrow}</span>
          <h1 className={`${p.title} ${s.title}`} id={titleId}>{title}</h1>
          <p className={`${p.lede} ${s.lede}`}>{lede}</p>
          <p className={s.offer} data-bf-offer="">{offerLine}</p>
        </div>

        {warm && (
          <>
            <p className={p.fine} style={{ textAlign: 'left', marginTop: 4 }}>{ts.keep}</p>
            <ul className={p.benefits} data-warm-keep="">
              <li className={p.benefit}>{trialWatchlistLine(view.watchCount, lang)}</li>
              <li className={p.benefit}>{ts.unlocked}</li>
            </ul>
          </>
        )}

        <button type="button" className={`${p.cta} ${s.cta}`} onClick={() => { void buy(primary); }} disabled={busy} data-bf-plan={primary.plan}>
          {label(primary)}
        </button>
        {secondary && (
          <button type="button" className={s.alt} onClick={() => { void buy(secondary); }} disabled={busy} data-bf-plan={secondary.plan}>
            {label(secondary)}
          </button>
        )}

        {failed && <p className={p.fine} role="alert" style={{ color: '#fca5a5' }} data-bf-error="">{ac.buyError}</p>}
        <p className={p.fine} data-bf-fine="">{warm ? ac.warmFine(date, primary) : ac.fine(a, m)}</p>
        <button type="button" className={s.later} onClick={close} disabled={busy}>{bf.later}</button>
      </div>
    </div>
  );
}
