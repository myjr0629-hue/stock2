/**
 * 기관 신규 포지션 — 다크풀의 «대체 지표».
 *
 * ══════════════════════════════════════════════════════════════════════
 * 왜 이것이 필요한가
 *
 *   다크풀(장외 체결 비중)은 2026-08-28 벤더 권한 상실로 **영구 소멸**했다.
 *   그런데 코드 곳곳이 그 자리를 상수로 메우고 있었다:
 *     · 대시보드 보상형 카드   `let darkPoolPercent = 42.5`  (하드코딩)
 *     · 발행되는 마케팅 영상   `data.darkPool || 35`         (하드코딩)
 *     · OG 이미지             `{darkPool || '42.3'}%`        (하드코딩)
 *     · 인텔 화면             감마에서 다크풀을 «합성»
 *   전부 200 OK 로 나가기 때문에 화면을 열어 보기 전에는 보이지 않았다.
 *
 *   다크풀이 대답하던 질문은 「기관이 호가창 밖에서 무엇을 했나」였다.
 *   같은 질문에 답하면서 **우리가 실제로 재는** 값이 옵션 미결제약정
 *   증가분이다:
 *     · 장중에는 볼 수 없다(OI 는 마감 후 확정) = 진짜 «비공개 발자국»
 *     · 거래량과 달리 신규 진입과 청산을 구분한다
 *     · 5년치 옵션 EOD 벌크가 있어야 만들 수 있다 = 우리만 가능
 *
 *   실측(2026-08-28): 375종목 신규 $63.2B · 콜 73.3% · 최대 NVDA $10.9B(콜)
 *
 * ⚠️ 값이 없으면 **null 을 반환한다.** 0 이나 상수를 만들지 않는다.
 *    0 은 «기관이 아무것도 안 했다»는 주장이고, 그건 사실이 아니다.
 * ══════════════════════════════════════════════════════════════════════
 */

const OPT_KEY = 'intrinio:options:eod';

/** 「시장 전체」라고 말하려면 최소 이만큼의 종목이 있어야 한다 */
const MIN_TICKERS_FOR_MARKET = 50;

export interface InstitutionalFlowSummary {
    /** 신규 진입 금액 합계(USD) */
    notional: number;
    /** 콜 비중 0~100 */
    callPct: number;
    side: 'call' | 'put';
    /** 집계에 들어간 종목 수 */
    tickers: number;
    topTicker: string | null;
    topNotional: number;
    /** 기준일 — 장중 실시간이 아니라 «전일 마감» 이다. 화면에 그렇게 쓸 것 */
    date: string | null;
}

export interface InstitutionalFlowTicker {
    ticker: string;
    contracts: number;
    notional: number;
    side: 'call' | 'put';
    date: string | null;
}

async function readOptionsEod(): Promise<any | null> {
    const proxy = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${proxy}/get?key=${encodeURIComponent(OPT_KEY)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal,
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const val = typeof raw?.result === 'string' ? JSON.parse(raw.result) : raw?.result;
        return val?.tickers ? val : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** 한 종목의 신규 진입분을 계약 단위에서 합산한다 */
function sumOpening(v: any): { contracts: number; notional: number; callN: number; putN: number } {
    let contracts = 0, notional = 0, callN = 0, putN = 0;
    for (const c of (v?.top || [])) {
        // 미결제약정이 «늘어난» 것만 신규 포지션이다 (줄어든 것은 청산)
        if (!(c.d > 0)) continue;
        const n = c.d * 100 * (c.k || 0);
        contracts += c.d;
        notional += n;
        if (c.t === 'C') callN += n; else putN += n;
    }
    return { contracts, notional, callN, putN };
}

/**
 * 시장 전체 요약. 표본이 얇으면 «시장 전체»라고 말할 수 없으므로 null.
 */
export async function getInstitutionalFlowSummary(): Promise<InstitutionalFlowSummary | null> {
    const data = await readOptionsEod();
    if (!data) return null;

    let total = 0, call = 0, topN = 0, topT: string | null = null, count = 0;
    for (const [sym, v] of Object.entries<any>(data.tickers || {})) {
        const { contracts, notional, callN } = sumOpening(v);
        if (contracts <= 0) continue;
        count += 1;
        total += notional;
        call += callN;
        if (notional > topN) { topN = notional; topT = sym; }
    }

    if (count < MIN_TICKERS_FOR_MARKET || total <= 0) return null;

    const callPct = Math.round((call / total) * 1000) / 10;
    return {
        notional: total,
        callPct,
        side: callPct >= 50 ? 'call' : 'put',
        tickers: count,
        topTicker: topT,
        topNotional: topN,
        date: data.date ?? null,
    };
}

/** 한 종목만. 유니버스에 없거나 신규 진입이 없으면 null. */
export async function getInstitutionalFlowForTicker(ticker: string): Promise<InstitutionalFlowTicker | null> {
    const t = (ticker || '').toUpperCase();
    if (!t) return null;
    const data = await readOptionsEod();
    const v = data?.tickers?.[t];
    if (!v) return null;

    const { contracts, notional, callN, putN } = sumOpening(v);
    if (contracts <= 0 || notional <= 0) return null;

    return {
        ticker: t,
        contracts,
        notional,
        side: callN >= putN ? 'call' : 'put',
        date: data.date ?? null,
    };
}
