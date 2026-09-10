// 임시 비교용 — Massive 뉴스 해지(2026-09-23) 대비 대안 실측. 판단 후 삭제한다.
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET(req: Request) {
    const t = (new URL(req.url).searchParams.get('t') || 'NVDA').toUpperCase();
    const out: any = { ticker: t };

    // Finnhub company-news (무료 티어 분당 60회)
    const fk = process.env.FINNHUB_API_KEY || '';
    if (fk) {
        try {
            const from = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
            const to = new Date().toISOString().slice(0, 10);
            const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${t}&from=${from}&to=${to}&token=${fk}`,
                { signal: AbortSignal.timeout(15000) });
            const a = await r.json();
            out.finnhub = Array.isArray(a) ? {
                count: a.length,
                publishers: Array.from(new Set(a.map((x: any) => x.source))).slice(0, 12),
                hasSummary: a.filter((x: any) => (x.summary || '').length > 40).length,
                sample: a.slice(0, 4).map((x: any) => ({
                    source: x.source, headline: String(x.headline || '').slice(0, 90),
                    summaryLen: (x.summary || '').length,
                    summary: String(x.summary || '').slice(0, 130),
                    ageH: Math.round((Date.now() - (x.datetime || 0) * 1000) / 3600000),
                })),
            } : { error: String(JSON.stringify(a)).slice(0, 120) };
        } catch (e: any) { out.finnhub = { error: e?.message }; }
    } else out.finnhub = { error: 'no key' };

    // FMP (현재 사용 중)
    const fmp = process.env.FMP_API_KEY || '';
    if (fmp) {
        try {
            const r = await fetch(`https://financialmodelingprep.com/stable/news/stock?symbols=${t}&limit=20&apikey=${fmp}`,
                { signal: AbortSignal.timeout(15000) });
            const a = await r.json();
            out.fmp = Array.isArray(a) ? {
                count: a.length,
                publishers: Array.from(new Set(a.map((x: any) => x.publisher || x.site))).slice(0, 12),
                hasText: a.filter((x: any) => (x.text || '').length > 80).length,
                sample: a.slice(0, 4).map((x: any) => ({
                    source: x.publisher || x.site, headline: String(x.title || '').slice(0, 90),
                    textLen: (x.text || '').length,
                    ageH: Math.round((Date.now() - new Date(String(x.publishedDate || '').replace(' ', 'T') + 'Z').getTime()) / 3600000),
                })),
            } : { error: String(JSON.stringify(a)).slice(0, 120) };
        } catch (e: any) { out.fmp = { error: e?.message }; }
    } else out.fmp = { error: 'no key' };

    return NextResponse.json(out);
}
