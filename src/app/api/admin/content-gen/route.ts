import { NextRequest, NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { getFromCache, mgetFromCache, setInCache } from '@/services/redisClient';

// Vercel Pro: allow up to 60s
export const maxDuration = 60;

const UNIVERSE = ['NVDA','TSLA','AAPL','MSFT','GOOGL','AMZN','META','AMD','PLTR','COIN','SMCI','ARM','MSTR','TSM','AVGO','NFLX','CRM','SNOW','BA','DIS'];

export async function POST(req: NextRequest) {
    try {
        const { email, mode, ticker, platform } = await req.json();
        if (!email) {
            return NextResponse.json({ error: 'Missing email' }, { status: 400 });
        }
        if (!platform || !['naver','tistory','medium','note'].includes(platform)) {
            return NextResponse.json({ error: 'Missing or invalid platform' }, { status: 400 });
        }

        // ─── Gather market data from Redis ───
        let targetTickers: string[] = [];
        let marketContext = '';

        if (mode === 'ticker' && ticker) {
            targetTickers = [ticker.toUpperCase()];
        } else if (mode === 'auto' || mode === 'market') {
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const usedTodayRaw = await getFromCache<string[]>(todayKey);
            const usedToday = usedTodayRaw || [];

            const analysisKeys = UNIVERSE.map(t => `cache:analysis:${t}`);
            const analysisResults = await mgetFromCache<any>(analysisKeys);

            type TickerScore = { ticker: string; score: number; change: number };
            const ranked: TickerScore[] = [];
            for (let i = 0; i < UNIVERSE.length; i++) {
                const d = analysisResults[i];
                if (!d) continue;
                try {
                    const data = typeof d === 'string' ? JSON.parse(d) : d;
                    const change = Math.abs(data.changePct || data.changePercent || 0);
                    const score = (data.score || 0) + change * 2;
                    if (!usedToday.includes(`${UNIVERSE[i]}:${platform}`)) {
                        ranked.push({ ticker: UNIVERSE[i], score, change });
                    }
                } catch {}
            }
            ranked.sort((a, b) => b.score - a.score);

            if (mode === 'auto') {
                targetTickers = ranked.slice(0, 1).map(r => r.ticker);
                if (targetTickers.length === 0) targetTickers = [UNIVERSE[0]];
            } else {
                targetTickers = ranked.slice(0, 2).map(r => r.ticker);
                if (targetTickers.length === 0) targetTickers = UNIVERSE.slice(0, 2);
            }
        }

        // Fetch detailed data
        const tickerDataMap: Record<string, any> = {};
        if (targetTickers.length > 0) {
            const detailKeys = targetTickers.map(t => `cache:command:unified:${t}`);
            const detailResults = await mgetFromCache<any>(detailKeys);
            for (let i = 0; i < targetTickers.length; i++) {
                const d = detailResults[i];
                if (d) tickerDataMap[targetTickers[i]] = typeof d === 'string' ? JSON.parse(d) : d;
            }
        }

        const briefData = await getFromCache<any>('cache:morning-briefing:ko');
        if (briefData) {
            const brief = typeof briefData === 'string' ? JSON.parse(briefData) : briefData;
            marketContext = brief.summary || brief.headline || '';
        }

        // ─── Build AI prompt (single platform only) ───
        const systemPrompt = buildSystemPrompt(platform);
        const userPrompt = buildUserPrompt(mode, targetTickers, tickerDataMap, marketContext, platform);

        const result = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: systemPrompt,
            userPrompt,
            maxTokens: 4096,
            temperature: 0.7,
            jsonPrefill: true,
            label: `ContentCenter-${platform}`,
            timeoutMs: 45000,
        });

        // Parse response
        let parsed: any;
        try {
            parsed = JSON.parse(result.text);
        } catch {
            // Try to repair
            let raw = result.text;
            const jsonStart = raw.indexOf('{');
            if (jsonStart >= 0) raw = raw.substring(jsonStart);
            let inStr = false;
            for (let i = 0; i < raw.length; i++) {
                if (raw[i] === '"' && (i === 0 || raw[i-1] !== '\\')) inStr = !inStr;
            }
            if (inStr) raw += '"';
            const braces: string[] = [];
            for (const ch of raw) {
                if (ch === '{') braces.push('}');
                else if (ch === '[') braces.push(']');
                else if (ch === '}' || ch === ']') braces.pop();
            }
            raw = raw.replace(/,\s*$/, '');
            raw += braces.reverse().join('');
            try {
                parsed = JSON.parse(raw);
            } catch (e2) {
                throw new Error(`JSON parse failed: ${(e2 as Error).message}`);
            }
        }

        // Record history (per-platform dedup)
        {
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const existing = await getFromCache<string[]>(todayKey) || [];
            const historyKey = mode === 'market' ? `market:${platform}` : targetTickers.map(t => `${t}:${platform}`);
            const newItems = Array.isArray(historyKey) ? historyKey : [historyKey];
            const merged = Array.from(new Set([...existing, ...newItems]));
            await setInCache(todayKey, merged, 86400 * 4);
        }

        return NextResponse.json({
            success: true,
            mode,
            platform,
            tickers: targetTickers,
            content: parsed,
            model: result.model,
            elapsedMs: result.elapsedMs,
        });

    } catch (err: any) {
        console.error('[ContentCenter] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ─── System prompts per platform ───
function buildSystemPrompt(platform: string): string {
    const common = `You are SIGNUM HQ's US stock market analysis blog writer.

## Role
- Observer/reviewer tone (NO investment advice, data analysis review only)
- Professional yet easy-to-read writing style
- IMPORTANT: The score metric is called "Context Score" (컨텍스트 스코어). NEVER use "Alpha Score" or "알파 스코어".

## JSON Rules (MUST follow)
- All double quotes inside strings must be escaped: \\"
- Line breaks: \\n (no actual newlines)
- Output ONLY valid JSON, nothing else

## MANDATORY: Image Insertion Tags (CRITICAL - DO NOT SKIP)
You MUST insert exactly 4-5 [IMAGE: description] tags INSIDE the "body" text.
These tags mark where screenshots from signumhq.com will be inserted.
Place them BETWEEN paragraphs at logical points matching the content being discussed.
**IMPORTANT: The [IMAGE: ...] description must ALWAYS be written in Korean (한글), regardless of the blog language.**
Even for English (Medium) or Japanese (note.com) posts, the IMAGE tag description must be in Korean so the admin can understand the placement.

CORRECT example body (English post with Korean IMAGE tags):
"## Introduction\\nSome text about the stock...\\n\\n[IMAGE: NVDA Context Score 대시보드 - 스코어 81점 표시]\\n\\nMore analysis text...\\n\\n[IMAGE: GEX 감마 노출 차트 - NVDA 양수 전환]\\n\\nFurther discussion..."

CORRECT example body (Japanese post with Korean IMAGE tags):
"## はじめに\\n株式の分析...\\n\\n[IMAGE: NVDA Context Score 대시보드 - 스코어 게이지]\\n\\n続きの分析..."

WRONG (IMAGE tag in English or Japanese - THIS IS A FAILURE):
"[IMAGE: NVDA Context Score dashboard showing score of 81]" ← WRONG, must be Korean
"[IMAGE: NVDAのコンテキストスコア]" ← WRONG, must be Korean

Each [IMAGE: ...] tag must describe what screenshot to capture from signumhq.com.
The imageGuide array must match these body tags with exact capture locations.`;

    const rules: Record<string, string> = {
        naver: `## Naver Blog (Korean)
- Paragraphs: 2-3 lines each, short breaks
- Subheadings: use symbols like \\u25a0 or \\u25b6
- Images: [IMAGE: description] 5+ placements
- SEO keywords: Include terms like \\ubbf8\\uad6d\\uc8fc\\uc2dd, GEX\\ubd84\\uc11d, \\ub2e4\\ud06c\\ud480 3-5 times
- Tags: # format, 7-10 tags
- Length: 1500-2500 characters
- End with: "\\ubcf8 \\uae00\\uc740 \\ud22c\\uc790 \\uc870\\uc5b8\\uc774 \\uc544\\ub2cc \\ub370\\uc774\\ud130 \\ubd84\\uc11d \\ub9ac\\ubdf0\\uc774\\uba70, \\ud22c\\uc790\\uc758 \\ucd5c\\uc885 \\ud310\\ub2e8\\uacfc \\ucc45\\uc784\\uc740 \\ud22c\\uc790\\uc790 \\ubcf8\\uc778\\uc5d0\\uac8c \\uc788\\uc2b5\\ub2c8\\ub2e4.\\n\\n\\uc704 \\ub370\\uc774\\ud130\\ub294 SIGNUM HQ\\uc5d0\\uc11c \\uc2e4\\uc2dc\\uac04\\uc73c\\ub85c \\ud655\\uc778\\ud560 \\uc218 \\uc788\\uc2b5\\ub2c8\\ub2e4. \\ubb34\\ub8cc \\ud50c\\ub79c \\uc788\\uc2b5\\ub2c8\\ub2e4.\\n\\ud83d\\udd17 https://www.signumhq.com"`,

        tistory: `## Tistory (Korean)
- Subheadings: ## markdown format
- Images: [IMAGE: description] 4-5 placements
- SEO keywords: \\ubbf8\\uad6d\\uc8fc\\uc2dd, \\uc635\\uc158\\ubd84\\uc11d, \\uae30\\uad00\\ud22c\\uc790\\uc790 3-5 times
- Tags: # format, 7-10 tags
- Length: 1500-2500 characters
- End with: "\\ubcf8 \\uae00\\uc740 \\ud22c\\uc790 \\uc870\\uc5b8\\uc774 \\uc544\\ub2cc \\ub370\\uc774\\ud130 \\ubd84\\uc11d \\ub9ac\\ubdf0\\uc774\\uba70, \\ud22c\\uc790\\uc758 \\ucd5c\\uc885 \\ud310\\ub2e8\\uacfc \\ucc45\\uc784\\uc740 \\ud22c\\uc790\\uc790 \\ubcf8\\uc778\\uc5d0\\uac8c \\uc788\\uc2b5\\ub2c8\\ub2e4.\\n\\n\\uc704 \\ub370\\uc774\\ud130\\ub294 SIGNUM HQ\\uc5d0\\uc11c \\uc2e4\\uc2dc\\uac04\\uc73c\\ub85c \\ud655\\uc778\\ud560 \\uc218 \\uc788\\uc2b5\\ub2c8\\ub2e4. \\ubb34\\ub8cc \\ud50c\\ub79c \\uc788\\uc2b5\\ub2c8\\ub2e4.\\n\\ud83d\\udd17 https://www.signumhq.com"`,

        medium: `## Medium (English only)
- Tone: Data-driven analyst, third-person
- Structure: Hook > Data > Analysis > CTA
- Headers: ## markdown style
- Images: [IMAGE: description] 4-5 points
- SEO: GEX, dark pool, options flow, institutional
- Topics: In the "tags" field, output exactly 5 Medium topics as comma-separated plain text WITHOUT # symbols. Example: "Stock Market, Options Trading, Institutional Investing, Technical Analysis, Market Data"
- Length: 800-1500 words
- End with: "Disclaimer: This article is a data analysis review, not investment advice. All investment decisions and risks are the sole responsibility of the reader.\\n\\nThe above data can be viewed in real-time on SIGNUM HQ. Free plan available.\\n\\ud83d\\udd17 https://www.signumhq.com"`,

        note: `## note.com (Japanese only)
- Tone: Data analysis reviewer, third-person
- Headings: Use ## or special characters
- Images: [IMAGE: description] 4-5 placements
- SEO: Include terms about US stocks, GEX analysis, dark pool, options
- Tags: 5-7 tags with # prefix
- Length: 1000-2000 characters
- End with disclaimer in Japanese about this being a data review, not investment advice. Then add: "\\u4e0a\\u8a18\\u30c7\\u30fc\\u30bf\\u306fSIGNUM HQ\\u3067\\u30ea\\u30a2\\u30eb\\u30bf\\u30a4\\u30e0\\u3067\\u78ba\\u8a8d\\u3067\\u304d\\u307e\\u3059\\u3002\\u7121\\u6599\\u30d7\\u30e9\\u30f3\\u3042\\u308a\\u307e\\u3059\\u3002\\n\\ud83d\\udd17 https://www.signumhq.com"`,
    };

    return `${common}

${rules[platform] || rules.naver}

## Image Guide Rules (CRITICAL)
When placing [IMAGE: description] in the body, provide EXACT capture locations from signumhq.com.

### signumhq.com Dashboard Structure
| Page | URL | Capturable Sections |
|:---|:---|:---|
| Ticker Dashboard | /dashboard/{TICKER} | Context Score gauge, Smart Flow indicator, GEX chart, Dark Pool ratio bar, RSI/MACD chart, Options chain table, Sector heatmap |
| Command Center | /command | AI analysis summary, Universe scoreboard, Ticker comparison table |
| Flow (Options) | /flow | Live options tape, Institutional trade filter, Put/Call ratio chart, Net Premium chart |
| Guardian | /guardian | Portfolio risk matrix, Position P&L, Context tracking chart |
| Intel (AI) | /intel | AI market insights, Event briefing, Composite score analysis |
| Watchlist | /watchlist | Realtime score table, Alert history |

### imageGuide Principles
1. label: Be specific (e.g., "NVDA GEX Gamma Exposure Chart")
2. url: Real page path (e.g., "/dashboard/NVDA")
3. area: Exact capture location (e.g., "Dashboard middle section - GEX chart showing gamma exposure $2.1B area")
4. ONLY recommend screens directly related to data mentioned in the body text
5. Provide 4-6 image guides

## Output (Valid JSON)
{
  "title": "Title text",
  "body": "Body text (use \\\\n for line breaks)",
  "tags": "#tag1 #tag2",
  "imageGuide": [
    { "slot": 1, "label": "NVDA Context Score + Smart Flow", "url": "/dashboard/NVDA", "area": "Dashboard top - Score gauge and Smart Flow bar area capture" }
  ]
}`;
}

function buildUserPrompt(mode: string, tickers: string[], dataMap: Record<string, any>, marketContext: string, platform: string): string {
    const lang = platform === 'medium' ? 'in English' : platform === 'note' ? 'in Japanese' : 'in Korean';

    if (mode === 'market') {
        return `## Write 1 market overview/issue blog post ${lang}

Market situation: ${marketContext || 'Regular trading day'}
Trending: ${Object.entries(dataMap).map(([t, d]) => `${t}: $${d?.price || '?'}, ${d?.changePct || '?'}%`).join(', ')}

Write about noteworthy market issues and trends.`;
    }

    const t = tickers[0];
    const d = dataMap[t];
    return `## Write 1 analysis blog post for ${t} ${lang}

${t} Data:
- Price: $${d?.price || d?.currentPrice || '?'}
- Change: ${d?.changePct || d?.changePercent || '?'}%
- Score: ${d?.score || d?.contextScore || d?.alphaScore || '?'}
- GEX: $${d?.gex || '?'}
- Dark Pool: ${d?.darkPoolPct || d?.darkPool?.pct || '?'}%
- Smart Flow: ${d?.whaleIndex || d?.smartFlow || '?'}
- RSI: ${d?.rsi || '?'}

Market: ${marketContext || 'Regular trading day'}

Write a professional and engaging analysis based on this data. Include specific data points from above.`;
}
