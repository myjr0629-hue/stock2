/**
 * watchlist/batch 결과 한 건 → 앱 Intel 의 시세 한 줄(IntelQuote) — 순수 함수(훅에서 떼어 시험한다, 2026-10-07 정확성 2차).
 *
 * appBasis(앱 Intel 전용): 못 쟀다 = 0·''(앱 화면이 «—» 로 읽는 약속)
 *   · 알파 점수 50·등급 B 를 채우지 않는다(배치가 먼저 온 종목에 «평가받은 B / 50» 이 떴다).
 *   · 배치의 GEX·P/C 는 만기 범위가 다른 값(알파 점수 입력용)이라 화면에 쓰지 않는다 — 앱 전용 섹터 응답(DynamoDB 최신 행 한 곳)이 정한다.
 * 웹(appBasis=false)은 예전 그대로.
 */
import type { IntelQuote } from '@/hooks/useIntelSharedData';
import type { IntelMissingField } from '@/lib/app/intelMissing';

export function pickFiniteNumber<T extends number | null | undefined>(value: T, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * [10/19] 배치 한 건에서 «못 잰 칸» — 값은 아래에서 예전처럼 0(웹 알파는 50)으로 채우고, 여기서 이름만 싣는다(src/lib/app/intelMissing.ts).
 * 배치 서비스가 시세 스냅샷이 없어 0 으로 채운 등락(realtime.missingFields)도 결측이다.
 */
export function batchMissingFields(batch: any): IntelMissingField[] {
    const rt = batch?.realtime || {};
    const alpha = batch?.alphaSnapshot || {};
    const marked: string[] = Array.isArray(rt.missingFields) ? rt.missingFields : [];
    const out: IntelMissingField[] = [];
    if (!isNum(rt.changePct) || marked.includes('changePct')) out.push('changePct');
    if (!isNum(alpha.score)) out.push('alphaScore');
    if (!isNum(rt.netPremium)) out.push('netPremium');
    if (!isNum(rt.squeezeScore)) out.push('squeezeScore');
    return out;
}

export function quoteFromBatchResult(batch: any, appBasis = false): IntelQuote | null {
    if (!batch?.ticker || batch.error) return null;

    const rt = batch.realtime || {};
    const alpha = batch.alphaSnapshot || {};
    // 앱 전용: 배치의 GEX·P/C 는 만기 범위가 다른 값(알파 점수 입력용)이라 화면에 쓰지 않는다 — 0 = «못 쟀다»(앱 화면이 «—» 로 읽는 약속)
    const gex = appBasis ? 0 : pickFiniteNumber(rt.gex, 0);

    return {
        ticker: batch.ticker,
        price: pickFiniteNumber(rt.price, 0),
        changePct: pickFiniteNumber(rt.changePct, 0),
        prevClose: pickFiniteNumber(rt.prevClose, 0),
        volume: pickFiniteNumber(rt.volume, 0),
        extendedPrice: pickFiniteNumber(rt.extendedPrice, 0),
        extendedChangePct: pickFiniteNumber(rt.extendedChangePct, 0),
        extendedLabel: rt.extendedLabel || '',
        session: rt.session || '',
        // ★ [2026-10-07] 앱: 알파 점수를 못 쟀으면 50·등급 B 가 아니라 0·''(= «없음») — 평가받은 값처럼 보이지 않게(웹은 예전 그대로)
        alphaScore: pickFiniteNumber(alpha.score, appBasis ? 0 : 50),
        grade: alpha.grade || (appBasis ? '' : 'B'),
        maxPain: pickFiniteNumber(rt.maxPain, 0),
        callWall: pickFiniteNumber(rt.callWall, 0),
        putFloor: pickFiniteNumber(rt.putFloor, 0),
        gex,
        pcr: appBasis ? 0 : pickFiniteNumber(rt.pcr, 0),
        gammaRegime: appBasis ? 'UNKNOWN' : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : (rt.gammaRegime || 'NEUTRAL'),
        sparkline: rt.sparkline?.length > 0 ? rt.sparkline : [],
        netPremium: pickFiniteNumber(rt.netPremium, 0),
        rsi: pickFiniteNumber(rt.rsi, 0),
        rvol: pickFiniteNumber(rt.relVol ?? rt.rvol, 0),
        squeezeScore: pickFiniteNumber(rt.squeezeScore, 0),
        ivSkew: pickFiniteNumber(rt.ivSkew, 0),
        impliedMovePct: pickFiniteNumber(rt.impliedMovePct, 0),
        impliedMoveBasis: rt.impliedMoveBasis === 'live' || rt.impliedMoveBasis === 'eod' ? rt.impliedMoveBasis : null,
        impliedMoveSession: typeof rt.impliedMoveSession === 'string' ? rt.impliedMoveSession : null,
        impliedMoveAsOf: typeof rt.impliedMoveAsOf === 'number' ? rt.impliedMoveAsOf : null,
        whaleIndex: pickFiniteNumber(rt.whaleIndex, 0),
        darkPoolPct: pickFiniteNumber(rt.darkPoolPct, 0),
        regularCloseToday: pickFiniteNumber(rt.regularCloseToday, 0) || null,
        ...(() => { const m = batchMissingFields(batch); return m.length ? { missingFields: m } : {}; })(),
    };
}

