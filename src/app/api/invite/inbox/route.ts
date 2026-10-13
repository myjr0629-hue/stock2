import { NextRequest, NextResponse, after } from 'next/server';
import { inbox, inviteConfig, isOs, type InboxResult } from '@/lib/invite/engine';
import { inviteDenyReason, inviteOs } from '@/lib/invite/guard';
import { upstashInviteStore } from '@/lib/invite/store';
import { bumpShare } from '@/lib/invite/metrics';
import { playRedeemUrl } from '@/lib/marketing/coupon';

// ============================================================================
// POST /api/invite/inbox — 초대자의 «선물함» (2026-10-14, 브랜치 feat/viral-loop)
// ----------------------------------------------------------------------------
//   요청: JSON {key(기기 로컬 비공개 열쇠)} + 헤더 x-invite: 1. 서버가 열쇠에서 공개 id 를 다시 계산해 그 칸을 읽는다(링크에 실린 id 만으로는 열 수 없다).
//   하는 일: 쌓인 크레딧을 «그 기기 종류에 맞는 풀»에서 번호로 바꾸고(애플 일회용 · Play 일회용 — 기존 오퍼만), 지금까지 받은 번호 목록을 돌려준다.
//   응답(항상 no-store): 200 {ok:true, items:[{code, os, at, url}], minted, waiting, friends, rewards}
//     · url = 아이폰은 애플 «코드 사용» 주소(번호가 채워진 채 열림) · 안드는 Play «코드 사용» 주소
//     · rewards=false 면 번호를 새로 뽑지 않는다(INVITE_REWARD≠1) — 이미 받은 번호만 보인다.
//   403 {ok:false, reason:'bot'|'origin'|'device'} · 400 {reason:'bad'} · 503 {reason:'unavailable'}
//   측정: 새로 번호가 배정되면 share:mint:<표면 'all'>:<플랫폼>(EC2, 응답 뒤).
// ============================================================================

export const dynamic = 'force-dynamic';

const APPLE_APP_ID = '6783130444';
const appleRedeemUrl = (code: string) => `https://apps.apple.com/redeem?ctx=offercodes&id=${APPLE_APP_ID}&code=${encodeURIComponent(code)}`;

function out(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
}

export async function POST(req: NextRequest) {
  const deny = inviteDenyReason(req.headers, req.headers.get('host'));
  if (deny) return out(403, { ok: false, reason: deny });
  const os = inviteOs(req.headers);
  if (!os || !isOs(os)) return out(403, { ok: false, reason: 'device' });
  const store = upstashInviteStore();
  if (!store) return out(503, { ok: false, reason: 'unavailable' });

  let body: { key?: unknown } = {};
  try { body = (await req.json()) || {}; } catch { body = {}; }

  const cfg = inviteConfig();
  let r: InboxResult | null;
  try {
    r = await inbox(store, { key: body.key, os, mint: cfg.rewards });
  } catch {
    return out(503, { ok: false, reason: 'unavailable' });
  }
  if (!r) return out(400, { ok: false, reason: 'bad' });
  const minted = r.minted;
  if (minted > 0) after(async () => { for (let i = 0; i < minted; i++) await bumpShare('mint', 'all', os); });
  return out(200, {
    ok: true,
    rewards: cfg.rewards,
    minted: r.minted,
    waiting: r.waiting,
    friends: r.friends,
    items: r.items.map((it) => ({ code: it.code, os: it.os, at: it.at, url: it.os === 'ios' ? appleRedeemUrl(it.code) : playRedeemUrl(it.code) })),
  });
}
