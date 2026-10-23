/**
 * 딜러 감마 구조 — «변동성 레짐»과 «감마 스퀴즈» 두 카드를 하나로 합친 것.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 왜 합쳤나
 *
 *   두 카드는 사실상 같은 것을 두 번 보여 주고 있었다. volatility-regime 의
 *   regimeScore 는 계산식 안에 `squeezeScore / 4` 를 **직접 더한다.** 즉
 *   4칸짜리 프리미엄 패널에서 2칸이 같은 정보를 쓰고 있었다.
 *
 *   게다가 둘 다 척도가 한쪽에 눌려 있었다:
 *     · regimeScore 는 롱감마 국면에서 Factor1(0~30)이 통째로 0 이라
 *       평온한 장에서 늘 5~20 사이에 붙는다.
 *     · Factor1 은 `min(30, |netGex|/1e6*3)` 이라 $10M 이면 이미 만점 —
 *       실제 숏감마는 수백 M 이므로 사실상 이진값이었다.
 *
 * 무엇으로 바꿨나
 *
 *   «오늘 딜러 감마가 평소와 얼마나 다른가»를 **자기 이력 백분위**로 잰다.
 *   숫자 자체(-1.7B ~ +526M)는 사람이 읽을 수 없지만, 「최근 20일 중
 *   가장 강한 롱감마」는 읽을 수 있다.
 *
 *   현재값: structure:v2 판본. `intrinio:gex:bf:<T>` 는 과거 비교 이력만 제공한다.
 *   실측(SPY 2026-08): -1.70e9 ~ +5.26e8, 최근 5일 67M·11M·-78M·-211M·160M
 *   → 실제로 크게 움직인다. 백분위가 의미를 갖는다.
 * ══════════════════════════════════════════════════════════════════════
 */

import { percentile, flipDistance } from '../lib/metrics/percentile';
import type { Metric } from '../lib/metrics/contract';

const PROXY = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const PROXY_KEY = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || '';

/** 백분위를 말하려면 최소 이만큼의 과거 관측이 있어야 한다 */
const MIN_POINTS = 10;

export interface DealerGammaSignal {
    /** 오늘 GEX (달러 감마) */
    gex: number;
    /** 딜러가 롱감마인가 — 롱이면 변동성을 «누르고», 숏이면 «증폭»한다 */
    polarity: 'long' | 'short';
    /** 자기 20일 이력 대비 백분위 0~100 (100 = 최근 중 가장 롱감마) */
    percentile: number | null;
    /** 백분위에 쓴 과거 관측 수 */
    samples: number;
    /** 감마 플립까지 거리 % (양수 = 현재가가 플립 위) — 없으면 null */
    flipDistancePct: number | null;
    /** 관측일 */
    date: string | null;
    /**
     * 구조가 «불안정»한가 — 숏감마이면서 플립 근처(±3%)면 작은 충격이
     * 증폭된다. 예전 「감마 스퀴즈」 카드가 말하려던 바로 그 상태다.
     */
    unstable: boolean;
    metrics: { percentile: Metric; flipDistance: Metric };
}

type GammaEdition = { netGex?: number | null; chainDate?: string | null; underlyingPrice?: number | null };

async function readKey<T = any>(key: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${PROXY}/get?key=${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${PROXY_KEY}` },
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
 * @param ticker 기준 종목. 시장 전체 신호로는 SPY 를 쓴다.
 * @param flipLevel 감마 플립 레벨(있으면). 없으면 거리 계산을 생략한다.
 * @param price 현재가(있으면).
 * @param current 이미 읽은 구조 판본. null 이면 결측이며 백필로 대체하지 않는다.
 */
export async function getDealerGamma(
    ticker = 'SPY',
    flipLevel?: number | null,
    price?: number | null,
    current?: GammaEdition | null,
): Promise<DealerGammaSignal | null> {
    const symbol = ticker.toUpperCase();
    // Guardian도 공급사를 새로 부르지 않고 저장된 구조 판본만 읽는다.
    const [hist, edition] = await Promise.all([
        readKey<{ ticker: string; points: Array<{ date: string; gex: number }> }>(`intrinio:gex:bf:${symbol}`),
        current === undefined ? readKey<{ data?: GammaEdition }>(`structure:v2:${symbol}`).then(v => v?.data ?? null) : current,
    ]);
    const gex = edition?.netGex;
    const date = edition?.chainDate;
    if (typeof gex !== 'number' || !Number.isFinite(gex) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const points = Array.isArray(hist?.points) ? hist!.points : [];

    // ⚠️ 배열 순서를 «가정»하지 않는다 — 날짜로 최신을 고른다.
    //    같은 이름의 함수가 오름차순/내림차순 두 벌 있어 [0] 의 뜻이 뒤집힌 적이 있다.
    const sorted = [...points]
        .filter(p => typeof p?.gex === 'number' && Number.isFinite(p.gex) && typeof p?.date === 'string' && p.date < date)
        .sort((a, b) => a.date.localeCompare(b.date));
    // 같은 세션·미래 행은 현재 관측의 백분위 분모에 넣지 않는다.
    const history = [...new Map(sorted.map(p => [p.date, p.gex])).values()];

    const px = typeof price === 'number' && price > 0 ? price : edition?.underlyingPrice ?? null;
    const distanceMetric = flipDistance({ priceUsd: px, flipLevelUsd: flipLevel });
    const flipDistancePct = distanceMetric.value;
    const rankMetric = percentile({ current: gex, history, minimumSamples: MIN_POINTS,
        period: 'stored_prior_EOD_observations', basis: 'ticker_GEX_history_excluding_current' });

    const polarity: 'long' | 'short' = gex >= 0 ? 'long' : 'short';

    return {
        gex,
        polarity,
        percentile: rankMetric.value,
        samples: history.length,
        flipDistancePct: flipDistancePct == null ? null : Math.round(flipDistancePct * 10) / 10,
        date,
        metrics: { percentile: rankMetric, flipDistance: distanceMetric },
        // 숏감마 + 플립 ±3% = 작은 충격이 증폭되는 자리
        unstable: polarity === 'short' && flipDistancePct != null && Math.abs(flipDistancePct) <= 3,
    };
}
