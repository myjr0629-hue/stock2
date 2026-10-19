/**
 * «OI · 35일 전 만기» 합계를 옵션 체인 계약 목록에서 직접 센다 — 순수 함수(네트워크·Redis 없음). 시험 tests/oiNear35.test.ts
 *
 * 왜 (2026-10-20 NB1): 화면의 미결제약정 P/C 는 수집 Lambda 행(35일 이내 만기 합계) 하나가 정본인데, SPY·QQQ 처럼 행에 OI 합계가 빠지는 날
 *   EOD 묶음(intrinio:options:eod)에도 callOI35/putOI35 가 없으면 값이 null → Flow OPI 가 0.0 «BEARISH» 로 그려졌다(대표: «지표에 빈 값은 말도 안 된다»).
 *   마지막 대체로 공급사 EOD 체인의 계약별 open_interest 를 «35일 안 만기 전부»에 대해 합산한다.
 *
 * 정직하게 쓰는 조건(관문 10200109·10200204·10200222 의 재현 입력을 전부 막는다):
 *   ① 범위 — 창(오늘 ET ~ +35일) 안의 «모든» 만기가 체인에 있어야 한다. 앱 체인(allExpiryChain)은 만기 8개 상한이라
 *      SPY 는 9일치뿐 → 그것만으로는 35일 값이 아니다(일부 만기 합계로 메우지 않는다 · 전 만기 합계로도 메우지 않는다).
 *   ② 결측 — open_interest 가 숫자(또는 숫자 문자열)·0 이상일 때만 센다. 빈 문자열·null·음수·NaN 은 0 이 아니라 «결측»이다.
 *      결측은 «그날 새로 상장된 만기»에서만 받아 준다 — 그 밖의 만기에 결측이 한 계약이라도 있으면 값 전체를 내지 않는다
 *      (한 계약의 큰 OI 가 빠져 P/C·OPI 방향이 뒤집히는 것을 막는다 — 관문 10200353: 풋 2,550 하나가 null 이면 P/C 3.00 → 0.45).
 *      «새로 상장된 만기» = 그 만기 계약의 절반 이상이 결측 + 그 만기의 나머지(측정된) OI 가 창 전체 측정 OI 의 1% 이하.
 *      근거(실측 2026-10-19 SPY, 레코드 10/16): 10/29 만기는 OCC 가 아직 OI 를 내지 않아 298계약 중 238계약이 null, 측정된 60계약 OI 4,438 = 창 전체의 0.07%.
 *      상장 전날(D−1 마감)엔 포지션이 없으므로 합계에 넣을 수량이 없다. 큰 만기가 공급사 오류로 비면 측정분이 1% 를 넘어 거부된다.
 *   ③ 0 계약 — 콜 합계·풋 합계가 둘 다 0 보다 커야 한다(한쪽이 0 이면 P/C 0·무한대 같은 허위 극단값이 된다).
 *   ④ 날짜 — 창 안 계약의 레코드 날짜(공급사 EOD 날짜)가 하나여야 한다. 날짜 없는 계약이 있거나 날짜가 둘 이상이면 내지 않는다(서로 다른 날의 OI 를 섞지 않는다).
 *   ⑤ 기준일 — 레코드 D 의 OI 는 D 아침 OCC 공표 = D−1 마감 포지션(메모리 oi-record-date-is-previous-session). 값의 날짜는 oiDate = D−1.
 */
import { prevTradingDate } from '@/lib/marketCalendar';

export const OI35_WINDOW_DAYS = 35;
/** «새로 상장된 만기» 판정 — 그 만기 계약 중 결측 비율 하한 · 그 만기 측정 OI 의 창 전체 대비 상한 */
export const OI35_NEW_LISTING_MIN_MISSING = 0.5;
export const OI35_NEW_LISTING_MAX_OI_SHARE = 0.01;
/** 창 안 만기가 이보다 많으면 비정상(공급사 목록 오류)으로 보고 내지 않는다 — 호출량 상한도 겸한다 */
export const OI35_MAX_EXPIRIES = 45;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function addDaysYmd(ymd: string, n: number): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.toISOString().slice(0, 10);
}

/** 창의 끝(포함) — 오늘(ET) + 35일 */
export function oi35WindowEnd(anchor: string): string {
    return addDaysYmd(anchor, OI35_WINDOW_DAYS);
}

/** 측정된 미결제약정 수량. 빈 문자열·공백·null·음수·NaN·무한대 = null(결측). 숫자 0 은 0. */
export function strictOi(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
    if (typeof v === 'string') {
        const s = v.trim();
        if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
        const n = Number(s);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
}

export type ChainOiRow = {
    type: unknown;            // 'call' | 'put'
    expiration: unknown;      // 'YYYY-MM-DD'
    oi: unknown;              // 공급사 open_interest 원값
    date?: unknown;           // 공급사 EOD 레코드 날짜 'YYYY-MM-DD'
};

export type Oi35Value = {
    callOI: number;
    putOI: number;
    pcr: number;              // 풋÷콜, 소수 둘째 자리
    recordDate: string;       // 공급사 EOD 레코드 날짜(D)
    oiDate: string;           // OI 기준일 = D−1 마감
    anchor: string;           // 창 시작(오늘 ET)
    windowEnd: string;        // 창 끝(포함)
    expiries: number;         // 창 안 만기 수
    contracts: number;        // 센 계약 수
    missingOi: number;        // 결측이라 뺀 계약 수
};

export type Oi35Result = { ok: true; value: Oi35Value } | { ok: false; reason: string };

/**
 * expected = 공급사 만기 목록 전체(창 밖 포함 가능) — 창 안 만기가 전부 rows 에 있어야 한다.
 * rows = 그 만기들의 계약(창 밖 계약은 무시).
 */
export function sumChainOi35(rows: ChainOiRow[], expected: string[], anchor: string): Oi35Result {
    if (!YMD.test(anchor)) return { ok: false, reason: 'anchor' };
    const end = oi35WindowEnd(anchor);
    const inWin = (e: unknown): e is string => typeof e === 'string' && YMD.test(e) && e >= anchor && e <= end;
    const want = [...new Set((Array.isArray(expected) ? expected : []).filter(inWin))].sort();
    if (!want.length) return { ok: false, reason: 'no-expiries' };
    if (want.length > OI35_MAX_EXPIRIES) return { ok: false, reason: 'too-many-expiries' };
    const seen = new Set<string>();
    const dates = new Set<string>();
    let callOI = 0, putOI = 0, counted = 0, missing = 0, total = 0, undated = 0;
    const byExp = new Map<string, { n: number; miss: number; oi: number }>();
    for (const r of Array.isArray(rows) ? rows : []) {
        if (!r || !inWin(r.expiration)) continue;
        const type = String(r.type ?? '').toLowerCase();
        if (type !== 'call' && type !== 'put') continue;
        total++;
        seen.add(r.expiration);
        const ex = byExp.get(r.expiration) ?? { n: 0, miss: 0, oi: 0 };
        byExp.set(r.expiration, ex);
        ex.n++;
        if (typeof r.date === 'string' && YMD.test(r.date)) dates.add(r.date); else undated++;
        const oi = strictOi(r.oi);
        if (oi == null) { missing++; ex.miss++; continue; }
        counted++;
        ex.oi += oi;
        if (type === 'call') callOI += oi; else putOI += oi;
    }
    const absent = want.filter((e) => !seen.has(e));
    if (absent.length) return { ok: false, reason: `coverage:${absent.length}/${want.length}` };
    if (undated > 0) return { ok: false, reason: 'undated' };
    if (dates.size !== 1) return { ok: false, reason: `dates:${dates.size}` };
    if (total === 0) return { ok: false, reason: 'no-contracts' };
    const knownTotal = callOI + putOI;
    for (const [e, x] of byExp) {
        if (x.miss === 0) continue;
        const newListing = x.miss / x.n >= OI35_NEW_LISTING_MIN_MISSING && knownTotal > 0 && x.oi / knownTotal <= OI35_NEW_LISTING_MAX_OI_SHARE;
        if (!newListing) return { ok: false, reason: `missing-oi:${e}:${x.miss}/${x.n}` };
    }
    if (!(callOI > 0) || !(putOI > 0)) return { ok: false, reason: 'zero-side' };
    const recordDate = [...dates][0];
    return {
        ok: true,
        value: {
            callOI, putOI, pcr: Math.round((putOI / callOI) * 100) / 100,
            recordDate, oiDate: prevTradingDate(recordDate),
            anchor, windowEnd: end, expiries: want.length, contracts: counted, missingOi: missing,
        },
    };
}

/** 저장본(캐시) 검사 — 모양·수량·창 기준일이 오늘인지·레코드가 너무 옛것이 아닌지. 통과하면 값, 아니면 null. */
export function validStoredOi35(v: any, todayEt: string, minRecordDate: string): Oi35Value | null {
    if (!v || typeof v !== 'object') return null;
    const c = strictOi(v.callOI), p = strictOi(v.putOI);
    if (c == null || p == null || !(c > 0) || !(p > 0)) return null;
    if (v.anchor !== todayEt) return null;   // 창은 날마다 옮겨진다 — 어제 창(만기 지난 계약 포함)을 오늘 값으로 쓰지 않는다
    if (typeof v.recordDate !== 'string' || !YMD.test(v.recordDate) || v.recordDate < minRecordDate) return null;
    return {
        callOI: c, putOI: p, pcr: Math.round((p / c) * 100) / 100,
        recordDate: v.recordDate, oiDate: prevTradingDate(v.recordDate),
        anchor: v.anchor, windowEnd: oi35WindowEnd(v.anchor),
        expiries: Number(v.expiries) || 0, contracts: Number(v.contracts) || 0, missingOi: Number(v.missingOi) || 0,
    };
}
