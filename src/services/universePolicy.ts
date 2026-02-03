// [S-56.2] Universe Policy SSOT
// ETF 분류, Leaders Track, Macro Ticker 정책

// === LEADERS TRACK 상수 ===
export const MAGNIFICENT_7 = ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA'] as const;
export const BIO_LEADERS_TOP5 = ['AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB'] as const;
export const DATACENTER_TOP5 = ['EQIX', 'DLR', 'AMT', 'CCI', 'SBAC'] as const;
// [V4.1] Physical AI Leaders - Robotics, Autonomous Vehicles, Industrial Automation
export const PHYSICAL_AI_TOP6 = ['ISRG', 'TER', 'ROK', 'MBLY', 'QCOM', 'PONY'] as const;

// === MACRO SSOT ===
export const MACRO_NASDAQ_TICKER = 'NQ=F';
export const MACRO_NASDAQ_SOURCE = 'YAHOO';

// === ETF 분류 ===
// 알려진 ETF 심볼 리스트 (대표적인 것들)
const KNOWN_ETF_SYMBOLS = new Set([
    // 레버리지/인버스 ETF
    'TQQQ', 'SQQQ', 'SPXL', 'SPXS', 'UPRO', 'UVXY', 'VXX', 'SVXY',
    'QLD', 'QID', 'SSO', 'SDS', 'DDM', 'DXD', 'UWM', 'TWM',
    'SOXL', 'SOXS', 'LABU', 'LABD', 'NUGT', 'DUST', 'JNUG', 'JDST',
    'TNA', 'TZA', 'FAS', 'FAZ', 'TECL', 'TECS', 'FNGU', 'FNGD',
    // 귀금속/원자재 ETF
    'GLD', 'SLV', 'IAU', 'PHYS', 'PSLV', 'GDX', 'GDXJ', 'SIL', 'SILJ',
    'USO', 'UNG', 'UCO', 'SCO', 'BOIL', 'KOLD', 'DBA', 'DBC', 'PDBC',
    'AGQ', 'SIVR', 'PPLT', 'PALL', 'COPX', 'CPER',
    // 지수 추종 ETF
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'VEA', 'VWO', 'EFA', 'EEM',
    'XLK', 'XLF', 'XLV', 'XLE', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE',
    'IVV', 'IJH', 'IJR', 'MDY', 'VB', 'VXF', 'VTV', 'VUG', 'VIG', 'VYM',
    // 섹터 ETF
    'XBI', 'IBB', 'XOP', 'OIH', 'KRE', 'KBE', 'SMH', 'SOXX', 'XHB', 'XRT',
    'ITB', 'HACK', 'ARKK', 'ARKG', 'ARKW', 'ARKF', 'ARKQ', 'ARKX',
    // 채권 ETF
    'TLT', 'TBT', 'TMF', 'TMV', 'IEF', 'SHY', 'BND', 'AGG', 'LQD', 'HYG', 'JNK',
    // 국가/지역 ETF
    'EWJ', 'EWZ', 'FXI', 'MCHI', 'KWEB', 'EWY', 'EWT', 'INDA', 'EWG', 'EWU',
    'EWP', 'EWQ', 'EWI', 'EWL', 'EWA', 'EWC', 'EWH', 'EWS', 'RSX',
    // 통화 ETF
    'UUP', 'FXE', 'FXY', 'FXB', 'FXC', 'FXA', 'FXS',
    // 기타 테마 ETF
    'VNQ', 'REM', 'MORT', 'PFF', 'SCHD', 'DGRO', 'DVY', 'HDV', 'SPHD',
    'ICLN', 'TAN', 'QCLN', 'LIT', 'REMX', 'BATT', 'DRIV', 'IDRV',
    // First Trust ETFs (V10.8.3)
    'FIEE', 'FIDU', 'FTEC', 'FXR', 'FXH', 'FXG', 'FXD', 'FXL', 'FXO', 'FXN', 'FXU', 'FXZ',
    'FTCS', 'FTSL', 'FTXN', 'FTXR', 'FTXD', 'FTXG', 'FTXH', 'FTXL', 'FTXO', 'FTXZ',
    // --- 추가 (S-56.2) ---
    'FCX_ETF_CHECK', // Placeholder - FCX는 주식임
]);

// ETF 이름 패턴 (ProShares, Direxion 등)
const ETF_NAME_PATTERNS = [
    /proshares/i,
    /direxion/i,
    /ishares/i,
    /vanguard.*etf/i,
    /spdr/i,
    /invesco/i,
    /wisdomtree/i,
    /first trust/i,
    /vaneck/i,
    / etf$/i,
    / fund$/i,
    /^graniteshares/i,
    /leveraged/i,
    /inverse/i,
    /ultra/i,
    /2x/i,
    /3x/i,
    /-2x/i,
    /-3x/i,
];

// === SECTOR DEFINITIONS (SSOT) ===
// Representative "Market Core" Tickers for Flow Calculation & Boost
export const SECTOR_MAP: Record<string, { name: string; tickers: string[] }> = {
    XLK: { name: "기술주", tickers: ["NVDA", "AAPL", "MSFT", "AVGO", "ORCL", "AMD", "QCOM", "INTC", "IBM", "TXN"] },
    XLC: { name: "커뮤니케이션", tickers: ["GOOGL", "META", "NFLX", "DIS", "CMCSA", "TMUS", "VZ", "T", "CHTR"] },
    XLY: { name: "임의소비재", tickers: ["AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "BKNG", "TJX"] },
    XLE: { name: "에너지", tickers: ["XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "OXY"] },
    XLF: { name: "금융", tickers: ["JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK", "C", "AXP"] },
    XLV: { name: "헬스케어", tickers: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "PFE", "ABT", "DHR"] },
    XLI: { name: "산업재", tickers: ["GE", "CAT", "HON", "UNP", "UPS", "DE", "RTX", "LMT", "BA"] },
    XLB: { name: "소재", tickers: ["LIN", "SHW", "FCX", "APD", "ECL", "NEM", "DOW", "DD"] },
    XLP: { name: "필수소비재", tickers: ["PG", "COST", "WMT", "KO", "PEP", "PM", "MO", "CL", "KMB"] },
    XLRE: { name: "부동산", tickers: ["PLD", "AMT", "EQIX", "CCI", "PSA", "O", "VICI", "WELL"] },
    XLU: { name: "유틸리티", tickers: ["NEE", "SO", "DUK", "CEG", "AEP", "SRE", "D", "PEG"] },
    AI_PWR: { name: "AI 전력망", tickers: ["VST", "CEG", "VRT", "ETN", "PWR"] }, // New Synthetic Sector
};

export function getSectorForTicker(ticker: string): string | null {
    const t = ticker.toUpperCase();
    for (const [sectorId, info] of Object.entries(SECTOR_MAP)) {
        if (info.tickers.includes(t)) return sectorId;
    }
    return null;
}


export interface SymbolClassification {
    isETF: boolean;
    isStock: boolean;
    classificationReason: string;
    classifierVersion: string;
}

const CLASSIFIER_VERSION = 'S56.2-v1';

/**
 * 심볼이 ETF인지 분류
 * @param symbol 티커 심볼
 * @param name 회사/펀드명 (선택)
 * @param assetClass API에서 반환된 asset class (선택)
 */
export function classifySymbol(
    symbol: string,
    name?: string,
    assetClass?: string
): SymbolClassification {
    const sym = symbol.toUpperCase().trim();

    // 1. 알려진 ETF 리스트 체크
    if (KNOWN_ETF_SYMBOLS.has(sym)) {
        return {
            isETF: true,
            isStock: false,
            classificationReason: 'KNOWN_ETF_LIST',
            classifierVersion: CLASSIFIER_VERSION
        };
    }

    // 2. Asset Class 체크 (Polygon API 등에서 제공하는 경우)
    if (assetClass) {
        const ac = assetClass.toLowerCase();
        if (ac.includes('etf') || ac.includes('fund') || ac.includes('etp')) {
            return {
                isETF: true,
                isStock: false,
                classificationReason: `ASSET_CLASS:${assetClass}`,
                classifierVersion: CLASSIFIER_VERSION
            };
        }
    }

    // 3. 이름 패턴 체크
    if (name) {
        for (const pattern of ETF_NAME_PATTERNS) {
            if (pattern.test(name)) {
                return {
                    isETF: true,
                    isStock: false,
                    classificationReason: `NAME_PATTERN:${pattern.source}`,
                    classifierVersion: CLASSIFIER_VERSION
                };
            }
        }
    }

    // 4. 심볼 자체 패턴 (레버리지 힌트)
    if (/^[A-Z]{2,4}[LSU]$/.test(sym) && sym.length <= 5) {
        // TQQQ, SQQQ 같은 패턴이지만 리스트에 없으면 보수적으로 처리
        // 일단 주식으로 분류 (False negative 선호)
    }

    // 기본: 주식으로 분류
    return {
        isETF: false,
        isStock: true,
        classificationReason: 'DEFAULT_STOCK',
        classifierVersion: CLASSIFIER_VERSION
    };
}

export interface UniversePolicy {
    etfExcluded: boolean;
    etfExclusionReasonKR: string;
    classifierVersion: string;
    excludedETFs: string[]; // 제외된 ETF 심볼 리스트 (최대 200개)
}

export interface UniverseStats {
    universeTotal: number;          // 전체 유니버스
    universeStocks: number;         // ETF 제외 후 주식 수 (= 표본수)
    universeETFsExcluded: number;   // 제외된 ETF 수
    universeLeadersTrack: number;   // Leaders Track 종목 수
    stockUniversePoolSize: number;  // [S-56.3] Stock Pool 크기
    finalItemsCount: number;        // [S-56.3] 최종 선택된 아이템 수
}

export interface LeadersTrackGroup {
    key: string;
    titleKR: string;
    symbols: string[];
    items: any[]; // AnalyzedTicker[]
}

export interface LeadersTrack {
    groups: LeadersTrackGroup[];
}

export interface MacroSSOT {
    ticker: string;
    source: string;
    noteKR: string;
}

/**
 * 유니버스에서 ETF를 필터링하고 정책 적용
 * @param tickers 분석된 티커 배열
 * @returns { filtered, policy, stats }
 */
export function applyUniversePolicy(tickers: any[]): {
    filtered: any[];
    policy: UniversePolicy;
    stats: UniverseStats;
} {
    const excludedETFs: string[] = [];
    const filtered: any[] = [];

    for (const t of tickers) {
        const sym = t.symbol || t.ticker || '';
        const name = t.name || t.companyName || '';
        const assetClass = t.assetClass || t.type || '';

        const classification = classifySymbol(sym, name, assetClass);

        // 분류 정보 첨부
        t.classification = classification;

        if (classification.isETF) {
            if (excludedETFs.length < 200) {
                excludedETFs.push(sym);
            }
        } else {
            filtered.push(t);
        }
    }

    const policy: UniversePolicy = {
        etfExcluded: true,
        etfExclusionReasonKR: 'ETF는 개별 종목 분석에서 제외됨 (S-56.2 정책)',
        classifierVersion: CLASSIFIER_VERSION,
        excludedETFs
    };

    const stats: UniverseStats = {
        universeTotal: tickers.length,
        universeStocks: filtered.length,
        universeETFsExcluded: excludedETFs.length,
        universeLeadersTrack: MAGNIFICENT_7.length + BIO_LEADERS_TOP5.length + DATACENTER_TOP5.length,
        stockUniversePoolSize: 0, // Will be set by applyUniversePolicyWithBackfill
        finalItemsCount: filtered.length
    };

    return { filtered, policy, stats };
}

/**
 * Leaders Track 빌드
 * @param allTickers 전체 분석된 티커 배열 (ETF 포함 가능)
 */
export function buildLeadersTrack(allTickers: any[]): LeadersTrack {
    const tickerMap = new Map(allTickers.map(t => [t.symbol || t.ticker, t]));

    const groups: LeadersTrackGroup[] = [
        {
            key: 'magnificent7',
            titleKR: '매그니피센트 7',
            symbols: [...MAGNIFICENT_7],
            items: MAGNIFICENT_7.map(sym => tickerMap.get(sym)).filter(Boolean)
        },
        {
            key: 'bioLeadersTop5',
            titleKR: '바이오 리더 Top 5',
            symbols: [...BIO_LEADERS_TOP5],
            items: BIO_LEADERS_TOP5.map(sym => tickerMap.get(sym)).filter(Boolean)
        },
        {
            key: 'dataCenterTop5',
            titleKR: '데이터센터 리더 Top 5',
            symbols: [...DATACENTER_TOP5],
            items: DATACENTER_TOP5.map(sym => tickerMap.get(sym)).filter(Boolean)
        }
    ];

    return { groups };
}

/**
 * Macro SSOT 생성
 */
export function getMacroSSOT(): MacroSSOT {
    return {
        ticker: MACRO_NASDAQ_TICKER,
        source: MACRO_NASDAQ_SOURCE,
        noteKR: 'Nasdaq 100 선물 지수 (E-mini)'
    };
}

/**
 * 무결성 검증: items에 ETF가 포함되었는지 체크
 * @param items Final12 등 선택된 아이템
 * @returns { valid, failedSymbols, reasonKR }
 */
export function validateNoETFInItems(items: any[]): {
    valid: boolean;
    failedSymbols: string[];
    reasonKR: string;
} {
    const failedSymbols: string[] = [];

    for (const item of items) {
        if (item.classification?.isETF) {
            failedSymbols.push(item.symbol || item.ticker);
        }
    }

    return {
        valid: failedSymbols.length === 0,
        failedSymbols,
        reasonKR: failedSymbols.length > 0
            ? `ETF가 items에 포함됨: ${failedSymbols.join(', ')}`
            : 'ETF 없음 (정상)'
    };
}

// === [S-56.3] STOCK UNIVERSE POOL ===

let _stockUniverseCache: string[] | null = null;

/**
 * Stock Universe Pool 로드 (300개 미국 주식)
 * @returns 주식 심볼 배열
 */
export function loadStockUniversePool(): string[] {
    if (_stockUniverseCache) return _stockUniverseCache;

    try {
        // Node.js 환경에서 파일 로드
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');
        const filePath = path.join(process.cwd(), 'data', 'stock_universe_us300.json');

        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const symbols: string[] = data.symbols || [];
            _stockUniverseCache = symbols;
            console.log(`[S-56.3] Loaded Stock Universe Pool: ${symbols.length} symbols`);
            return symbols;
        }
    } catch (e) {
        console.warn('[S-56.3] Failed to load stock universe pool:', (e as Error).message);
    }

    // Fallback: 기본 대형주 리스트
    _stockUniverseCache = [
        ...MAGNIFICENT_7,
        ...BIO_LEADERS_TOP5,
        ...DATACENTER_TOP5,
        'TXN', 'LRCX', 'ON', 'TGT', 'FCX', 'COST', 'HD', 'LOW', 'WMT', 'PG',
        'KO', 'PEP', 'MCD', 'SBUX', 'NKE', 'V', 'MA', 'JPM', 'BAC', 'GS'
    ];
    return _stockUniverseCache;
}

/**
 * 주어진 심볼이 Stock Pool에 있는지 확인
 */
export function isInStockPool(symbol: string): boolean {
    const pool = loadStockUniversePool();
    return pool.includes(symbol.toUpperCase());
}

/**
 * [S-56.3] Backfill to Target: 12개 채우기
 * @param currentItems 현재 선택된 아이템 (ETF 제외된 상태)
 * @param allAnalyzed 전체 분석된 티커 (ETF 포함)
 * @param targetCount 목표 개수 (기본 12)
 */
export function backfillToTarget(
    currentItems: any[],
    allAnalyzed: any[],
    targetCount: number = 12
): { items: any[]; backfilledCount: number; reasonKR: string; backfilledSymbols: string[] } {
    if (currentItems.length >= targetCount) {
        return {
            items: currentItems.slice(0, targetCount),
            backfilledCount: 0,
            reasonKR: '충분한 종목 수',
            backfilledSymbols: []
        };
    }

    const needed = targetCount - currentItems.length;
    const currentSymbols = new Set(currentItems.map(t => t.symbol || t.ticker));
    const stockPool = new Set(loadStockUniversePool());

    // Backfill 후보: Stock Pool에 있고, 현재 선택되지 않았으며, ETF가 아닌 것
    const backfillCandidates = allAnalyzed
        .filter(t => {
            const sym = t.symbol || t.ticker;
            const classification = t.classification || classifySymbol(sym);
            return (
                !currentSymbols.has(sym) &&
                stockPool.has(sym) &&
                !classification.isETF
            );
        })
        .sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0))
        .slice(0, needed)
        // [S-56.4] Tag as backfilled
        .map(t => ({ ...t, isBackfilled: true }));

    const result = [...currentItems, ...backfillCandidates];

    return {
        items: result,
        backfilledCount: backfillCandidates.length,
        backfilledSymbols: backfillCandidates.map(t => t.symbol || t.ticker),
        reasonKR: backfillCandidates.length > 0
            ? `${backfillCandidates.length}개 종목 Stock Pool에서 backfill`
            : 'Backfill 대상 없음'
    };
}

/**
 * [S-56.3] Extended Universe Policy with backfill
 */
export interface ExtendedUniversePolicy extends UniversePolicy {
    noteKR: string;
    backfillApplied: boolean;
    backfillCount: number;
}

export function applyUniversePolicyWithBackfill(
    tickers: any[],
    targetCount: number = 12
): {
    filtered: any[];
    final: any[];
    policy: ExtendedUniversePolicy;
    stats: UniverseStats;
} {
    // 1. ETF 제외
    const { filtered, policy: basePolicy, stats: baseStats } = applyUniversePolicy(tickers);

    // 2. Stock Pool 로드
    const stockPool = loadStockUniversePool();

    // 3. Backfill 적용
    const { items: final, backfilledCount, reasonKR } = backfillToTarget(filtered, tickers, targetCount);

    // 4. Extended Policy
    const policy: ExtendedUniversePolicy = {
        ...basePolicy,
        noteKR: `main universe source: stock_universe_us300.json | ETF exclusion applied: yes | final fill strategy: backfill from stock pool${backfilledCount > 0 ? ` (${backfilledCount}개)` : ''}`,
        backfillApplied: backfilledCount > 0,
        backfillCount: backfilledCount
    };

    // 5. Extended Stats
    const stats: UniverseStats = {
        ...baseStats,
        stockUniversePoolSize: stockPool.length,
        finalItemsCount: final.length
    };

    return { filtered, final, policy, stats };
}


// [V4.0] EXPANDED UNIVERSE POOL (Dynamic Stock Discovery)
import { fetchTopGainers, getTopVolumeStocks } from './massiveClient';

export interface ExpandedUniverseResult {
    symbols: string[];
    sources: {
        fixedLeaders: number;
        topGainers: number;
        topVolume: number;
        total: number;
        deduplicated: number;
    };
    noteKR: string;
}

/**
 * [V4.0] Get Expanded Universe Pool
 * Combines: Fixed Leaders (17) + Top Gainers (20) + Top Volume (200)
 * Returns deduplicated, ETF-filtered stock symbols
 */
export async function getExpandedUniversePool(): Promise<ExpandedUniverseResult> {
    console.log('[V4.0] Building Expanded Universe Pool...');

    // 1. Fixed Leaders (always included) - V4.1 with Physical AI
    const fixedLeaders = [
        ...MAGNIFICENT_7,
        ...BIO_LEADERS_TOP5,
        ...DATACENTER_TOP5,
        ...PHYSICAL_AI_TOP6
    ];

    // 2. Top Gainers (momentum stocks) with Quality Gate
    let topGainers: string[] = [];
    try {
        const gainersRaw = await fetchTopGainers();
        // Quality Gate: $5+, Volume 100K+
        topGainers = gainersRaw
            .filter((g: any) => {
                const price = g.day?.c || g.prevDay?.c || 0;
                const volume = g.day?.v || g.prevDay?.v || 0;
                return price >= 5 && price <= 2000 && volume >= 100000;
            })
            .map((g: any) => g.ticker);
    } catch (e) {
        console.warn('[V4.0] Failed to fetch top gainers:', e);
    }

    // 3. Top Volume Stocks (whale activity candidates)
    let topVolume: string[] = [];
    try {
        topVolume = await getTopVolumeStocks(200);
    } catch (e) {
        console.warn('[V4.0] Failed to fetch top volume stocks:', e);
    }

    // 4. Combine and deduplicate
    const combinedRaw = [...fixedLeaders, ...topGainers, ...topVolume];
    const totalRaw = combinedRaw.length;

    // 5. Deduplicate
    const uniqueSymbols = [...new Set(combinedRaw.map(s => s.toUpperCase()))];

    // 6. Filter out ETFs
    const filteredSymbols = uniqueSymbols.filter(symbol => {
        const classification = classifySymbol(symbol);
        return !classification.isETF;
    });

    console.log(`[V4.0] Universe Expansion Complete: ${fixedLeaders.length} fixed + ${topGainers.length} gainers + ${topVolume.length} volume = ${filteredSymbols.length} unique stocks`);

    return {
        symbols: filteredSymbols,
        sources: {
            fixedLeaders: fixedLeaders.length,
            topGainers: topGainers.length,
            topVolume: topVolume.length,
            total: totalRaw,
            deduplicated: filteredSymbols.length
        },
        noteKR: `V4.0 확장 유니버스: 고정 ${fixedLeaders.length}개 + 상승률 ${topGainers.length}개 + 거래량 ${topVolume.length}개 → 중복제거 후 ${filteredSymbols.length}개`
    };
}

