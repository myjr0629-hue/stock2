'use client';

// ============================================================================
// ProPaywall — 구독(광고제거) 결제 «전에» 보여주는 화면.
// ----------------------------------------------------------------------------
// 왜 이 화면이 따로 있나: 설정 행에서 곧장 purchase() 를 부르면 애플 3.1.2
// (「이 디자인은 혼란스럽다」)와 Play 의 구독 고지 요건에 그대로 걸린다.
// 결제 버튼을 누르기 «전에» 아래가 한 화면에 다 보여야 한다:
//   ① 상품명 ② 기간 ③ 가격 ④ 무엇이 포함되는지
//   ⑤ 자동갱신·해지 안내 ⑥ 구매 복원 ⑦ 이용약관·개인정보처리방침 링크
//   ⑧ 닫기 컨트롤 — 첫 페인트에 보이고 44×44 이상 (Play 요건)
//
// ⚠️ 가격은 «스토어가 준 현지화 문자열»만 쓴다(offers[].priceString).
//    "$9.99" 를 하드코딩하면 통화·세금이 다른 나라에서 거짓말이 되고
//    가격표시 의무 위반이다. 오퍼를 못 받으면 결제 버튼을 비활성화한다.
//
// ⚠️ 무료체험은 «의도적으로» 넣지 않는다. 애플이 2026-01 부터 트라이얼
//    페이월을 3.1.2 로 대량 반려한다(명시 CTA + 3행 타임라인 + 5일차 알림
//    실발송이 요건). 월정액만 내보내면 요건이 단순해진다.
//    근거: .agent/SUBSCRIPTION-STATUS.md
// ============================================================================

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import s from './ProPaywall.module.css';
import { useProStatus } from '@/hooks/useProStatus';
import { FREE_LIMIT, MAX_ITEMS } from '@/lib/app/watchlist';
import { WATCHLIST_CHIP_TIERING } from '@/lib/app/watchlistFlags';

type PaywallLocale = 'ko' | 'en' | 'ja';

const COPY: Record<PaywallLocale, {
  close: string;
  eyebrow: string;
  title: string;
  lede: string;
  benefits: string[];
  /** «내 종목» 혜택 한 줄(«내 종목 100개») — 무료 한도(5)를 넘기는 유일한 길이 PRO 다. PRO 도 기기 상한 MAX_ITEMS 까지다 */
  watchlist: string;
  /** 칩 차등(WATCHLIST_CHIP_TIERING)이 켜졌을 때만 쓰는 «내 종목» 혜택 줄 — «행마다 칩 2개» 포함 */
  watchlistChips: string;
  /** «내 종목»에서 열렸을 때의 광고 혜택 한 줄(시트의 «광고 없음»과 같은 말) */
  noAds: string;
  /** 알림 혜택 한 줄 — NEXT_PUBLIC_WATCHLIST_ALERTS 가 켜졌을 때만 그린다 */
  alerts: string;
  /** «내 종목»에서 열렸을 때(무료 한도·PRO 카드) — 방금 본 시트와 같은 말(제목 + 트리거 한 줄)로 이어 간다 */
  watchlistTitle: string;
  watchlistLede: string;
  /** 알림(벨)에서 열렸을 때 — 알림 플래그가 켜진 빌드에서만 */
  alertsTitle: string;
  alertsLede: string;
  /** «내 종목»·알림에서 열렸을 때의 버튼 — 시트의 «PRO 시작하기»와 같은 말 */
  ctaPro: string;
  beforeTag: string;
  afterTag: string;
  adLabel: string;
  perMonth: string;
  cta: string;
  ctaBusy: string;
  unavailable: string;
  renewNote: string;
  manageNote: string;
  restore: string;
  restoring: string;
  restored: string;
  nothingToRestore: string;
  failed: string;
  terms: string;
  privacy: string;
  and: string;
}> = {
  ko: {
    close: '닫기',
    eyebrow: 'SIGNUM PRO',
    title: '광고 없이 봅니다',
    lede: '데이터와 기능은 그대로입니다.',
    benefits: [
      '배너·전면 광고 전부 제거',
      '광고를 보고 잠금해제하던 화면이 바로 열림',
    ],
    watchlist: `내 종목 ${MAX_ITEMS}개`,
    watchlistChips: `내 종목 ${MAX_ITEMS}개 · 행마다 인사이트 칩 2개`,
    noAds: '광고 없음',
    alerts: '종목별 포지셔닝 알림',
    watchlistTitle: `PRO로 ${MAX_ITEMS}종목까지`,
    watchlistLede: `무료는 ${FREE_LIMIT}종목까지`,
    alertsTitle: '레벨을 넘으면 푸시로',
    alertsLede: '담은 종목이 콜 월·풋 플로어·감마 플립을 넘으면(5분 봉 확정) 알려 드립니다. 광고도 없습니다.',
    ctaPro: 'PRO 시작하기',
    beforeTag: '지금',
    afterTag: 'PRO',
    adLabel: '광고',
    perMonth: '월',
    cta: '광고 없이 보기',
    ctaBusy: '처리 중…',
    unavailable: '지금은 구매할 수 없습니다',
    renewNote: '매월 자동 갱신됩니다. 언제든 해지할 수 있고, 해지하면 남은 기간까지 이용됩니다.',
    manageNote: '해지는 기기의 구독 관리 화면에서 합니다.',
    restore: '구매 복원',
    restoring: '복원 중…',
    restored: '복원되었습니다',
    nothingToRestore: '복원할 구매가 없습니다',
    failed: '실패했습니다. 잠시 후 다시 시도해 주세요',
    terms: '이용약관',
    privacy: '개인정보처리방침',
    and: '·',
  },
  en: {
    close: 'Close',
    eyebrow: 'SIGNUM PRO',
    title: 'Read without ads',
    lede: 'Same data, same features.',
    benefits: [
      'Removes every banner and interstitial ad',
      'Screens that asked you to watch an ad open straight away',
    ],
    watchlist: `${MAX_ITEMS}-stock watchlist`,
    watchlistChips: `${MAX_ITEMS}-stock watchlist · 2 insight chips per row`,
    noAds: 'No ads',
    alerts: 'Positioning alerts per stock',
    watchlistTitle: `Up to ${MAX_ITEMS} stocks with PRO`,
    watchlistLede: `Free plan: up to ${FREE_LIMIT} stocks`,
    alertsTitle: 'Pushed when a level breaks',
    alertsLede: 'Get notified when your stocks break the call wall, put floor or gamma flip on a confirmed 5-min close. No ads, either.',
    ctaPro: 'Start PRO',
    beforeTag: 'Now',
    afterTag: 'PRO',
    adLabel: 'Ad',
    perMonth: 'month',
    cta: 'Go ad-free',
    ctaBusy: 'Working…',
    unavailable: 'Not available right now',
    renewNote: 'Renews automatically each month. Cancel anytime; access continues until the period ends.',
    manageNote: 'Cancel from your device’s subscription settings.',
    restore: 'Restore purchase',
    restoring: 'Restoring…',
    restored: 'Purchase restored',
    nothingToRestore: 'No previous purchase to restore',
    failed: 'Something went wrong. Please try again',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    and: '·',
  },
  ja: {
    close: '閉じる',
    eyebrow: 'SIGNUM PRO',
    title: '広告なしで読む',
    lede: 'データと機能はそのままです。',
    benefits: [
      'バナー広告と全画面広告をすべて非表示',
      '広告視聴で解除していた画面がそのまま開きます',
    ],
    watchlist: `マイ銘柄${MAX_ITEMS}銘柄`,
    watchlistChips: `マイ銘柄${MAX_ITEMS}銘柄 · 1行にインサイトチップ2つ`,
    noAds: '広告なし',
    alerts: '銘柄別ポジショニング通知',
    watchlistTitle: `PROなら${MAX_ITEMS}銘柄まで`,
    watchlistLede: `無料は${FREE_LIMIT}銘柄まで`,
    alertsTitle: 'レベルを抜けたらプッシュで',
    alertsLede: '登録銘柄がコールウォール・プットフロア・ガンマフリップを抜けたら（5分足確定）お知らせします。広告もありません。',
    ctaPro: 'PROを始める',
    beforeTag: '現在',
    afterTag: 'PRO',
    adLabel: '広告',
    perMonth: '月',
    cta: '広告なしで見る',
    ctaBusy: '処理中…',
    unavailable: '現在購入できません',
    renewNote: '毎月自動更新されます。いつでも解約でき、期間終了までご利用いただけます。',
    manageNote: '解約は端末の定期購読設定から行えます。',
    restore: '購入を復元',
    restoring: '復元中…',
    restored: '復元しました',
    nothingToRestore: '復元できる購入がありません',
    failed: '失敗しました。しばらくしてからお試しください',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    and: '・',
  },
};

/** 칩은 칩 차등(WATCHLIST_CHIP_TIERING)이 켜졌을 때만 PRO 혜택이다 — 꺼져 있으면(기본) «내 종목 100개 · 광고 없음»만 판다.
 *  모듈에서 한 번 고른다(렌더마다 새 객체를 만들지 않게). */
const SHOWN: typeof COPY = WATCHLIST_CHIP_TIERING
  ? (Object.fromEntries(Object.entries(COPY).map(([k, v]) => [k, { ...v, watchlist: v.watchlistChips }])) as typeof COPY)
  : COPY;

/** 자동 갱신·해지 안내 한 단락 — 일본어는 문장 사이에 띄어쓰기를 두지 않는다(«…いただけます。 解約は…»가 되지 않게) */
const fineLine = (loc: PaywallLocale, t: { renewNote: string; manageNote: string }) => `${t.renewNote}${loc === 'ja' ? '' : ' '}${t.manageNote}`;

/** 결제 전 화면에 반드시 같이 보여야 하는 문구(자동 갱신·해지·복원·약관) — «내 종목» 시트도 같은 문구를 쓴다 */
export function paywallLegalCopy(locale: string) {
  const loc: PaywallLocale = locale === 'ko' ? 'ko' : locale === 'ja' ? 'ja' : 'en';
  const t = COPY[loc];
  return {
    renewNote: t.renewNote, manageNote: t.manageNote, fine: fineLine(loc, t),
    restore: t.restore, restoring: t.restoring, restored: t.restored, nothingToRestore: t.nothingToRestore,
    failed: t.failed, terms: t.terms, privacy: t.privacy, and: t.and, unavailable: t.unavailable, perMonth: t.perMonth,
  };
}

/**
 * 링크 줄(구매 복원 · 이용약관 · 개인정보처리방침)이 두 줄로 접히면 줄 끝·줄 머리에 걸린 구분점을 숨긴다 — en·ja 에서 «·»가
 * 줄 끝에 매달렸다(9/29 최종 점검②). 구분점(data-sep)은 양옆 링크가 같은 줄일 때만 보인다. 링크 자체는 nowrap(CSS)이라
 * 접힘은 링크 사이에서만 난다. 폭이 바뀌면(회전·글자 확대·글꼴 도착 — 줄 높이가 바뀐다) 다시 잰다. «내 종목» 시트도 쓴다.
 */
export function useLineEdgeDots(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      kids.forEach((k, i) => {
        if (k.dataset.sep == null) return;
        const a = kids[i - 1], b = kids[i + 1];
        const sameLine = !!a && !!b && Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) < 2;
        k.style.visibility = sameLine ? '' : 'hidden';
      });
    };
    run();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}

export function ProPaywall({ locale, onClose, previewPrice, lead = 'ads', alerts = process.env.NEXT_PUBLIC_WATCHLIST_ALERTS === '1', onNavigate, returnFocus }: {
  locale: string;
  onClose: () => void;
  /** 닫힐 때 초점을 돌려줄 요소 — 주면 마운트 때의 activeElement 대신 이것을 쓴다. 동적 로드로 늦게 마운트되면 그 사이
      아래 층(시트)이 inert 가 되며 초점이 body 로 빠져, 닫은 뒤 초점이 갈 곳을 잃었다(E6 — «내 종목» 호스트가 먼저 잡아 넘긴다) */
  returnFocus?: HTMLElement | null;
  /** 약관·개인정보로 옮겨 갈 때 — 주면 이동을 여기에 맡긴다(«내 종목» 호스트: 페이월·시트를 닫고 얹은 히스토리 칸을 걷은 뒤 이동).
      없으면 예전처럼 바로 router.push */
  onNavigate?: (path: 'terms' | 'privacy') => void;
  /** 디자인 확인용에만 쓴다. 실제 화면에서는 절대 넘기지 않는다 —
      가격은 스토어가 준 값이어야 한다. */
  previewPrice?: string;
  /** 어디서 열렸나 — 첫 줄(굵게)에 올릴 혜택. 기본은 광고 제거(설정·가치 벽) */
  lead?: 'ads' | 'watchlist' | 'alerts';
  /** «내 종목» 알림 혜택 줄을 보일지(NEXT_PUBLIC_WATCHLIST_ALERTS) — 없는 기능을 팔지 않는다 */
  alerts?: boolean;
}) {
  const router = useRouter();
  const loc: PaywallLocale = locale === 'ko' ? 'ko' : locale === 'ja' ? 'ja' : 'en';
  const t = SHOWN[loc];

  const { isPro, ready, offers, purchase, restore, refreshOffers } = useProStatus();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // 스토어가 준 월간 오퍼. 없으면 «가격을 지어내지 않고» 버튼을 잠근다.
  const monthly = offers.find((o) => o.plan === 'monthly') ?? null;

  // 열었는데 가격이 없다 = 마운트 때 오퍼링을 못 받았다는 뜻. 여기서 한 번 더 받는다.
  useEffect(() => {
    if (!monthly && !previewPrice) void refreshOffers();
    // 페이월이 열릴 때 한 번만 — 가격이 들어오면 monthly 가 생겨 다시 돌지 않는다
  }, [monthly, previewPrice, refreshOffers]);
  const shownPrice = monthly?.priceString ?? previewPrice ?? null;

  // 이미 구독자면 페이월을 띄울 이유가 없다(복원 직후 포함).
  useEffect(() => { if (isPro) onClose(); }, [isPro, onClose]);

  const handleSubscribe = useCallback(async () => {
    if (busy || !monthly) return;
    setBusy(true);
    setNote(null);
    const res = await purchase('monthly');
    setBusy(false);
    if (res.ok && res.isPro) return; // 위 effect 가 닫는다
    // 사용자가 스토어 시트를 직접 닫은 경우는 «실패»가 아니다 — 조용히 둔다.
    if (!res.ok && !res.cancelled) setNote(t.failed);
  }, [busy, monthly, purchase, t]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNote(t.restoring);
    const res = await restore();
    setBusy(false);
    if (res.ok && res.isPro) setNote(t.restored);
    else if (res.ok) setNote(t.nothingToRestore);
    else setNote(t.failed);
  }, [busy, restore, t]);

  const go = useCallback((path: 'terms' | 'privacy') => {
    if (onNavigate) { onNavigate(path); return; }
    router.push(`/${loc}/app-view/${path}`);
  }, [router, loc, onNavigate]);

  const linksRef = useRef<HTMLDivElement>(null);
  useLineEdgeDots(linksRef);

  // ── 초점: 열리면 닫기 버튼(첫 페인트에 보이는 컨트롤), 닫히면 연 자리로 ──
  //   시트 위에 떠도 초점이 아래 시트에 남아 Tab·스크린리더가 가려진 시트를 돌지 않게.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = returnFocus ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : null);
    const id = window.setTimeout(() => closeBtnRef.current?.focus({ preventScroll: true }), 40);
    return () => {
      window.clearTimeout(id);
      if (back && document.contains(back)) {
        try { back.focus({ preventScroll: true }); } catch { /* noop */ }
      }
    };
  }, [returnFocus]);

  // ── Tab 을 페이월 안에서만 돈다(마지막 → 처음, 처음 → 마지막) ──
  const trapTab = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
    )).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, []);

  // 열린 자리의 말로 이어 간다 — «내 종목» 한도 시트·PRO 카드에서 «광고 없이 봅니다»로 갑자기 바뀌지 않게.
  // 설정·가치 벽(기본 'ads')은 예전 그대로(+ «내 종목 100개» 한 줄). 알림 플래그가 꺼진 빌드의 'alerts' 는 «내 종목»으로 연다.
  const alertsLead = lead === 'alerts' && alerts;
  const watchlistLead = lead === 'watchlist' || (lead === 'alerts' && !alerts);
  const head = alertsLead
    ? { title: t.alertsTitle, lede: t.alertsLede, cta: t.ctaPro }
    : watchlistLead
      ? { title: t.watchlistTitle, lede: t.watchlistLede, cta: t.ctaPro }
      : { title: t.title, lede: t.lede, cta: t.cta };

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label={head.title} onKeyDown={trapTab}>
      <div className={s.sheet}>
        {/* 닫기 — 첫 페인트에 보이고 44×44 이상 (Play 요건) */}
        <button ref={closeBtnRef} type="button" className={s.close} onClick={onClose} aria-label={t.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={s.head}>
          <span className={s.eyebrow}>{t.eyebrow}</span>
          <h1 className={s.title}>{head.title}</h1>
          <p className={s.lede}>{head.lede}</p>
        </div>

        {/* 담는 것 — 아이콘도 칩도 없이 가는 선으로만 나눈다. 덜어낸 만큼 가격이 산다. */}
        <ul className={s.benefits}>
          {(() => {
            // 열린 자리의 혜택이 첫 줄(굵게). 알림 줄은 알림이 실제로 켜진 빌드에서만 — 없는 기능을 팔지 않는다.
            //   «내 종목»에서 열렸으면 시트와 같은 한 줄씩(내 종목 100개 · 광고 없음) — 설명 문장을 늘어놓지 않는다(대표 9/29)
            const list = alertsLead ? [t.alerts, t.watchlist, t.noAds]
              : watchlistLead ? [t.watchlist, ...(alerts ? [t.alerts] : []), t.noAds]
              : [...t.benefits, t.watchlist, ...(alerts ? [t.alerts] : [])];
            return list.map((b, i) => (
              <li key={b} className={i === 0 ? `${s.benefit} ${s.benefitLead}` : s.benefit}>{b}</li>
            ));
          })()}
        </ul>

        {/* 가격 — 스토어가 준 현지화 문자열만 쓴다 */}
        <div className={s.priceCard}>
          {shownPrice ? (
            <>
              <span className={s.price}>{shownPrice}</span>
              <span className={s.period}>/ {t.perMonth}</span>
            </>
          ) : (
            <span className={s.priceMuted}>{ready ? t.unavailable : '···'}</span>
          )}
        </div>

        <button
          type="button"
          className={s.cta}
          onClick={handleSubscribe}
          disabled={busy || (!monthly && !previewPrice)}
        >
          {busy ? t.ctaBusy : head.cta}
        </button>

        {note && <p className={s.note} role="status">{note}</p>}

        <p className={s.fine}>{fineLine(loc, t)}</p>

        <div ref={linksRef} className={s.links}>
          <button type="button" className={s.link} onClick={handleRestore} disabled={busy}>
            {t.restore}
          </button>
          <span className={s.dot} data-sep="" aria-hidden="true">{t.and}</span>
          <button type="button" className={s.link} onClick={() => go('terms')}>{t.terms}</button>
          <span className={s.dot} data-sep="" aria-hidden="true">{t.and}</span>
          <button type="button" className={s.link} onClick={() => go('privacy')}>{t.privacy}</button>
        </div>
      </div>
    </div>
  );
}
