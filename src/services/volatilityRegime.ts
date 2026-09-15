/**
 * 변동성 레짐 계산 — CALM / COILING / LOADED / ERUPTING
 * ══════════════════════════════════════════════════════════════════════
 * [왜 서비스로 뽑았나]  2026-09-15.
 *   이 계산은 `/api/live/volatility-regime` 라우트 «안»에만 있었다.
 *   그래서 같은 값이 필요한 premium-metrics 가 자기 서버를 HTTP 로 다시 불러야 했고,
 *   그 왕복 + 라우트의 revalidate=60 때문에 콜드에 15초가 걸렸다.
 *
 *   계산을 여기로 옮기면 두 곳이 «같은 함수»를 부른다.
 *   복사해서 두 벌로 두면 언젠가 갈라진다 — 그건 조용히 틀리는 전형이다.
 */

export interface VolatilityRegimeResult {
    regime: 'CALM' | 'COILING' | 'LOADED' | 'ERUPTING';
    regimeScore: number;
    gex: number;
    gexLabel: 'SHORT' | 'LONG';
    iv: number;
    flipDistance: number;
    flipLevel: number;
    isAboveFlip: boolean;
    squeezeScore: number;
    squeezeRisk: string;
    gammaConcentration: number;
    gammaConcentrationLabel: string;
    underlyingPrice: number;
}

export interface RegimeInputs {
    netGex?: number | null;
    gammaFlipLevel?: number | null;
    underlyingPrice?: number | null;
    squeezeScore?: number | null;
    squeezeRisk?: string | null;
    /** 이미 퍼센트 단위 */
    atmIv?: number | null;
    gammaConcentration?: number | null;
    gammaConcentrationLabel?: string | null;
}

/**
 * 구조 데이터로부터 레짐을 계산한다. 순수 함수 — 네트워크도 캐시도 없다.
 * 원래 라우트에 있던 식을 그대로 옮겼다(값이 바뀌면 안 된다).
 */
export function computeVolatilityRegime(input: RegimeInputs): VolatilityRegimeResult {
    const netGex = Number(input.netGex) || 0;
    const gammaFlip = Number(input.gammaFlipLevel) || 0;
    const underlyingPrice = Number(input.underlyingPrice) || 0;
    const squeezeScore = Number(input.squeezeScore) || 0;
    const squeezeRisk = input.squeezeRisk || 'LOW';
    const atmIv = Number(input.atmIv) || 0;
    const gammaConcentration = Number(input.gammaConcentration) || 0;
    const gammaConcentrationLabel = input.gammaConcentrationLabel || 'NORMAL';

    const flipDistance = gammaFlip > 0 && underlyingPrice > 0
        ? ((underlyingPrice - gammaFlip) / gammaFlip) * 100
        : 0;
    const isShortGamma = netGex < 0;
    const isAboveFlip = flipDistance > 0;

    let regimeScore = 0;

    // Factor 1: GEX 극성 (0-30) — 숏감마는 변동성을 키운다
    //   로그 척도: $1M→0 · $10M→10 · $100M→20 · $1B→30
    //   (옛 선형식은 $10M 만 넘으면 30 만점이라 사실상 이진값이었다)
    if (isShortGamma) {
        const gexMagnitude = Math.abs(netGex) / 1_000_000;
        const decades = gexMagnitude > 1 ? Math.log10(gexMagnitude) : 0;
        regimeScore += Math.max(0, Math.min(30, decades * 10));
    }

    // Factor 2: 스퀴즈 점수 (0-25)
    regimeScore += Math.min(25, squeezeScore / 4);

    // Factor 3: ATM IV 수준 (0-20)
    if (atmIv > 50) regimeScore += 20;
    else if (atmIv > 35) regimeScore += 12;
    else if (atmIv > 25) regimeScore += 6;

    // Factor 4: 감마플립 근접도 (0-15)
    const flipDist = Math.abs(flipDistance);
    if (flipDist < 1) regimeScore += 15;
    else if (flipDist < 3) regimeScore += 10;
    else if (flipDist < 5) regimeScore += 5;

    // Factor 5: 감마 집중도 (0-10)
    if (gammaConcentration >= 70) regimeScore += 10;
    else if (gammaConcentration >= 50) regimeScore += 6;
    else if (gammaConcentration >= 30) regimeScore += 3;

    regimeScore = Math.min(100, regimeScore);

    const regime: VolatilityRegimeResult['regime'] =
        regimeScore >= 75 ? 'ERUPTING'
            : regimeScore >= 50 ? 'LOADED'
                : regimeScore >= 25 ? 'COILING'
                    : 'CALM';

    return {
        regime,
        regimeScore: Math.round(regimeScore),
        gex: Math.round(netGex),
        gexLabel: isShortGamma ? 'SHORT' : 'LONG',
        iv: atmIv,
        flipDistance: Math.round(flipDistance * 10) / 10,
        flipLevel: gammaFlip,
        isAboveFlip,
        squeezeScore: Math.round(squeezeScore),
        squeezeRisk,
        gammaConcentration,
        gammaConcentrationLabel,
        underlyingPrice,
    };
}
