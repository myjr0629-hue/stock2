// ============================================================================
// Algorithm Fit Scorer — Will it survive the first 3 seconds?
// Extends ViewerLockInScorer with platform-specific evaluation.
// ============================================================================

import type { AlgorithmFitScore, ShortsVideoInput } from '../types';
import { scoreViewerLockIn } from './ViewerLockInScorer';

export function scoreAlgorithmFit(input: ShortsVideoInput): AlgorithmFitScore {
  const lockIn = scoreViewerLockIn(input);
  const reasons: string[] = [];

  // 1. Scroll Stop Power (/25) — mapped from FirstFrameShock
  const scrollStopPower = lockIn.firstFrameShock;

  // 2. 3-Second Curiosity Gap (/20) — mapped from CuriosityGap
  const threeSecondCuriosityGap = lockIn.curiosityGap;

  // 3. Retention Beat Strength (/20)
  let retentionBeatStrength = 0;
  const beats = input.scriptBeats;
  if (beats.length >= 6) { retentionBeatStrength += 8; reasons.push('6+ beats for retention'); }
  const hasDataBeat = beats.some(b => b.label === 'data');
  const hasMetaphor = beats.some(b => b.label === 'metaphor');
  if (hasDataBeat && hasMetaphor) { retentionBeatStrength += 7; reasons.push('Has both data reveal and visual metaphor'); }
  if (input.captions.length >= 10) { retentionBeatStrength += 5; reasons.push('Dense caption coverage'); }

  // 4. Share / Save Potential (/15)
  let shareSavePotential = 0;
  if (/hidden|invisible|can't see|not on your/i.test(input.hook)) {
    shareSavePotential += 8; reasons.push('Hook creates "insider knowledge" shareability');
  }
  if (input.structureVisual.callWall || input.structureVisual.putFloor) {
    shareSavePotential += 7; reasons.push('Structure visual is save-worthy reference');
  }

  // 5. Comment Trigger (/10)
  let commentTrigger = 0;
  if (/wall|pressure|structure/i.test(input.hook)) {
    commentTrigger += 5; reasons.push('Hook invites "what wall?" comments');
  }
  if (input.ticker) { commentTrigger += 5; reasons.push('Named ticker drives discussion'); }

  // 6. Platform Fit (/10)
  let platformFit = 0;
  if (input.width === 1080 && input.height === 1920) { platformFit += 4; reasons.push('9:16 vertical format'); }
  if (input.durationSec >= 35 && input.durationSec <= 45) { platformFit += 3; reasons.push('Duration in sweet spot'); }
  if (input.captions.length > 0) { platformFit += 3; reasons.push('Has caption overlay (sound-off friendly)'); }

  const totalScore = scrollStopPower + threeSecondCuriosityGap + retentionBeatStrength + shareSavePotential + commentTrigger + platformFit;

  return {
    totalScore,
    scrollStopPower,
    threeSecondCuriosityGap,
    retentionBeatStrength,
    shareSavePotential,
    commentTrigger,
    platformFit,
    reasons,
    pass: totalScore >= 80,
  };
}
