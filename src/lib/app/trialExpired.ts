// ============================================================================
// 체험 «만료 뒤» 첫 실행 1회 페이월 (2026-11-11) — 순수 모듈(화면·시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜: 10/12 이후 체험 139명 중 123명이 자동 갱신을 꺼 두었다. 첫 만료 11/12.
//   만료 순간에 «체험 동안 쓴 것(실제 값) + 무료로 바뀌며 달라지는 것»을 보이고 기존 ProPaywall(연간 기본 선택·구매 복원)로 잇는다.
//   마지막 3일 시트·갱신 끈 직후 1회(lib/app/trialRenewalOff)는 «체험 중»에만 뜬다 — 이 모듈은 «체험이 끝난 뒤»만 본다(겹침 없음).
// 판정은 RevenueCat 고객 정보만으로(RC 권한 'pro'):
//   · 활성 'pro' 없음 · 활성 구독(activeSubscriptions) 없음 — 유료·평생·코드 체험 중(애플 오퍼 코드·Play 프로모션)·체험 중은 전부 제외
//   · entitlements.all.pro: isActive=false · periodType=TRIAL · willRenew=false · 결제 문제(billingIssueDetectedAt) 없음
//   · 시험 고객(isSandbox — TestFlight·Play 라이선스 테스터) 제외 · 가족 공유 제외 · 스토어=기기
//   · 만료가 «최근»(TRIAL_EXPIRED_RECENT_MS 안) — 오래전 만료자에게 갑자기 뜨지 않는다
//   · 체험 기간당 한 번(기기 저장 «기간|현지 날짜») · 오늘 체험 시트(D-3·조기)를 이미 봤으면 내일로(하루 1회 상한 공유)
// 원칙: 실제 값만(기기의 내 종목 수·사용일 기록·운영 실적 채점). 없으면 줄을 지운다. 가격은 페이월이 스토어 문자열로만.
// ============================================================================
import type { CustomerInfo } from '@revenuecat/purchases-capacitor';
import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import type { TrialStore } from '@/lib/app/trialConsent';
import { localDayKey } from '@/lib/app/trialRenewalOff';
import { FREE_LIMIT, MAX_ITEMS } from '@/lib/app/watchlist';
import { toTrialSaveLocale, trialEndDateText } from '@/lib/app/trialSaveDate';
import type { TrialScorecard } from '@/lib/app/trialSave';
import { FREE_ROWS } from '@/lib/guruLens/access';

export const TRIAL_EXPIRED_STORAGE_KEY = 'signumhq.trialExpired.v1';
/** 만료 뒤 이 기간 안에 앱을 연 사람만(그 뒤엔 «막 만료»가 아니다) */
export const TRIAL_EXPIRED_RECENT_MS = 14 * 24 * 60 * 60 * 1000;
/** 대가 렌즈 PRO 순위 수(ProPaywall «대가 렌즈 순위 10위까지(무료는 3위)»와 같은 값) */
export const PRO_LENS_ROWS = 10;

export type TrialExpiredNotice = { store: TrialStore; startedAt: number; expiresAt: number; period: string; mark: string };
/** 같은 날 다른 체험 시트를 봤는지 — trialRenewalOff 의 두 저장 표식(«기간|날짜») */
export type TrialSheetMarks = { offSeen: string | null; early: string | null };

function markDay(mark: string | null | undefined): string | null {
  const i = mark ? mark.lastIndexOf('|') : -1;
  return mark && i >= 0 ? mark.slice(i + 1) : null;
}
function markPeriod(mark: string | null | undefined): string | null {
  if (!mark) return null;
  const i = mark.lastIndexOf('|');
  return i >= 0 ? mark.slice(0, i) : mark;
}

type Info = Pick<CustomerInfo, 'entitlements'> & Partial<Pick<CustomerInfo, 'activeSubscriptions'>>;

export function trialExpiredNotice(info: Info | null | undefined, platform: string, now: number, seen: string | null, day: string = localDayKey(now), marks: TrialSheetMarks = { offSeen: null, early: null }): TrialExpiredNotice | null {
  if (!info || !Number.isFinite(now)) return null;
  // 지금 PRO(유료·평생·체험·코드 체험)거나 활성 구독이 하나라도 있으면 «만료자»가 아니다
  if (info.entitlements?.active?.[PRO_ENTITLEMENT_ID]) return null;
  if (Array.isArray(info.activeSubscriptions) && info.activeSubscriptions.length > 0) return null;
  const pro = info.entitlements?.all?.[PRO_ENTITLEMENT_ID];
  if (!pro || pro.isActive !== false || pro.periodType !== 'TRIAL' || pro.willRenew !== false) return null;
  if (pro.billingIssueDetectedAt || pro.isSandbox === true || pro.ownershipType === 'FAMILY_SHARED') return null;
  const store = pro.store;
  if (!((store === 'APP_STORE' && platform === 'ios') || (store === 'PLAY_STORE' && platform === 'android'))) return null;
  const startedAt = Date.parse(pro.latestPurchaseDate ?? '');
  const expiresAt = Date.parse(pro.expirationDate ?? '');
  if (!Number.isFinite(startedAt) || !Number.isFinite(expiresAt) || expiresAt <= startedAt || expiresAt > now || now - expiresAt > TRIAL_EXPIRED_RECENT_MS) return null;
  const period = `${startedAt}:${expiresAt}`;
  if (markPeriod(seen) === period) return null;                                   // 이 체험 기간에 이미 봤다
  if (markDay(marks.offSeen) === day || markDay(marks.early) === day) return null; // 오늘 체험 시트를 봤다 → 내일
  return { store, startedAt, expiresAt, period, mark: `${period}|${day}` };
}

/** 첫 읽기(캐시일 수 있음)와 새로 읽기(캐시 비운 뒤)가 같은 만료 기간을 가리킬 때만 */
export function verifiedTrialExpiredNotice(initial: Info, fresh: Info, platform: string, now: number, seen: string | null, day: string = localDayKey(now), marks?: TrialSheetMarks): TrialExpiredNotice | null {
  const a = trialExpiredNotice(initial, platform, now, seen, day, marks);
  const b = trialExpiredNotice(fresh, platform, now, seen, day, marks);
  return a && b && a.period === b.period && a.store === b.store ? b : null;
}

/** 체험 기간(기기 현지 날짜 기준, 양 끝 포함) 안의 «서로 다른 사용일» 수 — 기록(JSON 배열 YYYY-MM-DD)이 없거나 깨졌으면 0 */
export function trialUsageDays(raw: string | null | undefined, startedAt: number, expiresAt: number): number {
  let days: unknown;
  try { days = JSON.parse(raw || '[]'); } catch { return 0; }
  if (!Array.isArray(days)) return 0;
  const from = localDayKey(startedAt), to = localDayKey(expiresAt);
  return new Set(days.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to)).size;
}
/** 사용일 줄은 이틀 이상일 때만(하루는 «쓴 것»이라 말하기 어렵다) */
export const TRIAL_USAGE_MIN_DAYS = 2;

const COPY = {
  ko: {
    title: (d: string) => `PRO 무료 체험이 ${d}에 끝났어요`,
    lede: '지금은 무료 플랜이에요. 요금제를 고르면 체험 때처럼 다시 씁니다.',
    used: '체험 동안',
    days: (n: number) => `${n}일 동안 SIGNUM을 열었어요`,
    watch: (n: number) => `내 종목 ${n}개를 담았어요`,
    scorecard: (c: TrialScorecard) => `${c.previous ? '지난주' : '이번 주'} 실적 채점: ${c.n}종목 중 ${c.within}종목이 발표 전 예상 변동폭 안`,
    lost: '무료 플랜에서 달라지는 것',
    watchMany: (n: number) => `담아 둔 내 종목 ${n}개 — 무료는 ${FREE_LIMIT}개까지라 더 담을 수 없어요`,
    watchLimit: `내 종목은 ${FREE_LIMIT}개까지 (PRO ${MAX_ITEMS}개)`,
    data: 'AI 분석·기관 보유는 광고를 본 뒤 1시간씩 열려요',
    lens: `대가 렌즈 순위는 ${FREE_ROWS}위까지 (PRO ${PRO_LENS_ROWS}위)`,
    ads: '배너·전면 광고가 다시 나와요',
    cta: 'PRO 다시 시작하기',
  },
  en: {
    title: (d: string) => `Your PRO free trial ended ${d}`,
    lede: 'You’re on the free plan now. Pick a plan to use PRO the way you did in your trial.',
    used: 'During your trial',
    days: (n: number) => `You opened SIGNUM on ${n} days`,
    watch: (n: number) => `You added ${n} ${n === 1 ? 'stock' : 'stocks'} to your watchlist`,
    scorecard: (c: TrialScorecard) => `${c.previous ? 'Last week' : 'This week'}’s earnings scorecard: ${c.within} of ${c.n} stocks moved within the expected range`,
    lost: 'What changes on the free plan',
    watchMany: (n: number) => `${n} stocks in your watchlist — the free plan holds ${FREE_LIMIT}, so you can’t add more`,
    watchLimit: `Watchlist holds ${FREE_LIMIT} stocks (${MAX_ITEMS} with PRO)`,
    data: 'AI analysis and institutional holdings open for 1 hour after an ad',
    lens: `Investor Lenses: top ${FREE_ROWS} only (PRO: top ${PRO_LENS_ROWS})`,
    ads: 'Banner and full-screen ads come back',
    cta: 'Get PRO back',
  },
  ja: {
    title: (d: string) => `PROの無料体験は${d}に終了しました`,
    lede: '現在は無料プランです。プランを選ぶと、体験中と同じように使えます。',
    used: '体験中に',
    days: (n: number) => `${n}日間SIGNUMを開きました`,
    watch: (n: number) => `マイ銘柄を${n}銘柄登録しました`,
    scorecard: (c: TrialScorecard) => `${c.previous ? '先週' : '今週'}の決算採点：${c.n}銘柄中${c.within}銘柄が発表前の想定変動幅内`,
    lost: '無料プランで変わること',
    watchMany: (n: number) => `登録中のマイ銘柄${n}銘柄 — 無料は${FREE_LIMIT}銘柄までのため追加できません`,
    watchLimit: `マイ銘柄は${FREE_LIMIT}銘柄まで（PROは${MAX_ITEMS}銘柄）`,
    data: 'AI分析・機関保有は広告視聴後に1時間ずつ開きます',
    lens: `投資家レンズは${FREE_ROWS}位まで（PROは${PRO_LENS_ROWS}位）`,
    ads: 'バナー広告・全画面広告が再び表示されます',
    cta: 'PROを再開する',
  },
} as const;

export function trialExpiredCopy(locale: string) { return COPY[toTrialSaveLocale(locale)]; }

/** 페이월 머리·두 묶음(실제 값만 — 없는 값의 줄은 빠진다). 화면(ProPaywall context)과 시험이 같은 결과를 쓴다 */
export type TrialExpiredContext = { title: string; lede: string; cta: string; sections: { label: string; items: string[] }[] };
export function trialExpiredContext(locale: string, v: { expiresAt: number; usageDays: number; watchCount: number; score: TrialScorecard | null }): TrialExpiredContext {
  const c = trialExpiredCopy(locale);
  const used: string[] = [];
  if (Number.isInteger(v.usageDays) && v.usageDays >= TRIAL_USAGE_MIN_DAYS) used.push(c.days(v.usageDays));
  if (Number.isInteger(v.watchCount) && v.watchCount > 0) used.push(c.watch(v.watchCount));
  if (v.score && Number.isInteger(v.score.n) && v.score.n > 0 && Number.isInteger(v.score.within) && v.score.within >= 0 && v.score.within <= v.score.n) used.push(c.scorecard(v.score));
  const lost = [Number.isInteger(v.watchCount) && v.watchCount > FREE_LIMIT ? c.watchMany(v.watchCount) : c.watchLimit, c.data, c.lens, c.ads];
  return {
    title: c.title(trialEndDateText(v.expiresAt, locale).replace(/ /g, ' ')),
    lede: c.lede,
    cta: c.cta,
    sections: [...(used.length ? [{ label: c.used, items: used }] : []), { label: c.lost, items: lost }],
  };
}
