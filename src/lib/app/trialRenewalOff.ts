import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import type { TrialStore } from '@/lib/app/trialConsent';

export const TRIAL_OFF_STORAGE_KEY = 'signumhq.trialRenewalOff.v1';
// ★2026-11-11 48h → 72h(마지막 3일) · 하루 한 번(기기 현지 날짜). 저장 값 = «체험 기간|현지 날짜»(mark) — 같은 날엔 다시 뜨지 않는다.
//   옛 저장 값(기간만)은 mark 와 다르므로 3일 창 안에서 하루 한 번 규칙을 그대로 따른다.
export const TRIAL_OFF_WINDOW_MS = 72 * 60 * 60 * 1000;
// ★2026-11-11 «갱신 끈 직후 1회»(early): 마지막 3일 창 밖에서 willRenew=false 를 처음 본 앱 복귀에 같은 시트를 체험 기간당 한 번.
//   기기 저장 키(TRIAL_OFF_EARLY_KEY) = «체험 기간|현지 날짜». D-3 시트와 같은 날 두 번은 없다(서로의 날짜를 본다). D-2 푸시(서버)는 무관.
export const TRIAL_OFF_EARLY_KEY = 'signumhq.trialRenewalOff.early.v1';
export type TrialOffKind = 'window' | 'early';
/** startedAt = 이 체험 기간의 시작(latestPurchaseDate) — 시트의 «체험 동안» 채점은 이 시각 뒤 주만 쓴다(야간 검토 11/12 ①) */
export type TrialOffNotice = { store: TrialStore; startedAt: number; expiresAt: number; period: string; mark: string; kind: TrialOffKind };
/** early 를 켜려면 넘긴다 — early = 기기에 저장된 조기 안내 표식(없으면 null). 안 넘기면 예전처럼 D-3 창만 */
export type TrialOffEarlyOption = { early: string | null };

/** 저장 표식 «기간|날짜»의 날짜(옛 값처럼 날짜가 없으면 null) */
function markDay(mark: string | null | undefined): string | null {
  const i = mark ? mark.lastIndexOf('|') : -1;
  return mark && i >= 0 ? mark.slice(i + 1) : null;
}
/** 저장 표식의 체험 기간 부분 */
function markPeriod(mark: string | null | undefined): string | null {
  if (!mark) return null;
  const i = mark.lastIndexOf('|');
  return i >= 0 ? mark.slice(0, i) : mark;
}

/** 기기 현지 날짜(YYYY-MM-DD) — «하루 한 번»의 하루. 식별자 아님 */
export function localDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function trialRenewalOffNotice(info: Pick<CustomerInfo, 'entitlements'> | null, platform: string, now: number, seen: string | null, day: string = localDayKey(now), early?: TrialOffEarlyOption): TrialOffNotice | null {
  const pro = info?.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!Number.isFinite(now) || !pro?.isActive || pro.willRenew !== false || pro.periodType !== 'TRIAL' || pro.ownershipType === 'FAMILY_SHARED') return null;
  const store = pro.store;
  if (!((store === 'APP_STORE' && platform === 'ios') || (store === 'PLAY_STORE' && platform === 'android'))) return null;
  const start = Date.parse(pro.latestPurchaseDate ?? '');
  const expiresAt = Date.parse(pro.expirationDate ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(expiresAt) || start > now || expiresAt <= start || expiresAt <= now) return null;
  const period = `${start}:${expiresAt}`;
  const mark = `${period}|${day}`;
  if (expiresAt - now <= TRIAL_OFF_WINDOW_MS) {
    // D-3 창(하루 한 번). 오늘 이미 조기 안내를 봤으면 내일로 미룬다(같은 날 두 번 금지)
    if (mark === seen || (early && markDay(early.early) === day)) return null;
    return { store, startedAt: start, expiresAt, period, mark, kind: 'window' };
  }
  if (!early) return null;
  // 창 밖: 이 체험 기간에 조기 안내를 이미 봤으면 다시 없음 · 오늘 D-3 시트를 봤으면 없음
  if (markPeriod(early.early) === period || markDay(seen) === day) return null;
  return { store, startedAt: start, expiresAt, period, mark, kind: 'early' };
}

export function verifiedTrialRenewalOffNotice(initial: Pick<CustomerInfo, 'entitlements'>, fresh: Pick<CustomerInfo, 'entitlements'>, platform: string, now: number, seen: string | null, day: string = localDayKey(now), early?: TrialOffEarlyOption): TrialOffNotice | null {
  const before = initial.entitlements.active[PRO_ENTITLEMENT_ID];
  const after = fresh.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!before?.productIdentifier || before.productIdentifier !== after?.productIdentifier) return null;
  const first = trialRenewalOffNotice(initial, platform, now, seen, day, early);
  const latest = trialRenewalOffNotice(fresh, platform, now, seen, day, early);
  return first && latest && first.period === latest.period && first.store === latest.store && first.kind === latest.kind ? latest : null;
}

export const TRIAL_OFF_COPY = {
  ko: { title: '체험이 곧 끝나요', intro: 'PRO로 계속 볼 수 있는 것', watchlist: '내 종목 최대 100개 (무료 5개)', ads: '광고 없음', alerts: '고래 알림', manage: '계속 쓰기', later: '나중에' },
  en: { title: 'Your trial is ending soon', intro: 'Keep enjoying with PRO', watchlist: 'Up to 100 watchlist stocks (5 free)', ads: 'No ads', alerts: 'Whale alerts', manage: 'Keep using PRO', later: 'Later' },
  ja: { title: 'トライアルがまもなく終了します', intro: 'PROで引き続き利用できること', watchlist: 'マイ銘柄は最大100銘柄（無料は5銘柄）', ads: '広告なし', alerts: 'クジラアラート', manage: '使い続ける', later: '後で' },
} as const;
export function trialOffCopy(locale: string) { return TRIAL_OFF_COPY[locale === 'ko' || locale === 'ja' ? locale : 'en']; }
