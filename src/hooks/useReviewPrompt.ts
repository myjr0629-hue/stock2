'use client';

// ============================================================================
// useReviewPrompt — 스토어 평점 요청 (OS 제공 시트만 사용)
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-18 실측):
//   애플 lookup API 로 3앱 × us/kr/jp 를 조회한 결과 userRatingCount 가 «전부 0».
//   애플은 「ratings and reviews influence how your app ranks in search」라고
//   자사 문서에 명시한다 → 평점 0 은 검색 랭킹 입력값이 0 이라는 뜻이고,
//   현재 스토어 노출 1,170회의 최대 병목이다.
//   UC·WIM 은 이미 이 플러그인을 부르고 있는데 SIGNUM 만 빠져 있었다.
//
// ⛔ 절대 하면 안 되는 것 (App Store Review Guideline 5.6.1):
//   · 자체 제작 «별점 물어보는» 팝업 금지 — «제공된 API»만 허용된다
//   · 리뷰 대가로 보상·혜택 제공 금지
//   · 낮은 별점을 걸러내려고 사전 질문으로 분기시키는 것 금지
//   위반 시 최대 «개발자 프로그램 제명»이라 3앱을 한 번에 잃는다.
//   그래서 이 훅은 OS 시트를 «요청»만 하고 결과를 읽지 않는다.
//
// 동작:
//   · 네이티브에서만 동작한다(웹은 완전 무동작).
//   · 실제 표시 여부는 OS 가 정한다. iOS 는 365일당 최대 3회로 제한하므로
//     더 자주 불러도 조용히 무시될 뿐 해가 없다 — 그래서 결과를 확인하지 않는다.
//   · 카운트는 localStorage 에 «누적»으로 남는다(세션 아님).
// ============================================================================

import { useCallback } from 'react';
import { fullScreenAds } from '@/services/fullScreenAdSession';
import { GIFT_REVIEW_QUIET_MS, readAnnounceState, reannounceShownAt } from '@/lib/gift/giftAnnounce';

/**
 * ★2026-10-27 마지막으로 OS 평점 시트를 «요청»한 시각(ms, 요청 지연 포함) — 같은 웹뷰 실행 안에서만 의미가 있다.
 * 선물 안내(lib/gift/useGiftMoment·GiftAnnounceHost)가 이 시각 뒤 일정 시간은 띄우지 않는다(OS 시트와 겹치지 않게).
 * 결과(표시 여부)는 여전히 읽지 않는다 — «요청했다»만 적는다.
 */
let confirmedRequestAt = 0;
/** 아직 실행 전인 예약들(예약 id → 예약 시각). 취소·무효가 된 예약은 빠지고, 겹친 예약도 서로의 시각을 되살리지 않는다(관문 11050217 ③). */
const pendingRequests = new Map<number, number>();
let nextReservation = 1;
export const reviewRequestedAt = (): number => Math.max(confirmedRequestAt, ...pendingRequests.values());

/** 광고 진행 중·직후 및 선물 안내 직후에는 요청을 건너뛴다. 예약 시와 실행 시 모두 확인한다. */
export function reviewMomentBlocked(now = Date.now()): boolean {
  try {
    if (fullScreenAds.isBusy()) return true;
    // 보상형은 전면 광고 빈도 기록(lastShownAt)을 남기지 않는다 — 세션이 기록한 «광고가 끝난 시각»으로 함께 막는다
    const ended = fullScreenAds.endedAt();
    if (ended > 0 && now - ended < GIFT_REVIEW_QUIET_MS) return true;
    const ad = JSON.parse(localStorage.getItem('signum_interstitial_frequency') || '{}');
    if (typeof ad.lastShownAt === 'number' && ad.lastShownAt > 0 && now - ad.lastShownAt < GIFT_REVIEW_QUIET_MS) return true;
    const re = reannounceShownAt();   // 11/5 재안내 — 이번 실행에서 띄웠을 때만(없으면 0 = 예전 그대로)
    if (re > 0 && now - re < GIFT_REVIEW_QUIET_MS) return true;
    const gift = readAnnounceState(localStorage);
    if (gift && gift.last > 0 && now - gift.last < GIFT_REVIEW_QUIET_MS) return true;
    if (typeof document !== 'undefined' && (document.visibilityState === 'hidden' || document.querySelector('[aria-modal="true"]'))) return true;
    return false;
  } catch { return true; }
}

/**
 * 예약 뒤 «취소 함수»를 돌려준다. 예약 시 선물 안내용 요청 시각을 미리 적고(지연 동안 안내가 끼어들지 않게),
 * 실행 시 막혔거나 순간이 더는 유효하지 않거나(eligible false — 다른 화면으로 이동 등) 취소되면 그 예약을 목록에서 뺀다(겹친 예약도 서로의 시각을 되살리지 않는다)
 * (관문 11050112 ③ — 취소된 요청이 선물 안내를 60초 막지 않게).
 */
export function scheduleReviewRequest(delayMs: number, request: () => void, guardSignum = true, onBlocked: () => void = () => {}, eligible: () => boolean = () => true): () => void {
  if (guardSignum && reviewMomentBlocked()) { onBlocked(); return () => {}; }
  const id = nextReservation++;
  pendingRequests.set(id, Date.now() + delayMs);
  let settled = false;
  const abandon = () => {
    if (settled) return;
    settled = true;
    pendingRequests.delete(id);
    onBlocked();
  };
  const timer = window.setTimeout(() => {
    if (settled) return;
    let ok = false;
    try { ok = !(guardSignum && reviewMomentBlocked()) && eligible(); } catch { ok = false; }
    if (!ok) { abandon(); return; }
    settled = true;
    pendingRequests.delete(id);
    confirmedRequestAt = Date.now();
    request();
  }, delayMs);
  return () => {
    if (settled) return;
    try { window.clearTimeout?.(timer); } catch { /* ignore */ }
    abandon();
  };
}

/** 어느 경로든 OS 평점 시트를 «실제로 요청한» 날(로컬 날짜). 새 평점 순간(capacitorBridge.promptRatingMoment)이 같은 날 겹치지 않게 읽는다(관문 11050224 ②). */
export const REVIEW_ANY_DAY_KEY = 'signum.review.lastAnyDay';
export const localReviewDay = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function markReviewAskedToday(by?: string): void {
  try {
    localStorage.setItem(REVIEW_ANY_DAY_KEY, localReviewDay());
    if (by) localStorage.setItem(`${REVIEW_ANY_DAY_KEY}.by`, by); else localStorage.removeItem(`${REVIEW_ANY_DAY_KEY}.by`);
  } catch { /* ignore */ }
}
/** 오늘 «다른» 경로가 이미 OS 시트를 요청했는가 — 같은 경로의 다음 마일스톤은 막지 않는다 */
function reviewAskedTodayByOther(key: string): boolean {
  try { return reviewAskedToday() && localStorage.getItem(`${REVIEW_ANY_DAY_KEY}.by`) !== key; } catch { return true; }
}
export function reviewAskedToday(): boolean {
  try { return localStorage.getItem(REVIEW_ANY_DAY_KEY) === localReviewDay(); } catch { return true; }
}

// 마일스톤은 OS 시트를 실제로 요청할 때까지(막힌 회차는 세지 않고) 다음 적격 순간에 다시 시도한다 — 요청 뒤엔 완료 표식.
const inFlight = new Set<string>();
export function reviewAttempts(key: string, milestone: number): number {
  return Number(localStorage.getItem(`${key}.attempt.${milestone}`)) || 0;
}
export function attemptReview(key: string, milestone: number, delay: number, guard: boolean, requested: () => void, eligible: () => boolean = () => true): () => void {
  const id = `${key}:${milestone}`;
  if (inFlight.has(id) || reviewAttempts(key, milestone) >= 2) return () => {};
  inFlight.add(id);
  const release = () => { inFlight.delete(id); };
  return scheduleReviewRequest(delay, () => {
    try {
      const plugin = (window as { Capacitor?: any }).Capacitor?.Plugins?.InAppReview;
      if (typeof plugin?.requestReview !== 'function') return;
      // 시도 횟수는 OS 시트를 «실제로 요청한» 경우에만 센다 — 광고·안내에 막힌 회차는 기회를 소비하지 않는다
      localStorage.setItem(`${key}.attempt.${milestone}`, String(reviewAttempts(key, milestone) + 1));
      const result = plugin.requestReview();
      Promise.resolve(result).catch(() => {});
      markReviewAskedToday(key);
      requested();
    } catch { /* 요청 실패는 앱을 막지 않는다 */ } finally { release(); }
  // 같은 날 다른 경로(새 평점 순간 등)가 이미 물었으면 이번 회차는 «적격 아님»으로 버린다 — 묻지도 기록하지도 않고,
  // 요청 시각(confirmedRequestAt)도 남기지 않아 선물 안내를 막지 않는다(관문 11050239·11050242). 다음 날 다시 기회가 온다
  }, guard, release, () => !reviewAskedTodayByOther(key) && eligible());
}

type Options = {
  /** 누적 성공 횟수를 담는 localStorage 키 */
  storageKey: string;
  /**
   * 시트를 «요청»할 누적 횟수.
   * ⚠️ SIGNUM intel 은 3회마다 전면광고를 띄운다 — 3의 배수를 고르면 광고와
   *    시트가 겹친다. 기본값이 3의 배수를 피하는 이유다.
   */
  milestones?: number[];
  /** 성공 순간 직후 얼마나 기다렸다 물어볼지 (화면 전환이 끝난 뒤 뜨게) */
  delayMs?: number;
};

/**
 * 성공 순간에 호출할 함수를 돌려준다.
 * 「무엇이 성공인가」는 호출부가 정한다 — 그 순간이 앱 안에 실제로 없으면
 * 시트만 띄워봐야 낮은 별점을 받는다.
 */
export function useReviewPrompt({
  storageKey,
  milestones = [4, 11],
  delayMs = 1400,
}: Options) {
  return useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const cap = (window as { Capacitor?: any }).Capacitor;
      if (!cap?.isNativePlatform?.()) return;

      const prev = parseInt(localStorage.getItem(storageKey) || '0', 10) || 0;
      const n = prev + 1;
      localStorage.setItem(storageKey, String(n));
      const doneKey = `${storageKey}.requested`;
      // 옛 버전은 누적 횟수만 남기고 완료 표식이 없었다 — 표식이 아직 없으면 «이미 지난 마일스톤»은 옛 버전이 처리한 것으로 보고
      // 완료로 옮겨 적는다(업데이트 직후 기존 사용자에게 지난 평점 요청이 다시 뜨지 않게, 관문 11040409 ①)
      // «이 버전이 이미 센 적이 있다» 표식(.v2) 이 없을 때만 옮긴다 — 새 버전에서 막혀 미완료로 남은 마일스톤을 옛 것으로 오인하지 않게
      const v2Key = `${storageKey}.v2`;
      if (localStorage.getItem(v2Key) === null) {
        const legacyDone = localStorage.getItem(doneKey) === null ? milestones.filter(m => m <= prev) : [];
        if (legacyDone.length) localStorage.setItem(doneKey, JSON.stringify(legacyDone));
        localStorage.setItem(v2Key, '1');
      }
      const done: number[] = JSON.parse(localStorage.getItem(doneKey) || '[]');
      const hit = milestones.find(m => m === n && !done.includes(m))
        ?? milestones.find(m => m < n && !done.includes(m) && reviewAttempts(storageKey, m) === 0 && !inFlight.has(`${storageKey}:${m}`));
      if (hit == null) return;
      attemptReview(storageKey, hit, delayMs, storageKey.startsWith('signum.'), () => {
        const current: number[] = JSON.parse(localStorage.getItem(doneKey) || '[]');
        if (!current.includes(hit)) localStorage.setItem(doneKey, JSON.stringify([...current, hit]));
      });
    } catch { /* localStorage 차단 등 — 평점 요청이 앱을 막으면 안 된다 */ }
  }, [storageKey, milestones, delayMs]);
}
