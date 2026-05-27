// ============================================================================
// Compliance Language Gate
// ============================================================================

export class ComplianceLanguageGate {
  private static FORBIDDEN_WORDS = [
    'buy', 'sell', 'trade', 'entry', 'target', 'profit', 'crash',
    'will go up', 'will fall', 'guaranteed'
  ];

  private static ALLOWED_WORDS = [
    'may', 'can', 'pressure', 'structure', 'hidden layer', 
    'pressure map', 'not a prediction'
  ];

  static evaluate(script: string): { passed: boolean; violations: string[] } {
    const text = script.toLowerCase();
    const violations: string[] = [];

    for (const word of this.FORBIDDEN_WORDS) {
      if (text.includes(word)) {
        violations.push(word);
      }
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }
}
