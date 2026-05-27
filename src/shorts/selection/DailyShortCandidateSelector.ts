// ============================================================================
// Daily Short Candidate Selector
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';

export interface MarketDataPoint {
  ticker: string;
  price: number;
  callWall: number;
  putFloor: number;
  gammaFlip: number;
  gexRegime: 'positive' | 'negative' | 'neutral';
  volumePercentile: number;
  isIndex: boolean;
}

export interface CandidateResult {
  ticker: string;
  hookIdea: string;
  coreDataPoint: string;
  whyViewerShouldCare: string;
  visualMetaphor: string;
  recommendedTemplate: string;
  complianceSafeWording: string;
  expectedLockInScore: number;
  category: 'broad_market' | 'ticker_spotlight' | 'education';
}

export class DailyShortCandidateSelector {
  static select(marketData: MarketDataPoint[]): CandidateResult[] {
    const candidates: CandidateResult[] = [];

    // 1. Broad Market Selection (e.g., SPY, QQQ)
    const indices = marketData.filter(m => m.isIndex);
    if (indices.length > 0) {
      // Pick the one closest to a wall
      const idx = indices[0];
      const distPercent = Math.abs((idx.callWall - idx.price) / idx.price * 100).toFixed(1);
      candidates.push({
        ticker: idx.ticker,
        hookIdea: `${idx.ticker} is ${distPercent}% below a hidden Call Wall`,
        coreDataPoint: `${distPercent}% gap`,
        whyViewerShouldCare: 'This is where pressure can build.',
        visualMetaphor: 'Bracket tightening against a glowing wall',
        recommendedTemplate: 'MarketPressureBrief',
        complianceSafeWording: 'Not a prediction. A pressure map.',
        expectedLockInScore: 92,
        category: 'broad_market'
      });
    }

    // 2. Ticker Spotlight (e.g., NVDA, TSLA)
    const equities = marketData.filter(m => !m.isIndex).sort((a, b) => b.volumePercentile - a.volumePercentile);
    if (equities.length > 0) {
      const eq = equities[0];
      candidates.push({
        ticker: eq.ticker,
        hookIdea: `${eq.ticker} has a hidden wall above price`,
        coreDataPoint: `Call Wall at ${eq.callWall}`,
        whyViewerShouldCare: 'Most charts miss this structural boundary.',
        visualMetaphor: 'Price line approaching a thick colored threshold',
        recommendedTemplate: 'TickerSpotlight',
        complianceSafeWording: 'SignumHQ shows the structure behind price.',
        expectedLockInScore: 88,
        category: 'ticker_spotlight'
      });
    }

    // 3. Education
    candidates.push({
      ticker: 'EDU',
      hookIdea: 'A normal chart shows price. Not pressure.',
      coreDataPoint: 'Price alone is incomplete',
      whyViewerShouldCare: 'Trading blind without options data is risky.',
      visualMetaphor: 'Hard split screen: Normal vs SignumHQ Layer',
      recommendedTemplate: 'HiddenLayerEducation',
      complianceSafeWording: 'Understand the hidden layer.',
      expectedLockInScore: 85,
      category: 'education'
    });

    return candidates;
  }

  static writeMockOutput(dir: string) {
    const mockData: MarketDataPoint[] = [
      { ticker: 'SPY', price: 592.31, callWall: 600, putFloor: 580, gammaFlip: 588, gexRegime: 'positive', volumePercentile: 99, isIndex: true },
      { ticker: 'NVDA', price: 130.50, callWall: 140, putFloor: 120, gammaFlip: 125, gexRegime: 'positive', volumePercentile: 95, isIndex: false }
    ];

    const results = this.select(mockData);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'daily_short_candidates.json'), JSON.stringify(results, null, 2));
    console.log('Generated out/daily_short_candidates.json');
  }
}
