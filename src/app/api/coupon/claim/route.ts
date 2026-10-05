import { NextRequest, NextResponse, after } from 'next/server';
import { normalizeFrom } from '@/lib/marketing/storeRedirect';
import { recordClick, clickDevice } from '@/lib/marketing/clickHuman';
import { androidCouponLive, androidDailyCap, playRedeemUrl } from '@/lib/marketing/coupon';
import { claimPlayCoupon, claimDenyReason, clientIp, ipHash, upstashCouponStore, type ClaimOutcome } from '@/lib/marketing/couponClaim';

// ============================================================================
// POST /api/coupon/claim — 안드로이드 쿠폰 화면의 «내 쿠폰 받기» (2026-10-05, 브랜치 feat/coupon-ux)
// ----------------------------------------------------------------------------
//   요청: JSON {from, code(링크의 애플 맞춤 코드 — 출처 기록용), l} + 헤더 x-coupon: 1 (우리 화면의 fetch 만)
//   응답(항상 no-store):
//     200 {ok:true, code, url, again}   — 개인 일회용 Play 번호(again = 같은 IP 가 24시간 안에 이미 받은 번호)
//     429 {ok:false, reason:'cap', resetAt}  — 오늘(KST) 상한 도달, resetAt = 다음 배정 시각(ms)
//     410 {ok:false, reason:'empty'}  — 풀 소진
//     404 {ok:false, reason:'off'}    — 기능 꺼짐(COUPON_ANDROID≠1 또는 Play 프로모션 종료)
//     403 {ok:false, reason:'bot'|'device'|'origin'|'noip'}
//     503 {ok:false, reason:'unavailable'} — 저장소 설정 없음·오류(번호는 안 빠진다)
//   측정: clk:coupon:<from>:<ET날짜> 필드 «android|claim:<new|again|cap|empty|deny|err>» — 응답 뒤 after(), 실패해도 무해.
//   저장: lib/marketing/couponClaim.ts (Upstash — 원자 연산), 키는 lib/marketing/coupon.ts couponKeys(운영/미리보기 분리).
// ============================================================================

export const dynamic = 'force-dynamic';

function out(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
}

export async function POST(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  let body: { from?: unknown; code?: unknown } = {};
  try { body = (await req.json()) || {}; } catch { body = {}; }
  const from = normalizeFrom(typeof body.from === 'string' ? body.from : null);
  const rawCode = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const appleCode = /^[A-Z0-9]{4,24}$/.test(rawCode) ? rawCode : null;
  const note = (field: string) => after(() => recordClick('coupon', from, [`${clickDevice(ua)}|claim:${field}`]));

  if (!androidCouponLive()) return out(404, { ok: false, reason: 'off' });

  const deny = claimDenyReason(req.headers, req.headers.get('host'));
  if (deny) { note('deny'); return out(403, { ok: false, reason: deny }); }
  const ip = clientIp(req.headers);
  if (!ip) { note('deny'); return out(403, { ok: false, reason: 'noip' }); }

  const store = upstashCouponStore();
  if (!store) { note('err'); return out(503, { ok: false, reason: 'unavailable' }); }

  let r: ClaimOutcome;
  try {
    const secret = process.env.COUPON_IP_SALT || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
    r = await claimPlayCoupon(store, { ipHash: ipHash(ip, secret), from, appleCode, cap: androidDailyCap() });
  } catch {
    note('err');
    return out(503, { ok: false, reason: 'unavailable' });
  }
  note(r.kind);
  if (r.kind === 'new' || r.kind === 'again') return out(200, { ok: true, code: r.code, url: playRedeemUrl(r.code), again: r.kind === 'again' });
  if (r.kind === 'cap') return out(429, { ok: false, reason: 'cap', resetAt: r.resetAt });
  return out(410, { ok: false, reason: 'empty' });
}
