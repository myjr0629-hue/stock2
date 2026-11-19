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
//    ★11/16 대표 «매출» 지시로 스토어 소개 오퍼(7일 무료 체험)를 켠다 — 3.1.2 요건대로
//    «체험 자격이 확인된 플랜 카드»에서만(토글 아님) 명시 CTA(«7일 무료로 시작») + 버튼 바로 위
//    «오늘 무료 → 날짜·가격·주기 자동 결제 · 언제든 해지» 한 줄 + 고지문(24시간 전 해지)을 그린다.
//    알림(5일차)은 약속하지 않는다(보내지 않는 것을 말하지 않는다). 자격 없음·모름 = 예전 화면 그대로.
// ============================================================================

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import s from './ProPaywall.module.css';
import { useProStatus } from '@/hooks/useProStatus';
import type { FunnelSrc } from '@/lib/app/funnelSchema';
import type { PlanId } from '@/config/iap';
import { annualSavePct, paywallSelection, planFineLine, type PaywallPlan } from '@/lib/app/proPlans';
import { expiredOfferCopy, type ExpiredOfferView } from '@/lib/app/expiredOffer';
import type { ExpiredOffer, PlanOffer } from '@/services/revenueCat';

export type { PaywallPlan };

// 퍼널 측정 — 첫 화면 번들에 싣지 않는다(동적 import). 실패해도 페이월 동작과 무관.
const funnel = () => import('@/lib/app/funnel');
import { FREE_LIMIT, MAX_ITEMS } from '@/lib/app/watchlist';
import { WATCHLIST_CHIP_TIERING } from '@/lib/app/watchlistFlags';
import { RedeemCodeLink } from './RedeemCodeLink';
import { markSessionError } from '@/lib/app/ratingMoments';
import { goToWatchlistAfterTrial, purchaseWithTrialStart } from '@/lib/app/trialStartWatchlist';
import { wlUI } from '@/lib/app/watchlistUI';
import { afterSheetHistory } from '@/components/app/watchlist/BottomSheet';
import { notePaywallOpened } from '@/lib/app/trialAnnounce';

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
  /** ★11/9 연간·평생 카드(스토어가 그 패키지를 내려줄 때만 보인다) */
  plansLabel: string;
  planMonthly: string;
  planAnnual: string;
  planLifetime: string;
  perYear: string;
  /** 연간 할인율 배지 — 월간·연간 «스토어 숫자 가격»으로 계산(같은 통화일 때만) */
  save: (pct: number) => string;
  /** 연간 «월 환산» — 스토어가 준 현지 문자열(pricePerMonthString)을 끼워 넣는다 */
  monthlyEq: (price: string) => string;
  lifetimeSub: string;
  renewAnnual: string;
  lifetimeNote: string;
  lifetimeManage: string;
  /** ★11/11 체험 종료 안내(TrialRenewalOffNotice)에서 열렸을 때 — 이미 PRO(체험 중)인 사람에게 «계속 쓰기» */
  trialTitle: string;
  trialLede: string;
  ctaKeep: string;
  /** ★11/16 무료 체험(스토어 소개 오퍼 — 자격 확인된 플랜만) */
  ctaTrial: (days: number) => string;
  trialBadge: (days: number) => string;
  /** 버튼 바로 위 한 줄 — 체험 기간·첫 결제 날짜·가격·주기·해지 */
  trialTerms: (days: number, price: string, plan: PlanId) => string;
  /** 고지문(자동 갱신·24시간 전 해지) — 체험이 적용되는 플랜일 때 planFineLine 자리 */
  trialFine: (days: number, price: string, plan: PlanId) => string;
  /** 첫 실행 페이월 머리(trialHead) */
  trialHeadTitle: (days: number) => string;
  trialHeadLede: string;
  /** ★11/16 밤 기존 무료 사용자 1회 안내(trial_announce) — 머리 위 한 줄(눈썹 자리). 체험이 적용될 때만 */
  trialAnnounceEyebrow: string;
  /** ★11/19 체험 머리 화면(trialHead · 체험 적용 시)의 가치 2줄 — 미국 주식 앱 핵심(옵션 앞세우지 않음). 셋째 줄은 watchlist */
  trialVals: [string, string];
  /** ★11/19 체험 일정 3단(오늘 · 종료 24시간 전까지 해지 · N일 뒤 결제) — 버튼 바로 위. place = 해지하는 곳(스토어별) */
  trialSteps: (days: number, price: string, plan: PlanId, place: string) => [string, string][];
  /** 해지하는 곳 — iOS·안드·모름(웹 미리보기) */
  cancelPlace: { ios: string; android: string; other: string };
}> = {
  ko: {
    close: '닫기',
    eyebrow: 'SIGNUM PRO',
    title: '잠긴 분석이 바로 열립니다',
    lede: '광고를 보지 않아도 되고, 광고도 없습니다.',
    benefits: [
      'AI 종목 분석·퀀트 시그널·기관 보유가 바로 열림',
      '대가 렌즈 순위 10위까지(무료는 3위)',
      '배너·전면 광고 전부 제거',
    ],
    watchlist: `내 종목 ${MAX_ITEMS}개`,
    watchlistChips: `내 종목 ${MAX_ITEMS}개 · 행마다 인사이트 칩 2개`,
    noAds: '광고 없음',
    alerts: '내가 정한 가격 레벨 알림 · 종목당 5개',
    watchlistTitle: `PRO로 ${MAX_ITEMS}종목까지`,
    watchlistLede: `무료는 ${FREE_LIMIT}종목까지`,
    alertsTitle: '정한 가격에 닿으면 푸시로',
    alertsLede: '담은 종목이 내가 정한 가격(종목당 5개)을 넘거나 내려가면 알려 드립니다. 최대 100종목 · 광고도 없습니다.',
    ctaPro: 'PRO 시작하기',
    beforeTag: '지금',
    afterTag: 'PRO',
    adLabel: '광고',
    perMonth: '월',
    cta: 'PRO로 바로 열기',
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
    plansLabel: '요금제 선택',
    planMonthly: '월간',
    planAnnual: '연간',
    planLifetime: '평생',
    perYear: '년',
    save: (pct) => `${pct}% 할인`,
    monthlyEq: (price) => `월 ${price}`,
    lifetimeSub: '한 번 결제, 계속 사용',
    renewAnnual: '1년 뒤 자동 갱신됩니다. 언제든 해지할 수 있고, 해지하면 남은 기간까지 이용됩니다.',
    lifetimeNote: '한 번 결제로 계속 사용합니다. 자동 갱신·추가 결제가 없습니다.',
    lifetimeManage: '다른 기기에서는 «구매 복원»으로 되살립니다.',
    trialTitle: '체험 뒤에도 PRO를 쓰려면',
    trialLede: '요금제를 고르면 지금처럼 계속 이용합니다.',
    ctaKeep: 'PRO 계속 쓰기',
    ctaTrial: (d) => `${d}일 무료로 시작`,
    trialBadge: (d) => `${d}일 무료 체험`,
    // 줄이 접혀도 «· 언제든 해지»만 홀로 떨어지지 않게 뒤 묶음은 붙는 공백(U+00A0)
    trialTerms: (d, price, plan) => `${d}일 무료 체험 후 ${plan === 'annual' ? '연' : '월'} ${price} 자동\u00a0결제\u00a0·\u00a0언제든\u00a0해지`,
    trialFine: (d, price, plan) => `오늘은 결제되지 않습니다. ${d}일 무료 체험이 끝나면 ${price}이 결제되고, 이후 ${plan === 'annual' ? '1년마다' : '매월'} 자동 갱신됩니다. 체험 종료 24시간 전까지 해지하면 요금이 청구되지 않습니다. 해지는 기기의 구독 관리 화면에서 합니다.`,
    trialHeadTitle: (d) => `PRO ${d}일 무료 체험`,
    trialHeadLede: '광고 없이 AI 종목 분석이 바로 열립니다. 체험 종료 24시간 전까지 해지하면 결제되지 않습니다.',
    trialAnnounceEyebrow: '새로 생긴 무료 체험',
    trialVals: ['잠긴 AI 종목 분석이 광고 보기 없이 바로 열림', '실시간 주가·장마감 리포트·실적 일정을 광고 없이'],
    trialSteps: (d, price, plan, place) => [
      ['오늘', 'PRO 전부 무료로 열림'],
      ['종료 24시간 전까지', `${place}에서 해지하면 결제\u00a0없음`],
      [`${d}일 뒤`, `${plan === 'annual' ? '연' : '월'} ${price} 결제 · 이후 자동 갱신`],
    ],
    cancelPlace: { ios: 'App Store 구독 관리', android: 'Google Play 정기 결제', other: '기기의 구독 관리' },
  },
  en: {
    close: 'Close',
    eyebrow: 'SIGNUM PRO',
    title: 'Analysis, always unlocked',
    lede: 'No ad to watch first, and no ads after.',
    benefits: [
      'AI stock analysis, quant signals, institutional holdings open at once',
      'Investor Lenses: top 10 (free: top 3)',
      'Removes every banner and interstitial ad',
    ],
    watchlist: `${MAX_ITEMS}-stock watchlist`,
    watchlistChips: `${MAX_ITEMS}-stock watchlist · 2 insight chips per row`,
    noAds: 'No ads',
    alerts: 'Price-level alerts you set · 5 per stock',
    watchlistTitle: `Up to ${MAX_ITEMS} stocks with PRO`,
    watchlistLede: `Free plan: up to ${FREE_LIMIT} stocks`,
    alertsTitle: 'A push when your price is hit',
    alertsLede: 'Get notified when your stocks rise above or fall below the prices you set (5 per stock). Up to 100 stocks, and no ads.',
    ctaPro: 'Start PRO',
    beforeTag: 'Now',
    afterTag: 'PRO',
    adLabel: 'Ad',
    perMonth: 'month',
    cta: 'Unlock with PRO',
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
    plansLabel: 'Choose a plan',
    planMonthly: 'Monthly',
    planAnnual: 'Annual',
    planLifetime: 'Lifetime',
    perYear: 'year',
    save: (pct) => `Save ${pct}%`,
    monthlyEq: (price) => `${price}/mo`,
    lifetimeSub: 'Pay once, keep it',
    renewAnnual: 'Renews automatically after 1 year. Cancel anytime; access continues until the period ends.',
    lifetimeNote: 'One payment. No renewal and no further charges.',
    lifetimeManage: 'On another device, use Restore purchase.',
    trialTitle: 'Keep PRO after your trial',
    trialLede: 'Pick a plan to keep everything you have now.',
    ctaKeep: 'Keep PRO',
    ctaTrial: (d) => `Start ${d}-day free trial`,
    trialBadge: (d) => `${d}-day free trial`,
    trialTerms: (d, price, plan) => `Free for ${d} days, then ${price}/${plan === 'annual' ? 'year' : 'month'}. Cancel anytime.`,
    trialFine: (d, price, plan) => `You won’t be charged today. When your ${d}-day free trial ends, you’ll be charged ${price}, and it renews automatically every ${plan === 'annual' ? 'year' : 'month'}. Cancel at least 24 hours before the trial ends and you won’t be charged. Cancel from your device’s subscription settings.`,
    trialHeadTitle: (d) => `Try PRO free for ${d} days`,
    trialHeadLede: 'AI stock analysis opens at once, with no ads. Cancel at least 24 hours before the trial ends and you pay nothing.',
    trialAnnounceEyebrow: 'New · Free trial',
    trialVals: ['Locked AI stock analysis opens instantly, no ads to watch', 'Live prices, closing report and earnings calendar, ad-free'],
    trialSteps: (d, price, plan, place) => [
      ['Today', 'Full PRO access, free'],
      ['Until 24h before end', `Cancel in ${place}, no charge`],
      [`In ${d} days`, `${price}/${plan === 'annual' ? 'year' : 'month'}, renews automatically`],
    ],
    cancelPlace: { ios: 'App Store subscriptions', android: 'Google Play subscriptions', other: 'your device’s subscription settings' },
  },
  ja: {
    close: '閉じる',
    eyebrow: 'SIGNUM PRO',
    title: '閉じていた分析がすぐ開きます',
    lede: '広告を見る必要も、広告もありません。',
    benefits: [
      'AI分析・クオンツシグナル・機関保有が開く',
      '投資家レンズは10位まで（無料は3位）',
      'バナー広告と全画面広告をすべて非表示',
    ],
    watchlist: `マイ銘柄${MAX_ITEMS}銘柄`,
    watchlistChips: `マイ銘柄${MAX_ITEMS}銘柄 · 1行にインサイトチップ2つ`,
    noAds: '広告なし',
    alerts: '自分で決めた価格レベルの通知 · 1銘柄5件',
    watchlistTitle: `PROなら${MAX_ITEMS}銘柄まで`,
    watchlistLede: `無料は${FREE_LIMIT}銘柄まで`,
    alertsTitle: '決めた価格に届いたらプッシュで',
    alertsLede: '登録銘柄が自分で決めた価格（1銘柄5件）を上抜け・下抜けしたらお知らせします。最大100銘柄 · 広告もありません。',
    ctaPro: 'PROを始める',
    beforeTag: '現在',
    afterTag: 'PRO',
    adLabel: '広告',
    perMonth: '月',
    cta: 'PROですぐ開く',
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
    plansLabel: 'プランを選択',
    planMonthly: '月額',
    planAnnual: '年額',
    planLifetime: '買い切り',
    perYear: '年',
    save: (pct) => `${pct}%お得`,
    monthlyEq: (price) => `月あたり${price}`,
    lifetimeSub: '一度の購入でずっと使える',
    renewAnnual: '1年後に自動更新されます。いつでも解約でき、期間終了までご利用いただけます。',
    lifetimeNote: '一度の購入でずっと使えます。自動更新・追加料金はありません。',
    lifetimeManage: '別の端末では「購入を復元」で戻せます。',
    trialTitle: '体験後もPROを使うには',
    trialLede: 'プランを選ぶと、今と同じように使い続けられます。',
    ctaKeep: 'PROを続ける',
    ctaTrial: (d) => `${d}日間無料で始める`,
    trialBadge: (d) => `${d}日間無料体験`,
    trialTerms: (d, price, plan) => `${d}日間無料、その後${plan === 'annual' ? '年額' : '月額'}${price}で自動更新・いつでも解約可`,
    trialFine: (d, price, plan) => `本日は請求されません。${d}日間の無料体験が終わると${price}が請求され、以後${plan === 'annual' ? '1年' : '1か月'}ごとに自動更新されます。体験終了の24時間前までに解約すれば請求されません。解約は端末の定期購読設定から行えます。`,
    trialHeadTitle: (d) => `PRO ${d}日間無料体験`,
    trialHeadLede: '広告なしでAIの銘柄分析がすぐ開きます。体験終了の24時間前までに解約すれば請求されません。',
    trialAnnounceEyebrow: '新しい無料体験',
    trialVals: ['ロック中のAI銘柄分析が広告視聴なしですぐ開く', 'リアルタイム株価・引け後レポート・決算日程を広告なしで'],
    trialSteps: (d, price, plan, place) => [
      ['今日', 'PROのすべてが無料で開く'],
      ['終了24時間前まで', `${place}で解約すれば請求なし`],
      [`${d}日後`, `${plan === 'annual' ? '年額' : '月額'}${price}を請求・以後自動更新`],
    ],
    cancelPlace: { ios: 'App Storeのサブスクリプション', android: 'Google Playの定期購入', other: '端末の定期購読設定' },
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

/** ★11/11 체험 만료 뒤 1회 페이월 — 머리·버튼 문구와 «체험 동안 / 무료에서 달라지는 것» 묶음(lib/app/trialExpired). 가격·고지·복원은 그대로 */
export type PaywallContext = { title: string; lede: string; cta: string; sections: { label: string; items: string[] }[] };

export function ProPaywall({ locale, onClose, previewPrice, previewPlans, lead = 'ads', alerts = process.env.NEXT_PUBLIC_WATCHLIST_ALERTS === '1', onNavigate, returnFocus, src, keepOpenWhilePro = false, context, subscriptionOnly = false, onProConfirmed, discountOffer, trialHead = false, trialAnnounce = false, offers: offersProp }: {
  locale: string;
  /** 퍼널 측정 — 이 페이월을 연 화면. 없으면 lead 로 짐작한다(«내 종목» 호스트 = wl_paywall · 프리뷰 가격 = preview) */
  src?: FunnelSrc;
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
  /** 디자인 확인·심사 스크린샷 전용(paywall-preview) — 여러 플랜 카드 모양. 실제 화면에서는 절대 넘기지 않는다 */
  previewPlans?: PaywallPlan[];
  /** 어디서 열렸나 — 첫 줄(굵게)에 올릴 혜택. 기본은 광고 제거(설정·가치 벽) */
  lead?: 'ads' | 'watchlist' | 'alerts';
  /** «내 종목» 알림 혜택 줄을 보일지(NEXT_PUBLIC_WATCHLIST_ALERTS) — 없는 기능을 팔지 않는다 */
  alerts?: boolean;
  /** ★11/11 체험 종료 안내 전용 — 체험 중(이미 PRO)이어도 열린 채 둔다. 구매가 끝나면(PRO 확인) 닫는다. 다른 호출부는 넘기지 않는다(예전처럼 PRO 면 즉시 닫힘) */
  keepOpenWhilePro?: boolean;
  /** ★11/11 체험 만료 뒤 1회 페이월(TrialSavePaywall 만 넘긴다) — 혜택 목록 자리에 실제 값 묶음, 머리·버튼 문구만 바뀐다. 다른 호출부는 넘기지 않는다 */
  context?: PaywallContext;
  /** ★11/11 «내 종목» 알림 벨 경로 전용 — 구독(월·연)만 카드로 그린다(평생 빼기). 다른 호출부는 넘기지 않는다 */
  subscriptionOnly?: boolean;
  /** ★11/11 «내 종목» 알림 벨 경로 전용 — PRO 가 확인되면(구매·복원·쿠폰·다른 경로) «닫기 대신» 부른다. 닫기와 다음 화면은 호출부 몫.
      머리 문구는 바꾸지 않는다(keepOpenWhilePro 와 무관 — 그건 체험 종료 안내 전용). 다른 호출부는 넘기지 않는다(예전처럼 PRO 면 닫힘) */
  onProConfirmed?: () => void;
  /** ★11/12 체험 만료자 «월간 첫 달 할인» 카드 — 만료 1회 페이월(TrialSavePaywall · src trial_expired · context)만 넘긴다.
      스토어 오퍼(ExpiredOffer — 대상 판정·서명·옵션 확인을 마친 것)일 때만 결제가 된다. 값만 있는 것(ExpiredOfferView)은 개발 미리보기 전용.
      다른 호출부는 넘기지 않는다 → 카드·할인 결제 경로 자체가 없다(예전 화면 그대로) */
  discountOffer?: ExpiredOffer | ExpiredOfferView | null;
  /** ★11/16 첫 실행 페이월 전용 — 고른 플랜에 무료 체험이 적용되면 머리를 «PRO 7일 무료»로. 체험이 없으면 예전 머리 */
  trialHead?: boolean;
  /** ★11/16 밤 기존 무료 사용자 1회 안내(TrialAnnounceGate) — trialHead 와 함께. 체험이 적용될 때만 눈썹 자리에 «새로 생긴 무료 체험» */
  trialAnnounce?: boolean;
  /** ★11/16 첫 실행 페이월 전용 — 판정에 쓴 스토어 오퍼(체험 일수 포함)를 그대로 그린다(재조회 실패로 체험 없는 화면이 되지 않게, 관문 11161250 ②).
      비면 훅 값. 다른 호출부는 넘기지 않는다 */
  offers?: PlanOffer[];
}) {
  const router = useRouter();
  const loc: PaywallLocale = locale === 'ko' ? 'ko' : locale === 'ja' ? 'ja' : 'en';
  const t = SHOWN[loc];

  const { isPro, ready, offers: hookOffers, purchase, purchaseOffer, purchasePending, restore, refreshOffers } = useProStatus();
  const offers = offersProp && offersProp.length ? offersProp : hookOffers;
  // ★11/12 할인 카드는 만료 페이월(context)에서만 — 다른 화면에 실수로 넘어와도 그리지 않는다.
  //   정가 월간 카드(스토어 오퍼링)가 있을 때만 — 할인 결제가 안 되면 같은 화면에서 정가를 고를 수 있어야 한다(관문 11121047)
  const offer = context && discountOffer && (previewPlans ?? offers).some((p) => p.plan === 'monthly') ? discountOffer : null;
  const offerReal = offer && 'platform' in offer ? (offer as ExpiredOffer) : null;
  const oc = expiredOfferCopy(loc);
  // 퍼널: 연 화면 — 열릴 때 한 번 «open», 구매 버튼에 «cta», 결과는 useProStatus 가 이 출처로 센다
  const funnelSrc: FunnelSrc = src ?? (previewPrice ? 'preview' : lead === 'ads' ? 'other' : 'wl_paywall');
  useEffect(() => {
    void funnel().then((m) => { m.noteFunnelSrc(funnelSrc); m.trackFunnel('open', { src: funnelSrc }); }).catch(() => {});
    // ★11/16 밤 «오늘 페이월 봄» 표식 — 기존 사용자 체험 안내(trial_announce)가 같은 날 겹치지 않게(lib/app/trialAnnounce · 화면 영향 없음)
    try { notePaywallOpened(window.localStorage); } catch { /* 저장소 막힘 */ }
    // 열릴 때 한 번만(출처는 열린 동안 바뀌지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 할인 카드가 «보였다» — 스토어 오퍼일 때 한 번(정가 오퍼링이 늦게 와 카드가 나중에 생겨도 센다)
  const offerSeen = useRef(false);
  useEffect(() => {
    if (!offerReal || offerSeen.current) return;
    offerSeen.current = true;
    void funnel().then((m) => m.trackFunnel('open', { src: 'trial_expired_offer' })).catch(() => {});
  }, [offerReal]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<PlanId | null>(null);
  // ★11/12 구매 전 읽기 사이에 닫혔나(닫기 버튼 · 언마운트) — 닫힌 페이월 뒤에 구매 창을 열지 않는다
  const alive = useRef(true);
  const closedByUser = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const closeByUser = useCallback(() => { closedByUser.current = true; onClose(); }, [onClose]);
  // ★11/12 할인 카드가 있으면 그것이 기본 선택 — 갱신을 끈 체험자에게 첫 결제 장벽(₩89,000 일시불)보다 낮은 입구가 실결제자 수에 맞다. 연간 카드는 그대로 고를 수 있다
  const [offerOn, setOfferOn] = useState(true);
  const offerSelected = !!offer && offerOn;

  // 스토어가 준 월간 오퍼. 없으면 «가격을 지어내지 않고» 버튼을 잠근다.
  const monthly = offers.find((o) => o.plan === 'monthly') ?? null;

  // ★11/9 여러 플랜(월간·연간·평생) — 스토어가 연간·평생 패키지를 «실제로» 내려줬을 때만(그리고 노출 스위치가 켜졌을 때만 —
  //   config/iap.ts). 월간만 있으면 multi=false → 화면은 예전과 바이트 단위로 같다(가격 한 줄 + 버튼).
  //   ★11/11 수리(코덱스 야간 11/10): 예전 multi 는 «월간이 있을 때만» 참이라, 스토어가 연간·평생만 주면 multi=false →
  //   selectedOffer=monthly=null → 버튼이 잠겨 아무것도 살 수 없었다. 이제 월간이 아닌 플랜이 하나라도 오면 카드로 그리고 그 플랜을 산다.
  const plans: PaywallPlan[] = (previewPlans ?? offers).filter((p) => !subscriptionOnly || p.plan !== 'lifetime');
  // ★11/16 첫 실행 체험 페이월(trialHead)은 체험이 적용되는 플랜을 기본 선택(연간 우선) — 체험 없는 플랜으로 열리지 않게(관문 11161253 ②)
  const trialFirst = trialHead && !picked
    ? (plans.find((p) => p.plan === 'annual' && p.trialDays)?.plan ?? plans.find((p) => p.plan !== 'lifetime' && p.trialDays)?.plan ?? null)
    : null;
  const { multi, selected: pickedPlan } = paywallSelection(plans, picked ?? trialFirst);
  // 기본 선택 = 연간(있으면) — 없으면 월간 — 둘 다 없으면 첫 플랜(평생)
  const selected: PlanId = pickedPlan;
  const selectedOffer = multi ? (offers.find((o) => o.plan === selected) ?? null) : monthly;
  const savePct = multi ? annualSavePct(plans.find((p) => p.plan === 'monthly'), plans.find((p) => p.plan === 'annual')) : null;
  // ★11/16 무료 체험 — 고른 플랜(또는 한 줄 화면의 월간)에 스토어가 «자격 확인된» 체험을 줄 때만. 할인 카드를 고르면 없음
  const trialPlan: PaywallPlan | null = offerSelected ? null : multi ? (plans.find((p) => p.plan === selected) ?? null) : (monthly ?? null);
  const trialDays = trialPlan && trialPlan.plan !== 'lifetime' && trialPlan.trialDays ? trialPlan.trialDays : null;

  // 열었는데 가격이 없다 = 마운트 때 오퍼링을 못 받았다는 뜻. 여기서 한 번 더 받는다.
  useEffect(() => {
    if (!monthly && !previewPrice) void refreshOffers();
    // 페이월이 열릴 때 한 번만 — 가격이 들어오면 monthly 가 생겨 다시 돌지 않는다
  }, [monthly, previewPrice, refreshOffers]);
  const shownPrice = monthly?.priceString ?? previewPrice ?? null;

  // 이미 구독자면 페이월을 띄울 이유가 없다(복원 직후 포함).
  //   ★11/11 알림 벨 경로(onProConfirmed)는 닫기 대신 그 콜백 — 호출부가 닫고 그 종목 설정으로 넘긴다(쿠폰·다른 경로 포함)
  useEffect(() => {
    if (isPro && !keepOpenWhilePro && onProConfirmed) onProConfirmed();
    else if (isPro && !keepOpenWhilePro) onClose();
  }, [isPro, onClose, keepOpenWhilePro, onProConfirmed]);

  const handleSubscribe = useCallback(async () => {
    if (busy || purchasePending) return;
    if (offerSelected) {
      // 할인 결제 — 스토어 오퍼가 아니면(미리보기) 아무것도 하지 않는다. 실패해도 정가 결제로 넘기지 않는다
      if (!offerReal) return;
      void funnel().then((m) => { m.trackFunnel('cta', { src: funnelSrc }); m.trackFunnel('cta', { src: 'trial_expired_offer' }); }).catch(() => {});
      setBusy(true);
      setNote(null);
      const r = await purchaseOffer(offerReal, 'trial_expired_offer');
      if (alive.current) setBusy(false);
      if (r.ok && r.isPro) return; // 위 effect 가 닫는다
      if (!r.ok && !r.cancelled) { markSessionError(); setNote(t.failed); }
      return;
    }
    if (!selectedOffer) return;
    void funnel().then((m) => m.trackFunnel('cta', { src: funnelSrc })).catch(() => {});
    setBusy(true);
    setNote(null);
    // ★11/12 신규 체험이면 «내 종목»으로 한 번(lib/app/trialStartWatchlist). 알림 벨 경로(onProConfirmed)는 그 종목 설정으로 가므로 제외.
    //   구매 전 읽기를 기다리는 사이 닫았으면 구매 창을 열지 않는다(관문 11112153 ②)
    const out = await purchaseWithTrialStart({
      plan: onProConfirmed || keepOpenWhilePro ? 'none' : selectedOffer.plan,
      product: selectedOffer.pkg?.product?.identifier,
      // ★11/16 체험을 보여 준 화면이면 «그 화면에 그린 패키지»로 산다(그 사이 오퍼링이 바뀌어 다른 조건이 열리지 않게, 관문 11161253 ①)
      purchase: () => purchase(selectedOffer.plan, funnelSrc, trialDays ? selectedOffer.pkg : undefined),
      stillOpen: () => alive.current && !closedByUser.current,
    });
    if (!out) { if (alive.current) setBusy(false); return; }
    const res = out.res;
    if (out.claimed) {
      if (alive.current) onClose();
      // 아래에 한도 시트가 있으면(내 종목 호스트 페이월) 그 시트의 «담으려던 종목 담기»가 끝난 뒤에 옮긴다(관문 11121105)
      await goToWatchlistAfterTrial(out.origin, loc, (p) => router.push(p), {
        afterHistory: afterSheetHistory, subscribe: wlUI.subscribe, limitSheetOpen: () => wlUI.getSnapshot().sheet?.kind === 'limit',
      });
      if (alive.current) setBusy(false);
      return;
    }
    setBusy(false);
    if (res.ok && res.isPro) { if (onProConfirmed) onProConfirmed(); else if (keepOpenWhilePro) onClose(); return; } // 평소엔 위 effect 가 닫는다
    // 사용자가 스토어 시트를 직접 닫은 경우는 «실패»가 아니다 — 조용히 둔다.
    if (!res.ok && !res.cancelled) { markSessionError(); setNote(t.failed); }
  }, [busy, purchasePending, selectedOffer, purchase, t, funnelSrc, keepOpenWhilePro, onClose, onProConfirmed, router, loc, offerSelected, offerReal, purchaseOffer]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNote(t.restoring);
    const res = await restore(funnelSrc);
    setBusy(false);
    if (res.ok && res.isPro) { setNote(t.restored); onProConfirmed?.(); }
    else if (res.ok) setNote(t.nothingToRestore);
    else { markSessionError(); setNote(t.failed); }
  }, [busy, restore, t, funnelSrc, onProConfirmed]);

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
  const head0 = context
    ? { title: context.title, lede: context.lede, cta: context.cta }
    : keepOpenWhilePro
    ? { title: t.trialTitle, lede: t.trialLede, cta: t.ctaKeep }
    : alertsLead
    ? { title: t.alertsTitle, lede: t.alertsLede, cta: t.ctaPro }
    : watchlistLead
      ? { title: t.watchlistTitle, lede: t.watchlistLede, cta: t.ctaPro }
      : { title: t.title, lede: t.lede, cta: t.cta };
  // ★11/16 체험이 적용되는 플랜이면 버튼은 «7일 무료로 시작»(명시 CTA — 3.1.2). 첫 실행 페이월(trialHead)은 머리도 체험 중심
  // ★11/19 체험 머리 화면(첫 실행 first_run · 기존 사용자 안내 trial_announce — 체험이 적용될 때만). 11/16~18 iOS 열림 10·버튼 0 →
  //   가격보다 가치·«오늘 무료» 일정이 먼저 보이게: 머리 설명 대신 가치 3줄(체크) · 연간 카드 위 · 버튼 바로 위 체험 일정 3단(가격·자동 갱신·해지 장소).
  //   결제(구매 호출·패키지·선택 규칙)는 그대로 — 화면 표현만. 체험이 없거나 다른 화면이면 예전 그대로
  const trialScreen = !!trialDays && trialHead && !context && !keepOpenWhilePro;
  const head = !trialDays ? head0
    : trialScreen ? { title: t.trialHeadTitle(trialDays), lede: '', cta: t.ctaTrial(trialDays) }
    : { ...head0, cta: t.ctaTrial(trialDays) };
  // 해지하는 곳 — 네이티브 앱은 window.Capacitor(동기). 웹·미리보기·시험은 «기기의 구독 관리»
  const storeOs = (() => {
    if (!trialScreen) return 'other' as const;
    try {
      const pf = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
      return pf === 'ios' ? 'ios' as const : pf === 'android' ? 'android' as const : 'other' as const;
    } catch { return 'other' as const; }
  })();
  // 체험 화면은 연간 카드를 위로(기본 선택이 맨 위에 보이게) — 선택·구매 규칙은 plans 그대로, 그리는 순서만
  const shownPlans = trialScreen ? [...plans].sort((a, b) => (a.plan === 'annual' ? 0 : 1) - (b.plan === 'annual' ? 0 : 1)) : plans;

  return (
    <div className={s.overlay} data-pro-paywall data-paywall-src={context ? funnelSrc : undefined} role="dialog" aria-modal="true" aria-label={head.title} onKeyDown={trapTab}>
      <div className={s.sheet}>
        {/* 닫기 — 첫 페인트에 보이고 44×44 이상 (Play 요건) */}
        <button ref={closeBtnRef} type="button" className={s.close} onClick={closeByUser} aria-label={t.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={s.head}>
          <span className={s.eyebrow}>{trialAnnounce && trialHead && trialDays && !context && !keepOpenWhilePro ? t.trialAnnounceEyebrow : t.eyebrow}</span>
          {/* ★11/11 만료 페이월 제목엔 날짜가 들어간다 — 한국어가 «11 / 월»로 갈라지지 않게 낱말 단위 줄바꿈(그 모드에서만) */}
          <h1 className={s.title} style={context ? { wordBreak: 'keep-all' } : undefined}>{head.title}</h1>
          {(head.lede || !trialScreen) && <p className={s.lede}>{head.lede}</p>}
        </div>

        {/* ★11/11 체험 만료 뒤 — «체험 동안»(실제 값만) · «무료 플랜에서 달라지는 것». 없는 값의 줄은 lib/app/trialExpired 가 뺀다 */}
        {context ? context.sections.map((sec, si) => (
          <div key={sec.label} data-paywall-section={si}>
            <p className={s.fine} style={{ textAlign: 'left', marginTop: 4 }}>{sec.label}</p>
            <ul className={s.benefits} style={{ wordBreak: 'keep-all' }}>
              {sec.items.map((b, i) => (
                <li key={b} className={si === 0 && i === 0 ? `${s.benefit} ${s.benefitLead}` : s.benefit}>{b}</li>
              ))}
            </ul>
          </div>
        )) : trialScreen ? (
        /* ★11/19 체험 화면 — 미국 주식 앱 핵심 가치 3줄(체크). 셋째 줄은 «내 종목» 한도(PRO 실제 혜택) */
        <ul className={loc === 'ko' ? `${s.vals} ${s.ko}` : s.vals} data-trial-vals="">
          {[...t.trialVals, t.watchlist].map((b, i) => (
            <li key={b} className={i === 0 ? `${s.val} ${s.valLead}` : s.val}>{b}</li>
          ))}
        </ul>
        ) : (
        /* 담는 것 — 아이콘도 칩도 없이 가는 선으로만 나눈다. 덜어낸 만큼 가격이 산다. */
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
        )}

        {/* 가격 — 스토어가 준 현지화 문자열만 쓴다.
            ★11/9 연간·평생이 «스토어에 있을 때만» 플랜 카드 3장(기본 선택 연간). 없으면 아래 예전 가격 한 줄 그대로. */}
        {multi || offer ? (
          <div className={s.plans} role="radiogroup" aria-label={t.plansLabel}>
            {/* ★11/12 체험 만료자 첫 달 할인 — 맨 위 한 장. 첫 달 가격·그 뒤 정가 갱신을 카드에, 기간·해지 고지는 아래 안내문에 */}
            {offer && (
              <button
                type="button"
                role="radio"
                aria-checked={offerSelected}
                data-plan="monthly-offer"
                data-offer="expired"
                className={offerSelected ? `${s.plan} ${s.planOn}` : s.plan}
                onClick={() => setOfferOn(true)}
              >
                <span className={s.planMain}>
                  <span className={s.planName}>
                    {oc.name}
                    {offer.pct != null && <span className={s.planBadge}>{oc.badge(offer.pct)}</span>}
                  </span>
                  <span className={s.planSub}>{oc.then(offer.regularPriceString)}</span>
                </span>
                <span className={s.planPrice}>
                  <span className={s.planAmt}>{offer.priceString}</span>
                  <span className={s.planPer}>/ {oc.firstMonth}</span>
                </span>
              </button>
            )}
            {shownPlans.map((p) => {
              const on = !offerSelected && p.plan === selected;
              const name = p.plan === 'annual' ? t.planAnnual : p.plan === 'lifetime' ? t.planLifetime : t.planMonthly;
              const per = p.plan === 'annual' ? t.perYear : p.plan === 'monthly' ? t.perMonth : null;
              const sub0 = p.plan === 'annual'
                ? (p.pricePerMonthString ? t.monthlyEq(p.pricePerMonthString) : null)
                : p.plan === 'lifetime' ? t.lifetimeSub : null;
              // ★11/16 체험이 적용되는 카드엔 «7일 무료 체험»을 덧붙인다(카드의 속성 — 토글 아님)
              const sub = p.plan !== 'lifetime' && p.trialDays ? (sub0 ? `${sub0} · ${t.trialBadge(p.trialDays)}` : t.trialBadge(p.trialDays)) : sub0;
              return (
                <button
                  key={p.plan}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-plan={p.plan}
                  className={on ? `${s.plan} ${s.planOn}` : s.plan}
                  onClick={() => { setOfferOn(false); setPicked(p.plan); }}
                >
                  <span className={s.planMain}>
                    <span className={s.planName}>
                      {name}
                      {p.plan === 'annual' && savePct != null && <span className={s.planBadge}>{t.save(savePct)}</span>}
                    </span>
                    {sub && <span className={s.planSub}>{sub}</span>}
                  </span>
                  <span className={s.planPrice}>
                    <span className={s.planAmt}>{p.priceString}</span>
                    {per && <span className={s.planPer}>/ {per}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
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
        )}

        {/* ★11/16 무료 체험 조건 — 결제 버튼 바로 위, 본문 크기(작은 글씨 아님). 체험이 적용될 때만 */}
        {trialDays && trialPlan && trialScreen ? (
          /* ★11/19 체험 일정 3단 — 결제 버튼 바로 위, 본문 크기. 오늘 무료 · 종료 24시간 전까지 해지하면 결제 없음(해지 장소) · N일 뒤 가격·주기·자동 갱신.
             종료 전 알림은 약속하지 않는다(D-2 푸시는 «갱신 끈 체험자»에게만 간다 — lib/push/trialPush) */
          <ol className={loc === 'ko' ? `${s.steps} ${s.ko}` : s.steps} data-trial-days={trialDays} data-trial-steps="">
            {t.trialSteps(trialDays, trialPlan.priceString, trialPlan.plan, t.cancelPlace[storeOs]).map(([when, what], i) => (
              <li key={i} className={i === 2 ? `${s.step} ${s.stepPay}` : s.step}>
                <span className={s.stepWhen}>{when}</span>
                <span className={s.stepWhat}>{what}</span>
              </li>
            ))}
          </ol>
        ) : trialDays && trialPlan ? (
          <p className={s.trialTerms} data-trial-days={trialDays}>{t.trialTerms(trialDays, trialPlan.priceString, trialPlan.plan)}</p>
        ) : null}

        <button
          type="button"
          className={s.cta}
          onClick={handleSubscribe}
          disabled={busy || purchasePending || (offerSelected ? false : multi ? (!selectedOffer && !previewPlans) : (!monthly && !previewPrice))}
        >
          {busy || purchasePending ? t.ctaBusy : head.cta}
        </button>

        {note && <p className={s.note} role="status">{note}</p>}

        {/* ★2026-10-05 «코드가 있으신가요? 🎟 쿠폰 코드 입력» — 결제 단추보다 조용하게(네이티브·프리뷰에서만). components/app/RedeemCodeLink */}
        <RedeemCodeLink locale={loc} src={funnelSrc} />

        <p className={s.fine}>{offerSelected && offer ? oc.fine(offer.priceString, offer.regularPriceString) : trialDays && trialPlan ? t.trialFine(trialDays, trialPlan.priceString, trialPlan.plan) : multi ? planFineLine(loc, t, selected) : fineLine(loc, t)}</p>

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
