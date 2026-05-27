// ============================================================================
// Shorts Psychology Scorer
// ============================================================================
import type { FrameData } from './FrameAnalyzer';

export class ShortsPsychologyScorer {
  static evaluate(frames: FrameData[]): { score: number; notes: string[] } {
    let score = 0;
    const notes: string[] = [];

    // 1. Curiosity Gap & Hook
    const hookFrames = frames.filter(f => f.timeSec < 2.0);
    const hasDataHook = hookFrames.some(f => f.hasHookData);
    if (hasDataHook) {
      score += 35;
      notes.push("Data Hook (SPY 1.3%) creates immediate curiosity gap.");
    } else {
      notes.push("Missing concrete data hook in first 2 seconds.");
    }

    // 2. FOMO trigger
    const fomoFrames = frames.filter(f => f.timeSec >= 2.0 && f.timeSec < 4.0);
    const hasFOMOText = fomoFrames.some(f => f.textElements.includes('MISS THIS LAYER'));
    if (hasFOMOText) {
      score += 30;
      notes.push("Strong FOMO trigger ('Miss this layer') secures retention.");
    }

    // 3. Tension Build
    const pressureFrames = frames.filter(f => f.timeSec >= 4.0 && f.timeSec < 6.8);
    if (pressureFrames.length > 0) {
      score += 30;
      notes.push("Spatial tension phase detected ('Pressure can build').");
    }

    // Max 95 for psychology alone, requiring perfection.
    return {
      score: Math.min(100, score),
      notes
    };
  }
}
