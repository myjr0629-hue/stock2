// ============================================================================
// /api/market/earnings-calendar — 시장 전체 실적 캘린더
//
// ★ 벤더는 FMP 다. 근거(실측 2026-09-05):
//   · FMP  stable/earnings-calendar?from=&to=  → 시장 전체를 **1콜**, 미국 티커로 온다
//   · Finnhub /calendar/earnings                → **종목당 1콜**. 섹터 캘린더 10개를 연속
//     호출했더니 6개가 빈 응답을 받았다(한도). 게다가 2330.TW·ASML.AS·NOVO B.CO 처럼
//     **해외 원주**를 섞어 주는데 그 EPS 는 TWD/EUR 이라 미국주식 화면에 그대로 쓰면 틀린다.
//   · Intrinio → 실적/캘린더 함수가 아예 없다(시세·옵션·그릭스 전문).
//
// ★ 유니버스는 «합집합» — SECTOR_MAP(121) + 인텔 10섹터(70). 대표 확정.
//   FMP 는 1콜이라 유니버스를 넓혀도 호출 수가 늘지 않는다.
//
// ★ 값이 없으면 «빈 채로» 둔다. 인텔의 지어낸 실적일을 이번에 걷어냈으므로
//   추정으로 채우지 않는다.
// ============================================================================

import { NextResponse } from 'next/server';
import { SECTOR_MAP } from '@/services/universePolicy';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CACHE_KEY = 'market:earnings-calendar:v1';
const TTL = 60 * 60 * 6;          // 6h — 발표일은 자주 안 바뀐다

/* 인텔 10섹터 구성종목 — app-view/intel 과 히트맵이 쓰는 것과 같은 목록 */
const INTEL_TICKERS = [
  'AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA',
  'TER','PLTR','SYM','SERV','PL','ISRG','RKLB',
  'MRVL','MU','AMD','ASML','ARM','TSM','AVGO',
  'CEG','VST','ETN','PWR','SMR','CCJ','GEV',
  'VKTX','VRTX','NVO','REGN','AMGN','LLY','GILD',
  'ZS','NET','CRWD','S','PANW','OKTA','FTNT',
  'AXON','LMT','SPCX','LUNR','RTX','LDOS','ASTS',
  'PATH','SNOW','SMCI','AI','TWLO','DELL','IONQ',
  'COIN','PYPL','AFRM','HOOD','UPST','SOFI','XYZ',
  'WDAY','MDB','NOW','HUBS','TEAM','CRM','DDOG',
];

function universe(): Set<string> {
  const u = new Set<string>();
  for (const s of Object.values(SECTOR_MAP)) for (const t of s.tickers) u.add(t.toUpperCase());
  for (const t of INTEL_TICKERS) u.add(t.toUpperCase());
  return u;
}

export interface EarningsRow {
  ticker: string;
  date: string;           // YYYY-MM-DD
  hour: string;           // 'amc' | 'bmo' | ''  — 없으면 빈 문자열(«시간 미정»)
  epsEstimate: number | null;
  revenueEstimate: number | null;
  quarter: number | null;
  year: number | null;
}

export async function GET() {
  try {
    const cached = await getFromCache<any>(CACHE_KEY);
    if (cached) return NextResponse.json({ ...cached, _cache: 'hit' });

    const key = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
    if (!key) {
      // 키가 없으면 «빈 채로» 돌려준다 — 화면이 섹션을 안 그린다
      return NextResponse.json({ ok: true, rows: [], universe: 0, reason: 'no-key' });
    }

    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + 120);                 // 4개월
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const res = await fetch(
      `https://financialmodelingprep.com/stable/earnings-calendar?from=${fmt(today)}&to=${fmt(to)}&apikey=${key}`,
      { signal: AbortSignal.timeout(15000), cache: 'no-store' },
    );
    if (!res.ok) return NextResponse.json({ ok: true, rows: [], reason: `fmp-${res.status}` });

    const raw = await res.json();
    if (!Array.isArray(raw)) return NextResponse.json({ ok: true, rows: [], reason: 'fmp-shape' });

    const u = universe();
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const seen = new Set<string>();
    const rows: EarningsRow[] = [];

    for (const r of raw) {
      const ticker = String(r?.symbol || '').toUpperCase();
      // 해외 원주(2330.TW · NOVO B.CO)는 티커에 . 또는 공백이 있다 — 미국 화면에서 뺀다
      if (!ticker || ticker.includes('.') || ticker.includes(' ')) continue;
      if (!u.has(ticker)) continue;
      const date = String(r?.date || '').slice(0, 10);
      if (!date) continue;
      const k = `${ticker}|${date}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({
        ticker,
        date,
        hour: typeof r?.time === 'string' && /^(amc|bmo)$/i.test(r.time) ? r.time.toLowerCase() : '',
        epsEstimate: num(r?.epsEstimated ?? r?.epsEstimate),
        revenueEstimate: num(r?.revenueEstimated ?? r?.revenueEstimate),
        quarter: num(r?.quarter),
        year: num(r?.year),
      });
    }
    rows.sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));

    const payload = {
      ok: true,
      rows,
      universe: u.size,
      source: 'FMP stable/earnings-calendar',
      from: fmt(today),
      to: fmt(to),
      generatedAt: new Date().toISOString(),
    };
    if (rows.length) setInCache(CACHE_KEY, payload, TTL).catch(() => {});
    return NextResponse.json({ ...payload, _cache: 'miss' });
  } catch (e: any) {
    return NextResponse.json({ ok: true, rows: [], reason: e?.message || 'error' });
  }
}
