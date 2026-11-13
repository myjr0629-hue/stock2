/**
 * 검증 가능한 초대 토큰 — 2026-11-13 (브랜치 feat/referral-1113, 설계 2026-11-12/referral-reward/DESIGN.md §흐름 1). 서버 전용(node:crypto).
 *
 * 왜: 예전 링크의 ref 는 «누구나 아무 값이나» 실을 수 있는 공개 id 뿐이라, 서버가 «이 링크를 만든 사람이 어떤 RC 고객인가»를 몰랐다
 *   (자기 초대를 RC 고객 단위로 막을 수 없고, 링크에 기한도 없었다). 토큰은 «초대자가 비공개 열쇠로 직접 받아 간» 서명값이다.
 *
 * 형식: <ref>.<u>.<exp36>.<sig>   (약 57자 — 공유 문구 끝 링크에 실린다)
 *   ref  초대자 공개 id(lib/invite/identity.inviteRefOf — 열쇠에서 서버가 다시 계산한 값만 넣는다)
 *   u    초대자 RC 앱 사용자 ID 의 HMAC 앞 16자(되돌릴 수 없음 — RC ID 원문은 링크·저장소 어디에도 없다)
 *   exp  만료 시각(초, 36진수) — 발급 + 7일
 *   sig  HMAC-SHA256(비밀, "inv-tok-v1|ref|u|exp") base64url 앞 22자(132비트)
 * 코드 번호·열쇠·RC ID 는 싣지 않는다. 위조·만료·형식 오류는 verifyInviteToken 이 null.
 */
import crypto from 'node:crypto';
import { normalizeGiftRef } from '@/lib/gift/gift';
import { INVITE_TOKEN_RE } from './kinds';

export const INVITE_TOKEN_TTL_SEC = 7 * 86400;
/** 발급 시각보다 이만큼 미래의 exp 는 받지 않는다(비밀이 바뀌지 않은 한 생길 수 없다 — 방어용) */
const MAX_FUTURE_SEC = INVITE_TOKEN_TTL_SEC + 3600;

export function inviteTokenSecret(env: Record<string, string | undefined> = process.env): string {
  return env.INVITE_TOKEN_SECRET || env.INVITE_IP_SALT || env.COUPON_IP_SALT || env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
}

/** RC 앱 사용자 ID → 16자 HMAC(토큰의 u 와 친구 쪽 비교에 같은 함수) */
export function rcUidTag(uid: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`inv-rc|${uid}`).digest('hex').slice(0, 16);
}

/** 중복 방지 칸 열쇠용(더 긴) 해시 — 'u' 접두(자동 해석 방지) */
export function rcUidKeyHash(uid: string, secret: string): string {
  return 'u' + crypto.createHmac('sha256', secret).update(`inv-rcu|${uid}`).digest('hex').slice(0, 31);
}

const sign = (ref: string, u: string, exp36: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(`inv-tok-v1|${ref}|${u}|${exp36}`).digest('base64url').slice(0, 22);

export function issueInviteToken(p: { ref: string; uidTag: string; nowMs?: number; secret: string }): string | null {
  const ref = normalizeGiftRef(p.ref);
  if (!ref || !/^[0-9a-f]{16}$/.test(p.uidTag) || !p.secret) return null;
  const exp = Math.floor((p.nowMs ?? Date.now()) / 1000) + INVITE_TOKEN_TTL_SEC;
  const exp36 = exp.toString(36);
  return `${ref}.${p.uidTag}.${exp36}.${sign(ref, p.uidTag, exp36, p.secret)}`;
}

export interface InviteTokenClaims { ref: string; u: string; exp: number; iat: number }

/** 서명·만료·형식 검사. 통과하면 내용, 아니면 null(이유는 돌려주지 않는다 — 시험은 reason 판정 함수로). */
export function verifyInviteToken(raw: unknown, secret: string, nowMs = Date.now()): InviteTokenClaims | null {
  return inviteTokenVerdict(raw, secret, nowMs).claims;
}

export function inviteTokenVerdict(raw: unknown, secret: string, nowMs = Date.now()): { claims: InviteTokenClaims | null; reason: 'ok' | 'format' | 'sig' | 'expired' } {
  if (typeof raw !== 'string' || !INVITE_TOKEN_RE.test(raw) || !secret) return { claims: null, reason: 'format' };
  const [ref0, u, exp36, sig] = raw.split('.');
  const ref = normalizeGiftRef(ref0);
  if (!ref || ref !== ref0) return { claims: null, reason: 'format' };
  const want = sign(ref, u, exp36, secret);
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { claims: null, reason: 'sig' };
  const exp = parseInt(exp36, 36);
  const nowSec = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(exp) || exp <= nowSec) return { claims: null, reason: 'expired' };
  if (exp - nowSec > MAX_FUTURE_SEC) return { claims: null, reason: 'format' };
  return { claims: { ref, u, exp, iat: (exp - INVITE_TOKEN_TTL_SEC) * 1000 }, reason: 'ok' };
}
