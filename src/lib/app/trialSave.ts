// ============================================================================
// 체험 종료 «되살리기» (2026-11-11) — 순수 모듈(화면·서버·시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜: 10/12 이후 체험 138명 중 123명이 자동 갱신을 껐다(RC 11/11). 첫 만료 11/12.
//   마지막 3일(lib/app/trialRenewalOff · 하루 한 번)에 «언제 끝나는지 + 실제로 본 것(숫자)»을 보이고
//   기존 ProPaywall(연간 기본 선택 — 여러 플랜이 켜졌을 때)로 잇는다. D-2 푸시는 서버(lib/push/trialPush)가 보낸다.
// 원칙: 실제 숫자만(운영 실적 채점·기기의 내 종목 수). 과장·가짜 긴급함·투자 권유 없음. 가격은 이 카드에 쓰지 않는다
//   (가격·자동 갱신 고지는 페이월이 스토어 문자열로 보인다 — 애플 3.1.2).
// 식별자: 없음. 푸시 보고는 이미 서버에 있는 푸시 토큰 + 만료 시각·갱신 여부·기간 종류만.
// ============================================================================
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import { calendarScorecardSummary } from '@/lib/earnings/calendarScorecardDisplay';
import { addDaysYmd } from '@/lib/earningsWeek';
import { FREE_LIMIT, MAX_ITEMS } from '@/lib/app/watchlist';

export type TrialSaveLocale = 'ko' | 'en' | 'ja';
export const toTrialSaveLocale = (l: string): TrialSaveLocale => (l === 'ko' || l === 'ja' ? l : 'en');

/** 푸시를 눌러 들어왔을 때 «오늘 이미 봤음»을 한 번 건너뛰는 세션 표식 */
export const TRIAL_SAVE_PUSH_FLAG = 'signumhq.trialSave.push';
/** 푸시 보고 중복 방지(같은 내용·같은 토큰·같은 날이면 다시 보내지 않는다) */
export const TRIAL_PUSH_REPORT_KEY = 'signumhq.trialSave.report.v1';

/** 종료 날짜 — 기기 현지 시간대. ko «11월 13일 (금)» · en «Fri, Nov 13» · ja «11月13日(金)» */
export function trialEndDateText(expiresAt: number, locale: string, timeZone?: string): string {
  const loc = toTrialSaveLocale(locale);
  const tag = loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US';
  try {
    return new Intl.DateTimeFormat(tag, { month: loc === 'en' ? 'short' : 'long', day: 'numeric', weekday: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(expiresAt));
  } catch {
    return new Intl.DateTimeFormat(tag, { month: loc === 'en' ? 'short' : 'long', day: 'numeric', weekday: 'short' }).format(new Date(expiresAt));
  }
}

export type TrialScorecard = { n: number; within: number; previous: boolean };
/** 이번 주 채점이 이 종목 수보다 적으면 지난주와 견준다 */
export const TRIAL_SCORECARD_MIN_N = 10;

/**
 * 운영 실적 채점(/api/earnings/scorecard)의 «n종목 중 within개 예상 범위 안». 이번 주가 작거나 비었으면 지난주와 견준다.
 * 실패·이상한 응답이면 null(줄을 그리지 않는다 — 숫자를 지어내지 않는다).
 */
export async function trialScorecard(read: (week: string) => Promise<unknown>, week: string): Promise<TrialScorecard | null> {
  try {
    // 이번 주 표본이 작으면(주 초 — 2종목 중 1개 같은 줄) 지난주와 견줘 «종목 수가 많은 쪽»을 쓴다. 둘 다 실제 운영 채점이다.
    const cur = calendarScorecardSummary(await read(week).catch(() => null), week);
    if (cur && cur.n >= TRIAL_SCORECARD_MIN_N) return { n: cur.n, within: cur.withinCount, previous: false };
    const prevWeek = addDaysYmd(week, -7);
    const prev = calendarScorecardSummary(await read(prevWeek).catch(() => null), prevWeek);
    const best = prev && (!cur || prev.n > cur.n) ? { s: prev, previous: true } : cur ? { s: cur, previous: false } : null;
    return best ? { n: best.s.n, within: best.s.withinCount, previous: best.previous } : null;
  } catch { return null; }
}

const COPY = {
  ko: {
    title: (d: string) => `PRO 무료 체험이 ${d}에 끝나요`,
    lede: '자동 갱신이 꺼져 있어서, 끝나도 결제되지 않아요.',
    seen: '이번 달 SIGNUM',
    keep: 'PRO로 계속 쓰는 것',
    scorecard: (c: TrialScorecard) => `${c.previous ? '지난주' : '이번 주'} 실적 채점: ${c.n}종목 중 ${c.within}종목이 발표 전 예상 변동폭 안`,
    watchlistMany: (n: number) => `담아 둔 내 종목 ${n}개 — 무료는 ${FREE_LIMIT}개까지라 더 담을 수 없어요`,
    watchlistFew: (n: number) => `담아 둔 내 종목 ${n}개 · PRO는 ${MAX_ITEMS}개까지`,
    watchlistNone: `내 종목 최대 ${MAX_ITEMS}개 (무료 ${FREE_LIMIT}개)`,
    unlocked: 'AI 분석·기관 보유가 광고 없이 바로 열림',
    cta: 'PRO 요금제 보기',
    manage: '구독 관리에서 자동 갱신 다시 켜기',
    later: '나중에',
  },
  en: {
    title: (d: string) => `Your PRO free trial ends ${d}`,
    lede: 'Auto-renew is off, so you won’t be charged when it ends.',
    seen: 'SIGNUM this month',
    keep: 'What you keep with PRO',
    scorecard: (c: TrialScorecard) => `${c.previous ? 'Last week' : 'This week'}’s earnings scorecard: ${c.within} of ${c.n} stocks moved within the expected range`,
    watchlistMany: (n: number) => `${n} stocks in your watchlist — the free plan holds ${FREE_LIMIT}, so you can’t add more`,
    watchlistFew: (n: number) => `${n} stocks in your watchlist · up to ${MAX_ITEMS} with PRO`,
    watchlistNone: `Up to ${MAX_ITEMS} watchlist stocks (${FREE_LIMIT} free)`,
    unlocked: 'AI analysis and institutional holdings open at once, with no ads',
    cta: 'See PRO plans',
    manage: 'Turn auto-renew back on in subscriptions',
    later: 'Not now',
  },
  ja: {
    title: (d: string) => `PROの無料体験は${d}に終了します`,
    lede: '自動更新はオフのため、終了後も請求はありません。',
    seen: '今月のSIGNUM',
    keep: 'PROで使い続けられるもの',
    scorecard: (c: TrialScorecard) => `${c.previous ? '先週' : '今週'}の決算採点：${c.n}銘柄中${c.within}銘柄が発表前の想定変動幅内`,
    watchlistMany: (n: number) => `登録中のマイ銘柄${n}銘柄 — 無料は${FREE_LIMIT}銘柄までのため追加できません`,
    watchlistFew: (n: number) => `登録中のマイ銘柄${n}銘柄 · PROなら${MAX_ITEMS}銘柄まで`,
    watchlistNone: `マイ銘柄は最大${MAX_ITEMS}銘柄（無料は${FREE_LIMIT}銘柄）`,
    unlocked: 'AI分析・機関保有が広告なしですぐ開く',
    cta: 'PROのプランを見る',
    manage: '定期購読の設定で自動更新をオンに戻す',
    later: 'あとで',
  },
} as const;

export function trialSaveCopy(locale: string) { return COPY[toTrialSaveLocale(locale)]; }

/** 내 종목 줄 — 기기 목록 개수 그대로(0이면 일반 안내) */
export function trialWatchlistLine(count: number, locale: string): string {
  const c = trialSaveCopy(locale);
  if (!Number.isInteger(count) || count <= 0) return c.watchlistNone;
  return count > FREE_LIMIT ? c.watchlistMany(count) : c.watchlistFew(count);
}

// ── D-2 푸시 보고(기기 → 서버) ────────────────────────────────────────────
export type TrialPushState = { expiresAt: number; willRenew: boolean; periodType: string; store: string };

/**
 * 보고할 상태. 체험(TRIAL) 중인 'pro' 권한일 때만 값이 있다(갱신 여부 상관없이 — 다시 켜면 서버가 대상에서 뺀다).
 * 체험이 아니면 null(유료·평생·무료 사용자는 보고하지 않는다).
 */
export function trialPushState(info: Pick<CustomerInfo, 'entitlements'> | null | undefined, now: number): TrialPushState | null {
  const pro = info?.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  if (!pro?.isActive || pro.periodType !== 'TRIAL' || typeof pro.willRenew !== 'boolean') return null;
  const expiresAt = Date.parse(pro.expirationDate ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { expiresAt, willRenew: pro.willRenew, periodType: pro.periodType, store: String(pro.store || '') };
}

/** 보고 중복 지문 — 토큰·만료·갱신·날짜가 같으면 다시 보내지 않는다 */
export function trialPushFingerprint(state: TrialPushState, token: string, day: string): string {
  let h = 5381;
  const s = `${token}|${state.expiresAt}|${state.willRenew ? 1 : 0}|${day}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
