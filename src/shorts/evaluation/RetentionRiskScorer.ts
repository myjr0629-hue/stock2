// ============================================================================
// Retention Risk Scorer
// ============================================================================
import type { FrameData } from './FrameAnalyzer';

export class RetentionRiskScorer {
  static evaluate(frames: FrameData[]): { score: number; notes: string[] } {
    let score = 100;
    const notes: string[] = [];

    // Analyze motion density to find dead holds > 3 seconds
    let currentHold = 0;
    const maxHoldAllowed = 3.0; // seconds

    let lastMotionTime = 0;

    for (const f of frames) {
      if (f.motionDensityScore > 0.8) {
        lastMotionTime = f.timeSec;
      } else {
        const timeSinceMotion = f.timeSec - lastMotionTime;
        if (timeSinceMotion > maxHoldAllowed) {
          score -= 10;
          notes.push(`Dead hold detected at ${f.timeSec.toFixed(1)}s (no significant motion for >3s).`);
          lastMotionTime = f.timeSec; // reset to avoid spamming
        }
      }
    }

    if (score === 100) {
      notes.push("Excellent pacing. No dead holds > 3s detected.");
    }

    return {
      score: Math.max(0, score),
      notes
    };
  }
}
