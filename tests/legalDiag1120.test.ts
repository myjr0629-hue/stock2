/**
 * 첫 실행 법적 고지 진단 계측 (2026-11-20, src/lib/app/legalDiag.ts)
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/legalDiag1120.test.ts
 *
 * 배경: 11/19 ET 안드 법적 고지 노출 11 → 마침 1, 고정 체크 줄 보임 2 · 회색 [계속] 누름 2 — 대부분 «체크 줄이 보이는데도» 아무것도 안 하고 떠났다.
 *   실기(안드 15 에뮬레이터)에선 체크 → [계속] → 다음 단계 정상. 원인을 가르려면 언어·재실행·만짐·체크·떠남을 세야 한다.
 * 지키는 것
 *  ① 언어 → 출처(ko·ja 외 전부 en) · 재노출 표식(처음 false·다음 true·저장소 없거나 오류면 false)
 *  ② 닫힌 목록(funnelSchema)·판독기(mkt-funnel) 일치 · 서버가 받는 값
 *  ③ 화면 불변: 진짜/고정 체크 줄 마크업·버튼·CSS 를 건드리지 않음 · 자동 체크 없음 · 기본 동작을 막지 않는 수동 리스너
 *  ④ 실행당 한 번(세션 가드) · 법적 고지 노출/마침 가드 안에서만 언어 몫을 센다
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LEGAL_LOCALE_DONE_GUARD, LEGAL_SEEN_KEY, LEGAL_SHOWN_LOC_KEY, legalDoneLocaleSrc, legalLocaleSrc, legalSeenBefore, rememberLegalShownLocale } from '../src/lib/app/legalDiag';
import { FUNNEL_SRCS, FUNNEL_STAGES, isFunnelSrc, isFunnelStage } from '../src/lib/app/funnelSchema';
import { claimOnbShow } from '../src/lib/app/onboardingConfig';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, m }; };
const onbSrc = read('src/components/app/AppFirstRunOnboarding.tsx');
const cssSrc = read('src/components/app/AppFirstRunOnboarding.module.css');

console.log('법적 고지 진단 계측(11/20)');

// ── ① ──
t('언어 → 출처: ko·ja 그대로, 나머지·빈 값은 en', () => {
  assert.equal(legalLocaleSrc('ko'), 'onb_lko');
  assert.equal(legalLocaleSrc('ja'), 'onb_lja');
  assert.equal(legalLocaleSrc('en'), 'onb_len');
  assert.equal(legalLocaleSrc('de'), 'onb_len');
  assert.equal(legalLocaleSrc(undefined), 'onb_len');
  assert.equal(legalLocaleSrc(null), 'onb_len');
});
t('재노출 표식: 처음 false(표식 남김) → 다음 true · 값은 «1» 하나', () => {
  const s = mem();
  assert.equal(legalSeenBefore(s), false);
  assert.equal(s.m.get(LEGAL_SEEN_KEY), '1');
  assert.equal(legalSeenBefore(s), true);
  assert.equal(legalSeenBefore(s), true);
  assert.equal(s.m.size, 1);
});
t('재노출 표식: 저장소 없음·오류면 false(부풀리지 않음)', () => {
  assert.equal(legalSeenBefore(null), false);
  assert.equal(legalSeenBefore(undefined), false);
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(legalSeenBefore(broken), false);
  const ro = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(legalSeenBefore(ro), false);
});

t('마침 언어 = 노출 때 언어(관문 11200634): en 으로 보이고 ko 로 이동 뒤 마쳐도 en 에 센다 · 기록 없으면 지금 언어', () => {
  const ss = mem();
  assert.equal(legalDoneLocaleSrc(ss, 'ko'), 'onb_lko', '기록 없음 → 지금 언어');
  rememberLegalShownLocale(ss, 'onb_len');
  assert.equal(ss.m.get(LEGAL_SHOWN_LOC_KEY), 'onb_len');
  assert.equal(legalDoneLocaleSrc(ss, 'ko'), 'onb_len');
  ss.m.set(LEGAL_SHOWN_LOC_KEY, 'garbage');
  assert.equal(legalDoneLocaleSrc(ss, 'ja'), 'onb_lja', '이상한 값 → 지금 언어');
  assert.equal(legalDoneLocaleSrc(null, 'ja'), 'onb_lja');
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.doesNotThrow(() => rememberLegalShownLocale(broken, 'onb_lko'));
  assert.equal(legalDoneLocaleSrc(broken, 'en'), 'onb_len');
  assert.doesNotThrow(() => rememberLegalShownLocale(null, 'onb_lko'));
});

// ── ② ──
t('닫힌 목록: 새 단계 3·출처 4 · 기존 값 유지', () => {
  for (const st of ['onb_tap', 'onb_check', 'onb_hide', 'onb_show', 'onb_done', 'onb_nudge', 'onb_pin']) assert.ok(isFunnelStage(st), st);
  for (const s of ['onb_lko', 'onb_len', 'onb_lja', 'onb_lrep', 'onb_legal']) assert.ok(isFunnelSrc(s), s);
  assert.ok(!isFunnelStage(LEGAL_LOCALE_DONE_GUARD) && !isFunnelSrc(LEGAL_LOCALE_DONE_GUARD) && !LEGAL_LOCALE_DONE_GUARD.startsWith('onb_'), '세션 가드 이름일 뿐 단계·출처가 아니다');
  assert.equal(new Set(FUNNEL_STAGES).size, FUNNEL_STAGES.length);
  assert.equal(new Set(FUNNEL_SRCS).size, FUNNEL_SRCS.length);
});
t('판독기(mkt-funnel): 닫힌 목록 일치 · ④ 표 키에 새 조합 · 진단 줄', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const r = require('../scripts/mkt-funnel.js');
  assert.deepEqual(r.STAGES, [...FUNNEL_STAGES]);
  assert.deepEqual(r.SRCS, [...FUNNEL_SRCS]);
  for (const st of ['onb_tap', 'onb_check', 'onb_hide']) assert.ok(r.ONB_STAGES.includes(st), st);
  for (const s of ['onb_lko', 'onb_len', 'onb_lja', 'onb_lrep']) assert.ok(r.ONB_SRCS.includes(s), s);
  const js = read('scripts/mkt-funnel.js');
  assert.ok(/\['onb_show', \['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_lko', 'onb_len', 'onb_lja', 'onb_lrep'\]\]/.test(js));
  assert.ok(/\['onb_done', \['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_lko', 'onb_len', 'onb_lja'\]\]/.test(js));
  for (const st of ['onb_pin', 'onb_tap', 'onb_check', 'onb_hide']) assert.ok(js.includes(`['${st}', ['onb_legal']]`), st);
  assert.ok(js.includes('언어별 노출→마침') && js.includes('마치기 전 행동'));
});

// ── ③ ──
t('화면 불변: 진짜·고정 체크 줄 마크업 그대로(onChange 2곳) · 자동 체크 없음 · 버튼 그대로', () => {
  assert.ok(/<label className=\{styles\.ack\} ref=\{ackRef\}>\s*<input\s+type="checkbox"\s+checked=\{accepted\}\s+onChange=\{event => setAccepted\(event\.currentTarget\.checked\)\}\s*\/>\s*<span>\{copy\.ack\}<\/span>\s*<\/label>/.test(onbSrc));
  assert.equal((onbSrc.match(/onChange=\{event => setAccepted\(event\.currentTarget\.checked\)\}/g) || []).length, 2);
  assert.ok(!/setAccepted\(true\)/.test(onbSrc));
  assert.ok(/aria-disabled=\{blocked \|\| undefined\}/.test(onbSrc));
  assert.ok(!/legalDiag|onb_tap|onb_check|onb_hide/.test(cssSrc), 'CSS 변경 없음');
});
t('수동 리스너: pointerdown 은 capture·passive(기본 동작을 막지 않음) · preventDefault/stopPropagation 없음 · 해제', () => {
  const block = onbSrc.slice(onbSrc.indexOf('★11/20 법적 고지 진단 — 떠 있는 동안'), onbSrc.indexOf('★11/20 동의 체크를 켰다'));
  assert.ok(block.length > 200);
  assert.ok(/addEventListener\('pointerdown', onDown, \{ capture: true, passive: true \}\)/.test(block));
  assert.ok(/addEventListener\('visibilitychange', onVis\)/.test(block));
  assert.ok(/removeEventListener\('pointerdown', onDown, \{ capture: true \}\)/.test(block));
  assert.ok(/removeEventListener\('visibilitychange', onVis\)/.test(block));
  assert.ok(!/preventDefault|stopPropagation/.test(block));
  assert.ok(/if \(!legalOn\) return;/.test(block), '법적 고지가 떠 있을 때만');
  assert.ok(/document\.visibilityState !== 'hidden' \|\| legalDoneCounted\.current \|\| hideCounted\.current/.test(block), '마친 뒤엔 «떠남» 안 셈');
});

// ── ④ ──
t('세션 가드: 만짐·체크·떠남·언어 마침 모두 claimOnbShow 로 실행당 한 번', () => {
  assert.ok(/if \(claimOnbShow\('onb_tap', sessionStore\(\)\)\) trackFunnel\('onb_tap', \{ src: 'onb_legal' \}\);/.test(onbSrc));
  assert.ok(/if \(claimOnbShow\('onb_hide', sessionStore\(\)\)\) trackFunnel\('onb_hide', \{ src: 'onb_legal' \}\);/.test(onbSrc));
  assert.ok(/if \(!legalOn \|\| !accepted \|\| checkCounted\.current\) return;\s*checkCounted\.current = true;\s*if \(claimOnbShow\('onb_check', sessionStore\(\)\)\) trackFunnel\('onb_check', \{ src: 'onb_legal' \}\);/.test(onbSrc));
  assert.ok(/if \(step === 'legal' \|\| !legalDoneCounted\.current\) return;\s*const ss = sessionStore\(\);\s*if \(claimOnbShow\(LEGAL_LOCALE_DONE_GUARD, ss\)\) trackFunnel\('onb_done', \{ src: legalDoneLocaleSrc\(ss, locale\) \}\);/.test(onbSrc));
  const ss = mem();
  assert.equal(claimOnbShow('onb_legal', ss), true);
  for (const k of ['onb_tap', 'onb_check', 'onb_hide', LEGAL_LOCALE_DONE_GUARD]) { assert.equal(claimOnbShow(k, ss), true, k); assert.equal(claimOnbShow(k, ss), false, k); }
  assert.equal(claimOnbShow('onb_legal', ss), false, '기존 노출 가드와 서로 간섭 없음');
});
t('언어 몫·재노출은 onb_show/onb_legal 와 같은 가드 안 · onb_done/onb_legal 은 onLegalNext 그대로', () => {
  assert.ok(/if \(!claimOnbShow\(src, ss\)\) return;\s*trackFunnel\('onb_show', \{ src \}\);\s*\/\/[^\n]*\n\s*if \(src === 'onb_legal'\) \{\s*const ls = legalLocaleSrc\(locale\);\s*rememberLegalShownLocale\(ss, ls\);[^\n]*\n\s*trackFunnel\('onb_show', \{ src: ls \}\);\s*if \(legalSeenBefore\(localStore\(\)\)\) trackFunnel\('onb_show', \{ src: 'onb_lrep' \}\);\s*\}/.test(onbSrc));
  assert.ok(/if \(!legalDoneCounted\.current\) \{ legalDoneCounted\.current = true; trackFunnel\('onb_done', \{ src: 'onb_legal' \}\); \}/.test(onbSrc));
  assert.equal((onbSrc.match(/trackFunnel\('onb_done', \{ src: 'onb_legal' \}\)/g) || []).length, 1);
});

console.log(`\n${n} passed`);
