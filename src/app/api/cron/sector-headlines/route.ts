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

type Quote = { ticker: string; price: number | null; changePct: number | null };

function etNow() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return { d, time: d.getHours() + d.getMinutes() / 60, weekday: d.getDay() >= 1 && d.getDay() <= 5 };
}

function sessionLabel(t: number): string {
    if (t >= 4 && t < 9.5) return 'PRE-MARKET';
    if (t >= 9.5 && t < 16) return 'REGULAR SESSION';
    if (t >= 16 && t < 20) return 'AFTER HOURS';
    return 'CLOSED';
}

export async function GET(request: Request) {
    const t0 = Date.now();
    const { time, weekday } = etNow();
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // 휴장·주말엔 만들지 않는다. 마감 후 스냅샷 크론이 만든 판이 그날의 정답이다.
    if (!weekday) return NextResponse.json({ success: true, skipped: 'weekend' });

    const baseUrl = publicBase(request.url.split('/api/')[0]);
    const bypass: Record<string, string> = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {};

    // ── 1) 오늘 시세를 한 번에 받는다 (70종목 1콜) ──
    const all = Array.from(new Set(Object.values(SECTOR_TICKERS).flat()));
    let quotes: Record<string, Quote> = {};
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
        // 프리·애프터장에는 정규장 등락률이 «어제 종가 대비 어제»라 지금을 설명하지 못한다.
        //   → 그 시간대엔 연장 세션 등락률을 쓴다. [[premarket-baseline-off-by-one-session]]
        const useExtended = quoteSession === 'pre' || quoteSession === 'post' || quoteSession === 'closed';
        for (const [t, r] of Object.entries(data)) {
            const reg = Number(r?.changePercent ?? r?.regChangePct);
            const ext = Number(r?.extendedChangePercent);
            const pick = useExtended && Number.isFinite(ext) ? ext : reg;
            quotes[t.toUpperCase()] = {
                ticker: t.toUpperCase(),
                price: Number.isFinite(Number(r?.price)) ? Number(r.price) : null,
                changePct: Number.isFinite(pick) ? Number(pick) : null,
            };
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, error: `quotes failed: ${e?.message}` }, { status: 502 });
    }

    // ── 2) 섹터별 «사실»만 계산한다. 해석은 AI 가 한다 ──
    const facts: any[] = [];
    for (const [id, tickers] of Object.entries(SECTOR_TICKERS)) {
        const rows = tickers.map((t) => quotes[t]).filter((q): q is Quote => !!q && q.changePct != null);
        // 절반도 못 재면 그 섹터는 넘긴다 — 반쪽 자료로 «판정»을 만들면 틀린 말이 나간다.
        if (rows.length < Math.ceil(tickers.length / 2)) continue;
        const sorted = [...rows].sort((a, b) => (b.changePct as number) - (a.changePct as number));
        const up = rows.filter((r) => (r.changePct as number) > 0).length;
        const avg = rows.reduce((s, r) => s + (r.changePct as number), 0) / rows.length;
        facts.push({
            id,
            label: SECTOR_LABEL[id],
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
    const session = SESSION_MAP[quoteSession] || sessionLabel(time);
    const system = [
        'You write one-line sector verdicts for an institutional-grade US equity intelligence app.',
        'You are given measured facts only. Interpret them — do not restate them.',
        '',
        'RULES',
        '- One line per sector per language. 40-70 characters for Korean/Japanese, 55-95 for English.',
        '- Say what the DISPERSION means, not just the count. A sector where the leader is +6% and the',
        '  laggard is -2% is not the same as one where everything moved together, even if the average matches.',
        '- Never predict. Describe the observed structure. No "will", "expect", "likely", "target".',
        '- No investment advice, no buy/sell language.',
        '- Do not invent numbers. Only use numbers present in the facts.',
        '- Korean: 관측/확인 같은 관찰형 종결. Japanese: 観測/確認. English: observed/holding/diverging.',
        '- Each sector must read differently. If two sectors have similar numbers, separate them by what',
        '  is actually distinct (which name leads, how wide the spread is, breadth vs magnitude).',
        '',
        'Return ONLY a JSON object keyed by sector id:',
        '{"m7":{"ko":"...","en":"...","ja":"..."}, ...}',
    ].join('\n');

    const userPrompt = [
        `Session: ${session} (ET). Trading date: ${todayET}.`,
        '',
        'Measured facts per sector (change % is today\'s session move):',
        JSON.stringify(facts, null, 1),
        '',
        `Write a verdict line for each of these ${facts.length} sectors, in ko/en/ja.`,
        `Return ALL ${facts.length} sector ids — do not omit any: ${facts.map((f: any) => f.id).join(', ')}.`,
        'JSON only, no prose before or after.',
    ].join('\n');

    let parsed: Record<string, { ko?: string; en?: string; ja?: string }> | null = null;
    let model = '';
    try {
        const r = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system,
            userPrompt,
            // 10섹터 × 3개국어 = 넉넉히. 토큰은 남는 자원이고 호출 수가 비싼 자원이다.
            maxTokens: 4000,
            temperature: 0.4,
            jsonPrefill: true,
            label: 'SectorHeadlines',
        });
        model = r.model || '';
        const text = (r.text || '').trim();
        parsed = JSON.parse(text.startsWith('{') ? text : `{${text}`);
    } catch (e: any) {
        // 실패하면 «아무것도 쓰지 않는다». 기존(템플릿) 판정문이 그대로 남아 화면은 안 빈다.
        return NextResponse.json({ success: false, error: `bedrock: ${e?.message}`, ms: Date.now() - t0 }, { status: 502 });
    }

    // ── 4) 검증 — AI 가 준 것 중 «쓸 수 있는 것»만 저장한다 ──
    const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/;
    const out: Record<string, any> = {};
    let kept = 0;
    // «모델이 아예 안 준 것»과 «주긴 줬는데 검증에 걸린 것»을 구분한다.
    //   첫 실행에서 bio_pulse 하나가 빠졌는데, 둘 중 무엇인지 모르면 고칠 수가 없다.
    const missing: string[] = [], rejected: string[] = [];
    for (const f of facts) {
        const v = parsed?.[f.id];
        if (!v) { missing.push(f.id); continue; }
        const ko = String(v?.ko || '').trim(), en = String(v?.en || '').trim(), ja = String(v?.ja || '').trim();
        const why: string[] = [];
        if (ko.length < 12) why.push('ko짧음');
        if (en.length < 16) why.push('en짧음');
        if (ja.length < 8) why.push('ja짧음');
        if (!HANGUL.test(ko)) why.push('ko에한글없음');           // 번역 실패로 영어가 앉는 사고
        if (!KANA.test(ja) && !/[一-鿿]/.test(ja)) why.push('ja에가나·한자없음');
        if (HANGUL.test(en) || HANGUL.test(ja)) why.push('en·ja에한글섞임');
        const bad = why.length > 0;
        if (bad) { rejected.push(`${f.id}(${why.join('/')})`); continue; }
        out[f.id] = { headline: ko, headlineEN: en, headlineJP: ja };
        kept++;
    }
    if (!kept) {
        return NextResponse.json({ success: false, error: 'all rejected', rejected, missing, ms: Date.now() - t0 }, { status: 502 });
    }

    const payload = {
        date: todayET,
        session,
        generatedAt: new Date().toISOString(),
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
