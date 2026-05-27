// ============================================================================
// RemotionRenderService — Orchestrate the full render pipeline
// data → score → script → voice → broll → render → QA
// ============================================================================

import type { ShortsVideoInput } from '../types';
import { runQualityGate } from '../qa/QualityGate';
import { scoreViewerLockIn } from '../scoring/ViewerLockInScorer';
import { scoreAlgorithmFit } from '../scoring/AlgorithmFitScorer';
import { scoreMonetizationFit } from '../scoring/MonetizationFitScorer';

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  scores: {
    viewerLockIn: number;
    algorithmFit: number;
    monetizationFit: number;
    finalScore: number;
  };
  qualityGatePass: boolean;
  failures: string[];
}

/** Validate and score a video input before rendering */
export function preRenderValidation(input: ShortsVideoInput): RenderResult {
  const lockIn = scoreViewerLockIn(input);
  const algo = scoreAlgorithmFit(input);
  const monet = scoreMonetizationFit(input);
  const qa = runQualityGate(input);

  const finalScore = algo.totalScore * 0.55 + monet.totalScore * 0.35 + monet.complianceSafety * 10 * 0.10;

  const failures: string[] = [];
  if (!lockIn.pass) failures.push(`ViewerLockIn score ${lockIn.totalScore} below 80`);
  if (!algo.pass) failures.push(`AlgorithmFit score ${algo.totalScore} below 80`);
  if (!monet.pass) failures.push(`MonetizationFit score ${monet.totalScore} below 75`);
  if (!qa.pass) failures.push(...qa.failures);

  return {
    success: failures.length === 0,
    scores: {
      viewerLockIn: lockIn.totalScore,
      algorithmFit: algo.totalScore,
      monetizationFit: monet.totalScore,
      finalScore: Math.round(finalScore * 10) / 10,
    },
    qualityGatePass: qa.pass,
    failures,
  };
}

/** 
 * Full render pipeline (MISSION 03+)
 * For now, use Remotion CLI: npx remotion render src/remotion/index.ts HiddenWallShort out/video.mp4
 */
export async function renderVideo(input: ShortsVideoInput): Promise<RenderResult> {
  // 1. Pre-render validation
  const validation = preRenderValidation(input);
  if (!validation.success) {
    console.error('[Render] Pre-render validation FAILED:', validation.failures);
    return validation;
  }

  // 2. Render via Remotion Lambda or CLI
  // MISSION 03: Wire to remotionLambda.ts for production rendering
  console.log('[Render] Pre-render validation PASSED. Use CLI to render:');
  console.log(`  npx remotion render src/remotion/index.ts ${input.template} out/${input.videoId}.mp4`);

  return validation;
}
