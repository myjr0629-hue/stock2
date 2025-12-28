// [S-53.7] Engine Interpretation SSOT
// Per-ticker interpretation with cause-reason-action 3-tier structure

export interface InterpretationInput {
    symbol: string;
    gateStatus: 'PASS' | 'FAIL' | 'PENDING';
    reasonCodes: string[];
    vwapPosition?: number;      // -1 = below, 0 = at, 1 = above
    rsi?: number;
    optionsRegime?: 'SHORT_GAMMA' | 'LONG_GAMMA' | 'NEUTRAL' | 'PENDING';
    optionsStatus?: 'OK' | 'PENDING' | 'FAILED';
    liquidityScore?: number;    // 0-100
    volHumidity?: number;       // 0-100
    trend?: 'UP' | 'DOWN' | 'SIDEWAYS';
    alphaScore?: number;
    rank?: number;
    catalystFlags?: string[];
    hasRecentNews?: boolean;
}

export interface InterpretationOutput {
    headlineKR: string;         // 1줄 헤드라인
    whyKR: string[];            // 2-3 bullet points
    actionKR: string;           // 진입/분할/관망/회피
    evidence: {
        vwapDelta?: number;
        rsi?: number;
        netGEX?: string;
        ivRank?: number;
        volHumidity?: number;
        liquidityScore?: number;
    };
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
}

// Reason codes to Korean mapping
const REASON_KR: Record<string, string> = {
    'LIQUIDITY_LOW': '유동성 부족',
    'VOL_HUMIDITY_HIGH': '변동성 과열',
    'RSI_OVERBOUGHT': 'RSI 과매수',
    'RSI_OVERSOLD': 'RSI 과매도',
    'OPTIONS_PENDING': '옵션 데이터 대기',
    'DEALER_SHORT_GAMMA': '딜러 숏 감마 (변동성 확대)',
    'DEALER_LONG_GAMMA': '딜러 롱 감마 (변동성 축소)',
    'VWAP_ABOVE': 'VWAP 상단',
    'VWAP_BELOW': 'VWAP 하단',
    'NO_CATALYST': '촉매 이벤트 없음',
    'MACRO_RISK': '매크로 리스크',
    'TREND_UP': '상승 추세',
    'TREND_DOWN': '하락 추세',
    'HIGH_RANK': '상위 순위',
    'ALPHA_STRONG': '알파 점수 우수'
};

// Action templates based on conditions
const ACTION_TEMPLATES: Record<string, string> = {
    ENTRY: '진입 고려',
    PARTIAL: '분할 진입',
    WATCH: '관망 유지',
    AVOID: '회피 권장',
    REDUCE: '비중 축소 검토'
};

// RSI bucket classification
function getRSIBucket(rsi: number): 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT' {
    if (rsi < 30) return 'OVERSOLD';
    if (rsi > 70) return 'OVERBOUGHT';
    return 'NEUTRAL';
}

export function generateInterpretation(input: InterpretationInput): InterpretationOutput {
    const {
        symbol,
        gateStatus,
        reasonCodes = [],
        vwapPosition,
        rsi,
        optionsRegime,
        optionsStatus,
        liquidityScore,
        volHumidity,
        trend,
        alphaScore,
        rank,
        catalystFlags = [],
        hasRecentNews
    } = input;

    // Build evidence object
    const evidence: InterpretationOutput['evidence'] = {
        rsi,
        volHumidity,
        liquidityScore,
        vwapDelta: vwapPosition
    };

    if (optionsRegime) {
        evidence.netGEX = optionsRegime === 'SHORT_GAMMA' ? '음(-)' :
            optionsRegime === 'LONG_GAMMA' ? '양(+)' : '중립';
    }

    // Check for insufficient data
    const hasOptions = optionsStatus === 'OK';
    const hasRSI = typeof rsi === 'number';
    const hasLiquidity = typeof liquidityScore === 'number';

    if (!hasOptions && !hasRSI && !hasLiquidity) {
        return {
            headlineKR: `📊 ${symbol}: 데이터 부족 (근거 미확정)`,
            whyKR: [
                '옵션 데이터 미수신',
                '기술적 지표 대기 중'
            ],
            actionKR: ACTION_TEMPLATES.WATCH,
            evidence,
            confidence: 'INSUFFICIENT'
        };
    }

    // Generate interpretation based on conditions
    const whyList: string[] = [];
    let headline = '';
    let action = ACTION_TEMPLATES.WATCH;
    let confidence: InterpretationOutput['confidence'] = 'MEDIUM';

    // Gate-based headline
    if (gateStatus === 'PASS') {
        if (rank && rank <= 3) {
            headline = `🏆 ${symbol}: 상위 ${rank}위, 구조적 우위 확보`;
            whyList.push('알파 순위 최상위권');
            confidence = 'HIGH';
        } else if (alphaScore && alphaScore >= 75) {
            headline = `✅ ${symbol}: 알파 점수 우수 (${alphaScore.toFixed(1)})`;
            whyList.push(`알파 점수 ${alphaScore.toFixed(1)}로 상위권`);
            confidence = 'HIGH';
        } else {
            headline = `✅ ${symbol}: 게이트 통과, 모멘텀 유효`;
            confidence = 'MEDIUM';
        }
        action = ACTION_TEMPLATES.ENTRY;
    } else if (gateStatus === 'FAIL') {
        headline = `⚠️ ${symbol}: 진입 조건 미충족`;
        action = ACTION_TEMPLATES.WATCH;
        confidence = 'MEDIUM';
    } else {
        headline = `⏳ ${symbol}: 분석 진행 중`;
        confidence = 'LOW';
    }

    // Add reason-based explanations
    if (optionsStatus === 'PENDING') {
        whyList.push(REASON_KR['OPTIONS_PENDING']);
    }

    if (optionsRegime === 'SHORT_GAMMA') {
        whyList.push(REASON_KR['DEALER_SHORT_GAMMA']);
        if (gateStatus === 'PASS') action = ACTION_TEMPLATES.PARTIAL;
    } else if (optionsRegime === 'LONG_GAMMA') {
        whyList.push(REASON_KR['DEALER_LONG_GAMMA']);
    }

    if (hasRSI) {
        const rsiBucket = getRSIBucket(rsi!);
        if (rsiBucket === 'OVERBOUGHT') {
            whyList.push(`RSI ${rsi!.toFixed(0)} (과매수)`);
            if (gateStatus === 'PASS') action = ACTION_TEMPLATES.PARTIAL;
        } else if (rsiBucket === 'OVERSOLD') {
            whyList.push(`RSI ${rsi!.toFixed(0)} (과매도)`);
        } else {
            whyList.push(`RSI ${rsi!.toFixed(0)} (중립)`);
        }
    }

    if (hasLiquidity && liquidityScore! < 50) {
        whyList.push(REASON_KR['LIQUIDITY_LOW']);
        if (gateStatus === 'FAIL') confidence = 'MEDIUM';
    }

    if (volHumidity && volHumidity > 70) {
        whyList.push(REASON_KR['VOL_HUMIDITY_HIGH']);
        action = ACTION_TEMPLATES.WATCH;
    }

    if (trend === 'UP') {
        whyList.push(REASON_KR['TREND_UP']);
    } else if (trend === 'DOWN') {
        whyList.push(REASON_KR['TREND_DOWN']);
        if (gateStatus !== 'PASS') action = ACTION_TEMPLATES.AVOID;
    }

    if (vwapPosition === 1) {
        whyList.push(REASON_KR['VWAP_ABOVE']);
    } else if (vwapPosition === -1) {
        whyList.push(REASON_KR['VWAP_BELOW']);
    }

    if (!hasRecentNews && catalystFlags.length === 0) {
        whyList.push(REASON_KR['NO_CATALYST']);
    }

    // Limit why list to 3 items
    const finalWhy = whyList.slice(0, 3);
    if (finalWhy.length === 0) {
        finalWhy.push('추가 분석 필요');
    }

    return {
        headlineKR: headline,
        whyKR: finalWhy,
        actionKR: action,
        evidence,
        confidence
    };
}

// Helper to extract interpretation input from engine data
export function extractInterpretationInput(item: any): InterpretationInput {
    const v71 = item.v71 || {};
    const options = item.options || {};

    return {
        symbol: item.symbol || item.ticker || 'UNKNOWN',
        gateStatus: v71.gate === 'PASS' ? 'PASS' : v71.gate === 'FAIL' ? 'FAIL' : 'PENDING',
        reasonCodes: v71.reasonCodes || [],
        vwapPosition: v71.vwapPosition,
        rsi: item.rsi,
        optionsRegime: v71.mmPos?.includes('Short') ? 'SHORT_GAMMA' :
            v71.mmPos?.includes('Long') ? 'LONG_GAMMA' :
                v71.mmPos === 'PENDING' ? 'PENDING' : 'NEUTRAL',
        optionsStatus: v71.options_status,
        liquidityScore: item.liquidityScore,
        volHumidity: v71.volHumidity,
        trend: item.changePct > 2 ? 'UP' : item.changePct < -2 ? 'DOWN' : 'SIDEWAYS',
        alphaScore: item.alphaScore,
        rank: item.rank,
        catalystFlags: v71.catalystFlags || [],
        hasRecentNews: !!item.newsCount && item.newsCount > 0
    };
}
