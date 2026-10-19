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
import { forecastHits } from '@/lib/ai/trustLayer';
import { withFreshTier, isFreshTierSkipped } from '@/lib/ai/freshTier';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
import { etClock, lastClosedSessionDate } from '@/lib/marketSession';
import { isNonTradingDay } from '@/lib/marketCalendar';
import { sessionQuote, generationSession, preMarketPrompt, type SessionQuote } from '@/lib/ai/preMarketContext';
import { readPreMarketContext } from '@/services/preMarketContext';
import { loadBundle } from '@/services/todayPicksService';
import { ungroundedNumbers } from '@/lib/ai/factGrounding';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const HEADLINE_KEY = 'intel:ai_headlines:v1';

const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
    silicon_core: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'],
    power_matrix: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'],
    bio_pulse: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'],
    cyber_shield: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'],
    orbit_defense: ['LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR'],
    quantum_edge: ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'],
    fintech_pulse: ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'],
    cloud_fortress: ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'],
};

const SECTOR_LABEL: Record<string, string> = {
    m7: 'Magnificent 7 (mega-cap tech)',
    physical_ai: 'Physical AI / robotics',
    silicon_core: 'Semiconductors',
    power_matrix: 'Power & nuclear infrastructure',
    bio_pulse: 'Biotech / pharma',
    cyber_shield: 'Cybersecurity',
    orbit_defense: 'Defense & space',
    quantum_edge: 'AI infrastructure / quantum',
    fintech_pulse: 'Fintech / crypto-adjacent',
    cloud_fortress: 'Enterprise software / cloud',
};

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
    const facts: any[] = [];
    for (const [id, tickers] of Object.entries(SECTOR_TICKERS)) {
        let rows = tickers.map((t) => quotes[t]).filter((q): q is SessionQuote => !!q && q.changePct != null);
        if (preOpen) {
            const pre = rows.filter(q => q.basis === 'PRE' && q.date === todayET);
            // PRE와 금요일 REG 평균을 섞지 않는다. 프리 표본 부족이면 전체 직전 REG로 날짜를 명시한다.
            rows = pre.length >= Math.ceil(tickers.length / 2) ? pre
                : tickers.map(t => regularQuotes[t]).filter((q): q is SessionQuote => !!q && q.changePct != null);
        }
        // 절반도 못 재면 그 섹터는 넘긴다 — 반쪽 자료로 «판정»을 만들면 틀린 말이 나간다.
        if (rows.length < Math.ceil(tickers.length / 2)) continue;
        const sorted = [...rows].sort((a, b) => (b.changePct as number) - (a.changePct as number));
        const up = rows.filter((r) => (r.changePct as number) > 0).length;
        const avg = rows.reduce((s, r) => s + (r.changePct as number), 0) / rows.length;
        const optionsRows = tickers.map(t => bundle?.tickers?.[t]).filter(r => r && typeof r.callOI === 'number' && typeof r.putOI === 'number');
        facts.push({
            id,
            label: SECTOR_LABEL[id],
            priceBasis: rows[0].basis,
            priceDate: rows[0].date,
            ...(bundle ? { priorOptions: { recordDate: bundle.date, openedOn: bundle.prevDate ?? null,
                lastRegularDate: lastClosedSessionDate(now),
                measured: optionsRows.length,
                callOI: optionsRows.length ? optionsRows.reduce((n, r) => n + r!.callOI!, 0) : null,
                putOI: optionsRows.length ? optionsRows.reduce((n, r) => n + r!.putOI!, 0) : null,
            } } : {}),
            measured: rows.length,
            total: tickers.length,
            up,
            down: rows.length - up,
            avgChangePct: Number(avg.toFixed(2)),
            leader: { t: sorted[0].ticker, c: Number((sorted[0].changePct as number).toFixed(2)) },
            laggard: { t: sorted[sorted.length - 1].ticker, c: Number((sorted[sorted.length - 1].changePct as number).toFixed(2)) },
            spreadPct: Number(((sorted[0].changePct as number) - (sorted[sorted.length - 1].changePct as number)).toFixed(2)),
        });
    }
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
    const system = [
        'You write one-line sector verdicts for an institutional-grade US equity intelligence app.',
        'You are given measured facts only. Interpret them — do not restate them.',
        '',
        'RULES',
        '- One line per sector per language. 40-70 characters for Korean/Japanese, 55-95 for English.',
        '- Say what the DISPERSION means, not just the count. A sector where the leader is +6% and the',
        '  laggard is -2% is not the same as one where everything moved together, even if the average matches.',
        '- Never predict. Describe the observed structure in the present tense. No "will", "expect", "likely", "target"; no future tense; Korean: no 할 것이다/예상/전망/임박; Japanese: no 見込み/予想/だろう/今後.',
        '- No investment advice, no buy/sell language.',
        '- Do not invent numbers. Only use numbers present in the facts.',
        '- Korean: 관측/확인 같은 관찰형 종결. Japanese: 観測/確認. English: observed/holding/diverging.',
        '- LANGUAGE PURITY (strict): the "ko" field must be Korean ONLY, "en" English ONLY, "ja" Japanese ONLY.',
        '  Never let one language leak into another field. Ticker symbols and numbers are fine everywhere.',
        '- Each sector must read differently. If two sectors have similar numbers, separate them by what',
        '  is actually distinct (which name leads, how wide the spread is, breadth vs magnitude).',
        '',
        'Return ONLY a JSON object keyed by sector id:',
        '{"m7":{"ko":"...","en":"...","ja":"..."}, ...}',
    ].join('\n');

    const userPrompt = [
        `Session: ${session} (ET). Trading date: ${todayET}.`,
        '',
        'Measured facts per sector (change % belongs to priceBasis and priceDate, not necessarily today):',
        JSON.stringify(facts, null, 1),
        ...(context ? [preMarketPrompt(context)] : []),
        'Only use numeric values from the measured price/breadth fields in verdicts. Prior options are dated background, never current PRE trades.',
        '',
        `Write a verdict line for each of these ${facts.length} sectors, in ko/en/ja.`,
        `Return ALL ${facts.length} sector ids — do not omit any: ${facts.map((f: any) => f.id).join(', ')}.`,
        'JSON only, no prose before or after.',
    ].join('\n');

    let parsed: Record<string, { ko?: string; en?: string; ja?: string }> | null = null;
    let model = '';
    // ★2026-10-10 사다리 출구 가드 — 아래 «4) 검증»과 같은 규칙(길이·스크립트·예측어·재료에 없는 숫자)으로 한국어 칸이 통과한 섹터가 80% 이상일 때만 ①② 응답을 쓴다
    const ladderGate = (text: string): boolean => {
        try {
            const p = JSON.parse(text.startsWith('{') ? text : `{${text}`);
            let good = 0;
            for (const f of facts) {
                const ko = String(p?.[f.id]?.ko || '').trim();
                const allowedNums = [f.measured, f.total, f.up, f.down, f.avgChangePct, f.leader?.c, f.laggard?.c, f.spreadPct];
                if (ko.length >= 12 && /[가-힣]/.test(ko) && forecastHits(ko, 'ko').length === 0 && ungroundedNumbers(ko, allowedNums).length === 0) good++;
            }
            return good >= Math.ceil(facts.length * 0.8);
        } catch { return false; }
    };
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
    const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;
    const out: Record<string, any> = {};
    let kept = 0;
    // «모델이 아예 안 준 것»과 «주긴 줬는데 검증에 걸린 것»을 구분한다.
    const missing: string[] = [], rejected: string[] = [];

    // ★ 언어별로 «따로» 받는다.
    //   첫 판은 셋 중 하나만 오염돼도 그 섹터를 통째로 버렸다(bio_pulse 가 그랬다 —
    //   영어·일본어 칸에 한글이 섞였다). 그러면 멀쩡한 한국어까지 같이 버려진다.
    //   → 통과한 언어만 채택하고 나머지는 기존 템플릿이 남게 둔다. 부분 성공이 전패보다 낫다.
    const okKo = (t: string) => t.length >= 12 && HANGUL.test(t);
    const okEn = (t: string) => t.length >= 16 && !HANGUL.test(t) && !KANA.test(t) && !KANJI.test(t);
    const okJa = (t: string) => t.length >= 8 && !HANGUL.test(t) && (KANA.test(t) || KANJI.test(t));

    for (const f of facts) {
        const v = parsed?.[f.id];
        if (!v) { missing.push(f.id); continue; }
        const ko = String(v?.ko || '').trim(), en = String(v?.en || '').trim(), ja = String(v?.ja || '').trim();
        const entry: Record<string, string> = {};
        const dropped: string[] = [];
        // ★2026-10-07 앱 강화 T5 출구 게이트 — ① 예측어(전망·will·見込み …) ② 재료(섹터별 사실)에 없는 숫자. 걸린 언어는 쓰지 않는다(템플릿 판정문이 남는다).
        const allowedNums = [f.measured, f.total, f.up, f.down, f.avgChangePct, f.leader?.c, f.laggard?.c, f.spreadPct];
        const gateOk = (loc: 'ko' | 'en' | 'ja', text: string) => forecastHits(text, loc).length === 0 && ungroundedNumbers(text, allowedNums).length === 0;
        if (okKo(ko) && gateOk('ko', ko)) entry.headline = ko; else dropped.push('ko');
        if (okEn(en) && gateOk('en', en)) entry.headlineEN = en; else dropped.push('en');
        if (okJa(ja) && gateOk('ja', ja)) entry.headlineJP = ja; else dropped.push('ja');

        // 한국어가 없으면 이 섹터는 쓰지 않는다 — 앱 기본 표시가 한국어 필드다.
        if (!entry.headline) { rejected.push(`${f.id}(ko실패)`); continue; }
        if (dropped.length) rejected.push(`${f.id}(부분:${dropped.join(',')}만 탈락)`);
        out[f.id] = entry;
        kept++;
    }
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
