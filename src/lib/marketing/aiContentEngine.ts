// ============================================================================
// AI Content Engine — Bedrock-powered social media content generation
// Replaces static templates with AI-generated, platform-optimized content
// Cost: ~$0.01-0.03/day (Haiku 3.5 × 12 posts)
// Safety: System prompt compliance + post-processing filter
// ============================================================================

import { callBedrock, MODELS } from '@/services/bedrockClient';
import { applyCompliance, CHAR_LIMITS } from './bufferClient';
import type { MarketData, ContentOutput, PlatformContent, EventData } from './contentEngines';

// ---------------------------------------------------------------------------
// System Prompt — Brand voice + compliance rules baked in
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the content strategist for SIGNUM HQ, a premium institutional-grade options & market structure analytics platform.

BRAND VOICE:
- Authoritative yet accessible — like a senior quant explaining to a smart colleague
- Data-driven, never speculative
- Insightful — always explain WHY data matters, not just WHAT it shows
- Use crisp, punchy sentences. No filler words.

ABSOLUTE COMPLIANCE RULES (violating ANY = content rejection):
1. NEVER use: "buy", "sell", "bullish", "bearish", "will go up", "will drop", "expect", "predict", "guarantee", "profit", "적중", "매수", "매도", "상승전망", "하락전망", "買い", "売り"
2. NEVER give financial advice or recommend specific trades
3. ALWAYS frame data as "historically associated with" or "structural observation"
4. ALWAYS include disclaimer awareness — present as data context, not prediction
5. Use institutional language: "call-side activity", "put-side protection", "structural positioning"

PLATFORM OPTIMIZATION:
- Twitter/X: Max 280 chars. Hook + 1 key data point + 1 insight. No hashtags.
- Threads: Max 500 chars. Hook → Data → Interpretation flow. Conversational.
- Instagram: Max 2200 chars. Full analysis. Include hashtags at end.
- Bluesky: Max 300 chars. Clean, data-focused, no emojis.

OUTPUT FORMAT: Return ONLY valid JSON, no markdown fences:
{
  "twitter": "tweet text here",
  "threads": "threads text here",
  "instagram": "instagram text here",
  "bluesky": "bluesky text here"
}`;

// ---------------------------------------------------------------------------
// Compliance post-processing — double-safety net
// ---------------------------------------------------------------------------
const HARD_BLOCK_PATTERNS = [
  /\b(buy|sell|long|short)\s+(now|this|these|today)/gi,
  /\bguarantee/gi,
  /\bprofit\b/gi,
  /\b(will|going to)\s+(rise|fall|crash|moon|dump|pump)/gi,
  /\b적중\b/g,
  /\b(매수|매도|사세요|파세요)\b/g,
  /\b(買い|売り|儲かる)\b/g,
  /not financial advice/gi, // We add our own disclaimer, don't let AI add inconsistent ones
];

function enforceCompliance(text: string): string {
  let result = applyCompliance(text);
  // Remove any sentences containing hard-blocked patterns
  for (const pattern of HARD_BLOCK_PATTERNS) {
    if (pattern.test(result)) {
      // Remove the entire sentence containing the violation
      const sentences = result.split(/[.!?。！？\n]/);
      result = sentences
        .filter(s => !pattern.test(s))
        .join('. ')
        .trim();
      pattern.lastIndex = 0; // Reset regex state
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Generate AI content for a single language
// ---------------------------------------------------------------------------
async function generateForLang(
  lang: 'en' | 'ko' | 'ja',
  userPrompt: string,
): Promise<PlatformContent> {
  const langInstruction = {
    en: 'Write in English.',
    ko: 'Write in Korean (한국어). Use natural Korean expressions, NOT translations from English. Use formal but engaging tone (합니다/입니다 체).',
    ja: 'Write in Japanese (日本語). Use natural Japanese expressions. Use です/ます体.',
  }[lang];

  try {
    const result = await callBedrock({
      modelId: MODELS.HAIKU_35, // Fast + cheap (~$0.003 per call)
      system: SYSTEM_PROMPT,
      userPrompt: `${langInstruction}\n\n${userPrompt}`,
      maxTokens: 1500,
      temperature: 0.7, // Higher for creative variety
      timeoutMs: 20000,
      fallbackModel: null, // Don't waste Sonnet on social posts
      jsonPrefill: true,
      maxRetries: 2,
      label: `ContentEngine-${lang}`,
    });

    // Parse JSON response
    let raw = result.text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const jsonStart = raw.indexOf('{');
    if (jsonStart > 0) raw = raw.slice(jsonStart);

    const parsed = JSON.parse(raw);

    return {
      twitter: enforceCompliance(parsed.twitter || ''),
      threads: enforceCompliance(parsed.threads || ''),
      instagram: enforceCompliance(parsed.instagram || ''),
      bluesky: enforceCompliance(parsed.bluesky || ''),
    };
  } catch (err: any) {
    console.error(`[AIContentEngine] ${lang} generation failed:`, err.message);
    // Return empty — caller will fall back to template
    return { twitter: '', threads: '', instagram: '', bluesky: '' };
  }
}

// ---------------------------------------------------------------------------
// Truncate to platform limits
// ---------------------------------------------------------------------------
function truncate(text: string, platform: string): string {
  const limit = CHAR_LIMITS[platform] || 280;
  if (text.length <= limit) return text;
  return text.substring(0, limit - 3) + '...';
}

function applyLimits(pc: PlatformContent): PlatformContent {
  return {
    twitter: truncate(pc.twitter, 'twitter'),
    threads: truncate(pc.threads, 'threads'),
    instagram: truncate(pc.instagram, 'instagram'),
    bluesky: truncate(pc.bluesky, 'bluesky'),
  };
}

// ---------------------------------------------------------------------------
// A. AI Market Pulse
// ---------------------------------------------------------------------------
export async function generateAIMarketPulse(data: MarketData): Promise<ContentOutput> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const imageParams = `type=pulse&spy=${data.spy}&qqq=${data.qqq}&vix=${data.vix}&gex=${data.gexRegime}`;

  const userPrompt = `Generate a market structure analysis post for social media.

TODAY'S DATA:
- SPY: ${data.spy > 0 ? '+' : ''}${data.spy.toFixed(2)}%
- QQQ: ${data.qqq > 0 ? '+' : ''}${data.qqq.toFixed(2)}%
- VIX: ${data.vix.toFixed(1)}
- GEX Regime: ${data.gexRegime.toUpperCase()}
${data.darkPool != null ? `- Dark Pool Activity: ${data.darkPool.toFixed(1)}%` : ''}
${data.pcr != null ? `- Put/Call Ratio: ${data.pcr.toFixed(2)}` : ''}
${data.callWall ? `- Call Wall: $${data.callWall} / Put Floor: $${data.putFloor}` : ''}
${data.maxPain != null ? `- Max Pain: $${data.maxPain}` : ''}

INSTRUCTIONS:
1. Start with a compelling HOOK that makes people stop scrolling — avoid starting with data
2. Present the KEY STRUCTURAL INSIGHT (not just numbers)
3. Explain WHY this matters for market dynamics
4. End with a thought-provoking observation
5. DO NOT include any CTA or links — those are added separately
6. DO NOT include disclaimer text — it's added separately
7. For Instagram, include relevant hashtags at the end: #OptionsFlow #GEX #MarketStructure #DarkPool #SignumHQ`;

  const imageUrl = (lang: string) => `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`;

  // Generate all 3 languages in parallel
  const [en, ko, ja] = await Promise.all([
    generateForLang('en', userPrompt),
    generateForLang('ko', userPrompt),
    generateForLang('ja', userPrompt),
  ]);

  return {
    en: {
      text: en.twitter || `SPY ${data.spy > 0 ? '+' : ''}${data.spy.toFixed(2)}% | GEX: ${data.gexRegime.toUpperCase()}`,
      imageUrl: imageUrl('en'),
      cta: 'liveStructure',
      platformText: applyLimits(en),
    },
    ko: {
      text: ko.twitter || `SPY ${data.spy > 0 ? '+' : ''}${data.spy.toFixed(2)}% | GEX: ${data.gexRegime.toUpperCase()}`,
      imageUrl: imageUrl('ko'),
      cta: 'liveStructure',
      platformText: applyLimits(ko),
    },
    ja: {
      text: ja.twitter || `SPY ${data.spy > 0 ? '+' : ''}${data.spy.toFixed(2)}% | GEX: ${data.gexRegime.toUpperCase()}`,
      imageUrl: imageUrl('ja'),
      cta: 'liveStructure',
      platformText: applyLimits(ja),
    },
  };
}

// ---------------------------------------------------------------------------
// B. AI Morning Briefing
// ---------------------------------------------------------------------------
export async function generateAIMorningBrief(
  data: MarketData & { briefingSummary?: string }
): Promise<ContentOutput> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const imageParams = `type=pulse&spy=${data.spy}&qqq=${data.qqq}&vix=${data.vix}&gex=${data.gexRegime}`;

  const userPrompt = `Generate a PRE-MARKET briefing post for social media. This goes out before US market opens.

PREVIOUS CLOSE DATA:
- SPY: ${data.spy > 0 ? '+' : ''}${data.spy.toFixed(2)}%
- QQQ: ${data.qqq > 0 ? '+' : ''}${data.qqq.toFixed(2)}%
- VIX: ${data.vix.toFixed(1)}
- GEX Regime: ${data.gexRegime.toUpperCase()}
${data.briefingSummary ? `- Additional Context: ${data.briefingSummary.substring(0, 300)}` : ''}

INSTRUCTIONS:
1. Frame as "structural setup heading into today's session"
2. Identify the KEY STRUCTURAL FACTOR for today (GEX regime, key levels, dark pool activity)
3. Explain what this structure means for potential price behavior (without predicting direction)
4. Keep it forward-looking but analytical
5. DO NOT include any CTA/links or disclaimers`;

  const imageUrl = (lang: string) => `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`;

  const [en, ko, ja] = await Promise.all([
    generateForLang('en', userPrompt),
    generateForLang('ko', userPrompt),
    generateForLang('ja', userPrompt),
  ]);

  return {
    en: { text: en.twitter || 'Pre-market structure analysis', imageUrl: imageUrl('en'), cta: 'fullReport', platformText: applyLimits(en) },
    ko: { text: ko.twitter || '장 오픈 전 구조 분석', imageUrl: imageUrl('ko'), cta: 'fullReport', platformText: applyLimits(ko) },
    ja: { text: ja.twitter || '寄り前構造分析', imageUrl: imageUrl('ja'), cta: 'fullReport', platformText: applyLimits(ja) },
  };
}

// ---------------------------------------------------------------------------
// C. AI Education Content
// ---------------------------------------------------------------------------
const EDU_TOPICS = [
  { id: 'gex', en: 'Gamma Exposure (GEX)', ko: '감마 익스포저(GEX)', ja: 'ガンマエクスポージャー(GEX)' },
  { id: 'dark_pool', en: 'Dark Pool Activity', ko: '다크풀 활동', ja: 'ダークプール活動' },
  { id: 'iv_percentile', en: 'IV Percentile', ko: 'IV 퍼센타일', ja: 'IVパーセンタイル' },
  { id: 'pcr', en: 'Put/Call Ratio', ko: '풋/콜 비율', ja: 'プット/コール比率' },
  { id: 'max_pain', en: 'Max Pain & Key Levels', ko: '맥스 페인과 핵심 레벨', ja: 'マックスペインとキーレベル' },
  { id: 'squeeze', en: 'Gamma Squeeze Mechanics', ko: '감마 스퀴즈 메커니즘', ja: 'ガンマスクイーズの仕組み' },
  { id: 'iv_skew', en: 'IV Skew (Fear Gauge)', ko: 'IV 스큐 (공포 지수)', ja: 'IVスキュー（恐怖指標）' },
  { id: 'dex', en: 'Delta Exposure (DEX)', ko: '델타 익스포저(DEX)', ja: 'デルタエクスポージャー(DEX)' },
];

export async function generateAIEducation(topicId?: string): Promise<ContentOutput> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const topic = topicId
    ? EDU_TOPICS.find(t => t.id === topicId) || EDU_TOPICS[0]
    : EDU_TOPICS[Math.floor(Math.random() * EDU_TOPICS.length)];

  const userPrompt = `Generate an EDUCATIONAL post about "${topic.en}" for retail traders who want institutional-grade knowledge.

TOPIC: ${topic.en}

INSTRUCTIONS:
1. Start with a provocative hook that challenges conventional thinking
2. Explain the concept with a concrete analogy or real-world example
3. Show how professionals USE this metric differently than retail traders
4. End with an actionable question that makes readers want to learn more
5. Make it genuinely educational — teach something most people don't know
6. DO NOT include any CTA/links or disclaimers
7. For Instagram, include educational hashtags at the end`;

  const imageParams = `type=education&topic=${topic.id}`;
  const imageUrl = (lang: string) => `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`;

  const [en, ko, ja] = await Promise.all([
    generateForLang('en', userPrompt),
    generateForLang('ko', userPrompt),
    generateForLang('ja', userPrompt),
  ]);

  return {
    en: { text: en.twitter || topic.en, imageUrl: imageUrl('en'), cta: 'trackLevels', platformText: applyLimits(en) },
    ko: { text: ko.twitter || topic.ko, imageUrl: imageUrl('ko'), cta: 'trackLevels', platformText: applyLimits(ko) },
    ja: { text: ja.twitter || topic.ja, imageUrl: imageUrl('ja'), cta: 'trackLevels', platformText: applyLimits(ja) },
  };
}

export function getAIEducationTopicIds(): string[] {
  return EDU_TOPICS.map(t => t.id);
}

// ---------------------------------------------------------------------------
// D. AI Event Spike (structural alerts)
// ---------------------------------------------------------------------------
export async function generateAIEventSpike(
  event: EventData,
  marketData?: Partial<MarketData>
): Promise<ContentOutput> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const imageParams = `type=event&ticker=${event.ticker}&spy=${marketData?.spy || 0}&vix=${marketData?.vix || 0}`;

  const userPrompt = `Generate an ALERT post about a structural market event.

EVENT:
- Ticker: $${event.ticker}
- Type: ${event.type}
- Details: ${event.details}
${event.premium ? `- Premium: $${(event.premium / 1e6).toFixed(1)}M` : ''}
${event.value ? `- Value: ${event.value}` : ''}

MARKET CONTEXT:
${marketData?.spy != null ? `- SPY: ${marketData.spy > 0 ? '+' : ''}${marketData.spy.toFixed(2)}%` : ''}
${marketData?.vix != null ? `- VIX: ${marketData.vix.toFixed(1)}` : ''}
${marketData?.gexRegime ? `- GEX Regime: ${marketData.gexRegime.toUpperCase()}` : ''}

INSTRUCTIONS:
1. Lead with the structural significance — WHY does this matter?
2. Put the event in CONTEXT of the broader market structure
3. Explain what this type of activity HAS historically indicated (without predicting)
4. Create urgency through data significance, NOT through fear/greed
5. DO NOT include any CTA/links or disclaimers`;

  const imageUrl = (lang: string) => `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`;

  const [en, ko, ja] = await Promise.all([
    generateForLang('en', userPrompt),
    generateForLang('ko', userPrompt),
    generateForLang('ja', userPrompt),
  ]);

  return {
    en: { text: en.twitter || `$${event.ticker}: ${event.details}`, imageUrl: imageUrl('en'), cta: 'liveStructure', platformText: applyLimits(en) },
    ko: { text: ko.twitter || `$${event.ticker}: ${event.details}`, imageUrl: imageUrl('ko'), cta: 'liveStructure', platformText: applyLimits(ko) },
    ja: { text: ja.twitter || `$${event.ticker}: ${event.details}`, imageUrl: imageUrl('ja'), cta: 'liveStructure', platformText: applyLimits(ja) },
  };
}
