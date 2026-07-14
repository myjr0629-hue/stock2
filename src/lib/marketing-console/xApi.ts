// ============================================================================
// X reply-draft generation (Bedrock) — imports aws-sdk, so routes using this
// MUST set `export const maxDuration = 60` (match other Bedrock routes).
// Read/scan helpers live in xScan.ts (no heavy deps) — keep them separate.
// Drafts are GROUNDED in our real options levels; we never fabricate numbers.
// ============================================================================

import { callBedrock } from '@/services/bedrockClient';
import { fetchStructure, extractLevels, type ScanTweet, type Levels } from './xScan';

export async function draftReply(
  tweet: ScanTweet,
  lang: 'en' | 'ja'
): Promise<{ draft: string; grounded: boolean; levels: Levels | null }> {
  const structure = tweet.ticker ? await fetchStructure(tweet.ticker) : null;
  const levels = extractLevels(structure);
  if (!levels) {
    return { draft: '', grounded: false, levels: null };
  }

  const factLines = Object.entries(levels)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  const langRule =
    lang === 'ja'
      ? 'Write in natural Japanese (casual 米国株 voice, KessanMan-style). NOT a translation.'
      : 'Write in natural English.';

  const system = `You draft ONE short reply for @signumhq, an educational options-data account.
STRICT RULES (compliance — violation is unacceptable):
- Use ONLY the numbers provided below. NEVER invent or estimate any number.
- No prediction, no "will/headed/about to break/knife's edge" framing. Present/past facts only.
- No buy/sell language. No app name. No links.
- One or two sentences, under 30 words. ${langRule}
- Frame as: the options structure already showed this before the chart.`;

  const userPrompt = `Original tweet by @${tweet.author}: "${tweet.text}"
Ticker: ${tweet.ticker}
Our verified levels (use ONLY these numbers): ${factLines}

Write the reply now (reply text only, no quotes, no preamble):`;

  try {
    const { text } = await callBedrock({
      system,
      userPrompt,
      maxTokens: 200,
      temperature: 0.4,
      jsonPrefill: false,
      label: 'mkt-x-reply',
    });
    return { draft: text.trim(), grounded: true, levels };
  } catch {
    return { draft: '', grounded: false, levels };
  }
}
