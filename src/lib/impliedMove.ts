/**
 * ★★ [2026-09-29] 예상 변동(Implied Move)과 벽 사이 폭(Wall Range)의 «정의 한 벌»
 *
 * [사고] 9/28 MU 가 «옵션 ±9.0%»로 나갔다. 같은 시각 10/2 만기 ATM 1055 스트래들 중간값은
 *   $83.42 / $1,053.98 = ±7.9% 였다. 같은 이름(impliedMovePct)에 정의가 셋 섞여 있었다:
 *     · 배치(watchlist·portfolio)·리포트(terminalEnricher) = (콜월 − 풋플로어) ÷ 가격 — 벽 사이 «폭»
 *     · 수집 Lambda·대시보드·FlowRadar = 다리마다 따로 고른 최근접 행사가의 «전일 종가» 합
 *     · alphaEngine.computeImpliedMovePct = ±2% 창의 «첫» 계약, 체결가 없으면 전일 종가
 *   화면·AI 프롬프트·알파 입력이 그걸 전부 «±x% 예상 변동»으로 읽었다.
 *
 * [정의]
 *   impliedMovePct = (ATM 콜 중간값 + ATM 풋 중간값) ÷ 현물 × 100
 *     · 만기  = 체인에서 minExpiry(기본: 오늘 ET) 이상 가장 가까운 만기, 또는 지정 만기(실적 뒤 첫 만기 등)
 *     · ATM   = 현물에 가장 가까운 행사가 «하나» — 콜·풋 두 다리 모두 그 행사가(두 다리가 값이 있는 첫 행사가)
 *     · 가격  = 실시간 중간값(Intrinio OptionsEdge FMV = _rtGreeks 계약의 last_quote.midpoint) → basis 'live'
 *               없으면 EOD 중간값(EOD mark·종가 호가 중간) → basis 'eod'(그 세션의 종가 값 — 화면은 «10/2 종가» 꼬리표와 함께)
 *               day.close(전일 마지막 체결)는 쓰지 않는다 — 중간값과 수십 % 다를 수 있다(MU 1055 콜 62.5 vs 41.5)
 *   wallRangePct = (콜월 − 풋플로어) ÷ 현물 × 100 — 두 OI 벽 사이 거리. 예상 변동이 아니다:
 *     «±»를 붙이지 않고, implied/expected move·내재 변동·예상 변동이라 부르지 않는다.
 *
 * [2026-10-04 «가림 0»] 장외·주말엔 실시간 중간값이 없다. 예전 설계는 EOD 값을 화면에 싣지 않아 IMP MOVE 가 전부 «—»였다.
 *   이제 화면 필드도 EOD 값을 싣되 «그 값의 세션»(impliedMoveSession = EOD 체인 날짜)을 함께 싣고, 화면은
 *   impliedMoveSessionNote 로 «10/2 종가 / 10/2 close / 10/2終値» 꼬리표를 붙인다. 장중 실시간 값은 꼬리표 없음,
 *   장이 끝난 뒤까지 남은 실시간 값은 «10/2 장중» 꼬리표. 숫자는 «언제 값인지»를 달고 다닌다.
 *
 * 순수 함수만(네트워크·캐시 없음) — 서버·클라이언트 모두 쓴다. 시험: tests/impliedMove.test.ts
 */

// 상대 경로 — Lambda 번들(build-lambda-engine.js)은 @/lib 별칭을 못 푼다. marketCalendar 는 import 가 없는 순수 모듈이다.
import { isNonTradingDay, shownRegularSessionDate } from './marketCalendar';

/** 이 정의로 계산한 값에 붙이는 표식 — 표식 없는 impliedMovePct 는 옛 정의(벽 사이 폭 등)로 보고 버린다. */
export const IMPLIED_MOVE_DEF = 'atm-straddle-mid/1' as const;

/** 'live' = 실시간 중간값 · 'eod' = 전일 EOD 중간값 */
export type ImpliedMoveBasis = 'live' | 'eod';

export interface ImpliedMove {
    def: typeof IMPLIED_MOVE_DEF;
    /** (콜 + 풋) ÷ 현물 × 100, 소수 1자리 */
    pct: number;
    /** 콜 + 풋 ($, 소수 2자리) */
    straddle: number;
    strike: number;
    /** YYYY-MM-DD — 체인에 만기 정보가 없으면 null */
    expiry: string | null;
    callPrice: number;
    putPrice: number;
    spot: number;
    basis: ImpliedMoveBasis;
    /** 호가 시각(ms) — basis 'live' 이고 호출자가 알려 줬을 때만 */
    asOf: number | null;
    /** EOD 체인 날짜(YYYY-MM-DD) — 알면 */
    chainDate: string | null;
    /** 이 값의 정규장 세션(ET, YYYY-MM-DD) — eod = EOD 체인 날짜(모르면 null) · live = 호가 시각의 ET 날짜 */
    session: string | null;
}

export interface StraddleOptions {
    /** 이 만기만(없으면 null) */
    expiry?: string | null;
    /** 이 날짜 «이상»인 만기 중 가장 가까운 것 — 기본: 오늘(ET) */
    minExpiry?: string | null;
    /**
     * 계약별 실시간 표식(_rtGreeks)이 없는 체인(수집기 슬림 체인·/api/live/ticker 의 rawChain)에서
     * midpoint 가 실시간 FMV 인가 — 체인 수준 표식(greeksSource === 'realtime' 등)으로 넘긴다.
     * 모르면(undefined·null) 실시간으로 보지 않는다(EOD 로 다룬다).
     */
    quotesLive?: boolean | null;
    /** 실시간 호가를 받은 시각(ms) — basis 'live' 결과의 asOf */
    quotesAt?: number | null;
    /** EOD 체인 날짜 */
    chainDate?: string | null;
    /** 실시간 중간값만 — 없으면 null(전일 값으로 메우지 않는다) */
    liveOnly?: boolean;
    /**
     * last_trade.price 도 가격으로 받는다(그 값의 기준을 호출자가 안다) — 실시간 중간값만 골라
     * last_trade.price 로 넘기는 호출자(알림 제공자) 호환용. 기본: 받지 않는다.
     */
    tradePriceBasis?: ImpliedMoveBasis;
    /** 현물 대비 행사가 거리 상한(기본 0.05 = 5%) — 넘으면 ATM 이 아니다 */
    maxStrikeDistance?: number;
    /** 오늘(ET, YYYY-MM-DD) — 시험용 주입 */
    todayEt?: string;
    /** 지금(ms) — 호가 시각을 모르는 «실시간» 값의 세션 판정 기준(시험용 주입, 기본 Date.now()) */
    nowMs?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STRIKES_TRIED = 3;

const pos = (x: unknown): number | null => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** ET 달력 날짜(YYYY-MM-DD) */
export function etDateString(ms: number = Date.now()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(ms));
}

function expiryOf(c: any): string | null {
    const e = c?.details?.expiration_date ?? c?.expiration_date ?? c?.expiry ?? null;
    return typeof e === 'string' && ISO_DATE.test(e) ? e : null;
}
function strikeOf(c: any): number | null {
    return pos(c?.details?.strike_price ?? c?.strike_price);
}
function typeOf(c: any): 'call' | 'put' | null {
    const t = String(c?.details?.contract_type ?? c?.contract_type ?? c?.details?.type ?? '').toLowerCase();
    return t === 'call' || t === 'put' ? t : null;
}

/** 한 다리의 가격 후보 — 기준(live/eod)이 섞이지 않게 따로 든다 */
function legPrices(c: any, quotesLive: boolean | null | undefined, tradeBasis: ImpliedMoveBasis | undefined) {
    const mid = pos(c?.last_quote?.midpoint);
    // Intrinio 체인: day.vwap = EOD mark, last_quote.bid/ask = 전일 종가 호가(close_bid/close_ask)
    const mark = pos(c?.day?.vwap);
    const bid = pos(c?.last_quote?.bid), ask = pos(c?.last_quote?.ask);
    const closeQuoteMid = bid != null && ask != null && ask >= bid ? (bid + ask) / 2 : null;
    let live: number | null = null;
    let eod: number | null = null;
    if (c?._rtGreeks === true) {
        // 실시간 FMV 가 비면 midpoint 가 EOD mark 로 떨어진다 — mark 와 같으면 실시간이 아니다
        if (mid != null && (mark == null || mid !== mark)) live = mid;
        eod = mark ?? closeQuoteMid;
    } else if (c?._rtGreeks === false) {
        eod = mid ?? mark ?? closeQuoteMid;
    } else if (quotesLive === true) {
        live = mid;
    } else {
        eod = mid ?? mark ?? closeQuoteMid;
    }
    const trade = tradeBasis ? pos(c?.last_trade?.price ?? c?.last_trade?.p) : null;
    if (trade != null && tradeBasis === 'live' && live == null) live = trade;
    if (trade != null && tradeBasis === 'eod' && eod == null) eod = trade;
    return { live, eod };
}

/**
 * ATM 스트래들 예상 변동 — 위 [정의] 그대로. 계산할 수 없으면 null(지어내지 않는다).
 */
export function atmStraddleImpliedMove(chain: any[], spot: number, opts: StraddleOptions = {}): ImpliedMove | null {
    const S = pos(spot);
    if (!Array.isArray(chain) || chain.length === 0 || S == null) return null;

    // 1) 만기 — 가장 가까운 것 하나(또는 지정 만기)
    const exps = Array.from(new Set(chain.map(expiryOf).filter((e): e is string => !!e))).sort();
    let expiry: string | null = null;
    if (opts.expiry) {
        if (!exps.includes(opts.expiry)) return null;
        expiry = opts.expiry;
    } else if (exps.length) {
        const floor = opts.minExpiry ?? opts.todayEt ?? etDateString();
        expiry = exps.find((e) => e >= floor) ?? null;
        if (!expiry) return null;   // 남은 만기가 없다(지난 만기만 든 캐시 체인)
    }

    // 2) 그 만기의 행사가별 콜·풋
    const byStrike = new Map<number, { call?: any; put?: any }>();
    for (const c of chain) {
        if (exps.length && expiryOf(c) !== expiry) continue;
        const k = strikeOf(c), t = typeOf(c);
        if (k == null || t == null) continue;
        const slot = byStrike.get(k) ?? {};
        if (!slot[t]) slot[t] = c;
        byStrike.set(k, slot);
    }
    const maxDist = S * (opts.maxStrikeDistance ?? 0.05);
    const strikes = Array.from(byStrike.entries())
        .filter(([k, s]) => s.call && s.put && Math.abs(k - S) <= maxDist)
        .map(([k]) => k)
        .sort((a, b) => Math.abs(a - S) - Math.abs(b - S) || a - b);

    // 3) 가까운 행사가부터 — 두 다리가 «같은 기준»으로 값이 있는 첫 행사가(실시간 → EOD)
    for (const k of strikes.slice(0, MAX_STRIKES_TRIED)) {
        const slot = byStrike.get(k)!;
        const c = legPrices(slot.call, opts.quotesLive, opts.tradePriceBasis);
        const p = legPrices(slot.put, opts.quotesLive, opts.tradePriceBasis);
        let pair: { call: number; put: number; basis: ImpliedMoveBasis } | null = null;
        if (c.live != null && p.live != null) pair = { call: c.live, put: p.live, basis: 'live' };
        else if (!opts.liveOnly && c.eod != null && p.eod != null) pair = { call: c.eod, put: p.eod, basis: 'eod' };
        if (!pair) continue;
        const straddle = pair.call + pair.put;
        const pct = (straddle / S) * 100;
        if (!(pct > 0) || pct >= 100) return null;   // 체인 오염 — 스트래들이 주가만 할 수는 없다
        const chainDate = typeof opts.chainDate === 'string' && ISO_DATE.test(opts.chainDate) ? opts.chainDate : null;
        let asOf = pair.basis === 'live' ? (pos(opts.quotesAt) ?? null) : null;
        let basis: ImpliedMoveBasis = pair.basis;
        let session: string | null = basis === 'eod' ? chainDate : etDateString(asOf ?? Date.now());
        // [10/4] 정규장 밖에서 받은 «실시간» 호가는 그 세션의 마감 호가다(실측: 일요일 운영 live/ticker 가 greeks REALTIME 표식).
        //   «지금» 값으로 내지 않는다 → basis eod · 세션 = 그 시각이 보여 주는 정규장(주말 → 금요일).
        //   호가 시각을 모르면(웹소켓 옵션 호가를 덮은 FlowRadar 등) «지금»으로 판정한다 — 10/4 운영 실측: 토요일 밤에
        //   «10/3 장중» 꼬리표가 나갔다(10/3 은 휴장일, 웹소켓 값은 금요일 마감 호가).
        const ref = asOf ?? (pos(opts.nowMs) ?? Date.now());
        if (basis === 'live' && !inOptionsSessionEt(ref)) {
            basis = 'eod';
            session = shownRegularSessionDate(ref);
            asOf = null;
        }
        return {
            def: IMPLIED_MOVE_DEF,
            pct: round1(pct),
            straddle: round2(straddle),
            strike: k,
            expiry,
            callPrice: pair.call,
            putPrice: pair.put,
            spot: S,
            basis,
            asOf,
            chainDate,
            session,
        };
    }
    return null;
}

/** 콜월 − 풋플로어 사이 거리(% of 현물). 예상 변동이 아니다 — «±» 없이, «벽 사이 폭»으로만 부른다. */
export function wallRangePct(callWall: unknown, putFloor: unknown, spot: unknown): number | null {
    const cw = pos(callWall), pf = pos(putFloor), s = pos(spot);
    if (cw == null || pf == null || s == null || !(cw > pf)) return null;
    return round1(((cw - pf) / s) * 100);
}

// ─────────────────────────────────────────────────────────────
// 문(API 출구)·저장본용 평평한 필드
// ─────────────────────────────────────────────────────────────

export interface ImpliedMoveFields {
    impliedMovePct: number | null;
    impliedMoveExpiry: string | null;
    impliedMoveBasis: ImpliedMoveBasis | null;
    impliedMoveAsOf: number | null;
    impliedMoveDef: typeof IMPLIED_MOVE_DEF | null;
    /** 값의 세션(ET YYYY-MM-DD) — eod 면 «그 날 종가» 값이다. 화면 꼬리표는 impliedMoveSessionNote */
    impliedMoveSession: string | null;
}

export const NO_IMPLIED_MOVE: Readonly<ImpliedMoveFields> = Object.freeze({
    impliedMovePct: null, impliedMoveExpiry: null, impliedMoveBasis: null, impliedMoveAsOf: null, impliedMoveDef: null, impliedMoveSession: null,
});

/**
 * 계산 결과 → 화면으로 나가는 필드. [10/4] EOD 값도 싣는다 — 대신 세션(impliedMoveSession)을 함께 싣고
 * 화면은 impliedMoveSessionNote 로 «10/2 종가» 꼬리표를 붙인다(장외·주말 «—» 금지, 대표 9/30 «가림 0»).
 * liveOnly 는 «지금 값»만 받아야 하는 소비처(알림 등) 전용.
 */
export function impliedMoveFields(im: ImpliedMove | null | undefined, opts: { liveOnly?: boolean } = {}): ImpliedMoveFields {
    if (!im || im.def !== IMPLIED_MOVE_DEF || !(im.pct > 0)) return { ...NO_IMPLIED_MOVE };
    if (im.basis !== 'live' && opts.liveOnly) return { ...NO_IMPLIED_MOVE };
    const session = typeof im.session === 'string' && ISO_DATE.test(im.session) ? im.session
        : im.basis === 'eod' ? (typeof im.chainDate === 'string' && ISO_DATE.test(im.chainDate) ? im.chainDate : null)
        : (im.asOf ? etDateString(im.asOf) : null);
    return {
        impliedMovePct: im.pct,
        impliedMoveExpiry: im.expiry,
        impliedMoveBasis: im.basis,
        impliedMoveAsOf: im.asOf,
        impliedMoveDef: IMPLIED_MOVE_DEF,
        impliedMoveSession: session,
    };
}

/** 옵션 정규장(거래일 09:30~16:15 ET — 지수·ETF 옵션 일부가 16:15 까지) 안인가 */
function inOptionsSessionEt(ms: number): boolean {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const min = Number(get('hour')) * 60 + Number(get('minute'));
    return !isNonTradingDay(etDateString(ms)) && min >= 570 && min < 975;
}

/**
 * 예상 변동 값의 «세션 꼬리표» — 화면이 숫자 옆에 붙인다. 꼬리표가 필요 없으면(장중 실시간 값) null.
 *   · basis eod  → «10/2 종가» · «10/2 close» · «10/2終値» (세션 모르면 «전 세션 종가»)
 *   · basis live → 지금이 그 세션의 정규장 안이면 null, 아니면 «10/2 장중» · «10/2 intraday» · «10/2 場中»
 */
export function impliedMoveSessionNote(
    f: Partial<Pick<ImpliedMoveFields, 'impliedMovePct' | 'impliedMoveBasis' | 'impliedMoveSession' | 'impliedMoveAsOf'>> | null | undefined,
    locale?: string | null,
    nowMs: number = Date.now(),
): string | null {
    if (!f || !(Number(f.impliedMovePct) > 0)) return null;
    const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
    const asOf = pos(f.impliedMoveAsOf);
    const session = typeof f.impliedMoveSession === 'string' && ISO_DATE.test(f.impliedMoveSession) ? f.impliedMoveSession
        : f.impliedMoveBasis === 'live' && asOf ? etDateString(asOf) : null;
    const md = session ? `${Number(session.slice(5, 7))}/${Number(session.slice(8, 10))}` : null;
    if (f.impliedMoveBasis === 'eod') {
        if (loc === 'ko') return md ? `${md} 종가` : '전 세션 종가';
        if (loc === 'ja') return md ? `${md}終値` : '前回終値';
        return md ? `${md} close` : 'prior close';
    }
    if (f.impliedMoveBasis === 'live' && md) {
        if (session === etDateString(nowMs) && inOptionsSessionEt(nowMs)) return null;
        if (loc === 'ko') return `${md} 장중`;
        if (loc === 'ja') return `${md} 場中`;
        return `${md} intraday`;
    }
    return null;
}

/** «±7.9%» — 값이 없으면 null(화면이 자기 빈칸 글자를 쓴다) */
export function formatImpliedMovePct(pct: unknown): string | null {
    const n = pos(pct);
    return n == null ? null : `±${n.toFixed(1)}%`;
}

/**
 * 저장본(분석 캐시·배치 행·리포트 항목)에서 «이 정의의 표식이 있는» 값만 읽는다.
 * 표식 없는 impliedMovePct 는 옛 정의(벽 사이 폭·전일 종가 스트래들)이므로 버린다.
 */
export function readImpliedMoveFields(row: any): ImpliedMoveFields {
    if (!row || typeof row !== 'object' || row.impliedMoveDef !== IMPLIED_MOVE_DEF) return { ...NO_IMPLIED_MOVE };
    const pct = pos(row.impliedMovePct);
    if (pct == null) return { ...NO_IMPLIED_MOVE };
    const basis: ImpliedMoveBasis | null = row.impliedMoveBasis === 'live' || row.impliedMoveBasis === 'eod' ? row.impliedMoveBasis : null;
    return {
        impliedMovePct: pct,
        impliedMoveExpiry: typeof row.impliedMoveExpiry === 'string' && ISO_DATE.test(row.impliedMoveExpiry) ? row.impliedMoveExpiry : null,
        impliedMoveBasis: basis,
        impliedMoveAsOf: pos(row.impliedMoveAsOf),
        impliedMoveDef: IMPLIED_MOVE_DEF,
        impliedMoveSession: typeof row.impliedMoveSession === 'string' && ISO_DATE.test(row.impliedMoveSession) ? row.impliedMoveSession : null,
    };
}

/** 저장본의 예상 변동(%) — 표식 없으면 null. 화면 코드의 한 줄 판정용. */
export function taggedImpliedMovePct(row: any): number | null {
    return readImpliedMoveFields(row).impliedMovePct;
}

/**
 * 화면 스토어(대시보드)용 — 응답이 이 정의의 묶음(impliedMoveDef 키)을 실었으면 null 도 그대로 덮는다.
 * 스토어는 «null 은 건너뛰고 옛 값 유지 + localStorage 저장»이라, 안 그러면 옛 정의 값이 계속 남는다.
 */
export function copyImpliedMoveGroup(target: any, incoming: any): void {
    if (!target || !incoming || typeof incoming !== 'object' || !('impliedMoveDef' in incoming)) return;
    Object.assign(target, readImpliedMoveFields(incoming));
}

/**
 * 배치 행(`{ realtime }`)을 내보내기 «직전»에 옵션 폭 필드를 정리한다(제자리 수정).
 *   · 예상 변동: 표식 있는 값만 남긴다(없으면 다섯 필드 모두 null)
 *   · wallRangePct: 그 행이 «내보내는» 콜월·풋플로어·가격으로 다시 계산한다
 */
export function stampOptionMoveFields(rows: any[] | null | undefined): void {
    for (const r of rows || []) {
        const rt = r?.realtime;
        if (!rt || typeof rt !== 'object') continue;
        Object.assign(rt, readImpliedMoveFields(rt));
        rt.wallRangePct = wallRangePct(rt.callWall, rt.putFloor, rt.price);
    }
}
