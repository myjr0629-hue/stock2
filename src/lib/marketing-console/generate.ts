// ============================================================================
// Generation engine — ticker → GROUNDED 4-channel drafts + lint gate.
// Numbers come ONLY from our real options structure (never fabricated).
// Bedrock: imports aws-sdk → routes using this MUST set maxDuration=60.
// ============================================================================

import { callBedrock } from '@/services/bedrockClient';
import { fetchStructure, extractLevels, type Levels } from './xScan';

export type Channel = 'toss' | 'stocktwits' | 'x_en' | 'x_ja';

export interface ChannelDraft {
  channel: Channel;
  label: string;
  lang: 'ko' | 'en' | 'ja';
  text: string;
  lint: LintResult;
}

export interface LintResult {
  pass: boolean;
  checks: { key: string; label: string; ok: boolean }[];
}

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;
const LINK_RE = /https?:\/\/|www\./i;
// Prediction framing (en + ko/ja) — present/past facts only, no direction hints.
const PREDICT_RE =
  /\b(will|gonna|about to break|headed|knife'?s edge|breakout imminent|target|moon|squeeze incoming)\b|향하|곧 (깨|돌파|터)|급등할|급락할|간다|갈 것|목표가|突破する|向かって|上がる見込み|下がる見込み/i;
const BUYSELL_RE = /\b(buy|sell|long|short)\b(?!\s*(gamma|dated))|매수|매도|사세요|파세요|買い|売り/i;

function countMetrics(text: string): number {
  const nums = text.match(/\$?\d[\d,]*\.?\d*[%kKmMbB]?/g) || [];
  return nums.length;
}

// Language purity — a JP post leaked the Korean word "맥스페인" live on
// @signumhq_jp (2026-07-18). Mixed-script posts are brand-killing for a
// native-voice account, so purity is a hard gate, not a prompt suggestion.
const HANGUL_RE = /[가-힯㄰-㆏ᄀ-ᇿ]/;
const KANA_RE = /[぀-ヿ]/;
const CJK_RE = /[一-鿿]/;
function langPure(text: string, lang: 'ko' | 'en' | 'ja'): boolean {
  if (lang === 'ja') return !HANGUL_RE.test(text);                    // 일본어 글에 한글 금지
  if (lang === 'en') return !HANGUL_RE.test(text) && !KANA_RE.test(text) && !CJK_RE.test(text); // 영문 글은 라틴 문자만
  return !KANA_RE.test(text);                                          // 한국어 글에 가나 금지
}

export function lint(text: string, lang: 'ko' | 'en' | 'ja'): LintResult {
  const emojiCount = (text.match(EMOJI_RE) || []).length;
  const metrics = countMetrics(text);
  const checks = [
    { key: 'link', label: '링크 0', ok: !LINK_RE.test(text) },
    { key: 'emoji', label: '이모지 ≤2', ok: emojiCount <= 2 },
    { key: 'metrics', label: '지표 ≤3', ok: metrics <= 3 },
    { key: 'predict', label: '예측 프레이밍', ok: !PREDICT_RE.test(text) },
    { key: 'buysell', label: '매수매도어', ok: !BUYSELL_RE.test(text) },
    { key: 'lang', label: '언어 순수성', ok: langPure(text, lang) },
    { key: 'len', label: lang === 'en' ? '길이 ≤240' : '길이 적정', ok: text.length <= 240 },
  ];
  return { pass: checks.every((c) => c.ok), checks };
}

const CHANNELS: { channel: Channel; label: string; lang: 'ko' | 'en' | 'ja'; voice: string }[] = [
  { channel: 'toss', label: '토스 · ko', lang: 'ko', voice: '토스증권 커뮤니티. 주주 1인칭 관찰체, 담백. "저는 그냥 들고 갑니다" 톤. 존댓말.' },
  { channel: 'stocktwits', label: 'Stocktwits · en', lang: 'en', voice: 'Stocktwits. Casual retail-trader English, punchy, cashtag $TICKER.' },
  { channel: 'x_en', label: 'X · en', lang: 'en', voice: 'X/FinTwit. SpotGamma lane — named concept + one data point. One line + cashtag.' },
  { channel: 'x_ja', label: 'X · ja', lang: 'ja', voice: '米国株 X. KessanMan式 캐주얼 반응체("w"の空気感). 翻訳ではなくネイティブ.' },
];

export interface GenerateResult {
  ticker: string;
  grounded: boolean;
  levels: Levels | null;
  drafts: ChannelDraft[];
}

/** Generate 4-channel drafts grounded in our real levels. */
export async function generateDrafts(ticker: string, eventType: string): Promise<GenerateResult> {
  const structure = await fetchStructure(ticker);
  const levels = extractLevels(structure);
  if (!levels) {
    return { ticker, grounded: false, levels: null, drafts: [] };
  }

  const factLines = Object.entries(levels)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');

  const system = `You write social posts for @signumhq, an educational options-data brand.
Produce ONE post per channel. Return STRICT JSON: {"toss":"...","stocktwits":"...","x_en":"...","x_ja":"..."}.
ABSOLUTE RULES (violation is unacceptable — brand is "accurate, no prediction"):
- Use ONLY the provided numbers. NEVER invent/estimate any number. Max 3 numbers per post.
- NO prediction or direction hints (no will / headed / about to break / knife's edge / 향하 / 간다 / 目標). Present or past facts only.
- NO buy/sell language. NO app name. NO links. Emoji max 1.
- LANGUAGE PURITY (hard rule): "toss" = 100% Korean. "stocktwits" and "x_en" = 100% English (Latin script only). "x_ja" = 100% Japanese — NEVER include Korean Hangul or English sentences (ticker symbols like SOXL and digits are fine). Financial terms in x_ja use katakana: マックスペイン, ガンマフリップ, コールウォール.
- One or two short sentences per post. Frame: options structure showed it before the chart.`;

  const userPrompt = `Ticker: $${ticker}
Event type: ${eventType}
Our verified levels (use ONLY these): ${factLines}

Write the four posts now as strict JSON with keys toss, stocktwits, x_en, x_ja:`;

  let parsed: Record<string, string> = {};
  try {
    const { text } = await callBedrock({
      system,
      userPrompt,
      maxTokens: 700,
      temperature: 0.5,
      jsonPrefill: true,
      label: 'mkt-generate',
    });
    parsed = JSON.parse(text);
  } catch {
    return { ticker, grounded: true, levels, drafts: [] };
  }

  let drafts: ChannelDraft[] = CHANNELS.map((c) => {
    const t = (parsed[c.channel] || '').trim();
    return { channel: c.channel, label: c.label, lang: c.lang, text: t, lint: lint(t, c.lang) };
  });

  // REPAIR PASS — the model routinely packs 4+ numbers ("린트 실패: metrics"),
  // which blocked every original on 2026-07-16/17. One corrective rewrite for
  // the failing channels only; if it still fails lint, the gate blocks as before.
  const failing = drafts.filter((d) => d.text && !d.lint.pass);
  if (failing.length) {
    try {
      const fixPrompt = `These social posts failed compliance checks. Rewrite ONLY these, fixing the violations:
${failing.map((d) => `- ${d.channel} (${d.lint.checks.filter((c) => !c.ok).map((c) => c.key).join(',')}): "${d.text}"`).join('\n')}

HARD RULES: max 3 numeric values TOTAL per post (count every number). No links. Max 2 emoji. No prediction words. No buy/sell words. Under 240 chars. Use ONLY these verified numbers: ${factLines}
LANGUAGE PURITY: toss = 100% Korean · stocktwits/x_en = 100% English (Latin only) · x_ja = 100% Japanese, NEVER any Korean Hangul (use マックスペイン/ガンマフリップ, ticker symbols and digits allowed).
Return STRICT JSON with ONLY the rewritten channels as keys: {${failing.map((d) => `"${d.channel}":"..."`).join(',')}}`;
      const { text: fixed } = await callBedrock({
        system, userPrompt: fixPrompt, maxTokens: 700, temperature: 0.3, jsonPrefill: true, label: 'mkt-generate-repair',
      });
      const rep = JSON.parse(fixed) as Record<string, string>;
      drafts = drafts.map((d) => {
        const t = (rep[d.channel] || '').trim();
        if (!d.lint.pass && t) return { ...d, text: t, lint: lint(t, d.lang) };
        return d;
      });
    } catch { /* repair is best-effort; gate still enforces */ }
  }

  return { ticker, grounded: true, levels, drafts };
}
