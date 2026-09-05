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
import { getEarningsCalendar } from '@/services/finnhubClient';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 응답 모양이 바뀌면(hour·quarter·year 추가) 키를 올린다 — 옛 페이로드가 200 OK 로 나간다.
// 이 라우트엔 last_good 폴백이 없으므로 키를 올려도 휴장에 화면이 비지 않는다.
const CACHE_KEY = 'market:earnings-calendar:v3';
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

export async function GET(req: Request) {
  try {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    if (!fresh) {
      const cached = await getFromCache<any>(CACHE_KEY);
      if (cached) return NextResponse.json({ ...cached, _cache: 'hit' });
    }

    const key = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
    if (!key) {
      // 키가 없으면 «빈 채로» 돌려준다 — 화면이 섹션을 안 그린다
      return NextResponse.json({ ok: true, rows: [], universe: 0, reason: 'no-key' });
    }

    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + 120);                 // 4개월
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    // ★ 벤더 실측(2026-09-06, probe 로 확인):
    //   · v3/earning_calendar        → HTTP 403 (플랜에 없다)
    //   · stable/earnings-calendar   → ok, 4,000행. 그런데 주는 필드가
    //     symbol·date·epsActual·epsEstimated·revenueActual·revenueEstimated·lastUpdated 뿐이라
    //     **발표 시각(time)이 아예 없다.** 그래서 34행 전부 «시간 미정» 이 나왔다.
    //   → 시장 전체 목록은 stable 로 받고, 시각은 Finnhub 으로 «가장 임박한 것만» 채운다.
    const urls = [
      `https://financialmodelingprep.com/stable/earnings-calendar?from=${fmt(today)}&to=${fmt(to)}&apikey=${key}`,
    ];
    let raw: any = null;
    let usedUrl = '';
    const probe: Record<string, string> = {};   // ★ 어느 후보가 왜 떨어졌는지 응답에 싣는다
    for (const u of urls) {
      const tag = u.includes('/v3/') ? 'v3' : 'stable';
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        if (!r.ok) { probe[tag] = `http-${r.status}`; continue; }
        const j = await r.json();
        if (!Array.isArray(j)) { probe[tag] = `shape-${typeof j}`; continue; }
        if (!j.length) { probe[tag] = 'empty'; continue; }
        probe[tag] = `ok-${j.length}`;
        raw = j; usedUrl = tag; break;
      } catch (e: any) { probe[tag] = `err-${String(e?.message || e).slice(0, 40)}`; }
    }
    if (!Array.isArray(raw)) return NextResponse.json({ ok: true, rows: [], reason: 'fmp-empty', probe });
    // 벤더가 실제로 주는 필드 — 추측하지 않으려면 이걸 봐야 한다
    const vendorFields = Object.keys(raw[0] || {});

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
      // 시각: v3 는 'bmo'/'amc', 간혹 'before market open' 같은 문장으로도 온다
      const rawTime = String(r?.time ?? r?.hour ?? '').toLowerCase().trim();
      const hour = /amc|after/.test(rawTime) ? 'amc' : /bmo|before/.test(rawTime) ? 'bmo' : '';
      // 분기·연도: v3 는 fiscalDateEnding(YYYY-MM-DD) 으로 온다
      const fde = String(r?.fiscalDateEnding ?? '').slice(0, 10);
      let quarter = num(r?.quarter);
      let year = num(r?.year);
      if (quarter == null && /^\d{4}-\d{2}-\d{2}$/.test(fde)) {
        quarter = Math.floor((Number(fde.slice(5, 7)) - 1) / 3) + 1;
        year = Number(fde.slice(0, 4));
      }
      rows.push({
        ticker,
        date,
        hour,
        epsEstimate: num(r?.epsEstimated ?? r?.epsEstimate),
        revenueEstimate: num(r?.revenueEstimated ?? r?.revenueEstimate),
        quarter,
        year,
      });
    }
    rows.sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));

    // ── 발표 시각 채우기 (Finnhub) ────────────────────────────────────
    // FMP 에 time 이 없으므로, «가장 임박한 12건» 만 Finnhub 으로 채운다.
    // 종목당 1콜이라 무제한으로 부르면 한도에 걸린다(실측: 10개 라우트 연속 호출 시 6개 빈 응답).
    // 캐시 미스일 때만 돌고, 실패하면 그냥 비워 둔다 — 추정하지 않는다.
    let hourFilled = 0;
    const HOUR_FILL_LIMIT = 12;
    await Promise.all(
      rows.slice(0, HOUR_FILL_LIMIT).map(async (row) => {
        try {
          const ev = await getEarningsCalendar(row.ticker, row.date, row.date);
          const hit = (ev || []).find((e: any) => String(e?.symbol || '').toUpperCase() === row.ticker);
          const h = String(hit?.hour ?? '').toLowerCase();
          if (h === 'amc' || h === 'bmo') { row.hour = h; hourFilled += 1; }
          if (hit?.quarter != null) row.quarter = Number(hit.quarter);
          if (hit?.year != null) row.year = Number(hit.year);
        } catch { /* 못 채우면 빈 채로 둔다 */ }
      }),
    );

    const payload = {
      ok: true,
      rows,
      universe: u.size,
      source: `FMP ${usedUrl} earnings-calendar`,
      from: fmt(today),
      to: fmt(to),
      generatedAt: new Date().toISOString(),
      probe,
      vendorFields,
      hourFilled,
      hourSource: 'Finnhub (nearest 12)',
    };
    if (rows.length) setInCache(CACHE_KEY, payload, TTL).catch(() => {});
    return NextResponse.json({ ...payload, _cache: 'miss' });
  } catch (e: any) {
    return NextResponse.json({ ok: true, rows: [], reason: e?.message || 'error' });
  }
}
