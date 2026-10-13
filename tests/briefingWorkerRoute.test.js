/**
 * EC2 워커 모닝 브리핑 — «생성은 Vercel 라우트, 워커는 확인·저장·알림» 시험 (scripts/ec2-guardian-worker.js)
 * 실행: node tests/briefingWorkerRoute.test.js
 *
 * 왜: EC2 는 Node 16 이라 AWS SDK v3(TransformStream 필요)가 안 올라온다. 워커가 프롬프트만 받아 이 머신에서 Bedrock 을 부르던 구조는
 *     10/12 프리필 제거(babac224f) 재배포 뒤에도 «Bedrock SDK not available (Node 16 TransformStream limitation)» 로 매 시도 실패 → 3회 → 템플릿 저장이었다
 *     (10/13 운영 로그 확인; 그날의 AI 글은 08:05 ET signum-warm → /api/guardian/briefing?repair=1 자가복구가 만들었다).
 *     → 생성을 라우트(/api/guardian/briefing/generate: 크레딧 Haiku 5.5 → Bedrock Haiku 4.5, 날짜 앵커·금융 공통어·출구 가드)로 옮기고,
 *       워커는 같은 키·같은 모양으로 저장을 보증하고 웹소켓에 알린다. Node 업그레이드는 하지 않는다(같은 머신의 price-ws · guardian-ws · redis-proxy).
 *
 * 고정하는 것
 *  · readBriefingRouteResult — 라우트는 AI 가 실패해도 success:true 로 템플릿을 돌려주므로 degraded / source(template-error · template-validation)를 반드시 걸러 던진다
 *  · 배선 — 프롬프트만 받기(returnPromptOnly)·로컬 Bedrock·프리필이 워커에 없다 / 같은 Redis 키·같은 필드·웹소켓 알림 / 재시도·템플릿 폴백 유지 /
 *           응답만 놓친 경우(라우트는 저장 완료) 재시도·템플릿 덮어쓰기를 건너뛴다
 *  · 라우트와의 약속 — template-validation 응답도 degraded:true / 같은 키에 저장 / GET 자가복구가 읽는 키와 같다
 *  · 같은 EOL 교체(3d602a2be)로 Sonnet 4.6 에 오른 크로스섹터 Lambda 도 프리필이 없다
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
// 줄 전체 주석(// … · /* * … */)은 뺀 «코드만» — 수리 경위를 적은 주석이 옛 코드 글자를 담고 있어도 걸리지 않게
const codeOnly = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
const code = codeOnly(src);

// 순수 함수 구간: 로케일 판정 상수·함수(HANGUL_RE …)부터 라우트 결과 판독기까지
const START = 'const HANGUL_RE';
const END = '// ── /briefing route helpers ──';
const s = src.indexOf(START), e = src.indexOf(END);
assert.ok(s >= 0 && e > s, '워커에 briefing route helpers 표시 구간이 있어야 한다');
assert.ok(src.includes('// ── briefing route helpers'), '구간 시작 표시');
const api = vm.runInNewContext(`${src.slice(s, e)}\n;({ readBriefingRouteResult, BRIEFING_ROUTE_TIMEOUT_MS })`, {});
// vm 안에서 만든 객체/오류는 다른 realm 이라 JSON 왕복·메시지로 비교한다
const plain = (v) => JSON.parse(JSON.stringify(v));
const read1 = (r) => plain(api.readBriefingRouteResult(r));
const thrown = (r, re) => assert.throws(() => api.readBriefingRouteResult(r), (err) => err && re.test(String(err.message)));

const KO = '화요일 개장 전 거래에서 S&P 500 선물이 7,850.75(-0.09%)로 약보합 출발함. 반도체 섹터 -1.9%로 기술주 약세가 관찰됨.';
const EN = 'Tuesday pre-market trading shows S&P 500 futures at 7,850.75 (-0.09%) with weakness concentrated in Semiconductors (-1.9%).';
const JA = '火曜日のプレマーケットでは、S&P 500先物が7,850.75(-0.09%)と軟調に推移しており、半導体(-1.9%)に売りが集中している。';
const GOOD = { success: true, briefing: { ko: KO, en: EN, ja: JA }, newsCount: 10, calendarCount: 2, elapsedMs: 8123, savedToRedis: true };

// ① 판독기
{
    const r = read1(GOOD);
    assert.deepEqual(r.texts, { ko: KO, en: EN, ja: JA });
    assert.equal(r.newsCount, 10); assert.equal(r.calendarCount, 2); assert.equal(r.elapsedMs, 8123);
    assert.equal(read1({ ...GOOD, source: 'claude' }).texts.ja, JA, 'source claude 는 통과');
    assert.equal(read1({ success: true, briefing: GOOD.briefing }).newsCount, 0, '개수 필드가 없어도 0');
    assert.ok(api.BRIEFING_ROUTE_TIMEOUT_MS >= 62000, '라우트 maxDuration(60초)보다 길어야 한다');
}
// ② 템플릿·실패는 던진다 — 라우트는 success:true 로 템플릿을 돌려준다
{
    thrown(null, /success=false/);
    thrown({ success: false }, /success=false/);
    thrown({ error: 'x' }, /success=false/);
    thrown({ ...GOOD, degraded: true, source: 'template-error', warning: 'Claude timeout 60s' }, /degraded template.*template-error.*Claude timeout/);
    thrown({ ...GOOD, degraded: true, source: 'template-validation' }, /degraded template/);
    thrown({ ...GOOD, source: 'template-validation' }, /source=template-validation/);   // degraded 표식이 없던 옛 라우트 응답도 source 로 거른다
    thrown({ ...GOOD, source: 'template' }, /source=template/);
    thrown({ success: true }, /no briefing object/);
    thrown({ success: true, briefing: { ko: KO, en: EN } }, /briefing\.ja/);
    thrown({ success: true, briefing: { ko: 'x', en: EN, ja: JA } }, /briefing\.ko/);
    thrown({ success: true, briefing: { ko: KO, en: EN, ja: 'x'.repeat(10) } }, /briefing\.ja/);
    thrown({ success: true, briefing: { ko: '죄송하지만 브리핑을 생성할 수 없습니다. ' + KO, en: EN, ja: JA } }, /invalid\/refusal.*briefing\.ko/);
    thrown({ success: true, briefing: { ko: KO, en: 'The briefing is temporarily unavailable right now, please try again later in the day.', ja: JA } }, /briefing\.en/);
    thrown({ success: true, briefing: { ko: KO, en: EN + ' 한국어가 섞였다', ja: JA } }, /mixed locale/);
    thrown({ success: true, briefing: { ko: KO, en: EN + ' ブレンド', ja: JA } }, /mixed locale/);
    thrown({ success: true, briefing: { ko: KO, en: EN, ja: JA + ' 한국어' } }, /mixed locale/);
}
// ③ 배선 — 생성은 라우트, 워커는 로컬 Bedrock·프롬프트만 받기·프리필이 없다
{
    assert.ok(/postJSON\(apiUrl, \{ snapshot, rlsiHistory \}, BRIEFING_ROUTE_TIMEOUT_MS\)/.test(code), '워커가 라우트에 snapshot/rlsiHistory 만 보내 생성하게 한다(returnPromptOnly 없음)');
    assert.ok(!/returnPromptOnly/.test(code), '프롬프트만 받는 호출이 남아 있다');
    assert.ok(!/@aws-sdk|InvokeModel|getBedrock|BedrockRuntimeClient/.test(code), '워커에 로컬 Bedrock 호출이 남아 있다(Node 16 에서는 SDK 가 올라오지 않는다)');
    assert.ok(!/role:\s*['"]assistant['"]/.test(code), '워커에 어시스턴트 프리필이 남아 있다');
    assert.ok(!/['"]\{['"]\s*\+/.test(code), "워커에 '{' + … 덧붙이기(프리필 전제 파싱)가 남아 있다");
    assert.ok(code.includes('readBriefingRouteResult(result)'), '결과를 판독기로 거른다');
    assert.ok(code.includes('/api/guardian/briefing/generate'));
}
// ④ 같은 키·같은 모양 — 앱·푸시·자가복구(GET /api/guardian/briefing · signum-warm · push cron)가 읽는 것
{
    for (const needle of [
        '`guardian:morning_briefing:${locale}`', '"guardian:morning_briefing"', 'source: "claude"', 'degraded: false',
        'newsCount,', 'calendarCount,', 'generatedAt', 'date: etDateStr', 'type: "morning_briefing"', 'CONFIG.UPDATE_CHANNEL',
        '24 * 60 * 60',
    ]) assert.ok(code.includes(needle), `저장·알림 모양이 사라졌다: ${needle}`);
    // 재시도·게이트·폴백 유지
    for (const needle of ['const MAX_RETRIES = 3;', 'const RETRY_DELAYS = [0, 15000, 30000]', 'const GATE_MIN_GAP_MS = 10 * 60 * 1000;', 'const GATE_MAX_TRIES = 12;', 'source: "template"', 'degraded: true', 'generateFallbackBriefing(snapshot, etDateStr)']) {
        assert.ok(code.includes(needle), `기존 로직이 사라졌다: ${needle}`);
    }
    // 응답만 놓친 경우 — 재시도 사이와 템플릿 저장 직전에 확인한다
    assert.equal((code.match(/await savedRealAiAlready\(etDateStr\)/g) || []).length, 2, '재시도 사이 1 + 템플릿 직전 1');
    const fallbackAt = code.indexOf('Using template fallback');
    const guardAt = code.indexOf("await savedRealAiAlready(etDateStr)", fallbackAt);
    assert.ok(guardAt > fallbackAt && guardAt < code.indexOf('generateFallbackBriefing(snapshot, etDateStr)', fallbackAt), '템플릿을 쓰기 전에 «이미 저장됐나» 를 본다');
}
// ⑤ 라우트와의 약속
{
    const route = read('src/app/api/guardian/briefing/generate/route.ts');
    assert.ok(/savedToRedis: true,\s*source: 'template-validation',[\s\S]{0,200}?degraded: true,/.test(route), 'template-validation 응답에도 degraded:true');
    assert.ok(/source: 'template-error'/.test(route) && /degraded: true,\s+\/\/ ← 부르는 쪽은 이걸 보고 다시 시도한다/.test(route), 'template-error 응답 degraded:true');
    assert.ok(route.includes("`guardian:morning_briefing:${loc}`") && route.includes("'guardian:morning_briefing'"), '라우트가 같은 키에 저장한다');
    assert.ok(/const isFallback = meta\.source !== 'claude';/.test(route) && /degraded: isFallback/.test(route), 'claude 가 아니면 degraded');
    assert.ok(route.includes('depthSuffixFor') && route.includes("purpose: 'MorningBriefing'") && route.includes('dateAnchor() + financeTermsRule()'), '사다리·날짜 앵커·금융 공통어');
    const get = read('src/app/api/guardian/briefing/route.ts');
    assert.ok(get.includes('`guardian:morning_briefing:${locale}`') && get.includes("'guardian:morning_briefing'") && get.includes('/api/guardian/briefing/generate'), 'GET 자가복구가 같은 키·같은 라우트');
}
// ⑥ 같은 EOL 교체(3d602a2be)로 Sonnet 4.6 에 오른 다른 운영 호출자 — 크로스섹터 Lambda
{
    const cs = read('scripts/lambda-cross-sector/index.js');
    assert.ok(cs.includes('us.anthropic.claude-sonnet-4-6'));
    assert.ok(!/role:\s*['"]assistant['"]/.test(codeOnly(cs)), '크로스섹터 Lambda 에 어시스턴트 프리필이 있다');
}

console.log('briefingWorkerRoute: 통과');
