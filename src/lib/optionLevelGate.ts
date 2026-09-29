/**
 * 옵션 레벨(맥스페인·콜월·풋플로어·핀존·감마플립) — «한 벌» 매핑과 «정의 게이트» (순수 함수만)
 *
 * 네트워크·캐시·벤더 의존이 없다 — 시험(tests/optionLevelGate.test.ts)이 이 파일만 불러 경계를 고정한다.
 * 저장본 읽기(peek)·응답 뒤 계산(warm)은 services/structureService.ts 에 있고, 이 파일의 함수를 다시 내보낸다.
 */

/** structureService 가 만든 구조 결과의 표식 — 출구가 «페이로드에 실린 구조»를 믿어도 되는지 판정한다(DynamoDB·분석 캐시로 만든 가짜 구조와 구분). */
export const STRUCTURE_PRODUCER = "structureService";

export type OptionLevels = {
    maxPain: number | null;
    callWall: number | null;
    putFloor: number | null;
    pinZone: number | null;
    gammaFlipLevel: number | null;
    levelsExpiration: string | null;
    levelsChainDate: string | null;
    levelsSource: 'structure';
    /** 이 레벨이 계산된 시각(ms) — 저장본에서 읽었을 때만 */
    levelsAsOf?: number | null;
    /** 이 레벨을 계산할 때의 현물(S0) — 정의 게이트의 첫 기준 */
    levelsSpot?: number | null;
    /** 정의 게이트가 지운 필드(없으면 생략) */
    levelsDropped?: LevelField[];
};

// ════════════════════════════════════════════════════════════════════════════
// ★★ 정의 게이트 — 정의를 어긴 레벨은 화면에 내보내지 않는다  [2026-09-29]
//
// [사고] 9/28 운영 watchlist/batch?mode=price: MU 현재가 1038.87 에 콜월 1000(현재가 «아래»)·풋플로어 60·
//   감마플립 530, TSLA 풋플로어 200·감마플립 280 — 이 파일의 정의로는 나올 수 없는 숫자가 나갔다.
//   출처는 DynamoDB signum-gex-history(수집 Lambda signum-harvest): 벽 = 체인 전체의 최대 OI(가격 범위 없음 —
//   MU 10/16 월물 $60 풋 OI 14,619 가 «풋플로어»가 됐다), 감마플립 = (콜월+풋플로어)/2, 맥스페인 = 여러 만기 합산.
//   그 행이 ① command/unified 의 getStructureFromDynamoGex → DynamoDB unified → 배치의 분석 캐시 복사,
//   ② 배치 끝의 «AWS 폴백»(getLatestGex) 으로 들어왔고, 출구 덮기(위 peekStructureLevels)는
//   «구조 저장본이 없으면 원래 값»이라 그 틈으로 그대로 나갔다.
//
// [규칙] 레벨은 구조 한 벌뿐이다. 없으면 «없음»(null)이지 다른 생산자의 값이 아니다.
//   그리고 한 벌이라도 정의를 어기면(현물이 움직여 벽을 넘었거나, 저장본이 깨졌거나) 그 필드는 null.
//   정의(이 파일의 계산과 같다, S = 현물):
//     콜월 S < K ≤ 1.2S · 풋플로어 0.8S ≤ K < S · 감마플립 |K − S| ≤ 0.15S(ATM_RANGE) · 맥스페인 |K − S| ≤ 0.35S(sanitizeMaxPain)
//   기준 현물이 없으면 판단하지 않는다(sanitizeMaxPain 과 같다). 0 이하는 «없음».
// ════════════════════════════════════════════════════════════════════════════
export type LevelField = 'maxPain' | 'callWall' | 'putFloor' | 'gammaFlipLevel';
export const LEVEL_BANDS = { callWallMax: 1.2, putFloorMin: 0.8, gammaFlip: 0.15, maxPain: 0.35 } as const;

const posOrNull = (x: unknown): number | null => {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** 순수 함수 — 현물 spot 기준으로 정의를 어긴 필드 목록. */
export function levelViolations(
    lv: Partial<Record<LevelField, unknown>> | null | undefined,
    spot: number | null | undefined,
): LevelField[] {
    const s = posOrNull(spot);
    if (!lv || s == null) return [];
    const eps = s * 1e-9;   // 경계값(정확히 1.2S 등)이 부동소수 오차로 떨어지지 않게
    const bad: LevelField[] = [];
    const cw = posOrNull(lv.callWall), pf = posOrNull(lv.putFloor);
    const gf = posOrNull(lv.gammaFlipLevel), mp = posOrNull(lv.maxPain);
    if (cw != null && !(cw > s && cw <= s * LEVEL_BANDS.callWallMax + eps)) bad.push('callWall');
    if (pf != null && !(pf < s && pf >= s * LEVEL_BANDS.putFloorMin - eps)) bad.push('putFloor');
    if (gf != null && !(Math.abs(gf - s) <= s * LEVEL_BANDS.gammaFlip + eps)) bad.push('gammaFlipLevel');
    if (mp != null && !(Math.abs(mp - s) <= s * LEVEL_BANDS.maxPain + eps)) bad.push('maxPain');
    return bad;
}

/**
 * 순수 함수 — 기준 현물들(앞에서부터 차례로) 모두에 대해 정의를 어긴 필드를 null 로.
 * 0 이하·숫자 아님도 null. 핀존은 맥스페인을 따른다(구조의 정의: 핀존 = 맥스페인).
 */
export function gateLevels<T extends { [k: string]: any }>(lv: T, ...spots: Array<number | null | undefined>): T & { levelsDropped?: LevelField[] } {
    const out: any = { ...lv };
    for (const f of ['maxPain', 'callWall', 'putFloor', 'gammaFlipLevel'] as const) {
        if (f in out) out[f] = posOrNull(out[f]);
    }
    const dropped = new Set<LevelField>(lv.levelsDropped || []);
    for (const s of spots) for (const f of levelViolations(out, s)) { dropped.add(f); out[f] = null; }
    if ('pinZone' in out) out.pinZone = out.maxPain != null ? (posOrNull(out.pinZone) ?? out.maxPain) : null;
    if (dropped.size) out.levelsDropped = Array.from(dropped); else delete out.levelsDropped;
    return out;
}

/** 화면으로 나가는 레벨 한 벌 — 구조가 없으면 전부 null(출처도 null). */
export type DisplayLevels = Omit<OptionLevels, 'levelsSource'> & { levelsSource: 'structure' | null };

export const NO_LEVELS: Readonly<DisplayLevels> = Object.freeze({
    maxPain: null, callWall: null, putFloor: null, pinZone: null, gammaFlipLevel: null,
    levelsExpiration: null, levelsChainDate: null, levelsSource: null, levelsAsOf: null, levelsSpot: null,
});

/**
 * 순수 함수 — 문(라우트)이 내보낼 레벨. 구조 한 벌을 «계산 현물(S0)»과 «화면 현물»로 다시 게이트한다.
 * 구조가 없으면 NO_LEVELS — 분석 캐시·DynamoDB 이력·자기 체인 계산 등 다른 생산자의 값을 남기지 않는다.
 */
export function displayLevels(lv: OptionLevels | null | undefined, displaySpot?: number | null): DisplayLevels {
    if (!lv) return { ...NO_LEVELS };
    return gateLevels<DisplayLevels>({ ...lv }, lv.levelsSpot, displaySpot);
}

/** 구조 결과 → 레벨 한 벌(자기 현물 S0 으로, spot 이 오면 그것으로도 게이트). 계산에 실패한 결과(OK 아님·레벨 전무)는 null. */
export function levelsFromStructure(sr: any, spot?: number | null): OptionLevels | null {
    if (!sr || sr.options_status !== 'OK') return null;
    if (sr.maxPain == null && sr.levels?.callWall == null && sr.levels?.putFloor == null) return null;
    const s0 = posOrNull(sr.underlyingPrice);
    // 맥스페인 35% 규칙(centralDataHub.sanitizeMaxPain)은 gateLevels 의 maxPain 밴드와 같다 — 한 곳에서 건다.
    const mp = posOrNull(sr.maxPain);
    return gateLevels<OptionLevels>({
        maxPain: mp,
        callWall: sr.levels?.callWall ?? null,
        putFloor: sr.levels?.putFloor ?? null,
        pinZone: mp != null ? (sr.levels?.pinZone ?? mp) : null,
        gammaFlipLevel: sr.gammaFlipLevel ?? null,
        levelsExpiration: sr.expiration || null,
        levelsChainDate: sr.chainDate ?? null,
        levelsSource: 'structure',
        levelsSpot: s0,
    }, s0, posOrNull(spot));
}


/**
 * command/unified 모양의 페이로드(structure.{maxPain,levels,gammaFlipLevel,expiration} + volatility.flipLevel)에
 * 레벨 한 벌을 덮는다(순수 함수). 묶음은 통째로 — 구조에 감마플립이 없으면 «없음»으로 둔다.
 * 저장본이 없으면: 페이로드의 structure 가 이 파일이 만든 결과(levelsProducer)일 때만 그걸 쓰고, 아니면 전부 null.
 * API 출구(command/unified)와 웹 /ticker SSR 이 같은 함수를 쓴다.
 */
export function applyLevelsToUnified(data: any, lv: OptionLevels | null | undefined, displaySpot?: number | null): any {
    const st = data?.structure;
    if (!st || typeof st !== 'object') return data;
    const own = !lv && st.levelsProducer === STRUCTURE_PRODUCER ? levelsFromStructure(st) : null;
    const d = displayLevels(lv ?? own, displaySpot);
    const out = {
        ...data,
        structure: {
            ...st,
            maxPain: d.maxPain,
            levels: { ...(st.levels || {}), callWall: d.callWall, putFloor: d.putFloor, pinZone: d.pinZone },
            gammaFlipLevel: d.gammaFlipLevel,
            expiration: d.levelsSource ? d.levelsExpiration : (st.expiration ?? null),
            chainDate: d.levelsChainDate,
            levelsSource: d.levelsSource,
            levelsAsOf: d.levelsAsOf ?? null,
            levelsDropped: d.levelsDropped,
        },
    };
    if (out.volatility && typeof out.volatility === 'object') {
        out.volatility = { ...out.volatility, flipLevel: d.gammaFlipLevel };
    }
    return out;
}

/** 행의 «화면 현물» — 시간외 가격이 있으면 그것(maxPainDist 기준과 같다), 없으면 표시 가격. */
function rowSpot(rt: any): number | null {
    // watchlist 는 extendedPrice, portfolio 는 extPrice 라는 이름을 쓴다(뜻은 같다: 시간외 가격).
    return posOrNull(rt?.extendedPrice) ?? posOrNull(rt?.extPrice) ?? posOrNull(rt?.price);
}

/**
 * 배치 서비스(watchlist·portfolio)·인텔 행처럼 레벨이 «평평하게» 담긴 모양에 레벨 한 벌을 덮는다(제자리 수정).
 * 구조가 없으면 레벨은 전부 null — 원래 값(분석 캐시·DynamoDB 이력)을 남기지 않는다.
 * maxPainDist 는 원래 규칙 그대로 «(맥스페인 − 기준가) / 기준가 %», 기준가 = 시간외 가격 || 표시 가격.
 */
export function applyLevelsToRealtime(rt: any, lv: OptionLevels | null | undefined): void {
    if (!rt || typeof rt !== 'object') return;
    const ref = rowSpot(rt);
    const d = displayLevels(lv, ref);
    rt.maxPain = d.maxPain;
    rt.maxPainDist = d.maxPain && ref ? Number((((d.maxPain - ref) / ref) * 100).toFixed(2)) : null;
    rt.callWall = d.callWall;
    rt.putFloor = d.putFloor;
    rt.gammaFlipLevel = d.gammaFlipLevel;
    rt.levelsExpiration = d.levelsExpiration;
    rt.levelsChainDate = d.levelsChainDate;
    rt.levelsSource = d.levelsSource;
    if (d.levelsDropped?.length) rt.levelsDropped = d.levelsDropped; else delete rt.levelsDropped;
}
