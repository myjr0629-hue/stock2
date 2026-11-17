/**
 * 첫 실행 법적 고지 — 동의 전 회색 [계속]을 누르면 동의 체크 줄로 굴리고 깜빡인다 (2026-11-17, src/lib/app/legalNudge.ts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/legalNudge.test.ts
 *
 * 배경: 안드 360dp + 글꼴 1.3 에서 체크 줄이 화면 밖 → 회색 [계속]만 보이고 진짜 disabled 라 눌러도 무반응 → 안드 신규 21명 중 1명만 통과(11/15~16).
 * 지키는 것
 *  ① 막힘 판정: 법적 고지 + 동의 전에만
 *  ② 굴림 위치: 이미 보이면 굴리지 않음 · 아래/위에 있으면 «붙박이 버튼 줄 위 보이는 칸» 가운데 · 범위 안으로 자름
 *  ③ 실행: 부드럽게 굴림(동작 줄이기 설정이면 즉시) · 약 1초 강조 · 체크 상자 포커스(굴림 없이) · 어떤 실패도 삼킨다
 *  ④ 화면(소스 대조): 동의 전 버튼은 진짜 disabled 가 아니고 aria-disabled · 회색 모양은 같은 규칙 · 글 불변 · 라벨이 체크를 감싼다(라벨 탭 = 토글)
 *  ⑤ 옛 웹뷰(dvh 모름) 대비 vh 상한은 @supports not 블록에만 — 최신 브라우저 배치 불변
 *  ⑥ 계측: onb_nudge/onb_legal 닫힌 목록 · 판독기 목록 일치 · 실행당 한 번
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LEGAL_NUDGE_FRAMES, LEGAL_NUDGE_MS, legalContinueBlocked, legalNudgeScrollTop, nudgeLegalAck } from '../src/lib/app/legalNudge';
import { FUNNEL_SRCS, FUNNEL_STAGES, isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';
import { claimOnbShow } from '../src/lib/app/onboardingConfig';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

type Rect = { top: number; height: number };
function fakeEl(rect: Rect, extra: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[]> = { scrollTo: [], animate: [], focus: [], scrollIntoView: [] };
  const el: Record<string, unknown> = {
    calls,
    getBoundingClientRect: () => ({ top: rect.top, height: rect.height, bottom: rect.top + rect.height, left: 0, right: 0, width: 0 }),
    scrollTop: 0, scrollHeight: 0, clientHeight: 0,
    scrollTo: (o: unknown) => { calls.scrollTo.push(o); },
    scrollIntoView: (o: unknown) => { calls.scrollIntoView.push(o); },
    animate: (f: unknown, o: unknown) => { calls.animate.push([f, o]); return {}; },
    querySelector: () => null,
    ...extra,
  };
  return el;
}
function setReducedMotion(on: boolean | 'throw' | 'none') {
  const g = globalThis as unknown as { window?: unknown };
  if (on === 'none') { g.window = {}; return; }
  g.window = {
    matchMedia: (q: string) => {
      if (on === 'throw') throw new Error('no mm');
      return { matches: on && q.includes('reduce') };
    },
  };
}

console.log('법적 고지 회색 [계속] → 체크 줄로');

// ── ① ──
t('막힘 = 법적 고지 + 동의 전만', () => {
  assert.equal(legalContinueBlocked(true, false), true);
  assert.equal(legalContinueBlocked(true, true), false);
  assert.equal(legalContinueBlocked(false, false), false);
  assert.equal(legalContinueBlocked(false, true), false);
});

// ── ② ──
t('체크 줄이 이미 보이는 칸 안이면 굴리지 않는다(기본 화면 · 대부분의 기기)', () => {
  // 패널 top 22 · 높이 700 · 버튼 줄 80 → 보이는 칸 30..634
  assert.equal(legalNudgeScrollTop(0, 300, { top: 22, height: 700 }, { top: 400, height: 70 }, 80), null);
});
t('360dp+큰 글꼴: 체크 줄이 버튼 줄 아래(화면 밖)에 있으면 버튼 위 보이는 칸 가운데로', () => {
  // 보이는 칸 30..634(높이 604) · 대상 top 760 h 70 → want = 0 + (760-30) - (604-70)/2 = 730 - 267 = 463
  assert.equal(legalNudgeScrollTop(0, 600, { top: 22, height: 700 }, { top: 760, height: 70 }, 80), 463);
  // 버튼 줄에 «일부만» 가려져도 굴린다(보이는 칸 밖으로 걸침)
  assert.notEqual(legalNudgeScrollTop(0, 600, { top: 22, height: 700 }, { top: 580, height: 70 }, 80), null);
});
t('굴림 범위 밖이면 끝(maxScrollTop)으로 자른다 · 음수 없음', () => {
  assert.equal(legalNudgeScrollTop(0, 120, { top: 22, height: 700 }, { top: 760, height: 70 }, 80), 120);
  assert.equal(legalNudgeScrollTop(50, 600, { top: 22, height: 700 }, { top: -400, height: 70 }, 80), 0);
});
t('위로 지나가 있으면 위로 굴린다 · 이미 그 위치면 null', () => {
  const top = legalNudgeScrollTop(500, 600, { top: 22, height: 700 }, { top: -100, height: 70 }, 80);
  assert.ok(top != null && top < 500, String(top));
  assert.equal(legalNudgeScrollTop(463, 463, { top: 22, height: 700 }, { top: 760, height: 70 }, 80), null);
});

// ── ③ ──
t('실행: 패널 안에서 부드럽게 굴림 · 1초 강조 · 체크 상자 포커스(preventScroll)', () => {
  setReducedMotion(false);
  const focus: unknown[] = [];
  const input = { focus: (o: unknown) => focus.push(o) };
  const target = fakeEl({ top: 760, height: 70 }, { querySelector: (s: string) => (s === 'input' ? input : null) });
  const panel = fakeEl({ top: 22, height: 700 }, { scrollTop: 0, scrollHeight: 1300, clientHeight: 700 });
  const bar = fakeEl({ top: 642, height: 80 });
  nudgeLegalAck(target as never, panel as never, bar as never);
  const pc = panel.calls as Record<string, unknown[]>;
  const tc = target.calls as Record<string, unknown[]>;
  assert.deepEqual(pc.scrollTo, [{ top: 463, behavior: 'smooth' }]);
  assert.equal(tc.animate.length, 1);
  const [frames, opts] = tc.animate[0] as [unknown, { duration: number }];
  assert.equal(frames, LEGAL_NUDGE_FRAMES);
  assert.equal(opts.duration, LEGAL_NUDGE_MS);
  assert.ok(LEGAL_NUDGE_MS >= 800 && LEGAL_NUDGE_MS <= 1200, '약 1초');
  assert.deepEqual(focus, [{ preventScroll: true }]);
});
t('이미 보이면 굴리지 않고 강조만', () => {
  setReducedMotion(false);
  const target = fakeEl({ top: 400, height: 70 });
  const panel = fakeEl({ top: 22, height: 700 }, { scrollHeight: 1000, clientHeight: 700 });
  nudgeLegalAck(target as never, panel as never, fakeEl({ top: 642, height: 80 }) as never);
  assert.equal((panel.calls as Record<string, unknown[]>).scrollTo.length, 0);
  assert.equal((target.calls as Record<string, unknown[]>).animate.length, 1);
});
t('동작 줄이기 설정이면 즉시 굴림(auto)', () => {
  setReducedMotion(true);
  const target = fakeEl({ top: 760, height: 70 });
  const panel = fakeEl({ top: 22, height: 700 }, { scrollHeight: 1300, clientHeight: 700 });
  nudgeLegalAck(target as never, panel as never, null);
  assert.equal(((panel.calls as Record<string, unknown[]>).scrollTo[0] as { behavior: string }).behavior, 'auto');
});
t('패널이 없으면 scrollIntoView(가운데) · scrollTo 없는 옛 웹뷰는 scrollTop 직접', () => {
  setReducedMotion(false);
  const target = fakeEl({ top: 760, height: 70 });
  nudgeLegalAck(target as never, null);
  assert.deepEqual((target.calls as Record<string, unknown[]>).scrollIntoView, [{ block: 'center', behavior: 'smooth' }]);
  const panel = fakeEl({ top: 22, height: 700 }, { scrollHeight: 1300, clientHeight: 700, scrollTo: undefined });
  nudgeLegalAck(fakeEl({ top: 760, height: 70 }) as never, panel as never, fakeEl({ top: 642, height: 80 }) as never);
  assert.equal(panel.scrollTop, 463);
});
t('어떤 실패도 화면을 깨뜨리지 않는다(대상 없음 · 측정·굴림·강조·포커스·matchMedia 예외 · window.matchMedia 없음)', () => {
  setReducedMotion('throw');
  nudgeLegalAck(null, null);
  const boom = () => { throw new Error('x'); };
  const target = fakeEl({ top: 760, height: 70 }, { animate: boom, querySelector: () => ({ focus: boom }) });
  const panel = fakeEl({ top: 22, height: 700 }, { getBoundingClientRect: boom });
  assert.doesNotThrow(() => nudgeLegalAck(target as never, panel as never, null));
  setReducedMotion('none');
  const target2 = fakeEl({ top: 760, height: 70 }, { animate: undefined });
  assert.doesNotThrow(() => nudgeLegalAck(target2 as never, fakeEl({ top: 22, height: 700 }, { scrollHeight: 1300, clientHeight: 700 }) as never, null));
});

// ── ④ 화면(소스 대조) ──
const onbSrc = read('src/components/app/AppFirstRunOnboarding.tsx');
const css = read('src/components/app/AppFirstRunOnboarding.module.css');
t('동의 전 [계속]은 진짜 disabled 가 아니다(눌림을 받아야 데려갈 수 있다) — aria-disabled · 진행 중(advancing)만 disabled', () => {
  assert.ok(!/disabled=\{legal && \(!accepted \|\| advancing\)\}/.test(onbSrc), '옛 «동의 전 disabled» 가 남아 있지 않다');
  assert.ok(/disabled=\{legal && accepted && advancing\}/.test(onbSrc));
  assert.ok(/aria-disabled=\{blocked \|\| undefined\}/.test(onbSrc));
  assert.ok(/const blocked = legalContinueBlocked\(legal, accepted\);/.test(onbSrc));
  assert.ok(/onClick=\{\(\) => \(blocked \? onBlockedContinue\(\) : legal \? onLegalNext\(\) : finish\(\)\)\}/.test(onbSrc), '막힘이면 진행하지 않고 데려가기만');
  assert.ok(/nudgeLegalAck\(ackRef\.current, panelRef\.current, actionsRef\.current\)/.test(onbSrc));
  assert.ok(/<section className=\{styles\.panel\} ref=\{panelRef\}>/.test(onbSrc), '굴림 대상 = 스크롤 패널');
  assert.ok(/<div ref=\{actionsRef\} className=\{`\$\{styles\.actions\} \$\{styles\.actionsSticky\}/.test(onbSrc), '붙박이 버튼 줄 높이를 뺀다');
});
t('설정 읽기를 기다리는 동안 동의를 풀면 진행하지 않는다(기다린 뒤 지금 값으로 재확인 · 마침 계측도 그 뒤)', () => {
  assert.ok(/acceptedRef\.current = accepted;/.test(onbSrc));
  assert.ok(/const m = cfgMode \?\? \(await loadOnbMode\(\)\);\s*setAdvancing\(false\);[\s\S]{0,160}if \(!acceptedRef\.current\) return;[\s\S]{0,120}trackFunnel\('onb_done', \{ src: 'onb_legal' \}\);[\s\S]{0,40}setStep\(stepAfterLegal\(m\)\);/.test(onbSrc));
});
t('회색 모양은 disabled 와 같은 규칙(배치·색 불변)', () => {
  assert.ok(/\.primaryButton:disabled,\s*\.primaryButton\[aria-disabled='true'\]\s*\{\s*color: rgba\(148, 163, 184, 0\.82\);\s*background: rgba\(30, 41, 59, 0\.9\);\s*box-shadow: none;/.test(css));
});
t('라벨이 체크 상자를 감싼다(라벨 어디를 눌러도 토글 = 큰 탭 영역) · 강조 대상 = 그 라벨', () => {
  assert.ok(/<label className=\{styles\.ack\} ref=\{ackRef\}>\s*<input\s+type="checkbox"\s+checked=\{accepted\}\s+onChange=\{event => setAccepted\(event\.currentTarget\.checked\)\}\s*\/>\s*<span>\{copy\.ack\}<\/span>\s*<\/label>/.test(onbSrc));
  assert.ok(/\.ack \{[^}]*padding: 12px 14px;[^}]*cursor: pointer;/.test(css));
});
t('글 불변: 법적 고지·버튼 글자 그대로', () => {
  for (const s of ["continue: '계속'", "continue: 'Continue'", "continue: '続ける'",
    "ack: 'I confirm that I have read and agree to the SIGNUM HQ app terms and financial disclaimer.'",
    "ack: 'SIGNUM HQ 앱 약관과 금융 고지를 읽고 동의합니다.'", "legalStep: '1 / 2 · Required notice'"]) assert.ok(onbSrc.includes(s), s);
});
// ── ⑤ ──
t('옛 웹뷰 vh 상한은 @supports not (height: 100dvh) 안에만 — 기본 규칙의 dvh 는 그대로', () => {
  assert.ok(/@supports not \(height: 100dvh\) \{\s*\.shell \{\s*min-height: 100vh;\s*\}\s*\.panel \{\s*max-height: calc\(100vh - 32px\);\s*\}\s*\}/.test(css));
  assert.ok(/\.shell \{\s*width: min\(100%, 430px\);\s*min-height: 100dvh;/.test(css));
  assert.ok(/\.panel \{\s*width: 100%;\s*max-height: calc\(100dvh - 32px\);\s*overflow-y: auto;/.test(css));
});
// ── ⑥ ──
t('계측: onb_nudge/onb_legal 은 닫힌 목록 · 실행(세션)당 한 번(재마운트 포함) · 판독기 목록 일치', () => {
  assert.ok(isFunnelStage('onb_nudge') && isFunnelSrc('onb_legal'));
  assert.ok(/if \(!nudgeCounted\.current\) \{ nudgeCounted\.current = true; if \(claimOnbShow\('onb_nudge', sessionStore\(\)\)\) trackFunnel\('onb_nudge', \{ src: 'onb_legal' \}\); \}/.test(onbSrc));
  // 언어 자가 이동 재마운트에도 세션당 한 번 — 같은 세션 저장소면 두 번째 claim 은 false, 단계 노출(onb_legal) 가드와 서로 간섭 없음
  const mem = new Map<string, string>();
  const ss = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  assert.equal(claimOnbShow('onb_legal', ss), true);
  assert.equal(claimOnbShow('onb_nudge', ss), true);
  assert.equal(claimOnbShow('onb_nudge', ss), false);
  assert.equal(claimOnbShow('onb_legal', ss), false);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const r = require('../scripts/mkt-funnel.js');
  assert.ok(r.ONB_STAGES.includes('onb_nudge'));
  assert.deepEqual(r.STAGES, [...FUNNEL_STAGES]);
  assert.deepEqual(r.SRCS, [...FUNNEL_SRCS]);
});

console.log(`\n✅ legalNudge: ${n}건 통과`);
