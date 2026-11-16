/**
 * 게이트 «가치 순간» 페이월(2026-11-16) — 순수 판정 + 배선 정적 확인.
 * 네트워크·실제 결제 없음. 실행: npx tsx --test tests/gatePaywall.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { GATE_SLOT_MAX_MS, GATE_SLOT_PINNED_MAX_MS, STORE_PRO_KEY, STORE_PRO_TTL_MS, checkStorePro, createGatePaywallSlot, createStoreProSignal, decideFirstGatePaywall, decideNoFillPaywall, localDay, shouldShowFirstGatePaywall, shouldShowNoFillPaywall } from '../src/lib/app/gatePaywall';
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
  // ① 하루 첫 탭 — 스토어에서 방금 무료 확인 + 기록 성공 때만(판정 전체는 decideFirstGatePaywall — 아래 ★11/17 시험)
  //   ★11/17 앱 전역 자리(gatePaywallSlot) 선점 · 기록 날짜는 여는 시점
  assert.match(v, /const r = await decideFirstGatePaywall\(\{\n      state: \(\) => gateRef\.current, slot: gatePaywallSlot, check: proCheck, proNow: gateProNow,\n      stillFree: \(\) => alive\.current && !adUnlockedNow\(\) && stillFree\(\),[^\n]*\n      readDay: readGateDay, markDay: markGateDay,/);
  assert.match(v, /if \(r\.kind === 'pro' \|\| r\.kind === 'busy' \|\| !alive\.current \|\| adUnlockedNow\(\)\) \{ endFlow\(\); return; \}[^\n]*\n    if \(r\.kind === 'paywall'\) \{\n.*\n      slotId\.current = r\.slot;\n      afterPaywall\.current = 'ad';\n      setPaywallSrc\('gate_first'\);/);
  assert.doesNotMatch(v, /markGateDay\(today\)/, '재조회 «전» 날짜로 기록하지 않는다(자정 경계)');
  // ② 광고 없음 — 같은 탭 ① 뒤 생략 + 무료 확인 + 앱 전역 자리
  assert.match(v, /if \(native\) \{\n      const nf = await decideNoFillPaywall\(\{\n        state: \(\) => gateRef\.current, shownThisTap, slot: gatePaywallSlot, ownSlot: slotId\.current, check: proCheck, proNow: gateProNow,\n        stillFree: \(\) => alive\.current && !adUnlockedNow\(\) && stillFree\(\),[^\n]*\n      \}\);\n      if \(nf\.kind === 'pro' \|\| nf\.kind === 'busy'\) return 'done';/);
  assert.match(v, /slotId\.current = nf\.slot;\n        afterPaywall\.current = 'fallback';\n        setPaywallSrc\('ad_nofill'\);/);
  // 자리는 흐름 끝·언마운트에 놓는다
  assert.match(v, /const endFlow = \(\) => \{ gateFlowAt\.current = 0; endGateFlow\(gateFlowId\.current\); gateFlowId\.current = 0; releaseSlot\(\); \};/);
  assert.match(v, /alive\.current = false;\n[^\n]*\n      gatePaywallSlot\.release\(slotId\.current\); slotId\.current = 0;\n      gatePaywallSlot\.release\(modalSlot\.current\); modalSlot\.current = 0;/);
  assert.match(v, /onClose=\{closePaywall\}/);
  // 코드 PRO·조회 실패·결제 진행 중 = 무료 아님(페이월·광고 금지) — 스토어 조회(fetchProStatus)·시간 초과 3초
  assert.match(v, /fetchProStatus\(\)/);
  assert.match(v, /const proCheck = useCallback\(\(\) => checkStorePro\(\{\n    proNow: gateProNow,/);
  assert.match(v, /adPro: async \(\) => \{ const \{ adManager \} = await import\('@\/services\/adManager'\); return storeProSignal\.latest\(\) !== false && adManager\.isProActive\(\); \},/);
  assert.match(v, /const markStorePro = useCallback\(\(at: number\) => storeProSignal\.mark\(at\), \[\]\);/);
  assert.match(v, /markFree: \(at\) => \{ storeProSignal\.revoke\(at\); \},/);
  assert.match(v, /markAdPro: \(\) => storeProSignal\.latest\(\) !== false && storeProSignal\.mark\(\),/);
  assert.match(v, /const sigExp = sigMounted\.current \? storeProSignal\.proExpiresAt\(\) : 0;/);
  // ★11/16 밤 — 최신 스토어 응답(공유 신호)이 있으면 그것, 없으면 이 훅 isPro — 잠금·게이트 판정·대가 렌즈 모두 같은 값
  assert.match(v, /const gateProNow = \(\) => \{ const l = sigMounted\.current \? storeProSignal\.latest\(\) : null; return l === null \? hookProRef\.current : l; \};/);
  // 첫 렌더(hydration)는 서버와 같게 신호를 읽지 않고, 마운트 effect 에서 켠 뒤 다시 그린다
  assert.match(v, /useEffect\(\(\) => \{\n    sigMounted\.current = true;\n    setSigVer\(\(v\) => v \+ 1\);/);
  assert.match(v, /const isUnlocked = unlocked \|\| gatePro;/);
  assert.match(v, /gateRef\.current = \{ iapAvailable: sellable, ready, isPro: gatePro \};/);
  assert.match(v, /isUnlocked, unlocked, isPro, iapAvailable,/);
  assert.match(v, /return storeProSignal\.subscribe\(\(\) => setSigVer/);
  assert.match(v, /if \(adManager\.isProActive\(\) && storeProSignal\.latest\(\) !== false\) return 'done';/);
  assert.match(v, /if \(gateProNow\(\)\) return 'done';\n    if \(!alive\.current \|\| adUnlockedNow\(\)\) return 'done';[^\n]*\n    openFallback\(\);\n    return 'done';/);
  // ★11/17 대체 창이 열린 동안 자리 유지(창 닫힘·언마운트에 해제)
  assert.match(v, /else openFallback\(\);/);
  assert.match(v, /onClose=\{closeFallback\}/);
  assert.match(v, /const closeFallback = \(\) => \{ gatePaywallSlot\.release\(modalSlot\.current\); modalSlot\.current = 0; setShowAd\(false\); \};/);
  assert.match(v, /gatePaywallSlot\.release\(modalSlot\.current\); modalSlot\.current = 0;\n    \};\n  \}, \[\]\);/);
  assert.equal((v.match(/setShowAd\(true\)/g) || []).length, 1, '대체 창은 openFallback 으로만 연다');
  // ★11/17 관문 11170638 — 언마운트 뒤 비동기 완료가 창·자리를 만들지 않는다
  assert.match(v, /const openFallback = \(\) => \{\n    if \(!alive\.current\) return;/);
  assert.match(v, /const id = own \? slotId\.current : gatePaywallSlot\.claim\(\);\n    if \(!id\) return;/);
  assert.doesNotMatch(v, /gatePaywallSlot\.pin\(/, '창 몫 자리는 30분 pin 을 쓰지 않는다(2분 상한)');
  assert.match(v, /if \(!showAd \|\| isUnlocked\) \{ gatePaywallSlot\.release\(modalSlot\.current\); modalSlot\.current = 0; \}\n    if \(isUnlocked\) \{ gatePaywallSlot\.release\(slotId\.current\); slotId\.current = 0; \}\n  \}, \[showAd, isUnlocked\]\);/, '잠금이 풀리면 창·페이월 몫 자리 해제(관문 11170642)');
  assert.match(v, /if \(!alive\.current \|\| adUnlockedNow\(\)\) return 'done';[^\n]*\n    \/\/ ② 네이티브에서 광고가 안 나왔다/);
  assert.match(v, /if \(gateProNow\(\)\) return; \/\/ 조회 뒤[^\n]*\n          if \(!alive\.current \|\| adUnlockedNow\(\)\) return;/);
  // ★11/16 밤 — 오늘 기존 사용자 체험 안내(trial_announce)를 봤으면 게이트 페이월(gate_first·ad_nofill)을 다시 열지 않는다
  assert.match(v, /const stillFree = \(\) => !gateProNow\(\) && !proPurchaseState\.getSnapshot\(\) && !announcedTodaySafe\(\);/);
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
  // ★11/17 관문 11170644 — 게이트 흐름은 앱 전역 하나(다른 게이트 흐름 중 탭은 넘김) · 언마운트에 흐름 표식 해제 · 잠금 풀렸으면 페이월 자리 안 잡음
  assert.match(v, /if \(unlockPending\.current \|\| gateBusy\(\)\) return;\n(    \/\/[^\n]*\n)+    if \(gateFlowActive\(\)\) return;\n    gateFlowAt\.current = Date\.now\(\);/);
  assert.match(v, /alive\.current = false;\n      endGateFlow\(gateFlowId\.current\); gateFlowId\.current = 0;/);
  // 직접 연 페이월(«광고 없이 보기» 등)은 닫아도 이어 할 일 없음
  assert.match(v, /afterPaywall\.current = null; \/\/ 사용자가 직접 연 페이월/);
  assert.match(v, /if \(!next\) return;\n    gatePaywallSlot\.unpin\(slotId\.current\);/, '★11/17 닫힘 → 이어 할 일 동안 2분 상한');
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
      markAdPro: () => sig.latest() !== false && sig.mark(),
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
  // (다) 조회 도중 SDK 가 더 최신 PRO 를 알림(조회 시작 뒤) — 이 조회의 무료는 거부되고 PRO
  const sig4 = createStoreProSignal({ now: c.now, storage: () => null });
  const g4 = gate(sig4, { isPro: false, ready: true }, c);
  const d3 = deferred<boolean>();
  const p3 = g4.proCheck(() => d3.promise);
  await flush();
  c.advance(10); sig4.mark();
  d3.resolve(false);
  assert.equal(await p3, 'pro');
  assert.equal(sig4.active(), true);
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

test('관문 6 — 공유 PRO 는 받은 뒤 1시간만(무료 알림이 없어도 만료 → 훅 isPro 로 복귀) · 무료 응답은 유지', () => {
  const st = fakeStorage(); const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => st });
  sig.mark();
  assert.equal(sig.proExpiresAt(), c.now() + STORE_PRO_TTL_MS);
  c.advance(STORE_PRO_TTL_MS - 1); assert.equal(sig.active(), true);
  c.advance(1); assert.equal(sig.active(), false); assert.equal(sig.latest(), null); assert.equal(sig.proExpiresAt(), 0);
  const g = gate(sig, { isPro: false, ready: true }, c);
  assert.equal(g.state().isPro, false, '만료 뒤 게이트는 훅 isPro(무료)를 따른다');
  assert.equal(sig.mark(c.now() - 10), true, '만료 뒤 새 응답은 다시 기록');
  sig.revoke(); c.advance(STORE_PRO_TTL_MS * 2); assert.equal(sig.latest(), false, '무료 응답은 만료되지 않는다');
});

test('관문 6 — 광고 관리자 확인 도중 더 최신 무료 응답이 기록되면 옛 광고 관리자 PRO 로 탭을 멈추지 않는다', async () => {
  const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => null });
  const r = await checkStorePro({ proNow: () => sig.latest() === true, pending: () => false,
    adPro: async () => { const v = sig.latest() !== false; sig.revoke(); return v; },
    fetchPro: async () => false, markPro: (at) => sig.mark(at), markFree: (at) => { sig.revoke(at); },
    markAdPro: () => sig.latest() !== false && sig.mark(), now: c.now });
  assert.notEqual(r, 'pro');
  assert.equal(sig.active(), false);
});

test('관문 7 — 같은 시각 응답은 PRO 가 이긴다(구매 성공 직후 같은 밀리초 무료 조회가 덮지 않음)', () => {
  const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => null });
  const t = c.now();
  assert.equal(sig.mark(t), true);
  assert.equal(sig.revoke(t), false); assert.equal(sig.active(), true);
  const sig2 = createStoreProSignal({ now: c.now, storage: () => null });
  assert.equal(sig2.revoke(t), true);
  assert.equal(sig2.mark(t), true, '같은 시각 PRO 는 무료를 덮는다(PRO 보호)'); assert.equal(sig2.active(), true);
});

test('관문 8 — 더 늦게 시작한 무료 조회는 먼저 시작한 조회의 PRO 를 덮는다(최신 응답 우선 · 게이트가 무료 사용자를 열지 않음)', async () => {
  const c = clock(Date.now());
  const sig = createStoreProSignal({ now: c.now, storage: () => null });
  const a = gate(sig, { isPro: false, ready: true }, c);
  const b = gate(sig, { isPro: false, ready: true }, c);
  const da = deferred<boolean>(), db = deferred<boolean>();
  const pa = a.proCheck(() => da.promise);
  await flush();
  c.advance(100);
  const pb = b.proCheck(() => db.promise); // B 가 나중에 시작
  await flush();
  da.resolve(true); assert.equal(await pa, 'pro');
  db.resolve(false); assert.equal(await pb, 'free');
  assert.equal(sig.active(), false);
  assert.equal(b.state().isPro, false);
});

// ── ★11/17 밤 교차 검토(중간 1·낮음 1) — 앱 전역 자리 선점 · 여는 시점 날짜 ─────────────
/** 게이트 하나의 ① 흐름 — ValueWall handleUnlockPress 와 같은 배선(공유 자리·공유 날짜 표식) */
function firstGate(o: {
  slot: ReturnType<typeof createGatePaywallSlot>; day: { v: string | null; writable?: boolean };
  check: () => Promise<'pro' | 'pending' | 'free' | 'unknown'>; proNow?: () => boolean; stillFree?: () => boolean; now?: () => Date;
}) {
  let checks = 0;
  const run = () => decideFirstGatePaywall({
    state: () => ({ iapAvailable: true, ready: true, isPro: o.proNow?.() ?? false }),
    slot: o.slot,
    check: () => { checks++; return o.check(); },
    proNow: o.proNow ?? (() => false),
    stillFree: o.stillFree ?? (() => true),
    readDay: () => o.day.v,
    markDay: (d) => { if (o.day.writable === false) return false; o.day.v = d; return true; },
    now: o.now,
  });
  return { run, checks: () => checks };
}

test('★11/17 중간 1 — 서로 다른 게이트 두 개 동시 탭: 재조회 «전» 선점으로 페이월 1개 · 다른 게이트는 기존 흐름(광고 없음 ②도 겹치지 않음)', async () => {
  const c = clock(); const slot = createGatePaywallSlot({ now: c.now });
  const day = { v: null as string | null };
  const qa = deferred<'free'>(); const qb = deferred<'free'>();
  const A = firstGate({ slot, day, check: () => qa.promise });
  const B = firstGate({ slot, day, check: () => qb.promise });
  const pa = A.run(); const pb = B.run();
  assert.deepEqual(await pb, { kind: 'busy' }, 'B 는 A 가 선점 중 — 재조회도, 광고·대체 창도 없이 넘긴다(관문 11170632)');
  assert.equal(B.checks(), 0);
  // (다른 경로로) B 의 광고가 안 나왔다(②) — A 가 자리를 잡고 있으면 페이월도 대체 창도 없음
  let nfChecks = 0;
  const nf = await decideNoFillPaywall({ state: () => FREE, shownThisTap: false, slot, check: async () => { nfChecks++; return 'free'; }, proNow: () => false, stillFree: () => true });
  assert.deepEqual(nf, { kind: 'busy' }); assert.equal(nfChecks, 0);
  qa.resolve('free'); qb.resolve('free');
  const ra = await pa;
  assert.equal(ra.kind, 'paywall', 'A 만 페이월');
  assert.equal(day.v, localDay(), '오늘로 기록');
  assert.ok(ra.kind === 'paywall' && slot.held(ra.slot), '페이월을 닫고 이어 할 일이 끝날 때까지 자리 유지');
  // A 의 흐름 끝(endFlow → releaseSlot) 뒤 같은 날 다른 게이트 탭 = 오늘 이미 봄
  if (ra.kind === 'paywall') slot.release(ra.slot);
  assert.equal(slot.busy(), false);
  const C = firstGate({ slot, day, check: async () => 'free' });
  assert.deepEqual(await C.run(), { kind: 'skip' }); assert.equal(C.checks(), 0);

  // 이중 안전장치 — 자리가 따로여도(가정) 여는 시점에 날짜 표식을 다시 읽어 두 번째는 열지 않는다
  const day2 = { v: null as string | null };
  const q1 = deferred<'free'>(); const q2 = deferred<'free'>();
  const X = firstGate({ slot: createGatePaywallSlot(), day: day2, check: () => q1.promise });
  const Y = firstGate({ slot: createGatePaywallSlot(), day: day2, check: () => q2.promise });
  const px = X.run(); const py = Y.run(); q1.resolve('free'); q2.resolve('free');
  assert.equal((await px).kind, 'paywall'); assert.deepEqual(await py, { kind: 'skip' }, '여는 시점 재판정으로도 두 번째는 막힌다');
});

test('★11/17 낮음 1 — 23:59:59 탭 · 재조회가 자정 뒤 끝나면 새 날짜로 기록(새 날짜에 다시 뜨지 않음)', async () => {
  let t = new Date(2026, 10, 17, 23, 59, 59);
  const slot = createGatePaywallSlot(); const day = { v: '2026-11-16' as string | null };
  const q = deferred<'free'>();
  const A = firstGate({ slot, day, check: () => q.promise, now: () => t });
  const p = A.run();
  await flush();
  t = new Date(2026, 10, 18, 0, 0, 1); // 자정 넘김
  q.resolve('free');
  const r = await p;
  assert.deepEqual(r.kind === 'paywall' && { day: r.day }, { day: '2026-11-18' });
  assert.equal(day.v, '2026-11-18', '여는 시점(새 날짜)으로 기록');
  if (r.kind === 'paywall') slot.release(r.slot);
  const B = firstGate({ slot, day, check: async () => 'free', now: () => new Date(2026, 10, 18, 0, 5) });
  assert.deepEqual(await B.run(), { kind: 'skip' }, '새 날짜 두 번째 탭은 페이월 없음');
  // 그날(전날) 이미 봤으면 23:59:59 탭은 재조회도 안 한다
  const day3 = { v: '2026-11-17' as string | null };
  const D = firstGate({ slot, day: day3, check: async () => 'free', now: () => new Date(2026, 10, 17, 23, 59, 59) });
  assert.deepEqual(await D.run(), { kind: 'skip' }); assert.equal(D.checks(), 0);
});

test('★11/17 재조회 대기 중 다른 곳(체험 안내·다른 경로)이 여는 날짜 표식을 남겼으면 열지 않고 자리를 놓는다', async () => {
  const slot = createGatePaywallSlot(); const day = { v: null as string | null };
  const q = deferred<'free'>();
  const A = firstGate({ slot, day, check: () => q.promise });
  const p = A.run(); await flush();
  day.v = localDay(); // trial_announce 가 markGateDay(localDay())
  q.resolve('free');
  assert.deepEqual(await p, { kind: 'skip' });
  assert.equal(slot.busy(), false);
});

test('★11/17 PRO 확인 → 자리 해제·미표시·날짜 기록 없음(그날 기회 보존)', async () => {
  const slot = createGatePaywallSlot(); const day = { v: null as string | null };
  assert.deepEqual(await firstGate({ slot, day, check: async () => 'pro' }).run(), { kind: 'pro' });
  assert.equal(slot.busy(), false); assert.equal(day.v, null);
  // 무료 응답이 왔지만 대기 중 다른 경로에서 PRO 로 바뀜 → PRO(페이월 금지)
  let pro = false; const q = deferred<'free'>();
  const p = firstGate({ slot, day, check: () => q.promise, proNow: () => pro }).run();
  await flush(); pro = true; q.resolve('free');
  assert.deepEqual(await p, { kind: 'pro' });
  assert.equal(slot.busy(), false); assert.equal(day.v, null);
});

test('★11/17 조회 실패·결제 진행 중·체험 안내 봄·기록 실패 → 자리 해제·미표시 · 다음 탭은 다시 기회', async () => {
  const slot = createGatePaywallSlot();
  for (const st of ['unknown', 'pending'] as const) {
    const day = { v: null as string | null };
    assert.deepEqual(await firstGate({ slot, day, check: async () => st }).run(), { kind: 'skip' }, st);
    assert.equal(slot.busy(), false, `${st} — 자리 해제`); assert.equal(day.v, null, `${st} — 날짜 기록 없음`);
    const again = await firstGate({ slot, day, check: async () => 'free' }).run();
    assert.equal(again.kind, 'paywall', `${st} 뒤 다음 탭은 그날 기회가 남아 있다`);
    if (again.kind === 'paywall') slot.release(again.slot);
  }
  {
    const day = { v: null as string | null };
    assert.deepEqual(await firstGate({ slot, day, check: async () => 'free', stillFree: () => false }).run(), { kind: 'skip' });
    assert.equal(slot.busy(), false); assert.equal(day.v, null);
  }
  {
    const day = { v: null as string | null, writable: false };
    assert.deepEqual(await firstGate({ slot, day, check: async () => 'free' }).run(), { kind: 'skip' }, '기록 실패 = 안 보인다(매 탭 반복 방지)');
    assert.equal(slot.busy(), false);
  }
  {
    // 조회가 던져도 자리는 남지 않는다
    const day = { v: null as string | null };
    await assert.rejects(firstGate({ slot, day, check: async () => { throw new Error('x'); } }).run());
    assert.equal(slot.busy(), false);
  }
});

test('★11/17 자리 — 다른 번호는 풀지 못함 · 2분 지나면 풀림(닫힘이 끝내 안 불린 경우)', () => {
  const c = clock(); const slot = createGatePaywallSlot({ now: c.now });
  const a = slot.claim(); assert.ok(a > 0);
  assert.equal(slot.claim(), 0);
  slot.release(a + 1); assert.equal(slot.busy(), true, '남의 번호로는 안 풀린다');
  slot.release(0); assert.equal(slot.busy(), true);
  c.advance(GATE_SLOT_MAX_MS - 1); assert.equal(slot.held(a), true);
  c.advance(1); assert.equal(slot.held(a), false); assert.equal(slot.busy(), false);
  const b = slot.claim(); assert.ok(b > 0 && b !== a);
  slot.release(a); assert.equal(slot.held(b), true, '만료된 옛 번호가 새 자리를 풀지 않는다');
});

test('★11/17 ② 광고 없음 — 같은 탭 ① 뒤 생략 · PRO 멈춤 · 무료면 자리 잡고 열기 · 모름은 대체 창(자리 해제)', async () => {
  const slot = createGatePaywallSlot();
  const base = { state: () => FREE, slot, proNow: () => false, stillFree: () => true };
  assert.deepEqual(await decideNoFillPaywall({ ...base, shownThisTap: true, check: async () => 'free' }), { kind: 'fallback' });
  assert.deepEqual(await decideNoFillPaywall({ ...base, shownThisTap: false, check: async () => 'pro' }), { kind: 'pro' });
  assert.equal(slot.busy(), false);
  assert.deepEqual(await decideNoFillPaywall({ ...base, shownThisTap: false, check: async () => 'unknown' }), { kind: 'fallback' });
  assert.equal(slot.busy(), false);
  assert.deepEqual(await decideNoFillPaywall({ ...base, shownThisTap: false, check: async () => 'free', stillFree: () => false }), { kind: 'fallback' });
  assert.equal(slot.busy(), false);
  const r = await decideNoFillPaywall({ ...base, shownThisTap: false, check: async () => 'free' });
  assert.equal(r.kind, 'paywall'); assert.equal(slot.busy(), true);
  // 열려 있는 동안 다른 게이트의 ① 도 열지 않는다(탭을 넘김)
  assert.deepEqual(await firstGate({ slot, day: { v: null }, check: async () => 'free' }).run(), { kind: 'busy' });
});

test('★11/17 관문 중간 — 페이월이 열린 채 2분이 지나도 자리는 유지(다른 게이트의 광고 없음 ②가 겹치지 않음) · 닫힘에 해제 · 30분 최후 상한', async () => {
  const c = clock(); const slot = createGatePaywallSlot({ now: c.now });
  const day = { v: null as string | null };
  const A = firstGate({ slot, day, check: async () => 'free' });
  const ra = await A.run();
  assert.equal(ra.kind, 'paywall');
  c.advance(GATE_SLOT_MAX_MS + 60_000); // 페이월 열린 채 3분
  let nfChecks = 0;
  const nf = await decideNoFillPaywall({ state: () => FREE, shownThisTap: false, slot, check: async () => { nfChecks++; return 'free'; }, proNow: () => false, stillFree: () => true });
  assert.deepEqual(nf, { kind: 'busy' }, '열린 페이월 위에 ad_nofill·대체 창을 겹쳐 열지 않는다'); assert.equal(nfChecks, 0);
  // A 자신의 이어지는 광고(같은 탭 ① 뒤 — shownThisTap)는 자기 자리를 «사용 중»으로 보지 않는다 → 예전 대체 창
  if (ra.kind === 'paywall') assert.deepEqual(await decideNoFillPaywall({ state: () => FREE, shownThisTap: true, slot, ownSlot: ra.slot, check: async () => 'free', proNow: () => false, stillFree: () => true }), { kind: 'fallback' });
  if (ra.kind === 'paywall') slot.release(ra.slot); // 닫힘 → endFlow
  const nf2 = await decideNoFillPaywall({ state: () => FREE, shownThisTap: false, slot, check: async () => 'free', proNow: () => false, stillFree: () => true });
  assert.equal(nf2.kind, 'paywall', '닫힌 뒤에는 다시 가능');
  c.advance(GATE_SLOT_PINNED_MAX_MS); assert.equal(slot.busy(), false, '최후 상한');
  // 닫힌 뒤 이어 할 일(광고)이 멈춰도 2분이면 풀린다(unpin)
  const id2 = slot.claim(); assert.equal(slot.pin(id2), true); c.advance(GATE_SLOT_MAX_MS * 3); assert.equal(slot.held(id2), true);
  slot.unpin(id2); c.advance(GATE_SLOT_MAX_MS - 1); assert.equal(slot.held(id2), true); c.advance(1); assert.equal(slot.busy(), false);
  // 재조회 중(아직 안 연) 자리는 2분 상한 그대로 · 만료된 번호는 pin 못 함
  const id = slot.claim(); c.advance(GATE_SLOT_MAX_MS); assert.equal(slot.pin(id), false);
});

test('★11/17 관문 낮음 — 재조회 사이 화면을 떠나면(alive=false) 날짜를 기록하지 않고 자리를 놓는다(그날 기회 보존)', async () => {
  const slot = createGatePaywallSlot(); const day = { v: null as string | null };
  let alive = true; const q = deferred<'free'>();
  const p = firstGate({ slot, day, check: () => q.promise, stillFree: () => alive }).run();
  await flush(); alive = false; q.resolve('free');
  assert.deepEqual(await p, { kind: 'skip' });
  assert.equal(day.v, null); assert.equal(slot.busy(), false);
});

test('★11/17 관문 11170635 — 대체 창이 열린 동안 자리 유지: 다른 게이트의 광고 없음(②)은 페이월·창을 겹쳐 열지 않음 · 창 닫힘에 해제', async () => {
  const c = clock(); const slot = createGatePaywallSlot({ now: c.now });
  // ValueWall openFallback 과 같은 계산 — ① 뒤 자기 자리를 넘겨받거나 새로 잡아 pin
  const openFallback = (own: number) => { const id = own && slot.held(own) ? own : slot.claim(); if (id && id === own) slot.unpin(id); return id; };
  const a = await firstGate({ slot, day: { v: null }, check: async () => 'free' }).run();
  assert.equal(a.kind, 'paywall');
  const modal = openFallback(a.kind === 'paywall' ? a.slot : 0);
  assert.ok(modal > 0 && a.kind === 'paywall' && modal === a.slot, '자기 자리를 창 몫으로 넘겨받는다');
  c.advance(GATE_SLOT_MAX_MS - 1); // 창이 열린 채(흐름 endFlow 는 이미 끝)
  assert.deepEqual(await decideNoFillPaywall({ state: () => FREE, shownThisTap: false, slot, check: async () => 'free', proNow: () => false, stillFree: () => true }), { kind: 'busy' });
  // 자리를 못 잡은 다른 게이트는 창을 겹쳐 열지 않는다
  assert.equal(openFallback(0), 0);
  slot.release(modal); // closeFallback · 창이 그려지지 않게 된 effect
  assert.equal(slot.busy(), false);
  // 창 몫 자리는 2분 상한(닫힘 콜백 없이 사라져도 오래 남지 않음)
  const m1 = openFallback(0); c.advance(GATE_SLOT_MAX_MS); assert.equal(slot.held(m1), false);
  // 자리 없이 연 창(① 없이 광고 없음 → 대체 창)도 새로 잡아 유지
  const m2 = openFallback(0); assert.ok(m2 > 0); assert.equal(slot.busy(), true); slot.release(m2);
});
