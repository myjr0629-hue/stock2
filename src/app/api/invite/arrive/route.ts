import { NextRequest, NextResponse, after } from 'next/server';
import { arrive, isOs, type ArriveOutcome } from '@/lib/invite/engine';
import { inviteClientIp, inviteDebug, inviteDenyReason, inviteIpHash, inviteOs, inviteSecret } from '@/lib/invite/guard';
import { upstashInviteStore } from '@/lib/invite/store';
import { bumpShare } from '@/lib/invite/metrics';
import { surfaceOfFrom } from '@/lib/invite/kinds';

// ============================================================================
// POST /api/invite/arrive — «새로 설치해 처음 실행한 앱»이 한 번 부른다 (2026-10-14, 브랜치 feat/viral-loop)
// ----------------------------------------------------------------------------
//   요청: JSON {key(기기 로컬 비공개 열쇠)} + 헤더 x-invite: 1 (우리 앱 화면의 fetch 만)
//   서버가 하는 일: 이 요청의 IP 해시 + 기기 종류로 «최근 72시간 안에 이 IP 에서 열린 초대 링크(터치)»를 찾는다 → 있으면 «그 초대자의 친구가 설치했다»고 센다
//     → 초대자에게 보상 크레딧 1건(상한·같은 IP·같은 기기·하루 상한을 지난 것만). 친구 쪽 보상은 설치 «전» 쿠폰 화면이 이미 줬다.
//   응답(항상 no-store): 200 {ok:true, matched:boolean} — 초대자가 누군지·크레딧 여부는 돌려주지 않는다.
//                      403 {ok:false, reason:'bot'|'origin'|'noip'|'device'} · 503 {ok:false, reason:'unavailable'}
//   측정: share:arrive:all · share:match|credit:<표면>:<플랫폼> (EC2 레디스 — 응답 뒤 after(), 실패해도 무해)
//   저장: Upstash 직접(lib/invite/store — 원자 연산). 운영 promo:inv:* · 미리보기 promo:pv:inv:*.
//   개인정보: IP 원문 저장 없음(HMAC 해시 24자, 72시간·30일 뒤 삭제) · 이름·연락처와 연결하지 않는다.
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
  const store = upstashInviteStore();
  if (!store) return out(503, { ok: false, reason: 'unavailable' });

  let body: { key?: unknown } = {};
  try { body = (await req.json()) || {}; } catch { body = {}; }

  let r: ArriveOutcome;
  try {
    const ipHash = inviteIpHash(ip, inviteSecret());
    inviteDebug('arrive', req.headers, ip, ipHash, `os=${os}`);
    r = await arrive(store, { key: body.key, os, ipHash });
  } catch {
    return out(503, { ok: false, reason: 'unavailable' });
  }
  if (r.matched === false && r.reason === 'bad') return out(400, { ok: false, reason: 'bad' });
  if (r.matched === false && r.reason === 'again') return out(200, { ok: true, matched: false });   // 이미 한 번 도착으로 센 기기 — 지표에 다시 세지 않는다

  after(async () => {
    await bumpShare('arrive', 'all', os);
    if (r.matched) {
      const surface = surfaceOfFrom(r.from) || 'gift';
      await bumpShare('match', surface, os);
      if (r.credited) await bumpShare('credit', surface, os);
    }
  });
  return out(200, { ok: true, matched: r.matched });
}
