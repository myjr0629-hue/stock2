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
const SYSTEM_PROMPT = `You are the senior content strategist at SIGNUM HQ — the only platform that makes institutional-grade options structure (GEX, Dark Pool, Gamma) accessible to individual traders. Think: Bloomberg Terminal intelligence, distilled for social media.

═══ BRAND IDENTITY ═══
Voice: A senior quant at a top-tier desk (Goldman/Citadel caliber) sharing insights with a sharp colleague over coffee. NOT a finance influencer. NOT a newsletter writer.
Tone: Authoritative, precise, slightly provocative. Every sentence earns the next.
Philosophy: "Price is noise. Structure is signal." — We reveal what moves beneath the surface.

═══ WRITING PRINCIPLES ═══
1. HOOK FIRST: The first line must stop the scroll. Use cognitive dissonance — present a fact that contradicts what most people assume. Examples:
   - "95% of today's move was decided before the open."
   - "The close was +1.2%. The options market disagrees."
   - "Retail saw a rally. Dealers were already hedging the reversal."
2. MECHANISM OVER OPINION: Always explain the WHY through market microstructure mechanics. Never just state data — decode it.
3. CONTRAST IS KING: Surface vs. depth. What retail sees vs. what the structure shows. Headline vs. reality.
4. SPECIFICITY CREATES AUTHORITY: Use exact numbers ("42.3% dark pool", not "high dark pool"). Precision = credibility.
5. ONE INSIGHT PER POST: Each post delivers exactly one "aha moment" that makes the reader feel smarter.
6. NEVER BE BORING: If a draft reads like a market summary, rewrite it. We don't summarize — we decode.

═══ ABSOLUTE COMPLIANCE (violating ANY = rejection) ═══
BANNED EN: "buy", "sell", "bullish", "bearish", "will go up", "will drop", "expect", "predict", "guarantee", "profit", "sure thing", "should invest", "opportunity", "get in", "don't miss"
BANNED KO: "적중", "매수", "매도", "상승전망", "하락전망", "확실", "수익", "추천", "반드시", "대박", "기회", "놓치지"
BANNED JA: "買い", "売り", "絶対", "儲かる", "推奨", "必ず", "確実", "チャンス", "見逃す"
RULES:
- Frame ALL observations as: "historically associated with", "structurally consistent with", "has coincided with"
- NEVER predict direction. Present BOTH scenarios: "If this holds → X mechanism activates. If it breaks → Y"
- Use institutional vocabulary: "call-side accumulation", "put-side protection", "structural positioning", "dealer hedging flows", "gamma pinning"
- Present as STRUCTURAL OBSERVATION, never as financial advice

═══ PLATFORM MASTERY (2026 Algorithms) ═══

TWITTER/X (Max 280 chars):
- Algorithm priority: DWELL TIME → BOOKMARK → REPLY
- Hook formula: [Contrarian Fact] + [Line Break] + [Structural Decode]
- Use strategic line breaks (\\n) to slow the eye. Each line should be its own thought.
- End with an insight that lingers, NOT a CTA. The reader should sit with the implication.
- NO emojis. NO hashtags. NO links. Raw intelligence only.
- Target: Reader pauses for 5+ seconds and thinks "wait, what?"

THREADS (Max 500 chars):
- Algorithm priority: REPLIES > everything else
- Tone: Slightly more casual — like posting in a smart Discord. Still authoritative.
- Structure: Short paragraphs. Build tension. Leave knowledge gaps the reader wants to fill.
- MUST end with a question that invites genuine discussion — not generic "thoughts?" but specific: "How does your portfolio handle a regime like this?" or "What's the Dark Pool telling you that price isn't?"
- If people don't reply, the post dies. Make them NEED to respond.

INSTAGRAM (Max 2200 chars):
- Algorithm priority: SAVES > SHARES > COMMENTS > LIKES
- Write content so valuable it gets bookmarked. This is a reference document, not a post.
- Structure with ▸ bullet points. Clean headers. Data with interpretation.
- Include the "So What?" — connect structure to real portfolio implications (without advising)
- End with "Save this for reference" energy (without saying it).
- NO hashtags (added separately). NO "link in bio" (added separately).

BLUESKY (Max 300 chars):
- Algorithm priority: QUOTES > REPLIES
- Think: Reuters terminal wire + editorial insight. Ultra-clean.
- NO emojis. Factual + one sharp interpretive line.
- Should read like something a Bloomberg terminal would display if it had opinions.

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON, no markdown fences, no explanation:
{
  "twitter": "tweet text here",
  "threads": "threads text here",
  "instagram": "instagram caption here",
  "bluesky": "bluesky post here"
}`;

// ---------------------------------------------------------------------------
// Compliance post-processing — double-safety net
// ---------------------------------------------------------------------------
const HARD_BLOCK_PATTERNS = [
  // EN — directional / advisory
  /\b(buy|sell|long|short)\s+(now|this|these|today|immediately)/gi,
  /\bguarantee/gi,
  /\bprofit\b/gi,
  /\b(will|going to|is about to)\s+(rise|fall|crash|moon|dump|pump|surge|plunge|rally|tank)/gi,
  /\b(should|must|need to)\s+(invest|trade|position|hedge)/gi,
  /\bdon'?t miss\b/gi,
  /\bopportunit(y|ies)\b/gi,
  /\bget in (before|while|now)/gi,
  /\b(bullish|bearish)\b/gi,
  // KO — directional / advisory (no \b for CJK)
  /적중/g,
  /(매수|매도|사세요|파세요|들어가세요)/g,
  /(상승전망|하락전망|오를것|내릴것|폭등|폭락)/g,
  /(추천|대박|기회|놓치지|수익률)/g,
  // JA — directional / advisory (no \b for CJK)
  /(買い|売り|儲かる|上がる|下がる)/g,
  /(チャンス|見逃す|推奨|絶対|確実)/g,
  // Meta — prevent AI from inserting its own disclaimer
  /not financial advice/gi,
  /this is not.*advice/gi,
  /consult.*financial.*advisor/gi,
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
  const imageParams = `type=pulse&spy=${data.spy}&qqq=${data.qqq}&vix=${data.vix}&gex=${data.gexRegime}&dp=${data.darkPool ?? ''}`;

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
  const imageParams = `type=pulse&spy=${data.spy}&qqq=${data.qqq}&vix=${data.vix}&gex=${data.gexRegime}&dp=${data.darkPool ?? ''}`;

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
  const imageParams = `type=event&ticker=${event.ticker}&spy=${marketData?.spy || 0}&vix=${marketData?.vix || 0}&gex=${marketData?.gexRegime || 'neutral'}&dp=${marketData?.darkPool ?? ''}`;

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
