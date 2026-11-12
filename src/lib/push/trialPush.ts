// ============================================================================
// 체험 종료 D-2 푸시 — 순수 규칙(등록 라우트 /api/push/trial · 발송 크론 /api/cron/trial-push · 시험이 같이 쓴다) (2026-11-11)
// ----------------------------------------------------------------------------
// 대상: 앱이 보고한 «체험(TRIAL) 중 · 자동 갱신 꺼짐» 기기 하나당, 체험 하나당 «한 번». 남은 시간 12~48시간 사이.
// 안 보내는 경우: 갱신을 다시 켰다 · 이미 보냈다 · 알림 전체를 껐다(설정) · 시스템 알림 권한 없음 · 토큰이 더는 등록돼 있지 않다
//   · 6시간 안에 앱을 열었다(앱 안 카드를 이미 봤다 — 다음 회차에 다시 본다) · 기기 현지 시간 09~20시 밖(다음 회차에).
// 문구: 사실만(종료일 · 앱에서 요금제를 볼 수 있음). 갱신 상태는 단정하지 않는다. 가격·긴급함·투자 권유 없음.
// 식별자: 키는 이미 서버에 있는 푸시 토큰. ★11/12 대상에 넣는 보고만 RC 앱 사용자 ID 를 받아 RC 에서 확인한다(원문 저장 안 함 — lib/push/trialVerify).
// ============================================================================
import { trialEndDateText, toTrialSaveLocale } from '@/lib/app/trialSaveDate';

export const TRIAL_PUSH_KEY = (token: string) => `push:trial:${token}`;
/** «보냄» 표식 = 발송 «전에» SET NX 로 잡는 자리(동시 실행·저장 실패·함수 종료에도 두 번 가지 않는다). 기기(토큰)당 25일에 한 통 —
 *  1개월 체험은 한 기기에 25일 안에 두 번 생기지 않는다. 보고 API 로 만료일을 바꿔도 다시 보내지 않는다(남용 차단). */
export const TRIAL_PUSH_SENT_KEY = (token: string) => `push:trial:sent:${token}`;
export const TRIAL_PUSH_SENT_TTL_S = 25 * 86400;
/** 보고 API 호출 제한 — 토큰당 5초에 한 번 */
export const TRIAL_PUSH_RL_KEY = (token: string) => `push:trial:rl:${token}`;
/** 한 회차 최대 발송 수 · 하루(ET) 최대 «발송 시도» 수(INCR 로 먼저 예약 — 실패·소멸 토큰도 센다) · 한 쪽(page)에 읽는 대상 수(최대 5쪽)
 *  — 공급사·Redis 호출 상한(가짜 토큰 대량 등록 남용 대비).
 *  실제 규모: 10/12 이후 체험 138명(하루 시작 최대 20명대) → 하루 상한 300 은 실사용을 막지 않는다. */
export const TRIAL_PUSH_MAX_PER_RUN = 100;
export const TRIAL_PUSH_MAX_PER_DAY = 300;
export const TRIAL_PUSH_SCAN_LIMIT = 1000;
export const TRIAL_PUSH_SCAN_PAGES = 5;
export const TRIAL_PUSH_DAY_KEY = (etDay: string) => `push:trial:day:${etDay}`;
export const TRIAL_PUSH_DUE_ZSET = 'push:trial:due';
export const TRIAL_PUSH_MAX_MS = 48 * 3600_000;
export const TRIAL_PUSH_MIN_MS = 12 * 3600_000;
export const TRIAL_PUSH_RECENT_OPEN_MS = 6 * 3600_000;
/** 기기 현지 시각 [시작, 끝) — 이 밖이면 다음 회차까지 기다린다 */
export const TRIAL_PUSH_HOURS: readonly [number, number] = [9, 21];
/** 보고를 받아 주는 만료 시각 범위 — 지금부터 40일 안(1개월 체험 + 여유) */
export const TRIAL_PUSH_REPORT_HORIZON_MS = 40 * 86400_000;

export interface TrialPushRecord {
  token: string;
  platform: 'ios' | 'android';
  locale: 'ko' | 'en' | 'ja';
  expiresAt: number;
  willRenew: boolean;
  periodType: string;
  store: string;
  /** 마지막 보고(=앱을 연) 시각 */
  at: number;
  /** ★11/12 RC 에서 확인한 기록(보고 API 가 RC 값으로 쓴다). 없는 기록은 확인 이전(TRIAL_PUSH_VERIFY_SINCE 전) 것만 보낸다 */
  verified?: boolean;
}

/** ★11/12 야간 검토 ② — 이 시각 «뒤»에 쓰인 기록은 RC 확인 표식(verified)이 있어야 보낸다. 그 전 기록(확인 없는 옛 보고 API 가 쓴 것 — 이 배포의 운영 반영 기한 KST 17시. 새 API 는 대상 기록에 항상 verified 를 단다)은
 *  다음 앱 진입 때 확인된 기록으로 바뀌기 전까지 그대로 보낸다(첫 만료 11/12 — 앱을 열지 않는 사람의 D-2 푸시를 끊지 않게). */
export const TRIAL_PUSH_VERIFY_SINCE = Date.parse('2026-11-12T08:00:00Z');

/** 등록 요청 본문 → 저장할 레코드. 잘못된 값이면 null. («체험 끝남·유료 전환» 해제 요청 {clear:true} 은 라우트가 따로 처리) */
export function sanitizeTrialReport(body: unknown, now: number): TrialPushRecord | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const token = typeof b.token === 'string' ? b.token.trim() : '';
  if (!validPushToken(token)) return null;
  if (b.platform !== 'ios' && b.platform !== 'android') return null;
  const expiresAt = typeof b.expiresAt === 'number' ? b.expiresAt : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + TRIAL_PUSH_REPORT_HORIZON_MS) return null;
  if (typeof b.willRenew !== 'boolean') return null;
  const periodType = typeof b.periodType === 'string' ? b.periodType.slice(0, 16) : '';
  if (!['TRIAL', 'NORMAL', 'INTRO', 'PREPAID'].includes(periodType)) return null;
  const store = typeof b.store === 'string' ? b.store.slice(0, 24) : '';
  const rec: TrialPushRecord = {
    token, platform: b.platform, locale: toTrialSaveLocale(typeof b.locale === 'string' ? b.locale : 'en'),
    expiresAt, willRenew: b.willRenew, periodType, store, at: now,
  };
  return rec;
}

/** 이 레코드가 «보낼 대상 목록»(만료 시각 정렬)에 있어야 하나 */
export function trialPushWanted(rec: TrialPushRecord): boolean {
  return rec.periodType === 'TRIAL' && rec.willRenew === false;
}

/** 토큰 문자열 검사(보고·해제 공통) */
export function validPushToken(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= 512 && /^[A-Za-z0-9:_\-.]+$/.test(x);
}

/** 시간대의 현지 시(0~23). 잘못된 시간대면 null */
export function localHourIn(now: number, timeZone: string): number | null {
  try {
    const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date(now));
    const n = Number(h);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  } catch { return null; }
}

/** 기기 시간대가 없을 때(옛 등록) 언어로 짐작 */
export function fallbackTimeZone(locale: string): string {
  return locale === 'ko' ? 'Asia/Seoul' : locale === 'ja' ? 'Asia/Tokyo' : 'America/New_York';
}

export type TrialPushSkip = 'invalid' | 'unverified' | 'renewing' | 'sent' | 'window' | 'unregistered' | 'muted' | 'no_permission' | 'recent_open' | 'quiet_hours';

/** 지금 보낼까 — 'send' 또는 안 보내는 이유 */
export function trialPushDecision(
  rec: TrialPushRecord | null,
  tokenRec: { app?: string; platform?: string; preferences?: { enabled?: boolean } | null; notifPerm?: boolean; tz?: string } | null,
  now: number,
  alreadySent = false,
): 'send' | TrialPushSkip {
  if (!rec || typeof rec.expiresAt !== 'number') return 'invalid';
  if (rec.verified !== true && !(typeof rec.at === 'number' && rec.at < TRIAL_PUSH_VERIFY_SINCE)) return 'unverified';
  if (rec.periodType !== 'TRIAL' || rec.willRenew !== false) return 'renewing';
  if (alreadySent) return 'sent';
  const left = rec.expiresAt - now;
  if (!(left > TRIAL_PUSH_MIN_MS && left <= TRIAL_PUSH_MAX_MS)) return 'window';
  if (!tokenRec || (tokenRec.app && tokenRec.app !== 'signum')) return 'unregistered';
  if (tokenRec.platform && tokenRec.platform !== rec.platform) return 'unregistered';
  if (tokenRec.preferences && tokenRec.preferences.enabled === false) return 'muted';
  if (tokenRec.notifPerm === false) return 'no_permission';
  if (typeof rec.at === 'number' && now - rec.at < TRIAL_PUSH_RECENT_OPEN_MS) return 'recent_open';
  const hour = localHourIn(now, tokenRec.tz || fallbackTimeZone(rec.locale)) ?? localHourIn(now, fallbackTimeZone(rec.locale));
  if (hour == null || hour < TRIAL_PUSH_HOURS[0] || hour >= TRIAL_PUSH_HOURS[1]) return 'quiet_hours';
  return 'send';
}

// 본문은 «갱신 상태»를 단정하지 않는다(관문 11110920 — 앱을 열지 않은 채 스토어에서 갱신을 다시 켠 사람에게도 틀리지 않게).
//   «결제되지 않아요» 안내는 앱 안 시트(보이기 직전 새로 읽은 값)에서만 한다.
const PUSH_COPY = {
  ko: { title: (d: string) => `PRO 무료 체험이 ${d}에 끝나요`, body: '그 뒤에도 PRO를 쓰시려면 앱에서 요금제를 확인할 수 있어요.' },
  en: { title: (d: string) => `Your PRO free trial ends ${d}`, body: 'If you’d like to keep PRO after that, you can see the plans in the app.' },
  ja: { title: (d: string) => `PROの無料体験は${d}に終了します`, body: 'その後もPROを使う場合は、アプリでプランを確認できます。' },
} as const;

export function trialPushContent(rec: Pick<TrialPushRecord, 'locale' | 'expiresAt'>, timeZone?: string): { title: string; body: string } {
  const loc = toTrialSaveLocale(rec.locale);
  const c = PUSH_COPY[loc];
  return { title: c.title(trialEndDateText(rec.expiresAt, loc, timeZone || fallbackTimeZone(loc))), body: c.body };
}

/** 푸시 데이터(문자열만 — FCM 규칙). 앱은 type 으로 계측하고 대시보드로 간다 */
export const TRIAL_PUSH_DATA: Record<string, string> = { type: 'trial_end', path: '/app-view/dash' };
