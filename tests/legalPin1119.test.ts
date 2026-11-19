/**
 * 첫 실행 법적 고지 — 진짜 동의 체크 줄이 화면 밖이면 [계속] 바로 위에 같은 체크 줄을 고정해 그린다 (2026-11-19, src/lib/app/legalNudge.ts)
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/legalPin1119.test.ts
 *
 * 배경: 11/18 안드 법적 고지 노출 12 · 회색 [계속] 누름 4 · 마침 4 → 8명은 아무것도 안 누르고 떠났다.
 *   작은 화면(360×640급·큰 글꼴)에서 체크 줄이 붙박이 회색 버튼 뒤(화면 밖)라 «꺼진 버튼»만 보였다. 11/17 넛지는 회색 버튼을 누른 사람만 돕는다.
 * 지키는 것
 *  ① 가림 판정: 아랫변이 «버튼 줄 위 보이는 칸» 아래면 가림(위로 굴려 지나간 것은 가림 아님) · 잴 수 없으면 null(아무것도 안 그림)
 *  ② 고정 상태: 법적 고지에서 체크 줄이 안 보일 때만 켬 · 한 번 켜면 이 단계 동안 유지(깜빡임·점프 고리 없음) · 단계를 떠나면 끔
 *  ③ 화면(소스 대조): 같은 글(copy.ack) · 같은 accepted 상태 · 라벨이 체크를 감쌈(라벨 전체가 눌림) · 진짜 체크 줄 마크업 그대로
 *     · 막힘 판정·회색 버튼·설정 대기 중 동의 해제 재확인(11/17) 그대로 · 375 기본 화면에서는 고정 줄이 그려지지 않는 조건
 *  ④ 넛지: 고정 줄이 떠 있으면 굴리지 않고 그 줄을 깜빡임 · 아니면 11/17 동작 그대로
 *  ⑤ 계측: onb_pin/onb_legal 닫힌 목록 · 판독기 목록 일치 · 실행당 한 번
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { legalAckCoveredBelow, legalAckFullyVisible, legalNudgeScrollTop, legalPinNext, measureLegalAckCovered, nudgeLegalAck } from '../src/lib/app/legalNudge';
import { FUNNEL_SRCS, FUNNEL_STAGES, isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';
import { claimOnbShow } from '../src/lib/app/onboardingConfig';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const rectEl = (top: number, height: number, extra: Record<string, unknown> = {}) => ({
  getBoundingClientRect: () => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0 }),
  ...extra,
});

console.log('법적 고지 고정 체크 줄(11/19)');

// ── ① ── (숫자는 실측 상자: 375×812 ko · 360×640 en · 360×568 ko, 버튼 줄 높이 80)
t('보임 판정: 375×812 기본(ko·en)·360×640 ko 는 보임 → 고정 줄 없음', () => {
  assert.equal(legalAckFullyVisible({ top: 76.91, height: 658.17 }, { top: 517.3, height: 60.78 }, 80), true);   // 375 ko
  assert.equal(legalAckFullyVisible({ top: 20.53, height: 770.94 }, { top: 556.3, height: 78.17 }, 80), true);   // 375 en
  assert.equal(legalAckFullyVisible({ top: 16, height: 607 }, { top: 451.61, height: 60.78 }, 80), true);        // 360×640 ko
});
t('보임 판정: 360×640 en·360×568 ko 는 체크 줄이 버튼 줄 뒤 → 안 보임', () => {
  assert.equal(legalAckFullyVisible({ top: 16, height: 607 }, { top: 546.98, height: 78.17 }, 80), false);
  assert.equal(legalAckFullyVisible({ top: 16, height: 535 }, { top: 451.61, height: 60.78 }, 80), false);
});
t('보임 판정: 위로 잘려도 안 보임 · 경계에 딱 맞으면 보임 · 덮개 음수는 0', () => {
  assert.equal(legalAckFullyVisible({ top: 100, height: 500 }, { top: 90, height: 40 }, 80), false);
  assert.equal(legalAckFullyVisible({ top: 100, height: 500 }, { top: 480, height: 40 }, 80), true);   // 520 = 600-80
  assert.equal(legalAckFullyVisible({ top: 100, height: 500 }, { top: 481, height: 40 }, 80), false);
  assert.equal(legalAckFullyVisible({ top: 100, height: 500 }, { top: 560, height: 40 }, -30), true);
});
t('굴림 위치 계산은 같은 판정을 쓴다(11/17 동작 그대로: 보이면 null)', () => {
  assert.equal(legalNudgeScrollTop(0, 300, { top: 22, height: 700 }, { top: 300, height: 70 }, 80), null);
  assert.equal(legalNudgeScrollTop(0, 600, { top: 22, height: 700 }, { top: 760, height: 70 }, 80), 463);
});
t('가림 판정(고정 줄용): 버튼 줄 뒤·아래로 가려졌을 때만 — 실측 상자 375(ko·en)·360×640 ko 는 아님, 360×640 en·360×568 ko 는 가림', () => {
  assert.equal(legalAckCoveredBelow({ top: 76.91, height: 658.17 }, { top: 517.3, height: 60.78 }, 80), false);
  assert.equal(legalAckCoveredBelow({ top: 20.53, height: 770.94 }, { top: 556.3, height: 78.17 }, 80), false);
  assert.equal(legalAckCoveredBelow({ top: 16, height: 607 }, { top: 451.61, height: 60.78 }, 80), false);
  assert.equal(legalAckCoveredBelow({ top: 16, height: 607 }, { top: 546.98, height: 78.17 }, 80), true);
  assert.equal(legalAckCoveredBelow({ top: 16, height: 535 }, { top: 451.61, height: 60.78 }, 80), true);
  // 위로 굴려 지나가 윗변이 패널 위로 잘린 경우는 가림이 아니다(관문 1차 지적) · 경계에 딱 맞으면 가림 아님
  assert.equal(legalAckCoveredBelow({ top: 100, height: 500 }, { top: 60, height: 70 }, 80), false);
  assert.equal(legalAckCoveredBelow({ top: 100, height: 500 }, { top: -300, height: 70 }, 80), false);
  assert.equal(legalAckCoveredBelow({ top: 100, height: 500 }, { top: 480, height: 40 }, 80), false);
  assert.equal(legalAckCoveredBelow({ top: 100, height: 500 }, { top: 481, height: 40 }, 80), true);
});
t('화면 요소로 재기: 요소가 없거나 크기 0·예외면 null', () => {
  assert.equal(measureLegalAckCovered(null, null, null), null);
  assert.equal(measureLegalAckCovered(rectEl(16, 607) as never, rectEl(546.98, 78.17) as never, null), null);
  assert.equal(measureLegalAckCovered(rectEl(16, 0) as never, rectEl(546.98, 78.17) as never, rectEl(543, 80) as never), null);
  assert.equal(measureLegalAckCovered(rectEl(16, 607) as never, rectEl(0, 0) as never, rectEl(543, 80) as never), null);
  assert.equal(measureLegalAckCovered({ getBoundingClientRect: () => { throw new Error('x'); } } as never, rectEl(1, 1) as never, rectEl(1, 1) as never), null);
  assert.equal(measureLegalAckCovered(rectEl(16, 607) as never, rectEl(546.98, 78.17) as never, rectEl(543, 80) as never), true);
  assert.equal(measureLegalAckCovered(rectEl(16, 607) as never, rectEl(451.61, 60.78) as never, rectEl(543, 80) as never), false);
  assert.equal(measureLegalAckCovered(rectEl(16, 607) as never, rectEl(-200, 60.78) as never, rectEl(543, 80) as never), false);
});

// ── ② ──
t('고정 상태: 법적 고지 + 가림일 때만 켬 · 모르면 끈 채 · 법적 고지가 아니면 늘 끔', () => {
  assert.equal(legalPinNext(false, true, true), true);
  assert.equal(legalPinNext(false, true, false), false);
  assert.equal(legalPinNext(false, true, null), false);
  assert.equal(legalPinNext(true, false, true), false);
  assert.equal(legalPinNext(false, false, true), false);
});
t('고정 상태: 한 번 켜면 이 단계 동안 유지 — 굴려서 진짜 줄이 보여도·체크해도 그대로(깜빡임·점프 고리 없음)', () => {
  let s = legalPinNext(false, true, true);
  for (const cov of [false, true, false, null, false]) s = legalPinNext(s, true, cov);
  assert.equal(s, true);
  assert.equal(legalPinNext(s, false, false), false);   // 다음 단계로 가면 내린다
});

// ── ③ ──
const onbSrc = read('src/components/app/AppFirstRunOnboarding.tsx');
const css = read('src/components/app/AppFirstRunOnboarding.module.css');
t('고정 줄 마크업: 같은 글·같은 accepted·라벨이 체크를 감쌈 · 법적 고지 + pinAck 일 때만 · 버튼 줄 안 [계속] 위', () => {
  const pin = /\{legal && pinAck && \(\s*<label className=\{`\$\{styles\.ack\} \$\{styles\.ackPin\}`\} ref=\{pinRef\} data-legal-pin="">\s*<input\s+type="checkbox"\s+checked=\{accepted\}\s+onChange=\{event => setAccepted\(event\.currentTarget\.checked\)\}\s*\/>\s*<span>\{copy\.ack\}<\/span>\s*<\/label>\s*\)\}/;
  assert.ok(pin.test(onbSrc), '고정 줄 마크업');
  const bar = onbSrc.indexOf('<div ref={actionsRef}');
  const pinAt = onbSrc.indexOf('{legal && pinAck && (');
  const btnAt = onbSrc.indexOf('className={styles.primaryButton}');
  assert.ok(bar > 0 && bar < pinAt && pinAt < btnAt, '버튼 줄 안 · [계속] 앞');
  assert.equal((onbSrc.match(/checked=\{accepted\}/g) || []).length, 2, '체크 상자 둘 다 같은 accepted');
  assert.equal((onbSrc.match(/onChange=\{event => setAccepted\(event\.currentTarget\.checked\)\}/g) || []).length, 2);
  assert.equal((onbSrc.match(/<span>\{copy\.ack\}<\/span>/g) || []).length, 2, '같은 글');
});
t('진짜 체크 줄·막힘·회색 버튼·설정 대기 중 동의 해제 재확인(11/17) 그대로', () => {
  assert.ok(/<label className=\{styles\.ack\} ref=\{ackRef\}>\s*<input\s+type="checkbox"\s+checked=\{accepted\}\s+onChange=\{event => setAccepted\(event\.currentTarget\.checked\)\}\s*\/>\s*<span>\{copy\.ack\}<\/span>\s*<\/label>/.test(onbSrc));
  assert.ok(/const blocked = legalContinueBlocked\(legal, accepted\);/.test(onbSrc));
  assert.ok(/aria-disabled=\{blocked \|\| undefined\}/.test(onbSrc));
  assert.ok(/disabled=\{legal && accepted && advancing\}/.test(onbSrc));
  assert.ok(/onClick=\{\(\) => \(blocked \? onBlockedContinue\(\) : legal \? onLegalNext\(\) : finish\(\)\)\}/.test(onbSrc));
  assert.ok(/if \(!acceptedRef\.current\) return;/.test(onbSrc));
  assert.ok(/\.primaryButton:disabled,\s*\.primaryButton\[aria-disabled='true'\] \{/.test(css));
  // 고정 줄이 동의를 대신 켜는 코드가 없다(사용자가 직접 체크해야 한다)
  assert.ok(!/setAccepted\(true\)/.test(onbSrc));
});
t('판정 조건: 법적 고지가 그려진 동안만 · 그리기 전(useLayoutEffect) · 켜진 뒤엔 다시 재지 않음 · 못 재면 그리지 않음', () => {
  assert.ok(/const legalOn = mounted && visible && !isDocumentRoute && !localePending && step === 'legal';/.test(onbSrc));
  assert.ok(/useLayoutEffect\(\(\) => \{\s*if \(!legalOn\) \{ setPinAck\(false\); return; \}\s*if \(pinAck\) return;/.test(onbSrc));
  assert.ok(/legalPinNext\(prev, true, measureLegalAckCovered\(panelRef\.current, ackRef\.current, actionsRef\.current\)\)/.test(onbSrc));
  assert.ok(/\}, \[legalOn, pinAck\]\);/.test(onbSrc));
  // 고정 줄 CSS 는 새 규칙(.ackPin)에만 — 기존 .ack·.actions·.actionsSticky·.actionsSingle 규칙은 그대로
  assert.ok(/\.ackPin \{\s*padding: 10px 12px;/.test(css));
  assert.ok(/\.ack \{\s*display: flex;\s*align-items: center;\s*gap: 12px;\s*padding: 12px 14px;/.test(css));
  assert.ok(/\.actionsSticky \{\s*position: sticky;\s*bottom: 0;\s*z-index: 2;\s*margin-top: -14px;\s*padding-top: 14px;/.test(css));
  assert.ok(/\.actionsSingle \{\s*grid-template-columns: 1fr;\s*\}/.test(css));
});
t('글 불변: ack 문구 3개 언어 그대로', () => {
  for (const s of ["ack: 'SIGNUM HQ 앱 약관과 금융 고지를 읽고 동의합니다.'",
    "ack: 'I confirm that I have read and agree to the SIGNUM HQ app terms and financial disclaimer.'",
    "ack: 'SIGNUM HQアプリ利用規約および金融データに関する注意を読み、同意します。'",
    "continue: '계속'", "continue: 'Continue'", "continue: '続ける'"]) assert.ok(onbSrc.includes(s), s);
});

// ── ④ ──
t('넛지: 고정 줄이 떠 있으면 굴리지 않고 그 줄만 깜빡·포커스 · 아니면 11/17 호출 그대로', () => {
  assert.ok(/if \(pinAck && pinRef\.current\) nudgeLegalAck\(pinRef\.current, null, null, \{ scroll: false \}\);\s*else nudgeLegalAck\(ackRef\.current, panelRef\.current, actionsRef\.current\);/.test(onbSrc));
  (globalThis as unknown as { window?: unknown }).window = { matchMedia: () => ({ matches: false }) };
  const calls: string[] = [];
  const input = { focus: (o: unknown) => calls.push('focus:' + JSON.stringify(o)) };
  const pinEl = {
    getBoundingClientRect: () => ({ top: 472, height: 74 }),
    scrollIntoView: () => calls.push('scrollIntoView'),
    animate: () => { calls.push('animate'); return {}; },
    querySelector: () => input,
  };
  const panel = { scrollTo: () => calls.push('scrollTo'), getBoundingClientRect: () => ({ top: 16, height: 607 }), scrollTop: 0, scrollHeight: 900, clientHeight: 607 };
  nudgeLegalAck(pinEl as never, panel as never, null, { scroll: false });
  nudgeLegalAck(pinEl as never, null, null, { scroll: false });
  assert.deepEqual(calls, ['animate', 'focus:{"preventScroll":true}', 'animate', 'focus:{"preventScroll":true}']);
});

// ── ⑤ ──
t('계측: onb_pin/onb_legal 닫힌 목록 · 실행(세션)당 한 번 · 판독기 목록 일치', () => {
  assert.ok(isFunnelStage('onb_pin') && isFunnelSrc('onb_legal'));
  assert.ok(/if \(!pinAck \|\| pinCounted\.current\) return;\s*pinCounted\.current = true;\s*if \(claimOnbShow\('onb_pin', sessionStore\(\)\)\) trackFunnel\('onb_pin', \{ src: 'onb_legal' \}\);/.test(onbSrc));
  const mem = new Map<string, string>();
  const ss = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  assert.equal(claimOnbShow('onb_pin', ss), true);
  assert.equal(claimOnbShow('onb_pin', ss), false);
  assert.equal(claimOnbShow('onb_nudge', ss), true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const r = require('../scripts/mkt-funnel.js');
  assert.ok(r.ONB_STAGES.includes('onb_pin'));
  assert.deepEqual(r.STAGES, [...FUNNEL_STAGES]);
  assert.deepEqual(r.SRCS, [...FUNNEL_SRCS]);
  assert.ok(/\['onb_pin', \['onb_legal'\]\]/.test(read('scripts/mkt-funnel.js')));
});

console.log(`\n✅ legalPin1119: ${n}건 통과`);
