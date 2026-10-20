/**
 * «OI · 35일 전 만기» 대체값 — /api/app/oi-pcr 와 /api/live/ticker(flow.oiPcr)가 같은 순서·같은 검사로 쓴다(2026-10-20 NB1).
 *
 *   정본: 수집 Lambda DynamoDB gex 최신 행(35일 이내 만기 합계) — 각 라우트가 먼저 읽는다(이 모듈 밖).
 *   대체 순서(운영 결정 10/20 — 정확성 우선):
 *   ① 오늘 체인 합산 저장본(oi35:chain:v1:{T}) — 공급사 EOD 체인의 계약별 open_interest 를 «오늘(ET)~+35일 안 만기 전부»에 대해 합산.
 *      앱 체인(allExpiryChain)은 만기 8개 상한이라(SPY 9일치) 35일 값이 못 된다 → 창 안 만기 목록 전체를 공급사에서 확인하고 전부 받아 센다.
 *      결측 계약이 한 건이라도 있으면 쓰지 않는다. 검사(범위·결측·0 계약·날짜 하나)는 lib/app/oiNear35.sumChainOi35 한 곳.
 *   ② 직전 정상 저장본(oi35:chain:lastgood:v1:{T}, 최대 4일 전 창) — basis …_chain_prev + 레코드 날짜·OI 기준일(D−1) 표식.
 *   ③ 옵션 EOD 묶음(intrinio:options:eod)의 callOI35/putOI35 — 결측·0·불완전 합계는 쓰지 않음. 결측 수 없는 구 저장본은 완전성 미상으로 날짜와 함께 채택.
 *   ④ 종목별 «직전 정상값»(oi35:resp:lastgood:v1:{T}) — 정상 P/C 를 낸 마지막 oi-pcr 응답(같은 35일 정의·값 시각·기준일, 원래 기준의 신선도 규칙 그대로).
 *      readOi35Fallback 밖에서 따로 읽는다(readLastGoodOi — oi-pcr·live/ticker 가 위 순서가 모두 실패한 뒤에만).
 *   ⑤ 없으면 null(«—», 0 아님).
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
    basis: 'oi_near_expiries_35d_eod' | 'oi_near_expiries_35d_chain' | 'oi_near_expiries_35d_chain_prev';
    /** 공급사 EOD 레코드 날짜(D) */
    recordDate: string;
    /** OI 기준일 = D−1 마감(레코드 D 의 OI 는 D 아침 OCC 공표분) */
    oiDate: string;
    /** 값의 시각 = 레코드 날짜 정규장 마감(ms) */
    asOf: number;
};

export const CHAIN_OI35_KEY = (t: string) => `oi35:chain:v1:${t}`;
/** 직전 정상 저장본 — 성공한 합산마다 함께 쓴다(5일). 오늘 합산이 결측 때문에 거부되면 이것을 기준일과 함께 쓴다. */
export const CHAIN_OI35_PREV_KEY = (t: string) => `oi35:chain:lastgood:v1:${t}`;
export const CHAIN_OI35_PREV_TTL_SEC = 5 * 24 * 3600;
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
        // 구 저장본(세 필드 모두 없음)은 완전성 미상으로 호환. 새 메타데이터는 양쪽 결측 수 0을 확인해야 한다.
        const hasCompleteness = ['callOI35Missing', 'putOI35Missing', 'oi35Complete'].some((k) => Object.prototype.hasOwnProperty.call(v, k));
        if (hasCompleteness && ((v.oi35Complete !== undefined && v.oi35Complete !== true) || strictOi(v.callOI35Missing) !== 0 || strictOi(v.putOI35Missing) !== 0)) return null;
        if (date < minRecordDate(nowMs)) return null;
        return {
            pcr: Math.round((p / c) * 100) / 100, callOI: c, putOI: p, basis: 'oi_near_expiries_35d_eod',
            recordDate: date, oiDate: prevTradingDate(date), asOf: etWallTimeToMs(date, 16 * 60),
        };
    } catch { return null; }
}

function fromChainValue(v: Oi35Value, basis: Oi35Fallback['basis'] = 'oi_near_expiries_35d_chain'): Oi35Fallback {
    return {
        pcr: v.pcr, callOI: v.callOI, putOI: v.putOI, basis,
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

/**
 * ②-b 직전 정상 저장본(오늘 이전 창, 최대 4일) — 오늘 합산이 결측 계약 때문에 거부됐거나 아직 없을 때. basis 로 «직전»임을 밝히고
 * 레코드 날짜(recordDate)·OI 기준일(oiDate)을 그대로 싣는다. 레코드는 지금 기준보다 한 세션까지 더 옛것을 허용(날짜 표식과 함께 쓰므로).
 */
export async function readPrevChainOi35(t: string, nowMs: number = Date.now()): Promise<Oi35Fallback | null> {
    try {
        const raw = await getFromCache<any>(CHAIN_OI35_PREV_KEY(t));
        const v = validStoredOi35(raw, etDateOf(nowMs), prevTradingDate(minRecordDate(nowMs)), 'prev');
        return v ? fromChainValue(v, 'oi_near_expiries_35d_chain_prev') : null;
    } catch { return null; }
}

/**
 * 사용자 경로용(저장본 읽기만, 공급사 호출 없음) — 운영 결정(10/20) 순서:
 *   오늘 체인 합산(결측 0건) → 직전 정상 저장본(+기준일) → 옵션 EOD 35일 → 없으면 null(«—», 0 아님).
 */
export async function readOi35Fallback(t: string, nowMs: number = Date.now()): Promise<Oi35Fallback | null> {
    return (await readChainOi35(t, nowMs)) ?? (await readPrevChainOi35(t, nowMs)) ?? (await eodNear35(t, nowMs));
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
            // (첫 묶음 전에도 — 만기 목록을 기다리는 동안 429 가 났을 수 있다, 관문 10200520 ③)
            if ((await deps.user429()) === 'yes') return { value: null, reason: 'user-429' };
            const part = await Promise.all(want.slice(i, i + CHAIN_FETCH_CONCURRENCY).map((e) => deps.fetchExpiry(t, e).then((r) => ({ e, r })).catch(() => ({ e, r: null as any }))));
            for (const { e, r } of part) {
                if (!r || r.missing || r.truncated || !Array.isArray(r.rows)) { broken = `expiry:${e}:${!r ? 'error' : r.missing ? 'missing' : 'truncated'}`; break; }
                for (const row of r.rows) rows.push(chainRowOf(row));
            }
        }
        if (broken) return fail(broken);
        // 마지막 묶음 중에 429 가 났으면(어댑터 재시도 포함) 저장하지 않는다 — 관문 10200537 ③
        if ((await deps.user429()) === 'yes') return { value: null, reason: 'user-429' };
        const res = sumChainOi35(rows, want, anchor);
        if (!res.ok) return fail(res.reason);
        if (res.value.recordDate < minRecordDate(nowMs)) return fail('record-old');
        await deps.setCache(CHAIN_OI35_KEY(t), res.value, CHAIN_OI35_TTL_SEC);
        await deps.setCache(CHAIN_OI35_PREV_KEY(t), res.value, CHAIN_OI35_PREV_TTL_SEC);
        return { value: fromChainValue(res.value), reason: 'built' };
    } catch {
        return { value: null, reason: 'error' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// [2026-10-20 SPY 장중 결측 핫픽스] 종목별 «직전 정상값» — 정상 P/C 를 낸 마지막 /api/app/oi-pcr 응답(행 수량 또는 35일 대체).
//   행·오늘 체인·직전 체인 저장본·EOD 35일이 모두 못 낼 때 마지막으로 쓴다(대표 «지표에 빈 값이 나오는 것은 말도 안 된다»).
//   같은 정의(35일 안 만기)만 저장한다 — basis 가 아래 목록 밖이면 쓰지도 읽지도 않는다(다른 만기 범위로 메우지 않음).
//   값의 시각(asOf)·레코드 날짜·OI 기준일을 그대로 싣고, 값 시각이 5일(수집 행 신선도와 같은 상한)을 넘으면 쓰지 않는다.
//   쓰기는 /api/app/oi-pcr 만(응답에 콜·풋 수량이 다 있는 곳) — 같은 값이면 인스턴스당 10분에 한 번.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const OI_PCR_LASTGOOD_KEY = (t: string) => `oi35:resp:lastgood:v1:${t}`;
export const OI_PCR_LASTGOOD_TTL_SEC = 5 * 24 * 3600;
export const OI_PCR_LASTGOOD_MAX_AGE_MS = 5 * 24 * 3600_000;
const LASTGOOD_REWRITE_MS = 10 * 60_000;
export const OI35_DEFINITION_BASES = [
    'oi_all_expiries_35d', 'oi_near_expiries_35d_eod', 'oi_near_expiries_35d_chain', 'oi_near_expiries_35d_chain_prev',
] as const;

export type LastGoodOi = {
    pcr: number;
    callOI: number;
    putOI: number;
    contracts: number | null;
    basis: (typeof OI35_DEFINITION_BASES)[number];
    /** 값의 시각(ms) — 행 시각 또는 대체값의 레코드 마감 */
    asOf: number;
    eodDate: string | null;
    oiDate: string | null;
    /** 저장 시각(ms) */
    savedAt: number;
};

const lastGoodMemo = new Map<string, { sig: string; at: number }>();
/** 시험 전용 */
export function _resetLastGoodMemo(): void { lastGoodMemo.clear(); }

/** 저장본 검사 — 통과하면 값, 아니면 null(결측·다른 정의·옛 값·미래 시각) */
export function validLastGoodOi(v: any, nowMs: number): LastGoodOi | null {
    if (!v || typeof v !== 'object') return null;
    if (!(OI35_DEFINITION_BASES as readonly string[]).includes(v.basis)) return null;
    const pcr = typeof v.pcr === 'number' && Number.isFinite(v.pcr) && v.pcr > 0 ? v.pcr : null;
    const c = strictOi(v.callOI), p = strictOi(v.putOI);
    const asOf = typeof v.asOf === 'number' && Number.isFinite(v.asOf) ? v.asOf : NaN;
    if (pcr == null || c == null || p == null || !(asOf > 0)) return null;
    if (nowMs - asOf > OI_PCR_LASTGOOD_MAX_AGE_MS || asOf - nowMs > 3600_000) return null;
    const ymd = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    // 원래 기준의 신선도 규칙을 그대로 — 직전 정상값이 그 규칙이 거부할 값을 «지금 값»처럼 내지 않게:
    //   행 = 5일(isFreshOptionsRow 와 같은 상한, 위) · 오늘 체인·EOD 35일 = 레코드가 minRecordDate 이후 · 직전 체인 = 한 세션 더(readPrevChainOi35 와 같다)
    if (v.basis !== 'oi_all_expiries_35d') {
        const rec = ymd(v.eodDate);
        if (!rec) return null;
        const min = minRecordDate(nowMs);
        if (rec < (v.basis === 'oi_near_expiries_35d_chain_prev' ? prevTradingDate(min) : min)) return null;
    }
    return {
        pcr, callOI: c, putOI: p, contracts: strictOi(v.contracts), basis: v.basis, asOf,
        eodDate: ymd(v.eodDate), oiDate: ymd(v.oiDate), savedAt: typeof v.savedAt === 'number' ? v.savedAt : 0,
    };
}

/** 정상 응답을 직전 정상값으로 남긴다(실패는 삼킨다 — 응답을 막지 않는다) */
export async function rememberLastGoodOi(t: string, v: Omit<LastGoodOi, 'savedAt'>, nowMs: number = Date.now()): Promise<void> {
    try {
        const rec = validLastGoodOi({ ...v, savedAt: nowMs }, nowMs);
        if (!rec) return;
        const sig = `${rec.basis}|${rec.asOf}|${rec.pcr}|${rec.callOI}|${rec.putOI}`;
        const m = lastGoodMemo.get(t);
        if (m && m.sig === sig && nowMs - m.at < LASTGOOD_REWRITE_MS && nowMs >= m.at) return;
        lastGoodMemo.set(t, { sig, at: nowMs });
        await setInCache(OI_PCR_LASTGOOD_KEY(t), rec, OI_PCR_LASTGOOD_TTL_SEC);
    } catch { /* 안전망 쓰기 실패는 응답과 무관 */ }
}

/** 직전 정상값 읽기(공급사 호출 없음) — 모든 대체가 실패했을 때만 부른다 */
export async function readLastGoodOi(t: string, nowMs: number = Date.now()): Promise<LastGoodOi | null> {
    try { return validLastGoodOi(await getFromCache<any>(OI_PCR_LASTGOOD_KEY(t)), nowMs); } catch { return null; }
}
