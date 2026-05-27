// ============================================================================
// Monetization Fit Scorer — Does this video serve SignumHQ business?
// ============================================================================

import type { MonetizationFitScore, ShortsVideoInput } from '../types';

export function scoreMonetizationFit(input: ShortsVideoInput): MonetizationFitScore {
  const reasons: string[] = [];

  // 1. SignumHQ Data Uniqueness (/25) — is this data SignumHQ-exclusive?
  let dataUniqueness = 0;
  const viz = input.structureVisual;
  if (viz.callWall || viz.putFloor) { dataUniqueness += 10; reasons.push('Uses Call Wall / Put Floor (SignumHQ-unique)'); }
  if (viz.gammaFlipLevel) { dataUniqueness += 8; reasons.push('Uses Gamma Flip level (SignumHQ-unique)'); }
  if (/hidden|invisible|can't see|not on/i.test(input.hook)) { dataUniqueness += 7; reasons.push('Hook emphasizes hidden data layer'); }

  // 2. Paid Feature Relevance (/25) — does it make paid features desirable?
  let paidFeatureRelevance = 0;
  const productBeat = input.scriptBeats.find(b => b.label === 'product');
  if (productBeat) {
    paidFeatureRelevance += 10; reasons.push('Has product connection beat');
    if (/every day|real.?time|30 tickers/i.test(productBeat.text)) {
      paidFeatureRelevance += 8; reasons.push('Product beat creates ongoing value proposition');
    }
    if (/track|monitor|watch/i.test(productBeat.text)) {
      paidFeatureRelevance += 7; reasons.push('Product beat implies continuous service');
    }
  }

  // 3. Trust Building (/20) — does it build institutional credibility?
  let trustBuilding = 0;
  if (input.disclaimer && input.disclaimer.length > 10) { trustBuilding += 5; reasons.push('Has clear disclaimer'); }
  const meaningBeat = input.scriptBeats.find(b => b.label === 'meaning');
  if (meaningBeat && /not a.*prediction|not.*direction/i.test(meaningBeat.text)) {
    trustBuilding += 10; reasons.push('Explicitly disclaims direction/prediction');
  }
  if (input.dataCards.length > 0 && input.dataCards.length <= 3) { trustBuilding += 5; reasons.push('Shows real data without clutter'); }

  // 4. Site Visit Motivation (/20) — will this make someone visit signumhq.com?
  let siteVisitMotivation = 0;
  if (input.cta && /see|discover|explore/i.test(input.cta)) { siteVisitMotivation += 7; reasons.push('CTA has discovery language'); }
  if (input.format === 'viral' || input.format === 'conversion') { siteVisitMotivation += 6; reasons.push(`Format type: ${input.format}`); }
  if (productBeat && /signum/i.test(productBeat.text)) { siteVisitMotivation += 7; reasons.push('Product beat names SignumHQ'); }

  // 5. Compliance Safety (/10) — no risk of regulatory trouble
  let complianceSafety = 0;
  const allText = [input.hook, ...input.scriptBeats.map(b => b.text), input.cta].join(' ');
  const forbidden = /\b(buy|sell|long this|short this|guaranteed|will go up|will crash|profit)\b/i;
  if (!forbidden.test(allText)) { complianceSafety += 10; reasons.push('No forbidden language found'); }

  const totalScore = dataUniqueness + paidFeatureRelevance + trustBuilding + siteVisitMotivation + complianceSafety;

  return {
    totalScore,
    dataUniqueness,
    paidFeatureRelevance,
    trustBuilding,
    siteVisitMotivation,
    complianceSafety,
    reasons,
    pass: totalScore >= 75,
  };
}
