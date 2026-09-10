// ============================================================================
// 종목별 뉴스 — 앱에 «이 종목 오늘 무슨 일이 있었나»가 아예 없었다.
// ----------------------------------------------------------------------------
// 가디언의 뉴스는 «전체 시장» 뉴스라 종목 태그가 없다. 종목 화면(커맨드)을 열어도
// 그 종목 뉴스는 어디에도 안 나온다. deep-analysis 안에서 재료로만 쓰이고 버려진다.
//
// 왜 여기는 «가벼운 모델»인가 — 실측으로 정했다.
//   같은 날 실적 캘린더에서는 깊이를 요구하자 가벼운 모델이 무너졌다(예측 표현·동어반복).
//   그런데 **뉴스 현지화**는 다르다. 우리 실제 news-digest 프롬프트로 두 모델을 돌린 결과:
//     Nova Lite  3/3 통과 · 8.1초 · $0.000424     ← 숫자·고유명사 오류 없음
//     Haiku      2/3     · 19.9초 · $0.0147
//   번역·요약은 대등하고 35배 싸고 2.5배 빠르다. 그리고 **RPM 200 vs 10** —
//   종목마다 부르는 이 기능은 호출량이 관건이라 이쪽이 구조적으로 맞다.
//   (해석이 필요한 자리는 전부 Haiku 그대로 둔다)
// ============================================================================
import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const LIGHT_MODEL = 'us.amazon.nova-lite-v1:0';
const MAX_ITEMS = 5;

const bedrock = () => new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! }
        : undefined,
    maxAttempts: 2,
});

const SYSTEM = [
    'You localize US market news for a Korean/Japanese stock app, for ONE ticker.',
    'For each item produce: ko, ja (natural native summaries) and impact.',
    '',
    'ACCURACY — this is the hard part. Get it wrong and the app is worthless.',
    '- Every company, product and person named in your output MUST appear in the source headline.',
    '  NEVER introduce a company that is not in the headline. If unsure of a Korean/Japanese form,',
    '  keep the original English spelling.',
    '- Numbers must match exactly ($18 Million = 1,800만 달러).',
    '- Idioms are not literal. "Guilty by association" is 연좌·동반 하락, not 유죄.',
    '  Translate the MEANING for an investor, not word by word.',
    '',
    'RULES',
    '- ko: 35-70자 · ja: 25-55자. One sentence. What happened, for THIS ticker.',
    '- impact: "BULLISH" | "BEARISH" | "NEUTRAL" — how the market would read it for this ticker.',
    '- NEVER predict. No 전망/예상/will rise. Report what happened.',
    '- No investment advice.',
    '- LANGUAGE PURITY: "ko" Korean only, "ja" Japanese only.',
    '',
    'Return ONLY JSON: {"items":[{"id":1,"ko":"..","ja":"..","impact":".."}]}',
].join('\n');

const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;

/**
 * ★ [2026-09-10] «원문에 없는 회사명»을 잡아 낸다.
 *
 *   첫 판 프롬프트에 예시로 「Anthropic→앤스로픽, NVIDIA→엔비디아」를 넣었더니,
 *   모델이 그 예시를 잘못 붙들어 **NVIDIA 를 「앤스로픽」으로 세 번 오역**했다.
 *   길이·언어 검사는 전부 통과했다 — 회사명이 바뀐 것은 형식으로는 안 잡힌다.
 *   프롬프트에서 예시를 걷어내니 0/5 로 잡혔지만, 프롬프트만 믿지 않는다.
 *   원문에 없는 유명 회사명이 번역에 나타나면 그 항목은 버린다(영어 원문으로 떨어진다).
 */
const GHOST_NAMES: [string, string][] = [
    ['앤스로픽', 'anthropic'], ['오픈AI', 'openai'], ['엔비디아', 'nvidia'],
    ['구글', 'google'], ['알파벳', 'alphabet'], ['애플', 'apple'], ['테슬라', 'tesla'],
    ['마이크로소프트', 'microsoft'], ['아마존', 'amazon'], ['메타', 'meta'],
    ['인텔', 'intel'], ['AMD', 'amd'], ['브로드컴', 'broadcom'], ['넷플릭스', 'netflix'],
];
function hasGhostCompany(translated: string, sourceTitle: string): boolean {
    const src = sourceTitle.toLowerCase();
    return GHOST_NAMES.some(([ko, en]) => translated.includes(ko) && !src.includes(en));
}
const PREDICT = /전망|예상\s*(됩니다|된다|상회)|상회할|하회할|will\s+(rise|fall|beat|miss)|予想されます/i;

function ageLabel(iso: string): string {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (!Number.isFinite(h) || h < 0) return '';
    return h < 1 ? 'NOW' : h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export async function GET(req: Request) {
    const t0 = Date.now();
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get('t') || searchParams.get('ticker') || '').toUpperCase().trim();
    if (!/^[A-Z.]{1,6}$/.test(ticker)) {
        return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }

    const cacheKey = `ticker-news:v2:${ticker}`;
    const cached = await getFromCache<any>(cacheKey).catch(() => null);
    if (cached?.items?.length) {
        return NextResponse.json({ ...cached, fromCache: true });
    }

    // ── 1) 그 종목 뉴스를 벤더에서 받는다 ──
    let raw: any[] = [];
    try {
        const r = await fetchMassive('/v2/reference/news',
            { ticker, limit: '10', order: 'desc', sort: 'published_utc' }, true);
        raw = (r?.results || []).filter((n: any) => n?.title);
    } catch (e: any) {
        return NextResponse.json({ ticker, items: [], error: `vendor: ${e?.message}` }, { status: 502 });
    }
    if (!raw.length) {
        // 뉴스가 없는 것은 «정상»이다. 빈 배열을 짧게 캐시해 벤더를 반복해 두드리지 않는다.
        await setInCache(cacheKey, { ticker, items: [], generatedAt: new Date().toISOString() }, 15 * 60).catch(() => {});
        return NextResponse.json({ ticker, items: [], reason: 'no-news' });
    }

    const picked = raw.slice(0, MAX_ITEMS).map((n: any, i: number) => ({
        id: i + 1,
        title: String(n.title || '').slice(0, 220),
        source: n.publisher?.name || '',
        url: n.article_url || n.amp_url || '',
        published: n.published_utc || '',
        age: ageLabel(n.published_utc || ''),
    }));

    // ── 2) 현지화 (가벼운 모델) ──
    let parsed: any = null;
    try {
        const user = [
            `Ticker: ${ticker}`,
            `Headlines (${picked.length}):`,
            JSON.stringify(picked.map((p) => ({ id: p.id, title: p.title, source: p.source })), null, 1),
            'JSON only.',
        ].join('\n');
        const r = await bedrock().send(new ConverseCommand({
            modelId: LIGHT_MODEL,
            system: [{ text: SYSTEM }],
            messages: [{ role: 'user', content: [{ text: user }] }],
            inferenceConfig: { maxTokens: 2000, temperature: 0.3 },
        }));
        const txt = (r.output?.message?.content || []).map((x: any) => x.text || '').join('').trim();
        const m = txt.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : txt);
    } catch {
        // 현지화가 실패해도 «원문 뉴스»는 준다. 화면이 비는 것보다 낫다.
        parsed = null;
    }

    const byId = new Map<number, any>();
    for (const it of (parsed?.items || [])) byId.set(Number(it.id), it);

    const items = picked.map((p) => {
        const ai = byId.get(p.id) || {};
        const ko = String(ai.ko || '').trim(), ja = String(ai.ja || '').trim();
        // 언어별로 따로 판정한다 — 하나가 오염돼도 나머지는 쓴다.
        const okKo = ko.length >= 18 && HANGUL.test(ko) && !PREDICT.test(ko)
                     && !hasGhostCompany(ko, p.title);
        const okJa = ja.length >= 12 && !HANGUL.test(ja) && (KANA.test(ja) || KANJI.test(ja)) && !PREDICT.test(ja);
        const impact = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(String(ai.impact)) ? ai.impact : 'NEUTRAL';
        return {
            id: p.id,
            headline: p.title,          // 영어 원문 = en
            ko: okKo ? ko : '',         // 실패하면 빈 문자열 → 화면이 원문으로 떨어진다
            ja: okJa ? ja : '',
            impact,
            source: p.source,
            url: p.url,
            age: p.age,
            published: p.published,
        };
    });

    const localized = items.filter((x) => x.ko).length;
    const payload = {
        ticker, items, localized,
        generatedAt: new Date().toISOString(),
        ms: Date.now() - t0,
    };
    // 30분. 뉴스는 그보다 빨리 바뀌지 않고, 종목마다 캐시가 따로라 양이 많다.
    await setInCache(cacheKey, payload, 30 * 60).catch(() => {});
    return NextResponse.json({ ...payload, fromCache: false });
}
