/**
 * 스마트 앱 배너 앱 고르기 — src/lib/seo/smartBanner.ts (예전 metadata 규칙과 같은 결과여야 한다)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/smartBanner.test.ts
 */
import assert from 'node:assert/strict';
import { smartBannerAppId } from '../src/lib/seo/smartBanner';
const SIGNUM = '6783130444', UC = '6788779895', WIM = '6794356135';
const cases: [string, string][] = [
  ['/ko', SIGNUM], ['/en', SIGNUM], ['/ja/', SIGNUM], ['', SIGNUM], ['/', SIGNUM],
  ['/en/pricing', SIGNUM], ['/ko/how-it-works', SIGNUM], ['/en/app', SIGNUM], ['/ko/rankings', SIGNUM],
  ['/ko/undercurrent', UC], ['/en/undercurrent/briefing', UC], ['/en/flow/NVDA', UC], ['/ja/tickers', UC], ['/ko/learn', UC], ['/en/learn/max-pain', UC],
  ['/en/wim', WIM], ['/ja/wim/NVDA', WIM],
  ['/en/flowchart', SIGNUM], ['/en/wimbledon', SIGNUM], ['/en/learning', SIGNUM],
];
for (const [p, want] of cases) assert.equal(smartBannerAppId(p), want, p);
console.log(`✅ smartBanner: ${cases.length}건 통과`);
