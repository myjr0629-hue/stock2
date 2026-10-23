/** 10232208: 복구는 버전·현재 INDEX_FACTS와 무관, 공유 숫자는 origin/main과 동일. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, tacticalTokenRules } from '@/lib/ai/tacticalPrompt';
import { guardianNumsFromMarket, guardianNumbersGate, fillGuardianTokens } from '@/lib/ai/guardianNumbers';
import { INDEX_NAMES, type IndexFact } from '@/lib/ai/tacticalIndexFacts';

const store = new Map<string, any>();
const archives = new Map<string, any>();
let writes = 0, calls = 0;
let clock = Date.parse('2026-10-23T14:00:00Z');
const mock = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
mock('@upstash/redis', { Redis: class {
    async get(key: string) { return store.get(key) ?? null; }
    async set() { writes++; }
} });
mock('../src/lib/sessionArchive', {
    readSessionArchive: async (_: string, scope: string) => archives.get(scope) ?? null,
    saveSessionArchive: async () => { writes++; return false; },
});
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
const actualNow = Date.now;
const fact: IndexFact = { id: 'nasdaq', kind: 'spot', name: INDEX_NAMES.nasdaq,
    basis: { ko: '전일 종가 대비', en: 'vs prior close', ja: '前日終値比' },
    asOfET: '2026-10-23 10:00 ET', sessionDate: '2026-10-23', chgPct: -0.5 };
const first = {
    ko: '10/22 정규장에서 나스닥 종합은 2.6% 하락했습니다.',
    en: 'In the 10/22 cash session Nasdaq Composite fell 2.6%.',
    ja: '10/22の通常取引でナスダック総合は2.6%下落しました。',
};
const tail = {
    ko: '시장 전체를 움직인 재료는 미확인입니다. 시장 건강도(RLSI)는 약하고 옵션 포지션(GEX)은 중립입니다. 다음 분기점은 미확인입니다.',
    en: 'The market driver is unconfirmed. Market health (RLSI) is weak and options positioning (GEX) is neutral. The next test is unconfirmed.',
    ja: '相場全体の材料は未確認です。市場の健全度(RLSI)は弱くオプション(GEX)は中立です。次の分岐点は未確認です。',
};
const market = { nqChangePercent: -0.4, factors: { spx: { chgPct: -0.2 } },
    indexBasis: { cash: { nasdaq: { changePct: -0.6 }, spx: { changePct: -0.8 } } } };
const nums = { ...guardianNumsFromMarket(market, 31), VIX: 19.6, GEX: 13 };
const prompts = (locale: 'ko' | 'en' | 'ja') => buildTacticalPrompt({
    rlsiScore: 31, nasdaqChange: -0.4, vix: 19.6, asOf: new Date(clock).toISOString(),
    session: 'REG', indexFacts: [fact],
}, locale);

async function main() {
    const baseline = execFileSync('git', ['show', 'origin/main:src/lib/ai/guardianNumbers.ts']);
    assert.deepEqual(readFileSync('src/lib/ai/guardianNumbers.ts'), baseline, '공유 파일 바이트 동일');
    assert.equal(nums.NDX_CHG, -0.4);
    assert.equal(nums.SPX_CHG, -0.2);
    // rotation/gamma/v2 reality 모두 원래 선물 값. 현물 -0.6/-0.8이 채워지면 실패한다.
    for (const type of ['rotation', 'gamma', 'reality']) {
        const template = 'Nasdaq 100 futures {NDX_CHG}; S&P500 futures {SPX_CHG}.';
        const filled = guardianNumbersGate(template, nums, { NDX_CHG: -0.4, SPX_CHG: -0.2 });
        assert.ok(filled.ok, type);
        assert.equal(filled.text, 'Nasdaq 100 futures -0.40%; S&P500 futures -0.20%.');
    }
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async () => { calls++; throw new Error('offline model failure'); });
    // 다음 날 지수값·방향·세션·날짜가 바뀌어도 각 복구 출구는 같은 글을 표시한다.
    for (const locale of ['ko', 'en', 'ja'] as const)
        for (const source of ['v3', 'v2', 'archive-v3', 'archive-v2', 'verdict', 'previous'] as const)
            for (const marked of [false, true]) for (const offHours of [false, true]) {
                _resetInsightStateForTest(); store.clear(); archives.clear(); writes = calls = 0;
                clock = Date.parse(offHours ? '2026-10-24T01:00:00Z' : '2026-10-23T14:00:00Z');
                const text = `${first[locale]} ${tail[locale]}`;
                const basis = marked ? { NDX_CHG: -0.4, RLSI: 31, VIX: 19.6, contractVersion: 2 } : null;
                const saved = { text, basis, session: 'POST', updatedAt: '2026-10-22T21:00:00Z' };
                assert.ok(checkTacticalOutput(text, locale, prompts(locale)).includes('tactical:index-value'));
                assert.deepEqual(checkTacticalStored(text, prompts(locale)), []);
                if (source === 'v3' || source === 'v2') store.set(`guardian:gemini:${source}:reality:${locale}`, saved);
                if (source.startsWith('archive')) archives.set(`${source === 'archive-v3' ? 'reality_v3' : 'reality'}_${locale}`, { value: saved, stamp: { observedAt: Date.parse(saved.updatedAt) } });
                let shown: string | undefined;
                if (source === 'verdict') shown = (await N.repairVerdictTexts({ realityInsight: text, num: { basis: { realityInsight: basis } } }, locale, 'next-day-verdict', nums, prompts)).verdict.realityInsight;
                else if (source === 'previous') shown = N.keepRealTextOverPlaceholders({ realityInsight: '[진단] 최신 시장 분석을 준비하고 있습니다\n[결론] 잠시 후 자동으로 갱신됩니다' }, { realityInsight: text }, locale, nums, prompts).realityInsight;
                else shown = await N.generateRealityInsight({ rlsiScore: 31, nasdaqChange: -0.4, vix: 19.6, gexIndex: 13, vectors: [], locale, indexFacts: [fact] });
                assert.equal(shown, text, `${locale}/${source}/${marked}/${offHours}`);
                assert.equal(writes, 0, '복구본 재저장 없음');
                if (offHours || source === 'verdict' || source === 'previous') assert.equal(calls, 0);
            }
    // v2에 버전/자리표가 없고 부호 없는 선물 수치만 verdict에 남아도 오분류 없음.
    const unsigned = `Nasdaq 100 futures fell 0.4%. ${tail.en}`;
    const restored = await N.repairVerdictTexts({ realityInsight: unsigned }, 'en', 'unsigned-v2-verdict', nums, prompts);
    assert.deepEqual(restored.repaired, []);
    assert.equal(restored.verdict.realityInsight, unsigned);
    const partialTemplate = `Nasdaq 100 futures {NDX_CHG}. ${tail.en}`;
    const partial = await N.repairVerdictTexts({ realityInsight: partialTemplate, num: { tpl: { realityInsight: partialTemplate }, basis: { realityInsight: { RLSI: 31 } } } }, 'en', 'partial-basis', nums, prompts);
    assert.deepEqual(partial.repaired, []);
    assert.equal(partial.verdict.realityInsight, partialTemplate.replace('{NDX_CHG}', '-0.40%'));
    // 내부 출처명 및 기존 NEXT 일정 검사는 복구에서도 계속 차단한다.
    for (const label of ['NEWS PULSE', 'Polygon', 'FMP', 'TODAY_NEWS']) assert.ok(checkTacticalStored(`${first.en} ${label}. ${tail.en}`, prompts('en')).includes('tactical:internal-source'));
    assert.ok(checkTacticalStored(`${first.en} CPI is scheduled for 10/23 (Fri) 08:30 ET.`, prompts('en')).some(r => r.startsWith('schedule:')), '기존 일정 주장 검사 유지');
    assert.equal(fillGuardianTokens('Nasdaq {NDX_CHG}', {}).ok, false);
    // 옮긴 자리표 규칙은 r6와 바이트 동일하다.
    const ModuleClass = require('node:module');
    const filename = require.resolve('../src/lib/ai/guardianNumbers');
    const old = new ModuleClass(filename, module);
    old.filename = filename; old.paths = ModuleClass._nodeModulePaths(require('node:path').dirname(filename));
    old._compile(require('typescript').transpileModule(execFileSync('git', ['show', 'c5fa980b4:src/lib/ai/guardianNumbers.ts'], { encoding: 'utf8' }), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, filename);
    for (const locale of ['ko', 'en', 'ja'] as const) for (const input of [nums, {}, { NDX_CHG: -0.4 }]) assert.equal(tacticalTokenRules(locale, input), old.exports.guardianTokenRules(locale, input, 'tactical'));
    const fixture = JSON.parse(readFileSync('tests/fixtures/tactical-v3/r6-outputs.json', 'utf8'));
    assert.equal(fixture.outputs.length, 27);
    for (const row of fixture.outputs) assert.deepEqual(checkTacticalOutput(row.text, row.locale, buildTacticalPrompt(fixture.contexts[row.session], row.locale)), [], `r6 ${row.session}/${row.locale}/${row.repeat}`);
    console.log('통과 10232208: 72 복구 조합·무표식 v2 verdict·공유 선물 숫자·r6 27/27·생성 자리표 규칙 바이트 보존');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
    Date.now = actualNow; _setMarketClockForTest(null); _setModelCallerForTest(null); _resetInsightStateForTest();
});
