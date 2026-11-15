/**
 * 게이트 «가치 순간» 페이월(2026-11-16) — 순수 판정 + 배선 정적 확인.
 * 네트워크·실제 결제 없음. 실행: npx tsx --test tests/gatePaywall.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { localDay, shouldShowFirstGatePaywall, shouldShowNoFillPaywall } from '../src/lib/app/gatePaywall';
import { isFunnelSrc } from '../src/lib/app/funnelSchema';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const FREE = { iapAvailable: true, ready: true, isPro: false };

test('① 하루 첫 탭 — 무료·네이티브·상태 확인됨일 때만, 같은 날 두 번째는 아님', () => {
  assert.equal(shouldShowFirstGatePaywall(FREE, null, '2026-11-16'), true);
  assert.equal(shouldShowFirstGatePaywall(FREE, '2026-11-15', '2026-11-16'), true);
  assert.equal(shouldShowFirstGatePaywall(FREE, '2026-11-16', '2026-11-16'), false);
});

test('① PRO·상태 모름·웹(결제 불가)에는 절대 안 보인다', () => {
  assert.equal(shouldShowFirstGatePaywall({ ...FREE, isPro: true }, null, '2026-11-16'), false);
  assert.equal(shouldShowFirstGatePaywall({ ...FREE, ready: false }, null, '2026-11-16'), false);
  assert.equal(shouldShowFirstGatePaywall({ ...FREE, iapAvailable: false }, null, '2026-11-16'), false);
});

test('② 광고 없음 — 같은 탭에서 ①을 봤으면 건너뛴다(연달아 두 번 금지)', () => {
  assert.equal(shouldShowNoFillPaywall(FREE, false), true);
  assert.equal(shouldShowNoFillPaywall(FREE, true), false);
  assert.equal(shouldShowNoFillPaywall({ ...FREE, isPro: true }, false), false);
  assert.equal(shouldShowNoFillPaywall({ ...FREE, ready: false }, false), false);
  assert.equal(shouldShowNoFillPaywall({ ...FREE, iapAvailable: false }, false), false);
});

test('기기 현지 날짜 형식', () => {
  assert.equal(localDay(new Date(2026, 10, 6, 23, 59)), '2026-11-06');
});

test('계측 출처 gate_first·ad_nofill — 스키마·집계 스크립트 둘 다', () => {
  assert.ok(isFunnelSrc('gate_first'));
  assert.ok(isFunnelSrc('ad_nofill'));
  const s = read('scripts/mkt-funnel.js');
  assert.match(s, /'gate_first'/);
  assert.match(s, /'ad_nofill'/);
});

test('배선 — 게이트 훅이 두 판정을 쓰고, 닫힌 뒤 무료 경로(광고·대체 창)를 잇는다', () => {
  const v = read('src/components/app/ValueWall.tsx');
  assert.match(v, /shouldShowFirstGatePaywall\(gateRef\.current, readGateDay\(\), today\) && markGateDay\(today\)/);
  assert.match(v, /native && shouldShowNoFillPaywall\(gateRef\.current, shownThisTap\)/);
  assert.match(v, /onClose=\{closePaywall\}/);
  // 구매 성공으로 닫힌 경우 광고를 붙이지 않는다
  assert.match(v, /gateRef\.current\.isPro \|\| proPurchaseState\.getSnapshot\(\)/);
  assert.match(v, /adManager\.isProActive\(\)\) return;/);
  // 직접 연 페이월(«광고 없이 보기» 등)은 닫아도 이어 할 일 없음
  assert.match(v, /afterPaywall\.current = null; \/\/ 사용자가 직접 연 페이월/);
});
