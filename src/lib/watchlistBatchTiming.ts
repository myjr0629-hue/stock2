/** 배치 응답 본문과 분리한 요청별 계측. 저장본의 meta/원천 시각은 수정하지 않는다. */
export type WatchlistBatchTiming = {
    options: number;
    main: number;
    alpha: number;
    fill: number;
    json: number;
    memory: number;
    redis: number;
    stale: number;
    sync: number;
    refresh: number;
    analysisHit: number;
    heal: number;
    awsFill: number;
    failed: boolean;
    /** 종목별 옵션 원천 실제 읽음 여부(정상본 병합의 정당한 null 판정용, 헤더에는 안 나감) */
    optionSources?: Record<string, { structure: boolean; oiRow: boolean }>;
    /** 이번 계산에서 «못 읽은» 원천(배치 단위) — 정상본 병합은 원천이 안 온 묶음만 직전 값을 유지한다 */
    missed?: { darkPool?: boolean; liquidity?: boolean; levels?: boolean };
};

export function newWatchlistBatchTiming(): WatchlistBatchTiming {
    return { options: 0, main: 0, alpha: 0, fill: 0, json: 0,
        memory: 0, redis: 0, stale: 0, sync: 0, refresh: 0, analysisHit: 0, heal: 0, awsFill: 0, failed: false };
}

export function watchlistServerTiming(t: WatchlistBatchTiming): string {
    const stages = (['options', 'main', 'alpha', 'fill', 'json'] as const)
        .map(k => `batch_${k};dur=${Math.max(0, t[k]).toFixed(2)}`);
    return [...stages,
        `batch_cache;desc="memory=${t.memory} redis=${t.redis} stale=${t.stale} sync=${t.sync} refresh=${t.refresh}"`,
        `batch_analysis;desc="hit=${t.analysisHit} heal=${t.heal} awsFill=${t.awsFill} failed=${Number(t.failed)}"`,
    ].join(', ');
}
