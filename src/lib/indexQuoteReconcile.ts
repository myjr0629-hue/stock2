/**
 * 지수(^IXIC·^DJI·^GSPC) 종가 정본 — 야후 chart 응답의 meta 가 «하루 묵은» 때 같은 응답의 1분봉·일봉으로 바로잡는다.
 *
 * 사고(10/13 마감 뒤 ET 16:00~20:00+): 야후 ^DJI 의 meta.regularMarketPrice 가 51850.6(10/12 종가, regularMarketTime=10/12 20:00Z)에 멈춘 채
 *   meta.previousClose 도 10/9 종가(51654.9)였다. 같은 응답의 1분봉 마지막 정규장 봉은 10/13 종가 51672.15 였다.
 *   market-feed 크론은 meta 만 읽어 `yahoo:idx:dow` 에 «어제 종가 + 금요일 대비 +0.38%» 를 저장했고, /api/market/index-close(UC·WIM 매크로 문장·Guardian 알약)가 그대로 냈다.
 *   ^GSPC 도 같은 날 같은 모양이었다(meta 7807.24=10/12 종가, previousClose 7811.54=10/9) — 몇 시간 뒤 야후가 스스로 갱신하지만 previousClose 는 늦게 따라온다.
 *   ^IXIC 는 같은 시각 정상이었다 — 지수마다, 시각마다 어긋나므로 «meta 를 믿지 않고 시계열로 확인»한다.
 *
 * 규칙(순수 함수, 외부 통신 없음)
 *   · 가격: 마지막 정규장 1분봉(ts ≤ 정규장 끝)이 meta.regularMarketTime 보다 10분 넘게 새로우면 그 봉의 종가를 쓴다. 아니면 meta 가격 그대로.
 *   · 직전 종가: 가격 날짜의 달력상 직전 거래일 일봉만 인정. 그 날짜 일봉이 없으면 가격·기준 종가·시각 모두 origin/main 계산 그대로.
 */
import { etDateOf, prevTradingDate } from '@/lib/marketCalendar';

export interface SeriesPoint { ts: number; c: number | null | undefined }   // ts = 초(epoch seconds)

export interface IndexReconcileInput {
    metaPrice: number;
    metaTimeSec: number | null;
    metaPrevClose: number | null;
    /** 1분봉(오름차순) */
    bars: SeriesPoint[];
    /** meta.currentTradingPeriod.regular.end (초). 없으면 상한 없음. */
    regularEndSec: number | null;
    /** 일봉(오름차순, 오늘 봉이 비었거나 진행 중일 수 있다) */
    daily: SeriesPoint[] | null;
}

export interface IndexReconcileResult {
    price: number;
    prevClose: number | null;
    marketTimeSec: number | null;
    priceFromBars: boolean;
    prevFromDaily: boolean;
}

/** meta 시각이 마지막 정규장 봉보다 이만큼 이상 낡으면 meta 가격을 믿지 않는다(초). 정상 갱신 지연(수 분)은 넘기려고 10분. */
export const META_STALE_SEC = 600;

const ok = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0.01;

export function reconcileIndexQuote(i: IndexReconcileInput): IndexReconcileResult {
    const baseline = reconcileIndexQuoteBaseline(i);
    let lastBar: { ts: number; c: number } | null = null;
    for (const b of i.bars || []) {
        if (!ok(b.c) || !Number.isFinite(b.ts) || b.ts <= 0) continue;
        if (i.regularEndSec != null && b.ts > i.regularEndSec) continue;
        if (!lastBar || b.ts >= lastBar.ts) lastBar = { ts: b.ts, c: b.c };
    }

    let price = i.metaPrice;
    let marketTimeSec = i.metaTimeSec;
    let priceFromBars = false;
    const metaTimeKnown = i.metaTimeSec != null && Number.isFinite(i.metaTimeSec) && i.metaTimeSec > 0;
    if (lastBar && metaTimeKnown && lastBar.ts - i.metaTimeSec! > META_STALE_SEC) {
        price = lastBar.c;
        marketTimeSec = lastBar.ts;
        priceFromBars = true;
    }

    // 누락된 직전 거래일을 더 오래된 일봉이나 당일 meta 가격으로 추측해 메우지 않는다.
    let prevClose = ok(i.metaPrevClose) ? i.metaPrevClose : null;
    let prevFromDaily = false;
    const pivotSec = priceFromBars ? lastBar!.ts : (metaTimeKnown ? i.metaTimeSec : null);
    if (pivotSec != null && i.daily && i.daily.length) {
        const previousDate = prevTradingDate(etDateOf(pivotSec * 1000));
        let pick: number | null = null;
        for (const d of i.daily) {
            if (!ok(d.c) || !Number.isFinite(d.ts) || d.ts <= 0) continue;
            if (etDateOf(d.ts * 1000) === previousDate) pick = d.c;
        }
        if (pick != null) { prevClose = pick; prevFromDaily = true; }
    }

    // 날짜 근거가 부족하면 가격만 부분 보정하지 않는다. 호출자의 후속 폴백 여부도 함께 복원한다.
    if (!prevFromDaily) return baseline;
    return { price, prevClose, marketTimeSec, priceFromBars, prevFromDaily };
}

// origin/main 64f5a5f8: 근거가 부족한 입력은 기존 동작 전체로 돌아간다.
function reconcileIndexQuoteBaseline(i: IndexReconcileInput): IndexReconcileResult {
    let lastBar: { ts: number; c: number } | null = null;
    for (const b of i.bars || []) {
        if (!ok(b.c)) continue;
        if (i.regularEndSec != null && b.ts > i.regularEndSec) continue;
        if (!lastBar || b.ts >= lastBar.ts) lastBar = { ts: b.ts, c: b.c };
    }

    let price = i.metaPrice;
    let marketTimeSec = i.metaTimeSec;
    let priceFromBars = false;
    if (lastBar && (i.metaTimeSec == null || lastBar.ts - i.metaTimeSec > META_STALE_SEC)) {
        price = lastBar.c;
        marketTimeSec = lastBar.ts;
        priceFromBars = true;
    }

    // 직전 종가는 «가격이 속한 세션» 바로 앞 세션의 종가다 — 가격 시각의 ET 날짜보다 앞선 마지막 일봉.
    let prevClose = ok(i.metaPrevClose) ? i.metaPrevClose : null;
    let prevFromDaily = false;
    const pivotSec = priceFromBars ? lastBar!.ts : (i.metaTimeSec ?? lastBar?.ts ?? null);
    if (pivotSec != null && i.daily && i.daily.length) {
        const pivotDate = etDateOf(pivotSec * 1000);
        let pick: number | null = null;
        for (const d of i.daily) {
            if (!ok(d.c)) continue;
            if (etDateOf(d.ts * 1000) < pivotDate) pick = d.c;
        }
        if (pick != null) { prevClose = pick; prevFromDaily = true; }
    }

    // 일봉을 못 받았는데 meta 가격이 낡았다 → 그 낡은 meta 가격이 곧 «직전 세션 종가»다(meta.previousClose 는 그보다 한 세션 더 앞).
    if (priceFromBars && !prevFromDaily && ok(i.metaPrice)) prevClose = i.metaPrice;

    return { price, prevClose, marketTimeSec, priceFromBars, prevFromDaily };
}
