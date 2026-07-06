// Server-side service - do not use "use client"
// [8-K DISCLOSURES] Massive/Polygon 8-K disclosure events (open beta, daily refresh).
// Powers: Command badge, Intel key-stock strip, deep-analysis AI context,
// morning-brief "밤사이 주요 공시" line. Non-critical path: every consumer must
// degrade to "no section shown" when this returns empty (beta schema may change).

import { fetchMassive } from "@/services/massiveClient";
import { getFromCache, setInCache } from "@/services/redisClient";
import { SECTOR_MAP } from "@/services/universePolicy";
import { invokeJSON } from "@/app/api/undercurrent/shared";

export type DiscLocale = 'ko' | 'en' | 'ja';

export interface DisclosureEvent {
    date: string;               // filing_date YYYY-MM-DD
    accession: string;
    url: string;                // SEC filing url
    primary: string;            // primary_category
    tertiary: string;           // tertiary_category
    highImpact: boolean;
    label: Record<DiscLocale, string>;    // category label
    summary: Record<DiscLocale, string>;  // one-line AI summary of supporting_text
}

export interface TickerDisclosures {
    ticker: string;
    events: DisclosureEvent[];
    skipped?: 'etf';
}

// ETFs/indices never file 8-Ks — skip the vendor call entirely.
const ETF_SET = new Set<string>([
    ...Object.keys(SECTOR_MAP),
    'SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'GLD', 'SLV', 'USO', 'UNG', 'VXX',
    'SOXX', 'SMH', 'ARKK', 'EEM', 'EFA', 'HYG', 'LQD', 'XBI', 'KRE', 'GDX',
]);
export function isEtfTicker(t: string): boolean {
    return ETF_SET.has(t.toUpperCase()) || t.startsWith('^') || t.includes('=');
}

// Static labels for the primary categories (controlled vocabulary, taxonomy 1.0)
const PRIMARY_LABELS: Record<string, Record<DiscLocale, string>> = {
    leadership_and_governance: { ko: '리더십·지배구조', en: 'Leadership & Governance', ja: 'リーダーシップ・ガバナンス' },
    capital_and_financing: { ko: '자본·자금조달', en: 'Capital & Financing', ja: '資本・資金調達' },
    strategic_transactions: { ko: 'M&A·전략거래', en: 'Strategic Transactions', ja: 'M&A・戦略取引' },
    shareholder_activity: { ko: '주주활동', en: 'Shareholder Activity', ja: '株主活動' },
    regulatory_and_compliance: { ko: '규제·컴플라이언스', en: 'Regulatory & Compliance', ja: '規制・コンプライアンス' },
    operations_and_strategy: { ko: '사업·전략', en: 'Operations & Strategy', ja: '事業・戦略' },
    financial_performance: { ko: '실적·재무', en: 'Financial Performance', ja: '業績・財務' },
    financial_distress: { ko: '재무위험', en: 'Financial Distress', ja: '財務リスク' },
    securities_and_markets: { ko: '증권·상장', en: 'Securities & Markets', ja: '証券・上場' },
    legal_proceedings: { ko: '소송·법률', en: 'Legal Proceedings', ja: '訴訟・法務' },
};

function prettify(cat: string): string {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function labelFor(primary: string): Record<DiscLocale, string> {
    return PRIMARY_LABELS[primary] || { ko: prettify(primary), en: prettify(primary), ja: prettify(primary) };
}

const HIGH_IMPACT_PRIMARY = new Set(['strategic_transactions', 'financial_distress']);
const HIGH_IMPACT_TERTIARY_RE = /ceo_|cfo_|bankruptcy|merger|acquisition|delisting|going_private|restructuring|impairment/;

function isHighImpact(primary: string, secondary: string, tertiary: string): boolean {
    if (HIGH_IMPACT_PRIMARY.has(primary)) return true;
    if (primary === 'leadership_and_governance' && secondary === 'executive_leadership') return true;
    return HIGH_IMPACT_TERTIARY_RE.test(tertiary || '');
}

function daysAgoISO(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

// One Haiku call per ticker fetch (result cached 12h alongside the events).
// Returns per-event one-line summaries in all three locales; on failure the
// caller falls back to the trimmed English excerpt.
async function summarize(events: { i: number; category: string; text: string }[]): Promise<Record<number, Record<DiscLocale, string>> | null> {
    if (events.length === 0) return {};
    try {
        const sys = 'You summarize SEC 8-K disclosure excerpts for a premium market-intelligence app. For each event, write ONE short factual sentence (max 90 chars) in Korean, English, and Japanese. No opinions, no advice, keep numbers exact. Return ONLY JSON: {"events":[{"i":0,"ko":"...","en":"...","ja":"..."}]}';
        const user = JSON.stringify({ events });
        const out = await invokeJSON(sys, user);
        const map: Record<number, Record<DiscLocale, string>> = {};
        for (const e of (out?.events || [])) {
            if (typeof e?.i === 'number' && e.ko && e.en && e.ja) {
                map[e.i] = { ko: String(e.ko), en: String(e.en), ja: String(e.ja) };
            }
        }
        return map;
    } catch {
        return null;
    }
}

// ── Per-ticker disclosures (Command / Intel / deep-analysis) ──
export async function getTickerDisclosures(ticker: string, days: number = 90): Promise<TickerDisclosures> {
    const T = ticker.toUpperCase();
    if (isEtfTicker(T)) return { ticker: T, events: [], skipped: 'etf' };

    const cacheKey = `disclosures:v1:${T}`;
    try {
        const cached = await getFromCache<TickerDisclosures>(cacheKey);
        if (cached && Array.isArray(cached.events)) return cached;
    } catch { /* fall through */ }

    let result: TickerDisclosures = { ticker: T, events: [] };
    try {
        const res = await fetchMassive('/stocks/filings/8-K/vX/disclosures', {
            tickers: T,
            'filing_date.gte': daysAgoISO(days),
            sort: 'filing_date.desc',
            limit: '10',
        });
        const rows = (res?.results || []).filter((r: any) => r?.filing_date && r?.primary_category);

        // Cap at 2 rows per accession (one filing can yield many rows), 5 total
        const perAccession: Record<string, number> = {};
        const picked: any[] = [];
        for (const r of rows) {
            const acc = r.accession_number || r.filing_date;
            perAccession[acc] = (perAccession[acc] || 0) + 1;
            if (perAccession[acc] <= 2) picked.push(r);
            if (picked.length >= 5) break;
        }

        const aiInput = picked.map((r: any, i: number) => ({
            i,
            category: `${r.primary_category}/${r.tertiary_category || ''}`,
            text: String(r.supporting_text || '').slice(0, 400),
        }));
        const summaries = await summarize(aiInput);

        result = {
            ticker: T,
            events: picked.map((r: any, i: number) => {
                const fallback = String(r.supporting_text || '').slice(0, 140);
                const s = summaries?.[i] || { ko: fallback, en: fallback, ja: fallback };
                return {
                    date: r.filing_date,
                    accession: r.accession_number || '',
                    url: r.filing_url || '',
                    primary: r.primary_category,
                    tertiary: r.tertiary_category || '',
                    highImpact: isHighImpact(r.primary_category, r.secondary_category || '', r.tertiary_category || ''),
                    label: labelFor(r.primary_category),
                    summary: s,
                };
            }),
        };
    } catch (e: any) {
        console.warn(`[Disclosures] fetch failed for ${T}: ${e?.message}`);
        return { ticker: T, events: [] }; // NOT cached — retry next request
    }

    try { await setInCache(cacheKey, result, 12 * 60 * 60); } catch { /* non-critical */ }
    return result;
}

// ── Market-wide overnight disclosures (morning brief) ──
// High-impact events from our coverage universe over the last N days.
export async function getOvernightHighlights(days: number = 3): Promise<{ ticker: string; date: string; primary: string; tertiary: string; text: string }[]> {
    const cacheKey = 'disclosures:market:v1';
    try {
        const cached = await getFromCache<any[]>(cacheKey);
        if (Array.isArray(cached)) return cached;
    } catch { /* fall through */ }

    let highlights: { ticker: string; date: string; primary: string; tertiary: string; text: string }[] = [];
    try {
        const universe = new Set(Object.values(SECTOR_MAP).flatMap(s => s.tickers));
        const res = await fetchMassive('/stocks/filings/8-K/vX/disclosures', {
            'filing_date.gte': daysAgoISO(days),
            sort: 'filing_date.desc',
            limit: '1000',
        });
        const rows = (res?.results || []).filter((r: any) =>
            (r?.tickers || []).some((t: string) => universe.has(t)) &&
            isHighImpact(r.primary_category, r.secondary_category || '', r.tertiary_category || '')
        );
        const seen = new Set<string>();
        for (const r of rows) {
            const t = (r.tickers || []).find((x: string) => universe.has(x));
            if (!t || seen.has(t)) continue;
            seen.add(t);
            highlights.push({
                ticker: t,
                date: r.filing_date,
                primary: r.primary_category,
                tertiary: r.tertiary_category || '',
                text: String(r.supporting_text || '').slice(0, 200),
            });
            if (highlights.length >= 2) break;
        }
    } catch (e: any) {
        console.warn(`[Disclosures] overnight fetch failed: ${e?.message}`);
        return [];
    }

    try { await setInCache(cacheKey, highlights, 3 * 60 * 60); } catch { /* non-critical */ }
    return highlights;
}
