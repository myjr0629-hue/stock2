// ============================================================================
// Quality Gate V2 — Strict pre-render validation
// No false 100/100. Honest assessment.
// ============================================================================

import type { QualityGateResult, ShortsVideoInput } from '../types';
import { runComplianceSafetyGate } from '../scoring/ComplianceSafetyGate';

export function runQualityGate(input: ShortsVideoInput): QualityGateResult {
  const failures: string[] = [];

  // 1. Single core insight
  const singleCoreInsight = !!input.hook && input.hook.length > 0 && input.hook.length <= 45;
  if (!singleCoreInsight) failures.push('Hook missing or exceeds 45 chars');

  // 2. Max 3 data cards
  const maxDataCards = input.dataCards.length <= 3;
  if (!maxDataCards) failures.push(`Too many data cards: ${input.dataCards.length}`);

  // 3. Compliance clean
  const allText = [input.hook, ...input.scriptBeats.map(b => b.text), ...input.captions.map(c => c.text), input.cta, input.disclaimer].join(' ');
  const compliance = runComplianceSafetyGate(allText);
  if (!compliance.pass) failures.push(...compliance.violations);

  // 4. Disclaimer present (>10 chars)
  const disclaimerPresent = !!input.disclaimer && input.disclaimer.length > 10;
  if (!disclaimerPresent) failures.push('Missing or short disclaimer');

  // 5. CTA present
  const ctaPresent = !!input.cta && input.cta.length > 3;
  if (!ctaPresent) failures.push('Missing CTA');

  // 6. First frame hook at 0s
  const hookBeat = input.scriptBeats.find(b => b.label === 'hook');
  const firstFrameExists = !!hookBeat && hookBeat.startSec === 0;
  if (!firstFrameExists) failures.push('No hook beat starting at 0s');

  // 7. Caption length (≤50 chars per segment)
  const captionLengthOk = input.captions.every(c => c.text.length <= 50);
  if (!captionLengthOk) failures.push('Caption segment exceeds 50 chars');

  // 8. Duration (25-30s for V3, was 30-38s)
  const durationOk = input.durationSec >= 25 && input.durationSec <= 30;
  if (!durationOk) failures.push(`Duration ${input.durationSec}s outside 25-30s range`);

  // 9. Resolution
  const resolutionOk = input.width === 1080 && input.height === 1920;
  if (!resolutionOk) failures.push(`Resolution ${input.width}x${input.height} not 1080x1920`);

  // 10. Mock data marked
  const mockDataMarked = !input.isMock || input.videoId.includes('mock');
  if (!mockDataMarked) failures.push('Mock data not marked in videoId');

  return {
    pass: failures.length === 0,
    checks: {
      singleCoreInsight,
      maxDataCards,
      complianceClean: compliance.pass,
      disclaimerPresent,
      ctaPresent,
      firstFrameExists,
      captionLengthOk,
      durationOk,
      resolutionOk,
      mockDataMarked,
    },
    failures,
  };
}
