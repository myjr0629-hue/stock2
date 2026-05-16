// ============================================================================
// Marketing V2 — Compliance & Disclaimers
// 면책조항, 금지어 필터, CTA 빌더를 한 곳에서 관리
// ============================================================================

import { Lang, Platform } from './types';

// ── 면책조항 ──
export const DISCLAIMER: Record<Lang, string> = {
  en: '*Observation only — not financial advice.',
  ko: '*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.',
  ja: '*投資助言ではありません。データ分析の参考資料です。',
};

// ── 컴플라이언스 필터 (SEC/FTC/자본시장법/金商法) ──
const COMPLIANCE_RULES: [RegExp, string][] = [
  // EN
  [/\bBullish\b/gi,       'Call-side activity concentrated'],
  [/\bBearish\b/gi,       'Put-side activity elevated'],
  [/\bexpect\b/gi,        'historically associated with'],
  [/\bwill go up\b/gi,    'often coincides with upward moves'],
  [/\bwill drop\b/gi,     'often coincides with downward pressure'],
  [/\bguarantee[ds]?\b/gi, ''],
  [/\bprofit[s]?\b/gi,    'return'],
  [/\b100%\s*(chance|certain|guaranteed|sure)\b/gi, 'historically'],
  // KO
  [/\b적중\b/g, ''], [/\b매수\b/g, ''], [/\b매도\b/g, ''],
  [/\b확실\b/g, ''], [/\b수익\b/g, '성과'], [/\b추천\b/g, ''],
  [/\b반드시\b/g, ''], [/\b대박\b/g, ''],
  // JA
  [/絶対/g, ''], [/儲かる/g, ''], [/推奨/g, ''],
  [/必ず/g, ''], [/確実/g, ''],
];

export function applyCompliance(text: string): string {
  let result = text;
  for (const [pattern, replacement] of COMPLIANCE_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

// ── CTA 빌더 ──
// Threads: https 없이 브랜드 멘션만 (Meta 차단 방지)
// 기타: 풀 URL
export function buildCta(lang: Lang, page: string, campaign: string, platform: Platform): { display: string; full: string } {
  const utm = `utm_source=${platform}&utm_medium=social&utm_campaign=${campaign}`;
  const path = page ? `/${page}` : '';
  const full = `https://www.signumhq.com${path}?${utm}`;
  
  // Threads: 클릭 불가능한 브랜드 멘션 (Meta URL 차단 방지)
  if (platform === 'threads') {
    const labels: Record<Lang, string> = {
      en: `📊 Full analysis → signumhq.com${path}`,
      ko: `📊 전체 분석 보기 → signumhq.com${path}`,
      ja: `📊 詳細分析 → signumhq.com${path}`,
    };
    return { display: labels[lang], full };
  }

  const labels: Record<Lang, string> = {
    en: `📊 Full analysis → ${full}`,
    ko: `📊 전체 분석 보기 → ${full}`,
    ja: `📊 詳細分析 → ${full}`,
  };
  return { display: labels[lang], full };
}

// ── X(Twitter) weighted char count ──
// CJK, 이모지 등은 2 weighted chars로 카운트
// https://developer.twitter.com/en/docs/counting-characters
export function weightedLength(text: string): number {
  let count = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    // CJK Unified Ideographs, Hangul, Katakana/Hiragana, CJK Symbols, Fullwidth
    if (
      (code >= 0x1100 && code <= 0x11FF) ||   // Hangul Jamo
      (code >= 0x2E80 && code <= 0x9FFF) ||   // CJK
      (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul Syllables
      (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compat
      (code >= 0xFE30 && code <= 0xFE4F) ||   // CJK Forms
      (code >= 0xFF00 && code <= 0xFFEF) ||   // Fullwidth
      (code >= 0x3000 && code <= 0x30FF) ||   // CJK Symbols + Kana
      (code >= 0x31F0 && code <= 0x31FF) ||   // Katakana ext
      (code >= 0x3200 && code <= 0x32FF) ||   // Enclosed CJK
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Ext A
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK Ext B
      (code >= 0x1F000 && code <= 0x1FAFF)    // Emoticons/Emoji
    ) {
      count += 2;
    } else {
      count += 1;
    }
  }
  return count;
}

// ── 글자 제한 자르기 + 해시태그 보존 ──
// weighted=true → X(Twitter) CJK 2-char 카운트 사용
// weighted=false → 일반 string.length (Threads, Pinterest, IG 등)
export function truncateWithTags(body: string, tags: string, maxChars: number, weighted = false): string {
  const measure = weighted ? (s: string) => weightedLength(s) : (s: string) => s.length;
  const tagsWeight = measure(tags) + 2; // \n\n + tags
  const bodyLimit = maxChars - tagsWeight;
  
  if (measure(body) <= bodyLimit) {
    return `${body}\n\n${tags}`;
  }
  
  // 1차: 문장 단위로 자르기
  const sentences = body.split(/(?<=[.!?。！？])\s*/);
  let trimmed = '';
  let nextIdx = 0;
  for (let i = 0; i < sentences.length; i++) {
    const candidate = trimmed + (trimmed ? ' ' : '') + sentences[i];
    if (measure(candidate) > bodyLimit - 6) {
      nextIdx = i;
      break;
    }
    trimmed = candidate;
    nextIdx = i + 1;
  }
  
  // 2차: 남은 공간이 15자 이상이면 단어 단위로 채움
  const remaining = bodyLimit - measure(trimmed) - 8;
  if (remaining >= 15 && nextIdx < sentences.length) {
    const nextSentence = sentences[nextIdx];
    const words = nextSentence.split(/\s+/);
    let wordFill = '';
    for (const word of words) {
      const candidate = wordFill ? `${wordFill} ${word}` : word;
      if (measure(candidate) > remaining) break;
      wordFill = candidate;
    }
    if (measure(wordFill) >= 10) {
      trimmed += (trimmed ? ' ' : '') + wordFill + '...';
    }
  }
  
  if (!trimmed) {
    // 글자 단위 fallback
    let fallback = '';
    for (const ch of body) {
      if (measure(fallback + ch) > bodyLimit - 6) break;
      fallback += ch;
    }
    trimmed = fallback + '...';
  }
  return `${trimmed}\n\n${tags}`;
}
