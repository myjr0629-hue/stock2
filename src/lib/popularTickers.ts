// ============================================================================
// 인기 종목 순위 — 의존성 없음(서버·클라이언트 공용, 2026-11-13 lib/ai/creditPacing.ts 에서 옮김 · 값·순서 불변)
// ----------------------------------------------------------------------------
// 쓰는 곳: 크레딧 조절기 예열(pace-warm: UC 카드·종목 뉴스) · 내 종목 AI 한 줄 예열(watchlist-ai-line, 100종목) · 딥 분석 예열(앞 20)
//          · 첫 실행 «종목 고르기»의 기본 선택(lib/app/firstRunValue.ts defaultEarningsPicks — 실적 임박 종목을 이 순서로 고른다)
// ============================================================================

/** 사전 생성 대상 — 인기 순 (UC 종목 카드 ≤72 · 종목 뉴스 ≤100) */
export const PREWARM_TICKERS: readonly string[] = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'AMD', 'PLTR', 'COIN', 'MU', 'AVGO', 'NFLX', 'IWM',
    'SMCI', 'MSTR', 'ARM', 'INTC', 'TSM', 'ORCL', 'CRM', 'BABA', 'DIS', 'JPM', 'BA', 'SOFI', 'HOOD', 'RIVN', 'UBER', 'SHOP',
    'SNOW', 'CRWD', 'PANW', 'ADBE', 'QCOM', 'LLY', 'UNH', 'XOM', 'WMT', 'COST', 'V', 'MA', 'GS', 'BAC', 'F', 'GM',
    'NIO', 'PYPL', 'SNAP', 'RBLX', 'DKNG', 'CVNA', 'ANET', 'NOW', 'DDOG', 'NET', 'MDB', 'AMAT', 'LRCX', 'KLAC', 'ASML', 'IBM',
    'CSCO', 'T', 'VZ', 'CAT', 'GE', 'LMT', 'RTX', 'DAL', 'UAL', 'PFE', 'MRNA', 'CVX', 'OXY', 'NKE', 'SBUX', 'MCD',
    'KO', 'PEP', 'TGT', 'LCID', 'ABNB', 'DASH', 'SPOT', 'PINS', 'JD', 'PDD', 'GME', 'AMC', 'CELH', 'ZS', 'TXN', 'HON',
    'DIA', 'SOXL', 'TQQQ', 'SQQQ',
];
