// ============================================================================
// Frame Analyzer
// ============================================================================

export interface FrameData {
  frameNumber: number;
  timeSec: number;
  textElements: string[];
  hasSPYPrice: boolean;
  hasHookData: boolean;
  hasProductReveal: boolean;
  motionDensityScore: number; // 0 to 1
}

export class FrameAnalyzer {
  static extractSimulatedData(videoId: string, durationSec: number): FrameData[] {
    // In a real environment, this might use computer vision or Remotion metadata extraction.
    // For this simulation, we model the sequence mathematically based on V14.1 spec.
    const frames: FrameData[] = [];
    const fps = 30;
    const totalFrames = durationSec * fps;

    for (let f = 0; f < totalFrames; f++) {
      const timeSec = f / fps;
      frames.push({
        frameNumber: f,
        timeSec,
        textElements: this.simTextElements(timeSec),
        hasSPYPrice: timeSec >= 4.0 && timeSec < 6.8,
        hasHookData: timeSec < 2.0,
        hasProductReveal: timeSec >= 9.8 && timeSec < 14.0,
        motionDensityScore: this.simMotionDensity(timeSec)
      });
    }

    return frames;
  }

  private static simTextElements(timeSec: number): string[] {
    if (timeSec < 2.0) return ['SPY', '1.3% BELOW', 'HIDDEN CALL WALL'];
    if (timeSec < 4.0) return ['MOST CHARTS', 'MISS THIS LAYER'];
    if (timeSec < 6.8) return ['THIS IS WHERE', 'PRESSURE CAN BUILD', 'SPY PRICE', '$592.31'];
    if (timeSec < 9.8) return ['NOT A PREDICTION.', 'A PRESSURE MAP.'];
    if (timeSec < 14.0) return ['NORMAL CHART', 'PRICE ONLY', 'SIGNUMHQ LAYER', 'WALL / FLOOR / FLIP'];
    if (timeSec < 17.2) return ['SIGNUMHQ SHOWS', 'THE STRUCTURE', 'BEHIND PRICE'];
    return ['SEE THE STRUCTURE BEHIND PRICE.', 'SIGNUMHQ.COM'];
  }

  private static simMotionDensity(timeSec: number): number {
    // Spikes during transitions: 0, 2, 4, 6.8, 9.8, 14, 17.2
    const beats = [0, 2, 4, 6.8, 9.8, 14, 17.2];
    for (const b of beats) {
      if (Math.abs(timeSec - b) < 0.5) return 0.9;
    }
    // Ambient motion otherwise
    return 0.4;
  }
}
