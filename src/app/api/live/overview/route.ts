import { NextRequest, NextResponse } from 'next/server';

import { fetchMassive } from '@/services/massiveClient';
import translate from 'google-translate-api-x';

// In-memory translation cache (key: `${ticker}:${lang}:${field}`)
const translationCache = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 86400_000; // 24h

async function translateText(text: string, lang: 'ko' | 'ja'): Promise<string> {
    try {
        const res = await translate(text, { to: lang });
        return (res as any).text || text;
    } catch {
        return text; // fallback to English
    }
}

async function getCachedTranslation(ticker: string, field: string, text: string, lang: 'ko' | 'ja'): Promise<string> {
    const key = `${ticker}:${lang}:${field}`;
    const cached = translationCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.text;
    const translated = await translateText(text, lang);
    translationCache.set(key, { text: translated, ts: Date.now() });
    return translated;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t')?.toUpperCase();
    const lang = (searchParams.get('lang') || 'en') as 'ko' | 'ja' | 'en';
    if (!ticker) return NextResponse.json({ overview: null });

    const startTime = Date.now();
    try {
        // Overview data is stable, cache for 24 hours (86400 seconds)
        let data;
        try {
            data = await fetchMassive(`/v3/reference/tickers/${ticker}`, {}, true, undefined, { next: { revalidate: 86400 } });
        } catch (e) {
            return NextResponse.json({
                ticker,
                source: `Massive /v3/reference/tickers/${ticker}`,
                sourceGrade: "C",
                overview: {
                    name: null,
                    sector: null,
                    industry: null,
                    description: null,
                    marketCap: null,
                    exchange: null,
                    homepage: null
                },
                debug: { latencyMs: Date.now() - startTime }
            });
        }
        const results = data.results || {};

        // Extract raw English values — limit description to first 2 sentences
        const rawDesc = results.description || null;
        const descriptionEN = rawDesc
            ? rawDesc.split(/(?<=\.)\s+/).slice(0, 2).join(' ')
            : null;
        const sectorEN = results.sic_description || null;

        // Translate if needed (ko/ja)
        let description = descriptionEN;
        let sector = sectorEN;
        if (descriptionEN && (lang === 'ko' || lang === 'ja')) {
            const [descTranslated, sectorTranslated] = await Promise.all([
                getCachedTranslation(ticker, 'desc', descriptionEN, lang),
                sectorEN ? getCachedTranslation(ticker, 'sector', sectorEN, lang) : Promise.resolve(null)
            ]);
            description = descTranslated;
            sector = sectorTranslated;
        }

        return NextResponse.json({
            ticker,
            source: `Massive /v3/reference/tickers/${ticker}`,
            sourceGrade: "A",
            overview: {
                name: results.name || null,
                sector,
                sectorEN,
                industry: results.industry || null,
                description,
                descriptionEN,
                marketCap: results.market_cap || null,
                exchange: results.primary_exchange || null,
                homepage: results.homepage_url || null
            },
            debug: { latencyMs: Date.now() - startTime }
        });
    } catch (e) {
        console.error("Overview API Error:", e);
        return NextResponse.json({
            ticker,
            sourceGrade: "C",
            overview: null,
            error: "Failed to fetch overview",
            debug: { latencyMs: Date.now() - startTime }
        });
    }
}

