import { NextRequest, NextResponse, after } from 'next/server';
import { etDay, isOs } from '@/lib/invite/engine';
import { inviteClientIp, inviteDenyReason, inviteIpHash, inviteOs, inviteSecret } from '@/lib/invite/guard';
import { inviteRefOf, normalizeInviteKey } from '@/lib/invite/identity';
import { upstashInviteStore } from '@/lib/invite/store';
import { bumpShare } from '@/lib/invite/metrics';
import { INVITE_TOKEN_TTL_SEC, inviteTokenSecret, issueInviteToken, rcUidTag } from '@/lib/invite/token';
import { REFERRAL_RC_UID_RE } from '@/lib/invite/referral';

// ============================================================================
// POST /api/invite/token — 초대자 앱이 «공유 링크에 실을 서명 토큰»을 받는다 (2026-11-13, 브랜치 feat/referral-1113)
// ----------------------------------------------------------------------------
//   요청: JSON {key(기기 로컬 비공개 열쇠), rcUid(RevenueCat 앱 사용자 ID)} + 헤더 x-invite: 1 (우리 앱 화면의 fetch 만)
//   하는 일: 열쇠에서 공개 id(ref)를 다시 계산하고, RC ID 는 HMAC 16자 태그로만 바꿔 토큰에 넣는다(원문 저장·로그 없음).
//   응답(no-store): 200 {ok:true, token, exp(ms)} · 403 {reason:'bot'|'origin'|'device'|'noip'} · 400 {reason:'bad'} · 429 {reason:'limited'} · 503
//   한도: 같은 ref 하루(ET) 30 · 같은 IP 하루 60 — 토큰은 7일 유효라 정상 사용은 하루 1~2회다.
//   측정: share:tissue:all:<플랫폼> (응답 뒤)
// ============================================================================

export const dynamic = 'force-dynamic';
const LIMIT_REF = 30;
const LIMIT_IP = 60;

function out(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
}

export async function POST(req: NextRequest) {
  const deny = inviteDenyReason(req.headers, req.headers.get('host'));
  if (deny) return out(403, { ok: false, reason: deny });
  const os = inviteOs(req.headers);
  if (!os || !isOs(os)) return out(403, { ok: false, reason: 'device' });
  const ip = inviteClientIp(req.headers);
  if (!ip) return out(403, { ok: false, reason: 'noip' });
  if (Number(req.headers.get('content-length') || 0) > 512) return out(400, { ok: false, reason: 'bad' });
  const secret = inviteTokenSecret();
  const store = upstashInviteStore();
  if (!store || !secret) return out(503, { ok: false, reason: 'unavailable' });

  let body: { key?: unknown; rcUid?: unknown } = {};
  try { body = (await req.json()) || {}; } catch { body = {}; }
  const key = normalizeInviteKey(body.key);
  const uid = typeof body.rcUid === 'string' && REFERRAL_RC_UID_RE.test(body.rcUid) ? body.rcUid : null;
  if (!key || !uid) return out(400, { ok: false, reason: 'bad' });
  const ref = inviteRefOf(key);
  const p = process.env.VERCEL_ENV === 'production' ? 'promo:inv' : 'promo:pv:inv';
  const day = etDay();
  try {
    const a = await store.incr(`${p}:tk:r:${ref}:${day}`, 2 * 86400);
    const b = await store.incr(`${p}:tk:i:${inviteIpHash(ip, inviteSecret())}:${day}`, 2 * 86400);
    if (a > LIMIT_REF || b > LIMIT_IP) return out(429, { ok: false, reason: 'limited' });
  } catch { return out(503, { ok: false, reason: 'unavailable' }); }
  const now = Date.now();
  const token = issueInviteToken({ ref, uidTag: rcUidTag(uid, secret), nowMs: now, secret });
  if (!token) return out(400, { ok: false, reason: 'bad' });
  after(() => bumpShare('tissue', 'all', os));
  return out(200, { ok: true, token, exp: (Math.floor(now / 1000) + INVITE_TOKEN_TTL_SEC) * 1000 });
}
