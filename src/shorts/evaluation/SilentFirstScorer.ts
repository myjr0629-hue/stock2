// ============================================================================
// Silent First Scorer
// ============================================================================
import type { FrameData } from './FrameAnalyzer';

export class SilentFirstScorer {
  static evaluate(frames: FrameData[]): { score: number; notes: string[] } {
    let score = 100;
    const notes: string[] = [];

    // Ensure there is large text coverage in every major phase
    const beats = [0.5, 3.0, 5.0, 8.0, 12.0, 15.0, 18.0];
    for (const b of beats) {
      const f = frames.find(frame => Math.abs(frame.timeSec - b) < 0.1);
      if (f && f.textElements.length === 0) {
        score -= 15;
        notes.push(`Silent failure risk: No clear text reading near ${b}s.`);
      }
    }

    if (score === 100) {
      notes.push("Video is fully comprehensible without audio.");
    }

    return {
      score: Math.max(0, score),
      notes
    };
  }
}
