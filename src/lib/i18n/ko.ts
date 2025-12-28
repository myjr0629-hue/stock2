// [S-53.2] Korean i18n Labels SSOT
// [S-54.1] Updated with user-friendly terminology + trend templates
// All UI labels defined here - no English hardcoding in components

export const ko = {
    // ============ BLOCK TITLES ============
    blocks: {
        A: "블록 A — 알파점수 분해",
        B: "블록 B — 펄스점수 상세",
        C: "블록 C — 옵션 구조 지도",
        D: "블록 D — 정책/이벤트/뉴스"
    },

    // ============ PULSE SCORE FACTORS ============
    pulseFactors: {
        momentum: { label: "모멘텀", desk: "최근 3~10일 가격·거래량 가속 (추세 지속 가능성)" },
        options: { label: "수급", desk: "ATM 주변 IV 변화 및 고래 포지션 (단기 압력)" },
        structure: { label: "구조", desk: "핀/월/플로어 레벨 지지/저항 강도 (자석 효과)" },
        regime: { label: "시장환경", desk: "금리/VIX/나스닥이 종목에 주는 거시적 압력" },
        risk: { label: "리스크", desk: "검증/유동성/변동성 위험에 따른 점수 차감" }
    },

    // ============ SUPPRESSION FLAGS ============
    flags: {
        VOL_HUMIDITY_HIGH: "변동성 체감 과열",
        LOW_LIQUIDITY: "유동성 부족",
        NEWS_CONFLICT: "뉴스 충돌",
        HARD_CUT: "하드컷 발동",
        POLICY_CONFLICT: "정책 충돌",
        HIGH_IV: "고IV 경고",
        GAP_RISK: "갭 리스크",
        EARNINGS_NEAR: "실적 임박",
        FOMC_NEAR: "FOMC 임박",
        RETEST_FAIL: "리테스트 실패",
        TIME_STOP: "타임스탑 위반",
        FIRST_BREAK: "첫돌파 금지"
    },

    // ============ PROTOCOL ACTIONS ============
    protocolAction: {
        NO_TRADE: "매매 보류",
        WATCH: "관찰",
        ENTRY_OK: "진입 가능",
        EXIT: "청산 권고",
        HOLD: "보유 유지",
        TRIM: "일부 축소",
        AVOID: "회피"
    },

    // ============ CONSTRAINTS ============
    constraints: {
        FIRST_BREAK: "첫돌파 금지",
        TIME_STOP: "타임스탑",
        RETEST_FAIL: "리테스트 실패",
        HARD_CUT: "하드컷",
        PUT_FLOOR_BREACH: "풋플로어 붕괴",
        CALL_WALL_BREACH: "콜월 붕괴"
    },

    // ============ CONTINUATION STATES ============
    continuationState: {
        HOLD: "유지",
        WATCH: "주의",
        EXIT: "이탈",
        REPLACE: "교체"
    },

    // ============ OPTIONS SUMMARY TEMPLATES ============
    optionsSummary: {
        dealerShortGamma: "딜러 숏감마 포지션 — 변동성 확대 예상",
        dealerLongGamma: "딜러 롱감마 포지션 — 변동성 억제 예상",
        netBuyer: "순매수 수급 — 상승 압력",
        netSeller: "순매도 수급 — 하락 압력",
        neutral: "중립 수급",
        pinned: "핀잉 구간 — 횡보 예상"
    },

    // ============ MARKET STATUS ============
    marketStatus: {
        open: "장 진행 중",
        closed: "장 종료",
        pre: "프리마켓",
        post: "애프터마켓"
    },

    // ============ [S-54.1] INTEGRITY STATUS - User Friendly ============
    integrityStatus: {
        OK: "검증 완료",
        READY: "검증 완료",
        PARTIAL: "일부 데이터 업데이트 중",
        PENDING: "일부 데이터 업데이트 중",
        INCOMPLETE: "생성 실패 (이전 리포트 유지)",
        FAILED: "생성 실패 (이전 리포트 유지)",
        ERROR: "오류 발생"
    },

    // ============ ENGINE STATUS ============
    engineStatus: {
        OK: "엔진 정상",
        PARTIAL: "일부 대기",
        ERROR: "오류"
    },

    // ============ [S-54.1] TREND TEMPLATES ============
    trend: {
        upStrong: "강한 상승 추세",
        upModerate: "상승 추세",
        sideways: "박스권 횡보",
        downModerate: "하락 추세",
        downStrong: "급락 추세",
        templates: {
            upWithLongGamma: "상승 추세 + 롱 감마 (변동성 축소) → 추세 지속 예상",
            upWithShortGamma: "상승 추세 + 숏 감마 (급등락 가능) → 분할 진입 권장",
            boxWithVwapAbove: "박스권 + VWAP 상단 유지 → 모멘텀 회복 시도",
            boxWithVwapBelow: "박스권 + VWAP 하단 횡보 → 하방 이탈 주의",
            downWithSupport: "하락 추세 + 풋 플로어 지지 → 반등 시도 가능",
            downNoSupport: "하락 추세 + 지지선 미확인 → 회피 권장"
        }
    },

    // ============ COMMON LABELS ============
    common: {
        loading: "로딩 중...",
        error: "오류 발생",
        noData: "데이터 없음",
        refresh: "새로고침",
        collapse: "접기",
        expand: "펼치기",
        alphaScore: "알파점수",
        pulseScore: "펄스점수",
        price: "가격",
        change: "변동",
        volume: "거래량",
        rank: "순위",
        confirmed: "확정",
        pending: "대기 중",
        retry: "재시도",
        close: "닫기",
        details: "상세",
        source: "출처",
        time: "시각"
    },

    // ============ [S-54.1] UI LABELS ============
    ui: {
        alphaLeader: "알파 리더",
        topStocks: "상위 종목",
        marketLikes: "시장이 좋아하는 것",
        marketDislikes: "시장이 싫어하는 것",
        continuationTrack: "연속성 추적",
        engineInterpretation: "엔진 해석",
        returnToTerminal: "터미널로 돌아가기",
        coverage: "커버리지",
        priceAction: "가격 행동",
        optionsStructure: "옵션 구조",
        macroContext: "거시 환경"
    }
};

// Type-safe accessor
export type KoKeys = keyof typeof ko;

// Helper function for safe access with fallback
export function t(category: keyof typeof ko, key: string): string {
    const cat = ko[category] as Record<string, any>;
    if (!cat) return key;
    const value = cat[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value.label) return value.label;
    return key;
}

// [S-54.1] Trend Copy Generator SSOT
export function generateTrendCopy(input: {
    changePct: number;
    vwapPosition?: number;
    dealerGamma?: 'SHORT' | 'LONG' | 'NEUTRAL';
    hasPutFloor?: boolean;
}): { headline: string; reasons: string[] } {
    const { changePct, vwapPosition, dealerGamma, hasPutFloor } = input;

    let trendType: 'up' | 'down' | 'sideways' = 'sideways';
    if (changePct > 2) trendType = 'up';
    else if (changePct < -2) trendType = 'down';

    const reasons: string[] = [];
    let headline = ko.trend.sideways;

    if (trendType === 'up') {
        if (dealerGamma === 'LONG') {
            headline = ko.trend.templates.upWithLongGamma;
            reasons.push("딜러 롱 감마 (변동성 억제)");
        } else if (dealerGamma === 'SHORT') {
            headline = ko.trend.templates.upWithShortGamma;
            reasons.push("딜러 숏 감마 (변동성 확대)");
        } else {
            headline = ko.trend.upModerate;
        }
        if (changePct > 5) reasons.push(`강한 상승 (+${changePct.toFixed(1)}%)`);
    } else if (trendType === 'down') {
        if (hasPutFloor) {
            headline = ko.trend.templates.downWithSupport;
            reasons.push("풋 플로어 지지 확인");
        } else {
            headline = ko.trend.templates.downNoSupport;
            reasons.push("지지선 미확인");
        }
        if (changePct < -5) reasons.push(`급락 (${changePct.toFixed(1)}%)`);
    } else {
        if (vwapPosition === 1) {
            headline = ko.trend.templates.boxWithVwapAbove;
            reasons.push("VWAP 상단 위치");
        } else if (vwapPosition === -1) {
            headline = ko.trend.templates.boxWithVwapBelow;
            reasons.push("VWAP 하단 위치");
        } else {
            headline = ko.trend.sideways;
        }
    }

    if (reasons.length === 0) reasons.push("추가 분석 필요");

    return { headline, reasons: reasons.slice(0, 3) };
}
