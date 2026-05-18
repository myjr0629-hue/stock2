import { NextRequest, NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { getFromCache } from '@/services/redisClient';

export const maxDuration = 60;

const SUBREDDITS: Record<string, { label: string; category: string }> = {
    // Stock/Finance
    'r/options':           { label: 'Options Trading', category: 'finance' },
    'r/stocks':            { label: 'Stock Discussion', category: 'finance' },
    'r/wallstreetbets':    { label: 'WSB', category: 'finance' },
    'r/investing':         { label: 'Investing', category: 'finance' },
    'r/stockmarket':       { label: 'Stock Market', category: 'finance' },
    // Tech
    'r/technology':        { label: 'Technology', category: 'tech' },
    'r/programming':       { label: 'Programming', category: 'tech' },
    'r/datascience':       { label: 'Data Science', category: 'tech' },
    'r/machinelearning':   { label: 'Machine Learning', category: 'tech' },
    'r/artificial':        { label: 'AI', category: 'tech' },
    // Data/Viz
    'r/dataisbeautiful':   { label: 'Data Viz', category: 'data' },
    // Economics
    'r/economics':         { label: 'Economics', category: 'econ' },
    'r/finance':           { label: 'Finance', category: 'econ' },
    'r/futurology':        { label: 'Futurology', category: 'econ' },
    // General karma builders
    'r/todayilearned':      { label: 'TIL', category: 'general' },
    'r/AskReddit':          { label: 'Ask Reddit', category: 'general' },
    'r/personalfinance':    { label: 'Personal Finance', category: 'general' },
    'r/LifeProTips':        { label: 'Life Pro Tips', category: 'general' },
    'r/OutOfTheLoop':       { label: 'Out Of The Loop', category: 'general' },
};

// Subreddits where we are banned — never show these
const BANNED_SUBS = new Set(['r/explainlikeimfive']);

export async function POST(req: NextRequest) {
    try {
        const { email, ticker, subreddit, postTitle, karmaMode } = await req.json();
        if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

        const sub = subreddit || 'r/options';
        const subInfo = SUBREDDITS[sub] || { label: sub, category: 'finance' };
        const isKarma = karmaMode !== false; // Default: karma mode ON (no promotion)
        const targetTicker = (ticker || '').toUpperCase();

        // Fetch data from Redis if finance subreddit and ticker provided
        let tickerData: any = null;
        let marketContext = '';

        if (targetTicker && subInfo.category === 'finance') {
            const cacheKey = `cache:command:unified:${targetTicker}`;
            const raw = await getFromCache<any>(cacheKey);
            if (raw) tickerData = typeof raw === 'string' ? JSON.parse(raw) : raw;

            const briefData = await getFromCache<any>('cache:morning-briefing:ko');
            if (briefData) {
                const brief = typeof briefData === 'string' ? JSON.parse(briefData) : briefData;
                marketContext = brief.summary || brief.headline || '';
            }
        }

        const promoRule = isKarma
            ? `CRITICAL: You are in KARMA BUILDING MODE. 
DO NOT mention signumhq.com or any product/service AT ALL. 
NO self-promotion whatsoever. Zero. None.
Just be a genuinely helpful, knowledgeable person.
The goal is to build karma and reputation as a trusted community member.`
            : `You may include ONE natural, organic mention of signumhq.com in ONE of the 3 comments.
It must feel like a genuine recommendation, not an ad.
Example: "I've been tracking this on signumhq - their GEX data lines up with what you're seeing"
The other 2 comments should have ZERO promotion.`;

        const subCultureGuide: Record<string, string> = {
            finance: `Reddit finance culture:
- r/options: Technical, Greeks-focused, strategy discussion, appreciate IV/GEX analysis
- r/stocks: Mix of fundamental + technical, moderate professional tone
- r/wallstreetbets: Bold, meme-friendly, use WSB slang (tendies, diamond hands, etc.) BUT still data-backed
- r/investing: Conservative, long-term focus, risk-aware, Bogleheads-friendly`,
            tech: `Reddit tech culture:
- Be technically precise, show understanding of the technology
- Share personal experience or projects when relevant
- Reference documentation or source code when helpful
- Avoid corporate buzzwords, be authentic`,
            data: `Reddit data/viz culture:
- Discuss methodology, not just results
- Ask about data sources and sample sizes
- Appreciate clean visualizations and honest representations
- Comment on statistical significance when relevant`,
            econ: `Reddit economics culture:
- Reference economic theories and historical parallels
- Nuanced takes preferred over hot takes
- Acknowledge uncertainty and multiple perspectives
- Data-driven arguments with sources`,
            general: `Reddit general subreddit culture:
- Keep it SHORT. 2-4 sentences max.
- Sound like you typed this on your phone during a break
- Share one personal anecdote or opinion, not a structured answer
- TIL: Share one interesting related fact, keep it casual
- AskReddit: Answer from personal experience, be relatable
- PersonalFinance: Be helpful but brief, share what worked for you`,
        };

        const systemPrompt = `You are a real person on Reddit. Not a bot. Not an AI. A real human who types fast, makes typos sometimes, and has opinions.

## YOUR PERSONALITY
- You're a 30-something who works in tech/data and trades stocks as a hobby
- You type like you're on your phone or quickly at your desk
- You share personal experiences: "honestly I noticed...", "in my experience...", "I've been doing this for a while and..."
- You sometimes trail off with "..." or use "lol", "tbh", "ngl", "imo"
- You occasionally make small grammar imperfections — missing periods, starting with lowercase, etc.

## ${isKarma ? '🟡 KARMA BUILDING MODE (NO PROMOTION)' : '🟢 ORGANIC MODE (subtle mention allowed)'}
${promoRule}

## ${sub} Culture Guide
${subCultureGuide[subInfo.category] || subCultureGuide.general}

## 🔴 ABSOLUTE ANTI-BAN RULES (VIOLATION = PERMANENT BAN)
1. NEVER write more than 4 sentences per comment. Shorter is ALWAYS better.
2. NEVER use ANY formatting: no **bold**, no *italic*, no - bullets, no numbered lists, no headers
3. NEVER categorize or structure your answer (no "Active stuff", "Passive stuff" sections)
4. NEVER write like a Wikipedia article, textbook, or blog post
5. NEVER use formal transitions like "Furthermore", "Additionally", "In conclusion"
6. Write like you're texting a friend who asked a question
7. Include at least one personal touch: "I", "my", "honestly", a casual opinion
8. It's OK to be slightly incomplete or leave something for others to add
9. Use contractions always (don't, can't, it's, that's, won't)
10. Vary sentence length — mix short punchy sentences with slightly longer ones
11. Sometimes start sentences with "But", "And", "Like", "Yeah" — real people do this
12. NO hashtags, NO emojis (except maybe one occasional 😂 or lol)

## JSON Rules
- Escape double quotes: \\"
- Line breaks: \\n
- Output ONLY valid JSON

## Output Format
{
  "comments": [
    {
      "type": "analysis",
      "label": "Detailed Take",
      "comment": "Full comment with reddit markdown...",
      "upvoteEstimate": "high"
    },
    {
      "type": "quick",
      "label": "Quick Take",
      "comment": "Short 2-3 sentence comment...",
      "upvoteEstimate": "medium"
    },
    {
      "type": "discussion",
      "label": "Discussion Starter",
      "comment": "Opens discussion with a question...",
      "upvoteEstimate": "high"
    }
  ]
}`;

        const dataSection = tickerData ? `
${targetTicker} Live Data:
- Price: $${tickerData.price || tickerData.currentPrice || '?'}
- Change: ${tickerData.changePct || tickerData.changePercent || '?'}%
- Context Score: ${tickerData.score || tickerData.contextScore || tickerData.alphaScore || '?'}
- GEX: $${tickerData.gex || '?'}
- Dark Pool: ${tickerData.darkPoolPct || tickerData.darkPool?.pct || '?'}%
- Smart Flow: ${tickerData.whaleIndex || tickerData.smartFlow || '?'}
- RSI: ${tickerData.rsi || '?'}` : '';

        const userPrompt = `Generate 3 Reddit comments for:

Subreddit: ${sub} (${subInfo.label})
${postTitle ? `Post Title: "${postTitle}"` : targetTicker ? `Topic: ${targetTicker} analysis` : 'Topic: General discussion'}
${targetTicker ? `Ticker: ${targetTicker}` : ''}
Mode: ${isKarma ? 'KARMA BUILDING - NO promotion at all' : 'Organic - subtle mention OK in 1 comment'}

${dataSection}
${marketContext ? `Market Context: ${marketContext}` : ''}

Generate 3 different styles:
1. "analysis" — Detailed, thoughtful comment that shows expertise
2. "quick" — Short punchy take (2-3 sentences max)
3. "discussion" — Asks a genuine question that invites quality replies`;

        const result = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: systemPrompt,
            userPrompt,
            maxTokens: 3000,
            temperature: 0.85,
            jsonPrefill: true,
            label: `Reddit-${sub}`,
            timeoutMs: 30000,
        });

        let parsed: any;
        try {
            parsed = JSON.parse(result.text);
        } catch {
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
            parsed = JSON.parse(raw);
        }

        return NextResponse.json({
            success: true,
            ticker: targetTicker || null,
            subreddit: sub,
            karmaMode: isKarma,
            comments: parsed.comments,
            model: result.model,
            elapsedMs: result.elapsedMs,
        });

    } catch (err: any) {
        console.error('[Reddit Comment] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
