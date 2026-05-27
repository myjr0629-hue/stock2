// ============================================================================
// Viewer Lock-In Scorer — The only metric that matters
// A video is good ONLY if it can lock the viewer in.
// ============================================================================

import type { ViewerLockInScore, ShortsVideoInput } from '../types';

export function scoreViewerLockIn(input: ShortsVideoInput): ViewerLockInScore {
  const reasons: string[] = [];

  // 1. First Frame Shock (/25)
  let firstFrameShock = 0;
  const hook = input.hook || '';
  if (hook.length > 0 && hook.length <= 40) { firstFrameShock += 10; reasons.push('Hook length optimal (≤40 chars)'); }
  else if (hook.length > 0) { firstFrameShock += 5; reasons.push('Hook exists but long'); }
  if (/not|hidden|invisible|can't see|never/i.test(hook)) { firstFrameShock += 8; reasons.push('Hook creates information gap'); }
  if (/wall|pressure|structure|beneath/i.test(hook)) { firstFrameShock += 7; reasons.push('Hook references hidden structure'); }

  // 2. Curiosity Gap (/20)
  let curiosityGap = 0;
  const curiosityBeat = input.scriptBeats.find(b => b.label === 'curiosity');
  if (curiosityBeat) {
    curiosityGap += 8;
    if (curiosityBeat.endSec - curiosityBeat.startSec <= 3) { curiosityGap += 6; reasons.push('Curiosity beat is tight (≤3s)'); }
    if (/most|only|never|don't/i.test(curiosityBeat.text)) { curiosityGap += 6; reasons.push('Curiosity uses exclusion language'); }
  }

  // 3. Visual Metaphor Strength (/20)
  let visualMetaphorStrength = 0;
  const metaphorBeat = input.scriptBeats.find(b => b.label === 'metaphor');
  if (metaphorBeat) {
    visualMetaphorStrength += 8;
    if (metaphorBeat.endSec - metaphorBeat.startSec >= 6) { visualMetaphorStrength += 6; reasons.push('Metaphor has breathing room (≥6s)'); }
    if (input.structureVisual.callWall || input.structureVisual.putFloor) { visualMetaphorStrength += 6; reasons.push('Structure visualization has real data'); }
  }

  // 4. Retention Beat Density (/15)
  let retentionBeatDensity = 0;
  const beatCount = input.scriptBeats.length;
  if (beatCount >= 6 && beatCount <= 9) { retentionBeatDensity += 10; reasons.push(`Beat count optimal (${beatCount})`); }
  else if (beatCount >= 4) { retentionBeatDensity += 5; }
  // Check no dead air > 1.5s (V3 strict rule)
  let hasDeadAir = false;
  for (let i = 1; i < input.scriptBeats.length; i++) {
    if (input.scriptBeats[i].startSec - input.scriptBeats[i - 1].endSec > 1.5) { hasDeadAir = true; break; }
  }
  if (!hasDeadAir) { retentionBeatDensity += 5; reasons.push('No dead air gaps > 1.5s'); }

  // 5. Cognitive Simplicity (/10)
  let cognitiveSimplicity = 0;
  if (!input.dataCards || input.dataCards.length === 0) { cognitiveSimplicity += 5; reasons.push('No boxed data cards (using integrated visual metrics)'); }
  else if (input.dataCards.length <= 3) { cognitiveSimplicity += 2; reasons.push(`Data cards ≤ 3 (${input.dataCards.length})`); }
  const revealBeat = input.scriptBeats.find(b => b.label === 'data');
  if (revealBeat && (revealBeat.text.match(/\$/g) || []).length <= 3) { cognitiveSimplicity += 5; reasons.push('Data reveal has ≤ 3 numbers'); }

  // 6. Product Curiosity (/10)
  let productCuriosity = 0;
  const productBeat = input.scriptBeats.find(b => b.label === 'product');
  if (productBeat) {
    if (/signum/i.test(productBeat.text)) { productCuriosity += 5; reasons.push('Product beat mentions SignumHQ'); }
    if (/every day|real.?time|hidden/i.test(productBeat.text)) { productCuriosity += 5; reasons.push('Product beat creates ongoing need'); }
  }

  const totalScore = firstFrameShock + curiosityGap + visualMetaphorStrength + retentionBeatDensity + cognitiveSimplicity + productCuriosity;

  return {
    totalScore,
    firstFrameShock,
    curiosityGap,
    visualMetaphorStrength,
    retentionBeatDensity,
    cognitiveSimplicity,
    productCuriosity,
    reasons,
    pass: totalScore >= 85, // V3 strict threshold
  };
}
