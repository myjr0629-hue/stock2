// ============================================================================
// Guardian News Intelligence — Market-Wide News Digest API
// Polygon News (no ticker = global market news) → Claude AI Analysis/Curation
// Uses macro snapshot context for market-reaction-linked interpretation
// Bedrock Claude 3.5 Haiku — optimized prompt for Claude's strengths
//
// [V2] 5-item batch + accumulate strategy:
//   - Each call: AI processes TOP 5 fresh articles (fast, ~25s)
//   - Merges with existing Redis cache → displays 10 unique items
//   - Cron runs every 15 min → fresher news, no timeout risk
// ============================================================================

import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { publicBase } from '@/lib/net/publicBase';
import { guardYears, yearsIn } from '@/lib/newsYearGuard';

const REDIS_KEY = 'guardian:news:digest:v2'; // v2: flush cache poisoned with English-in-KR/JP fallback (2026-07-14)
/**
 * ★2026-09-22 수리 — 「10개인데 5개만 뜬다」의 원인.
 *
 * 10개는 «저장된 목표치»가 아니라 **누적의 결과**다(BATCH_SIZE 5 × 2회).
 * 그런데 TTL 이 20분, 크론이 15분이라 **여유가 5분뿐**이었다. 크론이 한 번만 어긋나거나
 * (콜드스타트·타임아웃·Vercel 스케줄 흔들림) 실행이 27초를 넘기면 캐시가 먼저 죽고,
 * 다음 실행은 `existingItems = []` 에서 시작해 **5개로 되돌아간다.**
 * 그 다음 실행에서 다시 10개가 되므로 화면은 5↔10 을 오간다 — 대표가 본 것이 그 «5» 쪽이다.
 *
 * 고침: 캐시 수명을 6시간으로 늘린다. 갱신 주기는 그대로 15분이다.
 *   · 누적된 10개가 «한 번의 실패»로 사라지지 않는다.
 *   · 항목은 매 갱신마다 publishedAt 내림차순으로 다시 정렬해 최신 10개만 남으므로,
 *     오래된 것은 새 뉴스에 밀려 자동으로 빠진다(수명이 길다고 낡은 목록이 굳지 않는다).
 *   · 크론이 죽어도 사용자는 «빈 화면»이나 27초 대기 대신 최근 목록을 본다(UI 가 경과분을 표시한다).
 * 분석이 비어 있을 때의 3분 안전밸브는 그대로 둔다.
 */
const REDIS_TTL = 6 * 60 * 60; // 6h — 누적본이 «한 번의 실패»로 무너지지 않게 (갱신은 여전히 15분 크론)
const BATCH_SIZE = 5;       // AI processes 5 items per call (~25s, safe within timeout)
const DISPLAY_SIZE = 10;    // UI shows 10 items total (accumulated from 2 batches)

// Allow Vercel Pro to run up to 60s — Claude needs ~25s for 5 items × 3 languages
export const maxDuration = 60;

// ===== Types =====
export interface NewsDigestItem {
    id: string;
    headline: string;
    summaryKR: string;
    summaryEN: string;
    summaryJP: string;
    analysisKR: string;
    analysisEN: string;
    analysisJP: string;
    category: 'US_MARKET' | 'GLOBAL' | 'GEOPOLITICAL' | 'MACRO' | 'SECTOR';
    impact: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
    urgency: number;
    source: string;
    publishedAt: string;
    publishedAtET: string;
    ageMinutes: number;
    _rawTitleKey?: string;  // Original article title key for accurate dedup
    _srcYears?: string[];   // 원문(제목·요약)에 있던 연도 — 캐시에서 나갈 때도 연도 검사를 하려고 저장
}

// 원문에 없는 연도를 걷어낸다(고칠 수 없으면 항목 제외). 규칙·실측 사례는 lib/newsYearGuard.ts.
function guardItems(items: NewsDigestItem[], where: string, srcTextOf?: (it: NewsDigestItem) => string | undefined): NewsDigestItem[] {
    const out: NewsDigestItem[] = [];
    for (const it of items) {
        const r = guardYears(it, srcTextOf?.(it));
        if (r.fixed.length) console.warn(`[NewsDigest] ${where}: 원문에 없는 연도를 지움 ${r.fixed.join(' ')} (${it.id})`);
        if (!r.item) { console.warn(`[NewsDigest] ${where}: 원문에 없는 연도 → 항목 제외 ${r.dropped} (${it.id})`); continue; }
        out.push(r.item);
    }
    return out;
}

export interface NewsDigest {
    items: NewsDigestItem[];
    generatedAt: string;
    generatedAtET: string;
    nextRefreshAt: string;
    marketContext: string;
    _source: 'fresh' | 'cached' | 'accumulated';
}

// ===== Time Helpers =====
function formatET(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function getAgeMinutes(iso: string): number {
    return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

// ===== Title key for dedup =====
function titleKey(title: string): string {
    return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
}

// ===== Fetch Market-Wide News from Polygon =====
async function fetchMarketNews(limit: number = 30): Promise<any[]> {
    try {
        const endpoint = `/v2/reference/news?limit=${limit}&order=desc&sort=published_utc`;
        const data = await fetchMassive(endpoint, {}, true, undefined, CACHE_POLICY.DISPLAY_NEWS);
        return data?.results || [];
    } catch (e) {
        console.error('[NewsDigest] Polygon fetch failed:', e);
        return [];
    }
}

// ===== Fetch Macro/Geopolitical News from FMP =====
const FMP_API_KEY = process.env.FMP_API_KEY || '';
async function fetchFMPGeneralNews(limit: number = 15): Promise<any[]> {
    if (!FMP_API_KEY) return [];
    try {
        const res = await fetch(
            `https://financialmodelingprep.com/stable/news/general-latest?limit=${limit}&apikey=${FMP_API_KEY}`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((n: any) => ({
            id: `fmp-${n.url?.slice(-20) || Math.random()}`,
            title: n.title || '',
            description: n.text?.substring(0, 300) || '',
            published_utc: n.publishedDate || new Date().toISOString(),
            publisher: { name: n.site || 'FMP' },
            _source: 'fmp',
        }));
    } catch (e) {
        console.error('[NewsDigest] FMP fetch failed:', e);
        return [];
    }
}

// ===== Fetch fast-moving market headlines (FMP stock feed) =====
//
// ★2026-09-23 추가한 이유 — 「너무 과거 뉴스만 나온다」(대표 지적)의 «원인»:
//   장중 11:49 ET 에 재생성한 다이제스트의 최신 기사가 **270분(4.5시간) 전**이었다.
//   장이 열려 있는데 4시간 반 동안 새 기사가 0건일 수는 없다 — 즉 «고르는 쪽»이 아니라
//   «들어오는 쪽»이 막혀 있었다. 우리가 보던 풀은 `news/general-latest` 하나뿐인데,
//   그건 FMP 의 «일반·논평» 피드라 갱신이 느리다(Seeking Alpha·유튜브 영상 위주).
//   분 단위로 움직이는 시장 헤드라인은 `news/stock-latest` 에 들어온다.
//
//   그래서 풀을 늘린다. 최종 목록은 publishedAt 내림차순으로 자르므로
//   풀이 넓어져서 «더 오래된» 기사가 올라올 일은 없다 — 늘어나는 건 최신 쪽뿐이다.
async function fetchFMPStockNews(limit: number = 30): Promise<any[]> {
    return fmpNewsPool('news/stock-latest', limit, 'fmp-stock');
}

async function fmpNewsPool(path: string, limit: number, tag: string): Promise<any[]> {
    if (!FMP_API_KEY) return [];
    try {
        const res = await fetch(
            `https://financialmodelingprep.com/stable/${path}?limit=${limit}&apikey=${FMP_API_KEY}`,
            { signal: AbortSignal.timeout(8000), cache: 'no-store' }
        );
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((n: any) => ({
            id: `${tag}-${n.url?.slice(-20) || Math.random()}`,
            title: n.title || '',
            description: n.text?.substring(0, 300) || '',
            published_utc: n.publishedDate || new Date().toISOString(),
            publisher: { name: n.publisher || n.site || 'FMP' },
            tickers: n.symbol ? [n.symbol] : [],
            _source: tag,
        }));
    } catch (e) {
        console.error(`[NewsDigest] ${tag} fetch failed:`, e);
        return [];
    }
}

// ===== 공개 RSS 원본 — «지연 없는» 시장 헤드라인 ==========================
//
// ★2026-09-23 실측이 범인을 지목했다.
//   `?debug=sources` 로 풀별 최신 경과분을 재 보니 **세 풀이 전부 248~249분**이었다:
//       polygon 249분 · fmpGeneral 249분 · fmpStock 248분
//   서로 다른 엔드포인트가 «같은 4시간»만큼 늦다 = 우리가 고르는 방식의 문제가 아니라
//   **벤더(FMP)의 뉴스가 통째로 4시간 지연**이라는 뜻이다. 프롬프트를 아무리 조여도
//   들어오는 기사가 4시간 전 것이면 화면은 4시간 전 뉴스만 보여 준다.
//
//   그리고 §벤더는-공개-원본을-재포장한다 가 그대로 맞았다. 같은 순간 실측:
//       Google News 1분 · CNBC 6분 · MarketWatch 8분 · Yahoo Finance 9분
//   전부 **키 없이·무료로** 열리는 공개 RSS 다. 벤더가 이 원본들을 4시간 늦게 재포장해 팔고 있었다.
//
//   그래서 원본을 직접 읽는다. FMP 풀은 그대로 둔다 — 최종 목록은 최신순 절단이라
//   느린 풀이 섞여도 밀려날 뿐이고, RSS 가 죽는 날의 안전망이 된다.
const RSS_FEEDS: Array<{ tag: string; url: string; limit: number }> = [
    { tag: 'cnbc', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', limit: 20 },
    { tag: 'marketwatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', limit: 12 },
    { tag: 'yahoo', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US', limit: 15 },
    // 지정학·거시까지 폭을 넓히는 집계기. 블로그성 기사가 섞이므로 건수를 적게 잡는다.
    { tag: 'gnews', url: 'https://news.google.com/rss/search?q=(stock+market+OR+Federal+Reserve+OR+Treasury+yields+OR+oil+prices)+when:3h&hl=en-US&gl=US&ceid=US:en', limit: 15 },
];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s: string): string {
    return (s || '')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[String(n).toLowerCase()] ?? m);
}
function stripTags(s: string): string {
    return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function pick(item: string, tag: string): string {
    const m = item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
    return m ? decodeEntities(m[1].trim()) : '';
}

async function fetchRssPool(tag: string, url: string, limit: number): Promise<any[]> {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
            headers: { 'user-agent': 'Mozilla/5.0 (compatible; SignumNews/1.0; +https://www.signumhq.com)' },
        });
        if (!res.ok) return [];
        const xml = await res.text();
        const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(m => m[0]);
        const out: any[] = [];
        for (const it of items) {
            const rawTitle = pick(it, 'title');
            const ms = Date.parse(pick(it, 'pubDate'));
            if (!rawTitle || !Number.isFinite(ms)) continue;
            // 구글 뉴스는 제목 끝에 « - 매체명»을 붙인다. 매체명은 source 태그가 정본이다.
            const srcTag = pick(it, 'source');
            const dash = rawTitle.lastIndexOf(' - ');
            const title = (tag === 'gnews' && dash > 20) ? rawTitle.slice(0, dash) : rawTitle;
            const link = pick(it, 'link');
            out.push({
                id: `${tag}-${(link || title).slice(-24)}`,
                title,
                description: stripTags(pick(it, 'description')).slice(0, 300),
                published_utc: new Date(ms).toISOString(),
                publisher: { name: srcTag || (tag === 'cnbc' ? 'CNBC' : tag === 'marketwatch' ? 'MarketWatch' : tag === 'yahoo' ? 'Yahoo Finance' : 'News') },
                _source: tag,
            });
            if (out.length >= limit) break;
        }
        return out;
    } catch (e) {
        console.error(`[NewsDigest] RSS ${tag} failed:`, e);
        return [];
    }
}

// ===== Merge & Deduplicate raw articles =====
function mergeAndDeduplicate(...pools: any[][]): any[] {
    const all = pools.flat();
    all.sort((a, b) => new Date(b.published_utc || 0).getTime() - new Date(a.published_utc || 0).getTime());
    const seen = new Set<string>();
    return all.filter(n => {
        const key = titleKey(n.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ===== Deduplicate digest items by headline + raw title key =====
function deduplicateItems(items: NewsDigestItem[]): NewsDigestItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
        // Check both Claude-rewritten headline AND original article title
        const headlineKey = titleKey(item.headline);
        const rawKey = item._rawTitleKey || '';
        if (seen.has(headlineKey) || (rawKey && seen.has(rawKey))) return false;
        seen.add(headlineKey);
        if (rawKey) seen.add(rawKey);
        return true;
    });
}

// ===== Fetch Macro Context for AI =====
async function getMacroContext(baseUrl: string): Promise<string> {
    try {
        const res = await fetch(`${baseUrl}/api/market/macro`, {
            signal: AbortSignal.timeout(5000),
            ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                ? { headers: { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } }
                : {}),
        });
        if (!res.ok) return '';
        const macro = await res.json();
        const f = macro.factors;
        const parts: string[] = [];
        if (f?.nasdaq100?.level) parts.push(`NASDAQ 100: ${f.nasdaq100.level.toFixed(0)} (${f.nasdaq100.chgPct >= 0 ? '+' : ''}${f.nasdaq100.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.spx?.level) parts.push(`S&P 500: ${f.spx.level.toFixed(0)} (${f.spx.chgPct >= 0 ? '+' : ''}${f.spx.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.vix?.level) parts.push(`VIX: ${f.vix.level.toFixed(1)} (${f.vix.chgPct >= 0 ? '+' : ''}${f.vix.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.us10y?.level) parts.push(`US 10Y: ${f.us10y.level.toFixed(2)}% (${f.us10y.chgPct >= 0 ? '+' : ''}${f.us10y.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.oil?.level) parts.push(`Oil: $${f.oil.level.toFixed(1)} (${f.oil.chgPct >= 0 ? '+' : ''}${f.oil.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.gold?.level) parts.push(`Gold: $${f.gold.level.toFixed(0)} (${f.gold.chgPct >= 0 ? '+' : ''}${f.gold.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.dxy?.level) parts.push(`DXY: ${f.dxy.level.toFixed(1)} (${f.dxy.chgPct >= 0 ? '+' : ''}${f.dxy.chgPct?.toFixed(2) || '0'}%)`);
        if (f?.btc?.level) parts.push(`BTC: $${f.btc.level.toFixed(0)} (${f.btc.chgPct >= 0 ? '+' : ''}${f.btc.chgPct?.toFixed(2) || '0'}%)`);
        return parts.join(' | ');
    } catch {
        return '';
    }
}

// ===== Claude AI Analysis (Bedrock) =====
const SYSTEM_PROMPT = `You are a top-tier macro strategist at a Bloomberg-class institutional terminal.
Your role: CURATE the most impactful global market news and provide institutional-grade analysis.

<persona>
- Write Korean (한국어) in authoritative 전문 투자 분석가 tone — use expressions like "~에 주목할 필요가 있습니다", "~할 가능성을 시사합니다", "~에 대한 재평가가 불가피합니다"
- Write Japanese (日本語) in 金融プロフェッショナル tone — formal 「です・ます」 with precise financial terminology
- Write English in concise Bloomberg-wire professional style
- NEVER use machine-translation patterns. Each language must feel native.
</persona>

<compliance>
- Do NOT provide specific trading recommendations (buy/sell/hold)
- Use conditional language: "may indicate", "suggests potential", "watch for"
- Analysis format: conditional cause-and-effect connecting news to market data
- OBSERVER ONLY: Use "observed", "noted", "indicates" — NEVER "will", "should", "recommended"
- ALL sentences describe CURRENT or PAST conditions — NEVER predict future outcomes
</compliance>

<analysis_format>
- English analysis: use "IF → THEN" format (e.g. "IF X happens, THEN Y may follow")
- Korean analysis (analysisKR): use native Korean conditional — "만약 ~한다면, ~할 수 있습니다" or "~이/가 지속된다면, ~에 대한 재평가가 불가피합니다". Do NOT write "IF", "THEN" in English.
- Japanese analysis (analysisJP): use native Japanese conditional — "もし～が継続すれば、～の可能性があります" or "～であれば、～が予想されます". Do NOT write "IF", "THEN" in English.
</analysis_format>

<output_rules>
- Select EXACTLY TOP ${BATCH_SIZE} news from the provided articles
- RECENCY IS A HARD REQUIREMENT. Every article carries ageMin (minutes since publication).
  · Strongly prefer articles under 180 minutes old.
  · Include an article older than 360 minutes ONLY if it is genuinely major (policy decision,
    geopolitical event, index-level move). Never fill the slate with old commentary.
  · If several articles cover the same event, keep the FRESHEST one, not the longest.
- Among articles of similar freshness, prioritize: geopolitical > macro policy > market-moving > sector rotation > commentary
- NEVER select a routine commentary or explainer piece over a fresher market-moving headline
- MARKET SIGNIFICANCE IS ALSO A HARD REQUIREMENT. The feed now carries general newsroom
  headlines, so freshness alone is no longer a filter. An article qualifies ONLY if a US
  equity/bond/commodity/FX investor would act or re-price on it: index moves, Fed/central-bank
  policy, rates, inflation, earnings, guidance, M&A, regulation, tariffs, energy, war, elections
  WITH a stated market consequence.
  · REJECT even when it is the freshest item: campaign-finance horse-race, consumer
    health/wellness tips, lifestyle, sports, celebrity, crime, weather, human-interest.
  · A story about a public company or a traded commodity qualifies; a story that merely
    mentions politics or a disease does not.
  · If fewer than ${BATCH_SIZE} articles qualify, reach further down the list for older but
    genuinely market-relevant ones rather than filling slots with off-topic fresh headlines.
- DEDUPLICATE: same event → keep most detailed article only
- Each summary: 1-2 concise sentences with key facts and numbers
- Each analysis: exactly 1 dense conditional sentence — no filler words — MUST reference provided market data
- urgency 1-10: 8+ only for BREAKING (<60 min old + extreme keywords: crash/halt/war/collapse/default)
</output_rules>`;

async function analyzeWithClaude(articles: any[], macroContext: string): Promise<NewsDigestItem[]> {
    // 후보창 20 → 28. 풀이 «분 단위»로 신선해진 뒤로는 상위 20이 전부 몇 분 전 기사라서
    // AI 가 «관련 없는 최신 기사»를 거절할 여지가 없었다(정치자금·건강기사가 뽑혔다).
    // 후보를 넓혀야 거절하고도 5건을 채울 수 있다.
    const inputItems = articles.slice(0, 28).map((a, i) => ({
        id: a.id || `news-${i}`,
        title: a.title || '',
        desc: (a.description || '').substring(0, 200),
        source: a.publisher?.name || '',
        published: a.published_utc || '',
        ageMin: getAgeMinutes(a.published_utc || new Date().toISOString()),
    }));

    const userPrompt = `<market_data>
${macroContext || 'Market data unavailable — weekend/holiday'}
</market_data>

<articles count="${inputItems.length}">
${JSON.stringify(inputItems)}
</articles>

Select TOP ${BATCH_SIZE} and output as JSON array with this exact schema per item:
{"id","headline","summaryKR","summaryEN","summaryJP","analysisKR","analysisEN","analysisJP","category":"US_MARKET|GLOBAL|GEOPOLITICAL|MACRO|SECTOR","impact":"BULLISH|BEARISH|MIXED|NEUTRAL","urgency":1-10}

Output ONLY the JSON array — no explanation, no markdown.`;

    try {
        const t0 = Date.now();
        const bedrockResult = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: SYSTEM_PROMPT,
            userPrompt,
            maxTokens: 8192,   // 5 items × 3 langs × (summary+analysis); KR/JP are token-heavy → 4096 truncated → parse failed → English fallback
            temperature: 0.3,
            timeoutMs: 45000,  // 45s — plenty for 5 items
            jsonPrefill: false,
            fallbackModel: null,
            label: 'NewsDigest-Batch5',
        });

        // [FIX 2026-07-14] Robust extraction. The old parser prepended '[' whenever the text
        // didn't start with '[', which corrupted any response with a preamble ("Here is the
        // array: [...]") → JSON.parse threw → the catch below silently wrote ENGLISH into
        // summaryKR/JP for the whole batch, and that English got cached/accumulated (why the
        // News Pulse showed English in Korean/Japanese). Also 4096 tokens truncated big KR/JP
        // batches → same failure. Now: strip fences, slice from the first '[', and if the array
        // is truncated recover up to the last complete object instead of failing the batch.
        let json = bedrockResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const start = json.indexOf('[');
        if (start < 0) throw new Error('No JSON array in Claude response');
        json = json.slice(start);
        let parsed: any[];
        try {
            parsed = JSON.parse(json) as any[];
        } catch {
            const lastObj = json.lastIndexOf('}');
            if (lastObj < 0) throw new Error('Unparseable Claude response');
            parsed = JSON.parse(json.slice(0, lastObj + 1) + ']') as any[];
        }
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty Claude response');
        console.log(`[NewsDigest] Claude: ${parsed.length} items in ${Date.now() - t0}ms (model: ${bedrockResult.model})`);

        return guardItems(parsed.map((item, i) => {
            const matchedArticle = articles.find(a => a.id === item.id) || articles[i];
            return {
                id: item.id || `digest-${i}`,
                headline: item.headline || matchedArticle?.title || 'No Title',
                summaryKR: item.summaryKR || '',
                summaryEN: item.summaryEN || '',
                summaryJP: item.summaryJP || '',
                analysisKR: item.analysisKR || '',
                analysisEN: item.analysisEN || '',
                analysisJP: item.analysisJP || '',
                category: item.category || 'US_MARKET',
                impact: item.impact || 'NEUTRAL',
                urgency: Math.min(10, Math.max(1, item.urgency || 3)),
                source: matchedArticle?.publisher?.name || item.source || 'Unknown',
                publishedAt: matchedArticle?.published_utc || new Date().toISOString(),
                publishedAtET: formatET(matchedArticle?.published_utc || new Date().toISOString()),
                ageMinutes: getAgeMinutes(matchedArticle?.published_utc || new Date().toISOString()),
                _rawTitleKey: titleKey(matchedArticle?.title || ''),  // Store original for dedup
                _srcYears: yearsIn(`${matchedArticle?.title || ''} ${matchedArticle?.description || ''}`),
            };
        }), '새 항목');
    } catch (e) {
        console.error('[NewsDigest] Claude analysis failed:', e);
        // Fallback: return raw top items without AI
        return articles.slice(0, BATCH_SIZE).map((a, i) => ({
            id: a.id || `news-${i}`,
            headline: a.title || 'No Title',
            // ⚠️ 한국어·일본어 칸에 **영어를 넣지 않는다.** 예전엔 원문을 그대로 채워
            //    「번역된 척」하는 항목이 만들어졌고, 그게 캐시에 쌓여 한국어 화면에
            //    영어가 떴다. 비워 두면 forLocale 이 걸러 내고 다음 주기에 다시 시도된다.
            summaryKR: '',
            summaryEN: a.description?.substring(0, 120) || a.title,
            summaryJP: '',
            analysisKR: '', analysisEN: '', analysisJP: '',
            category: 'US_MARKET' as const,
            impact: 'NEUTRAL' as const,
            urgency: 3,
            source: a.publisher?.name || 'Unknown',
            publishedAt: a.published_utc || new Date().toISOString(),
            publishedAtET: formatET(a.published_utc || new Date().toISOString()),
            ageMinutes: getAgeMinutes(a.published_utc || new Date().toISOString()),
            _rawTitleKey: titleKey(a.title || ''),
        }));
    }
}

// ============================================================================
// 요청한 «그 언어로 읽을 수 있는 것»만 내보낸다 — 응답 직전에 거른다.
// ----------------------------------------------------------------------------
// 왜 (2026-09-03 실측): 한국어 UI 인데 뉴스 펄스에 영어 원문이 떴다.
//   화면 코드는 `summaryKR || summaryEN` 이라 한국어가 비면 **조용히 영어로 대체**한다.
//   서버에도 필터가 있었지만 두 군데가 새고 있었다:
//     ① 캐시로 나가는 경로에는 필터가 아예 없었다 (아래 cached 반환)
//     ② 「3개 미만이면 필터를 포기한다」는 안전밸브가 영어를 통과시켰다
//   그래서 «늦게라도 한국어로 바뀌는» 증상이 됐다 — 새 AI 배치가 덮을 때까지 영어였다.
//
// 캐시에는 3개 언어를 모두 담아 두고, **거르는 건 응답 직전에** 한다.
// 그래야 영어 사용자의 목록이 한국어 사정 때문에 줄지 않는다.
// 하나도 안 남으면 빈 배열을 준다 — 화면이 「뉴스를 불러오는 중…」을 보여주므로
// 깨지지 않고, 다음 주기에 다시 채워진다. **틀린 언어보다 낫다.**
// ============================================================================
const HAS_KO = /[가-힣]/;
const HAS_JA = /[ぁ-ゟ゠-ヿ]/;   // 가나 — 일본어엔 항상 있고 영어·한국어엔 없다

function readableIn(it: NewsDigestItem, locale: string): boolean {
    if (locale === 'ko') return HAS_KO.test(it.summaryKR || '');
    if (locale === 'ja') return HAS_JA.test(it.summaryJP || '');
    return !!(it.summaryEN || '').trim();
}

function forLocale(items: NewsDigestItem[], locale: string): NewsDigestItem[] {
    return items.filter(it => readableIn(it, locale));
}

// ===== Main API Handler =====
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const debugSources = searchParams.get('debug') === 'sources';
    const forceRefresh = searchParams.get('refresh') === '1' || debugSources;
    const isUrgent = searchParams.get('urgent') === '1';
    const rawLocale = (searchParams.get('locale') || 'en').toLowerCase();
    const locale = rawLocale.startsWith('ko') ? 'ko' : rawLocale.startsWith('ja') ? 'ja' : 'en';

    // Step 1: Load existing cache (always — we need it for accumulation)
    let existingDigest: NewsDigest | null = null;
    try {
        existingDigest = await getFromCache<NewsDigest>(REDIS_KEY);
    } catch { /* ignore cache miss */ }

    // Return cached if not refreshing and cache has items
    if (!forceRefresh && !isUrgent && existingDigest && existingDigest.items?.length > 0) {
        // ★2026-09-23 — 신선도를 «크론»에 의존하지 않게 한다.
        //   실측: 캐시 generatedAt 이 2.7시간 전이었다(크론은 15분 주기인데 돌지 않았다).
        //   TTL(6h)은 «누적본을 지키는» 값이지 «얼마나 자주 새로 만드는가»가 아니다. 둘을 분리한다.
        //   화면은 기다리지 않게 즉시 캐시를 주고, 오래됐으면 응답 «후»에 조용히 다시 만든다.
        const ageMin = existingDigest.generatedAt
            ? Math.floor((Date.now() - Date.parse(existingDigest.generatedAt)) / 60000) : 9999;
        if (ageMin > 20) {
            const self = publicBase(req.url.split('/api/')[0]);
            after(() => fetch(`${self}/api/guardian/news-digest?refresh=1&locale=${locale}`,
                { signal: AbortSignal.timeout(90000) }).catch(() => { /* 조용히 — 다음 요청이 다시 시도한다 */ }));
        }
        const items = forLocale(guardItems(existingDigest.items, '캐시 응답'), locale).map(it => ({
            ...it,
            ageMinutes: getAgeMinutes(it.publishedAt),
        }));
        // 그 언어로 읽을 게 하나도 없으면 캐시를 믿지 말고 아래에서 새로 만든다.
        if (items.length > 0) {
            return NextResponse.json({ ...existingDigest, items, _source: 'cached', _locale: locale });
        }
        console.warn(`[NewsDigest] 캐시에 ${locale} 로 읽을 항목이 없다 — 새로 만든다`);
    }

    // Step 2: Fetch fresh articles from BOTH sources
    const baseUrl = publicBase(req.url.split('/api/')[0]); // self-call must hit public domain, not the protected cron origin
    const t0 = Date.now();
    const [polygonArticles, fmpArticles, stockArticles, rssPools, macroContext] = await Promise.all([
        fetchMarketNews(30),
        fetchFMPGeneralNews(15),
        fetchFMPStockNews(40),
        Promise.all(RSS_FEEDS.map(f => fetchRssPool(f.tag, f.url, f.limit))),
        getMacroContext(baseUrl),
    ]);
    const newest = (arr: any[]) => (arr.length
        ? Math.min(...arr.map(a => getAgeMinutes(a.published_utc)))
        : -1);
    console.log(`[NewsDigest] Fetch done in ${Date.now() - t0}ms: `
        + `Polygon=${polygonArticles.length}(최신 ${newest(polygonArticles)}분) `
        + `FMPgeneral=${fmpArticles.length}(${newest(fmpArticles)}분) `
        + `FMPstock=${stockArticles.length}(${newest(stockArticles)}분) `
        + RSS_FEEDS.map((f, i) => `${f.tag}=${rssPools[i].length}(${newest(rssPools[i])}분)`).join(' '));

    const articles = mergeAndDeduplicate(polygonArticles, fmpArticles, stockArticles, ...rssPools);

    // 풀별 신선도를 «밖에서» 잴 수 있게 한다 — 안 그러면 「왜 옛날 뉴스냐」를 매번 짐작하게 된다.
    if (debugSources) {
        const top = (arr: any[]) => arr.slice(0, 3).map(a => `${getAgeMinutes(a.published_utc)}분 ${String(a.title).slice(0, 70)}`);
        const pools: Record<string, any> = {
            polygon: { n: polygonArticles.length, newestMin: newest(polygonArticles), top: top(polygonArticles) },
            fmpGeneral: { n: fmpArticles.length, newestMin: newest(fmpArticles), top: top(fmpArticles) },
            fmpStock: { n: stockArticles.length, newestMin: newest(stockArticles), top: top(stockArticles) },
        };
        RSS_FEEDS.forEach((f, i) => {
            pools[f.tag] = { n: rssPools[i].length, newestMin: newest(rssPools[i]), top: top(rssPools[i]) };
        });
        return NextResponse.json({ pools, merged: { n: articles.length, newestMin: newest(articles), top: top(articles) } });
    }

    if (articles.length === 0) {
        return NextResponse.json({ items: [], error: 'No news available', _source: 'empty' });
    }

    // Step 3: Filter out articles already in cache (avoid duplicates)
    // Use BOTH Claude-rewritten headline AND original raw title key for matching
    // 연도 검사로 빠진 캐시 항목은 «이미 있음»에서도 빠진다 → 날짜가 박힌 새 프롬프트로 다시 만들어질 기회를 준다.
    const guardedExisting = guardItems(existingDigest?.items || [], '누적');
    const existingKeys = new Set<string>();
    guardedExisting.forEach(it => {
        existingKeys.add(titleKey(it.headline));
        if (it._rawTitleKey) existingKeys.add(it._rawTitleKey);
    });
    const freshArticles = articles.filter(a => !existingKeys.has(titleKey(a.title)));
    console.log(`[NewsDigest] Fresh articles: ${freshArticles.length} (filtered ${articles.length - freshArticles.length} duplicates)${isUrgent ? ' [URGENT/VIX]' : ''}`);

    // Step 4: AI Analysis — only 5 fresh items (fast, ~25s)
    let newItems: NewsDigestItem[] = [];
    if (freshArticles.length > 0) {
        const t1 = Date.now();
        newItems = await analyzeWithClaude(freshArticles, macroContext);
        console.log(`[NewsDigest] AI done in ${Date.now() - t1}ms: ${newItems.length} new items`);
    } else {
        console.log('[NewsDigest] No fresh articles — keeping existing cache');
    }

    // Step 5: Accumulate — merge new + existing, keep latest 10 unique
    const existingItems = guardedExisting;
    const allItems = [...newItems, ...existingItems]; // New first (higher priority)
    const uniqueItems = deduplicateItems(allItems);

    // [FIX 2026-07-14] Never surface a translation-failed item. When an AI batch falls back
    // (summaryKR/JP = raw English), those items would render English under KO/JA UI.
    //
    // [2026-09-03] 예전엔 여기서 «3개 미만이면 필터를 포기»했다. 그 안전밸브가
    //   영어 항목을 캐시까지 통과시켰고, 한국어 화면에 영어가 뜨는 원인이 됐다.
    //   이제 캐시에는 **3개 언어를 다 담고**, 거르는 건 응답 직전(forLocale)에 한다.
    //   그래서 여기서는 「셋 중 하나라도 번역된 것」만 남기면 된다 — 완전 실패 항목은
    //   저장하지 않아야 다음 주기에 다시 시도된다.
    const translated = uniqueItems.filter(it =>
        HAS_KO.test(it.summaryKR || '') || HAS_JA.test(it.summaryJP || ''));
    const keep = translated.length > 0 ? translated : uniqueItems;
    // ★2026-09-23 — 「8시간 전 뉴스만 뜬다」 수리.
    //   누적은 옛 항목을 계속 살려 두는데, 새 항목이 5개씩만 들어오고 AI 가 «영향력»만 보고 고르면
    //   낡은 거시 논평이 신선한 시장 헤드라인을 계속 이긴다. 그래서 «나이 상한»을 둔다.
    //   상한을 넘겨 10개가 안 되면 그건 «채우지 못한 것»이 아니라 «낡은 걸 안 보여준 것»이다.
    const MAX_AGE_MIN = 18 * 60; // 18시간 — 주말·휴장에도 화면이 비지 않을 만큼만 남긴다
    const sorted = keep
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const fresh = sorted.filter(it => getAgeMinutes(it.publishedAt) <= MAX_AGE_MIN);
    const displayItems = (fresh.length >= 3 ? fresh : sorted)   // 다 낡았으면 빈 화면보다 낫다
        .slice(0, DISPLAY_SIZE)
        .map(it => ({ ...it, ageMinutes: getAgeMinutes(it.publishedAt) }));

    // Step 6: Build digest
    const now = new Date();
    const digest: NewsDigest = {
        items: displayItems,
        generatedAt: now.toISOString(),
        generatedAtET: formatET(now.toISOString()),
        nextRefreshAt: new Date(now.getTime() + 15 * 60000).toISOString(),
        marketContext: macroContext,
        _source: existingItems.length > 0 && newItems.length > 0 ? 'accumulated' : 'fresh',
    };

    // Step 7: Save to Redis
    const hasAnalysis = displayItems.some(it => it.analysisEN && it.analysisEN.length > 0);
    try {
        const ttl = hasAnalysis ? REDIS_TTL : 180; // 20min if good, 3min if analysis empty
        await setInCache(REDIS_KEY, digest, ttl);
        console.log(`[NewsDigest] Saved ${displayItems.length} items (new: ${newItems.length}, kept: ${existingItems.length}, TTL: ${ttl}s, analysis: ${hasAnalysis ? 'OK' : 'EMPTY'})`);
    } catch (e) {
        console.warn('[NewsDigest] Redis save failed:', e);
    }

    // 캐시에는 3개 언어를 다 담고, 응답은 요청한 언어로만 준다.
    return NextResponse.json({
        ...digest,
        items: forLocale(displayItems, locale),
        _locale: locale,
    });
}
