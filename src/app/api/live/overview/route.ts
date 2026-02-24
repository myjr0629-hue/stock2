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

        // [FIX] SIC sector overrides for common industries (prevents outdated "Radiotelephone" translations)
        const SECTOR_DICT: Record<string, { en: string; ko: string; ja: string }> = {
            "3571": { en: "Consumer Electronics", ko: "소비자 가전", ja: "家電" }, // AAPL
            "7372": { en: "Software", ko: "소프트웨어", ja: "ソフトウェア" }, // MSFT
            "3674": { en: "Semiconductors", ko: "반도체", ja: "半導体" }, // NVDA, AMD
            "7370": { en: "Internet Services", ko: "인터넷 서비스", ja: "インターネット関連" }, // GOOGL, META
            "5961": { en: "E-Commerce", ko: "전자상거래", ja: "電子商取引" }, // AMZN
            "3711": { en: "Automakers", ko: "자동차 제조", ja: "自動車製造" }, // TSLA
            "4813": { en: "Telecom Services", ko: "통신 서비스", ja: "通信サービス" }, // T, VZ
            "2834": { en: "Pharmaceuticals", ko: "제약", ja: "製薬" }, // LLY, JNJ
            "6021": { en: "Banking", ko: "은행", ja: "銀行業" }, // JPM, BAC
            "5812": { en: "Restaurants", ko: "음식점", ja: "レストラン" },
            "4512": { en: "Airlines", ko: "항공/운송", ja: "航空" },
            "2080": { en: "Beverages", ko: "음료", ja: "飲料" },
            "7990": { en: "Entertainment", ko: "엔터테인먼트", ja: "エンターテイメント" } // DIS, NFLX
        };

        const sicCodeStr = results.sic_code ? results.sic_code.toString() : null;
        let sectorENRaw = results.sic_description || null;
        let sectorEN = sectorENRaw;
        let sector = sectorENRaw;
        let skipSectorTranslation = false;

        if (sicCodeStr && SECTOR_DICT[sicCodeStr]) {
            // Apply hardcoded override for clean terminology
            const dict = SECTOR_DICT[sicCodeStr];
            sectorEN = dict.en;
            sector = lang === 'ko' ? dict.ko : lang === 'ja' ? dict.ja : dict.en;
            skipSectorTranslation = true;
        } else if (sectorENRaw) {
            // Sanitizer: Remove outdated ", Except [something]" from raw SIC descriptions
            sectorEN = sectorENRaw.split(/,?\s+Except/i)[0].trim();
            sector = sectorEN;
        }

        // Translate if needed (ko/ja)
        let description = descriptionEN;
        if (descriptionEN && (lang === 'ko' || lang === 'ja')) {
            const [descTranslated, sectorTranslated] = await Promise.all([
                getCachedTranslation(ticker, 'desc', descriptionEN, lang),
                (sectorEN && !skipSectorTranslation) ? getCachedTranslation(ticker, 'sector', sectorEN, lang) : Promise.resolve(sector)
            ]);
            description = descTranslated;
            sector = skipSectorTranslation ? sector : sectorTranslated;
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

