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
  assert.match(v, /native && shouldShowNoFillPaywall\(gateRef\.current, shownThisTap\)\) \{\n.*\n      const st = await proCheck\(\);\n      if \(st === 'pro' \|\| \(st === 'free' && \(gateRef\.current\.isPro \|\| storeProSignal\.active\(\)\)\)\) return 'done';\n      if \(st === 'free' && stillFree\(\)\) \{/);
  assert.match(v, /if \(st === 'pro' \|\| \(st !== null && \(gateRef\.current\.isPro \|\| storeProSignal\.active\(\)\)\)\) \{ endFlow\(\); return; \}/);
  assert.match(v, /setTimeout\(\(\) => setStoreProUntil\(0\), Math\.max\(0, storeProUntil - Date\.now\(\)\)\)/);
  assert.match(v, /onClose=\{closePaywall\}/);
  // 코드 PRO·조회 실패·결제 진행 중 = 무료 아님(페이월·광고 금지) — 스토어 조회(fetchProStatus)·시간 초과 3초
  assert.match(v, /fetchProStatus\(\)/);
  assert.match(v, /const proCheck = useCallback\(\(\) => checkStorePro\(\{\n    proNow: \(\) => gateRef\.current\.isPro \|\| storeProSignal\.active\(\),/);
  assert.match(v, /adManager\.isProActive\(\)/);
  assert.match(v, /const markStorePro = useCallback\(\(\) => storeProSignal\.mark\(\), \[\]\);/);
  assert.match(v, /const isUnlocked = unlocked \|\| isPro \|\| storePro;/);
  // ★11/16 밤 — 재조회 PRO 는 모든 게이트 공유(새 게이트 첫 렌더부터) · 이 훅의 PRO 도 공유 · 결제 SDK 알림도 공유
  assert.match(v, /useState\(\(\) => storeProSignal\.until\(\)\)/);
  assert.match(v, /return storeProSignal\.subscribe\(/);
  assert.match(v, /useEffect\(\(\) => \{ if \(isPro\) storeProSignal\.mark\(\); \}, \[isPro\]\);/);
  assert.match(v, /const storePro = storeProUntil > Date\.now\(\) \|\| storeProSignal\.active\(\);/);
  assert.match(v, /if \(gateRef\.current\.isPro \|\| storeProSignal\.active\(\)\) return; \/\/ 조회 뒤/);
  const ps = read('src/hooks/useProStatus.ts');
  assert.match(ps, /if \(pro\) \{ proPurchaseState\.confirm\(\); storeProSignal\.mark\(\); wasProRef\.current = true; \}\n      else if \(wasProRef\.current\) \{ wasProRef\.current = false; storeProSignal\.clear\(\); \}/);
  assert.match(v, /isPro: isPro \|\| storePro, iapAvailable,/);
  assert.match(ps, /useEffect\(\(\) => \{ if \(isPro\) \{ wasProRef\.current = true; storeProSignal\.mark\(\); \} \}, \[isPro\]\);/);
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

/** 게이트 하나 = 훅의 스토어 상태(isPro·ready) + 공유 신호 — ValueWall 의 storePro·gateRef 와 같은 계산 */
function gate(sig: ReturnType<typeof createStoreProSignal>, hook: { isPro: boolean; ready: boolean }) {
  const initialUntil = sig.until(); // useState(() => storeProSignal.until())
  const storePro = () => initialUntil > Date.now() || sig.active();
  return {
    state: () => ({ iapAvailable: true, ready: hook.ready, isPro: hook.isPro || storePro() }),
    proCheck: (fetchPro: () => Promise<boolean>, adPro = async () => false, pending = () => false) => checkStorePro({
      proNow: () => hook.isPro || storePro(), pending, adPro, fetchPro, markPro: () => sig.mark(),
    }),
  };
}

test('중간 1 재현 — 탭 A 재조회가 PRO 확인 → 탭 B 새 게이트(초기 조회 실패)도 즉시 PRO(잠금·페이월 없음)', async () => {
  const st = fakeStorage(); const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => st });
  // 탭 A: 초기 조회 실패(isPro false, ready true) → 게이트 탭 재조회가 스토어에서 PRO 확인
  const a = gate(sig, { isPro: false, ready: true });
  assert.equal(await a.proCheck(async () => true), 'pro');
  // 탭 B: 새로 마운트, 그 훅의 초기 조회도 실패(isPro false)
  const b = gate(sig, { isPro: false, ready: true });
  assert.equal(b.state().isPro, true, '새 게이트가 PRO 를 공유받아야 한다(잠금 표시 금지)');
  assert.equal(shouldShowFirstGatePaywall(b.state(), null, '2026-11-16'), false);
  assert.equal(shouldShowNoFillPaywall(b.state(), false), false);
  // 새로고침(모듈 재평가) — 같은 세션 저장소에서 복원
  const sig2 = createStoreProSignal({ now: c.now, storage: () => st });
  assert.equal(sig2.active(), true);
  assert.ok(Number(st.m.get(STORE_PRO_KEY)) > c.now());
});

test('공유 PRO 는 1시간만 — 만료 뒤 무료 판정은 훅 상태를 따른다 · 손상·먼 미래 값은 믿지 않음', () => {
  const st = fakeStorage(); const c = clock();
  const sig = createStoreProSignal({ now: c.now, storage: () => st });
  let notified = 0; const off = sig.subscribe(() => { notified++; });
  sig.mark();
  assert.equal(notified, 1);
  assert.equal(sig.until(), c.now() + STORE_PRO_TTL_MS);
  c.advance(STORE_PRO_TTL_MS - 1); assert.equal(sig.active(), true);
  c.advance(1); assert.equal(sig.active(), false); assert.equal(sig.until(), 0);
  off(); sig.mark(); assert.equal(notified, 1);
  st.m.set(STORE_PRO_KEY, String(c.now() + STORE_PRO_TTL_MS * 10));
  assert.equal(createStoreProSignal({ now: c.now, storage: () => st }).active(), false);
  st.m.set(STORE_PRO_KEY, 'garbage');
  assert.equal(createStoreProSignal({ now: c.now, storage: () => st }).active(), false);
  // 저장소가 없거나 던져도 모듈 값은 동작
  const broken = createStoreProSignal({ now: c.now, storage: () => { throw new Error('denied'); } });
  broken.mark(); assert.equal(broken.active(), true);
});

test('중간 2 재현 — 조회 대기 중 다른 경로에서 PRO 로 바뀌면 옛 무료 결과가 와도 free 아님(페이월·노출 기록 금지)', async () => {
  const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => null });
  const hook = { isPro: false, ready: true };
  const g = gate(sig, hook);
  assert.equal(shouldShowFirstGatePaywall(g.state(), null, '2026-11-16'), true); // 탭 시작 시점엔 무료
  // (가) 결제 SDK 알림·다른 게이트가 공유 신호에 PRO 표시
  const d1 = deferred<boolean>();
  const p1 = g.proCheck(() => d1.promise);
  await flush();
  sig.mark();
  d1.resolve(false); // 진행 중이던 조회가 옛 무료 결과
  assert.equal(await p1, 'pro');
  // (나) 이 훅의 isPro 가 갱신됨(신호 없이)
  const sig3 = createStoreProSignal({ now: c.now, storage: () => null });
  const hook3 = { isPro: false, ready: true };
  const g3 = gate(sig3, hook3);
  const d2 = deferred<boolean>();
  const p2 = g3.proCheck(() => d2.promise);
  await flush();
  hook3.isPro = true;
  d2.resolve(false);
  assert.equal(await p2, 'pro');
  // (다) 광고 관리자만 PRO 를 알게 됨
  const sig4 = createStoreProSignal({ now: c.now, storage: () => null });
  let adPro = false;
  const g4 = gate(sig4, { isPro: false, ready: true });
  const d3 = deferred<boolean>();
  const p3 = g4.proCheck(() => d3.promise, async () => adPro);
  await flush();
  adPro = true;
  d3.resolve(false);
  assert.equal(await p3, 'pro');
  assert.equal(sig4.active(), true, '광고 관리자 PRO 도 모든 게이트에 공유');
});

test('checkStorePro — 진짜 무료만 free · 결제 진행 중 pending · 조회 실패·시간 초과 unknown(페이월 없음)', async () => {
  const sig = createStoreProSignal({ storage: () => null });
  const g = gate(sig, { isPro: false, ready: true });
  assert.equal(await g.proCheck(async () => false), 'free');
  assert.equal(await g.proCheck(async () => false, async () => false, () => true), 'pending');
  assert.equal(await g.proCheck(async () => { throw new Error('net'); }), 'unknown');
  assert.equal(await checkStorePro({ proNow: () => false, pending: () => false, adPro: async () => false,
    fetchPro: () => new Promise<boolean>(() => {}), markPro: () => {}, timeoutMs: 10 }), 'unknown');
  // 조회 실패 중에 PRO 로 바뀌었으면 pro
  let pro = false;
  assert.equal(await checkStorePro({ proNow: () => pro, pending: () => false, adPro: async () => false,
    fetchPro: async () => { pro = true; throw new Error('net'); }, markPro: () => {} }), 'pro');
});

test('공유 PRO 회수 — 결제 SDK 의 PRO→무료 전환(만료·회수)이면 즉시 지워져 게이트가 다시 무료 판정', () => {
  const st = fakeStorage(); const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => st });
  let notified = 0; sig.subscribe(() => { notified++; });
  sig.mark();
  const g = gate(sig, { isPro: false, ready: true });
  sig.clear();
  assert.equal(sig.active(), false);
  assert.equal(notified, 2, '구독 중인 게이트에 알린다(잠금 상태 갱신)');
  assert.equal(createStoreProSignal({ now: c.now, storage: () => st }).active(), false, '새로고침 뒤에도 지워진 상태');
  assert.equal(shouldShowFirstGatePaywall({ iapAvailable: true, ready: true, isPro: sig.active() }, null, '2026-11-16'), true);
  sig.clear(); assert.equal(notified, 2, '없으면 알리지 않음');
  void g;
});
