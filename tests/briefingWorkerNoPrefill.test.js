/**
 * EC2 워커 모닝 브리핑 — Sonnet 4.6 요청 모양 시험 (scripts/ec2-guardian-worker.js)
 * 실행: node tests/briefingWorkerNoPrefill.test.js
 *
 * 왜: 9/15 EOL 교체(3d602a2be)가 모델을 us.anthropic.claude-sonnet-4-6 으로 올리면서 어시스턴트 프리필
 *     ({role:'assistant', content:'{'})을 남겼다. 4.6 은 프리필을 거절한다(ValidationException:
 *     «This model does not support assistant message prefill») → 매 시도 실패 → 템플릿(degraded) 저장.
 *
 * 고정하는 것:
 *  · 요청 본문은 사용자 메시지로 끝나고, 어시스턴트 메시지가 하나도 없다
 *  · 모델 글에서 JSON 을 꺼낸다 — 코드 펜스·앞뒤 설명문이 붙어도, JSON 이 없으면 던진다(재시도 루프가 받는다)
 *  · 배선 — 워커의 InvokeModel 이 buildBriefingInvokeBody 를 쓰고, 파일 어디에도 프리필·'{' 덧붙이기가 없다
 *  · 같은 EOL 교체로 4.6 에 오른 크로스섹터 Lambda 도 프리필이 없다
 *
 * 워커 파일은 require 하면 곧바로 ElastiCache 에 붙고 메인 루프를 돌리므로, 표시한 구간(순수 함수)만 떼어 vm 으로 돌린다.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const src = read('scripts/ec2-guardian-worker.js');
// 줄 전체 주석(// … · /* * … */)은 뺀 «코드만» — 수리 경위를 적은 주석이 프리필 글자를 담고 있어도 걸리지 않게
const codeOnly = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');

const START = '// ── briefing request helpers';
const END = '// ── /briefing request helpers ──';
const s = src.indexOf(START), e = src.indexOf(END);
assert.ok(s >= 0 && e > s, '워커에 briefing request helpers 표시 구간이 있어야 한다');
const block = src.slice(s, e);
const helpers = vm.runInNewContext(
    `${block}\n;({ buildBriefingInvokeBody, extractBriefingJson })`, {},
);
// vm 안에서 만든 객체는 프로토타입이 다른 realm 이라 deepStrictEqual 이 어긋난다 — JSON 왕복으로 이 realm 객체로 바꿔 비교한다
const plain = (v) => JSON.parse(JSON.stringify(v));
const buildBriefingInvokeBody = (...a) => plain(helpers.buildBriefingInvokeBody(...a));
const extractBriefingJson = (t) => plain(helpers.extractBriefingJson(t));

// ① 요청 모양 — 사용자 메시지로 끝난다, 어시스턴트 메시지 없음
{
    const body = buildBriefingInvokeBody('SYS', 'USER PROMPT');
    assert.equal(body.anthropic_version, 'bedrock-2023-05-31');
    assert.equal(body.system, 'SYS');
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.temperature, 0.3);
    assert.ok(Array.isArray(body.messages) && body.messages.length >= 1);
    assert.equal(body.messages[body.messages.length - 1].role, 'user', '마지막 메시지는 user 여야 한다(4.6 은 프리필 거절)');
    assert.equal(body.messages[body.messages.length - 1].content, 'USER PROMPT');
    assert.ok(!body.messages.some((m) => m.role === 'assistant'), '어시스턴트 메시지가 있으면 안 된다');
}

// ② JSON 꺼내기
{
    const obj = { ko: '한국어 브리핑 '.repeat(8), en: 'English briefing '.repeat(6), ja: '日本語ブリーフィング '.repeat(6) };
    const json = JSON.stringify(obj);
    assert.deepEqual(extractBriefingJson(json), obj, '그대로의 JSON');
    assert.deepEqual(extractBriefingJson('```json\n' + json + '\n```'), obj, '```json 펜스');
    assert.deepEqual(extractBriefingJson('```\n' + json + '\n```'), obj, '이름 없는 펜스');
    assert.deepEqual(extractBriefingJson('Here is the briefing:\n' + json + '\nLet me know if you need changes.'), obj, '앞뒤 설명문');
    assert.deepEqual(extractBriefingJson('  \n' + json + '  \n'), obj, '앞뒤 공백');
    assert.deepEqual(extractBriefingJson('{"ko":"a } b","en":"x","ja":"y"}'), { ko: 'a } b', en: 'x', ja: 'y' }, '값 안의 중괄호');
    // 프리필 시절의 «'{' 뒤 이어쓰기» 모양은 이제 JSON 이 아니다 — 조용히 '{' 를 덧붙여 살리지 않는다
    assert.throws(() => extractBriefingJson('"ko": "…", "en": "…"}'), /no JSON object/);
    assert.throws(() => extractBriefingJson(''), /no JSON object/);
    assert.throws(() => extractBriefingJson(null), /no JSON object/);
    assert.throws(() => extractBriefingJson('I cannot generate this briefing.'), /no JSON object/);
    // 잘린 JSON(max_tokens) — 파싱 오류로 던진다(재시도 루프가 받는다). vm 의 SyntaxError 는 다른 realm 이라 이름으로 본다
    assert.throws(() => extractBriefingJson('{"ko": "잘린 글 {중간}", "en": "cut'), (err) => err && err.name === 'SyntaxError');
}

// ③ 배선 — 워커 파일 전체에서 프리필이 사라졌고, 브리핑 호출이 도우미를 쓴다
{
    assert.ok(!/role:\s*['"]assistant['"]/.test(codeOnly(src)), '워커에 어시스턴트 프리필이 남아 있다');
    assert.ok(!/['"]\{['"]\s*\+/.test(codeOnly(src)), "워커에 '{' + … 덧붙이기(프리필 전제 파싱)가 남아 있다");
    assert.ok(src.includes('body: JSON.stringify(buildBriefingInvokeBody(systemPrompt, userPrompt))'), 'InvokeModel 본문이 buildBriefingInvokeBody 를 써야 한다');
    assert.ok(src.includes('briefingTexts = extractBriefingJson(modelText)'), '응답 파싱이 extractBriefingJson 을 써야 한다');
    // 검증·재시도·폴백은 그대로
    for (const needle of ['isInvalid(briefingTexts.ko)', 'isBriefingUsableForLocale("en", { briefing: briefingTexts.en })', 'isBriefingUsableForLocale("ja", { briefing: briefingTexts.ja })', 'const MAX_RETRIES = 3;', 'source: "template"', 'degraded: true']) {
        assert.ok(src.includes(needle), `기존 로직이 사라졌다: ${needle}`);
    }
}

// ④ 같은 EOL 교체(3d602a2be)로 Sonnet 4.6 에 오른 다른 운영 호출자 — 크로스섹터 Lambda
{
    const cs = read('scripts/lambda-cross-sector/index.js');
    assert.ok(cs.includes('us.anthropic.claude-sonnet-4-6'));
    assert.ok(!/role:\s*['"]assistant['"]/.test(codeOnly(cs)), '크로스섹터 Lambda 에 어시스턴트 프리필이 있다');
}

console.log('briefingWorkerNoPrefill: 통과');
