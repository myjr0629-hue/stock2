/**
 * 앱 Intel «엔진 목록 밖 설정 종목»(RGTI·QBTS)의 옵션 지표(GEX·P/C) — 수집 Lambda DynamoDB 최신 행에서 (2026-10-07, 앱 강화 정확성 3차 · 순수 함수)
 *
 * 왜: 설정 목록 기준 섹터(퀀텀 엣지 = IONQ·RGTI·QBTS)의 RGTI·QBTS 시세는 배치(/api/watchlist/batch)로 따로 받는다. 앱 전용 규칙상 배치의 GEX·P/C 는
 *   만기 범위가 다른 값(알파 점수 입력용)이라 화면에 쓰지 않으므로 0(=«—»)이었다 — 수집 Lambda 목록에 두 종목이 없어 행도 없었다(RGTI 의 최신 행은 8/28).
 *   수집 목록에 두 종목을 넣은 뒤(harvest_lambda GEX_TICKERS 106→108)에는 다른 종목과 «같은 행»(/api/intel/fast?app=1 이 읽는 것과 같은 규칙)에서 읽는다:
 *   행이 5일 안이어야 하고(isFreshOptionsRow), GEX = gexFromRow, P/C = oiPcrAllExpiries(35일 이내 전 만기), 행 시각 = optionsAsOf.
 *   행이 없거나 낡았으면 «못 쟀다»(0 → 화면 «—», 감마 UNKNOWN) — 다른 만기 범위의 값으로 메우지 않는다.
 *
 * 시험: tests/intelExtraOptions.test.ts
 */
import { gexFromRow, isFreshOptionsRow, oiPcrAllExpiries } from '@/lib/app/intelOptionsBasis';

export interface ExtraOptions {
    /** 못 쟀으면 null */
    gex: number | null;
    pcr: number | null;
    gammaRegime: 'LONG' | 'SHORT' | 'NEUTRAL' | 'UNKNOWN';
    /** 행 시각(ms) — 못 쟀으면 null */
    optionsAsOf: number | null;
}

/** DynamoDB gex 최신 행 → 앱 옵션 지표. 행이 없거나 5일을 넘으면 전부 «못 쟀다» */
export function optionsFromRow(row: any, nowMs: number = Date.now()): ExtraOptions {
    const ts = Number(row?.timestamp);
    const fresh = isFreshOptionsRow(ts, nowMs);
    const use = fresh ? row : null;
    const gex = gexFromRow(use);
    const pcr = oiPcrAllExpiries(use);
    return {
        gex,
        pcr,
        gammaRegime: gex == null ? 'UNKNOWN' : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : 'NEUTRAL',
        optionsAsOf: use && Number.isFinite(ts) && ts > 0 ? ts : null,
    };
}

interface QuoteLike { ticker: string; gex: number; pcr: number; gammaRegime: string; optionsAsOf?: number | null; pcrBasis?: string | null }

/** 배치로 받은 «엔진 목록 밖» 시세 행에 옵션 지표를 입힌다. 값이 없는 종목은 0(= 화면 «—»)·UNKNOWN 그대로 둔다. */
export function mergeExtraOptions<Q extends QuoteLike>(extras: readonly Q[], rows: Record<string, ExtraOptions | null | undefined> | null | undefined): Q[] {
    if (!rows) return [...extras];
    return extras.map((q) => {
        const o = rows[q.ticker];
        if (!o) return q;
        return {
            ...q,
            gex: typeof o.gex === 'number' && Number.isFinite(o.gex) ? o.gex : 0,
            pcr: typeof o.pcr === 'number' && Number.isFinite(o.pcr) && o.pcr > 0 ? o.pcr : 0,
            gammaRegime: o.gammaRegime,
            optionsAsOf: o.optionsAsOf ?? null,
            pcrBasis: o.pcr != null ? 'oi_all_expiries_35d' : (q.pcrBasis ?? null),
        };
    });
}
