// ============================================================================
// Product Desire Scorer
// ============================================================================
import type { FrameData } from './FrameAnalyzer';

export class ProductDesireScorer {
  static evaluate(frames: FrameData[]): { score: number; notes: string[] } {
    let score = 0;
    const notes: string[] = [];

    // Analyze if there is a distinct "product reveal" phase
    const revealFrames = frames.filter(f => f.hasProductReveal);
    if (revealFrames.length > 0) {
      score += 40;
      notes.push("Product reveal phase detected.");
      
      const hasNormalChartText = revealFrames.some(f => f.textElements.includes('NORMAL CHART'));
      const hasSignumHQText = revealFrames.some(f => f.textElements.includes('SIGNUMHQ LAYER'));
      
      if (hasNormalChartText && hasSignumHQText) {
        score += 50;
        notes.push("Strong before/after contrast established (Normal vs SignumHQ).");
      }
    } else {
      notes.push("Missing strong product contrast or reveal.");
    }

    return {
      score: Math.min(100, score),
      notes
    };
  }
}
