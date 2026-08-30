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
 *   출처: `intrinio:gex:bf:<T>` — 백필해 둔 종목별 GEX 일별 이력(20일).
 *   실측(SPY 2026-08): -1.70e9 ~ +5.26e8, 최근 5일 67M·11M·-78M·-211M·160M
 *   → 실제로 크게 움직인다. 백분위가 의미를 갖는다.
 * ══════════════════════════════════════════════════════════════════════
 */

const PROXY = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const PROXY_KEY = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

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
}

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
 * 백분위. 오늘 값은 «자기 자신»과 비교하지 않는다.
 * 값이 큰(=롱감마) 쪽이 100 이다.
 */
function percentileOf(today: number, history: number[]): number | null {
    if (history.length < MIN_POINTS) return null;
    const below = history.filter(h => h <= today).length;
    return Math.round((below / history.length) * 100);
}

/**
 * @param ticker 기준 종목. 시장 전체 신호로는 SPY 를 쓴다.
 * @param flipLevel 감마 플립 레벨(있으면). 없으면 거리 계산을 생략한다.
 * @param price 현재가(있으면).
 */
export async function getDealerGamma(
    ticker = 'SPY',
    flipLevel?: number | null,
    price?: number | null,
): Promise<DealerGammaSignal | null> {
    const hist = await readKey<{ ticker: string; points: Array<{ date: string; gex: number; price?: number }> }>(
        `intrinio:gex:bf:${ticker.toUpperCase()}`,
    );
    const points = Array.isArray(hist?.points) ? hist!.points : [];
    if (points.length === 0) return null;

    // ⚠️ 배열 순서를 «가정»하지 않는다 — 날짜로 최신을 고른다.
    //    같은 이름의 함수가 오름차순/내림차순 두 벌 있어 [0] 의 뜻이 뒤집힌 적이 있다.
    const sorted = [...points]
        .filter(p => typeof p?.gex === 'number' && Number.isFinite(p.gex) && typeof p?.date === 'string')
        .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) return null;

    const latest = sorted[sorted.length - 1];
    const history = sorted.slice(0, -1).map(p => p.gex);

    const px = typeof price === 'number' && price > 0 ? price : latest.price ?? null;
    const flipDistancePct =
        typeof flipLevel === 'number' && flipLevel > 0 && typeof px === 'number' && px > 0
            ? ((px - flipLevel) / flipLevel) * 100
            : null;

    const polarity: 'long' | 'short' = latest.gex >= 0 ? 'long' : 'short';

    return {
        gex: latest.gex,
        polarity,
        percentile: percentileOf(latest.gex, history),
        samples: history.length,
        flipDistancePct: flipDistancePct == null ? null : Math.round(flipDistancePct * 10) / 10,
        date: latest.date,
        // 숏감마 + 플립 ±3% = 작은 충격이 증폭되는 자리
        unstable: polarity === 'short' && flipDistancePct != null && Math.abs(flipDistancePct) <= 3,
    };
}
