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
    '- Idioms and market terms are NOT literal. Use the phrase Korean/Japanese investors actually use:',
    '    all-time high → 사상 최고치 (NOT 전시간 고점) · 史上最高値',
    '    guilty by association → 연좌·동반 하락 (NOT 유죄)',
    '    outpacing → 앞서다·상회 · take-or-pay → 테이크 오어 페이',
    '    walking a tightrope → 줄타기·아슬아슬한 균형 (NOT 긴장 상태)',
    '    bucks the trend → 흐름을 거스르다 · headwind/tailwind → 역풍/순풍',
    '  Translate the MEANING for an investor, never word by word.',
    '- Company/product names WITHOUT an established Korean/Japanese form stay in ENGLISH.',
    '    Groq → Groq (NOT 구로크) · Anthropic → 앤스로픽 · Palantir → 팔란티어',
    '    If you are not certain the Korean form is what investors actually use, keep the English.',
    '- ACRONYMS of institutions are NEVER transliterated by sound. Use the established form:',
    '    DOJ → 미 법무부 / 米司法省 (NOT 도잉)   ·  SEC → 미 증권거래위원회 / 米SEC',
    '    FTC → 미 연방거래위원회   ·  FDA → 미 식품의약국   ·  Fed / FOMC → 연준 / FOMC',
    '    IPO · M&A · EPS · GDP · CPI · AI keep the acronym as-is.',
    '  If you do not know the established Korean/Japanese form, keep the English acronym.',
    '',
    'RULES',
    '- ko: 35-70자 · ja: 25-55자. One sentence. What happened, for THIS ticker.',
    '- impact: "BULLISH" | "BEARISH" | "NEUTRAL" — how the market would read it for this ticker.',
    '- NEVER predict. No 전망/예상/will rise. Report what happened.',
    '- No investment advice. If the headline itself is a buy/sell recommendation, state the FACT it',
    '  reports (who said it, what changed) — never repeat the recommendation.',
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

/**
 * ★ 기관 약어를 «소리나는 대로» 옮긴 것을 잡는다.
 *   실측: "DOJ Probes $20 Billion Groq Deal" → 「**도잉** 조사가 …」.
 *   DOJ 는 미 법무부다. 금융 뉴스에 자주 나오는 약어라 틀리면 뜻이 통째로 바뀐다.
 *   프롬프트에 대응표를 넣었지만 그것만 믿지 않는다.
 */
const BAD_TRANSLITERATIONS = ['도잉', '도제이', '에스이씨', '에프티씨', '에프디에이', '아이피오', '구로크', '그로크'];
function hasBadTransliteration(translated: string): boolean {
    return BAD_TRANSLITERATIONS.some((w) => translated.includes(w));
}

/**
 * ★ 번역문에 «매매 권유»가 남아 있으면 버린다.
 *   헤드라인 필터를 넓혔지만 원문 표현은 무한하다. 두 겹으로 막는다 —
 *   걸리면 그 항목만 영어 원문으로 떨어지므로 화면은 비지 않는다.
 */
const ADVICE_RE = new RegExp([
    '매수\\s*(기회|타이밍|시점|추천)', '매도\\s*(추천|시점)',
    // ★ 「투자자들이 둘 다 **매수해야 한다**」가 첫 판을 통과했다 — 어미 변형을 넓힌다
    '(매수|매도|투자|보유)\\s*해야\\s*(한다|합니다|할)',
    '사야\\s*(한다|할|합니다)', '팔아야\\s*(한다|할|합니다)',
    '담아야', '저가\\s*매수', '하락\\s*매수', '지금\\s*사',
    '(사|살)\\s*(때|타이밍)', '주목할\\s*만한\\s*매수',
    '買い(場|時)', '売り時', '今が買い', '買うべき', '売るべき',
].join('|'));
function hasAdvice(translated: string): boolean {
    return ADVICE_RE.test(translated);
}
/**
 * 예측 표현. 실측으로 계속 새 형태가 나와 넓혀 왔다.
 *   「지속될 것으로 예상됨」 — 첫 정규식(예상\s*됩니다)이 «예상됨»을 못 잡았다.
 *   금융 앱에서 예측은 규정 위험이라 조사·어미 변형까지 포괄한다.
 */
const PREDICT = /전망|예상\s*(됩니다|된다|됨|되며|상회)|것으로\s*(예상|전망)|상회할|하회할|will\s+(rise|fall|beat|miss|continue)|expected\s+to|予想され/i;

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

    const cacheKey = `ticker-news:v7:${ticker}`;
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

    /**
     * ★ 원문 헤드라인 자체가 «예측 기사»면 아예 싣지 않는다.
     *   실측: "Prediction: Apple Stock Could Be Headed for a Big Move" →
     *   번역은 정확했지만(「예측: …」) **우리 앱은 예측을 싣지 않는다**(규정 위험).
     *   번역 단계에서 막을 일이 아니라 **고르는 단계에서 빼야** 하는 것이다.
     */
    //   ★ 2차 실측: 예측 필터를 통과한 «투자 권유» 기사가 그대로 실렸다.
    //       "Alphabet's Decline Is a Clear Buying Opportunity" → 「분명한 매수 기회입니다」
    //       "Is September a Buy-the-Dip Month?"                → 「하락 매수의 달일까요?」
    //     예측(무엇이 일어날까)과 권유(사라/팔라)는 다른 것이라 정규식도 따로 필요하다.
    //     우리는 둘 다 싣지 않는다.
    const FORECAST_HEADLINE = new RegExp([
        // ① 예측물
        "^\\s*(prediction|forecast|outlook)\\b",
        "\\b(price target|could (be )?(headed|soar|surge|plunge|jump|crash))\\b",
        "\\bhere'?s why .* (will|could)\\b",
        // ② 투자 권유·매매 판단
        "\\b(buy|sell|hold) (now|this|these|the dip)\\b",
        "\\bbuy[- ]the[- ]dip\\b",
        "\\b(is it time to|should you|why you should|reasons? to) (buy|sell|own|hold)\\b",
        "\\b(buy or sell|screaming buy|no[- ]brainer|must[- ]own|table[- ]pounding)\\b",
        "\\b(buying|selling) opportunity\\b",
        "\\b(top|best) \\d+ .* (stocks?|picks?) to (buy|own)\\b",
        "\\bstock to buy\\b",
    ].join('|'), 'i');
    raw = raw.filter((n: any) => !FORECAST_HEADLINE.test(String(n.title || '')));
    if (!raw.length) {
        await setInCache(cacheKey, { ticker, items: [], generatedAt: new Date().toISOString() }, 15 * 60).catch(() => {});
        return NextResponse.json({ ticker, items: [], reason: 'all-forecast' });
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
                     && !hasGhostCompany(ko, p.title) && !hasBadTransliteration(ko) && !hasAdvice(ko);
        const okJa = ja.length >= 12 && !HANGUL.test(ja) && (KANA.test(ja) || KANJI.test(ja))
                     && !PREDICT.test(ja) && !hasAdvice(ja);
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
