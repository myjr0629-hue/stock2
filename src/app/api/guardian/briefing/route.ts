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
import { publicBase } from '@/lib/net/publicBase';

export const maxDuration = 60;

const SUPPORTED_LOCALES = new Set(['ko', 'en', 'ja']);
const HANGUL_RE = /[\u3131-\u318E\uAC00-\uD7A3]/;
const JAPANESE_KANA_RE = /[\u3040-\u30FF]/;

function normalizeLocale(value: string | null): 'ko' | 'en' | 'ja' {
    return SUPPORTED_LOCALES.has(value || '') ? value as 'ko' | 'en' | 'ja' : 'ko';
}

/**
 * ★ [2026-09-10] «진짜 AI 판»인가?
 *
 *   대표: 「어떤 때는 잘 되고, 어떤 때는 안 되고」.
 *   원인은 생성 실패가 «조용히» 같은 자리에 앉는다는 것이었다 — Bedrock 이 실패하면
 *   숫자 나열 템플릿(source: template / template-error)이 같은 키에 24시간 저장되고,
 *   그 뒤로는 생산자도 자가복구도 «오늘 것이 있으니 됐다»로 판정해 하루가 통째로 굳었다.
 *   실측(2026-09-09): 세 로케일 전부 template-error 로 11.7시간.
 *
 *   → 「있다/없다」가 아니라 「진짜냐/땜빵이냐」로 판정한다.
 */
function isRealAiBriefing(b: any): boolean {
    return String(b?.source || '') === 'claude' && b?.degraded !== true;
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
        // 폴백을 «진짜 AI 로 교체»하는 비싼 작업은 크론만 한다(signum-warm 이 ?repair=1 로 부른다).
        // 사용자 요청은 무슨 일이 있어도 즉시 응답해야 한다 — 재생성은 최대 55초가 걸린다.
        const repairMode = req.nextUrl.searchParams.get('repair') === '1';

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

        // 폴백이 앉아 있고 복구에도 실패했을 때 마지막에 돌려줄 판.
        let degradedPayload: Record<string, any> | null = null;

        // Try locale-specific key first (V8.0 format)
        const localeKey = `guardian:morning_briefing:${locale}`;
        const localeBriefing = await getFromCache<any>(localeKey);

        if (localeBriefing) {
            const briefingDate = localeBriefing.date || '';
            const isToday = briefingDate === todayET || briefingDate === todayUS;

            if (isToday && isBriefingUsableForLocale(locale, localeBriefing.briefing)) {
                const payload = {
                    success: true,
                    briefing: localeBriefing.briefing,
                    date: localeBriefing.date,
                    source: localeBriefing.source,
                    generatedAt: localeBriefing.generatedAt,
                    newsCount: localeBriefing.newsCount || 0,
                    calendarCount: localeBriefing.calendarCount || 0,
                };

                if (isRealAiBriefing(localeBriefing)) {
                    return NextResponse.json(payload);
                }

                // 폴백이 앉아 있다. 크론이 아니면 지금 있는 걸 그대로 주고 끝낸다
                // (화면은 절대 비우지 않는다). 교체는 아래 복구 경로가 맡는다.
                if (!repairMode) {
                    return NextResponse.json({ ...payload, degraded: true });
                }
                degradedPayload = payload;
            }
        }

        // Fallback to legacy key only for Korean. Legacy stores Korean text and
        // must not be served to English/Japanese app pages.
        // 복구하러 들어온 길이면 레거시 키로 새지 않는다 — 거기에도 같은 템플릿이 앉아 있다.
        if (locale === 'ko' && !degradedPayload) {
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
        // 「없다」와 「땜빵이 앉아 있다」는 급한 정도가 다르다.
        //   없다  → 화면이 빈다. 5분 간격으로 즉시 고친다.
        //   땜빵  → 화면은 차 있다. 30분 간격으로 느긋하게 고친다.
        //
        // 시간 상한은 두지 않는다. 대표 지시가 「언제든지 확실하게」이고, 실제로
        // 대표가 본 것도 «저녁 8시에 아직 템플릿»이었다. 아침에만 고치면 그 장면이 남는다.
        // 대신 하루 시도 횟수를 못 박아 비용을 묶는다 — 최악 12콜/일은 현재 여유분
        // (약 4,000콜/일)의 0.3% 다.
        if (isWeekday && etTime >= 8.08) {
            const healReason = degradedPayload ? `degraded(${degradedPayload.source})` : 'missing';
            const gapMs = degradedPayload ? 30 * 60 * 1000 : 5 * 60 * 1000;
            const maxTries = degradedPayload ? 12 : 24;

            const healingKey = degradedPayload
                ? `briefing:repair:${todayET}`
                : `briefing:healing:${todayET}`;
            const gateRaw = await getFromCache<any>(healingKey);
            // 예전 판은 숫자(마지막 시도 시각)만 저장했다 — 그 형태도 그대로 받는다.
            const gate = typeof gateRaw === 'number'
                ? { last: gateRaw, tries: 0 }
                : (gateRaw && typeof gateRaw === 'object' ? gateRaw : { last: 0, tries: 0 });
            const lastAttempt = Number(gate.last) || 0;
            const tries = Number(gate.tries) || 0;
            const now = Date.now();

            if (tries < maxTries && (!lastAttempt || (now - lastAttempt) > gapMs)) {
                // Mark healing attempt (expires in 12 hours — 하루치 시도 횟수를 세야 한다)
                await setInCache(healingKey, { last: now, tries: tries + 1 }, 12 * 3600);

                console.log(`[Guardian Briefing] 🔧 Self-healing (${healReason}) for ${todayET}, triggering generation...`);

                // Retry up to 2 times with 10s delay
                const MAX_RETRIES = 2;
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        const baseUrl = publicBase(req.nextUrl.origin || req.url.split('/api/')[0]);

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
                            // 폴백을 고치러 온 것이라면 «또 폴백»을 성공이라고 부르면 안 된다.
                            const freshIsBetter = freshBriefing?.briefing
                                && (!degradedPayload || isRealAiBriefing(freshBriefing));
                            if (freshIsBetter) {
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

        // 복구가 실패했어도 «가진 것»은 준다. 빈 화면이 템플릿보다 나쁘다.
        if (degradedPayload) {
            return NextResponse.json({ ...degradedPayload, degraded: true, repairAttempted: true });
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
