// ============================================================================
// 첫 실행 «7일 무료 체험» 페이월 (2026-11-16 매출 스프린트 — 대표 «실질적으로 매출»)
// ----------------------------------------------------------------------------
// 첫 실행 흐름(법적 고지 → 가치(종목 고르기) → 알림)이 «끝난 직후» 닫을 수 있는 페이월을 기기마다 한 번 보인다(출처 first_run).
//   · 보이는 조건: 네이티브 · 결제 가능 · PRO 상태 받음 · PRO 아님(코드 PRO 포함) · 스토어 재조회도 무료 · 결제 진행 중 아님 ·
//     스토어가 «자격 확인된 무료 체험»을 준 플랜이 하나라도 있음(PlanOffer.trialDays) · 이 기기에서 처음.
//   · 하나라도 아니면 아무것도 안 그린다(예전과 똑같이 앱으로 들어간다). 체험 자격이 없는 사람에게 정가 페이월을 들이밀지 않는다.
//   · 기록(한 번)은 «보이기 직전»에 — 기록이 실패하면(저장소 막힘) 보이지 않는다(매 실행 반복 방지).
//   · ★11/20 «모름»(자격 조회 지연·오퍼링 0·재조회 실패)은 첫 세션 30초 안에서 다시 묻는다 — 아래 firstRunJudge.
// ============================================================================

export const FIRST_RUN_PAYWALL_KEY = 'signumhq.firstrun.trial_paywall.v1';
/** 오퍼링·PRO 상태를 기다리는 상한 — 넘으면 조용히 건너뛴다(앱 진입을 막지 않는다) */
export const FIRST_RUN_PAYWALL_WAIT_MS = 8_000;

export type FirstRunPaywallState = {
  iapAvailable: boolean;
  ready: boolean;
  isPro: boolean;
  /** 결제 진행 중(막 결제함) */
  pending: boolean;
  /** 공유 신호의 최신 스토어 응답이 PRO(gatePaywall storeProSignal.latest()) */
  sharedPro: boolean;
  offers: readonly { plan: string; trialDays?: number | null }[];
  /** 이 기기에서 이미 보였다 */
  shown: boolean;
};

/** 'wait' = 아직 모른다(PRO 상태·오퍼링 대기) · 'skip' = 안 보인다 · 'check' = 스토어 재조회 뒤 무료면 보인다 */
export function firstRunPaywallStep(s: FirstRunPaywallState): 'wait' | 'skip' | 'check' {
  if (s.shown) return 'skip';
  if (s.isPro || s.sharedPro || s.pending) return 'skip';
  if (!s.ready) return 'wait';
  if (!s.iapAvailable) return 'skip';
  if (!s.offers.some((o) => o.plan !== 'lifetime' && typeof o.trialDays === 'number' && o.trialDays > 0)) return 'skip';
  return 'check';
}

// ── ★11/20 도달 수리 — «모른다»를 «안 보인다»로 끝내지 않는다 + 왜 안 떴는지 센다 ─────────────────────────
// 실측(ET 11/16~19 iOS): 첫 실행 마침 32 → first_run 열림 12. 안 뜬 20 중 몇이 코드 PRO(정상 제외)이고 몇이 «모름»인지 셀 수단이 없었다.
//   ① 계측: 판정 시작(fr_try)과 결론 하나(아래 FirstRunSkip 또는 페이월 open)를 실행당 한 번 센다(출처 fr_* · 단계 fr_judge · 하루 합계만, 식별자 없음).
//   ② 재시도: iOS 체험 자격 «모름»(3초 초과·오류·UNKNOWN)·오퍼링 0·스토어 재조회 실패를 곧바로 포기하지 않는다 —
//      예전 상한(8초) 안에 정해지면 예전과 똑같이 바로 보이고, 못 정했으면 첫 세션 30초 안에서 다시 묻는다.
//      늦게 보일 때만 다른 시트·결제 창·게이트 흐름·다른 페이월이 없고 앱이 앞에 있고 앱 화면일 때 보인다(겹침 없음).
//   «자격 없음» 확정·PRO(코드 PRO 포함)·이미 봄은 예전처럼 곧바로 건너뛴다(정가 페이월을 들이밀지 않는다).

/** 첫 세션 안 재시도 상한(마운트부터) — 넘으면 조용히 끝(다음 실행에 기존 사용자 체험 안내 trial_announce 가 같은 조건으로 다시 본다) */
export const FIRST_RUN_PAYWALL_BUDGET_MS = 30_000;
/** 재시도 횟수 상한(각각) */
export const FIRST_RUN_TRIAL_TRIES = 3;
export const FIRST_RUN_OFFER_TRIES = 3;
export const FIRST_RUN_CHECK_TRIES = 3;
/** 스토어 재조회 한 번의 상한 */
export const FIRST_RUN_CHECK_TIMEOUT_MS = 4_000;

/** 안 보인 이유(퍼널 출처 fr_*) */
export type FirstRunSkip = 'fr_pro' | 'fr_seen' | 'fr_noiap' | 'fr_noelig' | 'fr_unk' | 'fr_nooffer' | 'fr_wait' | 'fr_chk' | 'fr_busy';
export const FIRST_RUN_SKIPS: readonly FirstRunSkip[] = ['fr_pro', 'fr_seen', 'fr_noiap', 'fr_noelig', 'fr_unk', 'fr_nooffer', 'fr_wait', 'fr_chk', 'fr_busy'];

type OfferLike = { plan: string; trialDays?: number | null; pkg?: { product?: { introPrice?: { price?: number } | null } | null } | null };

/** 체험이 붙은 플랜이 있나 */
export function hasTrialOffer(offers: readonly OfferLike[]): boolean {
  return offers.some((o) => o.plan !== 'lifetime' && typeof o.trialDays === 'number' && o.trialDays > 0);
}

/** iOS 무료 소개 오퍼 상품이 있나 — 있는데 체험이 안 붙었으면 «자격 없음» 또는 «모름»(다시 물어 가린다) */
export function iosTrialCandidate(platform: string, offers: readonly OfferLike[]): boolean {
  return platform === 'ios' && offers.some((o) => o.plan !== 'lifetime' && o.pkg?.product?.introPrice?.price === 0);
}

export type FirstRunJudgeState = FirstRunPaywallState & {
  platform: string;
  /** 직접 다시 물은 자격 결과 — null = 아직 안 물음 · true = 모름 · false = 확정(있음/없음은 offers 에 반영) */
  trialUnknown: boolean | null;
  trialTries: number;
  offerTries: number;
  /** ready 뒤 지난 시간(ms) — 오퍼링이 PRO 상태보다 조금 늦게 오는 것은 기다린다 */
  sinceReady: number;
};

export type FirstRunAction =
  | { kind: 'wait' }
  | { kind: 'skip'; reason: FirstRunSkip }
  | { kind: 'retry_offers' }
  | { kind: 'retry_trials' }
  | { kind: 'check' };

/** 오퍼링이 PRO 상태보다 늦게 오는 정상 지연 — 이만큼은 다시 묻지 않고 기다린다 */
export const FIRST_RUN_OFFER_GRACE_MS = 2_000;

/**
 * 한 번의 판정(순수). firstRunPaywallStep 의 «건너뜀» 규칙은 그대로이고, 예전에 «건너뜀»으로 끝나던 «모름» 두 갈래만 재시도로 바꾼다.
 *   · 오퍼링 0(ready·결제 가능·무료) → retry_offers(상한 뒤 fr_nooffer)
 *   · iOS 무료 소개 오퍼 상품이 있는데 체험 없음 → 아직 안 물었거나 «모름»이면 retry_trials(상한 뒤 fr_unk) · «확정»이면 fr_noelig
 */
export function firstRunJudge(s: FirstRunJudgeState): FirstRunAction {
  if (s.shown) return { kind: 'skip', reason: 'fr_seen' };
  if (s.isPro || s.sharedPro || s.pending) return { kind: 'skip', reason: 'fr_pro' };
  if (!s.ready) return { kind: 'wait' };
  if (!s.iapAvailable) return { kind: 'skip', reason: 'fr_noiap' };
  if (!s.offers.length) {
    if (s.sinceReady < FIRST_RUN_OFFER_GRACE_MS) return { kind: 'wait' };
    return s.offerTries < FIRST_RUN_OFFER_TRIES ? { kind: 'retry_offers' } : { kind: 'skip', reason: 'fr_nooffer' };
  }
  if (hasTrialOffer(s.offers)) return { kind: 'check' };
  if (iosTrialCandidate(s.platform, s.offers)) {
    if (s.trialUnknown === false) return { kind: 'skip', reason: 'fr_noelig' };
    return s.trialTries < FIRST_RUN_TRIAL_TRIES ? { kind: 'retry_trials' } : { kind: 'skip', reason: 'fr_unk' };
  }
  return { kind: 'skip', reason: 'fr_noelig' };
}

/** 상한까지 못 정했을 때의 이유 */
export function firstRunTimeoutReason(s: { ready: boolean; offersLen: number; checkFailed: boolean; busy: boolean }): FirstRunSkip {
  if (!s.ready) return 'fr_wait';
  if (!s.offersLen) return 'fr_nooffer';
  if (s.checkFailed) return 'fr_chk';
  if (s.busy) return 'fr_busy';
  return 'fr_unk';
}

/** 늦게(예전 상한 뒤) 보여도 되는 순간인가 — 다른 시트·결제 창·게이트 흐름이 없고 앱이 앞에 있고 앱 화면 */
export function firstRunLateOk(s: { dialogOpen: boolean; gateFlow: boolean; visible: boolean; routeOk: boolean }): boolean {
  return !s.dialogOpen && !s.gateFlow && s.visible && s.routeOk;
}

/** 판정을 시작한 뒤 다른 출처의 페이월이 열렸나(ProPaywall notePaywallOpened 시각) — 열렸으면 늦은 체험 페이월은 띄우지 않는다(같은 세션 두 번 금지) */
export function otherPaywallSince(openedAt: string | null, startedAt: number): boolean {
  if (!openedAt) return false;
  const v = Number(openedAt);
  return Number.isFinite(v) && v > 0 && v >= startedAt;
}

/** 판정 고리가 쓰는 바깥 세계(컴포넌트가 넣는다 · 시험은 가짜 시계로) */
export type FirstRunLoopDeps<O extends OfferLike> = {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** 계속 살아 있나(해제·결정 뒤 false) */
  alive(): boolean;
  /** 훅의 지금 값 */
  snap(): { isPro: boolean; ready: boolean; trialsReady: boolean; iapAvailable: boolean; offers: O[] };
  pending(): boolean;
  sharedPro(): boolean;
  shown(): boolean;
  platform: string;
  rawOffers(): Promise<O[]>;
  trials(list: O[]): Promise<{ list: O[]; unknown: boolean }>;
  /** 스토어 «지금 PRO» — 실패·시간 초과는 던진다 */
  fetchPro(): Promise<boolean>;
  /** 늦은 표시(예전 상한 뒤)의 겹침 환경 */
  lateEnv(): { dialogOpen: boolean; gateFlow: boolean; visible: boolean; routeOk: boolean };
  /** PAYWALL_OPEN_KEY 값 */
  openedAt(): string | null;
  /** 보였다고 적기(실패 = false) */
  mark(): boolean;
};

export type FirstRunLoopResult<O> =
  | { kind: 'show'; offers: O[]; late: boolean }
  | { kind: 'skip'; reason: FirstRunSkip }
  | { kind: 'gone' };   // 해제됨(판정 중 화면 이동) — 결론을 세지 않는다

/** 시간 상한을 건 기다림 — 넘으면 던진다 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/**
 * 첫 실행 체험 페이월 판정 고리 — 예전 상한(8초) 안에 정해지면 겹침 검사 없이 예전처럼, 그 뒤(첫 세션 30초까지)는 겹침이 없을 때만.
 *   보이기 직전 스토어 재조회(코드 PRO 보호)·표식 기록은 예전 그대로. 재조회·오퍼링은 각 4초 상한, 자격 조회는 withTrialsStatus 의 3초 상한.
 */
export async function runFirstRunLoop<O extends OfferLike>(d: FirstRunLoopDeps<O>): Promise<FirstRunLoopResult<O>> {
  const startedAt = d.now();
  let override: O[] | null = null;
  let trialUnknown: boolean | null = null;
  let trialTries = 0, offerTries = 0, checkFails = 0;
  let readyAt = 0;
  let retried = false;
  let lastBusy = false;
  const pick = (): O[] => {
    const hook = d.snap().offers;
    if (override && hasTrialOffer(override)) return override;
    if (hasTrialOffer(hook)) return hook;
    return override && override.length ? override : hook;
  };
  const isLate = () => d.now() - startedAt > FIRST_RUN_PAYWALL_WAIT_MS;
  /** 늦은 경우의 겹침 — 'busy' = 다른 페이월이 이미 열림(끝) · 'wait' = 잠시 뒤 다시 · 'ok' */
  const lateGate = (): 'ok' | 'wait' | 'busy' => {
    if (!isLate()) return 'ok';
    if (otherPaywallSince(d.openedAt(), startedAt)) return 'busy';
    const ok = firstRunLateOk(d.lateEnv());
    lastBusy = !ok;
    return ok ? 'ok' : 'wait';
  };

  while (d.alive()) {
    if (d.now() - startedAt >= FIRST_RUN_PAYWALL_BUDGET_MS) {
      const s = d.snap();
      return { kind: 'skip', reason: firstRunTimeoutReason({ ready: s.ready && s.trialsReady, offersLen: pick().length, checkFailed: checkFails > 0, busy: lastBusy }) };
    }
    const s = d.snap();
    const ready = s.ready && s.trialsReady;
    if (ready && !readyAt) readyAt = d.now();
    const list = pick();
    const act = firstRunJudge({
      iapAvailable: s.iapAvailable, ready, isPro: s.isPro, pending: d.pending(), sharedPro: d.sharedPro(), offers: list, shown: d.shown(),
      platform: d.platform, trialUnknown, trialTries, offerTries, sinceReady: readyAt ? d.now() - readyAt : 0,
    });
    if (act.kind === 'skip') return { kind: 'skip', reason: act.reason };
    if (act.kind === 'wait') { await d.sleep(250); continue; }
    if (act.kind === 'retry_offers') {
      offerTries += 1; retried = true;
      try {
        const r = await d.trials(await withTimeout(d.rawOffers(), FIRST_RUN_CHECK_TIMEOUT_MS));
        override = r.list; trialUnknown = r.unknown;
      } catch { /* 다음 회차에 다시 */ }
      if (!override || !override.length) await d.sleep(1_500 * offerTries);
      continue;
    }
    if (act.kind === 'retry_trials') {
      trialTries += 1;
      if (trialTries > 1) retried = true;   // 첫 번째는 «자격 없음/모름»을 가리는 확인 — 재시도는 두 번째부터
      try {
        const r = await d.trials(list);
        override = r.list; trialUnknown = r.unknown;
      } catch { trialUnknown = true; }
      if (trialUnknown) await d.sleep(1_000 * trialTries);
      continue;
    }
    // 'check'
    const g1 = lateGate();
    if (g1 === 'busy') return { kind: 'skip', reason: 'fr_busy' };
    if (g1 === 'wait') { await d.sleep(1_000); continue; }
    let free: boolean | null = null;
    try { free = !(await withTimeout(d.fetchPro(), FIRST_RUN_CHECK_TIMEOUT_MS)); } catch { free = null; }
    if (!d.alive()) return { kind: 'gone' };
    if (free === null) {
      checkFails += 1; retried = true;
      if (checkFails >= FIRST_RUN_CHECK_TRIES) return { kind: 'skip', reason: 'fr_chk' };
      await d.sleep(1_500);
      continue;
    }
    if (!free || d.pending() || d.sharedPro()) return { kind: 'skip', reason: 'fr_pro' };
    // 재조회를 기다리는 사이 다른 페이월·시트가 떴으면(늦은 경우) 다시 본다
    const g2 = lateGate();
    if (g2 === 'busy') return { kind: 'skip', reason: 'fr_busy' };
    if (g2 === 'wait') { await d.sleep(1_000); continue; }
    const chosen = pick();
    if (!hasTrialOffer(chosen)) { await d.sleep(250); continue; }   // 그 사이 목록이 바뀌었다 — 다시 판정
    if (!d.mark()) return { kind: 'skip', reason: 'fr_seen' };
    return { kind: 'show', offers: chosen, late: isLate() || retried };
  }
  return { kind: 'gone' };
}

export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function readFirstRunPaywallShown(store: MiniStore | null): boolean {
  try { return !store || store.getItem(FIRST_RUN_PAYWALL_KEY) !== null; } catch { return true; }
}

/** 보였다고 적는다 — 적은 값을 다시 읽어 확인. 실패면 false(호출자는 보이지 않는다) */
export function markFirstRunPaywallShown(store: MiniStore | null, now = Date.now()): boolean {
  try {
    if (!store) return false;
    const v = String(now);
    store.setItem(FIRST_RUN_PAYWALL_KEY, v);
    return store.getItem(FIRST_RUN_PAYWALL_KEY) === v;
  } catch { return false; }
}
