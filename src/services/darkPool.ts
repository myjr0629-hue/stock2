/**
 * 다크풀(장외 체결) 비중 — **복원됨**.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 「영구 상실」은 틀린 판단이었다
 *
 *   2026-08-28 벤더 권한 상실로 다크풀 지표가 죽었고, 나는 이를 «영구
 *   상실»로 적고 대체 지표를 만들었다. **그 판단이 틀렸다.**
 *   미국의 모든 장외 체결은 법으로 FINRA TRF 에 보고되고 FINRA 가
 *   그것을 공개한다. 벤더가 팔던 것의 **원본**이다.
 *   (8-K 본문 → SEC 원문, 국채 → 재무부 원본과 같은 패턴이다.
 *    「대체 불가」로 적기 전에 원본을 찾을 것.)
 *
 * 무엇을 재는가 — 라벨을 정확히 쓸 것
 *   FINRA TRF 보고 거래량 ÷ 통합 거래량 = **장외 체결 비중**.
 *   여기엔 ATS(좁은 의미의 다크풀)와 도매업자 내부체결이 함께 들어간다.
 *   시중 도구가 「Dark Pool %」라고 부르는 것이 바로 이 값이다.
 *   실측(2026-08-28): SPY 34.6% · NVDA 45.2% · TSLA 47.4% · 평균 51.0%
 *
 * ⚠️ 라이선스 (FINRA Specific Terms for Equity Data §2.3)
 *   (a) 화면에 **출처 FINRA 를 반드시 명시**한다 → `ATTRIBUTION`
 *   (b) 이 데이터에 **별도 요금을 매기지 않는다**. 유료 상품에 끼워
 *       주는 것은 허용되나 «추가 과금»은 금지 → 보상형 광고 뒤나
 *       유료 전용으로 «가두지 말 것».
 *   (c) 최종 사용자의 재배포 금지를 서비스 약관에 명시한다.
 *   (d) 그 준수를 위한 합리적 노력.
 *   §2.4 파생 지표 생성은 허용된다.
 * ══════════════════════════════════════════════════════════════════════
 */

const KEY = 'finra:offexchange';
const HIST_KEY = 'finra:offexchange:hist';

/** 화면에 그대로 노출해야 하는 출처 표기 (§2.3-a) */
export const ATTRIBUTION = 'Data source: FINRA';

export interface DarkPoolTicker {
    ticker: string;
    /** 장외 체결 비중 % */
    pct: number;
    /** 장외 체결 거래량(주) */
    volume: number;
    /** 장외 체결 중 공매도 비중 % — 벤더는 주지 않던 값 */
    shortPct: number | null;
    /** 관측일 (T+1 · 장중 실시간 아님) */
    date: string | null;
    /** 같은 날 전 종목 평균 — 「높다/낮다」를 말하려면 기준이 필요하다 */
    marketAvg: number | null;
    source: 'FINRA';
}

export interface DarkPoolMarket {
    marketAvg: number | null;
    covered: number;
    date: string | null;
    /** 시장 평균의 자기 이력 대비 백분위 (표본 10일 미만이면 null) */
    percentile: number | null;
    samples: number;
    source: 'FINRA';
}

const MIN_HIST = 10;

async function readKey<T = any>(key: string): Promise<T | null> {
    const proxy = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
    const auth = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${proxy}/get?key=${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${auth}` },
            signal: controller.signal,
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const raw = await res.json();
        return (typeof raw?.result === 'string' ? JSON.parse(raw.result) : raw?.result) ?? null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 한 종목의 장외 체결 비중. 유니버스에 없으면 null —
 * **0 을 만들지 않는다.** 0 은 「장외 거래가 없었다」는 주장이고,
 * 그건 사실상 어떤 상장 종목에도 해당하지 않는다.
 */
export async function getDarkPool(ticker: string): Promise<DarkPoolTicker | null> {
    const t = (ticker || '').toUpperCase();
    if (!t) return null;
    const data = await readKey<{ date: string; tickers: Record<string, any>; marketAvg: number }>(KEY);
    const row = data?.tickers?.[t];
    if (!row || typeof row.pct !== 'number' || !(row.pct > 0)) return null;
    return {
        ticker: t,
        pct: row.pct,
        volume: row.vol ?? 0,
        shortPct: typeof row.shortPct === 'number' ? row.shortPct : null,
        date: data?.date ?? null,
        marketAvg: typeof data?.marketAvg === 'number' ? data.marketAvg : null,
        source: 'FINRA',
    };
}

/** 시장 전체 요약 + 자기 이력 백분위 */
export async function getDarkPoolMarket(): Promise<DarkPoolMarket | null> {
    const data = await readKey<{ date: string; marketAvg: number; covered: number }>(KEY);
    if (!data || typeof data.marketAvg !== 'number') return null;

    const hist = await readKey<{ points: Array<{ date: string; avg: number }> }>(HIST_KEY);
    const past = (hist?.points ?? [])
        .filter(p => p && p.date !== data.date && typeof p.avg === 'number')
        .map(p => p.avg);

    return {
        marketAvg: data.marketAvg,
        covered: data.covered ?? 0,
        date: data.date ?? null,
        percentile: past.length >= MIN_HIST
            ? Math.round((past.filter(v => v <= data.marketAvg).length / past.length) * 100)
            : null,
        samples: past.length,
        source: 'FINRA',
    };
}

/** 여러 종목을 한 번에 — 목록 화면에서 종목마다 Redis 를 때리지 않게 */
export async function getDarkPoolBatch(tickers: string[]): Promise<Record<string, DarkPoolTicker>> {
    const data = await readKey<{ date: string; tickers: Record<string, any>; marketAvg: number }>(KEY);
    const out: Record<string, DarkPoolTicker> = {};
    if (!data?.tickers) return out;
    for (const raw of tickers) {
        const t = (raw || '').toUpperCase();
        const row = data.tickers[t];
        if (!row || typeof row.pct !== 'number' || !(row.pct > 0)) continue;
        out[t] = {
            ticker: t,
            pct: row.pct,
            volume: row.vol ?? 0,
            shortPct: typeof row.shortPct === 'number' ? row.shortPct : null,
            date: data.date ?? null,
            marketAvg: typeof data.marketAvg === 'number' ? data.marketAvg : null,
            source: 'FINRA',
        };
    }
    return out;
}
