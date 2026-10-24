// ============================================================================
// 섹터 «판정문»을 진짜 AI 로, 그리고 장중에도 오늘 것으로.
// ----------------------------------------------------------------------------
// 실측으로 드러난 두 가지 (2026-09-10)
//
//  ① AI 가 아니었다. 인텔 화면의 판정 한 줄은 하드코딩 분기 4갈래였다:
//       전 종목 상승 / 전 종목 하락 / 상승 2종 이하 / 그 외
//     종목이 달라도 섹터가 달라도 문장 골격이 같다. 숫자만 갈아 끼운다.
//     (오늘 플로우 «AI 상세 시나리오»에서 고친 것과 **완전히 같은 문제**다)
//
//  ② 하루가 낡는다. 스냅샷 크론은 21:00~21:45 UTC(장 마감 후)에 한 번만 돈다.
//     실측: ET 21:39 시점에 헤드라인 생성 4.6시간 전, 날짜는 어제.
//     다음 거래일 장중 내내 «어제 세션»을 설명한다 — 화면 숫자는 실시간인데
//     해석만 어제 것이라 화면이 자기모순이다.
//
// 왜 지금 할 수 있나 — 스로틀을 없애면서 시간당 약 400콜의 여유가 생겼다.
// 그런데 묶여 있는 건 «호출 수»(RPM 10)이지 토큰이 아니다(TPM 은 기본값 100%).
// → **10섹터를 10콜이 아니라 «1콜»로 묶는다.** 프롬프트는 길어도 되고, 출력도
//   3개국어 30줄까지 한 번에 받는다. 비용은 시간당 1콜 = 여유의 0.25%.
// ============================================================================
import { NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { publicBase } from '@/lib/net/publicBase';
import { withFreshTier, isFreshTierSkipped } from '@/lib/ai/freshTier';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
import { etClock } from '@/lib/marketSession';
import { isNonTradingDay } from '@/lib/marketCalendar';
import { sessionQuote, generationSession, type SessionQuote } from '@/lib/ai/preMarketContext';
import { readPreMarketContext } from '@/services/preMarketContext';
import { loadBundle } from '@/services/todayPicksService';
import { buildSectorFacts, SECTOR_TICKERS } from '@/lib/ai/sectorBriefFacts';
import { buildSectorBriefPrompt, sectorBriefBatchGate, selectSectorBriefOutput } from '@/lib/ai/sectorBrief';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const HEADLINE_KEY = 'intel:ai_headlines:v1';

// UTC 고정 08:40·10:40 = 17:40·19:40 KST(평일).
// EDT 04:40·06:40, 11/1 종료 뒤 EST 03:40·05:40. 첫 회는 개장 전이므로 CLOSED가 맞다.
// 추가 생성은 withFreshTier로 기존 Haiku 5.5 크레딧 상한을 지킨다(AWS 비용 증가 없음).
const PRE_LOCK = 'perf:lock:sector-headlines-pre';

export async function GET(request: Request) {
    // [Security] CRON_SECRET 검증 — 다른 cron 라우트(uc-warm·snapshot·warm-news-digest 등)와 같은 방식(헤더 또는 ?secret=).
    //   Vercel 크론은 CRON_SECRET 이 있으면 Authorization: Bearer 를 자동으로 붙인다. 이 라우트는 Bedrock 생성·저장 덮어쓰기를
    //   하므로 공개 호출을 막는다(2026-10-04 — 그 전엔 누구나 부르면 AI 비용·덮어쓰기). 저장소 안 다른 호출자 없음(vercel.json 만).
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const authHeader = request.headers.get('authorization');
        const secretParam = new URL(request.url).searchParams.get('secret');
        if (authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }
    const t0 = Date.now();
    const now = t0;
    const { date: todayET, minutes } = etClock(now);
    const preOpen = minutes < 570;
    const utcHour = new Date(now).getUTCHours();
    const generationSlot = preOpen ? `pre:${utcHour < 10 ? 'early' : utcHour < 12 ? 'second' : 'morning'}` : 'regular';

    // 휴장·주말엔 만들지 않는다. 마감 후 스냅샷 크론이 만든 판이 그날의 정답이다.
    if (isNonTradingDay(todayET)) return NextResponse.json({ success: true, skipped: 'closed-day' });
    if (preOpen && !(await tryBackgroundLock(PRE_LOCK, 90))) return NextResponse.json({ success: true, skipped: 'locked' });
    try {
        return await generateHeadlines(request, now, todayET, preOpen, generationSlot);
    } finally {
        if (preOpen) await releaseBackgroundLock(PRE_LOCK);
    }
}

async function generateHeadlines(request: Request, now: number, todayET: string, preOpen: boolean, generationSlot: string) {
    const t0 = now;
    if (preOpen) {
        const prev = await getFromCache<any>(HEADLINE_KEY).catch(() => null);
        if (prev?.date === todayET && prev?.generationSlot === generationSlot) return NextResponse.json({ success: true, skipped: 'same-slot' });
    }

    const baseUrl = publicBase(request.url.split('/api/')[0]);
    const bypass: Record<string, string> = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {};

    // ── 1) 오늘 시세를 한 번에 받는다 (70종목 1콜) ──
    const all = Array.from(new Set(Object.values(SECTOR_TICKERS).flat()));
    const quotes: Record<string, SessionQuote> = {};
    const regularQuotes: Record<string, SessionQuote> = {};
    let quoteSession = '';
    try {
        const res = await fetch(`${baseUrl}/api/live/quotes?symbols=${all.join(',')}`, {
            headers: bypass, cache: 'no-store', signal: AbortSignal.timeout(20000),
        });
        const body = await res.json();
        // ⚠️ 이 라우트는 배열이 아니라 **티커로 키가 잡힌 객체**를 준다:
        //    { data: { AAPL: { price, changePercent, extendedChangePercent, ... } }, session }
        //    첫 판에서 배열로 가정해 502 가 났다. 실제 응답을 보고 맞춘 형태다.
        const data: Record<string, any> = (body?.data && typeof body.data === 'object' && !Array.isArray(body.data))
            ? body.data
            : {};
        quoteSession = String(body?.session || '').toLowerCase();
        for (const [t, r] of Object.entries(data)) {
            quotes[t.toUpperCase()] = sessionQuote(t.toUpperCase(), r, quoteSession, now);
            regularQuotes[t.toUpperCase()] = sessionQuote(t.toUpperCase(), r, 'closed', now);
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: `quotes failed: ${e?.message}` }, { status: 502 });
    }

    const [context, bundle] = preOpen ? await Promise.all([
        readPreMarketContext(now, Object.values(quotes)), loadBundle(),
    ]) : [null, null];

    // ── 2) 섹터별 «사실»만 계산한다. 해석은 AI 가 한다 ──
    const facts = buildSectorFacts(quotes, regularQuotes, quoteSession, preOpen, todayET, now, bundle);
    if (!facts.length) {
        return NextResponse.json({
            success: false,
            error: 'no measurable sector',
            // 진단을 응답에 싣는다 — 「200 OK 인데 값만 없음」을 밖에서 못 보면 또 헤맨다
            diag: { quotesParsed: Object.keys(quotes).length, quoteSession, sampleTicker: Object.keys(quotes)[0] || null },
        }, { status: 503 });
    }

    // ── 3) 한 번의 호출로 10섹터 × 3개국어 ──
    // 시각으로 추정하지 말고 시세 라우트가 알려 준 세션을 우선한다(휴장·조기마감 포함).
    const SESSION_MAP: Record<string, string> = {
        pre: 'PRE-MARKET', regular: 'REGULAR SESSION', reg: 'REGULAR SESSION',
        post: 'AFTER HOURS', closed: 'CLOSED',
    };
    const session = preOpen ? generationSession(now) : SESSION_MAP[quoteSession] || generationSession(now);
    const { system, userPrompt } = buildSectorBriefPrompt(facts, session, todayET);

    let parsed: Record<string, { ko?: string; en?: string; ja?: string }> | null = null;
    let model = '';
    // ★2026-10-10 사다리 출구 가드 — 아래 «4) 검증»과 같은 규칙(길이·스크립트·예측어·재료에 없는 숫자)으로 한국어 칸이 통과한 섹터가 80% 이상일 때만 ①② 응답을 쓴다
    const ladderGate = (text: string): boolean => sectorBriefBatchGate(text, facts);
    try {
        const generate = () => callBedrock({
            modelId: MODELS.HAIKU_35,
            system,
            userPrompt,
            // 10섹터 × 3개국어 = 넉넉히. 토큰은 남는 자원이고 호출 수가 비싼 자원이다.
            maxTokens: 4000,
            temperature: 0.4,
            jsonPrefill: true,
            label: 'SectorHeadlines',
            locale: 'multi',
            validate: ladderGate,
        });
        const r = await (preOpen ? withFreshTier(generate) : generate());
        model = r.model || '';
        const text = (r.text || '').trim();
        parsed = JSON.parse(text.startsWith('{') ? text : `{${text}`);
    } catch (e: any) {
        if (isFreshTierSkipped(e)) return NextResponse.json({ success: true, skipped: 'credit-cap-or-unavailable', ms: Date.now() - t0 });
        // 실패하면 «아무것도 쓰지 않는다». 기존(템플릿) 판정문이 그대로 남아 화면은 안 빈다.
        return NextResponse.json({ success: false, error: `bedrock: ${e?.message}`, ms: Date.now() - t0 }, { status: 502 });
    }

    // ── 4) 검증 — AI 가 준 것 중 «쓸 수 있는 것»만 저장한다 ──
    const { sectors: out, kept, missing, rejected } = selectSectorBriefOutput(parsed, facts);
    if (!kept) {
        return NextResponse.json({ success: false, error: 'all rejected', rejected, missing, ms: Date.now() - t0 }, { status: 502 });
    }

    const payload = {
        date: todayET,
        session,
        generationSlot,
        ...(context ? { context, optionsAsOf: bundle?.date ?? null, optionsOpenedOn: bundle?.prevDate ?? null } : {}),
        generatedAt: new Date(now).toISOString(),
        source: 'claude',
        promptVersion: 'sector-brief-v2',
        facts,
        model,
        sectors: out,
    };
    // 2시간 보관 — 갱신이 멈춰도 «두 시간 지난 해석»까지만 나간다.
    await setInCache(HEADLINE_KEY, payload, 2 * 3600);

    return NextResponse.json({
        success: true, kept, asked: facts.length, rejected, missing, session, model,
        ms: Date.now() - t0,
        sample: out[facts[0].id],
    });
}
