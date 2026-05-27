// ============================================================================
// Viewer Lock-in Simulator
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import { FrameAnalyzer } from './FrameAnalyzer';
import { ComplianceLanguageGate } from './ComplianceLanguageGate';
import { ShortsPsychologyScorer } from './ShortsPsychologyScorer';
import { SilentFirstScorer } from './SilentFirstScorer';
import { VisualHierarchyScorer } from './VisualHierarchyScorer';
import { RetentionRiskScorer } from './RetentionRiskScorer';
import { CompressionRiskScorer } from './CompressionRiskScorer';
import { ProductDesireScorer } from './ProductDesireScorer';

interface SimulationInput {
  videoId: string;
  durationSec: number;
  scriptText: string;
  hasPublicData: boolean;
  hasCompressionTest: boolean;
}

export class ViewerLockInSimulator {
  static runSimulation(input: SimulationInput, outputDir: string, versionSuffix: string = '') {
    console.log(`\n--- Running Viewer Lock-in Simulation for [${input.videoId}] ---`);

    // 1. Compliance Check
    const compliance = ComplianceLanguageGate.evaluate(input.scriptText);
    if (!compliance.passed) {
      console.error('HARD FAIL: Compliance Violation detected:', compliance.violations);
      this.writeReport(input.videoId, outputDir, { status: 'FAILED_COMPLIANCE', violations: compliance.violations }, versionSuffix);
      return;
    }

    // 2. Frame Extraction
    const frames = FrameAnalyzer.extractSimulatedData(input.videoId, input.durationSec);

    // 3. Sub-scorers
    const psych = ShortsPsychologyScorer.evaluate(frames);
    const silent = SilentFirstScorer.evaluate(frames);
    const hierarchy = VisualHierarchyScorer.evaluate(frames);
    const retention = RetentionRiskScorer.evaluate(frames);
    const compression = CompressionRiskScorer.evaluate();
    const product = ProductDesireScorer.evaluate(frames);

    // 4. Aggregation
    let rawScore = Math.round(
      (psych.score * 0.3) + 
      (silent.score * 0.15) + 
      (hierarchy.score * 0.2) + 
      (retention.score * 0.15) + 
      (product.score * 0.2)
    );

    // 5. Hard Scoring Caps (Mission 16 Calibration)
    let totalScore = rawScore;
    if (!input.hasPublicData) {
      totalScore = Math.min(totalScore, 88);
      psych.notes.push("SCORE CAP: No public upload data exists. Max score = 88.");
    }
    if (!input.hasCompressionTest) {
      totalScore = Math.min(totalScore, 86);
      compression.notes.push("SCORE CAP: Compression test not run. Max score = 86.");
    }
    if (silent.score < 90) {
      totalScore = Math.min(totalScore, 82);
      silent.notes.push("SCORE CAP: Silent-first score is weak. Max score = 82.");
    }
    if (hierarchy.score < 90) {
      totalScore = Math.min(totalScore, 83); // Simulating SPY Price competition cap
    }
    if (product.score < 90) {
      totalScore = Math.min(totalScore, 82);
    }

    let decision = 'REJECTED';
    if (totalScore >= 90) decision = 'PUBLIC_TEST_APPROVED (PROVEN)';
    else if (totalScore >= 85) decision = 'PUBLIC_TEST_APPROVED (TEST RUN)';
    else if (totalScore >= 80) decision = 'COMPRESSION_CHECK_ONLY';
    else decision = 'NEEDS_REVISION';

    const report = {
      videoId: input.videoId,
      durationSec: input.durationSec,
      status: 'PASSED_COMPLIANCE',
      decision,
      totalScore,
      breakdown: {
        psychology: psych.score,
        silentFirst: silent.score,
        hierarchy: hierarchy.score,
        retention: retention.score,
        productDesire: product.score,
        compressionRisk: compression.score
      },
      notes: {
        psychology: psych.notes,
        silentFirst: silent.notes,
        hierarchy: hierarchy.notes,
        retention: retention.notes,
        productDesire: product.notes,
        compressionRisk: compression.notes
      }
    };

    this.writeReport(input.videoId, outputDir, report, versionSuffix);
    console.log(`Simulation complete. Raw: ${rawScore} -> Capped: ${totalScore}. Decision: ${decision}`);
  }

  private static writeReport(id: string, dir: string, report: any, versionSuffix: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write JSON
    const suffix = versionSuffix ? `_${versionSuffix}` : '';
    const jsonPath = path.join(dir, `${id}_viewer_lockin_simulation${suffix}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Write MD
    const mdPath = path.join(dir, `${id}_viewer_lockin_simulation${suffix}.md`);
    let md = `# Viewer Lock-in Simulation Report: ${id}\n\n`;
    md += `**Decision**: ${report.decision || report.status}\n`;
    
    if (report.totalScore) {
      md += `**Total Score**: ${report.totalScore}/100\n\n`;
      md += `## Score Breakdown\n`;
      md += `- Psychology (Hook/FOMO/Tension): ${report.breakdown.psychology}\n`;
      md += `- Visual Hierarchy: ${report.breakdown.hierarchy}\n`;
      md += `- Product Desire Contrast: ${report.breakdown.productDesire}\n`;
      md += `- Silent-first Readability: ${report.breakdown.silentFirst}\n`;
      md += `- Retention/Pacing: ${report.breakdown.retention}\n`;
      md += `- Compression Quality Est: ${report.breakdown.compressionRisk}\n\n`;

      md += `## Key Feedback\n`;
      Object.keys(report.notes).forEach(k => {
        md += `### ${k}\n`;
        report.notes[k].forEach((n: string) => md += `- ${n}\n`);
      });
    }

    if (report.violations) {
      md += `\n## Compliance Violations\n`;
      report.violations.forEach((v: string) => md += `- Forbidden word: ${v}\n`);
    }

    fs.writeFileSync(mdPath, md);
  }
}
