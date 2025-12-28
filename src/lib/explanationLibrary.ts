// [S-50.0] Korean Explanation Library
// Static KB for all indicators, metrics, and terms

export interface Explanation {
    id: string;
    label: string;          // Display name (Korean)
    labelEN: string;        // English name
    category: 'macro' | 'technical' | 'options' | 'score' | 'risk';
    meaning: string;        // 이것은 무엇인가
    interpretation: string; // 이 값을 어떻게 읽는가
    action: string;         // 이 값에 따라 무엇을 해야 하는가
    caution?: string;       // 주의사항 / 오해 방지
}

export const EXPLANATIONS: Record<string, Explanation> = {
    // ===== MACRO INDICATORS =====
    'NDX': {
        id: 'NDX',
        label: '나스닥 100 (NDX)',
        labelEN: 'NASDAQ 100 Index',
        category: 'macro',
        meaning: '미국 기술주 중심 대형주 100개 기업의 시가총액 가중 지수입니다.',
        interpretation: '기술주 전반의 시장 방향성을 대표합니다. 상승 시 위험선호(Risk-On), 하락 시 위험회피(Risk-Off) 신호.',
        action: 'NDX 상승 시 기술주 비중 유지/확대, 하락 시 방어적 포지션으로 전환.',
        caution: '개별 종목과의 상관관계를 항상 확인하세요. NDX 상승에도 개별주가 하락할 수 있습니다.'
    },
    'VIX': {
        id: 'VIX',
        label: '공포지수 (VIX)',
        labelEN: 'CBOE Volatility Index',
        category: 'macro',
        meaning: 'S&P 500 옵션 가격에서 도출한 향후 30일 예상 변동성입니다.',
        interpretation: '16 이하: 안정적 / 16~20: 보통 / 20 이상: 불안정 / 30 이상: 극단적 공포',
        action: 'VIX 20 이상 시 신규 진입 자제, 포지션 축소 고려. VIX 급등 후 하락 시 반등 진입 기회.',
        caution: 'VIX는 "방향"이 아닌 "변동성"을 측정합니다. VIX 상승이 반드시 하락을 의미하지 않습니다.'
    },
    'US10Y': {
        id: 'US10Y',
        label: '미국채 10년물 (US10Y)',
        labelEN: '10-Year Treasury Yield',
        category: 'macro',
        meaning: '미국 정부가 10년간 빌린 돈에 대해 지불하는 이자율입니다.',
        interpretation: '상승 시: 금리 인상 압력 → 성장주 밸류에이션 하락 / 하락 시: 금리 인하 기대 → 성장주 우호적',
        action: '4.5% 이상: 하이테크/고성장주 비중 축소. 4% 이하: 성장주 비중 확대 가능.',
        caution: '급격한 금리 변동은 단기적으로 모든 자산 클래스에 충격을 줄 수 있습니다.'
    },
    'DXY': {
        id: 'DXY',
        label: '달러 인덱스 (DXY)',
        labelEN: 'US Dollar Index',
        category: 'macro',
        meaning: '미국 달러의 6개 주요 통화 대비 상대적 강세를 측정하는 지수입니다.',
        interpretation: '상승: 달러 강세 → 수출기업/해외매출 비중 높은 기업에 부정적 / 하락: 달러 약세 → 수출 우호적',
        action: 'DXY 급등 시 해외 매출 비중 높은 종목(AAPL, MSFT) 주의. 원자재/신흥국 관련주도 영향.',
        caution: '장기 추세와 단기 변동을 구분하세요. 일시적 달러 강세는 실적에 즉각 반영되지 않습니다.'
    },

    // ===== TECHNICAL INDICATORS =====
    'VWAP': {
        id: 'VWAP',
        label: '거래량가중평균가격 (VWAP)',
        labelEN: 'Volume Weighted Average Price',
        category: 'technical',
        meaning: '거래량을 가중치로 사용한 당일 평균 가격입니다. 기관투자자의 평균 매수가를 추정.',
        interpretation: 'VWAP 상회: 매수 우세 / VWAP 하회: 매도 우세. 리테스트 성공 시 지지 확인.',
        action: '첫 돌파는 추격 금지. VWAP 리테스트 후 지지 확인 시에만 진입.',
        caution: 'VWAP은 당일 지표입니다. 다음 날 리셋되므로 스윙 트레이딩에는 부적합.'
    },
    'RSI': {
        id: 'RSI',
        label: '상대강도지수 (RSI)',
        labelEN: 'Relative Strength Index',
        category: 'technical',
        meaning: '최근 가격 변동의 상승/하락 강도를 0~100 사이로 측정합니다.',
        interpretation: '70 이상: 과매수 / 30 이하: 과매도. 단, 강한 추세에서는 과매수/과매도가 지속될 수 있음.',
        action: 'RSI 과열 자체로 매도하지 마세요. 되감기 후 재상승(RSI 70→60→70+) 시 추세 지속 신호로 활용.',
        caution: 'RSI 다이버전스(가격은 신고가인데 RSI는 낮아지는 현상)가 더 강력한 반전 신호입니다.'
    },
    'RS': {
        id: 'RS',
        label: '상대강도 (RS)',
        labelEN: 'Relative Strength',
        category: 'technical',
        meaning: '특정 종목이 시장(SPY) 대비 얼마나 강한지를 측정합니다.',
        interpretation: 'RS 상위 10%: 시장 리더 / RS 하위 10%: 시장 래거드',
        action: '알파 후보는 RS 상위 종목에서만 선별. 시장이 하락해도 RS 강한 종목은 방어력 보유.',
    },

    // ===== OPTIONS STRUCTURE =====
    'CALL_WALL': {
        id: 'CALL_WALL',
        label: '콜 월 (Call Wall)',
        labelEN: 'Call Wall',
        category: 'options',
        meaning: '콜옵션 미결제약정(OI)이 집중된 가격대입니다. 저항선 역할.',
        interpretation: '딜러가 콜 매도 포지션을 헤징하면서 해당 가격대가 "천장"처럼 작용합니다.',
        action: 'Call Wall 근처에서는 추가 상승 여력이 제한될 수 있습니다. 돌파 시 감마 스퀴즈 가능.',
        caution: 'OI 데이터가 없으면 가격 구조로 추정합니다. 등급(A/B/C)을 확인하세요.'
    },
    'PUT_FLOOR': {
        id: 'PUT_FLOOR',
        label: '풋 플로어 (Put Floor)',
        labelEN: 'Put Floor',
        category: 'options',
        meaning: '풋옵션 미결제약정(OI)이 집중된 가격대입니다. 지지선 역할.',
        interpretation: '딜러가 풋 매도 포지션을 헤징하면서 해당 가격대가 "바닥"처럼 작용합니다.',
        action: 'Put Floor 부근에서 하락 모멘텀이 약해질 수 있습니다. 손절 레벨 설정 시 참고.',
    },
    'PIN_ZONE': {
        id: 'PIN_ZONE',
        label: '핀존 (Pin Zone)',
        labelEN: 'Gamma Pin Zone',
        category: 'options',
        meaning: '옵션 만기 시 가격이 "고정"되기 쉬운 구간입니다. 딜러 헤징 활동의 결과.',
        interpretation: 'Max Pain 또는 OI 최대 집중 가격 부근. 만기일에 가격이 이 구간에 수렴하는 경향.',
        action: '옵션 만기 주간에는 Pin Zone 이탈 방향으로 큰 움직임이 나오기 어렵습니다.',
    },
    'GEX': {
        id: 'GEX',
        label: '감마 익스포저 (GEX)',
        labelEN: 'Gamma Exposure',
        category: 'options',
        meaning: '시장 전체 딜러들의 감마 포지션 합계입니다.',
        interpretation: 'GEX 양수: 딜러가 변동성 억제 (매수 시 매도, 매도 시 매수) / GEX 음수: 딜러가 변동성 증폭',
        action: 'GEX 음수 시 변동성 폭발 가능. 타이트한 손절 필수.',
        caution: 'GEX 데이터는 추정치입니다. 정확한 딜러 포지션은 알 수 없습니다.'
    },

    // ===== SCORING =====
    'PULSE_SCORE': {
        id: 'PULSE_SCORE',
        label: '펄스 스코어 (Pulse Score)',
        labelEN: 'Pulse Score',
        category: 'score',
        meaning: '모멘텀, 옵션 흐름, 구조, 레짐, 리스크를 종합한 종목 건강도 점수입니다.',
        interpretation: '70+: 강한 모멘텀 / 50-70: 보통 / 50 미만: 약세',
        action: 'Top3 진입은 Pulse 70+ 권장. 50 미만은 관망 또는 축소.',
    },
    'ALPHA_SCORE': {
        id: 'ALPHA_SCORE',
        label: '알파 스코어 (Alpha Score)',
        labelEN: 'Alpha Score',
        category: 'score',
        meaning: '시장 대비 초과 수익 잠재력을 0~100으로 정량화한 점수입니다.',
        interpretation: '80+: 최상위 알파 후보 / 60-80: 우수 / 60 미만: 시장 수익률 수준',
        action: 'Alpha 80+ 종목은 Top3 1순위. 동점 시 Velocity(상승 속도)로 결정.',
    },

    // ===== RISK =====
    'HIGH_RISK': {
        id: 'HIGH_RISK',
        label: '하이리스크 슬롯',
        labelEN: 'High Risk Slot',
        category: 'risk',
        meaning: '변동성이 높고 하드컷 레벨이 필요한 종목 전용 슬롯입니다.',
        interpretation: '11번/12번 슬롯에 배정됩니다. 사이즈 자동 축소 적용.',
        action: '반드시 손절 레벨(하드컷) 설정 필수. Top3 승격은 매우 엄격한 조건에서만.',
        caution: '하이리스크 종목은 전체 포트폴리오의 10% 이하로 제한하세요.'
    },

    // ===== S-51.1 NARRATIVE TERMS =====
    'CONSOLIDATION': {
        id: 'CONSOLIDATION',
        label: '횡보 (Consolidation)',
        labelEN: 'Consolidation / Range-Bound',
        category: 'technical',
        meaning: '가격이 일정 범위 내에서 등락을 반복하며 방향성을 잃은 상태입니다.',
        interpretation: '상승/하락 추세가 아닌 대기 국면. 돌파 방향을 기다리는 중.',
        action: '횡보 구간에서는 신규 진입 금지. 핀존 탈출 후 방향 확정 시 진입.',
        caution: '횡보 이탈 시 됩니다쪽으로 가속이 발생할 수 있습니다. 손절 레벨 필수.'
    },
    'GAMMA_NEUTRAL': {
        id: 'GAMMA_NEUTRAL',
        label: '감마 중립 (Gamma-Neutral)',
        labelEN: 'Gamma-Neutral Zone',
        category: 'options',
        meaning: '딜러의 감마 포지션이 균형 상태로, 가격 방향성에 영향을 주지 않는 구간입니다.',
        interpretation: '감마 매수/매도 압력이 상쇄되어 변동성이 억제됩니다.',
        action: '감마 중립 구간에서는 추세 매매보다 레인지 트레이딩이 유리합니다.',
        caution: '옵션 만기 접근 시 감마 중립 구간이 급격히 변할 수 있습니다.'
    },
    'RETEST': {
        id: 'RETEST',
        label: '리테스트 (Retest)',
        labelEN: 'Retest / Pullback Recovery',
        category: 'technical',
        meaning: '돌파 후 되돌림(Pullback)이 발생한 뒤, 다시 돌파 레벨을 지지로 확인하는 움직임입니다.',
        interpretation: '리테스트 성공: 지지 확인 → 추세 지속 신호 / 리테스트 실패: 가짜 돌파 경고',
        action: '첫 돌파 추격 금지. 리테스트 성공 후에만 진입.',
        caution: '리테스트 없이 급등하면 되감기 리스크가 큽니다. 늦게 진입하더라도 안전합니다.'
    },
    'TIMESTOP': {
        id: 'TIMESTOP',
        label: '타임스탑 (Time Stop)',
        labelEN: 'Time-Based Stop',
        category: 'risk',
        meaning: '정해진 기간(D+1~2) 내 목표 도달 실패 시 강제 청산/축소하는 규칙입니다.',
        interpretation: 'D+1 목표 미달 + 거래대금 둔화 → rebuildPressure +3 / D+2 연속 → +5',
        action: 'rebuildPressure 8+ 시 자동 교체 트리거. 손절가 도달 전에도 청산됨.',
        caution: '타임스탑은 \"기대값 하락\"에 대응하는 장치입니다. 손절가와 별개.'
    },
    'EARLY_HANDOFF': {
        id: 'EARLY_HANDOFF',
        label: '조기 교체 (Early Handoff)',
        labelEN: 'Early Handoff',
        category: 'risk',
        meaning: '후보의 점수/Velocity가 기존 종목을 근접/초과할 때 30~50% 부분 교체하는 규칙입니다.',
        interpretation: 'Score(Y) ≥ Score(X)-2 AND Velocity(Y) ≥ Velocity(X)+3 시 조기 교체 발동.',
        action: '조기 교체 시 기존 종목 30~50% 축소, 신규 종목으로 분산.',
    },
    'FIRST_BREAK': {
        id: 'FIRST_BREAK',
        label: '첫 돌파 금지 (No Chase)',
        labelEN: 'First Break / No Chase Rule',
        category: 'risk',
        meaning: '처음 발생한 돌파(VWAP/저항 돌파)를 추격하지 않는 규칙입니다.',
        interpretation: '첫 돌파는 가짜 돌파(Fakeout) 확률이 높음. 되감기 후 리테스트 대기.',
        action: 'FIRST_BREAK 종목은 점수에서 -10점. Top3 후보에서 제외.',
        caution: '강력한 모멘텀(+5% 이상)에서도 리테스트를 기다리는 것이 원칙입니다.'
    },
    'REGIME': {
        id: 'REGIME',
        label: '레짐 (Market Regime)',
        labelEN: 'Market Regime',
        category: 'macro',
        meaning: '시장의 위험선호 상태를 3단계로 구분합니다: Risk-On / Neutral / Risk-Off',
        interpretation: 'VIX<16: Risk-On / VIX 16~20: Neutral / VIX>20: Risk-Off',
        action: 'Risk-Off 시 공격적 진입 자제. Neutral/Risk-On에서만 신규 포지션.',
    }
};

// Helper function to get explanation by ID
export function getExplanation(id: string): Explanation | null {
    return EXPLANATIONS[id] || null;
}

// Get all explanations by category
export function getExplanationsByCategory(category: Explanation['category']): Explanation[] {
    return Object.values(EXPLANATIONS).filter(e => e.category === category);
}

// Get a short tooltip text (label + meaning)
export function getTooltipText(id: string): string {
    const exp = EXPLANATIONS[id];
    if (!exp) return '';
    return `${exp.label}: ${exp.meaning}`;
}
