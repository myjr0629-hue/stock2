// ============================================================================
// 체험 중 «가치 알림» 2통(3일째 · 6일째) — 순수 규칙(발송 크론 /api/cron/trial-push · 보고 API /api/push/trial · 시험이 같이 쓴다) (2026-11-19)
// ----------------------------------------------------------------------------
// 왜: 11/12~17 앱 안 7일 체험자 27명 중 해지 예정 23(85%) · 실결제 0. 체험 중 앱을 다시 열게 하는 알림이 없었다
//   (기존 trialPush 는 자동 갱신을 끈 사람에게 종료 D-2 사실 알림 1통뿐).
// 대상: RC 로 확인된(verified) 체험(TRIAL) 기록 · 체험 시작 시각(RC purchase_date)이 있는 기록만 · 자동 갱신 여부와 무관.
// 일정(체험 길이 L = 만료 − 시작, 둘 다 RC 값):
//   · 7일 체험(L ≤ 9일): «3일째»(시작 +2일 ~ +3일) · «6일째»(시작 +5일 ~ +6일 — 애플이 갱신 결제를 하는 마지막 24시간 «전»)
//   · 1개월 코드 체험(9일 < L ≤ 40일): «7일째»(시작 +6일 ~ +7일 — 첫 주 습관 형성 점검) · «만료 6~5일 전»(30일이면 25일째)
//       근거: 코드 체험은 결제 의사 없이 받은 사람이 많아 3일째는 너무 이르고(첫 주 안 재방문이 갈림), 결제 판단 직전 재방문이 중요하다.
//       5일 전이면 D-2 사실 알림(남은 12~48시간)과 사흘 이상 떨어지고, 스토어 갱신 결제 창(마지막 24시간)보다 충분히 앞이다.
//   · 그 밖 길이(4일 미만·40일 초과)는 보내지 않는다. 각 창은 24시간 — 매시 크론 + 현지 09~21시 + «6시간 안에 앱을 열었으면 미룸».
// 안 보내는 경우: 이미 보냄(토큰·RC 고객 단위, 단계별) · 같은 고객에게 20시간 안에 체험 알림(D-2 포함)을 보냄
//   · 자동 갱신 꺼짐이고 남은 시간 48시간 이하(= D-2 사실 알림 차례 — 같은 날 두 통 금지) · 알림 전체/해당 종류(아침·마감)를 끔
//   · iOS 는 시스템 알림 권한이 «허용»으로 보고된 기기만(애플 4.5.4 — 이미 동의한 사람만) · 안드는 권한 «없음» 보고면 제외.
// 문구: 사실·기능만. 가격·긴급함·투자 권유·방향 예측 없음.
// 끄기: Redis `trial-value-push:off` = '1'(크론 ?valueOff=1 로 켜고 ?valueOff=0 으로 끈다 — 인증 필요) · 한 회차만 빼기 ?value=0.
// ============================================================================
import { fallbackTimeZone, localHourIn, TRIAL_PUSH_HOURS, TRIAL_PUSH_MAX_MS, TRIAL_PUSH_RECENT_OPEN_MS, type TrialPushRecord } from '@/lib/push/trialPush';
import { toTrialSaveLocale } from '@/lib/app/trialSaveDate';
import { TRIAL_VALUE_PUSH_TYPE, TRIAL_VALUE_TAP_PATHS, trialValueTapPath, type TrialValueVariant } from '@/lib/app/trialValueTap';

const DAY = 86400_000;

/** 가치 알림 대상 목록(점수 = 만료 시각 — 지난 만료는 크론이 걷는다). 보고 API 가 «확인된 체험»을 쓸 때 넣는다 */
export const TRIAL_VALUE_ZSET = 'push:trial:value';
/** 끄기 스위치(다른 기능의 `<기능>:off` 관례) */
export const TRIAL_VALUE_OFF_KEY = 'trial-value-push:off';
export type TrialValueStep = 'd3' | 'd6';
/** «보냄» 표식 — 단계별 · 토큰/RC 고객 단위. 체험 최장(40일)보다 길게 둔다 */
export const TRIAL_VALUE_SENT_KEY = (step: TrialValueStep, token: string) => `push:trial:v:${step}:sent:${token}`;
export const TRIAL_VALUE_SENT_UID_KEY = (step: TrialValueStep, uidHash: string) => `push:trial:v:${step}:sentuid:${uidHash}`;
export const TRIAL_VALUE_SENT_TTL_S = 45 * 86400;
/** 같은 RC 고객에게 체험 알림(D-2 · 가치) 마지막 발송 표식 — 이 시간 안에는 가치 알림을 더 보내지 않는다(하루 두 통 금지) */
export const TRIAL_PUSH_LAST_UID_KEY = (uidHash: string) => `push:trial:last:${uidHash}`;
export const TRIAL_PUSH_GAP_S = 20 * 3600;
/** 상한 — D-2 와 따로 센다(가치 알림이 D-2 사실 알림 자리를 먹지 않게) */
export const TRIAL_VALUE_MAX_PER_RUN = 100;
export const TRIAL_VALUE_MAX_PER_DAY = 300;
export const TRIAL_VALUE_DAY_KEY = (etDay: string) => `push:trial:vday:${etDay}`;
export const TRIAL_VALUE_SCAN_LIMIT = 1000;
export const TRIAL_VALUE_SCAN_PAGES = 5;
/** 7일 체험으로 보는 최대 길이 · 받아 주는 체험 길이 범위 */
export const TRIAL_VALUE_SHORT_MAX_MS = 9 * DAY;
export const TRIAL_VALUE_MIN_LEN_MS = 4 * DAY;
export const TRIAL_VALUE_MAX_LEN_MS = 40 * DAY;
/** 스토어가 갱신 결제를 하는 마지막 24시간 — 이 안에는 가치 알림을 보내지 않는다 */
export const TRIAL_VALUE_END_GUARD_MS = DAY;

export interface TrialValueWindow { step: TrialValueStep; from: number; to: number }

/** 체험 시작·만료 → 두 단계의 창 [from, to). 받지 않는 길이면 빈 배열 */
export function trialValueSchedule(startedAt: number, expiresAt: number): TrialValueWindow[] {
  if (!Number.isFinite(startedAt) || !Number.isFinite(expiresAt)) return [];
  const len = expiresAt - startedAt;
  if (len < TRIAL_VALUE_MIN_LEN_MS || len > TRIAL_VALUE_MAX_LEN_MS) return [];
  const w: TrialValueWindow[] = len <= TRIAL_VALUE_SHORT_MAX_MS
    ? [{ step: 'd3', from: startedAt + 2 * DAY, to: startedAt + 3 * DAY }, { step: 'd6', from: startedAt + 5 * DAY, to: startedAt + 6 * DAY }]
    : [{ step: 'd3', from: startedAt + 6 * DAY, to: startedAt + 7 * DAY }, { step: 'd6', from: expiresAt - 6 * DAY, to: expiresAt - 5 * DAY }];
  const guard = expiresAt - TRIAL_VALUE_END_GUARD_MS;
  return w.map((x) => ({ ...x, to: Math.min(x.to, guard) })).filter((x) => x.to > x.from);
}

/** 지금 창이 열린 단계(없으면 null) */
export function trialValueStepAt(rec: Pick<TrialPushRecord, 'expiresAt' | 'startedAt'>, now: number): TrialValueWindow | null {
  if (typeof rec.startedAt !== 'number') return null;
  return trialValueSchedule(rec.startedAt, rec.expiresAt).find((x) => now >= x.from && now < x.to) ?? null;
}

export type TrialValueSkip = 'invalid' | 'unverified' | 'not_trial' | 'no_start' | 'window' | 'd2_overlap' | 'sent' | 'recent_push'
  | 'unregistered' | 'muted' | 'no_permission' | 'recent_open' | 'quiet_hours';

export type TrialValueTokenRec = {
  app?: string; platform?: string; preferences?: { enabled?: boolean; morning?: boolean; closing?: boolean } | null;
  notifPerm?: boolean; tz?: string; watchlist?: { t?: unknown } | null;
};

/** 지금 보낼까 — { send, step } 또는 안 보내는 이유. sent(step) = 그 단계를 이미 보냈나 · recentPush = 20시간 안에 체험 알림을 받았나 */
export function trialValueDecision(
  rec: TrialPushRecord | null,
  tokenRec: TrialValueTokenRec | null,
  now: number,
  state: { sent: (step: TrialValueStep) => boolean; recentPush: boolean },
): { kind: 'send'; step: TrialValueStep } | { kind: 'skip'; reason: TrialValueSkip } {
  const skip = (reason: TrialValueSkip) => ({ kind: 'skip' as const, reason });
  if (!rec || typeof rec.expiresAt !== 'number') return skip('invalid');
  // RC 로 확인된 기록만(옛 미확인 기록·기기 보고 그대로는 보내지 않는다)
  if (rec.verified !== true) return skip('unverified');
  if (rec.periodType !== 'TRIAL') return skip('not_trial');
  if (typeof rec.startedAt !== 'number') return skip('no_start');
  const w = trialValueStepAt(rec, now);
  if (!w) return skip('window');
  // 자동 갱신 꺼짐 + 남은 48시간 이하 = D-2 사실 알림 차례 → 가치 알림은 양보(같은 날 두 통 금지)
  if (w.step === 'd6' && rec.willRenew === false && rec.expiresAt - now <= TRIAL_PUSH_MAX_MS) return skip('d2_overlap');
  if (state.sent(w.step)) return skip('sent');
  if (state.recentPush) return skip('recent_push');
  if (!tokenRec || (tokenRec.app && tokenRec.app !== 'signum')) return skip('unregistered');
  if (tokenRec.platform && tokenRec.platform !== rec.platform) return skip('unregistered');
  const p = tokenRec.preferences;
  if (p && (p.enabled === false || (w.step === 'd3' ? p.morning === false : p.closing === false))) return skip('muted');
  // iOS: 시스템 권한 «허용»이 보고된 기기만(4.5.4) · 안드: «없음» 보고면 제외(13 미만은 권한 단계가 없다)
  if (rec.platform === 'ios' ? tokenRec.notifPerm !== true : tokenRec.notifPerm === false) return skip('no_permission');
  if (typeof rec.at === 'number' && now - rec.at < TRIAL_PUSH_RECENT_OPEN_MS) return skip('recent_open');
  const hour = localHourIn(now, tokenRec.tz || fallbackTimeZone(rec.locale)) ?? localHourIn(now, fallbackTimeZone(rec.locale));
  if (hour == null || hour < TRIAL_PUSH_HOURS[0] || hour >= TRIAL_PUSH_HOURS[1]) return skip('quiet_hours');
  return { kind: 'send', step: w.step };
}

/** 내 종목 첫 종목(서버 사본 — 기기가 올린 것) · 형식이 맞을 때만 */
export function firstWatchTicker(tokenRec: TrialValueTokenRec | null): string | null {
  const t = tokenRec?.watchlist?.t;
  const x = Array.isArray(t) ? t[0] : null;
  return typeof x === 'string' && /^[A-Z][A-Z0-9.-]{0,9}$/.test(x) ? x : null;
}

// 탭 목적지(닫힌 목록)는 앱과 같이 쓰는 lib/app/trialValueTap 에 있다
export { TRIAL_VALUE_PUSH_TYPE, TRIAL_VALUE_TAP_PATHS, trialValueTapPath, type TrialValueVariant };

// 문구: 기능·사실만(«준비됐다»·«오늘» 같은 단정 없음 — 주말·휴장일에도 틀리지 않게). 가격·긴급함·투자 권유·방향 예측 없음. 제목 이모지 없음.
const COPY = {
  d3: {
    ko: { title: (t: string) => `${t}, 무엇이 움직였는지 AI 한 줄로`, body: '탭하면 내 종목마다 최근 움직임을 AI가 한 줄로 정리한 해석을 볼 수 있어요.' },
    en: { title: (t: string) => `What moved ${t}? See the AI one-liner`, body: 'Tap to see a one-line AI read on the latest move for each stock in your watchlist.' },
    ja: { title: (t: string) => `${t}の動きをAIのひとことで`, body: 'タップすると、マイ銘柄ごとに直近の動きをAIがひとことで解説します。' },
  },
  d3b: {
    ko: { title: '미국 시장 AI 브리핑', body: '무엇이 왜 움직였는지 AI 브리핑에서 한눈에 볼 수 있어요.' },
    en: { title: 'Your AI brief on the US market', body: 'See what moved the US market and why, in one AI brief.' },
    ja: { title: '米国市場のAIブリーフィング', body: '何がなぜ動いたのか、AIブリーフィングでひと目で確認できます。' },
  },
  d6: {
    ko: { title: '미국 장 마감 리포트', body: '최근 장에서 무슨 일이 있었고 왜 움직였는지 지표와 함께 한 장으로 볼 수 있어요.' },
    en: { title: 'US market close report', body: 'See what happened in the latest session and why, with the key numbers on one page.' },
    ja: { title: '米国市場クロージングレポート', body: '直近の取引で何が起き、なぜ動いたのかを指標とともに1ページで確認できます。' },
  },
} as const;

export function trialValueContent(step: TrialValueStep, locale: string, tokenRec: TrialValueTokenRec | null): { variant: TrialValueVariant; title: string; body: string } {
  const loc = toTrialSaveLocale(locale);
  if (step === 'd6') return { variant: 'd6', ...COPY.d6[loc] };
  const t = firstWatchTicker(tokenRec);
  if (t) return { variant: 'd3', title: COPY.d3[loc].title(t), body: COPY.d3[loc].body };
  return { variant: 'd3b', ...COPY.d3b[loc] };
}

/** 푸시 데이터(문자열만 — FCM 규칙). 앱은 type·v 로 계측하고 닫힌 목록의 화면으로 간다 */
export function trialValueData(variant: TrialValueVariant): Record<string, string> {
  return { type: TRIAL_VALUE_PUSH_TYPE, v: variant, path: TRIAL_VALUE_TAP_PATHS[variant] };
}
