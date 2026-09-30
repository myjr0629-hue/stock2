// ============================================================================
// 시장 전체 실적 캘린더(FMP) — 읽기·만들기·캐시를 한 곳에
//
// 예전엔 /api/market/earnings-calendar 라우트 안에만 있었다. 2026-09-30 «같은 종목의 실적일은 모든 화면에서 하나»
// (lib/earningsDate.ts 의 pickNextEarnings — FMP 캘린더 우선)로 Command·Intel·웹 티커·랭킹도 이 캘린더를 읽게 되어 여기로 옮겼다.
// 캐시 키·TTL·실패 캐시는 라우트 때와 같다(market:earnings-calendar:v4 · 6시간 · 실패 90초).
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
// ★ 값이 없으면 «빈 채로» 둔다. 인텔의 지어낸 실적일을 이번에 걷어냈으므로 추정으로 채우지 않는다.
//
// ★ 벤더 호출은 «캐시가 빌 때 한 번»뿐이다(6시간에 FMP 9~18콜 + Finnhub 시각 채우기 12콜). 읽는 곳이 늘어도 늘지 않게:
//   · 인스턴스 메모 60초 — 이 안에선 Redis 도 묻지 않는다(Command·Intel·데우기 크론이 종목마다 부른다)
//   · 만들기는 인스턴스당 하나만(single-flight) — 동시에 들어온 요청은 같은 만들기를 기다린다
//   · 실패는 Redis 실패 키(90초)와 인스턴스 메모(90초) 둘 다에 — Redis 가 막혀도 요청마다 FMP 를 다시 치지 않는다
//   · Redis 에 없는데 이 인스턴스가 6시간 안에 만든/받은 사본이 있으면 그것을 쓴다(같은 이유)
// ============================================================================

import { SECTOR_MAP } from '@/services/universePolicy';
import { getEarningsCalendar } from '@/services/finnhubClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { etDateOf } from '@/lib/marketCalendar';
import { applyNextEarnings, upcomingEarningsRows, type EarningsCandidate } from '@/lib/earningsDate';

// 응답 모양이 바뀌면(hour·quarter·year 추가) 키를 올린다 — 옛 페이로드가 200 OK 로 나간다.
// 이 캘린더엔 last_good 폴백이 없으므로 키를 올려도 휴장에 화면이 비지 않는다.
// v4 — 14일 창 분할로 9·10월이 들어왔다. 옛 v3 페이로드는 «11·12월만» 이라
//      그대로 두면 6시간 더 잘린 목록이 나간다.
export const EARNINGS_CALENDAR_CACHE_KEY = 'market:earnings-calendar:v4';
const TTL = 60 * 60 * 6;          // 6h — 발표일은 자주 안 바뀐다
/**
 * «실패 결과»의 짧은 캐시(초) — FMP 가 빈 응답(fmp-empty)·오류면 예전엔 아무것도 캐시하지 않아 요청마다 14일 창 9콜을 다시 쳤다.
 * 보는 사람 1명당 ≈18콜/분이 나갔고 그 429 가 다시 빈 응답이 되는 되먹임이었다(9/29 최종 점검① E1). 이 창 안의 요청은 FMP 를
 * 부르지 않고 같은 실패를 돌려준다(성공 캐시와 키를 나눈다 — 성공 값은 6시간 그대로). 클라이언트는 지수 백오프로 다시 묻는다.
 */
export const EARNINGS_CALENDAR_FAIL_KEY = `${EARNINGS_CALENDAR_CACHE_KEY}:fail`;
const FAIL_TTL = 90;
/** 인스턴스 메모 — 이 안에선 Redis 도 묻지 않는다 */
const MEMO_FRESH_MS = 60_000;

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

export interface EarningsCalendarPayload {
  ok: true;
  rows: EarningsRow[];
  universe: number;
  source: string;
  from: string;
  to: string;
  generatedAt: string;
  probe: Record<string, string>;
  truncated: string[];
  windows: number;
  vendorFields: string[];
  hourFilled: number;
  hourSource: string;
}

export type EarningsCalendarResult =
  | { ok: true; payload: EarningsCalendarPayload; cache: 'memo' | 'hit' | 'miss' }
  | { ok: false; reason: string; probe?: Record<string, string>; failedAt?: string; cache: 'fail-hit' | 'miss' };

let memo: { at: number; payload: EarningsCalendarPayload } | null = null;
let failMemo: { at: number; reason: string; probe?: Record<string, string>; failedAt: string } | null = null;
let building: Promise<EarningsCalendarResult> | null = null;

/** 시험용 — 인스턴스 메모를 비운다(시간이 흐른 것처럼) */
export function _resetEarningsCalendarMemo(): void { memo = null; failMemo = null; building = null; }

/** 'YYYY-MM-DD' + n일 (달력 계산 — 시간대 무관) */
function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function youngerThanTtl(p: EarningsCalendarPayload | null | undefined, nowMs: number): boolean {
  const at = Date.parse(String(p?.generatedAt ?? ''));
  return Number.isFinite(at) && nowMs - at >= 0 && nowMs - at < TTL * 1000;
}

/**
 * 캘린더 한 벌 — 메모 → Redis(6시간) → 실패 캐시(90초) → 만들기(인스턴스당 하나).
 *   fresh: 캐시를 건너뛰고 다시 만든다(?fresh=1)
 */
export async function getMarketEarningsCalendar(opts: { fresh?: boolean } = {}): Promise<EarningsCalendarResult> {
  if (!opts.fresh) {
    const now = Date.now();
    if (memo && now - memo.at >= 0 && now - memo.at < MEMO_FRESH_MS) return { ok: true, payload: memo.payload, cache: 'memo' };
    const cached = await getFromCache<EarningsCalendarPayload>(EARNINGS_CALENDAR_CACHE_KEY);
    if (cached) {
      memo = { at: now, payload: cached };
      return { ok: true, payload: cached, cache: 'hit' };
    }
    // Redis 에 없는데 이 인스턴스가 6시간 안에 만든/받은 사본이 있다 → Redis 쪽 문제다. 요청마다 FMP 를 치지 않는다.
    if (memo && youngerThanTtl(memo.payload, now)) return { ok: true, payload: memo.payload, cache: 'memo' };
    // 방금(90초 안) 실패했으면 FMP 를 다시 부르지 않는다(E1 — 되먹임 끊기)
    const failed = await getFromCache<any>(EARNINGS_CALENDAR_FAIL_KEY);
    if (failed && Array.isArray(failed.rows) && failed.reason) {
      return { ok: false, reason: failed.reason, probe: failed.probe, failedAt: failed.failedAt, cache: 'fail-hit' };
    }
    if (failMemo && now - failMemo.at >= 0 && now - failMemo.at < FAIL_TTL * 1000) {
      return { ok: false, reason: failMemo.reason, probe: failMemo.probe, failedAt: failMemo.failedAt, cache: 'fail-hit' };
    }
  }
  if (!building) building = buildMarketEarningsCalendar().finally(() => { building = null; });
  return building;
}

/** 실패를 짧게 남긴다 — 서버리스는 응답 뒤 쓰기를 끝내지 못할 수 있어 기다린다(작은 값) */
async function rememberFailure(reason: string, probe?: Record<string, string>): Promise<EarningsCalendarResult> {
  const failedAt = new Date(Date.now()).toISOString();
  failMemo = { at: Date.now(), reason, probe, failedAt };
  await setInCache(EARNINGS_CALENDAR_FAIL_KEY, { ok: true, rows: [], reason, ...(probe ? { probe } : {}), failedAt }, FAIL_TTL).catch(() => false);
  return { ok: false, reason, probe, failedAt, cache: 'miss' };
}

async function buildMarketEarningsCalendar(): Promise<EarningsCalendarResult> {
  try {
    const key = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
    // 키가 없으면 «빈 채로» — 다시 물어도 같으므로 실패 캐시에 남기지 않는다(예전 라우트와 같다)
    if (!key) return { ok: false, reason: 'no-key', cache: 'miss' };

    // ★ 창의 시작 = 미국 동부 «시장 날짜»(2026-09-30). 예전엔 서버 UTC 날짜라 ET 20:00(겨울 19:00) 이후에 만든 캐시엔
    //   그날(ET) 실적이 빠졌다 — 캐시가 언제 만들어졌느냐에 따라 오늘 실적(D-0)이 다음 분기로 바뀌었다.
    const today = etDateOf(Date.now());
    const HORIZON_DAYS = 120;                       // 4개월

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
    for (let off = 0; off < HORIZON_DAYS; off += CHUNK_DAYS) {
      windows.push([addDaysYmd(today, off), addDaysYmd(today, Math.min(off + CHUNK_DAYS - 1, HORIZON_DAYS))]);
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
    // ★ 상한에 닿은 창은 «반으로 쪼개 다시» 부른다.
    //   실측: 14일로 나눠도 성수기(11/01~11/14)는 4,000 에 닿았다 — Q3 실적이 몰리는 2주다.
    //   고정 폭을 더 줄이면 한산한 달에 호출만 늘어난다. 닿은 창만 스스로 쪼개는 게 맞다.
    const extra: any[][] = [];
    if (truncated.length) {
      const halves: Array<[string, string]> = [];
      for (const w of truncated) {
        const [f, t2] = w.split('~');
        const span = Math.round((Date.parse(`${t2}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000);
        const mid = addDaysYmd(f, Math.floor(span / 2));
        halves.push([f, mid], [addDaysYmd(mid, 1), t2]);
      }
      const got = await Promise.all(halves.map(async ([f, t2]) => {
        const url = `https://financialmodelingprep.com/stable/earnings-calendar?from=${f}&to=${t2}&apikey=${key}`;
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
          if (!r.ok) { probe[`${f}*`] = `http-${r.status}`; return []; }
          const j = await r.json();
          if (!Array.isArray(j)) return [];
          probe[`${f}*`] = `ok-${j.length}`;
          if (j.length >= CAP) truncated.push(`${f}~${t2} (재분할 후에도 상한)`);
          return j;
        } catch (e: any) { probe[`${f}*`] = `err-${String(e?.message || e).slice(0, 30)}`; return []; }
      }));
      extra.push(...got);
      // 잘렸던 원본 창은 «다시 받은 반쪽들»로 대체된다 — 목록에서 뺀다
      for (const w of [...truncated]) if (!w.includes('재분할')) truncated.splice(truncated.indexOf(w), 1);
    }

    const raw: any[] = [...chunks.flat(), ...extra.flat()];
    const usedUrl = 'stable';
    if (!raw.length) return rememberFailure('fmp-empty', probe);
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
    // 벤더는 답했는데 유니버스 행이 하나도 없다 — 예전엔 캐시하지 않고 돌려줘 요청마다 FMP 9콜을 다시 쳤다.
    //   읽는 곳이 늘었으므로(종목마다) 실패와 같이 90초 남긴다.
    if (!rows.length) return rememberFailure('fmp-no-universe-rows', probe);
    rows.sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));

    // ── 발표 시각 채우기 (Finnhub) ────────────────────────────────────
    // FMP 에 time 이 없으므로, «가장 임박한 12건» 만 Finnhub 으로 채운다.
    // 종목당 1콜이라 무제한으로 부르면 한도에 걸린다(실측: 10개 라우트 연속 호출 시 6개 빈 응답).
    // 캐시 미스일 때만 돌고, 실패하면 그냥 비워 둔다 — 추정하지 않는다.
    // Finnhub 을 FMP 날짜 하루로만 묻는다 — Finnhub 날짜가 다르면(다른 분기·추정일) 채우지 않는다.
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

    const payload: EarningsCalendarPayload = {
      ok: true,
      rows,
      universe: u.size,
      source: `FMP ${usedUrl} earnings-calendar`,
      from: today,
      to: addDaysYmd(today, HORIZON_DAYS),
      generatedAt: new Date(Date.now()).toISOString(),
      probe,
      truncated,          // 4,000 상한에 닿은 창 — 비어 있어야 정상
      windows: windows.length,
      vendorFields,
      hourFilled,
      hourSource: 'Finnhub (nearest 12)',
    };
    // ⚠️ 캐시에는 «브리프 없는» 원본을 넣는다(라우트가 응답 직전에만 얹는다).
    //   기다린다 — 서버리스는 응답 뒤 쓰기를 끝내지 못할 수 있고(20KB), 못 쓰면 다음 요청이 FMP 를 다시 친다.
    await setInCache(EARNINGS_CALENDAR_CACHE_KEY, payload, TTL).catch(() => false);
    memo = { at: Date.now(), payload };
    failMemo = null;
    return { ok: true, payload, cache: 'miss' };
  } catch (e: any) {
    return rememberFailure(e?.message || 'error');
  }
}

type CalendarStatus = EarningsCalendarResult['cache'] | 'unavailable' | 'timeout';

/** 캘린더 행 전체 — 못 읽으면(실패·키 없음·시간 초과) null. waitMs: 비어서 만드는 중이면 이보다 오래 기다리지 않는다(만들기는 뒤에서 계속) */
async function calendarRowsWithin(waitMs?: number): Promise<{ rows: EarningsRow[] | null; status: CalendarStatus }> {
  const p = getMarketEarningsCalendar();
  let r: EarningsCalendarResult | null;
  if (waitMs != null) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((res) => {
      timer = setTimeout(() => res(null), waitMs);
      (timer as any)?.unref?.();
    });
    r = await Promise.race([p, timeout]);
    if (timer) clearTimeout(timer);
    if (!r) return { rows: null, status: 'timeout' };
  } else {
    r = await p;
  }
  if (!r.ok) return { rows: null, status: r.cache === 'fail-hit' ? 'fail-hit' : 'unavailable' };
  return { rows: r.payload.rows || [], status: r.cache };
}

/**
 * 한 종목의 캘린더 행 — 캘린더를 못 읽으면(실패·키 없음·시간 초과) null.
 *   waitMs: 캐시가 비어 만들기가 도는 동안 이보다 오래 기다리지 않는다(화면 출구용 — 만들기는 뒤에서 계속된다)
 */
export async function earningsCalendarRowsFor(
  ticker: string,
  opts: { waitMs?: number } = {},
): Promise<{ rows: EarningsRow[] | null; status: CalendarStatus }> {
  const T = String(ticker || '').toUpperCase();
  const c = await calendarRowsWithin(opts.waitMs);
  return { rows: c.rows ? c.rows.filter((x) => x.ticker === T) : null, status: c.status };
}

/**
 * 섹터 실적 캘린더(웹 Intel — /api/<섹터>/calendar · /api/intel/m7-calendar)의 Finnhub 행 목록을 공용 규칙으로 바꾼다.
 *   종목마다 FMP 캘린더 행(없으면 Finnhub 행) — 모양은 Finnhub EarningsEvent 그대로(symbol·date·hour·epsEstimate…)에 dateSource.
 *   해외 원주 행(2330.TW · ASML.AS 등 — EPS 가 TWD/EUR)은 버린다(요청한 종목 이름과 같은 행만).
 */
export async function unifyEarningsList(
  tickers: string[],
  finnhubRows: Array<Record<string, any>> | null | undefined,
  opts: { waitMs?: number; nowMs?: number } = {},
): Promise<Array<Record<string, any>>> {
  const { rows } = await calendarRowsWithin(opts.waitMs);
  const todayET = etDateOf(opts.nowMs ?? Date.now());
  const out: Array<Record<string, any>> = [];
  for (const t of tickers) {
    const T = String(t || '').toUpperCase();
    if (!T) continue;
    const fin = (finnhubRows || []).filter((e) => String(e?.symbol ?? '').toUpperCase() === T);
    const fmp = rows ? rows.filter((x) => x.ticker === T) : [];
    for (const n of upcomingEarningsRows({ fmp: fmp as EarningsCandidate[], finnhub: fin as EarningsCandidate[] }, todayET)) {
      out.push({
        symbol: T, date: n.date, hour: n.hour,
        epsEstimate: n.epsEstimate, epsActual: n.epsActual,
        revenueEstimate: n.revenueEstimate, revenueActual: null,
        quarter: n.quarter, year: n.year, dateSource: n.source,
      });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? String(a.symbol).localeCompare(String(b.symbol)) : String(a.date).localeCompare(String(b.date))));
}

/**
 * 이미 만든 실적 카드(Finnhub·DynamoDB 출처)에 공용 규칙(pickNextEarnings)을 입힌다 — 화면 출구용.
 *   캘린더를 못 읽으면 카드 날짜는 그대로 두고 D-n·라벨·색만 오늘(ET) 기준으로 다시 센다.
 */
export async function resolveEarningsCard<T extends Record<string, any>>(
  ticker: string,
  card: T | null | undefined,
  opts: { waitMs?: number; nowMs?: number } = {},
): Promise<(T & Record<string, any>) | null | undefined> {
  if (!ticker || !card || typeof card !== 'object') return card;
  const T = String(ticker).toUpperCase();
  const [{ rows }, finnhub] = await Promise.all([
    earningsCalendarRowsFor(T, { waitMs: opts.waitMs }),
    liveEarningsEvents(T),
  ]);
  return applyNextEarnings(card, rows as EarningsCandidate[] | null, opts.nowMs ?? Date.now(), finnhub);
}

/**
 * /api/live/earnings 가 캐시(swr:earnings:<T>)에 담은 Finnhub 행 — 요청한 심볼과 같은 상장만(해외 원주 행은 그 라우트가 거른다).
 *   화면 출구(unified·웹 티커)가 카드의 시각·분기를 Command 와 같은 행에서 보태게 한다(벤더 호출 없음 · 레디스 읽기 1번).
 *   캐시가 없거나 옛 모양(events 없음)이면 null — 그땐 예전처럼 카드 자신의 행.
 */
async function liveEarningsEvents(T: string): Promise<EarningsCandidate[] | null> {
  try {
    const c = await getFromCache<{ data?: { events?: unknown } }>(`swr:earnings:${T}`);
    const ev = c?.data?.events;
    return Array.isArray(ev) ? (ev as EarningsCandidate[]) : null;
  } catch {
    return null;
  }
}
