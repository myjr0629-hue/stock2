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
// 공유 링크(from=share)로 온 /flow/* 는 SIGNUM(공유 출처·착지 카드와 같은 앱) — UC·WIM·홈은 그대로
const shareCases: [string, string][] = [['/en/flow/NVDA', SIGNUM], ['/ko/flow/TSLA', SIGNUM], ['/ko/undercurrent', UC], ['/ja/wim', WIM], ['/ko', SIGNUM]];
for (const [p, want] of shareCases) assert.equal(smartBannerAppId(p, true), want, `share ${p}`);
cases.push(...shareCases);
console.log(`✅ smartBanner: ${cases.length}건 통과`);
