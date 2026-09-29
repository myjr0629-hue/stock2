/**
 * 옵션 레벨(맥스페인·콜월·풋플로어·핀존·감마플립) — «한 벌» 매핑·«정의대로 고르기»·«정의 게이트(안전망)» (순수 함수만)
 *
 * 네트워크·캐시·벤더 의존이 없다 — 시험(tests/optionLevelGate.test.ts)이 이 파일만 불러 경계를 고정한다.
 * 저장본 읽기·갱신 예약은 services/structureService.ts 에 있고, 이 파일의 함수를 다시 내보낸다.
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
    /** 판본 = 이 레벨이 계산된 시각(ms). 같은 순간 모든 문은 같은 판본을 읽는다. */
    levelsAsOf?: number | null;
    /** 판본의 기준가(계산 때 현물 S0) */
    levelsSpot?: number | null;
    /** 안전망(정의 게이트)이 지운 필드 — 없으면 생략. 한 번도 나오지 않아야 정상이다. */
    levelsDropped?: LevelField[];
    /** 표시 가격이 판본 레벨을 넘어(실제 돌파) 같은 분포에서 그 가격 기준으로 다시 고른 필드 — 없으면 생략 */
    levelsReselected?: LevelField[];
    /** 판본의 행사가 분포 — 어느 가격에서든 같은 정의로 다시 고를 수 있게(출력에는 싣지 않는다) */
    levelProfile?: LevelProfile | null;
    /** 종목(출력에는 싣지 않는다) — 재선택·안전망 발동을 서비스 층이 기록할 때 쓴다 */
    levelsTicker?: string | null;
};

// ════════════════════════════════════════════════════════════════════════════
// ★★ 정의 — 이 파일의 계산(levelsAt)과 게이트(levelViolations)는 같은 부등호를 쓴다  [2026-09-29 · 2026-09-30]
//
// [9/28 사고] 운영 watchlist/batch?mode=price: MU 현재가 1038.87 에 콜월 1000(현재가 «아래»)·풋플로어 60·
//   감마플립 530 — 수집 Lambda(signum-harvest)가 DynamoDB 에 쓰는 «다른 정의»의 값이 문으로 샜다.
//   → 레벨은 구조 한 벌뿐(없으면 null) + 정의 게이트(9/29).
// [9/29 사고] 게이트는 틀린 값을 막았지만 «—» 로 가렸다(대표 9/30 «못 나가게 하는 것이 아닌 완벽하게 작동하게»).
//   가려진 까닭: 판본이 오래돼(저장본 57분) 그 사이 움직인 현재가가 벽을 넘었거나, 문마다 다른 판본을 읽었다.
//   → 레벨은 «판본의 행사가 분포 × 기준가»의 함수 하나(levelsAt). 구조 계산(S0)도 문(표시 가격)도 이 함수를 쓴다.
//     표시 가격이 판본 레벨을 넘으면(실제 돌파) 숨기지 않고 같은 분포에서 그 가격 기준으로 다시 고른다(displayLevels).
//     게이트는 안전망으로 남는다 — 발동하면 levelsDropped 로 드러나고 서비스 층이 기록한다(한 번도 발동하지 않아야 정상).
//
//   정의(S = 기준가):
//     콜월 = S < K ≤ 1.2S 에서 콜 OI 최대(OI > 0) · 풋플로어 = 0.8S ≤ K < S 에서 풋 OI 최대(OI > 0) — 같은 OI 면 낮은 행사가
//     감마플립 = 누적 GEX(행사가 오름차순) 부호가 바뀌는 행사가 중 S 에 가장 가까운 것(|K − S| ≤ 0.15S),
//               없으면 그 범위에서 |누적 GEX| 최소인 행사가
//     맥스페인 = 만기 가치 합이 최소인 행사가(OI 만의 함수 — 기준가와 무관), |K − S| ≤ 0.35S 일 때만(sanitizeMaxPain)
//   기준가가 없으면 판단하지 않는다. 0 이하는 «없음».
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

// ════════════════════════════════════════════════════════════════════════════
// 행사가 분포 — 구조 결과의 `structure` 필드 그대로(오름차순 행사가에 맞춘 배열)
// ════════════════════════════════════════════════════════════════════════════
export type LevelProfile = {
    strikes: number[];
    callsOI: (number | null)[];
    putsOI: (number | null)[];
    /** 감마가 있는 행사가의 «누적» GEX(행사가 오름차순 누적·정수), 감마 없는 행사가는 null. 9/30 이전 판본엔 없다. */
    gexCum?: (number | null)[] | null;
};

export type GammaFlipType = 'EXACT' | 'NEAR_ZERO' | 'ALL_LONG' | 'ALL_SHORT' | 'NO_DATA';

/** 순수 함수 — 분포 × 기준가 → 콜월·풋플로어·감마플립(정의 그대로). 결과는 늘 정의 게이트를 통과한다(없으면 null). */
export function levelsAt(pr: LevelProfile | null | undefined, spot: number | null | undefined): {
    callWall: number | null; putFloor: number | null; gammaFlipLevel: number | null; gammaFlipType: GammaFlipType;
} {
    const out = { callWall: null as number | null, putFloor: null as number | null, gammaFlipLevel: null as number | null, gammaFlipType: 'NO_DATA' as GammaFlipType };
    const S = posOrNull(spot);
    const ks = pr && Array.isArray(pr.strikes) ? pr.strikes : null;
    if (!pr || !ks || S == null) return out;
    const hi = S * LEVEL_BANDS.callWallMax, lo = S * LEVEL_BANDS.putFloorMin;
    let cwOi = 0, pfOi = 0;
    for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (!(k > 0)) continue;
        const c = pr.callsOI?.[i], p = pr.putsOI?.[i];
        if (k > S && k <= hi && typeof c === 'number' && c > cwOi) { cwOi = c; out.callWall = k; }
        if (k < S && k >= lo && typeof p === 'number' && p > pfOi) { pfOi = p; out.putFloor = k; }
    }
    const g = pr.gexCum;
    if (Array.isArray(g)) {
        const aMin = S * (1 - LEVEL_BANDS.gammaFlip), aMax = S * (1 + LEVEL_BANDS.gammaFlip);
        let prev = 0, seen = false, best: number | null = null, bestD = Infinity, nz: number | null = null, nzAbs = Infinity;
        for (let i = 0; i < ks.length; i++) {
            const cum = g[i], k = ks[i];
            if (typeof cum !== 'number' || !Number.isFinite(cum)) continue;
            const inAtm = k >= aMin && k <= aMax;
            // 부호가 바뀌는 행사가(직전 누적 < 0 → ≥ 0, 또는 > 0 → ≤ 0) — 첫 행사가는 비교 대상이 없다
            if (seen && inAtm && ((prev < 0 && cum >= 0) || (prev > 0 && cum <= 0))) {
                const d = Math.abs(k - S);
                if (d < bestD) { bestD = d; best = k; }
            }
            if (inAtm && Math.abs(cum) < nzAbs) { nzAbs = Math.abs(cum); nz = k; }
            prev = cum; seen = true;
        }
        if (!seen) out.gammaFlipType = 'NO_DATA';
        else if (best != null) { out.gammaFlipLevel = best; out.gammaFlipType = 'EXACT'; }
        else if (nz != null) { out.gammaFlipLevel = nz; out.gammaFlipType = 'NEAR_ZERO'; }
        else out.gammaFlipType = prev > 0 ? 'ALL_LONG' : 'ALL_SHORT';
    }
    return out;
}

/** 구조 결과에서 분포를 꺼낸다(배열 길이가 서로 맞지 않으면 null — 깨진 분포로 고르지 않는다). */
export function profileOf(sr: any): LevelProfile | null {
    const st = sr?.structure;
    const ks = st?.strikes;
    if (!Array.isArray(ks) || !ks.length || !Array.isArray(st.callsOI) || !Array.isArray(st.putsOI)) return null;
    if (st.callsOI.length !== ks.length || st.putsOI.length !== ks.length) return null;
    const gexCum = Array.isArray(st.gexCum) && st.gexCum.length === ks.length ? st.gexCum : null;
    return { strikes: ks, callsOI: st.callsOI, putsOI: st.putsOI, gexCum };
}

/**
 * 재선택·안전망 발동을 기록하는 곳 — 서비스 층(structureService)이 한 번 등록한다(이 파일은 I/O 를 하지 않는다).
 * kind: 'reselect' = 표시 가격이 판본 레벨을 넘어 같은 분포에서 다시 고름(판본을 새 기준가로 갱신할 신호)
 *       'drop'     = 안전망이 값을 지움(«가려짐» — 한 번도 나오지 않아야 정상)
 */
export type LevelEvent = { kind: 'reselect' | 'drop'; door: string; ticker: string | null; fields: LevelField[]; spot: number | null; chainDate?: string | null };
let levelEventSink: ((e: LevelEvent) => void) | null = null;
export function setLevelEventSink(fn: ((e: LevelEvent) => void) | null): void { levelEventSink = fn; }
function emit(e: LevelEvent): void { try { levelEventSink?.(e); } catch { /* 기록 실패가 응답을 막지 않는다 */ } }

/** 화면으로 나가는 레벨 한 벌 — 구조가 없으면 전부 null(출처도 null). 분포·종목은 싣지 않는다. */
export type DisplayLevels = Omit<OptionLevels, 'levelsSource' | 'levelProfile' | 'levelsTicker'> & { levelsSource: 'structure' | null };

export const NO_LEVELS: Readonly<DisplayLevels> = Object.freeze({
    maxPain: null, callWall: null, putFloor: null, pinZone: null, gammaFlipLevel: null,
    levelsExpiration: null, levelsChainDate: null, levelsSource: null, levelsAsOf: null, levelsSpot: null,
});

/**
 * 순수 함수 — 문(라우트)이 내보낼 레벨. 모든 문이 이 함수 하나를 쓴다.
 *   ① 판본 레벨(기준가 S0)을 그대로 — 같은 순간 모든 문이 같은 값.
 *   ② 표시 가격이 그 레벨을 넘었으면(실제 돌파) 그 필드만 같은 분포에서 표시 가격 기준으로 다시 고른다(levelsReselected).
 *      맥스페인은 OI 만의 함수라 다시 고를 값이 없다 — 표시 가격 ±35% 밖이면 정의상 «범위 밖»(null, levelsReselected).
 *      계산 때 S0 로 거는 규칙(maxPainOutOfBand)을 표시 가격으로 건 것이다. 분포 없이도 판정된다.
 *      (9/30 DH: 판본 기준가 뒤 현재가가 급락해 맥스페인이 35% 밖 → 안전망이 지워 «$—» 였다 — 가려짐이 아니라 정의다)
 *   ③ 안전망: 그래도 정의를 어기면 지운다(levelsDropped) — 분포가 없는 옛 판본에서만 일어날 수 있다.
 * 구조가 없으면 NO_LEVELS — 분석 캐시·DynamoDB 이력·자기 체인 계산 등 다른 생산자의 값을 남기지 않는다.
 * door = 기록용 문 이름(선택).
 */
export function displayLevels(lv: OptionLevels | null | undefined, displaySpot?: number | null, door = 'unknown'): DisplayLevels {
    if (!lv) return { ...NO_LEVELS };
    const { levelProfile, levelsTicker, ...rest } = lv;
    const out: any = { ...rest };
    delete out.levelsReselected;
    const P = posOrNull(displaySpot);
    if (P != null) {
        const bad = levelViolations(out, P);
        const re = levelProfile && bad.some((f) => f !== 'maxPain') ? levelsAt(levelProfile, P) : null;
        const fixed: LevelField[] = [];
        for (const f of bad) {
            if (f === 'maxPain') { out.maxPain = null; fixed.push(f); continue; }
            if (re && (f !== 'gammaFlipLevel' || re.gammaFlipType !== 'NO_DATA')) { out[f] = (re as any)[f]; fixed.push(f); }   // 감마 없는 옛 분포는 플립을 못 고른다
        }
        if (fixed.length) {
            out.levelsReselected = fixed;
            emit({ kind: 'reselect', door, ticker: levelsTicker ?? null, fields: fixed, spot: P, chainDate: lv.levelsChainDate });
        }
    }
    // 안전망 — 분포가 있으면 표시 가격 하나로(재선택한 필드의 기준이 표시 가격이다), 없으면 옛 규칙대로 S0·표시 가격 둘 다.
    const g = levelProfile ? gateLevels<DisplayLevels>(out, P ?? lv.levelsSpot) : gateLevels<DisplayLevels>(out, lv.levelsSpot, P);
    const fresh = (g.levelsDropped || []).filter((f) => !(lv.levelsDropped || []).includes(f));
    if (fresh.length) emit({ kind: 'drop', door, ticker: levelsTicker ?? null, fields: fresh, spot: P ?? posOrNull(lv.levelsSpot) });
    return g;
}

/**
 * 구조 결과 → 레벨 한 벌(판본). 레벨은 구조 계산이 기준가 S0 로 고른 값 그대로, 분포를 같이 싣는다.
 * 자기 현물 S0 로 게이트한다(옛 판본의 깨진 값 방어) — spot 이 오면 그것으로도(점수 입력용 옛 규칙).
 * 계산에 실패한 결과(OK 아님)·분포도 값도 없는 결과는 null.
 * ★ [2026-09-30] 분포가 있는데 네 값이 모두 정의상 없으면(얇은 체인) null 이 아니라 «전부 null 인 한 벌»(출처 structure)이다 —
 *   화면이 «범위 밖»으로 그리고 (i) 가 이유를 댄다. 예전엔 맥스페인·콜월·풋플로어가 다 비면 구조 «없음»으로 봐서
 *   출처가 사라져 «$—» 로 가려졌고, 감마플립만 있는 판본은 그 감마플립까지 버렸다(9/30 DH: 행사가 2.5·5·7.5, 현재가 0.93).
 */
export function levelsFromStructure(sr: any, spot?: number | null): OptionLevels | null {
    if (!sr || sr.options_status !== 'OK') return null;
    const noValue = sr.maxPain == null && sr.levels?.callWall == null && sr.levels?.putFloor == null && sr.gammaFlipLevel == null;
    if (noValue && !(Array.isArray(sr.structure?.strikes) && sr.structure.strikes.length > 0)) return null;
    const s0 = posOrNull(sr.underlyingPrice);
    // 맥스페인 35% 규칙(centralDataHub.sanitizeMaxPain)은 gateLevels 의 maxPain 밴드와 같다 — 한 곳에서 건다.
    const mp = posOrNull(sr.maxPain);
    const lv = gateLevels<OptionLevels>({
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
    lv.levelProfile = profileOf(sr);
    lv.levelsTicker = typeof sr.ticker === 'string' ? sr.ticker.toUpperCase() : null;
    return lv;
}


/**
 * command/unified 모양의 페이로드(structure.{maxPain,levels,gammaFlipLevel,expiration} + volatility.flipLevel)에
 * 레벨 한 벌을 덮는다(순수 함수). 묶음은 통째로 — 구조에 감마플립이 없으면 «없음»으로 둔다.
 * 저장본이 없으면: 페이로드의 structure 가 이 파일이 만든 결과(levelsProducer)일 때만 그걸 쓰고, 아니면 전부 null.
 * API 출구(command/unified)와 웹 /ticker SSR 이 같은 함수를 쓴다.
 */
export function applyLevelsToUnified(data: any, lv: OptionLevels | null | undefined, displaySpot?: number | null, door = 'command/unified'): any {
    const st = data?.structure;
    if (!st || typeof st !== 'object') return data;
    const own = !lv && st.levelsProducer === STRUCTURE_PRODUCER ? levelsFromStructure(st) : null;
    const d = displayLevels(lv ?? own, displaySpot, door);
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
            levelsReselected: d.levelsReselected,
        },
    };
    if (out.volatility && typeof out.volatility === 'object') {
        out.volatility = { ...out.volatility, flipLevel: d.gammaFlipLevel };
    }
    return out;
}

/**
 * 행의 «화면 현물» — 시간외(프리·애프터)에는 시간외 가격, 정규장에는 표시 가격(maxPainDist 기준과 같다).
 * ⚠️ [2026-09-30] intel/fast 는 정규장에도 extendedPrice 에 «오늘 프리마켓 가격»(extendedLabel 'PRE')을 싣는다 —
 *   예전 규칙(시간외 가격이 있으면 무조건 그것)이 ARM 297.87 을 288.645 로 보고 콜월을 350 → 322.5 로 다시 골랐다.
 *   행의 session 이 정규장이면 표시 가격을 쓴다. session 이 없으면 예전 규칙.
 */
export function rowSpot(rt: any): number | null {
    // watchlist 는 extendedPrice, portfolio 는 extPrice 라는 이름을 쓴다(뜻은 같다: 시간외 가격).
    const sess = String(rt?.session ?? '').toLowerCase();
    if (sess === 'reg' || sess === 'regular') return posOrNull(rt?.price) ?? posOrNull(rt?.extendedPrice) ?? posOrNull(rt?.extPrice);
    return posOrNull(rt?.extendedPrice) ?? posOrNull(rt?.extPrice) ?? posOrNull(rt?.price);
}

/**
 * 배치 서비스(watchlist·portfolio)·인텔 행처럼 레벨이 «평평하게» 담긴 모양에 레벨 한 벌을 덮는다(제자리 수정).
 * 구조가 없으면 레벨은 전부 null — 원래 값(분석 캐시·DynamoDB 이력)을 남기지 않는다.
 * maxPainDist 는 원래 규칙 그대로 «(맥스페인 − 기준가) / 기준가 %», 기준가 = 시간외 가격 || 표시 가격.
 */
export function applyLevelsToRealtime(rt: any, lv: OptionLevels | null | undefined, door = 'watchlist/batch'): void {
    if (!rt || typeof rt !== 'object') return;
    const ref = rowSpot(rt);
    const d = displayLevels(lv, ref, door);
    rt.maxPain = d.maxPain;
    rt.maxPainDist = d.maxPain && ref ? Number((((d.maxPain - ref) / ref) * 100).toFixed(2)) : null;
    rt.callWall = d.callWall;
    rt.putFloor = d.putFloor;
    rt.gammaFlipLevel = d.gammaFlipLevel;
    rt.levelsExpiration = d.levelsExpiration;
    rt.levelsChainDate = d.levelsChainDate;
    rt.levelsSource = d.levelsSource;
    rt.levelsAsOf = d.levelsAsOf ?? null;
    if (d.levelsDropped?.length) rt.levelsDropped = d.levelsDropped; else delete rt.levelsDropped;
    if (d.levelsReselected?.length) rt.levelsReselected = d.levelsReselected; else delete rt.levelsReselected;
}

// ════════════════════════════════════════════════════════════════════════════
// 화면 표시(공용) — 레벨 칸 하나를 «값 · 범위 밖 · —» 로 가르고, (i) 팝업 줄을 만든다  [2026-09-30]
//   «범위 밖» = 판본은 있는데 정의상 값이 없다(얇은 체인: 범위 안 OI>0 행사가 없음 · 맥스페인 35% 밖 · ±15% 안 감마 전환 없음).
//   «—»      = 판본이 아직 없다(첫 계산 중) · 안전망이 지운 값(levelsDropped — 한 번도 나오지 않아야 정상).
//   Command·Flow(그리고 내 종목) 화면은 이 함수들만 쓴다 — 같은 경우에 같은 글자. 순수 함수(React 없음).
// ════════════════════════════════════════════════════════════════════════════
type LevelLoc = 'ko' | 'en' | 'ja';
const levelLoc = (l: string | null | undefined): LevelLoc => (l === 'ko' || l === 'ja' ? l : 'en');
const OUT_OF_RANGE_TEXT: Record<LevelLoc, string> = { ko: '범위 밖', en: 'Out of range', ja: '範囲外' };
const OUT_OF_RANGE_WHY: Record<LevelField, Record<LevelLoc, string>> = {
    callWall: { ko: '+20% 안 콜 미결제약정 없음', en: 'No call open interest within +20%', ja: '+20%以内にコール建玉なし' },
    putFloor: { ko: '−20% 안 풋 미결제약정 없음', en: 'No put open interest within −20%', ja: '−20%以内にプット建玉なし' },
    gammaFlipLevel: { ko: '±15% 안 감마 전환 없음', en: 'No gamma flip within ±15%', ja: '±15%以内にガンマ転換なし' },
    maxPain: { ko: '현재가와 35% 넘게 떨어짐', en: 'More than 35% from the price', ja: '現在値から35%超の乖離' },
};

/** 화면이 가진 레벨 묶음의 표식(API 가 레벨과 함께 싣는 것) — live/ticker·배치는 levels*, command/unified 는 structure.* 이름 */
export type LevelMeta = {
    levelsSource?: string | null;
    levelsDropped?: string[] | null;
    levelsChainDate?: string | null;
    levelsExpiration?: string | null;
} | null | undefined;

export type LevelCellState = 'value' | 'outOfRange' | 'none';

/** 레벨 칸의 상태 — 값이 있으면 'value', 판본은 있는데 정의상 없으면 'outOfRange', 판본이 없거나 안전망이 지웠으면 'none'. */
export function levelCellState(value: unknown, meta: LevelMeta, field: LevelField): LevelCellState {
    if (posOrNull(value) != null) return 'value';
    if (meta?.levelsSource === 'structure' && !(meta.levelsDropped || []).includes(field)) return 'outOfRange';
    return 'none';
}

/** «범위 밖» 글자(칸에 들어간다). */
export function levelOutOfRangeText(locale: string | null | undefined): string {
    return OUT_OF_RANGE_TEXT[levelLoc(locale)];
}

/**
 * 레벨 값(행사가)의 숫자 글자 — «$» 는 부르는 쪽이 붙인다. 행사가를 반올림하지 않는다.
 *   337.5 → "337.5" · 1000 → "1000" · 0.5 → "0.5" · 2.25 → "2.25" (소수 둘째 자리까지, 끝의 0 은 뗀다)
 * ⚠️ [2026-09-30] 화면들이 `toFixed(0)` 으로 그려 337.5 를 «338»(없는 행사가), 0.5 를 «1» 로 보였다(실화면 BLNK: 맥스페인 0.5 → «$1»).
 */
export function formatLevelPrice(n: number): string {
    const r = Math.round(Number(n) * 100) / 100;
    if (!Number.isFinite(r)) return '—';
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const isYmd = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * (i) 팝업 줄 — ① 미결제약정 기준 날짜(실제 체인 날짜, 만기를 알면 앞에) ② 이 칸이 «범위 밖»이면 그 이유.
 * 줄바꿈(\n)으로 잇는다. 둘 다 없으면 null.
 */
export function levelInfoNote(field: LevelField, meta: LevelMeta, value: unknown, locale: string | null | undefined): string | null {
    const L = levelLoc(locale);
    const lines: string[] = [];
    if (meta?.levelsSource === 'structure' && isYmd(meta.levelsChainDate)) {
        const oi = L === 'ko' ? `미결제약정 ${md(meta.levelsChainDate)} 기준` : L === 'ja' ? `建玉 ${md(meta.levelsChainDate)} 基準` : `OI as of ${md(meta.levelsChainDate)}`;
        const exp = isYmd(meta.levelsExpiration) ? (L === 'ko' ? `${md(meta.levelsExpiration)} 만기 · ` : L === 'ja' ? `${md(meta.levelsExpiration)}満期 · ` : `${md(meta.levelsExpiration)} expiry · `) : '';
        lines.push(exp + oi);
    }
    if (levelCellState(value, meta, field) === 'outOfRange') lines.push(OUT_OF_RANGE_WHY[field][L]);
    return lines.length ? lines.join('\n') : null;
}

/** 여러 칸이 한 (i) 팝업을 쓸 때(Flow 눈금자: 풋플로어·콜월) — 기준 날짜 줄은 한 번, 이유는 칸마다. */
export function levelInfoNoteMany(items: Array<[LevelField, unknown]>, meta: LevelMeta, locale: string | null | undefined): string | null {
    const lines: string[] = [];
    for (const [f, v] of items) for (const line of (levelInfoNote(f, meta, v, locale) || '').split('\n')) if (line && !lines.includes(line)) lines.push(line);
    return lines.length ? lines.join('\n') : null;
}
