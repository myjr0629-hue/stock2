import { NextRequest, NextResponse, after } from 'next/server';
import { validClientEvent } from '@/lib/giftShare/funnel.cjs';
import { giftFunnelTask } from '@/lib/giftShare/funnelServer';
import { validFunnelPost, emptyFunnelBody } from '@/lib/giftShare/funnelGuard';

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const e = q.get('e') || '', s = q.get('s') || '', p = q.get('p') || '', d = q.get('d') || '';
  // 비콘 규약은 본문 0바이트. Content-Length가 없거나 거짓이어도 실제 스트림을 검사한다.
  // 임의 쿼리·중복·초대 토큰/코드/기기값도 받지 않는다.
  const keys = [...q.keys()];
  if (/^(0)?$/.test(req.headers.get('content-length') || '') && req.url.length <= 512 &&
      keys.length === 4 && keys.every(k => ['e', 's', 'p', 'd'].includes(k)) &&
      validFunnelPost(req) && validClientEvent(e, s, p, d)) {
    const task = giftFunnelTask(req, e, s, p, d);
    if (task && await emptyFunnelBody(req)) after(task);
  }
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
