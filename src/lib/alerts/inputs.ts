/**
 * 벤더·서비스 응답 → 알림 입력으로 옮기는 순수 함수들(네트워크 없음 — 시험 대상).
 *
 * ── 구조 서비스(getStructureData) 결과 → 알림용 레벨 한 벌 ──
 *
 * 레벨의 «단일 출처»는 structureService.getStructureData 다(화면·랭킹·구조 굽기가 같은 함수를 쓴다).
 * 여기서는 값을 다시 계산하지 않는다 — 이름만 옮기고, «언제 계산된 값인가»(asOf)를 응답의 나이 표식에서 복원한다:
 *   _staleSec    = 마지막 정상본(lastgood)을 즉시 돌려준 경우의 나이
 *   _redisAgeSec = 공유 캐시(structure:v1)의 나이
 *   cached(나이 없음) = 인스턴스 메모리 캐시 — 장중 TTL 60초라 장중에만 60초로 본다(그 밖엔 «모름» → 신뢰하지 않음)
 *   나이 표식 없음 = 방금 계산
 * fix/levels-one-door-gate 가 합쳐지면 같은 결과를 levelsFromStructure/peekStructureLevels 로 읽을 수 있다(정의 동일).
 */
import { etDateOf, etMinutesOf, isDateStr } from './calendar';
import type { Bar5, LevelSet } from './types';

const pos = (x: unknown): number | null => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};

export interface StructureLevelsResult {
    levels: LevelSet | null;
    expirations: string[];
    /** 결과의 나이(초). null = 알 수 없음 */
    ageSec: number | null;
}

export function levelSetFromStructure(d: any, nowMs: number, opts: { cachedAgeSec?: number | null } = {}): StructureLevelsResult {
    const expirations: string[] = Array.isArray(d?.availableExpirations)
        ? (d.availableExpirations as unknown[]).filter(isDateStr).sort()
        : [];
    let ageSec: number | null;
    if (typeof d?._staleSec === 'number' && Number.isFinite(d._staleSec)) ageSec = Math.max(0, d._staleSec);
    else if (typeof d?._redisAgeSec === 'number' && Number.isFinite(d._redisAgeSec)) ageSec = Math.max(0, d._redisAgeSec);
    else if (d?.cached) ageSec = opts.cachedAgeSec ?? null;
    else ageSec = 0;

    // 계산 실패·옵션 없음(PENDING·NO_MARKET)은 레벨이 없다 — 다른 생산자 값으로 메우지 않는다
    if (!d || d.options_status !== 'OK') return { levels: null, expirations, ageSec };

    const levels: LevelSet = {
        callWall: pos(d.levels?.callWall),
        putFloor: pos(d.levels?.putFloor),
        gammaFlip: pos(d.gammaFlipLevel),
        gammaFlipType: typeof d.gammaFlipType === 'string' ? d.gammaFlipType : null,
        gexConfidence: typeof d.gexConfidence === 'string' ? d.gexConfidence : null,
        maxPain: pos(d.maxPain),
        pcr: typeof d.pcr === 'number' && Number.isFinite(d.pcr) && d.pcr > 0 ? d.pcr : null,
        spot: pos(d.underlyingPrice),
        asOf: ageSec == null ? null : nowMs - ageSec * 1000,
        expiration: isDateStr(d.expiration) ? d.expiration : null,
        chainDate: isDateStr(d.chainDate) ? d.chainDate : null,
    };
    return { levels, expirations, ageSec };
}

/**
 * 실적 뒤 첫 만기 — 발표가 그 만기 «안»에 들어가야 내재 변동이 실적을 반영한다.
 *   장 시작 전(bmo)·장중(dmh): 실적일 당일 만기부터 · 장 마감 후(amc)·모름: 실적일 «다음» 만기부터
 */
export function expiryAfterEarnings(expirations: string[], earningsDate: string, timing: 'bmo' | 'amc' | 'dmh' | 'unknown'): string | null {
    const sameDayOk = timing === 'bmo' || timing === 'dmh';
    const list = expirations.filter(isDateStr).sort();
    return list.find((e) => (sameDayOk ? e >= earningsDate : e > earningsDate)) ?? null;
}

const BAR_MS = 5 * 60_000;
const REG_OPEN = 9 * 60 + 30;
const REG_CLOSE = 16 * 60;

/**
 * 벤더 5분 봉 → 정규장 «완료» 봉 중 가장 늦은 것.
 * 봉 시각 t 는 «시작» 시각이다(1분 봉 390개 = 09:30~15:59 실측). 끝(t+5분)이 지금 이전이어야 완료다.
 * 시간외 병합 봉(_ext)은 뺀다(intrinioClient.getIntradayAggregates 가 EC2 시간외 봉을 섞어 준다).
 */
export function lastCompletedRegularBar(results: any[], session: string, nowMs: number): Bar5 | null {
    let best: Bar5 | null = null;
    for (const r of results || []) {
        const t = Number(r?.t), c = Number(r?.c);
        if (r?._ext || !Number.isFinite(t) || !(c > 0)) continue;
        const end = t + BAR_MS;
        if (end > nowMs) continue;
        if (etDateOf(t) !== session) continue;
        const m = etMinutesOf(t);
        if (m < REG_OPEN || m >= REG_CLOSE) continue;
        if (!best || end > best.endMs) best = { close: c, endMs: end, session };
    }
    return best;
}

/**
 * 실시간 중간값만 남긴 체인으로 내재 변동(%) — 앱과 같은 공식(alphaEngine.computeImpliedMovePct: ATM 콜+풋 / 현물)을
 * 주입받아 쓴다. 계약 가격은 _rtGreeks(실시간 덮어쓰기)가 있고 midpoint 가 EOD mark(day.vwap)와 다른 것만 —
 * 전일 종가(day.close)로 메우지 않는다(메모리: chain-day-fields-are-eod-not-live).
 */
export function realtimeImpliedMove(
    contracts: any[],
    price: number,
    compute: (chain: any[], price: number) => number | null,
): number | null {
    if (!(price > 0)) return null;
    const live = (contracts || [])
        .filter((c) => c?._rtGreeks === true)
        .map((c) => ({ c, mid: Number(c?.last_quote?.midpoint) }))
        .filter(({ c, mid }) => mid > 0 && Number.isFinite(mid) && mid !== Number(c?.day?.vwap))
        .map(({ c, mid }) => ({ details: c.details, last_trade: { price: mid } }));
    if (!live.length) return null;
    const pct = compute(live, price);
    return pct != null && pct > 0 && pct < 60 ? pct : null;
}
