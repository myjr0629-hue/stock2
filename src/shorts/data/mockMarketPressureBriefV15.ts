import { ShortsVideoInput } from '../types';

export const createMockMarketPressureBriefV15Input = (): any => {
  return {
    theme: 'dark',
    ticker: 'SPY',
    currentPrice: 592.31,
    structure: {
      callWall: 600,
      putFloor: 580,
      gammaFlip: 588,
      zeroGamma: 588,
    },
    narrative: {
      hook: 'SPY looks normal.\nBut the wall is only 1.3% away.',
      insight: 'Most charts miss this layer.\nPressure can build here.',
      reveal: 'Not a prediction.\nA pressure map.',
      cta: 'SignumHQ shows the structure behind price.',
    },
    brand: {
      logoUrl: '/logo.png',
      website: 'SIGNUMHQ.COM',
    },
  };
};
