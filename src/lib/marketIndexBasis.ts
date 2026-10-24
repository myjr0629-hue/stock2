import { cashSessionPhaseAt, sessionCloseMinutes } from './marketCalendar';
import { etClock, etDateOfIso, isEquityFuturesOpen, lastClosedSessionDate } from './marketSession';
import { validFuturesCashCloseReference, type FuturesCashCloseReference } from './futuresCashClose';

/** 현물과 선물은 교환할 수 없다. 조회 시각 대신 각 원자료의 체결 시각을 운반한다. */
export interface IndexQuoteInput {
    symbol?: string;
    price?: number | null;
    changePct?: number | null;
    marketTime?: string | null;
    lastChangeAt?: string | null;
    source?: string;
}
export interface IndexObservation {
    symbol: string;
    price: number | null;
    changePct: number | null;
    asOf: string | null;
    sessionDate: string | null;
    basis: 'regular-session' | 'prior-settlement';
    live: boolean;
    source: string | null;
}
export interface FuturesObservation extends IndexObservation {
    /** 같은 선물의 현물 마감 부근 실제 관측 대비. 전일 정산 대비와 구분한다. */
    sinceCashClosePct: number | null;
    cashCloseReferenceAt: string | null;
}
export interface MarketIndexBasis {
    v: 1;
    cash: { nasdaq: IndexObservation; ndx: IndexObservation; spx: IndexObservation };
    futures: { nq: FuturesObservation; es: FuturesObservation };
}
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const LIVE_QUOTE_MAX_AGE_MS = 20 * 60_000;

// 기존 수집기는 마지막 1분봉의 시작 시각(15:59 / 조기 마감 12:59)을 보존한다.
// 이 분보다 이른 장중 값은 완료된 세션의 종가로 승격하지 않는다.
const isCashCloseObservation = (time: number, sessionDate: string): boolean =>
    etClock(time).minutes >= sessionCloseMinutes(sessionDate) - 1;

export function buildMarketIndexBasis(inputs: {
    nasdaq?: IndexQuoteInput | null; ndx?: IndexQuoteInput | null; spx?: IndexQuoteInput | null;
    nq?: IndexQuoteInput | null; es?: IndexQuoteInput | null;
}, nowMs: number, references: { nq?: FuturesCashCloseReference | null; es?: FuturesCashCloseReference | null } = {}): MarketIndexBasis {
    const phase = cashSessionPhaseAt(nowMs);
    const regular = phase === 'regular';
    const today = etClock(nowMs).date;
    const expectedCashDate = regular || phase === 'after-close' ? today : lastClosedSessionDate(nowMs);
    const point = (raw: IndexQuoteInput | null | undefined, symbol: string, futures = false): IndexObservation => {
        const valid = raw?.symbol === symbol && raw.source !== 'DEFAULT';
        const time = valid && raw.marketTime ? Date.parse(raw.marketTime) : NaN;
        const asOf = Number.isFinite(time) && time <= nowMs ? new Date(time).toISOString() : null;
        // 기준 시각 없는 값도 관측으로 쓰지 않는다. 결측은 선물·프록시·0으로 대체하지 않는다.
        const sessionDate = !futures && asOf ? etDateOfIso(asOf) : null;
        const quotePhase = asOf && !futures ? cashSessionPhaseAt(time) : null;
        // 장외에는 완료된 정규장만, 장중에는 그 세션 관측만 쓴다. 오래된 세션은 날짜를
        // 그대로 남기되 판정 숫자로 쓰지 않는다. 개장 전 벤더 시각만 전진한 값도 거절한다.
        const cashUsable = futures || (sessionDate === expectedCashDate
            && (quotePhase === 'after-close' || (quotePhase === 'regular'
                && (regular || isCashCloseObservation(time, sessionDate)))));
        const price = asOf && cashUsable && finite(raw?.price) != null && raw!.price! > 0 ? raw!.price! : null;
        const changedAt = raw?.lastChangeAt ? Date.parse(raw.lastChangeAt) : NaN;
        const fresh = asOf != null && nowMs - time <= LIVE_QUOTE_MAX_AGE_MS;
        const futureLive = futures && isEquityFuturesOpen(nowMs) && fresh
            && Number.isFinite(changedAt) && changedAt <= nowMs && nowMs - changedAt <= LIVE_QUOTE_MAX_AGE_MS;
        return { symbol, price, changePct: price == null ? null : finite(raw?.changePct), asOf,
            sessionDate, basis: futures ? 'prior-settlement' : 'regular-session',
            live: price != null && (futures ? futureLive : regular && sessionDate === today && fresh),
            source: price != null ? raw?.source ?? null : null };
    };
    const closedDate = lastClosedSessionDate(nowMs);
    const future = (raw: IndexQuoteInput | null | undefined, symbol: string, ref: FuturesCashCloseReference | null | undefined): FuturesObservation => {
        const p = point(raw, symbol, true);
        const valid = p.price != null && p.asOf != null && validFuturesCashCloseReference(ref, symbol, closedDate)
            && Date.parse(ref.asOf) <= Date.parse(p.asOf);
        const pct = valid ? (p.price! / ref.price - 1) * 100 : null;
        return { ...p, sinceCashClosePct: finite(pct), cashCloseReferenceAt: valid && finite(pct) != null ? ref.asOf : null };
    };
    return { v: 1,
        cash: { nasdaq: point(inputs.nasdaq, '^IXIC'), ndx: point(inputs.ndx, '^NDX'), spx: point(inputs.spx, '^GSPC') },
        // 이 등락률은 전일 정산가 대비다. 현물 마감 이후 수익률로 다시 해석하지 않는다.
        futures: { nq: future(inputs.nq, 'NQ=F', references.nq), es: future(inputs.es, 'ES=F', references.es) } };
}

/** Guardian의 NASDAQ 판정은 종합 현물(^IXIC), NDX/API는 Nasdaq 100 현물(^NDX). */
export function guardianCashChange(m: { indexBasis?: MarketIndexBasis } | null | undefined, session: string): number | null {
    const cash = m?.indexBasis?.cash?.nasdaq;
    // 장중에는 현재 관측만 판정에 쓴다. 장외의 완료 세션 종가는 live:false여도 유효하다.
    return session === 'REG' && !cash?.live ? null : finite(cash?.changePct);
}

/** 같은 세션의 종합 현물 관측이 «있는가»(장중 지연분 포함) — 결측(기존 입력 대체)과 장중 지연(판정 보류)을 가른다. 판정 숫자는 guardianCashChange 만(밤 검토 10/24 ②). */
export function guardianCashObserved(m: { indexBasis?: MarketIndexBasis } | null | undefined): number | null {
    return finite(m?.indexBasis?.cash?.nasdaq?.changePct);
}

export function indexContext(b: MarketIndexBasis | undefined): string[] {
    if (!b) return [];
    const line = (name: string, p: IndexObservation): string | null => {
        if (p.price == null) return null;
        const chg = p.changePct == null ? '' : ` (${p.changePct >= 0 ? '+' : ''}${p.changePct.toFixed(2)}%)`;
        const atClose = p.asOf && p.sessionDate && isCashCloseObservation(Date.parse(p.asOf), p.sessionDate);
        const basis = p.basis === 'prior-settlement' ? 'vs prior settlement' : p.live ? 'regular session live'
            : atClose ? 'regular-session close' : 'regular-session observation';
        return `${name}: ${p.price.toFixed(2)}${chg} [${basis}; ${p.sessionDate ? `session ${p.sessionDate}; ` : ''}as of ${p.asOf}]`;
    };
    return [line('NASDAQ Composite', b.cash.nasdaq), line('NASDAQ 100', b.cash.ndx), line('S&P 500', b.cash.spx),
        line('NASDAQ 100 futures', b.futures.nq), line('S&P 500 futures', b.futures.es)].filter((s): s is string => s !== null);
}
