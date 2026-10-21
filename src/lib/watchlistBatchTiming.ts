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
