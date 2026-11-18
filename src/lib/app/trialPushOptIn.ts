// ============================================================================
// 체험자 알림 권한 다시 묻기 (2026-11-18) — 순수 모듈(판정기 TrialPushOptInGate · 시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜: 첫 실행 알림 단계에서 «나중에»를 고른 사람은 그 뒤 OS 권한 창을 볼 길이 없다(재실행은 «이미 허용»일 때만 재등록).
//   7일 체험 중 해지의 큰 몫이 D0~D1 에 몰린다(RC 2026, 해지 건 중 비중) → 체험 첫 가치 순간에 업계 표준 «사전 설명 시트» 한 번.
//   설계: signum-work/2026-11-17/trial-push-optin/RESULT.md
// 보이는 조건(전부 참일 때만 — 하나라도 모르면 안 보인다):
//   · 네이티브 앱 · RC 'pro' 가 활성이고 periodType 'TRIAL' · 만료 시각이 미래(검증된 체험)
//   · OS 알림 권한이 'prompt'(미결정) — 'denied'·'granted'·'prompt-with-rationale'(안드: 한 번 거절)·모름 = 안 보인다
//   · 첫 실행·결제·다른 시트(aria-modal)·게이트 흐름이 없음 · 앱이 앞에 있음 · 앱 화면 경로(설정·문서 아님)
//   · 앱 설정에서 알림(전체·모닝)을 직접 끄지 않았음
//   · 이 기기에서 본 적 없음 — 보이기 «직전» 기록하고 다시 읽어 확인. 저장 실패 = 안 보인다
// 언제: ① 내 종목에서 실제 ✦AI 한 줄이 처음 화면에 그려졌을 때(tpush_ai) ② 그게 없으면 체험 시작 «다음 날»(기기 현지 날짜) 이후 앱을 열었을 때(tpush_day1)
//   판정기는 자격(검증된 체험 + OS prompt)이 확인된 기기에서만, 앱이 앞에 있는 동안 1.5초 박자로 화면 상태만 본다 — 같은 조건 2박자 연속이면 보인다
// 수락: 자격·권한을 다시 보고 여전히 'prompt' 일 때만 requestPermissions() 한 번 → 허용이면 기존 등록 경로(첫 실행과 같은 함수).
// 계측: 닫힌 목록(funnelSchema) trial_push_shown·accept·os_granted·os_denied·dismiss × 출처 tpush_ai·tpush_day1 — 하루 합계만, 식별자 없음.
// ============================================================================

import { PRO_ENTITLEMENT_ID } from '@/config/iap';

export const TRIAL_PUSH_OPTIN_KEY = 'signumhq.trialPushOptIn.v1.shown';
/** 첫 실행 완료 표식(AppFirstRunOnboarding STORAGE_KEY 와 같은 값) */
export const ONBOARDED_KEY = 'signumhq.app.onboarding.v1';
/** 내 종목 화면이 «실제 AI 한 줄을 그렸다»고 알리는 창 이벤트 */
export const TRIAL_VALUE_EVENT = 'sg:trial-value-ai';
/** 실제(예시 행 아님) 종목 행의 AI 한 줄 칸에 붙는 표식 — 화면 안에 보이는지 판정기가 본다(모양 변화 없음) */
export const WL_AI_ATTR = 'data-wl-ai';
/** 결제·체험 직후 평점 요청(ReviewPromptMoments — 성공 4초 뒤)과 겹치지 않게 이만큼은 비켜 준다 */
export const RATING_PRO_PENDING_KEY = 'signum.rating.proPendingAt';
export const AFTER_PRO_QUIET_MS = 15_000;
/** 판정기 박자 — 자격(검증된 체험 + OS prompt)이 확인된 기기에서만, 앱이 앞에 있는 동안 DOM·저장소만 본다(네트워크 없음) */
export const TICK_MS = 1_500;
/** 'show' 가 이만큼 연달아 나와야 보인다(다른 시트가 자리 잡을 시간 · 막 그려진 줄이 바로 사라지는 경우 거르기) */
export const SHOW_STREAK = 2;
/** 권한·고객 정보를 다시 읽는 최소 간격(트리거가 잦아도 SDK 호출을 묶는다) */
export const REFRESH_MIN_MS = 30_000;
/** 고객 정보 조회 상한 — 넘으면 이번 회차는 안 보인다 */
export const VERIFY_MS = 3_000;

export type Trigger = 'ai' | 'day1';
export type TrialPushSrc = 'tpush_ai' | 'tpush_day1';
export const triggerSrc = (t: Trigger): TrialPushSrc => (t === 'ai' ? 'tpush_ai' : 'tpush_day1');

export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** OS 권한 상태 — 플러그인 값 그대로가 아니면 'unknown'(추정하지 않는다) */
export type PermState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unknown';
export function normPerm(x: unknown): PermState {
  const r = (x as { receive?: unknown } | null | undefined)?.receive;
  return r === 'prompt' || r === 'prompt-with-rationale' || r === 'granted' || r === 'denied' ? r : 'unknown';
}

// ── 1회 상한 ─────────────────────────────────────────────────────────────
/** 이 기기에서 이미 봤나 — 저장소가 없거나 던지면 «봤다»(안 보인다) */
export function readShown(store: MiniStore | null): boolean {
  try { return !store || store.getItem(TRIAL_PUSH_OPTIN_KEY) !== null; } catch { return true; }
}
/** 보였다고 적는다 — 다시 읽어 같은 값인지 확인. 실패면 false(호출자는 보이지 않는다) */
export function claimShown(store: MiniStore | null, now = Date.now()): boolean {
  try {
    if (!store || store.getItem(TRIAL_PUSH_OPTIN_KEY) !== null) return false;
    const v = String(now);
    store.setItem(TRIAL_PUSH_OPTIN_KEY, v);
    return store.getItem(TRIAL_PUSH_OPTIN_KEY) === v;
  } catch { return false; }
}

// ── 체험 판정(좁게) ──────────────────────────────────────────────────────
export type TrialInfo = { expiresAt: number; startedAt: number | null };
type EntLike = { isActive?: unknown; periodType?: unknown; expirationDate?: unknown; latestPurchaseDate?: unknown };
type InfoLike = { entitlements?: { active?: Record<string, EntLike | undefined> | null } | null } | null | undefined;

/**
 * 활성 'pro' 가 «검증된 체험»이면 만료·시작 시각, 아니면 null.
 *   isActive === true · periodType === 'TRIAL' · 만료 시각이 미래. 시작 시각(latestPurchaseDate)은 다음 날 판정에만 — 없거나 이상하면 null(그 경로는 쓰지 않는다).
 */
export function trialFromInfo(info: InfoLike, now: number): TrialInfo | null {
  const pro = info?.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  if (!pro || pro.isActive !== true || pro.periodType !== 'TRIAL') return null;
  const expiresAt = typeof pro.expirationDate === 'string' ? Date.parse(pro.expirationDate) : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const s = typeof pro.latestPurchaseDate === 'string' ? Date.parse(pro.latestPurchaseDate) : NaN;
  const startedAt = Number.isFinite(s) && s <= now + 60_000 ? s : null;
  return { expiresAt, startedAt };
}

/** 기기 현지 날짜 YYYY-MM-DD */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** 체험 시작 «다음 날»(현지 달력) 이후인가 — 시작 시각을 모르면 false(추정하지 않는다) */
export function nextDayDue(startedAt: number | null, now: number): boolean {
  if (startedAt == null || !Number.isFinite(startedAt)) return false;
  return dayOf(now) > dayOf(startedAt);
}

/** 앱 설정에서 알림을 직접 껐나(전체 또는 모닝) — 설정 화면이 저장한 값만 본다(없으면 끄지 않은 것) */
export function prefsOff(p: { enabled?: boolean; morning?: boolean } | null | undefined): boolean {
  return !!p && (p.enabled === false || p.morning === false);
}

/** 앱 화면 경로인가 — 문서·첫 실행 화면·설정에서는 띄우지 않는다(trialAnnounceRouteOk 와 같은 규칙) */
export function routeOk(path: string): boolean {
  if (!/\/app-view(\/|$)/.test(path)) return false;
  return !/\/app-view\/(terms|privacy|onboarding|settings)(\/|$)/.test(path);
}

/** 결제·체험 성공 직후(평점 요청 창)인가 */
export function inProQuiet(store: MiniStore | null, now: number): boolean {
  try {
    const at = Number(store?.getItem(RATING_PRO_PENDING_KEY)) || 0;
    return at > 0 && now - at >= 0 && now - at < AFTER_PRO_QUIET_MS;
  } catch { return false; }
}

// ── 자격 행렬 ────────────────────────────────────────────────────────────
export type TrialPushState = {
  native: boolean;
  /** 이미 봤음(또는 저장소 읽기 불가) */
  shown: boolean;
  /** 앱 설정에서 알림을 껐음 */
  prefsOff: boolean;
  perm: PermState;
  /** 검증된 활성 체험(조회 실패·만료·체험 아님 = null) */
  trial: TrialInfo | null;
  trigger: Trigger;
  now: number;
  /** 첫 실행 흐름을 마침(표식 'accepted') */
  onboarded: boolean;
  /** 다른 시트·결제 창(aria-modal)이 떠 있다 */
  dialogOpen: boolean;
  /** 결제 진행 중 */
  purchasePending: boolean;
  /** 게이트 흐름(광고 준비·대체 창) 진행 중 */
  gateFlow: boolean;
  /** 앱이 앞에 있다 */
  visible: boolean;
  /** 앱 화면 경로 */
  routeOk: boolean;
  /** 결제·체험 성공 직후 평점 창 */
  proQuiet: boolean;
  /** (ai) 실제 AI 한 줄이 지금 화면 안에 보인다 */
  aiVisible: boolean;
};

/**
 * 'stop' = 이번 실행은 끝(권한이 정해졌거나 이미 봤다·웹) · 'skip' = 이 회차는 대상 아님(다음 트리거에 다시) ·
 * 'later' = 잠시 뒤 다시(다른 시트·결제·화면 밖) · 'show' = 기록 후 보인다
 */
export function trialPushStep(s: TrialPushState): 'stop' | 'skip' | 'later' | 'show' {
  if (!s.native || s.shown) return 'stop';
  if (s.perm === 'granted' || s.perm === 'denied' || s.perm === 'prompt-with-rationale') return 'stop';
  if (s.perm !== 'prompt') return 'skip';
  if (s.prefsOff) return 'skip';
  if (!s.trial || s.trial.expiresAt <= s.now) return 'skip';
  if (s.trigger === 'day1' && !nextDayDue(s.trial.startedAt, s.now)) return 'skip';
  if (!s.onboarded || s.dialogOpen || s.purchasePending || s.gateFlow || !s.visible || !s.routeOk || s.proQuiet) return 'later';
  if (s.trigger === 'ai' && !s.aiVisible) return 'later';
  return 'show';
}

/**
 * 한 박자의 판정 — 첫 가치 순간(AI 줄이 지금 화면에 보임)이 우선, 아니면 «다음 날» 대체 경로.
 *   valueSeen = 이번 실행에 내 종목이 실제 AI 줄을 그린 적 있음(noteTrialValueMoment).
 *   AI 가 'later'(줄이 화면 밖 등)여도 다음 날 조건이 맞으면 다음 날로 보인다 — 출처는 실제로 보인 경로.
 */
export function tickStep(s: Omit<TrialPushState, 'trigger'>, valueSeen: boolean): { step: 'stop' | 'skip' | 'later' | 'show'; trigger: Trigger } {
  const ai = valueSeen ? trialPushStep({ ...s, trigger: 'ai' }) : 'skip';
  if (ai === 'stop' || ai === 'show') return { step: ai, trigger: 'ai' };
  const d1 = trialPushStep({ ...s, trigger: 'day1' });
  if (d1 === 'stop' || d1 === 'show') return { step: d1, trigger: 'day1' };
  if (ai === 'later') return { step: 'later', trigger: 'ai' };
  return { step: d1, trigger: 'day1' };
}

/** 연속 'show' 박자 수 — 같은 트리거로 이어질 때만 센다(트리거가 바뀌거나 막히면 0부터) */
export function nextStreak(prev: { n: number; trigger: Trigger | null }, cur: { step: string; trigger: Trigger }): { n: number; trigger: Trigger | null } {
  if (cur.step !== 'show') return { n: 0, trigger: null };
  return prev.trigger === cur.trigger ? { n: prev.n + 1, trigger: cur.trigger } : { n: 1, trigger: cur.trigger };
}

// ── 수락 ────────────────────────────────────────────────────────────────
export type AcceptOutcome = 'granted' | 'denied' | 'prompt' | 'unknown' | 'skipped';
/**
 * [알림 켜기] — 자격을 다시 보고 권한이 «여전히 prompt» 일 때만 요청을 «한 번» 부른다.
 *   requestAndRegister = 첫 실행과 같은 함수(AppFirstRunOnboarding requestPushAndRegister: requestPermissions → 허용이면 등록 경로).
 *   그 함수는 허용 아님을 'denied' 로 뭉치므로, 그때만 권한을 다시 읽어 실제 거절과 «창을 밀어 닫음(prompt)»을 가른다.
 */
export async function runTrialPushAccept(d: {
  /** 지금도 대상인가 — 새 고객 정보로 활성 TRIAL 을 다시 본다(실패·시간 초과 = false) */
  stillEligible: () => boolean | Promise<boolean>;
  checkPerm: () => Promise<PermState>;
  requestAndRegister: () => Promise<'granted' | 'denied' | 'na'>;
}): Promise<AcceptOutcome> {
  let ok = false;
  try { ok = (await d.stillEligible()) === true; } catch { ok = false; }
  if (!ok) return 'skipped';
  const before = await d.checkPerm().catch((): PermState => 'unknown');
  if (before !== 'prompt') return 'skipped';
  let r: 'granted' | 'denied' | 'na';
  try { r = await d.requestAndRegister(); } catch { return 'unknown'; }
  if (r === 'granted') return 'granted';
  if (r === 'na') return 'unknown';
  const after = await d.checkPerm().catch((): PermState => 'unknown');
  return after === 'denied' || after === 'prompt-with-rationale' ? 'denied' : after === 'prompt' ? 'prompt' : 'unknown';
}

/** 수락 결과 → 퍼널 단계(허용·거절만 센다 — 밀어 닫음·모름은 accept 에서 빠진 수로 본다) */
export function outcomeStage(o: AcceptOutcome): 'trial_push_os_granted' | 'trial_push_os_denied' | null {
  return o === 'granted' ? 'trial_push_os_granted' : o === 'denied' ? 'trial_push_os_denied' : null;
}

// ── 첫 가치 순간 신호 ────────────────────────────────────────────────────
let valueAt = 0;
/** 내 종목 화면이 실제 종목의 AI 한 줄을 그렸다 — 판정기가 아직 안 실렸어도 남겨 둔다(같은 웹뷰 실행 안) */
export function noteTrialValueMoment(now = Date.now()): void {
  if (!valueAt) valueAt = now;
  try { window.dispatchEvent(new Event(TRIAL_VALUE_EVENT)); } catch { /* 서버·옛 웹뷰 */ }
}
export function trialValueSeen(): boolean { return valueAt > 0; }
export function _resetTrialValueForTest(): void { valueAt = 0; }

/** 화면 안에 실제 AI 한 줄이 보이나(높이 있음 · 위아래로 화면 안에 걸침) */
export function aiLineVisible(doc: { querySelectorAll: (q: string) => ArrayLike<{ getBoundingClientRect(): { top: number; bottom: number; height: number } }> }, viewportH: number): boolean {
  try {
    const els = doc.querySelectorAll(`[${WL_AI_ATTR}]`);
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (r.height > 0 && r.bottom > 0 && r.top < viewportH) return true;
    }
  } catch { /* noop */ }
  return false;
}

// ── 문구(새 문구는 제목·한 줄·버튼 둘만 — 나머지는 첫 실행 알림 단계 그대로) ──
export const TRIAL_PUSH_COPY = {
  // 한 줄은 실제 모닝 푸시와 맞춘다 — 본문은 그날 AI 모닝 브리핑(시장) 첫 문장, 없으면 «프리마켓 시장 브리프가 준비됐습니다»(api/cron/push · lib/push/send PUSH_CONTENT.morning).
  //   «내 종목 요약»은 보내지 않으므로 약속하지 않는다 · 두 본문 모두에 맞게 «브리핑을 알려 드린다»로(관문 1·2차 · 애플 5.6)
  ko: { title: '아침 AI 브리핑 받기', subtitle: '장 시작 전 AI 시장 브리핑을 알림으로 알려드려요', allow: '알림 켜기', later: '나중에' },
  en: { title: 'Get the morning AI briefing', subtitle: 'We’ll notify you about the AI market brief before the open', allow: 'Turn on notifications', later: 'Not now' },
  ja: { title: '朝のAIブリーフを受け取る', subtitle: '取引開始前にAI市場ブリーフを通知でお知らせします', allow: '通知をオンにする', later: 'あとで' },
} as const;
export type TrialPushLoc = keyof typeof TRIAL_PUSH_COPY;
export const trialPushCopy = (loc: string) => TRIAL_PUSH_COPY[(loc === 'ko' || loc === 'ja' ? loc : 'en') as TrialPushLoc];
