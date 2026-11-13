import { NextRequest, NextResponse, after } from 'next/server';
import { isOs } from '@/lib/invite/engine';
import { inviteClientIp, inviteDenyReason, inviteIpHash, inviteOs, inviteSecret } from '@/lib/invite/guard';
import { upstashInviteStore } from '@/lib/invite/store';
import { bumpShare } from '@/lib/invite/metrics';
import { inviteTokenSecret } from '@/lib/invite/token';
import { rcSubscriberFetcher, verifyClaim, type VerifyState } from '@/lib/invite/referral';

// ============================================================================
// POST /api/invite/verify — 초대 링크로 설치한 친구 앱이 «확인 대기» 동안 실행·복귀 때 부른다 (2026-11-13, 브랜치 feat/referral-1113)
// ----------------------------------------------------------------------------
//   요청: JSON {key(친구 기기 열쇠), rcUid(친구 RC 앱 사용자 ID)} + x-invite: 1
//   서버: 확인 대기 기록(clm:<친구 ref>)이 있을 때만 RevenueCat 을 «직접» 읽어 신규 고객·운영 스토어 거래를 확인 → 통과하면 초대자 크레딧 1(원자).
//         판정 규칙은 lib/invite/referral.verifyClaim. 친구·초대자 정보는 돌려주지 않는다.
//   응답(no-store): 200 {ok:true, state:'none'|'pending'|'done'} — 'done' 이면 앱은 더 부르지 않는다(보상 여부는 알려 주지 않는다).
//   측정: share:rverify:<결론>:<플랫폼> · share:reward:<표면 all>:<플랫폼>(적립) — 응답 뒤.
// ============================================================================

export const dynamic = 'force-dynamic';

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
  let r: VerifyState | null;
  try {
    r = await verifyClaim(store, {
      key: body.key, rcUid: body.rcUid, os, ipHash: inviteIpHash(ip, inviteSecret()), secret,
      rc: rcSubscriberFetcher({ ios: process.env.NEXT_PUBLIC_RC_IOS_KEY, android: process.env.NEXT_PUBLIC_RC_ANDROID_KEY }),
    });
  } catch {
    return out(503, { ok: false, reason: 'unavailable' });
  }
  if (!r) return out(400, { ok: false, reason: 'bad' });
  const res = r;
  after(async () => {
    if (res.state === 'none') return;
    const tag = res.state === 'pending' ? `p_${res.reason}`.slice(0, 12) : res.state === 'credited' ? 'credited' : res.reason;
    await bumpShare('rverify', tag, os);
    if (res.state === 'credited') await bumpShare('reward', 'all', os);
  });
  return out(200, { ok: true, state: r.state === 'none' ? 'none' : r.state === 'pending' ? 'pending' : 'done' });
}
