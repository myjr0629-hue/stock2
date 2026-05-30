// Quick validation script for Mission 02 — run with: npx tsx scripts/validate_shorts_m02.ts

import { createMockHiddenWallInput } from '../src/shorts/data/mockHiddenWallSnapshot';
import { scoreViewerLockIn } from '../src/shorts/scoring/ViewerLockInScorer';
import { scoreAlgorithmFit } from '../src/shorts/scoring/AlgorithmFitScorer';
import { scoreMonetizationFit } from '../src/shorts/scoring/MonetizationFitScorer';
import { validateVideoCompliance } from '../src/shorts/scoring/ComplianceSafetyGate';
import { runQualityGate } from '../src/shorts/qa/QualityGate';

const input = createMockHiddenWallInput();

console.log('=== SIGNUMHQ SHORTS ENGINE — MISSION 02 VALIDATION ===\n');
console.log(`Video ID: ${input.videoId}`);
console.log(`Template: ${input.template}`);
console.log(`Ticker: ${input.ticker} | Mock: ${input.isMock}`);
console.log(`Duration: ${input.durationSec}s | ${input.width}x${input.height} @ ${input.fps}fps`);
console.log(`Beats: ${input.scriptBeats.length} | Captions: ${input.captions.length} | Cards: ${input.dataCards.length}\n`);

// Viewer Lock-In Score
const lockIn = scoreViewerLockIn(input);
console.log(`--- Viewer Lock-In Score: ${lockIn.totalScore}/100 [${lockIn.pass ? 'PASS ✅' : 'FAIL ❌'}] ---`);
console.log(`  FirstFrameShock: ${lockIn.firstFrameShock}/25`);
console.log(`  CuriosityGap: ${lockIn.curiosityGap}/20`);
console.log(`  VisualMetaphor: ${lockIn.visualMetaphorStrength}/20`);
console.log(`  RetentionBeat: ${lockIn.retentionBeatDensity}/15`);
console.log(`  CognitiveSimplicity: ${lockIn.cognitiveSimplicity}/10`);
console.log(`  ProductCuriosity: ${lockIn.productCuriosity}/10\n`);

// Algorithm Fit Score
const algo = scoreAlgorithmFit(input);
console.log(`--- Algorithm Fit Score: ${algo.totalScore}/100 [${algo.pass ? 'PASS ✅' : 'FAIL ❌'}] ---`);
console.log(`  ScrollStop: ${algo.scrollStopPower}/25 | CuriosityGap: ${algo.threeSecondCuriosityGap}/20`);
console.log(`  Retention: ${algo.retentionBeatStrength}/20 | Share/Save: ${algo.shareSavePotential}/15`);
console.log(`  CommentTrigger: ${algo.commentTrigger}/10 | PlatformFit: ${algo.platformFit}/10\n`);

// Monetization Fit Score
const monet = scoreMonetizationFit(input);
console.log(`--- Monetization Fit Score: ${monet.totalScore}/100 [${monet.pass ? 'PASS ✅' : 'FAIL ❌'}] ---`);
console.log(`  DataUnique: ${monet.dataUniqueness}/25 | PaidRelevance: ${monet.paidFeatureRelevance}/25`);
console.log(`  Trust: ${monet.trustBuilding}/20 | SiteVisit: ${monet.siteVisitMotivation}/20`);
console.log(`  Compliance: ${monet.complianceSafety}/10\n`);

// Final Score
const finalScore = algo.totalScore * 0.55 + monet.totalScore * 0.35 + (monet.complianceSafety * 10) * 0.10;
console.log(`--- FINAL SCORE: ${finalScore.toFixed(1)}/100 ---\n`);

// Compliance
const compliance = validateVideoCompliance(input.scriptBeats, input.captions, input.cta, input.disclaimer);
console.log(`--- Compliance: ${compliance.pass ? 'PASS ✅' : 'FAIL ❌'} ---`);
if (!compliance.pass) compliance.violations.forEach(v => console.log(`  ⚠️ ${v}`));

// Quality Gate
const qa = runQualityGate(input);
console.log(`\n--- Quality Gate: ${qa.pass ? 'PASS ✅' : 'FAIL ❌'} ---`);
Object.entries(qa.checks).forEach(([k, v]) => console.log(`  ${v ? '✅' : '❌'} ${k}`));
if (!qa.pass) qa.failures.forEach(f => console.log(`  ⚠️ ${f}`));

console.log('\n=== VALIDATION COMPLETE ===');
