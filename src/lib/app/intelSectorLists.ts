/**
 * 앱 Intel 섹터 «설정 목록» — 카드 칩·+N 과 수치(변동·GEX·PCR·순 프리미엄…) 계산이 «같은 목록»을 쓴다 (2026-10-07, 앱 강화 정확성 2차)
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────────────────────────
 *   앱 Intel 카드는 칩(IONQ · RGTI · QBTS)과 «+N» 을 이 설정 목록으로 그렸는데, 수치는 서버 «엔진 목록»(/api/intel/fast 의 SECTOR_TICKERS — 알파·웹과 공용)으로
 *   계산했다. 퀀텀 엣지는 칩이 IONQ·RGTI·QBTS 인데 수치는 SMCI·SNOW·IONQ·DELL·AI·PATH·TWLO 일곱 개였다(이름과 맞지 않는 목록).
 *   결정(운영 세션 10/7): 섹터 이름에 맞는 «설정 목록» 기준으로 계산한다. 엔진 목록은 알파·웹이 쓰므로 건드리지 않는다 — 앱 Intel 계산만 맞춘다.
 *
 * ── 어떻게 ──────────────────────────────────────────────────────────────────────────────────────
 *   서버는 엔진 목록 그대로 시세를 준다. 앱 Intel 이 «설정 목록 종목의 시세»를 골라 쓴다(rebucketBySectorLists):
 *     · 설정 목록이 엔진 목록의 부분집합이면(대부분 — 엔진 목록에서 한 종목씩 뺀 모양) 그 종목만 남긴다.
 *     · 다른 섹터의 엔진 목록에 있는 종목(SNOW 는 퀀텀 엔진 목록, NET 은 사이버 엔진 목록)은 거기서 가져온다.
 *     · 어느 엔진 목록에도 없는 종목(RGTI · QBTS)은 앱이 배치로 따로 받아 «extras» 로 넣는다(옵션 지표 GEX·P/C 는 수집 Lambda 행이 없어 «—»).
 *
 * 순수 함수 — 시험 tests/intelSectorLists.test.ts.
 */

/** 섹터 id(앱 Intel 의 SECTOR_CONFIGS.id) → 설정 목록. 정본은 이 표 — 페이지의 SECTOR_CONFIGS.stocks 가 이것을 쓴다 */
export const APP_SECTOR_STOCKS: Record<string, string[]> = {
    m7: ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'META', 'GOOGL', 'AMZN'],
    silicon_core: ['AMD', 'AVGO', 'MU', 'ARM', 'TSM', 'ASML'],
    power_matrix: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR'],
    physical_ai: ['SERV', 'SYM', 'ISRG', 'TER', 'PL', 'RKLB'],
    bio_pulse: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN'],
    cyber_shield: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA'],
    orbit_defense: ['LMT', 'RTX', 'AXON', 'SPCX', 'ASTS', 'LUNR'],
    quantum_edge: ['IONQ', 'RGTI', 'QBTS'],
    fintech_pulse: ['PYPL', 'SOFI', 'AFRM', 'HOOD', 'UPST'],
    cloud_fortress: ['SNOW', 'DDOG', 'NET', 'CRM', 'NOW'],
};

/** 섹터 id → useIntelSharedData 가 돌려주는 배열 이름 */
export const SECTOR_ID_TO_HOOK_KEY = {
    m7: 'm7',
    physical_ai: 'physicalAI',
    silicon_core: 'siliconCore',
    power_matrix: 'powerMatrix',
    bio_pulse: 'bioPulse',
    cyber_shield: 'cyberShield',
    orbit_defense: 'orbitDefense',
    quantum_edge: 'quantumEdge',
    fintech_pulse: 'fintechPulse',
    cloud_fortress: 'cloudFortress',
} as const;

export type HookKey = (typeof SECTOR_ID_TO_HOOK_KEY)[keyof typeof SECTOR_ID_TO_HOOK_KEY];

type QuoteLike = { ticker: string; changePct?: number | null };

/** 설정 목록 종목 중 «시세를 어느 섹터 배열에서도 못 받는» 종목(앱이 따로 받아야 하는 것) */
export function configTickersMissingFrom(engineTickers: Iterable<string>, lists: Record<string, string[]> = APP_SECTOR_STOCKS): string[] {
    const have = new Set(engineTickers);
    const out: string[] = [];
    for (const list of Object.values(lists)) for (const t of list) if (!have.has(t) && !out.includes(t)) out.push(t);
    return out;
}

/**
 * 섹터 배열(엔진 목록 기준)을 설정 목록 기준으로 다시 묶는다. 시세가 없는 종목은 건너뛴다(만들어 넣지 않는다).
 * 결과는 변동률 내림차순 — 서버 섹터 응답과 같은 순서 규칙.
 */
export function rebucketBySectorLists<Q extends QuoteLike>(
    byHookKey: Partial<Record<HookKey, Q[]>>,
    extras: Q[] = [],
    lists: Record<string, string[]> = APP_SECTOR_STOCKS,
): Record<HookKey, Q[]> {
    const map = new Map<string, Q>();
    for (const arr of Object.values(byHookKey)) for (const q of arr || []) if (q?.ticker && !map.has(q.ticker)) map.set(q.ticker, q);
    for (const q of extras) if (q?.ticker && !map.has(q.ticker)) map.set(q.ticker, q);
    const out = {} as Record<HookKey, Q[]>;
    for (const [id, key] of Object.entries(SECTOR_ID_TO_HOOK_KEY) as Array<[string, HookKey]>) {
        const rows = (lists[id] || []).map((t) => map.get(t)).filter((q): q is Q => !!q);
        rows.sort((a, b) => (Number(b.changePct) || 0) - (Number(a.changePct) || 0));
        out[key] = rows;
    }
    return out;
}
