/**
 * ★11/20 광고 잠금해제 범위 — «한 편 = 누른 잠금 하나만 1시간» + 해제 뒤 페이월·결제 계측.
 *   ① adUnlockScope: 범위별 1시간 · 다른 범위는 잠김 · 만료·깨진 값 · 상한 · 저장소 막힘
 *   ② 계측: 해제 뒤 24시간 안 첫 열림·버튼·결제만 한 번씩 · 창 밖·다른 단계는 없음
 *   ③ 닫힌 목록(funnelSchema ↔ mkt-funnel) · 소스 계약(ValueWall 은 범위 키로 판정 · 전역 키는 전면 쉬기용으로 남김 · 화면 문구 무변경)
 * 실행: ts-node(--transpile-only, commonjs) — 이 저장소 방식(11/19·11/20). 네트워크·실결제 없음.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const sc = require('../src/lib/app/adUnlockScope') as typeof import('../src/lib/app/adUnlockScope');
const schema = require('../src/lib/app/funnelSchema') as typeof import('../src/lib/app/funnelSchema');
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function mem() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); } };
}
const H = 60 * 60 * 1000;

test('① 한 범위만 1시간 열린다', () => {
  const s = mem();
  const t0 = 1_800_000_000_000;
  assert.equal(sc.scopeUnlockedAt(s, 'AI 분석 잠금', t0), false);
  assert.equal(sc.grantScopeUnlock(s, 'AI 분석 잠금', t0), 0, '처음 연 범위 — 다른 열린 범위 0');
  assert.equal(sc.scopeUnlockedAt(s, 'AI 분석 잠금', t0 + 1), true);
  assert.equal(sc.scopeUnlockedAt(s, '퀀트 시그널 잠금', t0 + 1), false, '다른 잠금은 그대로 잠김');
  assert.equal(sc.scopeUnlockedAt(s, 'dash_gate', t0 + 1), false);
  assert.equal(sc.scopeUnlockedAt(s, 'AI 분석 잠금', t0 + H - 1), true, '1시간 안');
  assert.equal(sc.scopeUnlockedAt(s, 'AI 분석 잠금', t0 + H), false, '1시간 뒤 잠김');
  // 두 번째 범위 — 이미 열린 범위 1 을 돌려준다(rw_more 계측)
  assert.equal(sc.grantScopeUnlock(s, 'dash_gate', t0 + 10), 1);
  assert.equal(sc.scopeUnlockedAt(s, 'AI 분석 잠금', t0 + 20), true);
  assert.equal(sc.scopeUnlockedAt(s, 'dash_gate', t0 + 20), true);
  // 같은 범위 다시 — 시간 연장, 다른 범위 수 1
  assert.equal(sc.grantScopeUnlock(s, 'dash_gate', t0 + 30 * 60_000), 1);
  assert.equal(sc.scopeUnlockedAt(s, 'dash_gate', t0 + 30 * 60_000 + H - 1), true);
  // 앱 전역 키(signum_ad_unlock)는 이 모듈이 건드리지 않는다
  assert.equal(s.m.has('signum_ad_unlock'), false);
});

test('① 범위 이름 · 만료 정리 · 깨진 값 · 상한 · 저장소 막힘', () => {
  assert.equal(sc.unlockScopeName(undefined), 'default');
  assert.equal(sc.unlockScopeName('  '), 'default');
  assert.equal(sc.unlockScopeName('x'.repeat(200)).length, 80);
  const s = mem();
  const t0 = 1_800_000_000_000;
  sc.grantScopeUnlock(s, 'a', t0);
  sc.grantScopeUnlock(s, 'b', t0 + 2 * H); // a 는 만료 — 지워진다
  assert.deepEqual(Object.keys(JSON.parse(s.m.get(sc.SCOPED_UNLOCK_KEY)!)), ['b']);
  for (const bad of ['{', '[]', '"x"', 'null', '{"a":"zz","b":-1}']) {
    s.m.set(sc.SCOPED_UNLOCK_KEY, bad);
    assert.equal(sc.scopeUnlockedAt(s, 'a', t0), false, bad);
    assert.equal(sc.grantScopeUnlock(s, 'c', t0), 0, '깨진 값이면 새로 쓴다');
    assert.equal(sc.scopeUnlockedAt(s, 'c', t0 + 1), true);
  }
  const big = mem();
  for (let i = 0; i < 40; i++) sc.grantScopeUnlock(big, `s${i}`, t0 + i);
  assert.equal(Object.keys(JSON.parse(big.m.get(sc.SCOPED_UNLOCK_KEY)!)).length, 24, '상한 24 — 가장 늦게 끝나는 것부터');
  assert.equal(sc.scopeUnlockedAt(big, 's39', t0 + 100), true);
  assert.equal(sc.scopeUnlockedAt(big, 's0', t0 + 100), false);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(sc.scopeUnlockedAt(blocked, 'a', t0), false);
  assert.equal(sc.grantScopeUnlock(blocked, 'a', t0), 0);
  assert.equal(sc.scopeUnlockedAt(null, 'a', t0), false);
});

test('② 해제 뒤 24시간 안 첫 열림·버튼·결제만 한 번씩', () => {
  const s = mem();
  const t0 = 1_800_000_000_000;
  assert.equal(sc.rewardFollowUp(s, 'open', t0), null, '해제 전');
  sc.noteRewardForFollow(s, t0);
  assert.equal(sc.rewardFollowUp(s, 'active', t0 + 1), null, '페이월 단계 아님');
  assert.equal(sc.rewardFollowUp(s, 'rw_then', t0 + 1), null, '자기 자신으로 다시 오지 않음');
  assert.equal(sc.rewardFollowUp(s, 'open', t0 + 1), 'rw_open');
  assert.equal(sc.rewardFollowUp(s, 'open', t0 + 2), null, '창마다 한 번');
  assert.equal(sc.rewardFollowUp(s, 'cta', t0 + 3), 'rw_cta');
  assert.equal(sc.rewardFollowUp(s, 'buy_ok', t0 + 4), 'rw_buy');
  assert.equal(sc.rewardFollowUp(s, 'buy_ok', t0 + 5), null);
  sc.noteRewardForFollow(s, t0 + 10); // 새 해제 = 새 창
  assert.equal(sc.rewardFollowUp(s, 'open', t0 + 11), 'rw_open');
  assert.equal(sc.rewardFollowUp(s, 'cta', t0 + 10 + 24 * H + 1), null, '24시간 밖');
  s.m.set(sc.REWARD_FOLLOW_KEY, '{bad');
  assert.equal(sc.rewardFollowUp(s, 'open', t0), null);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(sc.rewardFollowUp(blocked, 'open', t0), null);
  sc.noteRewardForFollow(blocked, t0); // 예외를 밖으로 던지지 않는다
});

test('③ 닫힌 목록 — 새 단계·출처가 funnelSchema 와 mkt-funnel 에 같이 있다', () => {
  assert.ok(schema.isFunnelStage('rw_then'));
  for (const s of ['rw_more', 'rw_open', 'rw_cta', 'rw_buy']) assert.ok(schema.isFunnelSrc(s), s);
  const r = require('../scripts/mkt-funnel.js');
  assert.deepEqual(r.STAGES, [...schema.FUNNEL_STAGES]);
  assert.deepEqual(r.SRCS, [...schema.FUNNEL_SRCS]);
});

test('③ 소스 계약 — ValueWall 은 범위 키로 판정, 전역 키는 전면 쉬기용으로만, 화면 문구 무변경', () => {
  const v = read('src/components/app/ValueWall.tsx');
  // 잠금 판정은 범위 키
  assert.match(v, /const check = \(\) => setUnlocked\(scopeUnlockedNow\(scopeName\)\);/);
  assert.match(v, /const adUnlockedNow = \(\) => scopeUnlockedNow\(scopeRef\.current\);/);
  assert.doesNotMatch(v, /localStorage\.getItem\(UNLOCK_KEY\)/, '전역 키로 잠금을 판정하지 않는다');
  // 보상형: adManager 가 전역 키를 썼으니 범위만 · 대체 창: 예전처럼 전역 키도(1시간 전면 쉬기)
  assert.match(v, /const others = unlock\(false\);\n\s+trackFunnel\('reward_ok', \{ src: 'value_wall' \}\)/);
  assert.match(v, /const others = unlock\(true\);\n\s+trackFunnel\('reward_ok', \{ src: 'ad_modal' \}\)/);
  assert.match(v, /useAdUnlockGate\(locale, onUnlock, unlockScope \?\? title\)/);
  // 화면 문구(«1시간»)는 그대로
  assert.match(v, /ctaLabel: '광고 보고 1시간 잠금해제',/);
  assert.match(v, /defaultSubtitle: <>광고를 시청하면 프리미엄 리서치 데이터를 1시간 동안 확인할 수 있습니다\.<\/>,/);
  // 대시보드 게이트·flow 맥스페인
  assert.match(read('src/app/[locale]/app-view/dash/page.tsx'), /useAdUnlockGate\(locale, undefined, 'dash_gate'\)/);
  const f = read('src/app/[locale]/app-view/flow/page.tsx');
  assert.match(f, /setIsLocked\(!adScopeUnlockedNow\('flow_chain'\)\);/, '맥스페인 = ValueWall 과 같은 판정(관문 11201525 ②)');
  assert.match(f, /unlockScope="flow_chain"/);
  assert.equal((f.match(/onUnlock=\{\(\) => setIsLocked\(false\)\}/g) || []).length, 1, '맥스페인은 체인 잠금만 연다(GEX·고래 분석은 안 연다 — 관문 11201525 ①)');
  const chainAt = f.indexOf('unlockScope="flow_chain"');
  assert.ok(chainAt > 0 && f.slice(chainAt, chainAt + 300).includes('onUnlock={() => setIsLocked(false)}'), '남은 하나는 체인 잠금');
  assert.doesNotMatch(f, /localStorage\.getItem\('signum_ad_unlock'\)/);
  // adManager 의 전역 키(1시간 전면 쉬기)는 그대로
  const a = read('src/services/adManager.ts');
  assert.match(a, /const UNLOCK_KEY = 'signum_ad_unlock';/);
  assert.match(a, /if \(this\.isPremiumUnlocked\(\)\) return false;/);
  // 계측 고리
  assert.match(read('src/lib/app/funnelBeacon.ts'), /if \(follow\) trackFunnel\('rw_then', \{ src: follow \}\);/);
});

test('① 관문 11201522 — 배포 전 받은 전역 해제는 남은 시간 동안 모든 잠금에 통한다(한 번만 옮김)', () => {
  const t0 = 1_800_000_000_000;
  const s = mem();
  s.m.set('signum_ad_unlock', JSON.stringify({ unlockedUntil: t0 + 20 * 60_000, tier: 'premium' }));
  assert.equal(sc.migrateLegacyUnlock(s, t0), t0 + 20 * 60_000, '옮긴 만료 시각을 돌려준다');
  assert.equal(sc.scopeUnlockedAt(s, 'cmd_ai', t0 + 1), true);
  assert.equal(sc.scopeUnlockedAt(s, 'dash_gate', t0 + 1), true);
  assert.equal(sc.scopeUnlockedAt(s, 'cmd_ai', t0 + 20 * 60_000), false, '남은 시간까지만');
  assert.equal(sc.grantScopeUnlock(s, 'cmd_ai', t0 + 2), 0, '옛 해제는 «다른 열린 잠금»으로 세지 않는다');
  // 옮긴 뒤 새 보상형이 전역 키를 다시 써도(전면 쉬기용) 잠금은 열리지 않는다
  const s2 = mem();
  sc.migrateLegacyUnlock(s2, t0); // 옛 해제 없음 → 표식만
  assert.equal(s2.m.get(sc.LEGACY_MIGRATED_KEY), '1');
  s2.m.set('signum_ad_unlock', JSON.stringify({ unlockedUntil: t0 + H, tier: 'premium' }));
  sc.migrateLegacyUnlock(s2, t0 + 5);
  assert.equal(sc.scopeUnlockedAt(s2, 'cmd_quant', t0 + 6), false);
  // 만료된 옛 키·숫자 형식·깨진 값
  const s3 = mem(); s3.m.set('signum_ad_unlock', String(t0 + 5 * 60_000)); sc.migrateLegacyUnlock(s3, t0);
  assert.equal(sc.scopeUnlockedAt(s3, 'x', t0 + 1), true, '숫자 형식');
  const s4 = mem(); s4.m.set('signum_ad_unlock', JSON.stringify({ unlockedUntil: t0 - 1 })); sc.migrateLegacyUnlock(s4, t0);
  assert.equal(sc.scopeUnlockedAt(s4, 'x', t0 + 1), false, '만료');
  const s5 = mem(); s5.m.set('signum_ad_unlock', JSON.stringify({ unlockedUntil: t0 + 99 * H })); sc.migrateLegacyUnlock(s5, t0);
  assert.equal(sc.scopeUnlockedAt(s5, 'x', t0 + H + 1), false, '최대 1시간');
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(sc.migrateLegacyUnlock(blocked, t0), 0);
  // 읽기는 되고 쓰기만 막힘 — 만료 시각은 돌려준다(부르는 쪽이 이번 실행 동안 기억 · 관문 11201525 ③)
  const ro = { getItem: (k: string) => (k === 'signum_ad_unlock' ? JSON.stringify({ unlockedUntil: t0 + 10 * 60_000 }) : null), setItem: () => { throw new Error('quota'); } };
  assert.equal(sc.migrateLegacyUnlock(ro, t0), t0 + 10 * 60_000);
});

test('③ 관문 11201522 — 잠금 범위는 언어와 무관한 고정 이름 · 저장 실패 시 이번 실행 사본', () => {
  const cmd = read('src/app/[locale]/app-view/cmd/page.tsx');
  for (const k of ['cmd_ai', 'cmd_quant', 'cmd_holdings']) assert.ok(cmd.includes(`unlockScope="${k}"`), k);
  const f = read('src/app/[locale]/app-view/flow/page.tsx');
  for (const k of ['flow_gex', 'flow_whale', 'flow_chain']) assert.ok(f.includes(`unlockScope="${k}"`), k);
  assert.ok(read('src/components/guardian/mobile/MobileGuardianShield.tsx').includes('unlockScope="guardian_gamma"'));
  // 모든 <ValueWall 여는 태그 뒤 10줄 안에 unlockScope
  for (const [rel, src] of [['cmd', cmd], ['flow', f], ['guardian', read('src/components/guardian/mobile/MobileGuardianShield.tsx')]] as const) {
    const lines = src.split('\n');
    lines.forEach((l, i) => { if (/^\s*<ValueWall\s*$/.test(l)) assert.ok(lines.slice(i, i + 10).some((x) => x.includes('unlockScope=')), `${rel}:${i + 1}`); });
  }
  const v = read('src/components/app/ValueWall.tsx');
  assert.match(v, /if \(\(memUnlocks\.get\(scope\) \?\? 0\) > now \|\| \(memUnlocks\.get\('\*'\) \?\? 0\) > now\) return true;/);
  assert.match(v, /memUnlocks\.set\(scopeName, now \+ UNLOCK_MS\);/);
  assert.match(v, /legacy = migrateLegacyUnlock\(window\.localStorage, now\)/);
  assert.match(v, /if \(legacy > now\) memUnlocks\.set\('\*', legacy\);/);
});
