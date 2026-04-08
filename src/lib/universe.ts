// Master Universe — 1000 tickers (Lambda와 동일 소스)
// 단일 소스: data/stock_universe_us800.json
// Lambda (signum-harvest)와 Vercel이 항상 동기화됨
//
// Used by:
//   1. scripts/deploy-lambda-v7.js (signum-harvest) — Lambda 빌드 시 직접 읽음
//   2. src/app/api/command/unified/route.ts — 유니버스 판별

import universeData from '../../data/stock_universe_us800.json';

export const UNIVERSE: string[] = universeData.symbols;
