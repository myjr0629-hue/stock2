/** 10232306: REG 정체 현물 fallback·같은 주어의 지수 근거·반올림 0 부호. 외부 I/O 없음. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import Module from 'node:module';
import ts from 'typescript';
import { buildMarketIndexBasis, guardianCashChange } from '@/lib/marketIndexBasis';
import { deriveLocaleParts, type GuardianCore } from '@/services/guardian/guardianCore';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, tacticalIndexReasons } from '@/lib/ai/tacticalPrompt';
import { INDEX_NAMES, type IndexFact } from '@/lib/ai/tacticalIndexFacts';

const locales = ['ko', 'en', 'ja'] as const;
// origin/main 구현 자체와 비교해 0 부호를 포함한 모든 화면 문구·판정을 확인한다.
const filename = require.resolve('@/services/guardian/guardianCore');
const baseline = new Module(filename, module);
baseline.filename = filename;
baseline.paths = module.paths;
(baseline as any)._compile(ts.transpileModule(execFileSync('git', ['show', 'origin/main:src/services/guardian/guardianCore.ts'], { encoding: 'utf8' }), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const deriveBaseline: typeof deriveLocaleParts = baseline.exports.deriveLocaleParts;
const quote = (marketTime: string) => ({ symbol: '^IXIC', price: 26008.86, changePct: -2.6, marketTime, source: 'YAHOO' });
const stale = buildMarketIndexBasis({ nasdaq: quote('2026-10-23T13:30:00Z') }, Date.parse('2026-10-23T19:00:00Z'));
assert.equal(stale.cash.nasdaq.live, false);
assert.equal(stale.cash.nasdaq.changePct, -2.6, '원관측은 보존');
assert.equal(guardianCashChange({ indexBasis: stale }, 'REG'), null, '15:00 ET에 09:30 현물을 현재 판정으로 쓰지 않음');
const core = (session: string, nqChangePercent: number | undefined, score = 29): GuardianCore => ({
    session, market: { nqChangePercent, indexBasis: stale },
    rlsi: { score, session, level: 'NEUTRAL' }, sectors: [], vectors: [], targetId: null,
    rvol: { ndx: { status: 'CLOSED' } }, rotationIntensity: { direction: 'RISK_OFF', conviction: 'HIGH' },
} as unknown as GuardianCore);
for (const locale of locales) for (const fallback of [0.4, -0.6, 0, undefined]) for (const score of [29, 65]) for (const direction of ['RISK_OFF', 'RISK_ON'] as const) {
    const input = core('REG', fallback, score);
    input.rotationIntensity.direction = direction;
    assert.deepEqual(deriveLocaleParts(input, locale), deriveBaseline(input, locale), '정체 현물은 origin/main의 판정·화면 문구·체크리스트와 동일');
    const checklist = deriveLocaleParts(input, locale).tripleA.checklist.conditions.find(c => c.id === 'nasdaq')!;
    assert.equal(checklist.current, `${fallback && fallback > 0 ? '+' : ''}${(fallback || 0).toFixed(2)}%`);
}
const fresh = buildMarketIndexBasis({ nasdaq: quote('2026-10-23T18:59:00Z') }, Date.parse('2026-10-23T19:00:00Z'));
assert.equal(guardianCashChange({ indexBasis: fresh }, 'REG'), -2.6);
assert.equal(deriveLocaleParts({ ...core('REG', 0.4), market: { ...core('REG', 0.4).market, indexBasis: fresh } }, 'en').tripleA.regime, 'BEAR');
for (const session of ['PRE', 'POST', 'CLOSED']) {
    const closed = buildMarketIndexBasis({ nasdaq: quote('2026-10-23T19:59:00Z') }, Date.parse('2026-10-23T21:00:00Z'));
    assert.equal(closed.cash.nasdaq.live, false);
    assert.equal(guardianCashChange({ indexBasis: closed }, session), -2.6, '장외 완료 세션 종가 유지');
    assert.equal(deriveLocaleParts({ ...core(session, 0.4), market: { ...core(session, 0.4).market, indexBasis: closed } }, 'en').tripleA.checklist.conditions[1].current, '-2.60%');
}

const context = { rlsiScore: 31, nasdaqChange: null, vix: 19.6, us10y: 2.6,
    session: 'REG' as const, asOf: '2026-10-23T19:00:00Z', indexFacts: [] as IndexFact[] };
const tail = {
    ko: '시장 전체를 움직인 재료는 미확인입니다. 시장 건강도(RLSI)는 약하고 옵션 포지션(GEX)은 중립입니다. 다음 분기점은 미확인입니다.',
    en: 'The market driver is unconfirmed. Market health (RLSI) is weak and options positioning (GEX) is neutral. The next test is unconfirmed.',
    ja: '相場全体の材料は未確認です。市場の健全度(RLSI)は弱くオプション(GEX)は中立です。次の分岐点は未確認です。',
};
const missing = {
    ko: '나스닥 종합 현물 관측은 미확인입니다.', en: 'Nasdaq Composite spot observations are unavailable.', ja: 'ナスダック総合の現物観測は未確認です。',
};
const unsupported = {
    ko: '나스닥 종합은 2.6% 상승 중이며 선물 관측은 미확인입니다.',
    en: 'Nasdaq Composite is up 2.6%, while futures observations are unavailable.',
    ja: 'ナスダック総合は2.6%上昇中で先物観測は未確認です。',
};
for (const locale of locales) {
    const prompt = buildTacticalPrompt(context, locale);
    assert.deepEqual(checkTacticalOutput(`${missing[locale]} ${tail[locale]}`, locale, prompt), []);
    assert.ok(checkTacticalOutput(`${unsupported[locale]} ${tail[locale]}`, locale, prompt).includes('tactical:index-unavailable'), '금리 2.6이 지수 근거가 되지 않음');
    assert.deepEqual(checkTacticalStored(`${unsupported[locale]} ${tail[locale]}`, prompt), [], '복구는 기존 검사+내부 출처명만 유지');
}
const fact: IndexFact = { id: 'nasdaq', kind: 'spot', name: INDEX_NAMES.nasdaq, chgPct: -2.6,
    basis: { ko: '전일 종가 대비', en: 'vs prior close', ja: '前日終値比' }, sessionDate: '2026-10-23', asOfET: '2026-10-23 15:00 ET' };
const prompt = (change = -2.6, locale: typeof locales[number] = 'en') => buildTacticalPrompt({ ...context, indexFacts: [{ ...fact, chgPct: change }] }, locale);
for (const first of [
    'Nasdaq Composite is down, with Treasury yields at 2.6%.',
    'Nasdaq Composite is down while Treasury yields are at 2.6%.',
    'Nasdaq Composite is down; Treasury yields stand at 2.6%.',
    'Nasdaq Composite is down and Treasury yields are at 2.6%.',
    'Nasdaq Composite observations are unavailable, while Treasury yields are at 2.6%.',
    '나스닥 종합은 하락 중이며 금리는 2.6%입니다.',
    'ナスダック総合は下落中で利回りは2.6%です。',
]) assert.ok(tacticalIndexReasons(first, prompt()).includes('tactical:index-change-required'), first);
assert.deepEqual(tacticalIndexReasons('Nasdaq Composite is down 2.6%, with yields moving higher.', prompt()), [], '다른 절의 방향어도 무시');
assert.ok(tacticalIndexReasons('Nasdaq Composite is up 2.6%, with yields moving lower.', prompt()).includes('tactical:index-direction'));

for (const change of [-0.004, 0, 0.004]) for (const locale of locales) for (const sign of ['', '+', '-', '−']) {
    const first = { ko: `나스닥 종합은 보합(${sign}0.0%)입니다.`, en: `Nasdaq Composite is flat (${sign}0.0%).`, ja: `ナスダック総合は横ばい(${sign}0.0%)です。` }[locale];
    assert.deepEqual(checkTacticalOutput(`${first} ${tail[locale]}`, locale, prompt(change, locale)), [], `${change}/${locale}/${sign}`);
    assert.deepEqual(tacticalIndexReasons(missing[locale].replace(/현물 관측은 미확인|spot observations are unavailable|の現物観測は未確認/, { ko: '보합', en: 'is flat', ja: 'は横ばい' }[locale]), prompt(change, locale)), []);
}
for (const [change, sign] of [[-0.06, '+'], [0.06, '-']] as const) {
    assert.ok(tacticalIndexReasons(`Nasdaq Composite is flat (${sign}0.1%).`, prompt(change)).includes('tactical:index-direction'), '0.0 밖에서는 부호 대조 유지');
}
assert.ok(tacticalIndexReasons('Nasdaq Composite is flat (+0.1%).', prompt(-0.004)).includes('tactical:index-value'));
assert.ok(tacticalIndexReasons('Nasdaq Composite is flat (+0.004%).', prompt(-0.004)).includes('tactical:index-direction'), '0이 아닌 정밀 표시는 부호 대조 유지');
console.log('통과 10232306 P2 3건: REG 기존 판정·문구 복귀, 지수 근거 주어 범위, 3언어 반올림 보합');
