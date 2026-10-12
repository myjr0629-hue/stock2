// /api/live/ext-trade?symbols=A,B — ★ [2026-10-12] 프리·애프터 «실시간» 마지막 체결(FMP aftermarket-trade)
//
// 누가 부르나: EC2 가격 허브(scripts/ec2-price-ws.js)가 프리·애프터 동안 구독 상위 종목을 5초마다 물어 앱에 «src:'live'»로 방송한다.
//   FMP 키는 Vercel 에만 둔다(허브는 키 없이 이 문을 부른다). 벤더 호출은 허브 인증(프록시 키와 같은 값)일 때만 — 아니면 캐시만 읽는다.
//   값 캐시·분당 상한은 services/fmpExtTrade.ts 하나 — /api/live/quotes 와 같은 캐시를 나눈다.
// 응답: { session, data: { T: { price, ts, src:'live' } } } — 오늘 그 세션 창 안의 체결만(창 밖은 뺀다)
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';
import { getFmpExtTrades } from '@/services/fmpExtTrade';
import { etDateOf } from '@/lib/marketCalendar';
import { extKindOf, inExtWindow } from '@/lib/price/extendedLive';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 12;
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function hubAuthorized(req: Request): boolean {
    const want = process.env.EC2_REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY || '';
    const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!want || !got) return false;
    const a = crypto.createHash('sha256').update(want).digest();
    const b = crypto.createHash('sha256').update(got).digest();
    return crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickers = [...new Set(String(searchParams.get('symbols') || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => TICKER_RE.test(s)))].slice(0, MAX_SYMBOLS);
    const status = await getMarketStatusSSOT();
    const session = status.session;
    const kind = extKindOf(session);
    if (!kind || tickers.length === 0) {
        return NextResponse.json({ session, data: {} }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const hub = hubAuthorized(request);
    const raw = await getFmpExtTrades(tickers, { maxFetch: hub ? tickers.length : 0 });
    const today = etDateOf(Date.now());
    const data: Record<string, { price: number; ts: number; src: 'live' }> = {};
    for (const t of tickers) {
        const v = raw[t];
        if (v && inExtWindow(v.ts, today, kind)) data[t] = { price: v.price, ts: v.ts, src: 'live' };
    }
    return NextResponse.json({ session, data, at: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
