/**
 * 앱이 «고정으로 여는» 종목 — 구조 판본 사전 갱신(structure-warm)이 순위와 상관없이 항상 대상에 넣는다 (2026-10-14).
 *
 * 왜: 사전 갱신 대상은 «고정 ETF → 열람 수요 → 핵심 300(미결제약정 큰 순)»이라 이 밖의 종목은 밤사이 갱신이 없어 다음 날 첫 열람이 한 레코드(주말엔 3일) 뒤 판본을 받았다
 *   (무결성 감시기 LV_CHAIN_UNKNOWN/OLD: GME·SNDK·BABA·BRK.B·CLOV — 앱 Intel 설정 목록의 AXON·SPCX·RGTI·QBTS, 섹터 ETF XLY·XLB·XLI·XLV·XLU 도 같은 처지).
 * 무엇: 앱 화면이 정해진 목록으로 여는 종목(Intel 설정/엔진 목록 · 빠른 선택 칩 · 대시보드 섹터 ETF · 섹터 헤드라인) + 무결성 감시기 고정 종목 33개.
 *   목록이 바뀌면 시험(tests/warmAppTickers.test.ts)이 원본 파일과 대조해 실패한다 — 여기서 빠지면 밤 갱신에서 빠지는 것이므로 같이 고친다.
 * 호출량: 핵심 300 밖에 새로 들어오는 종목만 늘어난다(시험이 센다) — 종목당 약 11콜, 호출 속도는 관문(초당 2콜 = 분당 120콜)이 그대로 막는다.
 */
import { APP_SECTOR_STOCKS } from '@/lib/app/intelSectorLists';
import { SECTOR_TICKERS as HEADLINE_SECTORS } from '@/lib/sectorConstants';
import { canonicalShareClass } from '@/lib/tickerSymbol';

/** Intel 서버 «엔진 목록» 10섹터 × 7종목 — useIntelSharedData 의 *_TICKERS 와 /api/intel/* 의 SECTOR_TICKERS (시험이 소스 파일과 대조) */
export const ENGINE_INTEL_TICKERS: string[] = [
    'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
    'PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG',
    'AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL',
    'CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN',
    'LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD',
    'CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET',
    'LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR',
    'SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO',
    'XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST',
    'CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS',
];
/** 빠른 선택 칩(cmd·flow 페이지 POPULAR_TICKERS) */
export const APP_POPULAR_CHIPS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
/** 대시보드(app-view/dash)가 한 요청으로 읽는 섹터 ETF */
export const APP_DASH_ETFS = ['XLK', 'XLE', 'XLY', 'XLB', 'XLI', 'XLF', 'XLV', 'XLU', 'SPY', 'QQQ'];
/** 무결성 감시기 고정 종목(scripts/integrity/watch.js 의 CHIPS + OUTSIDE — 시험이 소스와 대조) */
export const INTEGRITY_WATCH_FIXED = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ',
    'MSTR', 'COIN', 'PLTR', 'AMD', 'MU', 'AVGO', 'SOFI', 'HOOD', 'ASTS', 'ARM', 'NFLX', 'COST', 'LLY', 'BRK.B', 'IWM', 'SOXL', 'GME', 'SNDK', 'CLOV', 'BABA', 'TSM', 'XLK', 'XLE', 'XLF',
];

const TICKER = /^[A-Z][A-Z0-9.]{0,6}$/;

/** 중복 없이, 정본 표기(BRK.B)로, 티커 모양만. 순서는 처음 나온 순. */
export function dedupeCanonical(lists: Array<Iterable<string>>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of lists) for (const x of l) {
        const t = canonicalShareClass(x);
        if (TICKER.test(t) && !seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
}

export const APP_WARM_FIXED: string[] = dedupeCanonical([
    APP_POPULAR_CHIPS,
    INTEGRITY_WATCH_FIXED,
    Object.values(APP_SECTOR_STOCKS).flat(),
    ENGINE_INTEL_TICKERS,
    APP_DASH_ETFS,
    Object.keys(HEADLINE_SECTORS),
    Object.values(HEADLINE_SECTORS).flat(),
]);
