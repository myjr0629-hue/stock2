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

// ★11/16 밤 교차 검토(중간 2건) — 스토어에서 확인된 PRO 를 «모든 게이트»가 같이 본다.
//   전에는 재조회(proCheck)가 확인한 PRO 가 그 게이트 훅의 storeProUntil 에만 남아, 다른 탭에서 새 ValueWall 이
//   마운트되고 초기 조회가 실패하면 방금 PRO 로 확인된 사용자에게 다시 잠금이 보였다.
//   모듈 단위 신호 + sessionStorage(같은 웹뷰 세션에서 새로고침돼도 유지) · 최대 1시간(광고 잠금해제와 같은 길이).
//   «가장 늦게 시작한 스토어 응답이 이긴다» — mark(at)/revoke(at) 의 at = 그 응답을 낸 조회의 «시작» 시각.
//     · 조회 실패(응답 없음)는 아무것도 바꾸지 않는다 → 확인된 PRO 를 실패에 가두지 않는다(PRO 보호).
//     · 더 늦게 시작한 조회·SDK 알림이 무료라 하면 즉시 회수(만료·권한 회수 뒤 열린 채 남지 않음).
//     · 회수보다 먼저 시작한 진행 중 조회가 옛 PRO 를 돌려줘도 되살리지 않는다.
export const STORE_PRO_TTL_MS = 60 * 60 * 1000;
export const STORE_PRO_KEY = 'signum_gate_store_pro_until';

type StoreProStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function createStoreProSignal(opts: { now?: () => number; storage?: () => StoreProStorage | null | undefined } = {}) {
  const now = opts.now ?? (() => Date.now());
  const storage = opts.storage ?? (() => (globalThis as { sessionStorage?: StoreProStorage }).sessionStorage);
  let until = 0;
  /** 지금 상태를 정한 스토어 응답의 조회 시작 시각 */
  let answerAt = 0;
  let loaded = false;
  const listeners = new Set<() => void>();
  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = storage()?.getItem(STORE_PRO_KEY);
      const v = raw ? (JSON.parse(raw) as { until?: unknown; at?: unknown }) : null;
      const u = Number(v?.until), a = Number(v?.at);
      if (Number.isFinite(a) && a > 0 && a <= now()) answerAt = a;
      // 미래로 너무 먼 값(시계 조작·손상)은 믿지 않는다
      if (Number.isFinite(u) && u > now() && u <= now() + STORE_PRO_TTL_MS) until = u;
    } catch { /* 저장소 없음·손상 */ }
  };
  const save = () => { try { storage()?.setItem(STORE_PRO_KEY, JSON.stringify({ until, at: answerAt })); } catch { /* 모듈 값은 유지 */ } };
  const publish = () => listeners.forEach((f) => { try { f(); } catch { /* 구독자 오류는 무시 */ } });
  return {
    /** 유효한 만료 시각(없으면 0) */
    until(): number { load(); return until > now() ? until : 0; },
    active(): boolean { load(); return until > now(); },
    /** 스토어(결제 SDK)가 PRO 라고 답했다 — at = 그 조회를 시작한 시각(기본 지금). 더 늦은 응답이 이미 있으면 무시 */
    mark(at: number = now()): void {
      load();
      if (at < answerAt) return;
      answerAt = at;
      until = now() + STORE_PRO_TTL_MS;
      save();
      publish();
    },
    /** 스토어(결제 SDK)가 무료라고 답했다(만료·회수 포함) — 그 조회가 PRO 응답보다 늦게 시작했으면 회수 */
    revoke(at: number = now()): void {
      load();
      if (at < answerAt) return; // 옛 조회의 무료(캐시 지연) — 확인된 PRO 를 지우지 않는다
      answerAt = at;
      const had = until > 0;
      until = 0;
      save();
      if (had) publish();
    },
    subscribe(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; },
  };
}

export const storeProSignal = createStoreProSignal();

export type ProCheckResult = 'pro' | 'pending' | 'free' | 'unknown';

/**
 * 게이트 흐름의 «스토어에서 방금» PRO 확인 — 'pro'(PRO 확인) · 'pending'(결제 진행 중) · 'free'(무료 확인) · 'unknown'(조회 실패·시간 초과).
 * ★11/16 밤: 비동기 조회를 기다리는 동안 다른 경로에서 PRO 로 바뀌었으면(proNow), 진행 중 조회가 옛 무료 결과를 돌려줘도 'free' 가 아니다.
 *   모든 await 뒤에 최신 PRO 상태를 다시 본다 — 판정이 불확실하면 무료로 보지 않는다(PRO 사용자 보호 우선).
 *   스토어 응답은 조회 «시작» 시각과 함께 공유 신호에 기록한다(markPro·markFree) — 광고 관리자 PRO 는 이번 탭만 멈추고 기록하지 않는다
 *   (광고 관리자 상태는 결제 SDK 를 따라가므로 SDK 쪽에서 이미 공유된다 · 회수 직후 늦게 따라오는 값으로 되살리지 않게).
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
  /** 스토어가 PRO 라고 답함 — at = 조회 시작 시각 */
  markPro: (at: number) => void;
  /** 스토어가 무료라고 답함 — at = 조회 시작 시각 */
  markFree?: (at: number) => void;
  now?: () => number;
  timeoutMs?: number;
}): Promise<ProCheckResult> {
  const now = d.now ?? (() => Date.now());
  if (d.proNow()) return 'pro';
  if (d.pending()) return 'pending';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (await d.adPro()) return 'pro';
    if (d.proNow()) return 'pro';
    const startedAt = now();
    const pro = await Promise.race([
      d.fetchPro(),
      new Promise<boolean>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), d.timeoutMs ?? 3_000); }),
    ]);
    if (pro) { d.markPro(startedAt); return 'pro'; }
    d.markFree?.(startedAt);
    // 조회 대기 중 다른 경로에서 PRO 로 바뀌었나 — 옛 무료 결과를 그대로 쓰지 않는다
    if (d.proNow()) return 'pro';
    if (await d.adPro()) return 'pro';
    if (d.proNow()) return 'pro';
    if (d.pending()) return 'pending';
    return 'free';
  } catch {
    return d.proNow() ? 'pro' : d.pending() ? 'pending' : 'unknown';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
