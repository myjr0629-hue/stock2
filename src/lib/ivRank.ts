/** IV RANK 라벨 유지. 값은 IV30 일별 252거래일 백분위(엄격한 미만 비율).
 * 15분 행 개수·같은 날의 서로 다른 값은 일별 표본 수를 늘리지 않는다.
 * 원천 iv30Date와 관측 세션이 일치하는 행만 센다(전일 체인의 반복을 오늘로 옮기지 않는다).
 * 같은 정의의 252개 일별 표본이 없으면 percentile=null. ATM IV로 대체하지 않는다.
 */
import { shownRegularSessionDate, etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate } from './marketCalendar';
export const IV_RANK_WINDOW = 252;
export const IV_RANK_MIN_IV_SAMPLES = 252;
export const IV_RANK_MAX_AGE_MS = 4 * 86_400_000;
export const IV30_DEF = 'cm30-v1';
export type IvHistoryRow = { atmIv?: unknown; iv30?: unknown; iv30Def?: unknown; iv30Date?: unknown; timestamp?: unknown; totalContracts?: unknown };
export const isIvHarvestRow = (h: IvHistoryRow | null | undefined): boolean => !!h && (h.iv30Def !== undefined || h.atmIv !== undefined || h.totalContracts !== undefined);
const r2 = (n: number) => Math.round(n * 100) / 100;
export function ivLevelForRank(data: { metric?: unknown; currentIv?: unknown; _source?: unknown } | null | undefined): number | null {
    return data?._source !== 'dynamodb-stale' && data?.metric === 'iv30' && typeof data.currentIv === 'number' && Number.isFinite(data.currentIv) && data.currentIv > 0 ? data.currentIv : null;
}
export function ivSampleSession(ts: number): string | null {
    if (!Number.isFinite(ts) || ts <= 0) return null;
    const date = etDateOf(ts);
    // 장 시작 전·휴장 반복 EOD 행은 새 일별 관측이 아니다.
    return !isNonTradingDay(date) && etMinutesOf(ts) >= 570 ? date : null;
}
export function dedupeIvSamples<T extends { iv: number; ts: number; session?: string }>(desc: T[]): T[] {
    const seen = new Set<string>();
    return desc.filter(x => {
        const d = x.session ?? ivSampleSession(x.ts);
        if (!d || seen.has(d)) return false;
        seen.add(d);
        return true;
    });
}
type IvRankMeta = {
    sampleSize: number; windowRows: number; currentIv: number | null; currentIvAt: number | null;
    currentSession: string | null; periodStart: string | null; periodEnd: string | null;
    expectedStart: string | null; expectedEnd: string | null; rawIvRows: number;
};
export type IvRankResult = IvRankMeta & (
    { ok: true; percentile: number; min: number; max: number; median: number }
    | { ok: false; reason: 'insufficient' | 'insufficient-iv' | 'no-current' | 'stale' | 'collecting'; collectingRows?: number }
);
// 252거래일 창은 2025년까지 걸친다. 공용 달력의 2026~27 범위 밖인 2025년 휴장 보완(이 계산 전용).
const HOLIDAYS_2025 = new Set(['2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25']);
export function ivWindowSessions(end: string): string[] {
    const out: string[] = [];
    for (let d = end; out.length < IV_RANK_WINDOW; d = prevTradingDate(d)) {
        if (!HOLIDAYS_2025.has(d)) out.push(d);
    }
    return out;
}
export function ivRankFromHistory(rows: IvHistoryRow[] | null | undefined, opts: { nowMs?: number } = {}): IvRankResult {
    const all = (Array.isArray(rows) ? rows : []).filter(isIvHarvestRow);
    const raw = all.filter(h =>
        h.iv30Def === IV30_DEF
        && typeof h.iv30 === 'number' && Number.isFinite(h.iv30) && h.iv30 > 0
        && typeof h.timestamp === 'number' && Number.isFinite(h.timestamp)
        && typeof h.iv30Date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.iv30Date)
        && h.iv30Date === ivSampleSession(h.timestamp)
    )
        .map(h => ({ iv: h.iv30 as number, ts: h.timestamp as number, session: h.iv30Date as string }))
        .filter(h => opts.nowMs == null || h.ts <= opts.nowMs)
        .sort((a,b) => b.ts-a.ts);
    const daily = dedupeIvSamples(raw);
    const cur = daily[0];
    const end = opts.nowMs != null ? shownRegularSessionDate(opts.nowMs) : cur ? cur.session : null;
    const expected = end ? ivWindowSessions(end) : [];
    const byDate = new Map(daily.map(x => [x.session, x]));
    const samples = expected.flatMap(d => byDate.has(d) ? [byDate.get(d)!] : []);
    const dates = samples.map(x => x.session);
    const meta: IvRankMeta = {
        sampleSize: samples.length, windowRows: all.length, rawIvRows: raw.length,
        currentIv: cur ? r2(cur.iv) : null, currentIvAt: cur?.ts ?? null,
        currentSession: cur ? cur.session : null,
        periodStart: dates.at(-1) ?? null, periodEnd: dates[0] ?? null,
        expectedStart: expected.at(-1) ?? null, expectedEnd: end,
    };
    if (!cur) return { ...meta, ok: false, reason: all.length ? 'insufficient-iv' : 'insufficient' };
    if (end !== meta.currentSession) return { ...meta, ok: false, reason: 'stale' };
    if (samples.length < IV_RANK_WINDOW) return { ...meta, ok: false, reason: 'collecting', collectingRows: samples.length };
    const vals = samples.map(x => x.iv).sort((a,b)=>a-b);
    return {
        ...meta, ok: true,
        percentile: Math.round(vals.filter(v => v < cur.iv).length / IV_RANK_WINDOW * 100),
        min: r2(vals[0]), max: r2(vals.at(-1)!), median: r2((vals[125] + vals[126]) / 2),
    };
}

type Loc = 'ko' | 'en' | 'ja';
const NOT_PROVIDED: Record<Loc, string> = { ko: '미제공', en: 'N/A', ja: '未提供' };
const COLLECTING: Record<Loc, string> = { ko: '수집 중', en: 'Collecting', ja: '収集中' };
const locOf = (l?: string | null): Loc => (l === 'ko' || l === 'ja' ? l : 'en');
/** IV 랭크가 없는 칸의 글자(앱 flowEmptyStates.notProvidedText 와 같은 글자). */
export function ivRankNotProvidedText(locale?: string | null): string {
    return NOT_PROVIDED[locOf(locale)];
}
/** 새 정의(IV30) 창을 채우는 중인 칸의 글자 — «미제공»(이력 없음)과 다르다. */
export function ivRankCollectingText(locale?: string | null): string {
    return COLLECTING[locOf(locale)];
}
/** /api/flow/iv-percentile 응답이 «수집 중»(새 정의 창 축적)인가 — 실패·시간 초과·미제공은 거짓. */
export function ivRankIsCollecting(resp: unknown): boolean {
    if (!resp || typeof resp !== 'object') return false;
    const r = resp as { percentile?: unknown; _source?: unknown };
    return r.percentile == null && r._source === 'dynamodb-collecting';
}
