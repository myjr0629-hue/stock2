// ============================================================================
// Undercurrent (spin-off prototype) — news × money feed
// ----------------------------------------------------------------------------
// PROTOTYPE, ISOLATED. New route; touches NO existing SIGNUM code. Proves the
// core concept: fetch news → map to tickers → overlay OUR money-flow data →
// let AI (Bedrock) compare "what the news says" vs "what the money is doing" and
// write a plain-language card + divergence flag. Not wired to any app; call
// directly (GET /api/undercurrent/feed?locale=ko&limit=6).
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BEDROCK_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

let _bedrock: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
  if (_bedrock) return _bedrock;
  _bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
  return _bedrock;
}

type Locale = 'ko' | 'en' | 'ja';
const normLocale = (l: string | null): Locale => (l === 'en' || l === 'ja' ? l : 'ko');
const langName: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

interface NewsItem {
  title: string;
  description?: string;
  tickers?: string[];
  image_url?: string;
  article_url?: string;
  published_utc?: string;
  publisher?: { name?: string };
  insights?: { ticker: string; sentiment?: string; sentiment_reasoning?: string }[];
}

interface MoneyData {
  darkPoolPct: number | null;
  gammaRisk: string | null;
  volRegime: string | null;
}

const FIRST_TICKER_RE = /^[A-Z]{1,5}$/;

// Pick the primary ticker an article is really about (first clean US symbol).
function primaryTicker(item: NewsItem): string | null {
  const t = (item.tickers || []).find((x) => FIRST_TICKER_RE.test(x));
  return t || null;
}

async function fetchMoney(origin: string, ticker: string): Promise<MoneyData> {
  try {
    const res = await fetch(`${origin}/api/live/premium-metrics?ticker=${ticker}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return {
      darkPoolPct: typeof d?.darkPool?.percent === 'number' ? d.darkPool.percent : null,
      gammaRisk: d?.gammaSqueeze?.risk ?? null,
      volRegime: d?.volatilityRegime?.regime ?? null,
    };
  } catch {
    return { darkPoolPct: null, gammaRisk: null, volRegime: null };
  }
}

function buildPrompt(loc: Locale, stories: any[]): { system: string; user: string } {
  const system = `You write a premium, general-audience market app called "Undercurrent". Your ONE job: for each story, compare what the NEWS is saying against what the MONEY (institutional / options positioning) is actually doing, and surface any DIVERGENCE.

RULES:
- Write everything in ${langName[loc]}.
- Plain language for ordinary people. NEVER use raw jargon (no "GEX", "gamma", "dark pool %", "IV"). Translate to human terms (e.g. instead of "dark pool 63%", say institutions are quietly active / trading heavily off-exchange).
- Describe only — NEVER give buy/sell/hold advice or price predictions.
- "moneyRead" = one plain sentence on what the institutional money signals suggest (intensity of institutional activity, squeeze risk, market calm/stress) — be honest, do not invent a direction the data doesn't support.
- "divergence" = true ONLY when the news tone and the money signals genuinely point different ways (e.g. upbeat news but heavy caution/squeeze-risk in the money).
- Output STRICT JSON only, no preamble.`;

  const user = `Return a JSON object: {"cards":[ ... ]} with one card per story IN ORDER. Each card:
{
  "plainTitle": "<accessible rewrite of the headline, short>",
  "whyItMatters": "<one plain sentence: why an ordinary person should care>",
  "moneyRead": "<one plain sentence: what the money/institutional signals suggest>",
  "moneyMood": "<one of: 'bullish' | 'cautious' | 'neutral'>",
  "divergence": <true|false>,
  "tag": "<1-2 word theme, e.g. 반도체 / 금리 / 에너지>"
}

STORIES:
${JSON.stringify(
  stories.map((s, i) => ({
    n: i + 1,
    ticker: s.ticker,
    headline: s.title,
    summary: (s.description || '').slice(0, 240),
    newsSentiment: s.newsSentiment || 'unknown',
    money: {
      institutionalOffExchangeShare_pct: s.money.darkPoolPct,
      squeezeRisk: s.money.gammaRisk,
      volatility: s.money.volRegime,
    },
  })),
  null,
  0,
)}`;
  return { system, user };
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loc = normLocale(searchParams.get('locale'));
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '6', 10) || 6, 1), 10);

  try {
    // 1) recent market news (has tickers + sentiment + image built-in)
    const news = await fetchMassive(
      '/v2/reference/news',
      { limit: '40', order: 'desc', sort: 'published_utc' },
      false,
      undefined,
      { cache: 'no-store' as RequestCache },
    );
    const results: NewsItem[] = news?.results || [];

    // keep stories with a usable primary ticker; de-dupe by ticker
    const seen = new Set<string>();
    const picked: { item: NewsItem; ticker: string }[] = [];
    for (const item of results) {
      const t = primaryTicker(item);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      picked.push({ item, ticker: t });
      if (picked.length >= limit) break;
    }
    if (picked.length === 0) {
      return NextResponse.json({ success: false, error: 'no usable news', cards: [] });
    }

    // 2) overlay OUR money data per ticker (parallel)
    const money = await Promise.all(picked.map((p) => fetchMoney(origin, p.ticker)));

    const stories = picked.map((p, i) => {
      const ins = (p.item.insights || []).find((x) => x.ticker === p.ticker);
      return {
        ticker: p.ticker,
        title: p.item.title,
        description: p.item.description,
        newsSentiment: ins?.sentiment,
        money: money[i],
      };
    });

    // 3) AI compares news vs money → cards
    const { system, user } = buildPrompt(loc, stories);
    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const result = await Promise.race([
      getBedrock().send(command),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('bedrock timeout')), 50000)),
    ]);
    let raw = (JSON.parse(new TextDecoder().decode((result as any).body)).content?.[0]?.text || '')
      .replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonStart = raw.indexOf('{');
    if (jsonStart > 0) raw = raw.slice(jsonStart);
    const parsed = JSON.parse(raw);
    const aiCards: any[] = parsed?.cards || [];

    // 4) merge AI verdicts with the news metadata (image / link / ticker / money)
    const cards = picked.map((p, i) => {
      const a = aiCards[i] || {};
      return {
        ticker: p.ticker,
        tag: a.tag || null,
        plainTitle: a.plainTitle || p.item.title,
        whyItMatters: a.whyItMatters || null,
        moneyRead: a.moneyRead || null,
        moneyMood: a.moneyMood || 'neutral',
        divergence: Boolean(a.divergence),
        money: money[i],
        newsSentiment: stories[i].newsSentiment || null,
        image: p.item.image_url || null,
        source: p.item.publisher?.name || null,
        url: p.item.article_url || null,
        publishedAt: p.item.published_utc || null,
      };
    });

    return NextResponse.json({ success: true, locale: loc, count: cards.length, cards });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
