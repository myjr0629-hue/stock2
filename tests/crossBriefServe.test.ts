/**
 * 크로스섹터 브리프 서빙 선택 — src/lib/ai/crossBriefServe.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/crossBriefServe.test.ts
 * 고정 자료: tests/fixtures/crossBriefServe.v4.json = 금요일(10/9) 마감 시계 + 운영 실데이터로 라우트 POST 를 돌려 얻은 v4 저장본(Haiku 5.5 사다리) + 모델이 본 프롬프트(뉴스 구획 제외).
 * 고정하는 것: ① 같은 날 v4 가 가드를 넘으면 v3 보다 먼저 ② 날짜 불일치·가드 기록 없음/실패·해시 불일치·legacy 제공자·언어 혼입·구조 결함·근거 없는 keyLevels 이면 v3 로 내려감
 *   ③ 날짜 우선(오늘 v3 > 어제 v4) ④ v3·v2 폴백과 source 표지 ⑤ 응답에 내부 판정 기록 대신 요약만
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGenerationGuard, evaluateServedV4, selectServedBrief, toServedPayload, crossBriefKey, briefDigest, shapeProblems, languageProblems, lengthProblems, SLOT_LENGTH_CEILING, MAX_UNGROUNDED_DISTINCT, GUARD_VERSION } from '@/lib/ai/crossBriefServe';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

const FX = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/crossBriefServe.v4.json'), 'utf8'));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const DAY = '2026-10-09';
const PREV = '2026-10-08';

/** 생성 때 판정까지 마친 v4 저장본(통과) */
function v4Stored(over: Record<string, any> = {}, provider = 'a55'): any {
    const brief = { ...clone(FX.brief), version: 'v4', ...over };
    brief.guard = buildGenerationGuard({ brief, source: FX.prompt, provider, model: 'claude-haiku-5-5', now: new Date('2026-10-09T21:55:00Z') });
    return brief;
}
/** 화면이 읽는 v3(Lambda) 저장본 — 같은 날 */
const v3Stored = (date = DAY): any => ({ ...clone(FX.brief), date, version: 'v3', structured: { ...clone(FX.brief.structured), marketOverview: { ...clone(FX.brief.structured.marketOverview), tone: 'MIXED' } } });
const reader = (store: Record<string, any>) => async (key: string) => (key in store ? clone(store[key]) : null);

(async () => {
    await t('고정 자료의 v4 저장본: 생성 때 가드 통과(제공자 a55) · 서빙 가드 통과', () => {
        const b = v4Stored();
        assert.equal(b.guard.ok, true, JSON.stringify(b.guard.reasons));
        assert.equal(b.guard.v, GUARD_VERSION);
        assert.equal(b.guard.digest, briefDigest(b.structured));
        const v = evaluateServedV4(b, DAY);
        assert.deepEqual(v, { ok: true, reasons: [] });
    });

    await t('우선순위: 같은 날 v4(가드 통과)가 v3 보다 먼저 — source=v4', async () => {
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: v4Stored(), [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY, PREV]);
        assert.equal(sel?.source, 'v4');
        assert.equal(sel?.date, DAY);
        assert.equal(sel?.brief.structured.marketOverview.tone, FX.brief.structured.marketOverview.tone);   // v3 의 MIXED 가 아니다
    });

    await t('v4 만 있고 v3 가 없어도 가드를 넘으면 v4', async () => {
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: v4Stored() }), [DAY]);
        assert.equal(sel?.source, 'v4');
    });

    await t('v4 가 없으면 v3 (source=v3) → v3 도 없으면 v2 (source=v2)', async () => {
        const a = await selectServedBrief(reader({ [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY]);
        assert.equal(a?.source, 'v3');
        const b = await selectServedBrief(reader({ [crossBriefKey('v2', DAY)]: v3Stored() }), [DAY]);
        assert.equal(b?.source, 'v2');
        assert.equal(await selectServedBrief(reader({}), [DAY, PREV]), null);
    });

    await t('날짜 불일치: 키 날짜와 다른 date 를 단 v4 → 탈락, v3 로', async () => {
        const stale = v4Stored({ date: PREV });
        assert.ok(evaluateServedV4(stale, DAY).reasons.some((r) => r.startsWith('date:')));
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: stale, [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY]);
        assert.equal(sel?.source, 'v3');
        assert.ok(sel?.v4Rejected?.some((r) => r.startsWith('date:')));
    });

    await t('날짜 불일치: 생성 시각의 ET 날짜가 키와 다르면(어제 만든 글이 오늘 키에) 탈락', () => {
        const b = v4Stored({ generatedAt: '2026-10-08T21:55:00Z' });
        const v = evaluateServedV4(b, DAY);
        assert.equal(v.ok, false);
        assert.ok(v.reasons.some((r) => r.startsWith('generatedAt:')));
        assert.equal(evaluateServedV4({ ...v4Stored(), generatedAt: 'nope' }, DAY).ok, false);
    });

    await t('날짜 우선: 오늘 v3 가 있으면 어제 v4(통과)보다 먼저 — v4 는 «같은 거래일»일 때만 앞선다', async () => {
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', PREV)]: v4Stored({ date: PREV, generatedAt: '2026-10-08T21:55:00Z' }), [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY, PREV]);
        assert.equal(sel?.source, 'v3');
        assert.equal(sel?.date, DAY);
    });

    await t('오늘 v4·v3 모두 없으면 어제 v4(통과)를 쓴다 — 주말·휴장 폴백', async () => {
        const prev = v4Stored({ date: PREV, generatedAt: '2026-10-08T21:55:00Z' });
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', PREV)]: prev }), [DAY, PREV]);
        assert.equal(sel?.source, 'v4');
        assert.equal(sel?.date, PREV);
    });

    await t('가드 기록이 없는 옛 v4(10/9~10 크론분)는 검증 불가 → v3', async () => {
        const old = clone(FX.brief); old.version = 'v3';
        assert.deepEqual(evaluateServedV4(old, DAY).reasons.filter((r) => r.startsWith('guard:')), ['guard:none']);
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: old, [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY]);
        assert.equal(sel?.source, 'v3');
    });

    await t('가드 실패 기록(ok=false)·해시 불일치(글이 바뀜)·옛 가드 버전 → v3', async () => {
        const failed = v4Stored(); failed.guard = { ...failed.guard, ok: false, reasons: ['numbers:9>3'] };
        assert.ok(evaluateServedV4(failed, DAY).reasons.some((r) => r.startsWith('guard:failed')));
        const edited = v4Stored(); edited.structured.marketOverview.summary.ko = edited.structured.marketOverview.summary.ko + ' 추가';
        assert.ok(evaluateServedV4(edited, DAY).reasons.includes('guard:digest-mismatch'));
        const oldV = v4Stored(); oldV.guard = { ...oldV.guard, v: GUARD_VERSION + 1 };
        assert.ok(evaluateServedV4(oldV, DAY).reasons.some((r) => r.startsWith('guard:v')));
        for (const bad of [failed, edited, oldV]) {
            const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: bad, [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY]);
            assert.equal(sel?.source, 'v3');
        }
    });

    await t('제공자: 현행 Bedrock Haiku 4.5(legacy)로 만든 v4 는 서빙하지 않는다 · 5.5 계열(a55s·b55)은 서빙', () => {
        const legacy = v4Stored({}, 'legacy');
        assert.equal(legacy.guard.ok, false);
        assert.ok(legacy.guard.reasons.includes('provider:legacy'));
        assert.equal(evaluateServedV4(legacy, DAY).ok, false);
        for (const p of ['a55', 'a55s', 'b55']) assert.equal(evaluateServedV4(v4Stored({}, p), DAY).ok, true, p);
    });

    await t('언어 혼입: 한글 칸에 가나, 일본어 칸에 한글 → 생성 가드·서빙 가드 둘 다 탈락 → v3', async () => {
        const mixed = clone(FX.brief); mixed.structured.marketOverview.summary.ko = mixed.structured.marketOverview.summary.ko + ' マーケットは堅調です。';
        assert.ok(languageProblems(mixed.structured).some((r) => r.startsWith('ko:script:kana-in-ko')));
        const g = buildGenerationGuard({ brief: mixed, source: FX.prompt, provider: 'a55', model: 'm' });
        assert.equal(g.ok, false);
        const stored = { ...mixed, guard: { ...g, ok: true } };   // 기록을 위조해 ok 로 둬도 서빙 때 다시 잡는다
        assert.ok(evaluateServedV4(stored, DAY).reasons.some((r) => r.includes('script:kana-in-ko')));
        const ja = clone(FX.brief); ja.structured.sectorRotation.rotationInsight.ja = '자금 흐름 패턴이 관측됩니다.';
        assert.ok(languageProblems(ja.structured).some((r) => r.startsWith('ja:script:hangul-in-ja')));
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: stored, [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY]);
        assert.equal(sel?.source, 'v3');
    });

    await t('칸 길이 상한: 폭주한 장문 칸은 탈락 — 실측 v4 최대(ko 230·en 326·ja 196)는 통과', async () => {
        assert.deepEqual(lengthProblems(FX.brief.structured), []);
        const long = clone(FX.brief); long.structured.marketOverview.summary.en = 'The market closed higher across the board with broad participation. '.repeat(8);
        assert.ok(lengthProblems(long.structured)[0].startsWith('length:en:marketOverview.summary'));
        assert.equal(buildGenerationGuard({ brief: long, source: FX.prompt, provider: 'a55', model: 'm' }).ok, false);
        const stored = { ...long, guard: { ...buildGenerationGuard({ brief: long, source: FX.prompt, provider: 'a55', model: 'm' }), ok: true, digest: briefDigest(long.structured) } };
        assert.ok(evaluateServedV4(stored, DAY).reasons.some((r) => r.startsWith('length:')));
        const ko = clone(FX.brief); ko.structured.marketOverview.summary.ko = '지수는 동반 상승했습니다. '.repeat(30);
        assert.ok(lengthProblems(ko.structured).some((r) => r.startsWith(`length:ko:`) && r.endsWith(`>${SLOT_LENGTH_CEILING.ko}`)));
    });

    await t('거절·사과문이 칸에 들어가면 탈락', () => {
        const refusal = clone(FX.brief); refusal.structured.gammaOptions.insight.en = "I'm sorry, I cannot provide this analysis.";
        assert.ok(languageProblems(refusal.structured).some((r) => r.includes('refusal')));
    });

    await t('구조 결함(앱이 바로 읽는 marketOverview.summary·keyDrivers 누락 등) → 탈락', async () => {
        const noSummary = clone(FX.brief); delete noSummary.structured.marketOverview.summary.ja;
        assert.ok(shapeProblems(noSummary.structured).includes('shape:marketOverview.summary'));
        const noOutlook = clone(FX.brief); delete noOutlook.structured.outlook;
        assert.ok(shapeProblems(noOutlook.structured).length > 0);
        assert.ok(shapeProblems(null).length > 0);
        const g = buildGenerationGuard({ brief: noSummary, source: FX.prompt, provider: 'a55', model: 'm' });
        assert.equal(g.ok, false);
        assert.ok(g.reasons.includes('shape:marketOverview.summary'));
        const stored = { ...noSummary, guard: { ...g, ok: true, digest: briefDigest(noSummary.structured) } };
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: stored, [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY]);
        assert.equal(sel?.source, 'v3');
    });

    await t('keyLevels: 입력(저장본의 매크로·레벨 근거 줄)에 없는 칸이 있으면 탈락 — 생성 때도 서빙 때도', async () => {
        const inv = clone(FX.brief); inv.structured.outlook.keyLevels = [...inv.structured.outlook.keyLevels, { label: 'S&P 500 Support', value: '7,750' }];
        const g = buildGenerationGuard({ brief: inv, source: FX.prompt, provider: 'a55', model: 'm' });
        assert.equal(g.ok, false);
        assert.ok(g.reasons.some((r) => r.startsWith('keyLevels:')));
        const stored = { ...inv, guard: { ...g, ok: true, digest: briefDigest(inv.structured) } };
        assert.ok(evaluateServedV4(stored, DAY).reasons.some((r) => r.startsWith('keyLevels:')));
        const sel = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: stored, [crossBriefKey('v3', DAY)]: v3Stored() }), [DAY]);
        assert.equal(sel?.source, 'v3');
    });

    await t('숫자 근거(depthNumbers): 입력에 없는 숫자가 허용 개수를 넘으면 생성 가드 탈락 · 허용 이내면 통과', () => {
        const few = clone(FX.brief);
        few.structured.marketOverview.keyDrivers.en[0] = 'S&P500 rose to 8,123 while NASDAQ reached 31,415.';
        const g1 = buildGenerationGuard({ brief: few, source: FX.prompt, provider: 'a55', model: 'm' });
        assert.equal(g1.numbers.distinct, 2);
        assert.ok(g1.numbers.distinct <= MAX_UNGROUNDED_DISTINCT);
        assert.equal(g1.ok, true, JSON.stringify(g1.reasons));
        const many = clone(FX.brief);
        many.structured.marketOverview.keyDrivers.en[0] = 'S&P500 rose to 8,123 while NASDAQ reached 31,415, DOW 66,666 and Russell 4,321.';
        const g2 = buildGenerationGuard({ brief: many, source: FX.prompt, provider: 'a55', model: 'm' });
        assert.ok(g2.numbers.distinct > MAX_UNGROUNDED_DISTINCT);
        assert.equal(g2.ok, false);
        assert.ok(g2.reasons.some((r) => r.startsWith('numbers:')));
    });

    await t('같은 숫자를 ko·en·ja 세 칸에 쓴 것은 한 개로 센다(IF→THEN 문턱 «WTI 90» ×3 = 1)', () => {
        const b = clone(FX.brief);
        b.structured.outlook.catalysts.ko[0] = 'IF WTI 95 이상 유지 → THEN 인플레 우려 관측';
        b.structured.outlook.catalysts.en[0] = 'IF WTI holds above 95 → THEN inflation concern observed';
        b.structured.outlook.catalysts.ja[0] = 'IF WTIが95超を維持 → THENインフレ懸念を観測';
        const g = buildGenerationGuard({ brief: b, source: FX.prompt, provider: 'a55', model: 'm' });
        assert.equal(g.numbers.ungrounded, 3);
        assert.equal(g.numbers.distinct, 1);
        assert.equal(g.ok, true, JSON.stringify(g.reasons));
    });

    await t('응답 모양: source 표지 · v4 는 내부 판정 기록 대신 generatedBy 요약 · 거절 사유는 v3 응답에만 · v3 의 근거 없는 keyLevels 는 예전처럼 걸러 낸다', async () => {
        const sel4 = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: v4Stored() }), [DAY]);
        const p4 = toServedPayload(sel4!);
        assert.equal(p4.source, 'v4');
        assert.equal('guard' in p4, false);
        assert.deepEqual(p4.generatedBy, { provider: 'a55', model: 'claude-haiku-5-5' });
        assert.equal(p4.date, DAY);
        assert.deepEqual(p4.structured.outlook.keyLevels, FX.brief.structured.outlook.keyLevels);
        // v3 에 입력에 없는 칸이 있으면 서빙 출구가 거른다(기존 동작 유지)
        const v3bad = v3Stored(); v3bad.structured.outlook.keyLevels = [{ label: 'S&P 500 Support', value: '7,750' }, ...v3bad.structured.outlook.keyLevels];
        const failed = v4Stored(); failed.guard = { ...failed.guard, ok: false };
        const sel3 = await selectServedBrief(reader({ [crossBriefKey('v4', DAY)]: failed, [crossBriefKey('v3', DAY)]: v3bad }), [DAY]);
        const p3 = toServedPayload(sel3!);
        assert.equal(p3.source, 'v3');
        assert.ok(Array.isArray(p3.v4Rejected) && p3.v4Rejected.length > 0);
        assert.equal(p3.structured.outlook.keyLevels.some((k: any) => k.value === '7,750'), false);
        assert.equal('generatedBy' in p3, false);
    });

    await t('읽기는 날짜마다 v4·v3 를 함께(왕복 한 번) — v4 가 통과하면 v2 는 읽지 않는다', async () => {
        const calls: string[] = [];
        const store: Record<string, any> = { [crossBriefKey('v4', DAY)]: v4Stored() };
        const sel = await selectServedBrief(async (k) => { calls.push(k); return k in store ? clone(store[k]) : null; }, [DAY, PREV]);
        assert.equal(sel?.source, 'v4');
        assert.deepEqual(calls.sort(), [crossBriefKey('v3', DAY), crossBriefKey('v4', DAY)].sort());
    });

    console.log(`\n${n} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
