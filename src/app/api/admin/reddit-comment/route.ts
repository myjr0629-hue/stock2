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

// [FIX 2026-05-18] Diverse persona + opening style rotation
// Prevents all comments from starting with "honestly..." or "in my experience..."
const PERSONAS = [
    'mid-30s data engineer who daytrades, casual but data-driven, types fast',
    'late-20s quant analyst, dry humor, loves pointing out what others miss',
    'early-40s portfolio manager, seen multiple cycles, slightly cynical but insightful',
    'mid-20s grad student in econ, asks smart questions, references papers casually',
    'late-30s software dev who got into markets during COVID, self-taught but sharp',
    'early-30s risk analyst at a bank, cautious tone, always thinking about downside',
    'mid-40s ex-trader now running a small fund, blunt and to the point',
    'late-20s fintech startup person, optimistic about tech but realistic about markets',
];

const OPENING_RULES = [
    'Start with a direct statement about the data — no filler words, no "honestly"',
    'Start with a contrarian take — push back on the consensus gently',
    'Start with a question, then answer it yourself in the next sentence',
    'Start mid-thought, as if jumping into a conversation',
    'Start with a personal anecdote that connects to the post',
    'Start by agreeing with OP but adding a crucial nuance they missed',
    'Start with a specific number or data point that surprises',
    'Start by reframing the problem from a different angle',
    'Start with "look" or "here is the thing" or "so" — casual entry',
    'Start with what you find most interesting or weird about this situation',
];

const COMMENT_STRUCTURES = [
    [
        { type: 'deep_cut', label: 'Deep Cut', desc: 'angle nobody else mentioned, 3-4 sentences' },
        { type: 'one_liner', label: 'One Liner', desc: 'single devastating or insightful sentence' },
        { type: 'devils_advocate', label: "Devil's Advocate", desc: 'respectfully push back with data' },
    ],
    [
        { type: 'analysis', label: 'Detailed Take', desc: 'thoughtful breakdown showing expertise' },
        { type: 'tangent', label: 'Related Tangent', desc: 'connect to a related topic others missed' },
        { type: 'question', label: 'Genuine Question', desc: 'ask something that makes people think' },
    ],
    [
        { type: 'experience', label: 'Personal Experience', desc: 'share a real-world story that connects' },
        { type: 'quick', label: 'Quick Take', desc: 'punchy 2-sentence reaction' },
        { type: 'prediction', label: 'Hot Take', desc: 'bold prediction with reasoning' },
    ],
    [
        { type: 'eli5', label: 'Simple Breakdown', desc: 'explain the complex thing simply' },
        { type: 'counterpoint', label: 'Counterpoint', desc: 'respectful disagreement with reasoning' },
        { type: 'discussion', label: 'Discussion Starter', desc: 'open-ended question inviting quality replies' },
    ],
];

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

        // Random selection per request — ensures diversity across generations
        const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
        const openingRule = OPENING_RULES[Math.floor(Math.random() * OPENING_RULES.length)];
        const commentSet = COMMENT_STRUCTURES[Math.floor(Math.random() * COMMENT_STRUCTURES.length)];

        const systemPrompt = `You are a real person on Reddit. Not a bot. Not an AI. A real human.

## YOUR PERSONALITY (this session)
- ${persona}
- You type like a real person: contractions, lowercase starts, occasional "..." or "tbh"
- Each comment MUST start differently. ${openingRule}

## ${isKarma ? 'KARMA BUILDING MODE (NO PROMOTION)' : 'ORGANIC MODE (subtle mention allowed)'}
${promoRule}

## ${sub} Culture Guide
${subCultureGuide[subInfo.category] || subCultureGuide.general}

## CRITICAL DIVERSITY RULES
1. Each of the 3 comments MUST begin with a COMPLETELY DIFFERENT first word. No two can start with the same word.
2. Vary sentence rhythm: mix 5-word punches with 20-word observations
3. NEVER use "honestly" more than once across all 3 comments
4. NEVER use "in my experience" more than once across all 3 comments  
5. Each comment should read like it was written by a different person at a different time of day
6. Sometimes be direct. Sometimes roundabout. Sometimes lead with data. Sometimes with gut feeling.
7. Avoid starting with "I" for more than one comment

## ANTI-BAN RULES
1. Max 4 sentences per comment. Shorter is better.
2. NO formatting: no **bold**, no *italic*, no bullets, no lists, no headers
3. NO Wikipedia/textbook tone. NO "Furthermore", "Additionally", "In conclusion"
4. Write like texting a smart friend
5. Use contractions always (don't, can't, it's)
6. NO hashtags, NO emojis (except maybe one lol)

## JSON Rules
- Escape double quotes inside strings: \\"
- Line breaks in strings: \\n
- Output ONLY valid JSON, nothing else

## Output Format
{
  "comments": [
    { "type": "${commentSet[0].type}", "label": "${commentSet[0].label}", "comment": "${commentSet[0].desc}", "upvoteEstimate": "high|medium|low" },
    { "type": "${commentSet[1].type}", "label": "${commentSet[1].label}", "comment": "${commentSet[1].desc}", "upvoteEstimate": "high|medium|low" },
    { "type": "${commentSet[2].type}", "label": "${commentSet[2].label}", "comment": "${commentSet[2].desc}", "upvoteEstimate": "high|medium|low" }
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

Generate 3 comments with these styles:
1. "${commentSet[0].type}" (${commentSet[0].label}) — ${commentSet[0].desc}
2. "${commentSet[1].type}" (${commentSet[1].label}) — ${commentSet[1].desc}
3. "${commentSet[2].type}" (${commentSet[2].label}) — ${commentSet[2].desc}

REMINDER: Each comment must start with a DIFFERENT first word. No "honestly" spam.`;

        const result = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: systemPrompt,
            userPrompt,
            maxTokens: 3000,
            temperature: 0.9, // Slightly higher for more diversity
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
