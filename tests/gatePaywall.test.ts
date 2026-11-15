/**
 * 게이트 «가치 순간» 페이월(2026-11-16) — 순수 판정 + 배선 정적 확인.
 * 네트워크·실제 결제 없음. 실행: npx tsx --test tests/gatePaywall.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { STORE_PRO_KEY, STORE_PRO_TTL_MS, checkStorePro, createStoreProSignal, localDay, shouldShowFirstGatePaywall, shouldShowNoFillPaywall } from '../src/lib/app/gatePaywall';
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
  // ① 하루 첫 탭 — 스토어에서 방금 무료 확인 + 기록 성공 때만
  assert.match(v, /const first = shouldShowFirstGatePaywall\(gateRef\.current, readGateDay\(\), today\);/);
  assert.match(v, /const open = st === 'free' && stillFree\(\) && markGateDay\(today\);/);
  // ② 광고 없음 — 같은 탭 ① 뒤 생략 + 무료 확인
  assert.match(v, /native && shouldShowNoFillPaywall\(gateRef\.current, shownThisTap\)\) \{\n.*\n      const st = await proCheck\(\);\n      if \(st === 'pro' \|\| \(st === 'free' && gateProNow\(\)\)\) return 'done';\n      if \(st === 'free' && stillFree\(\)\) \{/);
  assert.match(v, /if \(st === 'pro' \|\| \(st !== null && gateProNow\(\)\)\) \{ endFlow\(\); return; \}/);
  assert.match(v, /onClose=\{closePaywall\}/);
  // 코드 PRO·조회 실패·결제 진행 중 = 무료 아님(페이월·광고 금지) — 스토어 조회(fetchProStatus)·시간 초과 3초
  assert.match(v, /fetchProStatus\(\)/);
  assert.match(v, /const proCheck = useCallback\(\(\) => checkStorePro\(\{\n    proNow: gateProNow,/);
  assert.match(v, /adPro: async \(\) => storeProSignal\.latest\(\) !== false && \(await import\('@\/services\/adManager'\)\)\.adManager\.isProActive\(\),/);
  assert.match(v, /const markStorePro = useCallback\(\(at: number\) => storeProSignal\.mark\(at\), \[\]\);/);
  assert.match(v, /markFree: \(at\) => \{ storeProSignal\.revoke\(at\); \},/);
  assert.match(v, /markAdPro: \(\) => \{ if \(storeProSignal\.latest\(\) !== false\) storeProSignal\.mark\(\); \},/);
  // ★11/16 밤 — 최신 스토어 응답(공유 신호)이 있으면 그것, 없으면 이 훅 isPro — 잠금·게이트 판정·대가 렌즈 모두 같은 값
  assert.match(v, /const gateProNow = \(\) => \{ const l = storeProSignal\.latest\(\); return l === null \? hookProRef\.current : l; \};/);
  assert.match(v, /const isUnlocked = unlocked \|\| gatePro;/);
  assert.match(v, /gateRef\.current = \{ iapAvailable: sellable, ready, isPro: gatePro \};/);
  assert.match(v, /isPro: gatePro, iapAvailable,/);
  assert.match(v, /return storeProSignal\.subscribe\(\(\) => setSigVer/);
  assert.match(v, /const stillFree = \(\) => !gateProNow\(\) && !proPurchaseState\.getSnapshot\(\);/);
  assert.match(v, /if \(gateProNow\(\)\) return; \/\/ 조회 뒤/);
  const ps = read('src/hooks/useProStatus.ts');
  // useProStatus 는 동작 그대로 + 응답 기록만(결제 흐름·설정·구매 시트 동작 불변)
  assert.match(ps, /if \(pro\) proPurchaseState\.confirm\(\);\n      if \(pro\) storeProSignal\.mark\(at\); else storeProSignal\.revoke\(at\);\n      setIsPro\(pro\);/);
  assert.match(ps, /const askedAt = Date\.now\(\);\n        const \{ customerInfo \} = await Purchases\.getCustomerInfo\(\);\n        apply\(customerInfo, askedAt\);/);
  assert.doesNotMatch(ps, /storeProSignal\.subscribe/, 'useProStatus 의 isPro 는 신호로 바꾸지 않는다(게이트만 신호를 따른다)');
  assert.doesNotMatch(ps, /if \(isPro\) storeProSignal\.mark/, '훅 isPro 로 다시 표시하지 않는다(옛 PRO 응답이 effect 로 되살아나지 않게)');
  assert.equal((ps.match(/if \(result\.ok && result\.isPro\) storeProSignal\.mark\(\);/g) || []).length, 3, '구매 2곳·복원 1곳 성공만 지금 시각으로 공유');
  // 닫힌 뒤 이어 할 일도 무료 재확인 뒤에만(구매 성공으로 닫힌 경우 광고 금지)
  assert.match(v, /if \(st === 'pro' \|\| st === 'pending'\) return;/);
  // 빠른 두 번 탭 — 흐름 중 다른 탭 무시
  assert.match(v, /if \(unlockPending\.current \|\| gateBusy\(\)\) return;/);
  // 직접 연 페이월(«광고 없이 보기» 등)은 닫아도 이어 할 일 없음
  assert.match(v, /afterPaywall\.current = null; \/\/ 사용자가 직접 연 페이월/);
});

// ── ★11/16 밤 교차 검토 중간 2건 재현 시험 ────────────────────────────────────
function fakeStorage() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}
function clock(start = 1_000_000) { let t = start; return { now: () => t, advance: (ms: number) => { t += ms; } }; }
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

type Sig = ReturnType<typeof createStoreProSignal>;
/** 게이트 하나 = 훅의 스토어 상태(isPro·ready) + 공유 신호 — ValueWall 의 storePro·gateRef·proCheck 와 같은 계산 */
function gate(sig: Sig, hook: { isPro: boolean; ready: boolean }, c: { now: () => number }) {
  const proNow = () => { const l = sig.latest(); return l === null ? hook.isPro : l; }; // ValueWall gateProNow
  return {
    state: () => ({ iapAvailable: true, ready: hook.ready, isPro: proNow() }),
    proCheck: (fetchPro: () => Promise<boolean>, adPro = async () => false, pending = () => false) => checkStorePro({
      proNow, pending, adPro: async () => sig.latest() !== false && (await adPro()), fetchPro,
      markPro: (at) => sig.mark(at), markFree: (at) => { sig.revoke(at); }, now: c.now,
      markAdPro: () => { if (sig.latest() !== false) sig.mark(); },
    }),
  };
}

test('중간 1 재현 — 탭 A 재조회가 PRO 확인 → 탭 B 새 게이트(초기 조회 실패)도 즉시 PRO(잠금·페이월 없음)', async () => {
  const st = fakeStorage(); const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => st });
  // 탭 A: 초기 조회 실패(isPro false, ready true) → 게이트 탭 재조회가 스토어에서 PRO 확인
  const a = gate(sig, { isPro: false, ready: true }, c);
  assert.equal(await a.proCheck(async () => true), 'pro');
  // 탭 B: 새로 마운트, 그 훅의 초기 조회도 실패(응답 없음 → 신호 그대로)
  c.advance(1000);
  const b = gate(sig, { isPro: false, ready: true }, c);
  assert.equal(b.state().isPro, true, '새 게이트가 PRO 를 공유받아야 한다(잠금 표시 금지)');
  assert.equal(shouldShowFirstGatePaywall(b.state(), null, '2026-11-16'), false);
  assert.equal(shouldShowNoFillPaywall(b.state(), false), false);
  // 새로고침(모듈 재평가) — 같은 세션 저장소에서 복원
  const sig2 = createStoreProSignal({ now: c.now, storage: () => st });
  assert.equal(sig2.active(), true);
  // 옛 조회(탭 A 마운트 때 시작해 늦게 온 무료 캐시)는 확인된 PRO 를 지우지 않는다
  sig.revoke(c.now() - 5000);
  assert.equal(sig.active(), true);
});

test('공유 신호 — 최신 응답이 이긴다 · 새로고침 복원은 저장 뒤 1시간까지 · 손상·미래 값 무시 · 저장소 없어도 동작', () => {
  const st = fakeStorage(); const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => st });
  assert.equal(sig.latest(), null);
  let notified = 0; const off = sig.subscribe(() => { notified++; });
  assert.equal(sig.mark(), true); assert.equal(sig.active(), true); assert.equal(notified, 1);
  const tPro = c.now();
  c.advance(10);
  assert.equal(sig.revoke(tPro - 1), false, '더 옛 응답은 거부'); assert.equal(sig.active(), true); assert.equal(notified, 1);
  assert.equal(sig.revoke(), true); assert.equal(sig.active(), false); assert.equal(sig.latest(), false); assert.equal(notified, 2);
  off(); sig.mark(); assert.equal(notified, 2);
  // 새로고침 복원: 저장 뒤 1시간 미만만
  assert.equal(createStoreProSignal({ now: c.now, storage: () => st }).active(), true);
  c.advance(STORE_PRO_TTL_MS);
  assert.equal(createStoreProSignal({ now: c.now, storage: () => st }).latest(), null, '1시간 지난 저장값은 복원하지 않는다');
  st.m.set(STORE_PRO_KEY, JSON.stringify({ at: c.now() + 60_000, pro: true, savedAt: c.now() }));
  assert.equal(createStoreProSignal({ now: c.now, storage: () => st }).latest(), null, '미래 시각 무시');
  st.m.set(STORE_PRO_KEY, 'garbage');
  assert.equal(createStoreProSignal({ now: c.now, storage: () => st }).latest(), null);
  const broken = createStoreProSignal({ now: c.now, storage: () => { throw new Error('denied'); } });
  broken.mark(); assert.equal(broken.active(), true);
});

test('중간 2 재현 — 조회 대기 중 다른 경로에서 PRO 로 바뀌면 옛 무료 결과가 와도 free 아님(페이월·노출 기록 금지)', async () => {
  const c = clock(Date.now());
  // (가) 결제 SDK 알림·다른 게이트가 조회 «뒤에» 공유 신호에 PRO 표시
  const sig = createStoreProSignal({ now: c.now, storage: () => null });
  const g = gate(sig, { isPro: false, ready: true }, c);
  assert.equal(shouldShowFirstGatePaywall(g.state(), null, '2026-11-16'), true); // 탭 시작 시점엔 무료
  const d1 = deferred<boolean>();
  const p1 = g.proCheck(() => d1.promise);
  await flush();
  c.advance(500); sig.mark(); // SDK 리스너 PRO(지금 시각)
  c.advance(500); d1.resolve(false); // 진행 중이던 조회가 옛 무료 결과
  assert.equal(await p1, 'pro');
  assert.equal(sig.active(), true, '옛 무료 조회가 더 늦은 PRO 를 회수하지 않는다');
  // (다) 광고 관리자만 PRO 를 알게 됨 — 이번 탭은 멈춘다(공유 기록은 SDK 쪽이 한다)
  const sig4 = createStoreProSignal({ now: c.now, storage: () => null });
  let adPro = false;
  const g4 = gate(sig4, { isPro: false, ready: true }, c);
  const d3 = deferred<boolean>();
  const p3 = g4.proCheck(() => d3.promise, async () => adPro);
  await flush();
  adPro = true;
  d3.resolve(false);
  assert.equal(await p3, 'pro');
});

test('회수 — 더 늦게 시작한 무료 응답(SDK 알림·새 조회·새로고침 뒤 첫 조회)은 공유 PRO 를 즉시 지운다', () => {
  const st = fakeStorage(); const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => st });
  let notified = 0; sig.subscribe(() => { notified++; });
  sig.mark();
  c.advance(1000);
  sig.revoke(); // SDK 리스너: 만료·회수
  assert.equal(sig.active(), false);
  assert.equal(notified, 2, '구독 중인 게이트에 알린다(잠금 상태 갱신)');
  assert.equal(shouldShowFirstGatePaywall({ iapAvailable: true, ready: true, isPro: sig.active() }, null, '2026-11-16'), true);
  // 새로고침 뒤: 저장된 PRO → 새로 시작한 첫 조회가 무료 → 회수
  const st2 = fakeStorage(); const sigA = createStoreProSignal({ now: c.now, storage: () => st2 });
  sigA.mark();
  c.advance(60_000);
  const reloaded = createStoreProSignal({ now: c.now, storage: () => st2 });
  assert.equal(reloaded.active(), true);
  const askedAt = c.now(); c.advance(200);
  reloaded.revoke(askedAt);
  assert.equal(reloaded.active(), false, '새로고침 뒤 첫 조회가 무료면 PRO 전용 화면이 열린 채 남지 않는다');
});

test('중간 2′ — 회수보다 먼저 시작한 진행 중 조회가 옛 PRO 를 돌려줘도 공유 PRO 를 되살리지 않는다', async () => {
  const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => null });
  sig.mark();
  const g = gate(sig, { isPro: false, ready: true }, c);
  // 공유 PRO 가 있으면 조회 자체를 안 한다 — 회수 직후 탭에서 조회 시작
  c.advance(1000); sig.revoke();
  const d = deferred<boolean>();
  const p = g.proCheck(() => d.promise);
  await flush();
  c.advance(1000); sig.revoke(); // 조회 도중 SDK 가 다시 무료 알림(더 늦게 시작)
  d.resolve(true); // 진행 중이던 조회는 옛 PRO
  assert.equal(await p, 'unknown', '이번 탭은 페이월 없이 무료 경로(옛 PRO 로 멈추지 않음)');
  assert.equal(sig.active(), false, '옛 PRO 응답으로 회수를 되돌리지 않는다');
});

test('checkStorePro — 진짜 무료만 free · 결제 진행 중 pending · 조회 실패·시간 초과 unknown(페이월 없음)', async () => {
  const c = clock(Date.now());
  const sig = createStoreProSignal({ storage: () => null, now: c.now });
  const g = gate(sig, { isPro: false, ready: true }, c);
  assert.equal(await g.proCheck(async () => false), 'free');
  assert.equal(await g.proCheck(async () => false, async () => false, () => true), 'pending');
  assert.equal(await g.proCheck(async () => { throw new Error('net'); }), 'unknown');
  assert.equal(await checkStorePro({ proNow: () => false, pending: () => false, adPro: async () => false,
    fetchPro: () => new Promise<boolean>(() => {}), markPro: () => {}, timeoutMs: 10 }), 'unknown');
  let pro = false;
  assert.equal(await checkStorePro({ proNow: () => pro, pending: () => false, adPro: async () => false,
    fetchPro: async () => { pro = true; throw new Error('net'); }, markPro: () => {} }), 'pro');
});

test('관문 3·4 — 광고 관리자 PRO: SDK 응답이 없거나 PRO 면 잠금 해제 · 최신 SDK 응답이 무료면 믿지 않음(탭이 멈추지 않고 되살리지도 않음)', async () => {
  const c = clock(Date.now());
  // (가) SDK 응답 없음(초기 조회 모두 실패) — 광고 관리자 PRO 로 잠금 해제(예전 동작 유지)
  const s1 = createStoreProSignal({ now: c.now, storage: () => null });
  const g1 = gate(s1, { isPro: false, ready: true }, c);
  assert.equal(await g1.proCheck(async () => false, async () => true), 'pro');
  assert.equal(s1.active(), true);
  // (나) 최신 SDK 응답이 무료(회수)인데 광고 관리자는 아직 옛 PRO — 광고 관리자를 믿지 않고 스토어 재조회로 판정, PRO 되살림 없음
  const s2 = createStoreProSignal({ now: c.now, storage: () => null });
  s2.mark(); c.advance(1000); s2.revoke();
  const g2 = gate(s2, { isPro: true /* 이 훅의 옛 isPro */, ready: true }, c);
  assert.equal(g2.state().isPro, false, '회수 뒤 이 훅의 옛 isPro 로 열린 채 남지 않는다(관문 4-1)');
  c.advance(1000);
  assert.equal(await g2.proCheck(async () => false, async () => true), 'free');
  assert.equal(s2.active(), false);
  // (다) 옛 응답 처리 — 같은 쪽이면 latest 그대로, 반대면 거부
  const s3 = createStoreProSignal({ now: c.now, storage: () => null });
  const t0 = c.now(); c.advance(10);
  assert.equal(s3.mark(c.now()), true);
  assert.equal(s3.mark(t0), false); assert.equal(s3.latest(), true);
  assert.equal(s3.revoke(t0), false); assert.equal(s3.active(), true, '옛 무료 응답은 확인된 PRO 를 지우지 않는다');

});

test('관문 5 — 게이트 조회 도중 더 최신 무료 응답이 기록되면 옛 PRO 결과는 unknown(페이월 없음·탭 멈춤 없음 → 무료 경로)', async () => {
  const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => null });
  const g = gate(sig, { isPro: false, ready: true }, c);
  const d = deferred<boolean>();
  const p = g.proCheck(() => d.promise);
  await flush();
  c.advance(100); sig.revoke(); // SDK 리스너: 무료(더 최신)
  c.advance(100); d.resolve(true); // 먼저 시작한 조회의 옛 PRO
  assert.equal(await p, 'unknown');
  assert.equal(sig.active(), false);
  assert.equal(shouldShowFirstGatePaywall(g.state(), null, '2026-11-16'), true, '판정 상태는 무료(잠금 유지) — 그러나 unknown 이라 이번 탭은 페이월 없이 광고·대체 창');
});
