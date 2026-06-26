/**
 * GET /api/guardian/briefing?locale=ko
 * 
 * Returns the latest AI morning briefing from Redis.
 * Supports per-locale briefings (ko/en/ja).
 * 
 * SELF-HEALING: If it's past 08:05 ET on a weekday and no today's briefing exists,
 * automatically triggers generation so the user never sees "no briefing".
 */

import { NextResponse, NextRequest } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

export const maxDuration = 60;

const SUPPORTED_LOCALES = new Set(['ko', 'en', 'ja']);
const HANGUL_RE = /[\u3131-\u318E\uAC00-\uD7A3]/;
const JAPANESE_KANA_RE = /[\u3040-\u30FF]/;

function normalizeLocale(value: string | null): 'ko' | 'en' | 'ja' {
    return SUPPORTED_LOCALES.has(value || '') ? value as 'ko' | 'en' | 'ja' : 'ko';
}

function isBriefingUsableForLocale(locale: 'ko' | 'en' | 'ja', text: unknown): text is string {
    if (typeof text !== 'string' || text.trim().length < 50) return false;
    if (locale === 'en') return !HANGUL_RE.test(text) && !JAPANESE_KANA_RE.test(text);
    if (locale === 'ja') return !HANGUL_RE.test(text);
    return true;
}

export async function GET(req: NextRequest) {
    try {
        const locale = normalizeLocale(req.nextUrl.searchParams.get('locale'));

        // Today's date in ET (briefing is only valid for the current trading day)
        const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const etDate = new Date(nowET);
        const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        // Also accept US format (M/D/YYYY) since generate stores in en-US format
        const todayUS = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

        const etHour = etDate.getHours();
        const etMinute = etDate.getMinutes();
        const etTime = etHour + etMinute / 60;
        const dayOfWeek = etDate.getDay(); // 0=Sun, 6=Sat
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

        // Try locale-specific key first (V8.0 format)
        const localeKey = `guardian:morning_briefing:${locale}`;
        const localeBriefing = await getFromCache<any>(localeKey);

        if (localeBriefing) {
            const briefingDate = localeBriefing.date || '';
            const isToday = briefingDate === todayET || briefingDate === todayUS;

            if (isToday && isBriefingUsableForLocale(locale, localeBriefing.briefing)) {
                return NextResponse.json({
                    success: true,
                    briefing: localeBriefing.briefing,
                    date: localeBriefing.date,
                    source: localeBriefing.source,
                    generatedAt: localeBriefing.generatedAt,
                    newsCount: localeBriefing.newsCount || 0,
                    calendarCount: localeBriefing.calendarCount || 0,
                });
            }
        }

        // Fallback to legacy key only for Korean. Legacy stores Korean text and
        // must not be served to English/Japanese app pages.
        if (locale === 'ko') {
            const legacyKey = 'guardian:morning_briefing';
            const legacyBriefing = await getFromCache<any>(legacyKey);

            if (legacyBriefing) {
                const briefingDate = legacyBriefing.date || '';
                const isToday = briefingDate === todayET || briefingDate === todayUS;

                if (isToday && isBriefingUsableForLocale(locale, legacyBriefing.text || legacyBriefing.briefing)) {
                    return NextResponse.json({
                        success: true,
                        briefing: legacyBriefing.text || legacyBriefing.briefing,
                        date: legacyBriefing.date,
                        source: legacyBriefing.source,
                        generatedAt: legacyBriefing.generatedAt,
                        preMarket: legacyBriefing.preMarket,
                    });
                }
            }
        }

        // ================================================================
        // SELF-HEALING: No today's briefing found
        // If it's a weekday and past 08:05 ET, auto-trigger generation
        // This covers: cron failure, deployment timing, cold start issues
        // ================================================================
        if (isWeekday && etTime >= 8.08) {
            // Rate limit: only attempt once per 5 minutes (prevent stampede)
            const healingKey = `briefing:healing:${todayET}`;
            const lastAttempt = await getFromCache<number>(healingKey);
            const now = Date.now();

            if (!lastAttempt || (now - lastAttempt) > 5 * 60 * 1000) {
                // Mark healing attempt (expires in 1 hour)
                await setInCache(healingKey, now, 3600);

                console.log(`[Guardian Briefing] 🔧 Self-healing: No briefing for ${todayET}, triggering generation...`);

                // Retry up to 2 times with 10s delay
                const MAX_RETRIES = 2;
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        const baseUrl = req.nextUrl.origin || req.url.split('/api/')[0];

                        const res = await fetch(`${baseUrl}/api/guardian/briefing/generate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ snapshot: null, rlsiHistory: [] }),
                            signal: AbortSignal.timeout(55000),
                        });

                        if (res.ok) {
                            const result = await res.json();
                            console.log(`[Guardian Briefing] ✅ Self-healing success (attempt ${attempt}): ${result.newsCount} news, ${result.calendarCount} calendar`);

                            // Re-read the just-generated briefing
                            const freshBriefing = await getFromCache<any>(localeKey);
                            if (freshBriefing?.briefing) {
                                return NextResponse.json({
                                    success: true,
                                    briefing: freshBriefing.briefing,
                                    date: freshBriefing.date,
                                    source: freshBriefing.source,
                                    generatedAt: freshBriefing.generatedAt,
                                    newsCount: freshBriefing.newsCount || 0,
                                    calendarCount: freshBriefing.calendarCount || 0,
                                    selfHealed: true,
                                });
                            }
                            break; // Success but no cached result, don't retry
                        } else {
                            console.error(`[Guardian Briefing] Self-healing attempt ${attempt}/${MAX_RETRIES} failed: ${res.status}`);
                        }
                    } catch (e: any) {
                        console.error(`[Guardian Briefing] Self-healing attempt ${attempt}/${MAX_RETRIES} error:`, e.message);
                    }

                    // Wait before retry
                    if (attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 10000));
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            briefing: null,
            message: 'No briefing available yet. Generated daily at 08:00 ET.',
        });

    } catch (error: any) {
        console.error('[Guardian Briefing API]', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
