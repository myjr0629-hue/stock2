'use client';

// ============================================================================
// 선물함·도착 클라이언트 — 2026-10-14 (브랜치 feat/viral-loop)
//   arrive  : «새로 설치해 처음 실행»한 앱이 한 번 서버에 알린다(친구가 초대 링크로 왔는지 서버가 IP 로 맞춘다 — lib/invite/engine).
//   inbox   : 공유를 한 번이라도 한 기기가 선물함을 읽는다(쌓인 크레딧 → 번호). 열쇠(key)는 이 두 요청에만 실리고 링크에는 절대 실리지 않는다.
// 순수 판정(arrivalDecision·newItems)은 시험이 고정한다(tests/invite.test.ts). 네트워크·저장소는 얇게.
// ============================================================================

import { getInviteKey, hasInviteShared } from './identity';

export const ARRIVED_KEY = 'signumhq.inv.arrived.v1';
export const SEEN_KEY = 'signumhq.inv.seen.v1';
export const BOX_CACHE_KEY = 'signumhq.inv.box.v1';
/** 도착 알림을 «실패로 못 보낸» 새 설치가 다음 실행에서 다시 시도해 줄 기한 */
export const ARRIVE_RETRY_MS = 72 * 3600_000;
export const INBOX_MIN_GAP_MS = 20 * 60_000;

export interface BoxItemView { code: string; os: 'ios' | 'android'; at: number; url: string }
export interface BoxState { items: BoxItemView[]; friends: number; waiting: number; rewards: boolean }

/**
 * 이번 실행에서 도착 알림을 보낼지 — 순수 함수.
 *   stored  : localStorage ARRIVED_KEY 값(없으면 null) — 'done' · 'skip' · 'pending:<ms>'
 *   onboardedAtMount : 이번 실행이 시작될 때 첫 안내를 이미 마친 상태였나(= 기존 사용자)
 * 반환: 'send'(보낸다) · 'skip'(기존 사용자 — 평생 보내지 않는다 표식) · 'wait'(이미 끝났거나 기한이 지났다 — 아무것도 안 함)
 *   · 막 설치한 사람(첫 안내 전)만 보낸다. 보내기 전에 앱을 닫았거나 네트워크가 없었으면 'pending' 으로 남겨 72시간 안의 다음 실행이 다시 시도한다.
 *   · 기존 사용자는 이 기능이 처음 들어온 날 한 번 'skip' 표식만 남긴다 — 이미 설치한 사람이 «친구가 설치했다»로 세지 않게.
 */
export function arrivalDecision(stored: string | null, onboardedAtMount: boolean, now = Date.now()): 'send' | 'skip' | 'wait' {
  if (stored === 'done' || stored === 'skip') return 'wait';
  if (stored && stored.startsWith('pending:')) {
    const at = Number(stored.slice(8));
    return Number.isFinite(at) && now - at <= ARRIVE_RETRY_MS ? 'send' : 'skip';
  }
  return onboardedAtMount ? 'skip' : 'send';
}

/** 서버가 준 번호 중 «알림으로 아직 안 보여 준» 것 — 순수 함수 */
export function newItems(items: readonly BoxItemView[], seen: readonly string[]): BoxItemView[] {
  const s = new Set(seen);
  return items.filter((it) => !s.has(it.code));
}

function ls(): Storage | null { try { return window.localStorage; } catch { return null; } }

export function readSeen(): string[] {
  try {
    const v = JSON.parse(ls()?.getItem(SEEN_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
export function markSeen(codes: readonly string[]): void {
  try { ls()?.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), ...codes])].slice(-20))); } catch { /* 저장소 막힘 */ }
}

export function readBoxCache(): BoxState | null {
  try {
    const v = JSON.parse(ls()?.getItem(BOX_CACHE_KEY) || 'null') as { at?: number; box?: BoxState } | null;
    return v && v.box && Array.isArray(v.box.items) ? v.box : null;
  } catch { return null; }
}

const headers = { 'content-type': 'application/json', 'x-invite': '1' };

/** 도착 알림 — 서버가 200 으로 대답하면 true(매칭 여부와 무관). 네트워크·서버 오류는 false(다음 실행에 다시). */
export async function sendArrive(): Promise<boolean> {
  try {
    const r = await fetch('/api/invite/arrive', { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify({ key: getInviteKey() }) });
    return r.ok || r.status === 403;   // 403 = 이 기기는 센 대상이 아님(봇·데스크톱 등) — 다시 시도해도 같다
  } catch { return false; }
}

/** 선물함 읽기 — 못 읽으면 null. 읽으면 캐시한다(설정 행이 즉시 개수를 그리게). */
export async function fetchInbox(): Promise<BoxState | null> {
  try {
    const r = await fetch('/api/invite/inbox', { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify({ key: getInviteKey() }) });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.ok !== true || !Array.isArray(j.items)) return null;
    const items: BoxItemView[] = j.items
      .filter((x: any) => x && typeof x.code === 'string' && (x.os === 'ios' || x.os === 'android') && typeof x.url === 'string')
      .map((x: any) => ({ code: String(x.code), os: x.os, at: Number(x.at) || 0, url: String(x.url) }));
    const box: BoxState = { items, friends: Math.max(0, Number(j.friends) || 0), waiting: Math.max(0, Number(j.waiting) || 0), rewards: j.rewards === true };
    try { ls()?.setItem(BOX_CACHE_KEY, JSON.stringify({ at: Date.now(), box })); } catch { /* 저장소 막힘 */ }
    return box;
  } catch { return null; }
}

/** 이 기기가 선물함을 조회할 이유가 있나 — 공유를 한 번이라도 했거나 이미 번호가 있다 */
export function shouldCheckInbox(): boolean {
  return hasInviteShared() || (readBoxCache()?.items.length ?? 0) > 0;
}
