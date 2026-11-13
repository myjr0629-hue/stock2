/** StickyFoundingBar 제외 경로 — 실적 SEO 허브·종목 페이지만 빠지고 나머지는 그대로(2026-11-13). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isFoundingBarExcludedPath } from '../src/components/landing/foundingBarExclude';

test('실적 허브·종목 페이지는 제외(로케일 접두 유무 모두)', () => {
  for (const p of ['/earnings', '/earnings/', '/earnings/NVDA', '/earnings/BRK.B', '/en/earnings', '/ko/earnings', '/ja/earnings/', '/en/earnings/NVDA', '/ko/earnings/AAPL/', '/ja/earnings/TSLA']) {
    assert.equal(isFoundingBarExcludedPath(p), true, p);
  }
});

test('다른 경로는 띠 유지', () => {
  for (const p of ['/', '/en', '/ko/', '/pricing', '/en/pricing', '/earnings-week', '/en/earnings-week', '/ko/earnings-week/', '/flow/NVDA', '/en/flow/NVDA', '/today', '/en/earnings/NVDA/extra', '/fr/earnings', '/en/s/earn/NVDA', '/learn/earnings', '', null, undefined]) {
    assert.equal(isFoundingBarExcludedPath(p as string), false, String(p));
  }
});
