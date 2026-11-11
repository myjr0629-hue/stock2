import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { alertSheetForBell, completeSuccessfulPro, finishAlertPaywall } from '../src/lib/app/watchlistAlertFlow';
import type { WatchlistUIState } from '../src/lib/app/watchlistUI';

const context = { ticker: 'NVDA', levels: null, levelsOut: true, levelsDelayAsOf: '2026-11-10', meta: { name: 'NVIDIA' } };

function flow() {
  let state: WatchlistUIState = { sheet: { ...alertSheetForBell(false, context), id: 1, trigger: null }, paywall: { lead: 'alerts', id: 2 }, toast: null };
  let opened: unknown = null;
  const success = () => finishAlertPaywall(state, 2, 1, () => { state = { ...state, paywall: null }; }, () => {
    const sheet = state.sheet;
    if (sheet?.kind === 'alertUpsell' && sheet.ticker) opened = { kind: 'alertSettings', ticker: sheet.ticker, levels: sheet.levels, levelsOut: sheet.levelsOut, levelsDelayAsOf: sheet.levelsDelayAsOf, meta: sheet.meta };
  });
  return { success, opened: () => opened, replacePaywall: () => { state = { ...state, paywall: null }; } };
}

test('구매 성공은 선택한 종목의 설정으로 한 번 돌아간다', () => {
  const f = flow();
  completeSuccessfulPro({ ok: true, isPro: true }, f.success);
  assert.deepEqual(f.opened(), { kind: 'alertSettings', ...context });
});

test('취소·구매 실패·복원 실패는 설정을 열지 않는다', () => {
  for (const result of [{ ok: false, isPro: false }, { ok: true, isPro: false }]) {
    const f = flow();
    completeSuccessfulPro(result, f.success);
    assert.equal(f.opened(), null);
  }
});

test('이미 PRO이면 벨에서 바로 같은 종목의 설정으로 간다', () => {
  assert.deepEqual(alertSheetForBell(true, context), { kind: 'alertSettings', ...context });
});

test('복원 성공은 설정을 열고, 닫은 페이월의 늦은 성공은 무시한다', () => {
  const f = flow();
  completeSuccessfulPro({ ok: true, isPro: true }, f.success);
  assert.deepEqual(f.opened(), { kind: 'alertSettings', ...context });
  const closed = flow();
  closed.replacePaywall();
  completeSuccessfulPro({ ok: true, isPro: true }, closed.success);
  assert.equal(closed.opened(), null);
});

test('화면 연결은 성공 결과와 월·연 필터를 사용하고 푸시 권한은 시트의 사용자 동작에 남긴다', () => {
  const paywall = fs.readFileSync('src/components/app/ProPaywall.tsx', 'utf8');
  const host = fs.readFileSync('src/components/app/watchlist/WatchlistHost.tsx', 'utf8');
  const upsell = fs.readFileSync('src/components/app/watchlist/ProUpsellSheet.tsx', 'utf8');
  const settings = fs.readFileSync('src/components/app/watchlist/AlertSettingsSheet.tsx', 'utf8');
  assert.match(paywall, /filter\(\(p\) => !subscriptionOnly \|\| p\.plan !== 'lifetime'\)/);
  assert.equal((paywall.match(/completeSuccessfulPro\(res, onPurchaseOrRestoreSuccess\)/g) ?? []).length, 2);
  assert.match(host, /subscriptionOnly: true, keepOpenWhilePro: true, onPurchaseOrRestoreSuccess: onSuccess/);
  assert.match(upsell, /sheet\?\.kind === 'alertUpsell'\) \|\| !monthly/);
  assert.match(settings, /syncAlertPrefs\(p, loc, \{ askPermission: firstOn \}\)/);
});
