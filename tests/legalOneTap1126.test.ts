/**
 * 첫 실행 법적 고지 — 안드 앱만 «동의하고 계속» 한 번 누름 (2026-11-26, src/lib/app/legalOneTap.ts · AppFirstRunOnboarding.tsx)
 * 실행: node -r ./scripts/offline-test-typescript.cjs --test tests/legalOneTap1126.test.ts
 *
 * 배경(fx:* 퍼널 ET 11/20~11/26): 안드 노출 66 → 만짐 36 → 체크 19 → 마침 20(30%) · iOS 77 → 72 → 72 → 72(94%).
 *   체크한 안드는 거의 전원 마친다 → 막힘은 체크 상자 단계. 안드 노출 42%(28/66)는 체크 줄이 화면 밖(고정 줄 필요).
 * 지키는 것
 *  ① 켜짐 판정: 안드 «앱»만(Capacitor 네이티브 android) · iOS·웹·안드 브라우저 false · 끄기 스위치 false 면 안드도 false
 *  ② 화면(소스 대조): 안드 한 번 누름 = 체크 상자 없음 · 같은 동의 문장(copy.ack)을 버튼 바로 위(붙박이 줄 안) · 버튼 글만 «동의하고 계속»
 *     · iOS 경로(체크 상자·회색 [계속]·막힘·onLegalNext) 글자 그대로 · 고지 본문·항목·링크·단계 표시 그대로
 *  ③ 동의·계측: 누르는 순간 acceptedRef=true → onLegalNext(설정 대기·마침 계측 그대로) · onb_check 실행당 한 번(같은 세션 가드)
 *  ④ 뒤로 가기: 한 번 누름이면 버튼을 깜빡임(굴림 없음) · 아니면 11/22 동작 그대로
 *  ⑤ 미리받기: 한 번 누름이면 처음 만질 때(안 만지고 떠나는 기기엔 요청 0) · iOS 는 체크 순간 그대로
 *  ⑥ CSS: 새 규칙 .ackNote 만 추가(기존 규칙 불변)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ANDROID_ONE_TAP_LEGAL, LEGAL_AGREE_LABEL, legalAgreeLabel, legalOneTapOn, shellPlatform } from '../src/lib/app/legalOneTap';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const onbSrc = read('src/components/app/AppFirstRunOnboarding.tsx');
const css = read('src/components/app/AppFirstRunOnboarding.module.css');
const capWin = (native: boolean, p: string) => ({ Capacitor: { isNativePlatform: () => native, getPlatform: () => p } });

console.log('법적 고지 안드 한 번 누름(11/26)');

t('① 켜짐: 안드 앱만 · iOS·웹 false · 스위치 false 면 끔', () => {
  assert.equal(ANDROID_ONE_TAP_LEGAL, true);
  assert.equal(legalOneTapOn('android'), true);
  for (const p of ['ios', 'web', '', null, undefined]) assert.equal(legalOneTapOn(p as never), false, String(p));
  assert.equal(legalOneTapOn('android', false), false);
  assert.equal(shellPlatform(capWin(true, 'android')), 'android');
  assert.equal(shellPlatform(capWin(true, 'ios')), 'ios');
  assert.equal(shellPlatform(capWin(false, 'android')), 'web', '안드 브라우저(네이티브 아님)는 web');
  assert.equal(shellPlatform({}), 'web');
  assert.equal(shellPlatform(undefined), 'web');
  assert.equal(shellPlatform({ get Capacitor() { throw new Error('x'); } }), 'web');
});

t('① 버튼 글: ko·en·ja · 나머지 언어 en', () => {
  assert.deepEqual(LEGAL_AGREE_LABEL, { ko: '동의하고 계속', en: 'Agree & continue', ja: '同意して続ける' });
  assert.equal(legalAgreeLabel('ko'), '동의하고 계속');
  assert.equal(legalAgreeLabel('ja'), '同意して続ける');
  assert.equal(legalAgreeLabel('de'), 'Agree & continue');
});

t('② 마운트 때 판정 → 보이기와 같은 그림(첫 그림부터) · 체크 상자는 한 번 누름이 아닐 때만', () => {
  assert.ok(/setOneTap\(legalOneTapOn\(shellPlatform\(\)\)\);\s*setVisible\(show\);/.test(onbSrc));
  assert.ok(/\{!oneTap && \(\s*<label className=\{styles\.ack\} ref=\{ackRef\}>\s*<input\s+type="checkbox"\s+checked=\{accepted\}\s+onChange=\{event => setAccepted\(event\.currentTarget\.checked\)\}\s*\/>\s*<span>\{copy\.ack\}<\/span>\s*<\/label>\s*\)\}/.test(onbSrc));
});

t('② 붙박이 줄: 같은 동의 문장 → «동의하고 계속»(처음부터 켬) · iOS 버튼은 글자 그대로', () => {
  const bar = onbSrc.slice(onbSrc.indexOf('<div ref={actionsRef}'));
  const noteAt = bar.indexOf('{legal && oneTap && <p className={styles.ackNote} data-legal-onetap="">{copy.ack}</p>}');
  const agreeAt = bar.indexOf('{legal && oneTap ? (');
  assert.ok(noteAt > 0 && agreeAt > noteAt, '동의 문장이 버튼 바로 위');
  assert.ok(/\{legal && oneTap \? \(\s*<button\s+type="button"\s+ref=\{agreeRef\}\s+className=\{styles\.primaryButton\}\s+disabled=\{advancing\}\s+onClick=\{onLegalAgree\}\s*>\s*\{legalAgreeLabel\(locale\)\}\s*<\/button>\s*\) : \(/.test(bar));
  assert.ok(!/aria-disabled=\{blocked \|\| undefined\}[^>]*onClick=\{onLegalAgree\}/.test(bar), '한 번 누름 버튼은 회색 막힘이 없다');
  // iOS·스위치 끔 경로: 11/17~11/25 버튼 그대로
  assert.ok(/const blocked = legalContinueBlocked\(legal, accepted\);/.test(onbSrc));
  assert.ok(/disabled=\{legal && accepted && advancing\}\s*aria-disabled=\{blocked \|\| undefined\}\s*onClick=\{\(\) => \(blocked \? onBlockedContinue\(\) : legal \? onLegalNext\(\) : finish\(\)\)\}\s*>\s*\{legal \? copy\.continue : copy\.start\}/.test(bar));
});

t('② 고지 글·항목·링크·단계 표시·동의 문장 그대로(버튼 글만 새로)', () => {
  for (const m of [
    'I confirm that I have read and agree to the SIGNUM HQ app terms and financial disclaimer.',
    'SIGNUM HQ 앱 약관과 금융 고지를 읽고 동의합니다.',
    'SIGNUM HQアプリ利用規約および金融データに関する注意を読み、同意します。',
    "continue: 'Continue',", "continue: '계속',", "continue: '続ける',",
    'Not investment advice or a buy/sell recommendation.',
    '{legal ? copy.legalStep : copy.alertStep}',
    '<Link href={termsHref}>{copy.terms}</Link>',
    '<Link href={privacyHref}>{copy.privacy}</Link>',
  ]) assert.ok(onbSrc.includes(m), m);
});

t('③ 누름 = 동의: acceptedRef → onb_check 실행당 한 번 → onLegalNext(설정 대기·마침 계측 그대로)', () => {
  assert.ok(/const onLegalAgree = \(\) => \{\s*if \(advancing\) return;\s*acceptedRef\.current = true;\s*if \(!checkCounted\.current\) \{ checkCounted\.current = true; if \(claimOnbShow\('onb_check', sessionStore\(\)\)\) trackFunnel\('onb_check', \{ src: 'onb_legal' \}\); \}\s*void onLegalNext\(\);\s*\};/.test(onbSrc));
  assert.ok(/if \(!acceptedRef\.current\) return;/.test(onbSrc), 'onLegalNext 의 재확인은 그대로');
  assert.ok(/trackFunnel\('onb_done', \{ src: 'onb_legal' \}\)/.test(onbSrc));
  // 동의 체크 계측 효과(체크 상자 경로)도 그대로
  assert.ok(/if \(!legalOn \|\| !accepted \|\| checkCounted\.current\) return;/.test(onbSrc));
});

t('④ 뒤로 가기: 한 번 누름이면 버튼 깜빡임(굴림 없음) · 아니면 11/22 그대로', () => {
  assert.ok(/if \(oneTap && step === 'legal' && !localePending\) nudgeLegalAck\(agreeRef\.current, null, null, \{ scroll: false \}\);\s*else if \(step === 'legal' && !localePending\) \{\s*if \(pinAck && pinRef\.current\) nudgeLegalAck\(pinRef\.current, null, null, \{ scroll: false \}\);\s*else nudgeLegalAck\(ackRef\.current, panelRef\.current, actionsRef\.current\);\s*\}/.test(onbSrc));
});

t('⑤ 미리받기: 한 번 누름이면 처음 만질 때 · 리스너는 passive·한 번·해제 · 기본 동작 안 막음', () => {
  assert.ok(onbSrc.includes("{legal && (accepted || (oneTap && oneTapTouched)) && cfgMode === 'v2' && <ValuePrefetch loc={wl} />}"));
  const block = onbSrc.slice(onbSrc.indexOf('★11/26 한 번 누름(안드): 화면을 처음 만지면'), onbSrc.indexOf('★11/22 안드 뒤로 가기'));
  assert.ok(/if \(!legalOn \|\| !oneTap \|\| oneTapTouched\) return;/.test(block));
  assert.ok(/addEventListener\('pointerdown', onTouch, \{ capture: true, passive: true, once: true \}\)/.test(block));
  assert.ok(/removeEventListener\('pointerdown', onTouch, \{ capture: true \}\)/.test(block));
  assert.ok(!/preventDefault|stopPropagation/.test(block));
});

t('⑥ CSS: .ackNote 하나만 새로 · 기존 .ack·.ackPin·.actionsSticky·버튼 규칙 그대로', () => {
  assert.ok(/\.ackNote \{\s*margin: 0;\s*padding: 6px 4px;\s*border-radius: 10px;\s*background: rgb\(6, 12, 24\);/.test(css));
  assert.ok(/\.ack \{\s*display: flex;\s*align-items: center;\s*gap: 12px;\s*padding: 12px 14px;/.test(css));
  assert.ok(/\.ackPin \{\s*padding: 10px 12px;/.test(css));
  assert.ok(/\.actionsSticky \{\s*position: sticky;\s*bottom: 0;\s*z-index: 2;\s*margin-top: -14px;\s*padding-top: 14px;/.test(css));
  assert.ok(/\.primaryButton:disabled,\s*\.primaryButton\[aria-disabled='true'\] \{/.test(css));
  assert.equal((css.match(/ackNote/g) || []).length, 1);
});

console.log(`\n${n} passed`);
