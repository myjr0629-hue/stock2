// ============================================================================
// REAL·신용스프레드 «같은 계열» FRED 폴백 (2026-10-22 장중 핫픽스)
// ----------------------------------------------------------------------------
// 왜: Intrinio 경제계열($DGS10·$T5YIE·$BAMLH0A0HYM2)은 FRED 계열을 그대로 옮긴 것이다. 10/21 장중 Intrinio 분당 한도(429)가
//   포화되자 세 계열 조회가 전부 실패해 /api/market/macro 의 REAL·creditSpread 가 몇 시간 연속 빠졌고,
//   보관본(마지막 정상 관측)조차 만들 기회가 없었다.
// 어떻게: Intrinio 가 «실패했을 때만» FRED 원본에서 같은 계열·같은 계산으로 만든다(새 정의 0, 지어내는 값 0).
//   · 신용스프레드: intrinioClient.getCreditSpread 와 같은 계산(최신순 260행·20행 전 대비·1년 백분위·0.05%p 잡음)
//   · REAL: macroHubProvider.realYieldFromSameDatePair 와 같은 계산(같은 날짜 DGS10−T5YIE·10일 이내·fromPair)
// 키가 없거나 실패하면 null — 호출자는 기존처럼 보관본 잇기로 넘어간다.
// ============================================================================
import type { MacroSnapshot } from '@/services/macroHubProvider';

type Obs = { date: string; v: number };
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_TIMEOUT_MS = 5000;

/** FRED 관측(최신순). "." 등 결측은 버린다. */
async function fredObservations(seriesId: string, limit: number): Promise<Obs[]> {
    const key = process.env.FRED_API_KEY || '';
    const note = (status: number | null, rows: Obs[] | null, reason: string) => console.warn('[FRED 경제계열]', {
        계열: seriesId, 코드: status, 행수: rows?.length ?? null,
        최신관측일: rows?.map(r => r.date).sort().at(-1) ?? null, 상태: reason,
    });
    if (!key) { note(null, null, '키 미설정'); return []; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FRED_TIMEOUT_MS);
    let status: number | null = null;
    try {
        const url = `${FRED_BASE_URL}?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`;
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        status = res.status;
        if (!res.ok) { note(status, null, 'HTTP 오류'); return []; }
        const data = await res.json();
        const rows = parseFredObservations(data?.observations);
        note(status, rows, rows.length ? '정상' : '빈 응답');
        return rows;
    } catch (e: any) {
        note(status, null, e?.name === 'AbortError' ? '타임아웃' : '요청 실패');
        return [];
    } finally {
        clearTimeout(timer);
    }
}

export function parseFredObservations(rows: unknown): Obs[] {
    if (!Array.isArray(rows)) return [];
    return rows
        .filter((r: any) => typeof r?.value === 'string' && r.value.trim() !== '' && r.value.trim() !== '.')
        .map((r: any) => ({ date: String(r?.date || ''), v: Number(r.value) }))
        .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.v));
}

/** intrinioClient.getCreditSpread 와 같은 계산(입력은 최신순) */
export function creditSpreadFromSeries(series: Obs[]): NonNullable<MacroSnapshot['creditSpread']> | null {
    if (series.length < 5) return null;
    const cur = series[0];
    const prior = series[Math.min(20, series.length - 1)];
    const change20d = prior ? Math.round((cur.v - prior.v) * 1000) / 1000 : null;
    const vals = series.map((r) => r.v).sort((a, b) => a - b);
    const below = vals.filter((v) => v < cur.v).length;
    const percentile = vals.length >= 60 ? Math.round((below / vals.length) * 100) : null;
    const regime: 'TIGHTENING' | 'STABLE' | 'WIDENING' =
        change20d == null || Math.abs(change20d) < 0.05 ? 'STABLE'
            : change20d > 0 ? 'WIDENING' : 'TIGHTENING';
    return { value: cur.v, date: cur.date, change20d, percentile, regime };
}

/** realYieldFromSameDatePair 와 같은 계산(입력은 최신순) */
export function realPairFromSeries(dgs10: Obs[], t5yie: Obs[], nowMs: number): NonNullable<MacroSnapshot['realYieldObserved']> | null {
    const exp = new Map(t5yie.map((r) => [r.date, r.v]));
    const pair = dgs10.find((r) => exp.has(r.date) && Number.isFinite(r.v) && Number.isFinite(exp.get(r.date)!));
    if (!pair) return null;
    const ageDays = (nowMs - Date.parse(pair.date + 'T00:00:00Z')) / 86400000;
    if (!Number.isFinite(ageDays) || ageDays > 10) return null;
    const us10y = pair.v;
    const inflationExpectation = exp.get(pair.date)!;
    const realYield = us10y - inflationExpectation;
    let stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE' = 'NEUTRAL';
    if (realYield > 1.5) stance = 'TIGHT';
    else if (realYield < 0) stance = 'LOOSE';
    return { us10y, inflationExpectation, realYield, stance, asOf: pair.date, fromPair: true };
}

// 일간 계열 — 인스턴스당: 성공은 10분 기억, 실패는 2분 동안 다시 묻지 않음, 진행 중 요청은 함께 기다림.
//   Intrinio 장애가 길어도·동시 요청이 몰려도 FRED 호출은 인스턴스당 묶음별 «동시에 1건»을 넘지 않는다.
const MEMO_MS = 10 * 60_000;
const FAIL_BACKOFF_MS = 2 * 60_000;

export function memoized<T>(load: () => Promise<T | null>): () => Promise<T | null> {
    let ok: { at: number; v: T } | null = null;
    let failAt = 0;
    let inflight: Promise<T | null> | null = null;
    return () => {
        const now = Date.now();
        if (ok && now - ok.at < MEMO_MS) return Promise.resolve(ok.v);
        if (inflight) return inflight;
        if (now - failAt < FAIL_BACKOFF_MS) return Promise.resolve(null);
        inflight = load()
            .then((v) => { if (v) ok = { at: Date.now(), v }; else failAt = Date.now(); return v; })
            .catch(() => { failAt = Date.now(); return null; })
            .finally(() => { inflight = null; });
        return inflight;
    };
}

export const fredCreditSpread = memoized<NonNullable<MacroSnapshot['creditSpread']>>(
    async () => creditSpreadFromSeries(await fredObservations('BAMLH0A0HYM2', 260)),
);

export const fredRealPair = memoized<NonNullable<MacroSnapshot['realYieldObserved']>>(async () => {
    const [dgs10, t5yie] = await Promise.all([fredObservations('DGS10', 10), fredObservations('T5YIE', 10)]);
    return realPairFromSeries(dgs10, t5yie, Date.now());
});
