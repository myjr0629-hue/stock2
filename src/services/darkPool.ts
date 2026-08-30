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

/**
 * 「장외 비중 47.4%」 하나로는 정보가 아니다. 이 종목에서 평소보다 높은지,
 * 그 장외 물량이 «매집»인지 «헤지»인지까지 가야 인사이트가 된다.
 * 아래 파생값은 전부 EC2 적재 시점에 20일 이력으로 계산된다.
 */
export interface DarkPoolTicker {
    ticker: string;
    /** 장외 체결 비중 % */
    pct: number;
    /** 장외 체결 거래량(주) */
    volume: number;
    /** 장외 체결 중 공매도 비중 % — 벤더는 주지 않던 값 */
    shortPct: number | null;
    /** 오늘 장외 물량 ÷ 20일 평균. 1.0 = 평소, 1.76 = 평소의 1.8배 */
    volRatio: number | null;
    /** 장외 «물량»의 자기 20일 백분위 */
    volP: number | null;
    /** 장외 «공매도 비중»의 자기 20일 백분위 */
    shortP: number | null;
    /** 장외 «비중 %»의 자기 백분위 — 오늘부터 누적(과거 통합거래량 없어 소급 불가) */
    pctP: number | null;
    /**
     * 은밀 축적 점수 0~100.
     *   장외 물량이 평소보다 많고(volP↑) 그 물량 중 공매도 비중은 평소보다
     *   낮으면(shortP↓) → 호가창 밖에서 «사 모으는» 그림.
     *   ⚠️ 예측이 아니라 «포지셔닝 판독»이다. 문구도 그렇게 쓸 것.
     */
    stealth: number | null;
    /** ACCUMULATION(≥70) · DISTRIBUTION(≤30) · NEUTRAL */
    regime: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | null;
    /** 관측일 (T+1 · 장중 실시간 아님) */
    date: string | null;
    /** 같은 날 전 종목 평균 — 「높다/낮다」를 말하려면 기준이 필요하다 */
    marketAvg: number | null;
    source: 'FINRA';
}

/** Redis 행 → 공개 타입. 없는 파생값은 **null 로 둔다**(0 을 만들지 않는다). */
function toTicker(t: string, row: any, date: string | null, marketAvg: number | null): DarkPoolTicker {
    const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
        ticker: t,
        pct: row.pct,
        volume: row.vol ?? 0,
        shortPct: num(row.shortPct),
        volRatio: num(row.volRatio),
        volP: num(row.volP),
        shortP: num(row.shortP),
        pctP: num(row.pctP),
        stealth: num(row.stealth),
        regime: row.regime === 'ACCUMULATION' || row.regime === 'DISTRIBUTION' || row.regime === 'NEUTRAL'
            ? row.regime : null,
        date,
        marketAvg,
        source: 'FINRA',
    };
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
    return toTicker(t, row, data?.date ?? null, typeof data?.marketAvg === 'number' ? data.marketAvg : null);
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
        out[t] = toTicker(t, row, data.date ?? null, typeof data.marketAvg === 'number' ? data.marketAvg : null);
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════
//  판독 — 숫자를 «문장»으로
//
//  SEO 페이지 · 앱 화면 · AI 프롬프트가 **같은 해석**을 쓰게 한 곳에 둔다.
//  화면마다 따로 쓰면 같은 데이터가 다른 말을 하게 된다(오늘 실제로 겪었다).
// ══════════════════════════════════════════════════════════════════════

export type Loc = 'ko' | 'en' | 'ja';
const pick = (l: Loc, ko: string, en: string, ja: string) => (l === 'ko' ? ko : l === 'ja' ? ja : en);

/** 레짐 라벨 */
export function regimeLabel(r: DarkPoolTicker['regime'], l: Loc): string | null {
    if (!r) return null;
    if (r === 'ACCUMULATION') return pick(l, '은밀 매집', 'Stealth accumulation', '静かな買い集め');
    if (r === 'DISTRIBUTION') return pick(l, '은밀 분산', 'Stealth distribution', '静かな売り抜け');
    return pick(l, '중립', 'Neutral', '中立');
}

/**
 * 한 줄 판독. **없는 것은 말하지 않는다** — 파생값이 null 이면 그 절을 뺀다.
 * ⚠️ 예측이 아니라 «포지셔닝 판독»이다. 미래를 암시하는 표현을 쓰지 않는다.
 */
export function readDarkPool(d: DarkPoolTicker | null, l: Loc = 'ko'): string | null {
    if (!d) return null;
    const parts: string[] = [];

    // ① 비중 — 시장 평균과 견준다
    if (d.marketAvg != null) {
        const gap = d.pct - d.marketAvg;
        parts.push(
            Math.abs(gap) < 3
                ? pick(l, `장외 체결 ${d.pct}% (시장 평균 수준)`, `${d.pct}% off-exchange (in line with the market)`, `場外約定 ${d.pct}%（市場平均並み）`)
                : gap > 0
                    ? pick(l, `장외 체결 ${d.pct}% — 시장 평균보다 ${gap.toFixed(1)}%p 높음`, `${d.pct}% off-exchange — ${gap.toFixed(1)}pp above the market`, `場外約定 ${d.pct}% — 市場平均より${gap.toFixed(1)}pt高い`)
                    : pick(l, `장외 체결 ${d.pct}% — 시장 평균보다 ${Math.abs(gap).toFixed(1)}%p 낮음`, `${d.pct}% off-exchange — ${Math.abs(gap).toFixed(1)}pp below the market`, `場外約定 ${d.pct}% — 市場平均より${Math.abs(gap).toFixed(1)}pt低い`),
        );
    } else {
        parts.push(pick(l, `장외 체결 ${d.pct}%`, `${d.pct}% off-exchange`, `場外約定 ${d.pct}%`));
    }

    // ② 물량 — «평소의 몇 배»가 비중보다 강한 신호다
    if (d.volRatio != null && Math.abs(d.volRatio - 1) >= 0.25) {
        parts.push(
            d.volRatio >= 1
                ? pick(l, `물량은 평소의 ${d.volRatio.toFixed(1)}배`, `volume ${d.volRatio.toFixed(1)}× its norm`, `出来高は平常の${d.volRatio.toFixed(1)}倍`)
                : pick(l, `물량은 평소의 ${d.volRatio.toFixed(1)}배로 한산`, `volume only ${d.volRatio.toFixed(1)}× its norm`, `出来高は平常の${d.volRatio.toFixed(1)}倍と閑散`),
        );
    }

    // ③ 레짐 — 그 장외 물량이 매집인지 헤지인지
    if (d.regime && d.regime !== 'NEUTRAL' && d.shortPct != null) {
        parts.push(
            d.regime === 'ACCUMULATION'
                ? pick(l, `그중 공매도는 ${d.shortPct}%로 낮아 «매집» 쪽 그림`, `only ${d.shortPct}% of it short — reads as accumulation`, `うち空売りは${d.shortPct}%と低く「買い集め」寄り`)
                : pick(l, `그중 공매도가 ${d.shortPct}%로 높아 «헤지·분산» 쪽 그림`, `${d.shortPct}% of it short — reads as hedging or distribution`, `うち空売りが${d.shortPct}%と高く「ヘッジ・売り」寄り`),
        );
    }

    return parts.join(' · ');
}

/** AI 프롬프트에 넣을 사실 나열 (해석은 AI 에게 맡기되 «없는 값»은 주지 않는다) */
export function darkPoolFacts(d: DarkPoolTicker | null): string | null {
    if (!d) return null;
    const f = [`off-exchange share ${d.pct}% (market avg ${d.marketAvg ?? 'n/a'}%)`];
    if (d.shortPct != null) f.push(`short share of that off-exchange volume ${d.shortPct}%`);
    if (d.volRatio != null) f.push(`off-exchange volume ${d.volRatio}x its own 20-day average`);
    if (d.stealth != null) f.push(`stealth-positioning score ${d.stealth}/100 (${d.regime})`);
    f.push(`as of ${d.date} (prior close, FINRA TRF)`);
    return f.join('; ');
}
