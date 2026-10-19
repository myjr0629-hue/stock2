/**
 * «OI · 35일 전 만기» 대체값 — /api/app/oi-pcr 와 /api/live/ticker(flow.oiPcr)가 같은 순서·같은 검사로 쓴다(2026-10-20 NB1).
 *
 *   정본: 수집 Lambda DynamoDB gex 최신 행(35일 이내 만기 합계) — 각 라우트가 먼저 읽는다(이 모듈 밖).
 *   ① 대체 1: 옵션 EOD 묶음(intrinio:options:eod)의 callOI35/putOI35(파일 날짜 이후 35일 안 만기) — 2026-10-19 D16 그대로.
 *   ② 대체 2(마지막): 공급사 EOD 체인의 계약별 open_interest 를 «오늘(ET)~+35일 안 만기 전부»에 대해 합산한 저장본(oi35:chain:v1:{T}).
 *      앱 체인(allExpiryChain)은 만기 8개 상한이라(SPY 9일치) 35일 값이 못 된다 → 창 안 만기 목록 전체를 공급사에서 확인하고 전부 받아 센다.
 *      검사(범위·결측·0 계약·날짜 하나)는 lib/app/oiNear35.sumChainOi35 한 곳.
 *
 * 호출량: 사용자 경로는 저장본 «읽기»만 한다. 계산(buildChainOi35)은 /api/app/oi-pcr 가 저장본이 없을 때만, 종목당 Redis 잠금(SET NX)·실패 쉼(15분)·
 *   사용자 429 직후 건너뜀·동시 2콜로 한다. 성공본은 그날(ET) 창 기준으로 하루 쓴다 — 미결제약정은 하루 한 번(OCC 야간 정산) 바뀐다.
 */
import { getFromCache, setInCache } from '@/services/redisClient';
import { prevTradingDate, etDateOf } from '@/lib/marketCalendar';
import { etWallTimeToMs } from '@/lib/marketSession';
import { lastCompletedSessionDate } from '@/lib/sessionArchive';
import { sumChainOi35, validStoredOi35, oi35WindowEnd, strictOi, addDaysYmd, OI35_MAX_EXPIRIES, type ChainOiRow, type Oi35Value } from '@/lib/app/oiNear35';

export type Oi35Fallback = {
    pcr: number;
    callOI: number;
    putOI: number;
    basis: 'oi_near_expiries_35d_eod' | 'oi_near_expiries_35d_chain';
    /** 공급사 EOD 레코드 날짜(D) */
    recordDate: string;
    /** OI 기준일 = D−1 마감(레코드 D 의 OI 는 D 아침 OCC 공표분) */
    oiDate: string;
    /** 값의 시각 = 레코드 날짜 정규장 마감(ms) */
    asOf: number;
};

export const CHAIN_OI35_KEY = (t: string) => `oi35:chain:v1:${t}`;
export const CHAIN_OI35_NEG_KEY = (t: string) => `oi35:chain:neg:v1:${t}`;
export const CHAIN_OI35_LOCK_KEY = (t: string) => `oi35:chain:lock:v1:${t}`;
export const CHAIN_OI35_TTL_SEC = 26 * 3600;
export const CHAIN_OI35_NEG_TTL_SEC = 15 * 60;
export const CHAIN_OI35_LOCK_TTL_SEC = 120;
const CHAIN_FETCH_CONCURRENCY = 2;

/** 묶음이 «지금 값»으로 쓸 만큼 새것인가 — 마지막 완료 세션이거나 그 한 세션 전(공급사 EOD 는 마감 뒤 저녁에 온다)까지만(관문 2차) */
function minRecordDate(nowMs: number): string {
    return prevTradingDate(lastCompletedSessionDate(nowMs));
}

let eodMemo: { at: number; data: any } | null = null;
/** 시험 전용 */
export function _resetOi35Memo(): void { eodMemo = null; }

/** ① 옵션 EOD 묶음의 «가까운 만기 35일» 합계(2026-10-19 D16 의 oi-pcr 대체 — 같은 검사). 묶음은 인스턴스당 5분 기억(크다). */
export async function eodNear35(t: string, nowMs: number = Date.now()): Promise<Oi35Fallback | null> {
    try {
        if (!eodMemo || nowMs - eodMemo.at > 5 * 60 * 1000 || nowMs < eodMemo.at) eodMemo = { at: nowMs, data: await getFromCache<any>('intrinio:options:eod') };
        const d = eodMemo.data;
        const v = d?.tickers?.[t] ?? (d?.stale?.[t] && typeof d.stale[t].date === 'string' ? d.stale[t] : null);
        const date = d?.tickers?.[t] ? d?.date : v?.date;
        // 결측(null·""·음수)은 0 이 아니다 — Number(null)=0·Number("")=0 이라 예전엔 풋 결측이 P/C 0(→ OPI 95)이 됐다(관문 10200328 ①).
        //   체인 합산과 같은 규칙: 콜·풋 둘 다 측정값이고 0 보다 커야 한다(한쪽 0 = P/C 0·무한대 같은 극단값).
        const c = strictOi(v?.callOI35), p = strictOi(v?.putOI35);
        if (!v || typeof date !== 'string' || c == null || p == null || !(c > 0) || !(p > 0)) return null;
        if (date < minRecordDate(nowMs)) return null;
        return {
            pcr: Math.round((p / c) * 100) / 100, callOI: c, putOI: p, basis: 'oi_near_expiries_35d_eod',
            recordDate: date, oiDate: prevTradingDate(date), asOf: etWallTimeToMs(date, 16 * 60),
        };
    } catch { return null; }
}

function fromChainValue(v: Oi35Value): Oi35Fallback {
    return {
        pcr: v.pcr, callOI: v.callOI, putOI: v.putOI, basis: 'oi_near_expiries_35d_chain',
        recordDate: v.recordDate, oiDate: v.oiDate, asOf: etWallTimeToMs(v.recordDate, 16 * 60),
    };
}

/** ② 체인 합산 저장본 읽기(공급사 호출 없음) — 오늘(ET) 창으로 만든 것·레코드가 너무 옛것이 아닌 것만 */
export async function readChainOi35(t: string, nowMs: number = Date.now()): Promise<Oi35Fallback | null> {
    try {
        const raw = await getFromCache<any>(CHAIN_OI35_KEY(t));
        const v = validStoredOi35(raw, etDateOf(nowMs), minRecordDate(nowMs));
        return v ? fromChainValue(v) : null;
    } catch { return null; }
}

/** 사용자 경로용 — ① 다음 ②(저장본 읽기만). 둘 다 없으면 null(«—»). */
export async function readOi35Fallback(t: string, nowMs: number = Date.now()): Promise<Oi35Fallback | null> {
    return (await eodNear35(t, nowMs)) ?? (await readChainOi35(t, nowMs));
}

export type ChainBuildDeps = {
    /** afterExclusive = 이 날짜 «다음»부터의 만기(공급사 after 는 배타적) */
    listExpirations: (t: string, afterExclusive: string) => Promise<string[] | null>;
    fetchExpiry: (t: string, exp: string) => Promise<{ rows: any[]; missing: boolean; truncated: boolean }>;
    setNxEx: (key: string, value: string, ttlSec: number) => Promise<boolean>;
    user429: () => Promise<'yes' | 'no' | 'unknown'>;
    getCache: (key: string) => Promise<any>;
    setCache: (key: string, value: unknown, ttlSec: number) => Promise<unknown>;
    now: () => number;
};

async function defaultDeps(): Promise<ChainBuildDeps> {
    const [{ getOptionExpirationsEodIntrinio, getOptionChainEodRowsIntrinio }, meter] = await Promise.all([
        import('@/services/intrinioClient'),
        import('@/lib/intrinioMeter'),
    ]);
    return {
        listExpirations: getOptionExpirationsEodIntrinio,
        fetchExpiry: getOptionChainEodRowsIntrinio,
        setNxEx: (k, v, s) => meter.upstashMeterStore.setNxEx(k, v, s),
        user429: async () => (await meter.userRecent429()).state,
        getCache: (k) => getFromCache<any>(k),
        setCache: (k, v, s) => setInCache(k, v, s),
        now: () => Date.now(),
    };
}

/** 공급사 EOD 체인 한 행 → 합산 입력(원값 그대로 — 결측 판정은 sumChainOi35 가 한다) */
export function chainRowOf(row: any): ChainOiRow {
    const o = row?.option || {};
    const p = row?.prices || {};
    return { type: String(o.type || '').toLowerCase(), expiration: o.expiration, oi: p.open_interest, date: p.date };
}

/**
 * ② 계산·저장 — 저장본이 없을 때 /api/app/oi-pcr 가 부른다. 종목당 한 번에 하나(잠금), 실패하면 15분 쉼.
 * 반환: 계산한 값(저장까지 함) 또는 건너뛴/실패한 까닭.
 */
export async function buildChainOi35(t: string, injected?: Partial<ChainBuildDeps>): Promise<{ value: Oi35Fallback | null; reason: string }> {
    let deps: ChainBuildDeps;
    try { deps = { ...(await defaultDeps()), ...injected } as ChainBuildDeps; } catch { return { value: null, reason: 'deps' }; }
    const nowMs = deps.now();
    try {
        if (await deps.getCache(CHAIN_OI35_NEG_KEY(t))) return { value: null, reason: 'resting' };
        if (!(await deps.setNxEx(CHAIN_OI35_LOCK_KEY(t), String(nowMs), CHAIN_OI35_LOCK_TTL_SEC))) return { value: null, reason: 'locked' };
        if ((await deps.user429()) === 'yes') return { value: null, reason: 'user-429' };   // 사용자 시세가 먼저(10/13 사고)
        const anchor = etDateOf(nowMs);
        const end = oi35WindowEnd(anchor);
        const fail = async (reason: string) => {
            await deps.setCache(CHAIN_OI35_NEG_KEY(t), { reason, at: nowMs }, CHAIN_OI35_NEG_TTL_SEC);
            return { value: null, reason };
        };
        // 목록은 «ET 어제 이후»로 받는다(공급사 after 는 배타적). UTC 날짜로 자르면 ET 저녁(UTC 다음 날)에 ET 오늘 만기가 빠져
        //   창 안 만기 하나를 모른 채 «완전한 합계»로 통과했다(관문 10200328 ② — 13만기 중 12만기).
        const all = await deps.listExpirations(t, addDaysYmd(anchor, -1));
        if (!all) return fail('expirations-failed');
        const want = [...new Set(all.filter((e) => typeof e === 'string' && e >= anchor && e <= end))].sort();
        if (!want.length) return fail('no-expiries');
        if (want.length > OI35_MAX_EXPIRIES) return fail('too-many-expiries');
        const rows: ChainOiRow[] = [];
        let broken: string | null = null;
        for (let i = 0; i < want.length && !broken; i += CHAIN_FETCH_CONCURRENCY) {
            // 합산 도중에도 사용자 경로가 429 를 받으면 즉시 멈춘다(저장 안 함 · 쉼 없이 다음 기회에) — 관문 10200509 ②
            if (i > 0 && (await deps.user429()) === 'yes') return { value: null, reason: 'user-429' };
            const part = await Promise.all(want.slice(i, i + CHAIN_FETCH_CONCURRENCY).map((e) => deps.fetchExpiry(t, e).then((r) => ({ e, r })).catch(() => ({ e, r: null as any }))));
            for (const { e, r } of part) {
                if (!r || r.missing || r.truncated || !Array.isArray(r.rows)) { broken = `expiry:${e}:${!r ? 'error' : r.missing ? 'missing' : 'truncated'}`; break; }
                for (const row of r.rows) rows.push(chainRowOf(row));
            }
        }
        if (broken) return fail(broken);
        const res = sumChainOi35(rows, want, anchor);
        if (!res.ok) return fail(res.reason);
        if (res.value.recordDate < minRecordDate(nowMs)) return fail('record-old');
        await deps.setCache(CHAIN_OI35_KEY(t), res.value, CHAIN_OI35_TTL_SEC);
        return { value: fromChainValue(res.value), reason: 'built' };
    } catch {
        return { value: null, reason: 'error' };
    }
}
