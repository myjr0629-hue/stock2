// ============================================================================
// Compliance Safety Gate — Hard-block forbidden language
// Zero tolerance. If it fails, the video does not render.
// ============================================================================

import type { ComplianceSafetyResult } from '../types';

const FORBIDDEN_PATTERNS: [RegExp, string][] = [
  [/\b(buy|buying)\b/gi, 'buy'],
  [/\b(sell|selling)\b/gi, 'sell'],
  [/\blong this\b/gi, 'long this'],
  [/\bshort this\b/gi, 'short this'],
  [/\bguarantee[ds]?\b/gi, 'guaranteed'],
  [/\bwill go up\b/gi, 'will go up'],
  [/\bwill crash\b/gi, 'will crash'],
  [/\beasy profit\b/gi, 'easy profit'],
  [/\bentry point\b/gi, 'entry point'],
  [/\btarget price\b/gi, 'target price'],
  [/\bnext breakout\b/gi, 'next breakout'],
  [/\bmake money fast\b/gi, 'make money fast'],
  [/\bthis trade\b/gi, 'this trade'],
  [/\bbullish\b/gi, 'bullish'],
  [/\bbearish\b/gi, 'bearish'],
  [/\bprofit[s]?\b/gi, 'profit'],
  [/\bopportunity\b/gi, 'opportunity'],
];

export function runComplianceSafetyGate(text: string): ComplianceSafetyResult {
  const violations: string[] = [];

  for (const [pattern, label] of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(`Forbidden language detected: "${label}"`);
    }
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
  }

  return {
    pass: violations.length === 0,
    violations,
  };
}

/** Check all script beats + captions for compliance */
export function validateVideoCompliance(
  beats: { text: string }[],
  captions: { text: string }[],
  cta: string,
  disclaimer: string,
): ComplianceSafetyResult {
  const allText = [
    ...beats.map(b => b.text),
    ...captions.map(c => c.text),
    cta,
    disclaimer,
  ].join(' ');

  return runComplianceSafetyGate(allText);
}
