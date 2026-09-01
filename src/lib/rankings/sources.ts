// ============================================================================
// 랭킹 자료원 — 내부자 신고 · 펀더멘털.
//
// ⚠️ 벤더 원칙: Polygon/Massive 는 쓰지 않는다. 전부 Intrinio 로 이관돼 있다.
//    (코드 다른 곳에 남은 polygon 주소는 «라우팅 키»이지 벤더 호출이 아니다.)
// ============================================================================
import { getFromCache, setInCache } from '@/services/redisClient';

const BASE = process.env.INTRINIO_BASE_URL || 'https://api-v2.intrinio.com';
const KEY = process.env.INTRINIO_API_KEY || '';

async function call(path: string, params: Record<string, string> = {}, timeoutMs = 12000): Promise<any> {
    if (!KEY) return null;
    const u = new URL(`${BASE}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
    u.searchParams.set('api_key', KEY);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const r = await fetch(u.toString(), { signal: ac.signal });
        if (!r.ok) return null;
        return await r.json();
    } catch { return null; } finally { clearTimeout(t); }
}

/** 동시성 제한 — 한 번에 다 던지면 벤더 레이트리밋에 걸린다. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
    }));
    return out;
}

// ── ② 내부자 «장내 매수» ────────────────────────────────────────────────────
export type InsiderBuy = {
    ticker: string; company: string; owner: string; role: string;
    shares: number; price: number; usd: number;
    ownedAfter: number | null; increasePct: number | null;
    date: string; isTopExec: boolean;
};

/**
 * ⚠️ 「내부자 매수」를 그냥 세면 안 된다. 신고에는 보상·무상취득(A)·옵션행사(M)·
 *    세금납부(F)가 섞여 있고, 실측 908건 중 그런 게 절반이 넘는다.
 *    **자기 돈으로 장내에서 산 것은 SEC 코드 `P` 하나뿐이다.**
 */
export async function fetchInsiderBuys(maxPages = 4): Promise<{ buys: InsiderBuy[]; scanned: number }> {
    const CK = `ranking:insider:v1:${maxPages}`;
    const hit = await getFromCache<{ buys: InsiderBuy[]; scanned: number }>(CK);
    if (hit) return hit;

    const buys: InsiderBuy[] = [];
    let next: string | undefined; let scanned = 0;
    for (let p = 0; p < maxPages; p++) {
        const j = await call('insider_transaction_filings', { page_size: '100', ...(next ? { next_page: next } : {}) });
        if (!j) break;
        next = j.next_page;
        for (const f of (j.transaction_filings || [])) {
            for (const tr of (f.transactions || [])) {
                scanned++;
                if (tr.transaction_type_code !== 'P') continue;      // 장내 매수만
                if (tr.derivative_transaction) continue;             // 파생(옵션) 제외
                const shares = Number(tr.amount_of_shares) || 0;
                const price = Number(tr.transaction_price) || 0;
                if (!(shares > 0 && price > 0)) continue;
                const title = String(tr.officer_title || '');
                const role = title || (tr.director ? 'Director' : tr.ten_percent_owner ? '10% Owner' : tr.officer ? 'Officer' : '기타');
                const ownedAfter = Number(tr.total_shares_owned) || null;
                // 「보유 지분 대비 얼마나 늘렸나」 — 금액만 보면 대주주가 늘 이긴다
                const before = ownedAfter != null ? ownedAfter - shares : null;
                const increasePct = before && before > 0 ? (shares / before) * 100 : null;
                buys.push({
                    ticker: f.issuer_ticker || '', company: f.issuer_company || f.company?.name || '',
                    owner: f.owner?.owner_name || '', role,
                    shares, price, usd: shares * price, ownedAfter, increasePct,
                    date: String(f.filing_date || '').slice(0, 10),
                    isTopExec: /chief|ceo|cfo|coo|president|chair/i.test(role),
                });
            }
        }
        if (!next) break;
    }
    const res = { buys, scanned };
    await setInCache(CK, res, 3600).catch(() => { });
    return res;
}

// ── ③ 펀더멘털 (FCF · EV/EBITDA · 부채 · 마진) ──────────────────────────────
export type Funda = {
    ticker: string; fcf: number | null; ebitda: number | null; ev: number | null;
    evToEbitda: number | null; debtToEquity: number | null; operatingMargin: number | null;
    marketCap: number | null; fcfYield: number | null; fiscalYear: number | null;
};

const TAG = (rows: any[], want: string) => {
    const hit = rows.find((r) => String(r?.data_tag?.tag || '').toLowerCase() === want);
    return hit ? Number(hit.value) : null;
};

async function fundaOne(ticker: string): Promise<Funda> {
    const empty: Funda = { ticker, fcf: null, ebitda: null, ev: null, evToEbitda: null, debtToEquity: null, operatingMargin: null, marketCap: null, fcfYield: null, fiscalYear: null };
    const list = await call(`companies/${ticker}/fundamentals`, { statement_code: 'calculations', type: 'TTM', page_size: '1' })
        ?? await call(`companies/${ticker}/fundamentals`, { statement_code: 'calculations', page_size: '1' });
    const fid = list?.fundamentals?.[0]?.id;
    if (!fid) return empty;
    const sf = await call(`fundamentals/${fid}/standardized_financials`);
    const rows = sf?.standardized_financials || [];
    if (!rows.length) return empty;
    const mc = await call(`companies/${ticker}/data_point/marketcap/number`);
    const marketCap = typeof mc === 'number' ? mc : Number(mc) || null;
    const fcf = TAG(rows, 'freecashflow');
    return {
        ticker, fcf, ebitda: TAG(rows, 'ebitda'), ev: TAG(rows, 'enterprisevalue'),
        evToEbitda: TAG(rows, 'evtoebitda'), debtToEquity: TAG(rows, 'ltdebttoequity'),
        operatingMargin: TAG(rows, 'operatingmargin'), marketCap,
        fcfYield: fcf != null && marketCap ? (fcf / marketCap) * 100 : null,
        fiscalYear: list?.fundamentals?.[0]?.fiscal_year ?? null,
    };
}

/** 펀더멘털은 분기에 한 번 바뀐다 — 하루 캐시면 충분하고, 안 그러면 25종목 × 3콜이 매번 나간다. */
export async function fetchFundamentals(tickers: string[]): Promise<Record<string, Funda>> {
    const CK = `ranking:funda:v1:${tickers.length}`;
    const hit = await getFromCache<Record<string, Funda>>(CK);
    if (hit) return hit;
    const rows = await pool(tickers, 5, fundaOne);
    const out: Record<string, Funda> = {};
    for (const r of rows) if (r) out[r.ticker] = r;
    await setInCache(CK, out, 86400).catch(() => { });
    return out;
}
