/**
 * 13F «기관 보유» 서버 공용 순수 함수 (2026-10-07, 앱 강화 1단계) — /api/command/13f 가 쓴다.
 * (Next 라우트 파일은 GET 등 정해진 이름 외를 내보낼 수 없어 여기에 둔다. 시험 tests/holders13f.test.ts)
 */
import CUSIP_BY_TICKER from '../data/cusipByTicker.json';

// --- CUSIP Mapping (13-F 는 티커가 아니라 CUSIP 으로 적는다) ---
// 주 표: OpenFIGI 생성 표(수천 종목). 아래 손으로 적은 표는 «표에 없는 종목»만 메운다(표가 이긴다 — 티커 변경·CUSIP 교체를 따라간다).
export const CUSIP_MAP: Record<string, string> = {
    'NVDA': '67066G104', 'AAPL': '037833100', 'MSFT': '594918104',
    'AMZN': '023135106', 'GOOGL': '02079K305', 'GOOG': '02079K107',
    'META': '30303M102', 'TSLA': '88160R101', 'AVGO': '11135F101',
    'JPM': '46625H100', 'V': '92826C839', 'UNH': '91324P102',
    'MA': '57636Q104', 'HD': '437076102', 'COST': '22160K105',
    'NFLX': '64110L106', 'CRM': '79466L302', 'AMD': '007903107',
    'QCOM': '747525103', 'INTC': '458140100', 'DIS': '254687106',
    'ADBE': '00724F101', 'PEP': '713448108', 'KO': '191216100',
    'MRK': '58933Y105', 'ABT': '002824100', 'TMO': '883556102',
    'ORCL': '68389X105', 'ACN': 'G1151C101', 'MCD': '580135101',
    'WMT': '931142103', 'BAC': '060505104', 'PFE': '717081103',
    'CSCO': '17275R102', 'NKE': '654106103', 'LLY': '532457108',
    'XOM': '30231G102', 'CVX': '166764100', 'ABBV': '00287Y109',
    'IBM': '459200101', 'GS': '38141G104', 'CAT': '149123101',
    'BA': '097023105', 'GE': '369604301', 'PLTR': '69608A108',
    'ARM': 'G0692U109', 'SMCI': '86800U104', 'MRVL': 'G5876H105',
    'MU': '595112103', 'SNOW': '833445109', 'PANW': '697435105',
    'NOW': '81762P102', 'UBER': '90353T100', 'SQ': '852234103',
    'SHOP': '82509L107', 'COIN': '19260Q107', 'MSTR': '594972408',
    'SOFI': '83406F102', 'RIVN': '76954A103', 'LCID': '549498104',
    'SPY': '78462F103', 'QQQ': '46090E103', 'IWM': '464287655',
};

/** 티커 → CUSIP. 생성 표 → 손표 순. 모르면 null */
export function cusipForTicker(ticker: string): string | null {
    const t = String(ticker || '').toUpperCase();
    return (CUSIP_BY_TICKER as Record<string, string>)[t] || CUSIP_MAP[t] || null;
}

/**
 * 색인이 «전체»인가 «소표본»인가. 새 색인(SEC 데이터셋)은 universeFilers(제출 기관 수)로, 출처 표식이 없는 옛 항목은 보유 기관 수로 가른다.
 *   정상 색인: 제출 기관 8,857 · NVDA 5,905곳. 소표본: 제출 초반 소형 자문사 24곳(NVDA) — 어느 큰 종목이든 수백 곳 아래면 표본이다.
 */
export const MIN_UNIVERSE_FILERS = 3000;
export const MIN_LEGACY_HOLDERS = 500;
export function isPartialIndex(entry: { source?: string; universeFilers?: number; totalHolders?: number; holders?: unknown[] }): boolean {
    if (entry.source === 'sec-form13f-datasets') return !(Number(entry.universeFilers) >= MIN_UNIVERSE_FILERS);
    const n = Number(entry.totalHolders ?? (Array.isArray(entry.holders) ? entry.holders.length : 0));
    return n < MIN_LEGACY_HOLDERS;
}

/**
 * 지금 시점에 «공시가 끝난 가장 최근 기준일(분기 말)» — 분기 말 + 46일(마감 45일 + 하루)이 지나야 그 분기의 13F 가 완성된다.
 * (옛 Lambda 의 currentPeriod 는 «달»만 비교해 8/1 에 6/30 을 골랐다 — 마감 8/14 전이다. 날짜로 비교한다.)
 */
export function latestCompletedPeriod(now: Date = new Date()): string {
    const cutoff = now.getTime() - 46 * 86400000;
    const y = new Date(cutoff).getUTCFullYear();
    let best = '';
    for (const yy of [y - 1, y]) {
        for (const [mm, dd] of [[3, 31], [6, 30], [9, 30], [12, 31]] as const) {
            const iso = `${yy}-${String(mm).padStart(2, '0')}-${dd}`;
            if (Date.parse(iso + 'T00:00:00Z') <= cutoff && iso > best) best = iso;
        }
    }
    return best;
}
