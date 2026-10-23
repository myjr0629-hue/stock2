import assert from 'node:assert/strict';
import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { buildIndexFacts, tacticalSessionAt } from '@/lib/ai/tacticalIndexFacts';
import { filterMarketHeadlines } from '@/lib/ai/tacticalNews';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, tacticalIndexReasons, tacticalEventTime } from '@/lib/ai/tacticalPrompt';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const quote = (symbol: string, changePct: number, marketTime: string) => ({ symbol, price: 100, changePct, marketTime, lastChangeAt: marketTime, source: 'YAHOO' });
const preAt = Date.parse('2026-10-23T09:58:00Z');
const pre = buildMarketIndexBasis({ nasdaq: quote('^IXIC', -1.2, '2026-10-22T19:59:00Z'), spx: quote('^GSPC', -0.6, '2026-10-22T19:59:00Z'), nq: quote('NQ=F', 0.1, '2026-10-23T09:57:00Z'), es: quote('ES=F', 0.1, '2026-10-23T09:57:00Z') }, preAt);
const facts = buildIndexFacts(pre, 'PRE', preAt);
assert.deepEqual(facts.map(f => f.id), ['nq', 'es', 'nasdaq', 'spx']);
assert.match(facts[0].basis.ko, /정산/);
assert.equal(facts[2].sessionDate, '2026-10-22');
assert.equal(facts[0].asOfET, '2026-10-23 05:57 ET');
const regAt = Date.parse('2026-10-23T15:00:00Z');
const reg = buildMarketIndexBasis({ nasdaq: quote('^IXIC', -0.4, '2026-10-23T14:59:00Z'), spx: quote('^GSPC', -0.2, '2026-10-23T14:59:00Z'), nq: quote('NQ=F', 0.1, '2026-10-23T14:59:00Z') }, regAt);
assert.deepEqual(buildIndexFacts(reg, 'REG', regAt).map(f => f.id), ['nasdaq', 'spx', 'nq']);
assert.equal(buildIndexFacts(reg, 'REG', regAt + 30 * 60_000).length, 0, '캐시 live:true도 시각으로 재검사');
assert.equal(buildIndexFacts(pre, 'REG', regAt).length, 0, '낡은 현물/선물은 현재 관측 아님');
const postAt = Date.parse('2026-10-23T20:30:00Z');
const post = buildMarketIndexBasis({ nasdaq: quote('^IXIC', -1.2, '2026-10-23T19:59:00Z'), nq: quote('NQ=F', -0.6, '2026-10-23T20:29:00Z') }, postAt);
assert.deepEqual(buildIndexFacts(post, 'POST', postAt).map(f => f.id), ['nasdaq']);
post.futures.nq.sinceCashClosePct = 0.3;
post.futures.nq.cashCloseReferenceAt = '2026-10-23T20:00:00Z';
assert.equal(buildIndexFacts(post, 'POST', postAt)[1].chgPct, 0.3, '정산 변화 -0.6을 장후 수익률로 쓰지 않음');
assert.deepEqual(buildIndexFacts(undefined, 'PRE', preAt), []);
for (const session of ['PRE', 'REG', 'POST', 'CLOSED'] as const) assert.deepEqual(buildIndexFacts(buildMarketIndexBasis({}, preAt), session, preAt), []);
for (const [iso, expected] of [['2026-10-23T07:59:00Z', 'CLOSED'], ['2026-10-23T08:00:00Z', 'PRE'], ['2026-10-23T13:30:00Z', 'REG'], ['2026-10-23T20:00:00Z', 'POST'], ['2026-10-24T00:00:00Z', 'CLOSED'], ['2026-10-25T12:00:00Z', 'CLOSED']] as const) assert.equal(tacticalSessionAt(Date.parse(iso)), expected);
assert.deepEqual(filterMarketHeadlines(['Volvo Cars shares plunge on weak China sales', 'Smallcap reports disappointing earnings', 'Fed holds interest rates', 'Nvidia earnings lift shares', 'Banking sector earnings improve']), ['Fed holds interest rates', 'Nvidia earnings lift shares', 'Banking sector earnings improve']);
const base = { rlsiScore: 31, nasdaqChange: -1.2, vix: 19.6, gexIndex: 13, gexLevel: 'NEUTRAL', scheduledEvents: [], marketNewsHeadlines: [] };
const prePrompt = buildTacticalPrompt({ ...base, indexBasis: pre, session: 'PRE', asOf: new Date(preAt).toISOString() }, 'ko');
const preFirst = '개장 전 나스닥100 선물은 어제 정규장 마감 대비 0.1% 오른 보합권이고 S&P500 선물도 비슷해, 본장 시작 전 숨 고르기입니다.';
const postFirst = '오늘 정규장에서 나스닥은 1.2% 내렸지만, 마감 뒤 나스닥100 선물은 0.3% 반등해 일부 되돌림이 나오고 있습니다.';
const tail = ' 오늘 시장 전체를 움직인 뚜렷한 재료는 확인되지 않았습니다. 시장 건강도(RLSI)가 31점으로 약해 매수세의 폭이 좁고 옵션 포지션(GEX)은 중립이라 흔들림을 줄이지도 키우지도 않습니다. 다음 분기점은 미확인입니다.';
assert.deepEqual(tacticalIndexReasons(preFirst, prePrompt), []);
assert.deepEqual(checkTacticalOutput(preFirst + tail, 'ko', prePrompt), []);
const postPrompt = buildTacticalPrompt({ ...base, indexBasis: post, session: 'POST', asOf: new Date(postAt).toISOString() }, 'ko');
assert.deepEqual(tacticalIndexReasons(postFirst, postPrompt), []);
assert.deepEqual(checkTacticalOutput(postFirst + tail, 'ko', postPrompt), []);
assert.ok(tacticalIndexReasons(postFirst.replace('반등', '하락'), postPrompt).includes('tactical:index-direction'));
const enPrePrompt = buildTacticalPrompt({ ...base, indexBasis: pre, asOf: new Date(preAt).toISOString() }, 'en');
assert.ok(tacticalIndexReasons('Premarket Nasdaq 100 futures fell 0.1% vs prior settlement.', enPrePrompt).includes('tactical:index-direction'));
assert.deepEqual(tacticalIndexReasons('Premarket Nasdaq 100 futures rose 0.1% vs prior settlement, with narrow support.', enPrePrompt), []);
assert.ok(tacticalIndexReasons(postFirst.replace('1.2%', '0.3%'), postPrompt).includes('tactical:index-value'));
assert.ok(tacticalIndexReasons('지수는 제자리입니다.', prePrompt).includes('tactical:index-name-required'));
assert.ok(tacticalIndexReasons('나스닥은 1.2% 내렸습니다.', postPrompt).includes('tactical:postclose-both-required'));
const onlyFutures = buildTacticalPrompt({ ...base, indexFacts: facts.filter(f => f.kind === 'futures'), session: 'PRE', asOf: new Date(preAt).toISOString() }, 'ko');
assert.ok(tacticalIndexReasons('나스닥은 0.1% 올랐습니다.', onlyFutures).length);
for (const source of ['NEWS PULSE', 'Polygon', 'FMP', 'TODAY_NEWS']) {
    assert.ok(checkTacticalOutput(preFirst + tail.replace('오늘 시장 전체', source + ' 오늘 시장 전체'), 'ko', prePrompt).includes('tactical:internal-source'));
    assert.ok(checkTacticalStored(preFirst + tail.replace('오늘 시장 전체', source + ' 오늘 시장 전체'), prePrompt).includes('tactical:internal-source'));
}
const capture = '지수는 제자리지만 시장 건강도가 약해 흔들림을 받쳐 줄 힘이 부족한 숨 고르기 장입니다. 배경은 10/23(금) 05:39 ET NEWS PULSE 보도로, 볼보 카스 주가 급락 소식이 나왔는데 이는 중국 판매 부진을 짚은 내용이며 이런 실적 우려가 주가를 누르는 흐름과 맞물려 있습니다. 시장 건강도(RLSI) 31점으로 약하고 옵션 포지션(GEX +13)은 중립이라 흔들림을 받쳐 주지도 키우지도 않으며, 변동성 지수(VIX) 19.6으로 경계 수준입니다. 다음 분기점은 10/23(금) 09:45 ET 예정된 S&P 글로벌 종합 PMI로, 경기 지표가 약하면 주식 흔들림이 커지고 강하면 그 압력이 누그러지는 쪽으로 읽힙니다.';
assert.ok(checkTacticalOutput(capture, 'ko', prePrompt).includes('tactical:index-name-required'));
assert.ok(checkTacticalOutput(capture, 'ko', prePrompt).includes('tactical:internal-source'));
for (const [date, time, local] of [['2026-10-31', '09:45', '22:45'], ['2026-11-01', '09:45', '23:45'], ['2026-03-07', '09:45', '23:45'], ['2026-03-08', '09:45', '22:45']] as const) {
    assert.ok(tacticalEventTime(date, time, 'ko')?.endsWith(`(한국 ${local})`));
    assert.ok(tacticalEventTime(date, time, 'ja')?.endsWith(`(日本時間 ${local})`));
    assert.ok(!tacticalEventTime(date, time, 'en')?.includes(local));
}
assert.equal(tacticalEventTime('2026-03-08', '02:30', 'ko'), null);
for (const [locale, first, soWhat, next] of [
    ['ko', preFirst, '시장 건강도(RLSI)가 31점으로 약해 매수세의 폭이 좁고 옵션 포지션(GEX)은 중립이라 흔들림을 줄이지 않습니다.', '다음 분기점은 10/23(금) 09:45 ET(한국 22:45) 예정된 PMI로, 약하면 주식이 흔들리고 강하면 압력이 줄어드는 구조입니다.'],
    ['ja', '取引開始前のナスダック100先物は前回清算値比0.1%上昇です。', '市場の健全度(RLSI)は31点と弱く、オプション(GEX)は中立で揺れを抑えません。', '次の分岐点は10/23(金) 09:45 ET(日本時間 22:45)予定のPMIで、弱ければ株価が揺れ、強ければ圧力が和らぐ構造です。'],
    ['en', 'Premarket Nasdaq 100 futures rose 0.1% vs prior settlement.', 'Market health (RLSI) is weak at 31 and options positioning (GEX) is neutral, leaving swings uncushioned.', 'The next test is PMI scheduled for 10/23 (Fri) 09:45 ET: weak data add pressure, strong data ease it.'],
] as const) {
    const p = buildTacticalPrompt({ ...base, indexBasis: pre, asOf: new Date(preAt).toISOString(), scheduledEvents: ['[economic calendar; 2026-10-23 09:45 ET] PMI (scheduled; not a released result)'] }, locale);
    const why = locale === 'ko' ? '오늘 시장 전체를 움직인 재료는 미확인입니다.' : locale === 'ja' ? '相場全体を動かした材料は未確認です。' : 'The market driver is unconfirmed.';
    const text = [first, why, soWhat, next].join(' ');
    assert.deepEqual(checkTacticalOutput(text, locale, p), [], `${locale}: ${text}`);
    if (locale !== 'en') assert.ok(checkTacticalOutput(text.replace('22:45', '23:45'), locale, p).includes('schedule:local-time'));
}
// 컴포넌트는 origin/main과 라벨 식 4곳 외 바이트 동일.
const components = execFileSync('git', ['-c', 'core.fsmonitor=false', 'diff', '--name-only', 'origin/main', '--', 'src/components', 'src/app/[locale]/intel-guardian/GuardianDesktop.tsx'], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim().split('\n').filter(Boolean);
for (const file of components) {
    const old = execFileSync('git', ['show', `origin/main:${file}`], { encoding: 'utf8' });
    assert.equal(readFileSync(file, 'utf8').replaceAll("{t('lastSessionAnalysis')}", 'Last session analysis'), old, file);
}
console.log('통과 Tactical v3 세션 입력·뉴스 필터·4문장·지수명/방향·출처·DST·3언어·화면 보존');
