// ============================================================================
// 게이트 «가치 순간» 페이월 (2026-11-16 매출 스프린트) — 순수 판정 + 하루 1회 기록
// ----------------------------------------------------------------------------
// 왜: 28일(ET 10/19~11/15) 퍼널 실측 — 페이월 열림 44회 중 게이트(가치 벽·대시보드 게이트·광고 창) 출처는 7회,
//   iOS 결제 단추 6회·결제 성공 0. 첫 실행 iOS 101명이 잠긴 분석을 만나도 결제 화면은 거의 보지 않았다.
//   게이트의 주 단추가 «광고 보고 1시간 잠금해제»이고, 네이티브에서 보상형 광고가 없거나(무광고 공급·준비 전)
//   끝까지 안 보면 «광고 없는 30초 대기 창»이 그대로 1시간을 열어 줬다 — 광고 수입도 결제 노출도 0 인 누수.
// 무엇(결제 흐름·가격·문구·배치는 그대로 — 언제 페이월을 보이느냐만):
//   ① 하루 첫 게이트 탭(네이티브 · 결제 가능 · PRO 상태 확인됨 · PRO 아님)이면 광고 전에 페이월을 한 번 보인다(출처 gate_first).
//      닫으면 원래 누른 대로 광고가 이어진다(사용자 의도 유지).
//   ② 네이티브에서 보상형 광고가 안 나왔을 때 대체 30초 창 «전에» 페이월(출처 ad_nofill). 닫으면 예전 대체 창 그대로.
//      ①에서 이미 페이월을 본 같은 탭이면 ②는 건너뛴다(연달아 두 번 보이지 않는다).
//   무료 경로(광고·대체 창)는 언제나 남는다.
// ============================================================================

export const GATE_PAYWALL_DAY_KEY = 'signum_gate_paywall_day';

/** 기기 현지 날짜 YYYY-MM-DD — «하루 1회»의 경계(사용자 체감 하루) */
export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type GateState = {
  /** 네이티브 앱이고 결제 가능(useProStatus().iapAvailable) */
  iapAvailable: boolean;
  /** PRO 상태를 한 번이라도 받았다(useProStatus().ready) — 모르면 보이지 않는다(코드 PRO 사용자에게 페이월 금지) */
  ready: boolean;
  isPro: boolean;
};

/** ① 하루 첫 게이트 탭에 페이월을 먼저 보일까 */
export function shouldShowFirstGatePaywall(s: GateState, lastDay: string | null, today: string): boolean {
  if (!s.iapAvailable || !s.ready || s.isPro) return false;
  return lastDay !== today;
}

/** ② 보상형 광고가 안 나왔을 때 대체 창 전에 페이월을 보일까 — 같은 탭에서 ①을 이미 봤으면 아니다 */
export function shouldShowNoFillPaywall(s: GateState, alreadyShownThisTap: boolean): boolean {
  if (!s.iapAvailable || !s.ready || s.isPro) return false;
  return !alreadyShownThisTap;
}

export function readGateDay(): string | null {
  try { return localStorage.getItem(GATE_PAYWALL_DAY_KEY); } catch { return null; }
}

/** 기록 실패(사파리 개인 모드 등)면 false — 그 경우 ①은 건너뛴다(매 탭 페이월 반복 방지) */
export function markGateDay(today: string): boolean {
  try { localStorage.setItem(GATE_PAYWALL_DAY_KEY, today); return localStorage.getItem(GATE_PAYWALL_DAY_KEY) === today; } catch { return false; }
}

// ★11/16 밤 교차 검토(중간 2건) — 결제 SDK 의 PRO 응답을 «모든 게이트·모든 useProStatus»가 같이 본다.
//   전에는 재조회(proCheck)가 확인한 PRO 가 그 게이트 훅의 storeProUntil 에만 남아, 다른 탭에서 새 ValueWall 이
//   마운트되고 초기 조회가 실패하면 방금 PRO 로 확인된 사용자에게 다시 잠금이 보였다.
//   규칙 하나: «가장 최신 스토어 응답이 이긴다».
//     · 조회 응답(getCustomerInfo·fetchProStatus)의 시각 = 그 조회를 «시작»한 시각(그보다 옛 상태일 수 있으므로 보수적으로).
//     · SDK 변경 알림(리스너)·구매·복원 성공의 시각 = 받은 «지금»(스토어 동기화가 끝난 시점의 권한).
//     · 더 옛 응답이 늦게 도착하면 버린다 — 옛 PRO 로 회수된 권한을 되살리지 않고, 옛 무료로 확인된 PRO 를 지우지 않는다.
//     · 같은 시각(같은 밀리초)이면 PRO 가 이긴다 — 판정이 불확실하면 PRO 사용자 보호.
//     · 조회 실패(응답 없음)는 아무것도 바꾸지 않는다 → 확인된 PRO 를 실패에 가두지 않는다(PRO 보호).
//   PRO 응답은 받은 뒤 1시간만 유효(광고 잠금해제와 같은 길이 — 그 사이 무료 알림이 안 와도 영구히 열린 채 남지 않게).
//     만료되면 «응답 없음»으로 돌아가 게이트는 그 훅의 isPro 를 따른다(origin/main 과 같은 만료). 무료 응답은 더 최신 PRO 가 올 때까지 유지.
//   모듈 값 + sessionStorage(같은 웹뷰 세션의 새로고침 대비 — 같은 1시간 규칙).
export const STORE_PRO_TTL_MS = 60 * 60 * 1000;
export const STORE_PRO_KEY = 'signum_gate_store_pro_until';

type StoreProStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function createStoreProSignal(opts: { now?: () => number; storage?: () => StoreProStorage | null | undefined } = {}) {
  const now = opts.now ?? (() => Date.now());
  const storage = opts.storage ?? (() => (globalThis as { sessionStorage?: StoreProStorage }).sessionStorage);
  /** 지금 값을 정한 응답의 시각(-1 = 기록 없음) */
  let answerAt = -1;
  /** 그 응답이 PRO 였나(기록 없음 = null) */
  let lastPro: boolean | null = null;
  /** 그 응답을 받은(기록한) 시각 — PRO 1시간 만료 기준 */
  let recordedAt = 0;
  let loaded = false;
  const listeners = new Set<() => void>();
  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = storage()?.getItem(STORE_PRO_KEY);
      const v = raw ? (JSON.parse(raw) as { at?: unknown; pro?: unknown; savedAt?: unknown }) : null;
      const a = Number(v?.at), saved = Number(v?.savedAt);
      // 손상·미래 값·1시간 넘은 값은 믿지 않는다
      if (typeof v?.pro === 'boolean' && Number.isFinite(a) && Number.isFinite(saved) && a >= 0 && a <= now()
        && saved <= now() && now() - saved < STORE_PRO_TTL_MS) { answerAt = a; lastPro = v.pro; recordedAt = saved; }
    } catch { /* 저장소 없음·손상 */ }
  };
  const record = (pro: boolean, at: number): boolean => {
    load();
    if (at < answerAt) return false;
    // 같은 시각이면 PRO 가 이긴다(판정이 불확실하면 PRO 사용자 보호) — 같은 시각의 무료가 PRO 를 덮지 않는다
    if (at === answerAt && lastPro === true && !pro) return false;
    answerAt = at;
    lastPro = pro;
    recordedAt = now();
    try { storage()?.setItem(STORE_PRO_KEY, JSON.stringify({ at, pro, savedAt: recordedAt })); } catch { /* 모듈 값은 유지 */ }
    listeners.forEach((f) => { try { f(); } catch { /* 구독자 오류는 무시 */ } });
    return true;
  };
  /** 유효한 최신 응답 값 — PRO 는 받은 뒤 1시간 지나면 null(응답 없음) */
  const current = (): boolean | null => {
    load();
    if (lastPro === true && now() - recordedAt >= STORE_PRO_TTL_MS) return null;
    return lastPro;
  };
  return {
    /** 가장 최신 응답이 (유효한) PRO 인가 */
    active(): boolean { return current() === true; },
    /** 가장 최신 응답의 값(기록 없음·PRO 만료 = null) */
    latest(): boolean | null { return current(); },
    /** 유효한 PRO 의 만료 시각(없으면 0) — 화면 다시 그리기용 */
    proExpiresAt(): number { return current() === true ? recordedAt + STORE_PRO_TTL_MS : 0; },
    /** 스토어가 PRO 라고 답함 — at = 응답 시각(조회는 시작 시각, 알림·구매·복원은 지금). 더 최신 응답이 있으면 false */
    mark(at: number = now()): boolean { return record(true, at); },
    /** 스토어가 무료라고 답함(만료·회수 포함) — 더 최신 응답이 있으면 false */
    revoke(at: number = now()): boolean { return record(false, at); },
    subscribe(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; },
  };
}

export const storeProSignal = createStoreProSignal();

export type ProCheckResult = 'pro' | 'pending' | 'free' | 'unknown';

/**
 * 게이트 흐름의 «스토어에서 방금» PRO 확인 — 'pro'(PRO 확인) · 'pending'(결제 진행 중) · 'free'(무료 확인) · 'unknown'(조회 실패·시간 초과).
 * ★11/16 밤: 비동기 조회를 기다리는 동안 다른 경로에서 PRO 로 바뀌었으면(proNow), 진행 중 조회가 옛 무료 결과를 돌려줘도 'free' 가 아니다.
 *   모든 await 뒤에 최신 PRO 상태를 다시 본다 — 판정이 불확실하면 무료로 보지 않는다(PRO 사용자 보호 우선).
 *   스토어 응답은 조회 «시작» 시각과 함께 공유 신호에 기록한다(markPro·markFree).
 *   광고 관리자 PRO(adPro)는 결제 SDK 를 따라가는 파생값 — 호출부가 «최신 SDK 응답이 무료면 false»로 넘긴다
 *   (회수 직후 늦게 따라오는 값으로 멈추거나 되살리지 않게). PRO 면 이번 탭을 멈추고 markAdPro 로 모든 게이트에 공유.
 */
export async function checkStorePro(d: {
  /** 지금 알고 있는 PRO(게이트 훅 상태 + 공유 신호) — 동기 */
  proNow: () => boolean;
  /** 결제 진행 중(막 결제함) */
  pending: () => boolean;
  /** 광고 관리자가 아는 PRO */
  adPro: () => Promise<boolean>;
  /** 스토어 조회 */
  fetchPro: () => Promise<boolean>;
  /** 스토어가 PRO 라고 답함 — at = 조회 시작 시각. false = 더 최신 응답(무료)이 이미 있어 거부됨 */
  markPro: (at: number) => boolean | void;
  /** 스토어가 무료라고 답함 — at = 조회 시작 시각 */
  markFree?: (at: number) => void;
  /** 광고 관리자가 PRO 라 함 — false = 기록 거부(그 사이 더 최신 무료 응답) */
  markAdPro?: () => boolean | void;
  now?: () => number;
  timeoutMs?: number;
}): Promise<ProCheckResult> {
  const now = d.now ?? (() => Date.now());
  if (d.proNow()) return 'pro';
  if (d.pending()) return 'pending';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if ((await d.adPro()) && (d.markAdPro?.() !== false || d.proNow())) return 'pro';
    if (d.proNow()) return 'pro';
    const startedAt = now();
    const pro = await Promise.race([
      d.fetchPro(),
      new Promise<boolean>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), d.timeoutMs ?? 3_000); }),
    ]);
    if (pro) {
      if (d.markPro(startedAt) !== false || d.proNow()) return 'pro';
      // 조회 도중 더 최신 무료 응답이 기록됐다 — 옛 PRO 로 탭을 멈추지도(잠금은 그대로라 못 푸는 상태), 페이월을 띄우지도 않는다 → 무료 경로
      return 'unknown';
    }
    // 무료 응답을 먼저 기록(조회 시작 시각) — 이 조회보다 늦게 시작한 PRO 응답이 이미 있으면 신호가 거부하고, 더 옛 PRO 는 이 무료가 덮는다
    d.markFree?.(startedAt);
    // 조회 대기 중 다른 경로에서 (더 최신) PRO 로 바뀌었나 — 옛 무료 결과를 그대로 쓰지 않는다
    if (d.proNow()) return 'pro';
    if ((await d.adPro()) && (d.markAdPro?.() !== false || d.proNow())) return 'pro';
    if (d.proNow()) return 'pro';
    if (d.pending()) return 'pending';
    return 'free';
  } catch {
    return d.proNow() ? 'pro' : d.pending() ? 'pending' : 'unknown';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
