/**
 * 체험자 알림 권한 다시 묻기 (2026-11-18, src/lib/app/trialPushOptIn.ts · TrialPushOptIn{Host,Gate,Sheet}.tsx)
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/trialPushOptIn.test.ts
 *
 * 지키는 것
 *  ① 자격 행렬: 네이티브 · 검증된 활성 TRIAL · OS prompt · 다른 시트/첫 실행/결제/게이트 없음 · 앞 화면 · 앱 경로 · 설정 OFF 아님 · AI 줄 보임(ai) · 다음 날(day1)
 *  ② 1회 상한: 보이기 직전 기록·다시 읽기 · 두 번째는 false · 이미 봤으면 stop
 *  ③ 권한 상태: denied·granted·prompt-with-rationale = stop(시트 없음) · 모름 = skip
 *  ④ 수락: 여전히 prompt 일 때만 요청 «한 번» · 허용 = 등록 경로(같은 함수) · 거절/밀어 닫음/모름 구분 · 자격이 사라졌으면 요청 없음
 *  ⑤ 저장소 실패: 읽기·쓰기·다시 읽기 불일치·없음 = 안 보인다
 *  ⑥ 화면(소스 대조): 기존 알림 단계 재사용 · 기본 문구 불변 · 레이아웃에 하나 · 내 종목 실제 행에만 표식 · 계측 닫힌 목록·판독기 일치
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TRIAL_PUSH_OPTIN_KEY, RATING_PRO_PENDING_KEY, AFTER_PRO_QUIET_MS, WL_AI_ATTR,
  aiLineVisible, claimShown, dayOf, inProQuiet, nextDayDue, normPerm, outcomeStage, prefsOff, readShown, routeOk,
  runTrialPushAccept, trialFromInfo, trialPushCopy, trialPushStep, triggerSrc, tickStep, nextStreak, SHOW_STREAK,
  type PermState, type TrialPushState,
} from '../src/lib/app/trialPushOptIn';
import { FUNNEL_SRCS, FUNNEL_STAGES, isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';
import { firstRunCopy } from '../src/lib/app/firstRunCopy';

let n = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => { tests.push([name, fn]); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const NOW = Date.parse('2026-11-18T10:00:00+09:00');
const HOUR = 3_600_000;
const trialOk = { expiresAt: NOW + 6 * 24 * HOUR, startedAt: NOW - 2 * HOUR };

function base(over: Partial<TrialPushState> = {}): TrialPushState {
  return {
    native: true, shown: false, prefsOff: false, perm: 'prompt', trial: trialOk, trigger: 'ai', now: NOW, onboarded: true,
    dialogOpen: false, purchasePending: false, gateFlow: false, visible: true, routeOk: true, proQuiet: false, aiVisible: true,
    ...over,
  };
}
function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, v); } };
}
const info = (ent: Record<string, unknown> | null) => ({ entitlements: { active: ent ? { pro: ent } : {} } });
const iso = (ms: number) => new Date(ms).toISOString();

// ── ① 자격 행렬 ──
t('자격: 모든 조건이 참이면 show (ai)', () => {
  assert.equal(trialPushStep(base()), 'show');
});
t('자격: 웹(네이티브 아님) · 이미 봄 = stop', () => {
  assert.equal(trialPushStep(base({ native: false })), 'stop');
  assert.equal(trialPushStep(base({ shown: true })), 'stop');
});
t('자격: 체험 아님·만료·조회 실패 = skip(다음 트리거에 다시)', () => {
  assert.equal(trialPushStep(base({ trial: null })), 'skip');
  assert.equal(trialPushStep(base({ trial: { expiresAt: NOW - 1, startedAt: null } })), 'skip');
});
t('자격: 설정에서 알림 OFF = skip', () => {
  assert.equal(trialPushStep(base({ prefsOff: true })), 'skip');
});
t('자격: 첫 실행 중·다른 시트·결제 중·게이트 흐름·뒤로 감·설정/문서 경로·결제 직후 평점 창·AI 줄이 화면 밖 = later', () => {
  for (const o of [{ onboarded: false }, { dialogOpen: true }, { purchasePending: true }, { gateFlow: true }, { visible: false }, { routeOk: false }, { proQuiet: true }, { aiVisible: false }] as Partial<TrialPushState>[]) {
    assert.equal(trialPushStep(base(o)), 'later', JSON.stringify(o));
  }
});
t('자격: day1 는 AI 줄과 무관 · 체험 시작 «다음 날»(현지) 이후만 · 시작 시각 모르면 skip', () => {
  const start = Date.parse('2026-11-17T23:50:00+09:00');
  const tr = { expiresAt: NOW + 5 * 24 * HOUR, startedAt: start };
  assert.equal(trialPushStep(base({ trigger: 'day1', aiVisible: false, trial: tr })), dayOf(NOW) > dayOf(start) ? 'show' : 'skip');
  assert.equal(trialPushStep(base({ trigger: 'day1', aiVisible: false, trial: { ...tr, startedAt: NOW - HOUR } })), dayOf(NOW) > dayOf(NOW - HOUR) ? 'show' : 'skip');
  assert.equal(trialPushStep(base({ trigger: 'day1', trial: { ...tr, startedAt: null } })), 'skip');
  assert.equal(nextDayDue(null, NOW), false);
  assert.equal(nextDayDue(NaN, NOW), false);
  assert.equal(nextDayDue(NOW - 30 * HOUR, NOW), true);
  assert.equal(nextDayDue(NOW, NOW), false);
});
t('자격: 우선순위 — 권한이 정해졌으면 다른 조건과 무관하게 stop', () => {
  assert.equal(trialPushStep(base({ perm: 'denied', trial: null, dialogOpen: true })), 'stop');
  assert.equal(trialPushStep(base({ perm: 'granted', prefsOff: true })), 'stop');
});
t('체험 판정(좁게): isActive·TRIAL·미래 만료만 · 시작 시각은 있을 때만', () => {
  const ok = info({ isActive: true, periodType: 'TRIAL', expirationDate: iso(NOW + 5 * 24 * HOUR), latestPurchaseDate: iso(NOW - HOUR) });
  assert.deepEqual(trialFromInfo(ok, NOW), { expiresAt: Date.parse(iso(NOW + 5 * 24 * HOUR)), startedAt: Date.parse(iso(NOW - HOUR)) });
  assert.equal(trialFromInfo(info({ isActive: true, periodType: 'NORMAL', expirationDate: iso(NOW + HOUR) }), NOW), null);
  assert.equal(trialFromInfo(info({ isActive: true, periodType: 'INTRO', expirationDate: iso(NOW + HOUR) }), NOW), null);
  assert.equal(trialFromInfo(info({ isActive: false, periodType: 'TRIAL', expirationDate: iso(NOW + HOUR) }), NOW), null);
  assert.equal(trialFromInfo(info({ isActive: true, periodType: 'TRIAL', expirationDate: iso(NOW - 1) }), NOW), null);
  assert.equal(trialFromInfo(info({ isActive: true, periodType: 'TRIAL', expirationDate: null }), NOW), null);
  assert.equal(trialFromInfo(info({ isActive: true, periodType: 'TRIAL' }), NOW), null);
  assert.equal(trialFromInfo(info(null), NOW), null);
  assert.equal(trialFromInfo(null, NOW), null);
  assert.equal(trialFromInfo({ entitlements: null }, NOW), null);
  const noStart = trialFromInfo(info({ isActive: true, periodType: 'TRIAL', expirationDate: iso(NOW + HOUR), latestPurchaseDate: 'x' }), NOW);
  assert.equal(noStart?.startedAt, null);
  const future = trialFromInfo(info({ isActive: true, periodType: 'TRIAL', expirationDate: iso(NOW + HOUR), latestPurchaseDate: iso(NOW + 2 * HOUR) }), NOW);
  assert.equal(future?.startedAt, null, '미래 시작 시각은 믿지 않는다');
});
t('설정 OFF: 전체·모닝 OFF 만 · 저장값 없음/다른 칸 OFF 는 OFF 아님', () => {
  assert.equal(prefsOff(null), false);
  assert.equal(prefsOff({}), false);
  assert.equal(prefsOff({ enabled: false }), true);
  assert.equal(prefsOff({ morning: false }), true);
  assert.equal(prefsOff({ enabled: true, morning: true }), false);
  assert.equal(prefsOff({ closing: false } as { morning?: boolean }), false);
});
t('경로: 앱 화면만 · 설정·약관·개인정보·첫 실행 화면 제외', () => {
  assert.equal(routeOk('/ko/app-view/watchlist'), true);
  assert.equal(routeOk('/en/app-view/dash'), true);
  for (const p of ['/ko/app-view/settings', '/en/app-view/terms', '/ja/app-view/privacy', '/ko/app-view/onboarding', '/ko/pro', '/']) assert.equal(routeOk(p), false, p);
});
t('결제 직후 평점 창: 성공 표식 15초 안만', () => {
  assert.equal(inProQuiet(memStore({ [RATING_PRO_PENDING_KEY]: String(NOW - 1000) }), NOW), true);
  assert.equal(inProQuiet(memStore({ [RATING_PRO_PENDING_KEY]: String(NOW - AFTER_PRO_QUIET_MS) }), NOW), false);
  assert.equal(inProQuiet(memStore(), NOW), false);
  assert.equal(inProQuiet(null, NOW), false);
});
t('AI 줄 보임: 표식 칸이 화면 안에 높이를 갖고 걸칠 때만', () => {
  const doc = (rects: Array<{ top: number; height: number }>) => ({ querySelectorAll: (q: string) => { assert.equal(q, `[${WL_AI_ATTR}]`); return rects.map((r) => ({ getBoundingClientRect: () => ({ ...r, bottom: r.top + r.height }) })); } });
  assert.equal(aiLineVisible(doc([{ top: 300, height: 40 }]), 812), true);
  assert.equal(aiLineVisible(doc([]), 812), false);
  assert.equal(aiLineVisible(doc([{ top: 900, height: 40 }]), 812), false);
  assert.equal(aiLineVisible(doc([{ top: -80, height: 40 }]), 812), false);
  assert.equal(aiLineVisible(doc([{ top: 300, height: 0 }]), 812), false);
  assert.equal(aiLineVisible({ querySelectorAll: () => { throw new Error('x'); } }, 812), false);
});

// ── ② 1회 상한 · ⑤ 저장소 실패 ──
t('1회: 기록 성공 → 이미 봄 · 두 번째 기록은 false · stop', () => {
  const s = memStore();
  assert.equal(readShown(s), false);
  assert.equal(claimShown(s, NOW), true);
  assert.equal(s.m.get(TRIAL_PUSH_OPTIN_KEY), String(NOW));
  assert.equal(readShown(s), true);
  assert.equal(claimShown(s, NOW + 1), false);
  assert.equal(trialPushStep(base({ shown: readShown(s) })), 'stop');
});
t('저장소 실패: 없음·읽기 던짐·쓰기 던짐·다시 읽기 불일치 = 안 보인다', () => {
  assert.equal(readShown(null), true);
  assert.equal(claimShown(null), false);
  const throwsGet = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
  assert.equal(readShown(throwsGet), true);
  assert.equal(claimShown(throwsGet), false);
  const throwsSet = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(readShown(throwsSet), false);
  assert.equal(claimShown(throwsSet), false);
  const silentDrop = { getItem: () => null, setItem: () => {} }; // 쓰기를 조용히 버리는 웹뷰
  assert.equal(claimShown(silentDrop), false);
});

// ── ③ 권한 상태 ──
t('권한: denied·granted·prompt-with-rationale = stop(시트 없음) · 모름 = skip', () => {
  assert.equal(trialPushStep(base({ perm: 'denied' })), 'stop');
  assert.equal(trialPushStep(base({ perm: 'granted' })), 'stop');
  assert.equal(trialPushStep(base({ perm: 'prompt-with-rationale' })), 'stop');
  assert.equal(trialPushStep(base({ perm: 'unknown' })), 'skip');
});
t('권한 값 정규화: 플러그인 값 그대로만', () => {
  assert.equal(normPerm({ receive: 'prompt' }), 'prompt');
  assert.equal(normPerm({ receive: 'denied' }), 'denied');
  assert.equal(normPerm({ receive: 'granted' }), 'granted');
  assert.equal(normPerm({ receive: 'prompt-with-rationale' }), 'prompt-with-rationale');
  assert.equal(normPerm({ receive: 'provisional' }), 'unknown');
  assert.equal(normPerm(null), 'unknown');
  assert.equal(normPerm({}), 'unknown');
});

// ── ④ 수락 ──
function acceptDeps(seq: PermState[], req: 'granted' | 'denied' | 'na' | 'throw', eligible = true) {
  const calls = { check: 0, request: 0 };
  return {
    calls,
    deps: {
      stillEligible: () => eligible,
      checkPerm: async () => { const v = seq[Math.min(calls.check, seq.length - 1)]; calls.check++; return v; },
      requestAndRegister: async () => { calls.request++; if (req === 'throw') throw new Error('plugin'); return req; },
    },
  };
}
t('수락: prompt → 요청 한 번 → 허용 = granted(등록 경로는 같은 함수 안) · 계측 os_granted', async () => {
  const { calls, deps } = acceptDeps(['prompt'], 'granted');
  const o = await runTrialPushAccept(deps);
  assert.equal(o, 'granted');
  assert.equal(calls.request, 1);
  assert.equal(outcomeStage(o), 'trial_push_os_granted');
});
t('수락: 거절 → 다시 읽어 denied = denied · 계측 os_denied · 요청은 한 번', async () => {
  const { calls, deps } = acceptDeps(['prompt', 'denied'], 'denied');
  const o = await runTrialPushAccept(deps);
  assert.equal(o, 'denied');
  assert.equal(calls.request, 1);
  assert.equal(outcomeStage(o), 'trial_push_os_denied');
});
t('수락: 창을 밀어 닫음(여전히 prompt) = prompt · 계측 없음 · 다시 요청하지 않음', async () => {
  const { calls, deps } = acceptDeps(['prompt', 'prompt'], 'denied');
  const o = await runTrialPushAccept(deps);
  assert.equal(o, 'prompt');
  assert.equal(calls.request, 1);
  assert.equal(outcomeStage(o), null);
});
t('수락: 안드 한 번 거절(prompt-with-rationale) = denied', async () => {
  const { deps } = acceptDeps(['prompt', 'prompt-with-rationale'], 'denied');
  assert.equal(await runTrialPushAccept(deps), 'denied');
});
t('수락: 플러그인 없음·던짐 = unknown(추정하지 않음)', async () => {
  assert.equal(await runTrialPushAccept(acceptDeps(['prompt'], 'na').deps), 'unknown');
  assert.equal(await runTrialPushAccept(acceptDeps(['prompt'], 'throw').deps), 'unknown');
  assert.equal(outcomeStage('unknown'), null);
});
t('수락: 누르는 사이 이미 허용·거절·모름이 됐으면 요청 없음(skipped)', async () => {
  for (const p of ['granted', 'denied', 'prompt-with-rationale', 'unknown'] as PermState[]) {
    const { calls, deps } = acceptDeps([p], 'granted');
    assert.equal(await runTrialPushAccept(deps), 'skipped', p);
    assert.equal(calls.request, 0, p);
  }
});
t('수락: 자격 재확인은 비동기(새 고객 정보)도 기다린다 — 철회·조회 실패(false)면 요청 없음', async () => {
  const a = acceptDeps(['prompt'], 'granted');
  assert.equal(await runTrialPushAccept({ ...a.deps, stillEligible: async () => false }), 'skipped');
  assert.equal(a.calls.request, 0);
  const b = acceptDeps(['prompt'], 'granted');
  assert.equal(await runTrialPushAccept({ ...b.deps, stillEligible: async () => true }), 'granted');
  assert.equal(b.calls.request, 1);
  const c = acceptDeps(['prompt'], 'granted');
  assert.equal(await runTrialPushAccept({ ...c.deps, stillEligible: async () => { throw new Error('rc'); } }), 'skipped');
  assert.equal(c.calls.request, 0);
  const sheet = read('src/components/app/TrialPushOptInSheet.tsx');
  assert.ok(/stillEligible: async \(\) => \{[\s\S]*?trialFromInfo\(await freshCustomerInfo\(VERIFY_MS, \{ noCache: true \}\)/.test(sheet), '시트 수락은 캐시를 비운 새 고객 정보로 TRIAL 을 다시 본다');
  const rc = read('src/lib/native/rcFresh.ts');
  assert.ok(/if \(opts\.noCache\) await Purchases\.invalidateCustomerInfoCache\(\);\s+return Purchases\.getCustomerInfo\(\);/.test(rc));
  const askBody = rc.slice(rc.indexOf('const ask = async () => {'), rc.indexOf('const r = await Promise.race(['));
  assert.ok(/await initRevenueCat\(\)/.test(askBody), '시간 상한이 SDK 초기화까지 포함');
});
t('박자: 첫 가치 순간(AI 줄 보임)이 우선 · AI 가 화면 밖이면 다음 날 경로 · 둘 다 아니면 skip/later', () => {
  const st = (o: Partial<TrialPushState> = {}) => { const { trigger: _t, ...rest } = base(o); return rest; };
  const day0 = { expiresAt: NOW + 6 * 24 * HOUR, startedAt: NOW };
  const day1 = { expiresAt: NOW + 5 * 24 * HOUR, startedAt: NOW - 30 * HOUR };
  assert.deepEqual(tickStep(st({ trial: day1 }), true), { step: 'show', trigger: 'ai' }, 'AI 줄이 보이면 다음 날이어도 AI');
  assert.deepEqual(tickStep(st({ trial: day1, aiVisible: false }), true), { step: 'show', trigger: 'day1' }, 'AI 줄이 화면 밖이면 다음 날 경로');
  assert.deepEqual(tickStep(st({ trial: day0, aiVisible: false }), true), { step: 'later', trigger: 'ai' }, '시작 당일 AI 줄 화면 밖 = 계속 본다');
  assert.deepEqual(tickStep(st({ trial: day0 }), false), { step: 'skip', trigger: 'day1' }, '당일·AI 줄 없음 = 박자 멈춤');
  assert.deepEqual(tickStep(st({ trial: day1 }), false), { step: 'show', trigger: 'day1' });
  assert.deepEqual(tickStep(st({ trial: day1, dialogOpen: true }), true), { step: 'later', trigger: 'ai' });
  assert.deepEqual(tickStep(st({ perm: 'denied' }), true), { step: 'stop', trigger: 'ai' });
  assert.deepEqual(tickStep(st({ perm: 'granted' }), false), { step: 'stop', trigger: 'day1' });
  assert.deepEqual(tickStep(st({ shown: true }), false).step, 'stop');
});
t('박자: 같은 트리거 show 가 2박자 연속일 때만 · 바뀌거나 막히면 0부터', () => {
  let k: { n: number; trigger: 'ai' | 'day1' | null } = { n: 0, trigger: null };
  k = nextStreak(k, { step: 'show', trigger: 'ai' }); assert.deepEqual(k, { n: 1, trigger: 'ai' });
  k = nextStreak(k, { step: 'show', trigger: 'day1' }); assert.deepEqual(k, { n: 1, trigger: 'day1' });
  k = nextStreak(k, { step: 'show', trigger: 'day1' }); assert.equal(k.n >= SHOW_STREAK, true);
  k = nextStreak(k, { step: 'later', trigger: 'ai' }); assert.deepEqual(k, { n: 0, trigger: null });
});
t('판정기(소스): 권한 재확인 «뒤»의 화면으로 다시 판정 → 기록 성공 뒤에만 보임 · 아니면 박자 계속 · 체험 시작 이벤트로 다시 읽기', () => {
  const g = read('src/components/app/TrialPushOptInGate.tsx');
  const p2 = g.indexOf('const p2 = await checkPushPerm();');
  const last = g.indexOf('const last = tickStep(snapshot(p2), trialValueSeen());');
  const claim = g.indexOf('if (!claimShown(store)) { finish(); return; }');
  assert.ok(p2 > 0 && p2 < last && last < claim && claim < g.indexOf("trackFunnel('trial_push_shown'"));
  assert.ok(/if \(last\.step !== 'show'\) \{ streak = \{ n: 0, trigger: null \}; return; \}/.test(g), '막판에 바뀌면 끝내지 않고 박자를 이어 간다');
  assert.ok(/const src = triggerSrc\(last\.trigger\);/.test(g), '출처는 막판에 다시 고른 트리거');
  assert.ok(/if \(p2 === 'unknown'\) \{ streak = \{ n: 0, trigger: null \}; return; \}\s+perm = p2;/.test(g), '막판 권한 모름은 prompt 를 지우지 않는다');
  assert.ok(/if \(!alive \|\| run\.done \|\| finalizing \|\| reading \|\| !trial\) return;/.test(g), '자격을 다시 읽는 중엔 박자를 채우지 않는다');
  assert.ok(/if \(info == null\) \{[^}]*?trial = null; readAt = 0; stopTick\(\); scheduleRetry\(\);/.test(g), '조회 실패 = 모름 · 30초 묶음 밖 · 다시 읽기');
  assert.ok(/readAt = 0;\s+if \(p === 'unknown'\) scheduleRetry\(\);/.test(g), '권한 모름도 같은 재시도 · 설정 OFF 도 묶음 밖');
  assert.ok(/retryT = window\.setTimeout\(\(\) => \{ retryT = 0; void read\(true\); \}, READ_RETRY_MS\)/.test(g));
  const settings = read('src/app/[locale]/app-view/settings/page.tsx');
  assert.ok(/const keysToKeep: string\[\] = \[[^\]]*TRIAL_PUSH_OPTIN_KEY/.test(settings), '설정 캐시 지우기가 1회 기록을 남긴다');
  assert.ok(g.indexOf('if (info == null)') < g.indexOf('readAt = Date.now();\n        if (trial) startTick()'), '성공한 조회만 30초 묶음');
  assert.ok(/if \(streak\.n < SHOW_STREAK\) return;/.test(g));
  assert.ok(/window\.addEventListener\(PRO_ACTIVATED_EVENT, onPro\)/.test(g) && /const onPro = \(\) => \{ void read\(true\); \};/.test(g));
  assert.ok(/window\.addEventListener\(TRIAL_VALUE_EVENT, onValue\)/.test(g));
  assert.ok(!/fetch\(/.test(g), '박자는 네트워크를 쓰지 않는다');
});
t('수락: 자격이 사라졌으면(체험 만료·설정 OFF·웹) 권한도 안 읽고 요청 없음', async () => {
  const { calls, deps } = acceptDeps(['prompt'], 'granted', false);
  assert.equal(await runTrialPushAccept(deps), 'skipped');
  assert.equal(calls.request, 0);
  assert.equal(calls.check, 0);
  const thrower = { ...deps, stillEligible: () => { throw new Error('x'); } };
  assert.equal(await runTrialPushAccept(thrower), 'skipped');
});

// ── ⑥ 화면·계측(소스 대조) ──
t('문구: 새 문구는 제목·한 줄·버튼 둘 · en·ja 있음 · 한 줄은 실제 모닝 푸시(시장 브리프)와 일치 — «내 종목 요약» 약속 없음', () => {
  assert.deepEqual(trialPushCopy('ko'), { title: '아침 AI 브리핑 받기', subtitle: '장 시작 전 AI 시장 브리핑을 알림으로 알려드려요', allow: '알림 켜기', later: '나중에' });
  const cron = read('src/app/api/cron/push/route.ts');
  assert.ok(/body: lines\[l\]\.line \?\? PUSH_CONTENT\[type\]\[l\]\.body/.test(cron), '모닝 본문 = AI 브리핑 첫 문장 또는 «준비됨» 안내');
  for (const l of ['ko', 'en', 'ja']) assert.ok(!/내 종목|your stocks|マイ銘柄/.test(trialPushCopy(l).subtitle), l);
  const send = read('src/lib/push/send.ts');
  assert.ok(/morning: \{\n\s+ko: \{ title: '🌅 모닝 브리프', body: '오늘의 프리마켓 시장 브리프가 준비됐습니다\.' \}/.test(send), '모닝 푸시가 시장 브리프다');
  for (const l of ['en', 'ja']) {
    const c = trialPushCopy(l);
    assert.deepEqual(Object.keys(c).sort(), ['allow', 'later', 'subtitle', 'title']);
    for (const v of Object.values(c)) assert.ok(v.length > 0);
  }
  assert.equal(trialPushCopy('de'), trialPushCopy('en'));
});
t('재사용: 시트는 첫 실행 알림 단계(FirstRunNotifStep)·같은 오버레이 CSS·같은 등록 함수 — 새 스타일 파일 없음', () => {
  const sheet = read('src/components/app/TrialPushOptInSheet.tsx');
  assert.ok(/import \{ FirstRunNotifStep \} from '\.\/FirstRunValueStep'/.test(sheet));
  assert.ok(/import \{ requestPushAndRegister \} from '\.\/AppFirstRunOnboarding'/.test(sheet));
  assert.ok(/import base from '\.\/AppFirstRunOnboarding\.module\.css'/.test(sheet));
  assert.ok(/requestAndRegister: requestPushAndRegister/.test(sheet));
  assert.ok(/aria-modal="true"/.test(sheet));
  assert.ok(!/\.requestPermissions\(/.test(sheet), '시트가 직접 권한 창을 부르지 않는다(한 함수만)');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'src/components/app/TrialPushOptInSheet.module.css')));
  const onb = read('src/components/app/AppFirstRunOnboarding.tsx');
  assert.ok(/export async function requestPushAndRegister\(\): Promise<PushResult>/.test(onb));
  assert.equal((onb.match(/PushNotifications\.requestPermissions\(\)/g) || []).length, 1);
  const gate = read('src/components/app/TrialPushOptInGate.tsx');
  assert.ok(!/\.requestPermissions\(/.test(gate), '판정기는 권한을 읽기만 한다');
  assert.ok(!/\.requestPermissions\(/.test(read('src/lib/native/pushPerm.ts')));
});
t('첫 실행 알림 단계: copy 를 안 주면 기존 문구 그대로', () => {
  const src = read('src/components/app/FirstRunValueStep.tsx');
  assert.ok(/const t = copy \? \{ \.\.\.firstRunCopy\(loc\)\.notif, \.\.\.copy \} : firstRunCopy\(loc\)\.notif;/.test(src));
  const onb = read('src/components/app/AppFirstRunOnboarding.tsx');
  assert.ok(!/copy=\{/.test(onb.slice(onb.indexOf('<FirstRunNotifStep'), onb.indexOf('<FirstRunNotifStep') + 400)), '첫 실행은 copy 를 넘기지 않는다');
  assert.equal(firstRunCopy('ko').notif.allow.length > 0, true);
});
t('레이아웃: 자리는 하나 · 내 종목은 실제 행에만 표식 · 예시 행 제외', () => {
  const lay = read('src/app/[locale]/app-view/layout.tsx');
  assert.equal((lay.match(/<TrialPushOptInHost \/>/g) || []).length, 1);
  const wl = read('src/app/[locale]/app-view/watchlist/page.tsx');
  assert.ok(/<div className=\{p\.aiw\} \{\.\.\.\(interactive \? \{ \[WL_AI_ATTR\]: '' \} : \{\}\)\}>/.test(wl));
  assert.ok(/useEffect\(\(\) => \{ if \(aiShownKey && !empty\) noteTrialValueMoment\(\); \}, \[aiShownKey, empty\]\);/.test(wl));
  assert.ok(/previewRows\.map\(\(r\) => renderRow\(r, false\)\)/.test(wl));
});
t('계측: 다섯 단계·두 출처는 닫힌 목록 · 판독기 목록 일치 · 구매 표에서 빠짐', () => {
  for (const st of ['trial_push_shown', 'trial_push_accept', 'trial_push_os_granted', 'trial_push_os_denied', 'trial_push_dismiss']) assert.ok(isFunnelStage(st), st);
  assert.ok(isFunnelSrc(triggerSrc('ai')) && isFunnelSrc(triggerSrc('day1')));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const r = require('../scripts/mkt-funnel.js');
  assert.deepEqual(r.STAGES, [...FUNNEL_STAGES]);
  assert.deepEqual(r.SRCS, [...FUNNEL_SRCS]);
  const js = read('scripts/mkt-funnel.js');
  assert.ok(/NON_FUNNEL_STAGES = new Set\(\[\.\.\.TRIAL_STAGES, \.\.\.TRIAL_OFF_STAGES, \.\.\.TRIAL_PUSH_STAGES,/.test(js));
  assert.ok(/NON_FUNNEL_SRCS = new Set\(\[\.\.\.TRIAL_PUSH_SRCS,/.test(js));
  const sheet = read('src/components/app/TrialPushOptInSheet.tsx');
  assert.ok(/trackFunnel\('trial_push_accept', \{ src \}\)/.test(sheet) && /trackFunnel\('trial_push_dismiss', \{ src \}\)/.test(sheet));
  assert.ok(/trackFunnel\('trial_push_shown', \{ src \}\)/.test(read('src/components/app/TrialPushOptInGate.tsx')));
});
(async () => {
  for (const [name, fn] of tests) { await fn(); n++; console.log(`  ✓ ${name}`); }
  console.log(`\n✅ trialPushOptIn: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
