/**
 * 순환매 v3(verdict.description) — 10/24 운영 결함 4개의 회귀 시험 + 저장본·장외 경로 계약.
 *   ① 숫자 충돌: 지수는 Tactical 과 같은 INDEX_FACTS 값만(«나스닥 +0.11%» = 선물 정산 대비 → 탈락)
 *   ② 내부 라벨·[현황] 태그 노출 금지 ③ 퍼센트 소수 1자리 ④ 4문장(무엇이→왜→그래서→다음)
 *   저장본: 옛 계약 글(레이블)은 옛 숫자 대조 그대로, v3 글은 지수·자산 등락률을 공유 NDX_CHG(선물)와 대조하지 않는다(정상 글 → «준비 중» 방지).
 *   장외: 옛 글이면 v3 저장본으로 교체, 없으면 잠금 1회 백그라운드 생성(실패 시 옛 글 유지).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { buildTacticalPrompt } from '@/lib/ai/tacticalPrompt';
import { buildRotationPrompt, checkRotationOutput, rotationFactsFrom, rotationIndexReasons, rotationLabelReasons, isLegacyRotationText, rotationNums, rotationTokenRules } from '@/lib/ai/rotationPrompt';
import { guardianNumsFromAiContext } from '@/lib/ai/guardianNumbers';

const store = new Map<string, any>();
let nxCalls = 0;
const mock = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
mock('@upstash/redis', { Redis: class {
    async get(key: string) { return store.get(key) ?? null; }
    async set(key: string, value: string, opts?: { nx?: boolean }) {
        if (opts?.nx) { nxCalls++; if (store.has(key)) return null; }
        store.set(key, typeof value === 'string' ? JSON.parse(value.startsWith('{') ? value : JSON.stringify(value)) : value);
        return 'OK';
    }
} });
mock('../src/lib/sessionArchive', { readSessionArchive: async () => null, saveSessionArchive: async () => false });
const { IntelligenceNode: N, _rotationCompareHooks: H, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
const { contextFromCore } = require('../scripts/rotation-v3-compare.cjs');

const core = (s: string) => JSON.parse(readFileSync(`tests/fixtures/rotation-v3/${s}.json`, 'utf8'));
const POST = core('POST');
const ts = Date.parse(POST.timestamp);
const ctx = H.rotationCurrent(contextFromCore(POST, 'ko'), ts);
const prompt = (l: 'ko' | 'en' | 'ja') => H.rotationPromptFor(ctx, l);
const nums = guardianNumsFromAiContext(ctx);

// 운영 실모델 출력(10/24 비교, POST 입력 · 새 계약 통과분) — 형식 회귀 기준
const GOOD = {
    ko: '10/23(금) 정규장에서 나스닥 종합이 -0.2%, S&P500이 -0.5% 내린 가운데, 지난 5거래일 섹터 자금은 AI 전력망 -7.9%·커뮤니케이션(XLC) -4.2%에서 빠져 사이버보안(HACK) +11.6%·유틸리티(XLU) +2.9%로 옮겨 갔고, 최근 몇 주 중 가장 강한 흐름으로 매일 일관되게 이어지고 있습니다. 10/23(금) 17:49 ET 보도된 AI 투자 우려와 메타의 400억 달러 자금 조달 계획과 맞물려 성장주 자금이 방어주로 옮겨 간 것으로 읽힙니다. 투자자들이 방어에 무게를 두고 성장주 주도력이 약해지는 국면으로, 커뮤니케이션(XLC)은 가격이 내렸는데도 기관 수급 점수(IFS 23)가 플러스라 기관 자금이 들어오고 있지만 시장 건강도(RLSI 29)는 약해 반등을 받칠 힘이 부족합니다. 다음 분기점은 사이버보안(HACK)이 5일 기준 유입을 이어 가는지로, 이어 가면 방어 선호가 굳어지고 멈추면 성장주 회귀 신호입니다.',
    en: 'While the Nasdaq Composite fell 0.2% and the S&P 500 fell 0.5% in the 10/23 (Fri) cash session, over the past five trading days sector money left AI Power Grid -7.9% and Communication Services (XLC) -4.2% for Cybersecurity (HACK) +11.6% and Utilities (XLU) +2.9%, one of the strongest rotations of recent weeks and consistent day after day. A 10/23 (Fri) 17:49 ET report on AI investment jitters and Meta\'s $40 billion capital raise lines up with the shift from growth into defensive sectors. Investors are bracing defensively as growth leadership thins: Communication Services (XLC) fell yet its institutional flow score (IFS 23) stayed positive, so institutional money is flowing in on weakness, while weak market health (RLSI 29) leaves little support for a rebound. The next test is whether Cybersecurity (HACK) keeps drawing inflows on a five-day basis: continued inflows would lock in the defensive tilt, while a stall would signal a return to growth.',
    ja: '10/23(金)の通常取引でナスダック総合が-0.2%、S&P500が-0.5%下落する中、過去5営業日のセクター資金はAI電力網-7.9%・コミュニケーション(XLC)-4.2%から抜け、サイバーセキュリティ(HACK)+11.6%・公益事業(XLU)+2.9%へ移り、最近数週間で最も強い流れで毎日一貫して進んでいます。10/23(金) 17:49 ET の報道でAI投資への懸念とメタの400億ドル調達計画が伝わり、成長株の資金が防御株へ向かったと読めます。投資家が守りを固め成長株の主導力が弱まっている局面で、コミュニケーション(XLC)は価格が下がったのに機関需給スコア(IFS 23)がプラスで機関資金が流入していますが、市場の健全度(RLSI 29)は弱く反発を支える力が乏しい状況です。次の分岐点はサイバーセキュリティ(HACK)が5日ベースの流入を続けるかで、続けば防御選好が定着し、止まれば成長株回帰の兆しです。',
};
// 10/24 07:24 KST 운영 화면 글(옛 계약) — 숫자 충돌·라벨·자릿수
const LEGACY_KO = '[현황] 5일 기준 기술주(SMH·XLK)는 각각 -4.9%·-1.408% 하락했으나 사이버보안은 +10.0% 유입되며 방어 섹터(부동산 +2.0%, 유틸리티 +2.0%)로 자금이 이동했고, 나스닥 +0.11% 상승과 S&P 500 -0.42% 하락이 엇갈리는 가운데 유가 급등(WTI +3.99%)과 공포탐욕지수 21(극단적 공포)이 배경이다.\n[해석] 당일 SMH·XLK의 반등은 5일 하락 추세 속의 일시적 반등으로 해석되며, 레짐 RISK_OFF_DEFENSE와 확신도 HIGH에 비추어 겉은 강세, 속은 약세인 혼재 신호다.\n[전망] 방향을 가르는 핵심 변수는 유가 상승이 인플레 우려로 이어지는지 여부다.';

async function main() {
    // ── 재료: 5거래일 등락률은 소수 1자리, 내부 바스켓 id 는 티커로 내보내지 않는다, 가중 점수(flowScore)를 %로 쓰지 않는다
    const facts = rotationFactsFrom(POST.rotationIntensity, POST.sectors, POST.vectors);
    assert.ok(facts.sectors.length >= 4);
    for (const s of facts.sectors) {
        assert.equal(Math.round(s.fiveDayPct * 10) / 10, s.fiveDayPct);
        assert.ok(!s.etf || /^[A-Z]{2,5}$/.test(s.etf));
    }
    assert.equal(facts.sectors.find(s => s.name === 'Cybersecurity')?.fiveDayPct, 11.6, '사이버보안 = 누적 11.613% (flowScore 10.02 가 아니다)');
    assert.equal(facts.sectors.find(s => s.name === 'AI Power Grid')?.etf, undefined);

    // ── 프롬프트: Tactical 과 같은 INDEX_FACTS, 내부 등급은 쉬운 말, 독자 언어 섹터 이름
    for (const l of ['ko', 'en', 'ja'] as const) {
        const p = prompt(l);
        const tactical = buildTacticalPrompt({ ...ctx, marketNewsHeadlines: [] }, l);
        assert.equal(p.match(/^INDEX_FACTS: (.*)$/m)?.[1], tactical.match(/^INDEX_FACTS: (.*)$/m)?.[1], `${l} INDEX_FACTS = Tactical`);
        const data = p.slice(p.indexOf('SESSION:'));
        assert.ok(!/RISK_OFF_DEFENSE|"HIGH"|flowScore|-1\.408|10\.02/.test(data), `${l} 데이터에 날것 없음`);
        assert.ok(p.includes('entirely in'));
        if (l === 'ko') assert.ok(data.includes('"local":"사이버보안"'));
        if (l === 'ja') assert.ok(data.includes('"local":"サイバーセキュリティ"') && !/[가-힣]/.test(data));
        if (l === 'en') assert.ok(!/"local"/.test(data));
    }
    const rules = rotationTokenRules('ko', { ...nums, NDX_CHG: 0.1, OIL_CHG: 4 });
    assert.ok(rules.includes('never use {NDX_CHG}') && !rules.includes('{OIL_CHG}') && !rules.includes('나스닥 변동률'), '지수·자산 등락률 자리표 없음');
    assert.deepEqual(Object.keys(rotationNums({ NDX_CHG: 1, SPX_CHG: 1, OIL_CHG: 1, US10Y: 5, RLSI: 30, VIX: 19 }) || {}).sort(), ['RLSI', 'VIX']);

    // ── 새 생성 검사: 실모델 통과 글은 통과, 옛 화면 글은 ①②③④ 모두 탈락
    for (const l of ['ko', 'en', 'ja'] as const) assert.deepEqual(checkRotationOutput(GOOD[l], l, prompt(l)), [], `GOOD ${l}`);
    const bad = checkRotationOutput(LEGACY_KO, 'ko', prompt('ko'));
    for (const r of ['rotation:label', 'rotation:internal-code', 'rotation:index-value', 'rotation:decimals', 'rotation:four-sentences']) assert.ok(bad.includes(r), `${r} ∈ ${bad.join(',')}`);
    assert.ok(rotationLabelReasons('현황: 섹터 자금이 이동했습니다.').includes('rotation:label'));
    assert.deepEqual(rotationLabelReasons('Money moved into a mixed set of high-quality defensives.'), [], '평범한 영어 낱말(mixed·high)은 등급어가 아니다');
    // 숫자 충돌: 선물 값을 «나스닥»으로 · 방향 반대 · 현물 날짜 누락
    assert.ok(rotationIndexReasons('나스닥 +0.1% 상승과 섹터 이동이 엇갈립니다.', prompt('ko')).includes('rotation:index-value'));
    assert.ok(rotationIndexReasons('10/23(금) 정규장에서 나스닥 종합이 0.2% 오른 가운데 자금이 이동했습니다.', prompt('ko')).includes('rotation:index-direction'));
    assert.ok(rotationIndexReasons('나스닥 종합이 -0.2%, S&P500이 -0.5% 내린 가운데 자금이 이동했습니다.', prompt('ko')).includes('rotation:cash-session-date'));
    assert.ok(rotationIndexReasons('Nasdaq 100 futures rose 0.1% while money rotated.', prompt('en')).includes('rotation:index-unavailable'), '장외(POST)에 선물 관측 없음');
    assert.deepEqual(rotationIndexReasons('나스닥 종합이 내린 가운데 자금이 이동했습니다.', prompt('ko')), [], '숫자 없는 지수 언급은 대조하지 않는다');
    assert.ok(checkRotationOutput(GOOD.ko.replace('AI 전력망 -7.9%', 'AI 전력망(SMCI) -7.9%'), 'ko', prompt('ko')).some(r => r.startsWith('rotation:unknown-name')));
    assert.ok(checkRotationOutput(GOOD.ko.replace('10/23(금) 17:49 ET 보도된', '10/23(금) 17:50 ET 보도된'), 'ko', prompt('ko')).includes('rotation:news-source-time-required'));
    assert.ok(isLegacyRotationText(LEGACY_KO) && !isLegacyRotationText(GOOD.ko));

    // ── 출구(gateText) — 새 생성은 v3 검사, 저장본 v3 글은 공유 선물 NDX_CHG 와 대조하지 않는다(현물 −0.2% vs 선물 +0.11%)
    const futNums = { ...nums, NDX_CHG: 0.113, SPX_CHG: -0.415 };
    for (const l of ['ko', 'en', 'ja'] as const) {
        const gen = H.gateText('rotation', H.tokenizeInsight('rotation', GOOD[l], futNums), l, futNums, futNums, true, prompt(l));
        assert.deepEqual(gen.reasons, [], `생성 ${l}`);
        const stored = H.gateText('rotation', gen.tpl, l, futNums, futNums);
        assert.ok(stored.ok, `저장본 ${l}: ${stored.reasons.join(',')}`);
        assert.ok(!gen.tpl.includes('{NDX_CHG}') && !gen.tpl.includes('{SPX_CHG}'), '지수는 자리표로 바꾸지 않는다');
        // 화면(MobileGuardianFlow.extractReportSections 레이블 없음 경로)과 같은 분리 — 4문장 → 상태·해석·전망 3칸(일본어 «。» 뒤 공백 없음 포함, 관문 10240834)
        const parts = stored.text.replace(/\*\*/g, '').trim().split(/(?<=[.!?。])\s+/).filter(Boolean);
        assert.equal(parts.length, 4, `${l} 화면 문장 4개: ${parts.length}`);
        assert.equal(H.gateText('rotation', stored.text, l, futNums, futNums).text, stored.text, '다듬기는 다시 해도 그대로');
    }
    // 옛 계약 글은 옛 대조 그대로 — 박힌 «나스닥 +0.11%»가 지금 값(+0.98%)과 다르면 탈락(기존 guardianNumbers 시험과 같은 계약)
    assert.ok(!H.gateText('rotation', LEGACY_KO, 'ko', { ...futNums, NDX_CHG: 0.98 }, null).ok);
    assert.ok(H.gateText('rotation', LEGACY_KO, 'ko', futNums, null).reasons.every(r => !r.startsWith('rotation:')), '저장본에는 새 검사를 걸지 않는다');

    // ── 장외 승격: 저장본 있으면 교체 · 없으면 잠금 1회 + 백그라운드 생성(실패 → 옛 글 유지) · 장중·v3 글은 무변경
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    const weekend = Date.parse('2026-10-24T14:00:00Z');
    _setMarketClockForTest(() => new Date(weekend));
    let calls = 0, scheduled = 0;
    _setModelCallerForTest(async () => { calls++; throw new Error('offline model failure'); });
    _resetInsightStateForTest(); store.clear();
    const legacyVerdict = { title: 'TACTICAL INSIGHT', sentiment: 'NEUTRAL', description: LEGACY_KO };
    const jobs: Array<() => Promise<void>> = [];
    const up1 = await N.offHoursRotationUpgrade(legacyVerdict, 'ko', futNums, () => ctx, (job) => { scheduled++; jobs.push(job); return true; });
    assert.equal(up1, null);
    assert.equal(scheduled, 1, '잠금을 잡고 1회 예약');
    const up2 = await N.offHoursRotationUpgrade(legacyVerdict, 'ko', futNums, () => ctx, () => { scheduled++; return true; });
    assert.equal(up2, null);
    assert.equal(scheduled, 1, '잠금 중 재예약 없음');
    await jobs[0]();
    assert.ok(calls >= 1, '예약 작업이 3개 언어 생성 호출');
    assert.equal(store.get('guardian:gemini:v3:rotation:ko'), undefined, '모델 실패 → 저장 없음(옛 글 유지)');
    // 다른 인스턴스가 만든 v3 저장본이 있으면 교체
    const tpl = H.gateText('rotation', H.tokenizeInsight('rotation', GOOD.ko, futNums), 'ko', futNums, futNums, true, prompt('ko')).tpl;
    store.set('guardian:gemini:v3:rotation:ko', { text: tpl, basis: futNums, updatedAt: new Date(weekend).toISOString() });
    const up3 = await N.offHoursRotationUpgrade(legacyVerdict, 'ko', futNums, () => ctx, () => true);
    assert.ok(up3 && !isLegacyRotationText(up3.description) && up3.description.includes('나스닥 종합이 -0.2%'), up3?.description);
    assert.equal(await N.offHoursRotationUpgrade({ ...legacyVerdict, description: GOOD.ko }, 'ko', futNums, () => ctx, () => true), null, 'v3 글은 그대로');
    _setMarketClockForTest(() => new Date('2026-10-23T15:00:00Z'));
    assert.equal(await N.offHoursRotationUpgrade(legacyVerdict, 'ko', futNums, () => ctx, () => true), null, '장중은 정상 생성 경로가 맡는다');
    // 저장된 판정 출구(repairVerdictTexts)도 v3 글을 그대로 둔다(«준비 중» 아님)
    _setMarketClockForTest(() => new Date(weekend));
    const rep = await N.repairVerdictTexts({ title: 'T', sentiment: 'NEUTRAL', description: up3!.description, num: up3!.num }, 'ko', 'test', futNums);
    assert.deepEqual(rep.repaired, []);
    assert.equal(rep.verdict.description, up3!.description);
    console.log('통과 rotationV3: 재료·프롬프트(INDEX_FACTS=Tactical)·새 검사(옛 글 ①②③④ 탈락)·저장본 선물 대조 제외·장외 승격(잠금 1회·실패 시 유지·교체)');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
    _setMarketClockForTest(null); _setModelCallerForTest(null); _resetInsightStateForTest();
});
