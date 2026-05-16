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

// ── 글자 제한 자르기 + 해시태그 보존 ──
export function truncateWithTags(body: string, tags: string, maxChars: number): string {
  const totalNeeded = tags.length + 2; // \n\n + tags
  const bodyLimit = maxChars - totalNeeded;
  
  if (body.length <= bodyLimit) {
    return `${body}\n\n${tags}`;
  }
  
  // 1차: 문장 단위로 자르기
  const sentences = body.split(/(?<=[.!?。！？])\s*/);
  let trimmed = '';
  let nextIdx = 0;
  for (let i = 0; i < sentences.length; i++) {
    if ((trimmed + (trimmed ? ' ' : '') + sentences[i]).length > bodyLimit - 3) {
      nextIdx = i;
      break;
    }
    trimmed += (trimmed ? ' ' : '') + sentences[i];
    nextIdx = i + 1;
  }
  
  // 2차: 남은 공간이 15자 이상이면 다음 문장에서 단어 단위로 채움
  const remaining = bodyLimit - trimmed.length - 4; // "..." + space
  if (remaining >= 15 && nextIdx < sentences.length) {
    const nextSentence = sentences[nextIdx];
    const words = nextSentence.split(/\s+/);
    let wordFill = '';
    for (const word of words) {
      const candidate = wordFill ? `${wordFill} ${word}` : word;
      if (candidate.length > remaining) break;
      wordFill = candidate;
    }
    if (wordFill.length >= 10) {
      trimmed += (trimmed ? ' ' : '') + wordFill + '...';
    }
  }
  
  if (!trimmed) trimmed = body.slice(0, bodyLimit - 3) + '...';
  return `${trimmed}\n\n${tags}`;
}
