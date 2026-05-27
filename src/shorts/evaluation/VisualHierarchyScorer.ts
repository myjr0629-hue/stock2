// ============================================================================
// Visual Hierarchy Scorer
// ============================================================================
import type { FrameData } from './FrameAnalyzer';

export class VisualHierarchyScorer {
  static evaluate(frames: FrameData[]): { score: number; notes: string[] } {
    let score = 100;
    const notes: string[] = [];

    // Rule: SPY Price must NOT appear in first 2 seconds
    const hookFrames = frames.filter(f => f.timeSec < 2.0);
    const hasSPYPriceInHook = hookFrames.some(f => f.hasSPYPrice);
    
    if (hasSPYPriceInHook) {
      score -= 40;
      notes.push("CRITICAL: SPY Price appears in first 2 seconds, destroying 1.3% hero clarity.");
    } else {
      notes.push("Hierarchy intact: 1.3% is the sole hero in hook.");
    }

    // Check for collision risk
    // If text density is too high in the hook
    const hookTextElements = hookFrames.length > 0 ? hookFrames[0].textElements.length : 0;
    if (hookTextElements > 3) {
      score -= 20;
      notes.push("Too many text elements in hook. Risk of visual collision.");
    }

    return {
      score: Math.max(0, score),
      notes
    };
  }
}
