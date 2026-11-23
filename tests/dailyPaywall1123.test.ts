/**
 * ★11/23 무료 네이티브 사용자 «하루 한 번» 앱 열 때 체험 페이월(daily_open) 판정·표식·끄기 스위치·겹침 규칙.
 *   ① 가벼운 문: 웹·첫 실행 직후 세션·오늘 이미 봄·저장소 없음 = 안 실음 · 어제 봤으면 실음
 *   ② dailyStep: PRO·공유 PRO·오늘 봄·결제 불가·가격 없음 = stop · 결제 중/다른 시트/오늘 다른 페이월/문서·설정 화면/뒤/게이트·코드 복귀·평점·광고 = later · 모름 = wait
 *   ③ 표식: 현지 날짜 · 쓰기 실패 = false · 다음 날엔 다시
 *   ④ 끄기 스위치: 레디스·환경변수 값 → 범위 · 응답 해석(모르면 꺼짐)
 *   ⑤ 평점 대기·직후 30초 · 경로 규칙
 *   ⑥ 퍼널 출처 등록(스키마·mkt-funnel 같은 목록) · 레이아웃에 호스트 1개 · 판정기가 trialHead·src daily_open 으로 페이월을 연다
 * 실행: npx tsx --test tests/dailyPaywall1123.test.ts  (네트워크·실결제 없음)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const dp = require('../src/lib/app/dailyPaywall') as typeof import('../src/lib/app/dailyPaywall');

function mem(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}
const NOW = new Date(2026, 10, 23, 21, 0, 0).getTime();
const YDAY = NOW - 24 * 3600_000;
const TODAY = dp.dailyDay(NOW);

const base = (): import('../src/lib/app/dailyPaywall').DailyState => ({
  iapAvailable: true, ready: true, isPro: false, sharedPro: false, pending: false, offerCount: 2, shownToday: false,
  routeOk: true, otherToday: false, dialogOpen: false, visible: true, gateBusy: false, redeemBusy: false, reviewBusy: false, adBusy: false,
});

test('① 가벼운 문', () => {
  const ok = { native: true, onboardedAtStart: true, store: mem(), now: NOW };
  assert.equal(dp.dailyPreGate(ok), true);
  assert.equal(dp.dailyPreGate({ ...ok, native: false }), false, '웹');
  assert.equal(dp.dailyPreGate({ ...ok, onboardedAtStart: false }), false, '첫 실행 직후 세션(이번 실행에 첫 안내를 마침)');
  assert.equal(dp.dailyPreGate({ ...ok, store: null }), false, '저장소 없음');
  assert.equal(dp.dailyPreGate({ ...ok, store: mem({ [dp.DAILY_PAYWALL_KEY]: TODAY }) }), false, '오늘 봄');
  assert.equal(dp.dailyPreGate({ ...ok, store: mem({ [dp.DAILY_PAYWALL_KEY]: dp.dailyDay(YDAY) }) }), true, '어제 봤으면 오늘 다시');
  const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(dp.dailyPreGate({ ...ok, store: throwing }), false, '저장소가 던지면 안 보임');
});

test('② dailyStep', () => {
  assert.equal(dp.dailyStep(base()), 'check');
  for (const [k, v] of [['shownToday', true], ['isPro', true], ['sharedPro', true], ['iapAvailable', false], ['offerCount', 0]] as const) {
    assert.equal(dp.dailyStep({ ...base(), [k]: v }), 'stop', k);
  }
  assert.equal(dp.dailyStep({ ...base(), ready: false }), 'wait');
  assert.equal(dp.dailyStep({ ...base(), ready: false, pending: true }), 'later');
  for (const [k, v] of [['pending', true], ['visible', false], ['routeOk', false], ['otherToday', true], ['dialogOpen', true], ['gateBusy', true], ['redeemBusy', true], ['reviewBusy', true], ['adBusy', true]] as const) {
    assert.equal(dp.dailyStep({ ...base(), [k]: v }), 'later', k);
  }
  // PRO 가 다른 «later» 조건보다 먼저 — PRO 면 이번 실행 끝
  assert.equal(dp.dailyStep({ ...base(), isPro: true, dialogOpen: true }), 'stop');
  // PRO 상태를 모르면 PRO 아님으로 단정하지 않는다
  assert.equal(dp.dailyStep({ ...base(), ready: false, iapAvailable: false }), 'wait');
});

test('③ 표식', () => {
  const s = mem();
  assert.equal(dp.dailyShownToday(s, NOW), false);
  assert.equal(dp.markDailyShown(s, NOW), true);
  assert.equal(s.m.get(dp.DAILY_PAYWALL_KEY), TODAY);
  assert.equal(dp.dailyShownToday(s, NOW), true);
  assert.equal(dp.dailyShownToday(s, NOW + 24 * 3600_000), false, '다음 날');
  assert.equal(dp.markDailyShown(null, NOW), false);
  const ro = { getItem: () => null, setItem: () => { /* 조용히 버림 */ } };
  assert.equal(dp.markDailyShown(ro, NOW), false, '다시 읽어 다르면 실패');
  assert.equal(dp.dailyShownToday(null, NOW), true, '저장소 없음 = 봤다(안 보임)');
});

test('④ 끄기 스위치', () => {
  assert.equal(dp.dailyOffScope({ redis: null }), null);
  for (const v of ['', 0, false, '0', 'false', undefined]) assert.equal(dp.dailyOffScope({ redis: v }), null, String(v));
  for (const v of ['1', 1, true, 'yes', 'all']) assert.equal(dp.dailyOffScope({ redis: v }), 'all', String(v));
  assert.equal(dp.dailyOffScope({ redis: 'ios' }), 'ios');
  assert.equal(dp.dailyOffScope({ redis: 'ANDROID' }), 'android');
  assert.equal(dp.dailyOffScope({ env: '1', redis: null }), 'all');
  assert.equal(dp.dailyOffScope({ env: 'ios', redis: null }), 'ios');
  assert.equal(dp.dailyOffScope({ env: 'ios', redis: 'android' }), 'all', '두 플랫폼을 따로 끄면 전부');
  assert.equal(dp.dailyOffScope({ env: 'ios', redis: 'ios' }), 'ios');

  assert.equal(dp.dailyOnFor({ on: true }, 'ios'), true);
  assert.equal(dp.dailyOnFor({ on: true, off: 'android' }, 'ios'), true);
  assert.equal(dp.dailyOnFor({ on: true, off: 'ios' }, 'ios'), false);
  assert.equal(dp.dailyOnFor({ on: true, off: 'all' }, 'android'), false);
  assert.equal(dp.dailyOnFor({ on: false }, 'ios'), false);
  for (const j of [null, undefined, 'on', 1, {}, { on: 'true' }]) assert.equal(dp.dailyOnFor(j, 'ios'), false, `모양 다름 ${JSON.stringify(j)}`);
});

test('⑤ 평점 대기·경로', () => {
  assert.equal(dp.reviewBusyAt(0, NOW), false, '요청 없음');
  assert.equal(dp.reviewBusyAt(NOW + 2_000, NOW), true, '예약(미래)');
  assert.equal(dp.reviewBusyAt(NOW - 10_000, NOW), true, '막 요청');
  assert.equal(dp.reviewBusyAt(NOW - 31_000, NOW), false, '30초 지남');
  assert.equal(dp.reviewBusyAt(Number.NEGATIVE_INFINITY, NOW), false);
  assert.equal(dp.dailyRouteOk('/ko/app-view/dash'), true);
  assert.equal(dp.dailyRouteOk('/en/app-view/stock/NVDA'), true);
  for (const p of ['/ko/app-view/terms', '/ko/app-view/privacy', '/ko/app-view/onboarding', '/ko/app-view/settings', '/ko/pricing', '/']) {
    assert.equal(dp.dailyRouteOk(p), false, p);
  }
  // 다른 시작 시트(체험 안내 2.5초+3초 · 블프 3초+3초)보다 늦게 판정
  assert.ok(dp.DAILY_PAYWALL_DELAY_MS > 6_000);
});

test('⑥ 퍼널·레이아웃·판정기 배선', () => {
  const { FUNNEL_SRCS } = require('../src/lib/app/funnelSchema');
  assert.ok((FUNNEL_SRCS as readonly string[]).includes('daily_open'));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const r = require('../scripts/mkt-funnel.js');
  assert.ok(r.SRCS.includes('daily_open'));
  const root = path.join(__dirname, '..');
  const layout = fs.readFileSync(path.join(root, 'src/app/[locale]/app-view/layout.tsx'), 'utf8');
  assert.equal((layout.match(/<DailyPaywallHost \/>/g) ?? []).length, 1);
  const gate = fs.readFileSync(path.join(root, 'src/components/app/DailyPaywallGate.tsx'), 'utf8');
  assert.match(gate, /<ProPaywall locale=\{locale\} src="daily_open" trialHead /);
  assert.match(gate, /checkStorePro\(/, '보이기 직전 스토어 재조회');
  assert.match(gate, /if \(st !== 'free'\)/, '무료 확인일 때만');
  assert.match(gate, /markGateDay\(localDay\(\)\)/, '뜨면 게이트 하루 표식');
  assert.match(gate, /throw new Error\('rc_init'\)/, 'SDK 초기화 실패를 무료로 보지 않는다');
  const route = fs.readFileSync(path.join(root, 'src/app/api/app/daily-paywall/route.ts'), 'utf8');
  assert.match(route, /on: false, reason: 'slow'/);
  assert.match(route, /on: false, reason: 'error'/);
});
