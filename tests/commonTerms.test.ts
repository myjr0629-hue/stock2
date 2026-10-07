/**
 * 금융 공통어는 AI 글에서도 번역하지 않는다 (src/lib/ai/commonTerms.ts · bedrockClient 단일 입구 + 직접 호출 4곳 · 언어 게이트 허용 · UC 검증기)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/commonTerms.test.ts
 *
 * 지시(대표 10/8 0시): «금융 공통어라면 일반적으로 사용하는 언어라면 유지하도록 해».
 * 실측(10/7 운영 AI 글): 한국어 «맥스 페인(21)·콜월(25)·감마 플립(45)», 일본어 «マックスペイン(9)·コールウォール(5)·ガンマフリップ(17)» — 영어 그대로여야 할 지표 이름이 소리대로 옮겨져 있었다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    COMMON_TERM_ABBREVIATIONS, COMMON_TERM_NAMES, LOCAL_STANDARD_TERMS, financeTermsRule, stripCommonTermNames,
} from '@/lib/ai/commonTerms';
import { gateInsight, languageStats, validateInsight } from '@/lib/ai/outputGate';
import { checkUcLevels } from '@/lib/ai/ucNumbers';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

t('규칙: 지시서가 말한 공통어를 빠짐없이 담는다 — GEX·VIX·P/C·RSI·SMA·IV·OI·Max Pain·Call Wall·Put Wall·Gamma Flip', () => {
    const rule = financeTermsRule();
    for (const w of ['GEX', 'VIX', 'P/C', 'RSI', 'SMA', 'IV', 'OI', 'Max Pain', 'Call Wall', 'Put Wall', 'Gamma Flip']) assert.ok(rule.includes(w), w);
    for (const w of ['RLSI', 'IFS', 'OPI', 'UOA', 'Put Floor', 'EMA', 'MACD', 'VWAP']) assert.ok(rule.includes(w), `앱 지표 ${w}`);
    assert.ok(rule.startsWith('<finance_terms>') && rule.includes('</finance_terms>') && rule.endsWith('\n\n'));
    assert.equal(COMMON_TERM_ABBREVIATIONS.length, 14); assert.equal(COMMON_TERM_NAMES.length, 5);
});

t('규칙: «이렇게 쓰지 말라» 소리 표기 예시를 보여 준다 — 맥스페인·콜월·풋플로어·감마 플립 / マックスペイン·コールウォール·プットフロア·ガンマフリップ', () => {
    const rule = financeTermsRule();
    for (const bad of ['맥스페인', '콜월', '풋플로어', '감마 플립', 'マックスペイン', 'コールウォール', 'プットフロア', 'ガンマフリップ']) assert.ok(rule.includes(bad), bad);
    assert.match(rule, /Never translate them and never transliterate them by sound/);
});

t('규칙: 현지 표준 용어(미결제약정·建玉·공매도·空売り)는 유지한다고 말한다 — 줄임말이 아니라 풀어 쓸 때', () => {
    const rule = financeTermsRule();
    for (const w of ['미결제약정', '建玉', '공매도', '空売り']) assert.ok(rule.includes(w), w);
    assert.ok(LOCAL_STANDARD_TERMS.includes('open interest') && LOCAL_STANDARD_TERMS.includes('short selling'));
    // 지표 이름 목록에 현지 표준어를 넣지 않았다(번역해야 할 말과 유지해야 할 말을 섞지 않는다)
    const names = rule.split('- Names:')[1].split('- Terms')[0];
    assert.ok(!names.includes('미결제약정') && !names.includes('공매도'));
});

t('주입 지점: callBedrock 단일 입구 — 날짜 뒤·원 system 앞(dateAnchor() + financeTermsRule() + system)', () => {
    const src = read('src/services/bedrockClient.ts');
    assert.ok(src.includes('system: dateAnchor() + financeTermsRule() + system,'));
    assert.ok(src.includes("import { financeTermsRule } from '@/lib/ai/commonTerms';"));
});

t('주입 지점: 직접 호출 4곳(UC·모닝브리핑·종목 뉴스·실적 브리핑)도 같은 규칙을 system 앞에 붙인다', () => {
    assert.ok(read('src/app/api/undercurrent/shared.ts').includes('system: financeTermsRule() + system,'));
    assert.ok(read('src/app/api/guardian/briefing/generate/route.ts').includes('system: financeTermsRule() + systemPrompt,'));
    assert.ok(read('src/app/api/live/ticker-news/route.ts').includes('system: [{ text: financeTermsRule() + SYSTEM }],'));
    assert.ok(read('src/app/api/cron/earnings-brief/route.ts').includes('system: [{ text: financeTermsRule() + SYSTEM }],'));
});

t('모델 호출 지점 전수: Bedrock 을 부르는 모든 src 파일은 callBedrock 이거나 financeTermsRule 을 쓴다(새 호출이 규칙 없이 생기면 실패)', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel); else if (/\.(ts|tsx)$/.test(e.name)) files.push(rel);
    } };
    walk('src');
    const direct = files.filter((f) => /\b(InvokeModelCommand|ConverseCommand)\(/.test(read(f)) && !f.endsWith('bedrockClient.ts'));
    assert.ok(direct.length >= 4, `직접 호출 ${direct.length}곳`);
    for (const f of direct) assert.ok(read(f).includes('financeTermsRule()'), `${f}: 직접 호출인데 공통어 규칙이 없다`);
});

t('가디언 구조 레벨 데이터 줄: 모델이 라벨을 따라 쓰므로 «Put Floor / Call Wall / Gamma Flip» (소리 표기 라벨 제거)', () => {
    const src = read('src/services/guardian/intelligenceNode.ts');
    assert.equal((src.match(/Put Floor \$\{ctx\.triggerSupport/g) || []).length, 2);
    assert.equal((src.match(/Call Wall \$\{ctx\.triggerResistance/g) || []).length, 2);
    assert.equal((src.match(/Gamma Flip \$\{ctx\.gammaFlipPoint/g) || []).length, 2);
    assert.ok(!/풋플로어 \$\{ctx|콜월 \$\{ctx|감마플립 \$\{ctx|プットフロア \$\{ctx|コールウォール \$\{ctx|ガンマフリップ \$\{ctx/.test(src));
});

t('이름 걷기: 대소문자·공백·하이픈 변형까지 같은 이름으로, 다른 영어는 건드리지 않는다', () => {
    const squash = (x: string) => x.replace(/\s+/g, '');
    assert.equal(squash(stripCommonTermNames('Max Pain보다 아래, max-pain 근처, Call  Wall과 Put Floor, Gamma Flip, put wall')), '보다아래,근처,과,,');
    assert.equal(stripCommonTermNames('Gamma Exposure와 Call Spread'), 'Gamma Exposure와 Call Spread');   // 이름이 아닌 영어는 그대로
    assert.equal(stripCommonTermNames('GEX −26의 숏 감마'), 'GEX −26의 숏 감마');
    assert.equal(stripCommonTermNames('Pain Max'), 'Pain Max');                                              // 순서가 다르면 다른 말
});

t('언어 게이트: 한국어 문장이 영어 지표 이름을 많이 쓰면 옛 계산은 영어 누출(한글 비율 0.24)로 떨어졌고, 지금은 통과한다', () => {
    const ko = 'Gamma Flip, Put Floor, Call Wall, Max Pain 모두 근접한 구간입니다.';
    const old = languageStats(ko);                                         // 옵션 없음 = 옛 계산
    const now = languageStats(ko, { ignoreCommonNames: true });
    assert.ok(old.latin >= 30, `옛 라틴 ${old.latin}`); assert.equal(now.latin, 0);
    const oldRatio = old.hangul / (old.hangul + old.latin), nowRatio = now.hangul / (now.hangul + now.latin);
    assert.ok(oldRatio < 0.6 && nowRatio >= 0.6, `${oldRatio.toFixed(2)} → ${nowRatio.toFixed(2)}`);
    const r = validateInsight(ko, 'ko');
    assert.ok(!r.reasons.some((x) => x.startsWith('language:')), r.reasons.join(','));
    assert.equal(gateInsight(ko, 'ko').ok, true);
});

t('언어 게이트: 일본어도 같다 · 영어 글의 라틴 계산은 그대로(옵션을 안 쓴다)', () => {
    const ja = 'Max Pain 7,800 付近でGamma Flip を下回る局面です。Call Wall は 7,900。';
    assert.ok(!validateInsight(ja, 'ja').reasons.some((x) => x.startsWith('language:')));
    const en = 'Price sits near the Max Pain strike while the Call Wall caps upside.';
    assert.equal(languageStats(en).latin, languageStats(en, { ignoreCommonNames: false }).latin);
    assert.ok(languageStats(en).latin > 40);
});

t('언어 게이트: 영어 이름을 허용해도 «영어 누출»은 여전히 잡는다 — 한국어 글이 영어 문장이면 실패', () => {
    const leak = 'The market is rising but internal liquidity contradicts the strength, so the Max Pain level matters.';
    assert.ok(validateInsight(leak, 'ko').reasons.some((x) => x.startsWith('language:ko')));
});

t('UC 검증기: 한·일 글이 영어 이름을 써도 가격대 방향·거리 검사를 받는다(옛 소리 표기와 동일 판정)', () => {
    const money = { price: 333.69, maxPain: 330, callWall: 340, putFloor: 320 };
    // 실제: 가격은 맥스페인보다 $3.69 «위» — «아래»라고 쓰면 방향 불일치
    const wrongEn = checkUcLevels('ko', 'Max Pain보다 4달러 아래에서 거래 중입니다.', money);
    const wrongOld = checkUcLevels('ko', '맥스페인보다 4달러 아래에서 거래 중입니다.', money);
    assert.equal(wrongEn.length, 1); assert.match(wrongEn[0], /^direction:maxPain/);
    assert.deepEqual(wrongEn.map((x) => x.replace(/«[^»]*»/, '')), wrongOld.map((x) => x.replace(/«[^»]*»/, '')));
    assert.deepEqual(checkUcLevels('ko', 'Max Pain보다 4달러 위에서 거래 중입니다.', money), []);          // 맞는 문장은 통과
    // 일본어: 콜월(340)보다 실제 $6.31 아래 — «8ドル下» 는 거리 불일치
    const jaBad = checkUcLevels('ja', 'Call Wallより8ドル下で推移しています。', money);
    assert.equal(jaBad.length, 1); assert.match(jaBad[0], /^distance:callWall/);
    assert.deepEqual(checkUcLevels('ja', 'Call Wallより6ドル下で推移しています。', money), []);
    assert.equal(checkUcLevels('ko', 'Put Floor보다 14달러 위에서 거래 중입니다.', money).length, 0);     // 333.69−320 = 13.69 → 14 허용
    assert.equal(checkUcLevels('ko', 'put floor보다 14달러 아래에서 거래 중입니다.', money).length, 1);    // 소문자·방향 틀림
});

console.log(`\n${n} passed`);
