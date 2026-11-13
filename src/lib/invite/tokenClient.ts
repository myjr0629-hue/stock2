'use client';

// ============================================================================
// 초대 토큰·친구 확인 클라이언트 — 2026-11-13 (브랜치 feat/referral-1113)
//   초대자: 앱이 열릴 때 서명 토큰(/api/invite/token, 7일)을 미리 받아 둔다 → 공유 링크를 만드는 순간(동기) inviteTokenNow() 로 inv= 에 싣는다.
//           iOS 는 공유 시트를 «클릭 핸들러에서 곧바로» 열어야 해서 링크 만들 때 네트워크를 기다릴 수 없다 — 그래서 미리 받는다. 없으면 토큰 없이(링크는 그대로).
//   친구  : 첫 실행 도착(/api/invite/arrive)이 claim:true 를 주면 «확인 대기» 표식을 남기고, 실행·복귀 때 /api/invite/verify 를 부른다(7일·3분 간격).
// 열쇠·RC ID 는 이 두 요청 본문에만 싣는다(링크·로그·지표에 없음). 화면에는 아무것도 그리지 않는다.
// ============================================================================

import { getInviteKey, getInviteRef } from './identity';
import { normalizeInviteToken } from './kinds';

export const INVITE_TOKEN_STORAGE = 'signumhq.inv.tok.v1';
export const CLAIM_STORAGE = 'signumhq.inv.claim.v1';
/** 만료까지 이보다 적게 남은 토큰은 새로 받는다(받는 쪽이 며칠 뒤에 열어도 살아 있게) */
export const TOKEN_REFRESH_MS = 2 * 86400_000;
export const TOKEN_RETRY_GAP_MS = 10 * 60_000;
export const CLAIM_WINDOW_MS = 7 * 86400_000;
export const VERIFY_GAP_MS = 3 * 60_000;

function ls(): Storage | null { try { return window.localStorage; } catch { return null; } }
const headers = { 'content-type': 'application/json', 'x-invite': '1' };

/** 저장된 토큰 판정 — 순수 함수. ref 가 지금 기기 ref 와 같고 만료 전이면 토큰, 아니면 null. */
export function tokenFromStored(raw: string | null, ref: string, now = Date.now()): { token: string; exp: number } | null {
  try {
    const j = JSON.parse(raw || 'null') as { t?: unknown; exp?: unknown } | null;
    const token = normalizeInviteToken(j?.t);
    const exp = typeof j?.exp === 'number' ? j.exp : 0;
    if (!token || token.split('.')[0] !== ref || exp <= now) return null;
    return { token, exp };
  } catch { return null; }
}

/** 지금 링크에 실을 토큰(동기) — 없으면 null */
export function inviteTokenNow(ref?: string | null): string | null {
  const s = ls();
  if (!s) return null;
  let raw: string | null = null;
  try { raw = s.getItem(INVITE_TOKEN_STORAGE); } catch { return null; }
  const r = ref ?? getInviteRef();
  return tokenFromStored(raw, r)?.token ?? null;
}

function isNative(): boolean {
  try { return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(); } catch { return false; }
}

/** 이 기기의 RevenueCat 앱 사용자 ID(익명 ID) — 네이티브·RC 설정이 있을 때만 */
export async function rcUidForInvite(): Promise<string | null> {
  try {
    const { initRevenueCat } = await import('@/services/revenueCat');
    if (!(await initRevenueCat())) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const { appUserID } = await Purchases.getAppUserID();
    return appUserID || null;
  } catch { return null; }
}

let tokenInflight: Promise<void> | null = null;
let tokenTriedAt = 0;

/** 토큰을 미리 받아 둔다 — 이미 넉넉하면 아무것도 안 한다. 실패는 조용히(10분 뒤 다시). */
export function ensureInviteToken(now = Date.now()): Promise<void> {
  if (typeof window === 'undefined' || !isNative()) return Promise.resolve();
  const s = ls();
  if (!s) return Promise.resolve();
  let cur: { token: string; exp: number } | null = null;
  try { cur = tokenFromStored(s.getItem(INVITE_TOKEN_STORAGE), getInviteRef(), now); } catch { return Promise.resolve(); }
  if (cur && cur.exp - now > TOKEN_REFRESH_MS) return Promise.resolve();
  if (tokenInflight || now - tokenTriedAt < TOKEN_RETRY_GAP_MS) return tokenInflight ?? Promise.resolve();
  tokenTriedAt = now;
  tokenInflight = (async () => {
    try {
      const rcUid = await rcUidForInvite();
      if (!rcUid) return;
      const r = await fetch('/api/invite/token', { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify({ key: getInviteKey(), rcUid }) });
      if (!r.ok) return;
      const j = await r.json();
      const token = normalizeInviteToken(j?.token);
      const exp = typeof j?.exp === 'number' ? j.exp : 0;
      if (token && exp > Date.now()) s.setItem(INVITE_TOKEN_STORAGE, JSON.stringify({ t: token, exp }));
    } catch { /* 다음 기회에 */ } finally { tokenInflight = null; }
  })();
  return tokenInflight;
}

// ── 친구 쪽 확인 ─────────────────────────────────────────────────────────

/** 이번에 확인을 부를지 — 순수 함수. stored = 'pending:<시작>[:<마지막 시도>]' · 'done' · null */
export function claimDecision(stored: string | null, now = Date.now()): 'call' | 'wait' | 'stop' {
  if (!stored || stored === 'done') return 'stop';
  const m = /^pending:(\d+)(?::(\d+))?$/.exec(stored);
  if (!m) return 'stop';
  const start = Number(m[1]);
  const last = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(start) || now - start > CLAIM_WINDOW_MS) return 'stop';
  return now - last >= VERIFY_GAP_MS ? 'call' : 'wait';
}

export function markClaimPending(now = Date.now()): void {
  try { ls()?.setItem(CLAIM_STORAGE, `pending:${now}`); } catch { /* 저장소 막힘 */ }
}

let verifyInflight: Promise<void> | null = null;

/** 확인 대기면 서버에 한 번 묻는다. done 이면 표식을 끝낸다. 실패는 다음 실행·복귀에 다시. */
export function runClaimVerify(now = Date.now()): Promise<void> {
  if (typeof window === 'undefined' || !isNative() || verifyInflight) return verifyInflight ?? Promise.resolve();
  const s = ls();
  if (!s) return Promise.resolve();
  let stored: string | null = null;
  try { stored = s.getItem(CLAIM_STORAGE); } catch { return Promise.resolve(); }
  const d = claimDecision(stored, now);
  if (d === 'stop') { if (stored && stored !== 'done') { try { s.setItem(CLAIM_STORAGE, 'done'); } catch { /* noop */ } } return Promise.resolve(); }
  if (d === 'wait') return Promise.resolve();
  const start = stored!.split(':')[1];
  try { s.setItem(CLAIM_STORAGE, `pending:${start}:${now}`); } catch { return Promise.resolve(); }
  verifyInflight = (async () => {
    try {
      const rcUid = await rcUidForInvite();
      if (!rcUid) return;
      const r = await fetch('/api/invite/verify', { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify({ key: getInviteKey(), rcUid }) });
      if (r.status === 400 || r.status === 403) { s.setItem(CLAIM_STORAGE, 'done'); return; }
      if (!r.ok) return;
      const j = await r.json();
      if (j?.state === 'done' || j?.state === 'none') s.setItem(CLAIM_STORAGE, 'done');
    } catch { /* 다음 기회에 */ } finally { verifyInflight = null; }
  })();
  return verifyInflight;
}
