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

import { isEtf } from '@/lib/seo/etfSet';

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
    /**
     * 장외 체결 중 공매도 비중 %.
     * ⚠️ **이 숫자 자체는 방향성이 아니다.** 시장 중앙값이 49.4% 다 —
     *    도매업자가 소매 매수의 상대가 될 때 일단 공매도로 팔고 되사기
     *    때문에 절반은 «구조적»으로 찍힌다. 이 값만 보여 주면
     *    「46% 공매도 = 하락 베팅」으로 오해한다(실제로 그렇게 읽혔다).
     *    반드시 shortAvg(그 종목의 평소)와 **함께** 보여 줄 것.
     */
    shortPct: number | null;
    /** 이 종목의 20일 평균 공매도 비중 — 기준선 */
    shortAvg: number | null;
    /** 오늘 − 평소 (%p). 여기가 «이상»을 말하는 자리다 */
    shortDev: number | null;
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
        shortAvg: num(row.shortAvg),
        shortDev: num(row.shortDev),
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

/**
 * ⚠️ 읽기 예산은 «키 크기»에 맞춰야 한다. `finra:offexchange` 는 **2.19MB** 이고
 *    공용 인터넷 경유 실측이 5.2초였다(2026-08-31). 기본 5초는 그 경계에
 *    딱 걸려서, 느려지는 날 다크풀이 «에러 없이» 사라진다.
 *    앱 응답 경로(getDarkPool)는 사용자를 기다리게 할 수 없으니 기본값을
 *    유지하고, 시간당 한 번만 도는 ISR 경로는 넉넉히 준다.
 */
async function readKey<T = any>(key: string, timeoutMs = 5000): Promise<T | null> {
    const proxy = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
    const auth = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
//  «오늘의 이상치» 순위 — 공개 검색 표면
//
//  왜 이 함수가 있나: 종목 페이지 1,195장은 롱테일(「NVDA 다크풀」)을 먹지만
//  헤드 질의(「dark pool volume today」·「다크풀 상위 종목」)를 받는 페이지가
//  하나도 없었다. 순위표는 남이 «링크할 이유»가 있는 유일한 형태이기도 하다 —
//  우리 최대 병목이 참조 도메인 2개라는 점에서 이게 핵심이다.
//
//  ⚠️ 순위는 «비중 %»로 매기지 않는다. 시장 중앙값이 49.4% 라 비중 상위는
//     매일 같은 배관 종목이 나온다. 정보는 **자기 기준선에서 얼마나 벗어났나**
//     에 있다. 그래서 정렬 키는 전부 volRatio(물량 배수) 또는 shortDev(%p 이탈).
// ══════════════════════════════════════════════════════════════════════

const EOD_KEY = 'intrinio:eod:snapshot';
/**
 * 달러 거래대금 하한. 「아무도 모르는 잡주」가 순위표 맨 위에 오면 페이지 전체의
 * 신뢰가 깨진다 — 배수는 유동성이 낮을수록 쉽게 커지기 때문에 반드시 필요하다.
 */
const MIN_DOLLAR_VOL = 200e6;
const ROWS_PER_LIST = 10;

export interface DarkPoolLeader extends DarkPoolTicker {
    /** 그날 종가 변화율 % — 「내렸는데 담았다」를 말하려면 방향이 필요하다 */
    changePct: number | null;
    /** 통합 거래대금(종가 × 통합 거래량) — 하한 필터의 근거 */
    dollarVolume: number | null;
}

export interface DarkPoolLeaders {
    date: string | null;
    marketAvg: number | null;
    /** FINRA 가 그날 보고한 종목 수 */
    covered: number;
    /** 거래대금 하한과 ETF 제외를 통과해 순위 대상이 된 종목 수 */
    universe: number;
    /** 순위에서 뺀 ETF 수 — 「왜 SPY 가 없냐」에 숫자로 답하기 위해 노출한다 */
    etfExcluded: number;
    /** 주가는 내렸는데 장외 물량은 늘고 공매도 비중은 평소보다 낮았다 */
    absorbed: DarkPoolLeader[];
    /** 주가는 올랐는데 장외 물량 중 공매도 비중이 평소보다 크게 높았다 */
    sold: DarkPoolLeader[];
    /** 장외 물량이 자기 20일 평균의 몇 배였나 */
    surge: DarkPoolLeader[];
    /** 공매도 비중이 자기 기준선 위로 가장 크게 벗어난 종목 */
    shortHigh: DarkPoolLeader[];
    /** 공매도 비중이 자기 기준선 아래로 가장 크게 벗어난 종목 */
    shortLow: DarkPoolLeader[];
    source: 'FINRA';
}

export async function getDarkPoolLeaders(): Promise<DarkPoolLeaders | null> {
    // ISR(시간당 1회)이라 지연이 사용자에게 보이지 않는다 → 예산을 넉넉히 준다.
    const [data, snap] = await Promise.all([
        readKey<{ date: string; tickers: Record<string, any>; marketAvg: number; covered: number }>(KEY, 20000),
        readKey<{ date: string; rows: any[][] }>(EOD_KEY, 20000),
    ]);
    if (!data?.tickers) return null;

    // [t, o, h, l, c, v, chg, chgPct] — 실측으로 확인한 배치(2026-08-31)
    const px = new Map<string, { chg: number | null; dv: number | null }>();
    for (const r of snap?.rows ?? []) {
        if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
        const close = typeof r[4] === 'number' ? r[4] : null;
        const vol = typeof r[5] === 'number' ? r[5] : null;
        px.set(r[0], {
            chg: typeof r[7] === 'number' ? r[7] : null,
            dv: close != null && vol != null ? close * vol : null,
        });
    }

    const marketAvg = typeof data.marketAvg === 'number' ? data.marketAvg : null;
    const date = data.date ?? null;

    const rows: DarkPoolLeader[] = [];
    let etfExcluded = 0;
    for (const [t, row] of Object.entries(data.tickers)) {
        if (!row || typeof row.pct !== 'number' || !(row.pct > 0)) continue;
        const p = px.get(t);
        // 거래대금을 모르면 순위에 넣지 않는다. 「모른다」를 「통과」로 바꾸면
        // 하한 필터가 조용히 무력화된다.
        if (!p || p.dv == null || p.dv < MIN_DOLLAR_VOL) continue;
        // ★ ETF 를 뺀다. 지정참가회사가 설정/환매 과정에서 ETF 를 공매도로 팔았다
        //   되사기 때문에 장외 공매도 비중이 **기계적으로** 흔들린다. 넣어 두면
        //   이탈 순위 20자리를 전부 채권·광범위 ETF 가 차지하고(2026-08-31 실측),
        //   독자는 그걸 「신호」로 읽는다. 우리가 파는 게 정확히 그 오해의 방지다.
        if (isEtf(t)) { etfExcluded++; continue; }
        rows.push({ ...toTicker(t, row, date, marketAvg), changePct: p.chg, dollarVolume: p.dv });
    }

    const top = (
        filter: (r: DarkPoolLeader) => boolean,
        score: (r: DarkPoolLeader) => number,
    ) => rows.filter(filter).sort((a, b) => score(b) - score(a)).slice(0, ROWS_PER_LIST);

    const hasVol = (r: DarkPoolLeader) => r.volRatio != null;
    const hasDev = (r: DarkPoolLeader) => r.shortDev != null;

    return {
        date,
        marketAvg,
        covered: data.covered ?? 0,
        universe: rows.length,
        etfExcluded,
        absorbed: top(
            r => hasVol(r) && hasDev(r) && r.changePct != null
                && r.changePct <= -2 && r.volRatio! >= 1.6 && r.shortDev! <= -3,
            r => r.volRatio!,
        ),
        sold: top(
            r => hasVol(r) && hasDev(r) && r.changePct != null
                && r.changePct >= 1.5 && r.volRatio! >= 1.5 && r.shortDev! >= 8,
            r => r.shortDev!,
        ),
        surge: top(hasVol, r => r.volRatio!),
        shortHigh: top(hasDev, r => r.shortDev!),
        shortLow: top(hasDev, r => -r.shortDev!),
        source: 'FINRA',
    };
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
