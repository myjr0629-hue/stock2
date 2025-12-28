// [S-51.1] WHY Engine - Auto-generate Korean explanations for Verdict, Top3, NoTrade
// Converts raw data to human-readable Korean narratives

export interface VerdictWHY {
    headline: string;          // 1줄 요약 (예: "횡보/감마 중립")
    priceStructure: string;    // 가격 구조 근거
    regimeContext: string;     // 변동성/레짐 근거
    executionRule: string;     // 실행 규칙
}

export interface TickerWHY {
    symbol: string;
    reasons: string[];         // 오르는 이유 2개
    risk: string;              // 리스크 1개
    action: string;            // 행동 1개
    summary: string;           // 1줄 통합
}

export interface NoTradeWHY {
    symbol: string;
    reasons: string[];         // 기대값 낮은 이유 2개
    trigger: string;           // 재평가 트리거
    summary: string;           // 1줄 통합
}

// Generate Verdict WHY based on market data
export function generateVerdictWHY(
    vix: number,
    vixChange: number,
    us10y: number,
    ndx: number | null,
    ndxChange: number | null,
    regime: string,
    pinZone?: boolean,
    gammaExposure?: number | null
): VerdictWHY {
    // Determine headline
    let headline = '관망 권고';
    if (regime === 'Risk-On' && vix < 16) {
        headline = '위험선호 / 상승 추세';
    } else if (regime === 'Risk-Off' || vix > 20) {
        headline = '위험회피 / 방어적 관점';
    } else if (pinZone) {
        headline = '횡보 / 핀존 중립';
    } else if (gammaExposure && Math.abs(gammaExposure) < 1000000) {
        headline = '횡보 / 감마 중립';
    } else {
        headline = '중립 / 방향 탐색 중';
    }

    // Price structure
    let priceStructure = '';
    if (pinZone) {
        priceStructure = '가격이 핀존에 묶여 방향성 부재. 콜월~풋플로어 사이에서 등락 반복.';
    } else if (ndxChange && ndxChange > 0.5) {
        priceStructure = `NDX +${ndxChange.toFixed(1)}% 상승. 기술주 전반 상승 흐름 유지.`;
    } else if (ndxChange && ndxChange < -0.5) {
        priceStructure = `NDX ${ndxChange.toFixed(1)}% 하락. 기술주 전반 약세 전환 경계.`;
    } else {
        priceStructure = 'NDX 보합권. 전일 고점/저점 이탈 없이 대기 국면.';
    }

    // Regime context
    let regimeContext = '';
    if (vix < 16) {
        regimeContext = `VIX ${vix.toFixed(1)} (16 미만). 낮은 변동성 → 추세 매매 유리.`;
    } else if (vix > 20) {
        regimeContext = `VIX ${vix.toFixed(1)} (20 초과). 높은 변동성 → 신규 진입 자제.`;
    } else {
        regimeContext = `VIX ${vix.toFixed(1)} (중립권). 변동성 보통 → 선별적 진입만.`;
    }

    if (us10y > 4.5) {
        regimeContext += ` / US10Y ${us10y.toFixed(2)}% 고금리 부담.`;
    }

    // Execution rule
    let executionRule = '';
    if (regime === 'Risk-Off') {
        executionRule = '신규 진입 금지. 기존 포지션 축소 우선. TimeStop 엄격 적용.';
    } else if (pinZone) {
        executionRule = '핀존 탈출 확인 전 진입 금지. 리테스트 온리. 추격 금지.';
    } else if (regime === 'Risk-On') {
        executionRule = '리테스트 성공 종목 한정 진입. Top3 집중. FIRST_BREAK 금지.';
    } else {
        executionRule = '선별적 진입만. 리테스트 확인 필수. D+1 TimeStop 기준 준수.';
    }

    return { headline, priceStructure, regimeContext, executionRule };
}

// Generate Top3 ticker WHY
export function generateTickerWHY(
    ticker: any,
    tpgPassed?: boolean,
    tpgGates?: { highZone: boolean; retestRecovery: boolean; rsRising: boolean; sectorSync: boolean },
    retestStatus?: string
): TickerWHY {
    const symbol = ticker.ticker || ticker.symbol || 'N/A';
    const reasons: string[] = [];
    const changeP = ticker.todaysChangePerc || ticker.changePercent || 0;
    const volRatio = ticker.day?.v && ticker.prevDay?.v ? ticker.day.v / ticker.prevDay.v : 1;
    const alphaScore = ticker.alphaScore || 0;
    const velocity = ticker.velocity || '►';

    // Reason 1: Price/VWAP
    if (tpgGates?.retestRecovery) {
        reasons.push('VWAP 위에서 되감기 후 회복');
    } else if (changeP > 1) {
        reasons.push(`+${changeP.toFixed(1)}% 상승 중`);
    } else if (tpgGates?.highZone) {
        reasons.push('고점권 유지');
    } else {
        reasons.push('중립권 흐름');
    }

    // Reason 2: RS/Sector
    if (tpgGates?.rsRising) {
        reasons.push('동종군 RS 상위');
    } else if (tpgGates?.sectorSync) {
        reasons.push('섹터 리더 동조');
    } else if (volRatio > 1.2) {
        reasons.push(`거래량 ${volRatio.toFixed(1)}x 증가`);
    } else {
        reasons.push('거래량 보통');
    }

    // Risk
    let risk = '';
    if (tpgGates?.highZone && changeP > 3) {
        risk = '전고점 근접 (차익실현 압력)';
    } else if (retestStatus === 'FIRST_BREAK') {
        risk = '첫 돌파 추격 리스크';
    } else if (volRatio < 0.8) {
        risk = '거래량 감소 (모멘텀 약화)';
    } else {
        risk = '단기 되감기 가능';
    }

    // Action
    let action = '';
    if (retestStatus === 'RETEST_OK') {
        action = '리테스트 성공 → 진입 가능';
    } else if (retestStatus === 'FIRST_BREAK') {
        action = '되감기 후 리테스트 대기';
    } else if (velocity === '▲') {
        action = '상승 가속 중 → 분할 진입';
    } else {
        action = 'VWAP 지지 확인 후 진입';
    }

    const summary = `${reasons.join(' + ')} / 리스크: ${risk} / 행동: ${action}`;

    return { symbol, reasons, risk, action, summary };
}

// Generate NoTrade WHY
export function generateNoTradeWHY(
    ticker: any,
    tpgPassed?: boolean,
    tpgScore?: number,
    retestStatus?: string
): NoTradeWHY {
    const symbol = ticker.ticker || ticker.symbol || 'N/A';
    const reasons: string[] = [];
    const changeP = ticker.todaysChangePerc || ticker.changePercent || 0;
    const volRatio = ticker.day?.v && ticker.prevDay?.v ? ticker.day.v / ticker.prevDay.v : 1;
    const alphaScore = ticker.alphaScore || 0;

    // Reason 1
    if (!tpgPassed || (tpgScore && tpgScore < 2)) {
        reasons.push(`TPG ${tpgScore || 0}/4 미달`);
    } else if (retestStatus === 'FIRST_BREAK') {
        reasons.push('첫 돌파 추격 금지 (리테스트 미완)');
    } else if (alphaScore < 55) {
        reasons.push(`AlphaScore ${alphaScore.toFixed(0)} 기준 미달`);
    } else {
        reasons.push('상위 후보 대비 점수 열위');
    }

    // Reason 2
    if (volRatio < 0.8) {
        reasons.push('거래대금 둔화');
    } else if (changeP < 0) {
        reasons.push(`${changeP.toFixed(1)}% 하락 중`);
    } else if (ticker.v71?.gate === 'FAIL') {
        reasons.push('구조적 게이트 FAIL');
    } else {
        reasons.push('명확한 리테스트 미확인');
    }

    // Trigger for re-evaluation
    let trigger = '';
    if (retestStatus === 'FIRST_BREAK' || retestStatus === 'PULLBACK') {
        trigger = 'VWAP 리테스트 성공 시 재평가';
    } else if (!tpgPassed) {
        trigger = 'TPG 2개 이상 통과 시 재평가';
    } else if (alphaScore < 55) {
        trigger = 'AlphaScore 55+ 회복 시 재평가';
    } else {
        trigger = '전고점 돌파 + 거래량 증가 시 재평가';
    }

    const summary = `${reasons.join(' + ')} / 트리거: ${trigger}`;

    return { symbol, reasons, trigger, summary };
}

// Format Verdict for display (3 lines)
export function formatVerdictDisplay(v: VerdictWHY): string {
    return `**${v.headline}**\n\n` +
        `1️⃣ 가격 구조: ${v.priceStructure}\n` +
        `2️⃣ 레짐/변동성: ${v.regimeContext}\n` +
        `3️⃣ 실행 규칙: ${v.executionRule}`;
}
