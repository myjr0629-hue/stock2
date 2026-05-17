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
    'r/explainlikeimfive': { label: 'ELI5', category: 'general' },
    'r/todayilearned':     { label: 'TIL', category: 'general' },
};

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
- Be concise and clear
- Humor is welcome but not forced
- ELI5: Break down complex topics simply
- TIL: Share interesting related facts or context`,
        };

        const systemPrompt = `You are a knowledgeable Reddit user who writes natural, helpful comments.

## Core Identity
- You sound like a real person, NOT a bot or marketer
- You're genuinely interested in helping and discussing topics
- You use Reddit-native formatting and language
- You have diverse interests spanning tech, finance, data, and science

## ${isKarma ? '🟡 KARMA BUILDING MODE (NO PROMOTION)' : '🟢 ORGANIC MODE (subtle mention allowed)'}
${promoRule}

## ${sub} Culture Guide
${subCultureGuide[subInfo.category] || subCultureGuide.general}

## Comment Rules
1. Sound like a real Redditor - casual but knowledgeable
2. Use Reddit markdown: **bold**, *italic*, line breaks, bullet points
3. NO hashtags ever
4. Match the subreddit's tone precisely
5. Add value - don't just agree, contribute something new
6. If finance: use actual data points when available

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
- Alpha Score: ${tickerData.score || tickerData.alphaScore || '?'}
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
