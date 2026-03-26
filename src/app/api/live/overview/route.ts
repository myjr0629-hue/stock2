import { NextRequest, NextResponse } from 'next/server';

import { fetchMassive } from '@/services/massiveClient';
import translate from 'google-translate-api-x';

const FMP_API_KEY = process.env.FMP_API_KEY || '';

// In-memory translation cache (key: `${ticker}:${lang}:${field}`)
const translationCache = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 86400_000; // 24h

// FMP sector → accurate ko/ja translations
const SECTOR_TRANSLATIONS: Record<string, { ko: string; ja: string }> = {
    'Technology': { ko: '기술', ja: 'テクノロジー' },
    'Communication Services': { ko: '커뮤니케이션 서비스', ja: '通信サービス' },
    'Consumer Cyclical': { ko: '경기소비재', ja: '一般消費財' },
    'Consumer Defensive': { ko: '필수소비재', ja: '生活必需品' },
    'Financial Services': { ko: '금융', ja: '金融サービス' },
    'Healthcare': { ko: '헬스케어', ja: 'ヘルスケア' },
    'Industrials': { ko: '산업재', ja: '資本財' },
    'Energy': { ko: '에너지', ja: 'エネルギー' },
    'Real Estate': { ko: '부동산', ja: '不動産' },
    'Basic Materials': { ko: '소재', ja: '素材' },
    'Utilities': { ko: '유틸리티', ja: '公益事業' },
};

// FMP sector cache (in-memory, keyed by ticker)
const sectorCache = new Map<string, { sector: string; ts: number }>();
const SECTOR_CACHE_TTL = 86400_000 * 7; // 7 days — sectors rarely change

async function getFmpSector(ticker: string): Promise<string | null> {
    // Check cache first
    const cached = sectorCache.get(ticker);
    if (cached && Date.now() - cached.ts < SECTOR_CACHE_TTL) return cached.sector;

    if (!FMP_API_KEY) return null;
    try {
        const res = await fetch(
            `https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${FMP_API_KEY}`,
            { next: { revalidate: 86400 } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const sector = data?.[0]?.sector || null;
        if (sector) {
            sectorCache.set(ticker, { sector, ts: Date.now() });
        }
        return sector;
    } catch {
        return null;
    }
}

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
        // ── [AWS-FIRST] Tier 1: DynamoDB unified cache ──
        try {
            const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
            const dynData = await getUnifiedCache(ticker, 'en');
            const fund = dynData?.fundamentals;
            if (fund?.name || fund?.description) {
                console.log(`[live/overview] ✅ DynamoDB hit for ${ticker}`);
                const rawDesc = fund.description || null;
                const descriptionEN = rawDesc ? rawDesc.split(/(?<=\.)\s+/).slice(0, 2).join(' ') : null;
                let sectorEN = fund.sector || null;
                let sector = sectorEN;
                let description = descriptionEN;

                if (sectorEN && (lang === 'ko' || lang === 'ja')) {
                    const translation = SECTOR_TRANSLATIONS[sectorEN];
                    if (translation) sector = translation[lang];
                }
                if (descriptionEN && (lang === 'ko' || lang === 'ja')) {
                    description = await getCachedTranslation(ticker, 'desc', descriptionEN, lang);
                    if (sectorEN && !SECTOR_TRANSLATIONS[sectorEN] && sector === sectorEN) {
                        sector = await getCachedTranslation(ticker, 'sector', sectorEN, lang);
                    }
                }

                return NextResponse.json({
                    ticker, source: 'DynamoDB', sourceGrade: 'A',
                    overview: {
                        name: fund.name || null, sector, sectorEN,
                        industry: null, description, descriptionEN,
                        marketCap: fund.marketCap || null,
                        exchange: fund.exchange || null, homepage: null,
                    },
                    debug: { latencyMs: Date.now() - startTime, _source: 'dynamodb' },
                });
            }
        } catch (e: any) {
            console.warn(`[live/overview] DynamoDB error for ${ticker}:`, e.message);
        }

        // ── Tier 2: Polygon + FMP fallback ──
        // Fetch Polygon company data (for name, description, marketCap, etc.)
        let data;
        try {
            data = await fetchMassive(`/v3/reference/tickers/${ticker}`, {}, true, undefined, { next: { revalidate: 86400 } });
        } catch (e) {
            return NextResponse.json({
                ticker, source: `Polygon + FMP`, sourceGrade: "C",
                overview: { name: null, sector: null, industry: null, description: null, marketCap: null, exchange: null, homepage: null },
                debug: { latencyMs: Date.now() - startTime }
            });
        }
        const results = data.results || {};

        // Extract raw English description — limit to first 2 sentences
        const rawDesc = results.description || null;
        const descriptionEN = rawDesc
            ? rawDesc.split(/(?<=\.)\s+/).slice(0, 2).join(' ')
            : null;

        // === FMP Sector (replaces Polygon SIC) ===
        const fmpSector = await getFmpSector(ticker);
        let sectorEN = fmpSector || results.sic_description || null;
        let sector = sectorEN;

        // Apply precise translations for FMP sectors (no google translate needed)
        if (fmpSector && (lang === 'ko' || lang === 'ja')) {
            const translation = SECTOR_TRANSLATIONS[fmpSector];
            if (translation) {
                sector = translation[lang];
            }
            // If no translation found, sector stays as English
        }

        // Translate description if needed (ko/ja)
        let description = descriptionEN;
        if (descriptionEN && (lang === 'ko' || lang === 'ja')) {
            description = await getCachedTranslation(ticker, 'desc', descriptionEN, lang);
            // If FMP sector not in dictionary, translate it too
            if (sectorEN && !SECTOR_TRANSLATIONS[sectorEN] && sector === sectorEN) {
                sector = await getCachedTranslation(ticker, 'sector', sectorEN, lang);
            }
        }

        return NextResponse.json({
            ticker,
            source: `Polygon + FMP`,
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
