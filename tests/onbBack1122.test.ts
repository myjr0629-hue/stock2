/**
 * ★11/22 안드 첫 실행 화면 «뒤로 가기» — 앱을 닫지 않고 화면에 알림, 2초 안 두 번째면 앱 내림 (src/lib/app/onbBack.ts)
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/onbBack1122.test.ts
 *
 * 배경: ET 11/19~22 안드 법적 고지 노출 43 · 만짐 12 · 앱 떠남 15 · 마침 8(19%) vs iOS 12 · 9 · 0 · 11(92%).
 *   NativeAppProvider 의 backButton 이 첫 실행 화면 위에서도 곧바로 App.minimizeApp() — iOS 에 없는 «안드 전용 출구».
 * 지키는 것
 *  ① 판정: 화면 없음 = normal(예전 동작) · 첫 번째 = nudge · 2초 안 두 번째 = exit · 2초 뒤 = 다시 nudge
 *  ② NativeAppProvider: 판정 → 이벤트/앱 내림 · 화면이 없으면 예전 분기(history.back / minimizeApp) 그대로
 *  ③ 첫 실행 화면: 이벤트를 받으면 법적 고지에서 같은 강조(nudgeLegalAck) · 글·라벨·CSS 무변경 · 계측 닫힌 목록·판독기 일치
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ONB_BACK_EVENT, ONB_BACK_EXIT_MS, ONB_OPEN_CLASS, dispatchOnbBack, onbBackAction, onboardingOpenNow } from '../src/lib/app/onbBack';
import { isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

t('① 판정', () => {
  assert.equal(onbBackAction(false, 10_000, 0), 'normal');
  assert.equal(onbBackAction(false, 10_000, 9_500), 'normal');
  assert.equal(onbBackAction(true, 10_000, 0), 'nudge');
  assert.equal(onbBackAction(true, 10_000, 9_000), 'exit');
  assert.equal(onbBackAction(true, 10_000, 10_000 - ONB_BACK_EXIT_MS), 'exit');
  assert.equal(onbBackAction(true, 10_000, 10_000 - ONB_BACK_EXIT_MS - 1), 'nudge');
  assert.equal(onbBackAction(true, 10_000, 11_000), 'nudge', '시계가 뒤로 가면 닫지 않는다');
  assert.equal(ONB_BACK_EXIT_MS, 2000);
});

t('① 문서 없음 = 화면 없음(예전 동작)', () => {
  assert.equal(onboardingOpenNow(), false);
});

t('① dispatchOnbBack: 받는 곳이 없으면 false · preventDefault 하면 true', () => {
  const g = globalThis as unknown as { document?: unknown; CustomEvent?: unknown };
  const listeners: Array<(e: Event) => void> = [];
  class CE { type: string; cancelable: boolean; defaultPrevented = false; constructor(t: string, o?: { cancelable?: boolean }) { this.type = t; this.cancelable = !!o?.cancelable; } preventDefault() { if (this.cancelable) this.defaultPrevented = true; } }
  g.CustomEvent = CE;
  g.document = { dispatchEvent: (e: CE) => { for (const l of listeners) l(e as unknown as Event); return !e.defaultPrevented; } };
  try {
    assert.equal(dispatchOnbBack(), false, '받는 곳 없음 → 예전 동작');
    listeners.push(() => { /* 받기만 하고 처리 안 함 */ });
    assert.equal(dispatchOnbBack(), false);
    listeners.push((e) => e.preventDefault());
    assert.equal(dispatchOnbBack(), true);
  } finally { delete g.document; delete g.CustomEvent; }
  assert.equal(dispatchOnbBack(), false, '문서 없음');
});

t('② NativeAppProvider 분기', () => {
  const src = read('src/components/native/NativeAppProvider.tsx');
  assert.ok(src.includes("import { dispatchOnbBack, onbBackAction, onboardingOpenNow } from '@/lib/app/onbBack';"));
  const i = src.indexOf("App.addListener('backButton'");
  assert.ok(i > 0);
  const body = src.slice(i, i + 900);
  assert.ok(/const act = onbBackAction\(onboardingOpenNow\(\), now, onbBackAt\);/.test(body));
  assert.ok(/if \(act === 'nudge' && dispatchOnbBack\(\)\) \{\s*onbBackAt = now;\s*return;\s*\}/.test(body), '화면이 받아 처리했을 때만 막는다');
  assert.ok(/if \(act === 'exit'\) \{\s*onbBackAt = 0;\s*App\.minimizeApp\(\);\s*return;\s*\}/.test(body));
  assert.ok(/if \(canGoBack\) \{\s*window\.history\.back\(\);\s*\} else \{\s*App\.minimizeApp\(\);\s*\}/.test(body), '화면이 없으면 예전 분기 그대로');
});

t('③ 첫 실행 화면 처리·계측', () => {
  const src = read('src/components/app/AppFirstRunOnboarding.tsx');
  assert.ok(src.includes("import { ONB_BACK_EVENT } from '@/lib/app/onbBack';"));
  assert.ok(src.includes('document.addEventListener(ONB_BACK_EVENT, onBack);'));
  assert.ok(src.includes('const onBack = (e: Event) => { e.preventDefault();'), '받았다고 알린다(preventDefault)');
  assert.ok(src.includes('document.removeEventListener(ONB_BACK_EVENT, onBack);'));
  assert.ok(/if \(step === 'legal' && !localePending\) \{\s*if \(pinAck && pinRef\.current\) nudgeLegalAck\(pinRef\.current, null, null, \{ scroll: false \}\);\s*else nudgeLegalAck\(ackRef\.current, panelRef\.current, actionsRef\.current\);\s*\}/.test(src));
  assert.ok(src.includes("if (claimOnbShow('onb_back', sessionStore())) trackFunnel('onb_back', { src });"));
  // <html> 표식 이름이 같다
  assert.ok(src.includes("classList.toggle('app-onboarding-open', visible)"));
  assert.equal(ONB_OPEN_CLASS, 'app-onboarding-open');
  assert.equal(ONB_BACK_EVENT, 'app:onboarding-back');
  assert.ok(isFunnelStage('onb_back'));
  for (const s of ['onb_legal', 'onb_value', 'onb_notif']) assert.ok(isFunnelSrc(s), s);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const js = read('scripts/mkt-funnel.js');
  assert.ok(js.includes("'onb_hide', 'onb_back', 'trial_notice_show'"), 'STAGES');
  assert.ok(js.includes("'onb_check', 'onb_hide', 'onb_back'];"), 'ONB_STAGES');
  assert.ok(js.includes("['onb_back', ['onb_legal', 'onb_value', 'onb_notif']]"), '판독 키');
  // CSS 무변경
  assert.ok(!/onb_back|onbBack/.test(read('src/components/app/AppFirstRunOnboarding.module.css')));
});

console.log(`\n${n} passed`);
