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
// v4 — 14일 창 분할로 9·10월이 들어왔다. 옛 v3 페이로드는 «11·12월만» 이라
//      그대로 두면 6시간 더 잘린 목록이 나간다.
const CACHE_KEY = 'market:earnings-calendar:v4';
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

    // ★ 벤더 실측(2026-09-06):
    //   · v3/earning_calendar        → HTTP 403 (플랜에 없다)
    //   · stable/earnings-calendar   → ok. 단 «두 가지» 함정이 있다.
    //
    //   함정 ① 발표 «시각»이 없다
    //     주는 필드가 symbol·date·epsActual·epsEstimated·revenueActual·revenueEstimated·
    //     lastUpdated 뿐이다. 그래서 시각은 Finnhub 으로 «임박한 것만» 채운다(아래).
    //
    //   함정 ②★ 한 번에 4,000행에서 «잘린다» — 그것도 최신순으로
    //     120일(9/6~1/4)을 한 콜로 물으면 정확히 4000행이 오는데
    //       첫 행 2027-01-04 … 끝 행 2026-11-05
    //     즉 **9월·10월이 통째로 잘려나간다**. 화면에 11·12월만 나온 진짜 이유다.
    //     (실측: 9/6~10/5 는 841행이고 그 안에 ORCL 9/10 · ADBE 9/10 · COST 9/24 ·
    //      MU 9/30 · NKE 10/1 이 다 있다. 창을 좁히면 보인다.)
    //     → 창을 **14일씩** 쪼개서 부른다. 성수기 30일이 4,000(상한)이므로
    //       14일이면 절반 아래로 안전하다. 그래도 상한에 닿으면 «잘렸다»고 기록한다 —
    //       조용히 잘리는 것이 이 버그의 본질이었다.
    const CHUNK_DAYS = 14;
    const windows: Array<[string, string]> = [];
    for (let off = 0; off < 120; off += CHUNK_DAYS) {
      const f = new Date(today); f.setDate(f.getDate() + off);
      const t2 = new Date(today); t2.setDate(t2.getDate() + Math.min(off + CHUNK_DAYS - 1, 120));
      windows.push([fmt(f), fmt(t2)]);
    }

    const probe: Record<string, string> = {};
    const truncated: string[] = [];               // 상한에 닿은 창 — 있으면 더 쪼개야 한다는 신호
    const CAP = 4000;
    const chunks = await Promise.all(windows.map(async ([f, t2]) => {
      const url = `https://financialmodelingprep.com/stable/earnings-calendar?from=${f}&to=${t2}&apikey=${key}`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        if (!r.ok) { probe[f] = `http-${r.status}`; return []; }
        const j = await r.json();
        if (!Array.isArray(j)) { probe[f] = `shape-${typeof j}`; return []; }
        probe[f] = `ok-${j.length}`;
        if (j.length >= CAP) truncated.push(`${f}~${t2}`);
        return j;
      } catch (e: any) { probe[f] = `err-${String(e?.message || e).slice(0, 30)}`; return []; }
    }));
    const raw: any[] = chunks.flat();
    const usedUrl = 'stable';
    if (!raw.length) return NextResponse.json({ ok: true, rows: [], reason: 'fmp-empty', probe });
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
      truncated,          // 4,000 상한에 닿은 창 — 비어 있어야 정상
      windows: windows.length,
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
