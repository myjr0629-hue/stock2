import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as C from '../scripts/lambda-cross-sector/closingReport';
import { closingReportProblems } from '../src/lib/ai/closingReport';
import { lengthProblems, selectServedBrief, buildGenerationGuard, evaluateServedV4, toServedPayload } from '../src/lib/ai/crossBriefServe';
import { sessionCloseMinutes } from '../src/lib/marketCalendar';
import { ClosingNarrative } from '../src/components/intel/ClosingNarrative';
import { closingAiLines } from '../src/lib/push/aiLine';

const DAY = '2026-10-22';
const NOW = new Date('2026-10-22T21:50:00Z');
const quote = (symbol: string, changePct: number) => ({ symbol, price: 100, prevClose: 101, changePct, marketTime: '2026-10-22T20:00:00Z', source: 'YAHOO', isStale: false });
const cash = { spx: C.regularClose(quote('^GSPC', -1.21), '^GSPC', DAY, NOW), nasdaq: C.regularClose(quote('^IXIC', -2.60), '^IXIC', DAY, NOW) };
const news = C.newsEvidence([
    { title: 'Morning release', published_utc: '2026-10-22T12:30:00Z', publisher: { name: 'Source' } },
    { title: 'After-close review', published_utc: '2026-10-22T21:43:00Z' },
    { title: 'Future', published_utc: '2026-10-22T22:00:00Z' },
    { title: 'No time' },
], DAY, NOW);
const tri = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const narrative: any = {
    version: 1,
    verdict: tri('S&P 500 -1.21%, NASDAQ 종합 -2.60%로 성장주 중심 하락.', 'S&P 500 -1.21% and NASDAQ Composite -2.60% closed lower, led by growth stocks.', 'S&P 500 -1.21%、NASDAQ総合 -2.60%で成長株中心に下落。'),
    whatHappened: tri('반도체가 약세를 주도했으며 주도주 낙폭이 시장보다 컸다.', 'Semiconductors led the decline, with leaders falling more than the market.', '半導体が下落を主導し、主力株の下落幅が市場を上回った。'),
    why: tri('2026-10-22 08:30 ET Source 보도는 장중 재료다. 성장주 부담으로 연결된다는 해석이며 인과는 미확인이다.', 'The Source report at 2026-10-22 08:30 ET provided session context. A link to growth-stock pressure is interpretation; causality is unconfirmed.', '2026-10-22 08:30 ETのSource報道は取引中の背景材料。成長株への圧力との関連は解釈で、因果は未確認。'),
    indicators: tri('당장의 불안이 석 달 뒤보다 낮다(VIX/VIX3M). 금리·달러·옵션 포지션 수치는 제공되지 않았다.', 'Near-term fear is below three-month fear (VIX/VIX3M). Yield, dollar and options positioning readings are not provided.', '当面の不安は三か月先より低い(VIX/VIX3M)。金利・ドル・オプションの数値は提供されていない。'),
    watchNext: tri('일정은 제공되지 않았다. 단기 불안이 커지면 부담 증가, 줄면 긴장 완화로 해석한다.', 'No schedule is provided. Higher near-term fear indicates more strain; lower fear indicates easing strain.', '予定は提供されていない。当面の不安拡大は負担増、縮小は緊張緩和を示す。'),
    causeRefs: [{ newsId: 'market-1', kind: 'reported_context' }],
};
const brief = () => ({ structured: { closingNarrative: structuredClone(narrative), marketOverview: { summary: structuredClone(narrative.verdict) } }, reportEvidence: { regularClose: cash, news, events: [] } });
let count = 0;
const t = (name: string, fn: () => void) => { fn(); count++; console.log('ok -', name); };

t('현물 종가: 선물·다른 지수·이전 날짜·장중·미래·결측·낡은 값 거절', () => {
    assert.ok(cash.spx && cash.nasdaq);
    for (const overrides of [{ symbol: 'ES=F' }, { marketTime: '2026-10-21T20:00:00Z' }, { marketTime: '2026-10-22T18:00:00Z' }, { marketTime: '2026-10-22T22:00:00Z' }, { marketTime: undefined }, { isStale: true }, { changePct: NaN }]) {
        assert.equal(C.regularClose({ ...quote('^GSPC', -1.21), ...overrides }, '^GSPC', DAY, NOW), null);
    }
    assert.ok(C.regularClose({ ...quote('^GSPC', -1.21), marketTime: '2026-10-22T19:59:00Z' }, '^GSPC', DAY, NOW), '완료된 마지막 정규장 1분봉 종가');
});
t('DST·조기 폐장: 공유 캘린더와 동일한 마감 시각', () => {
    for (const day of ['2026-10-22', '2026-11-27', '2026-12-24', '2027-11-26']) assert.equal(C.cashCloseMinutes(day), sessionCloseMinutes(day));
    const early = { ...quote('^GSPC', -1), marketTime: '2026-11-27T18:00:00Z' };
    assert.ok(C.regularClose(early, '^GSPC', '2026-11-27', new Date('2026-11-27T22:00:00Z'), 780));
    assert.equal(C.regularClose(early, '^GSPC', '2026-11-27', new Date('2026-11-27T22:00:00Z')), null);
});
t('뉴스: ISO·ET·출처 보존, 장후 구분, 미래·시각 없음 제외', () => {
    assert.equal(news.length, 2);
    assert.equal(news[0].publishedEt, '2026-10-22 08:30 ET');
    assert.equal(news[0].source, 'Source');
    assert.equal(news[1].timing, 'after_cash_close');
    assert.equal(news[0].eventAt, null);
    assert.equal(C.newsEvidence([{ title: 'Ambiguous', publishedAt: '2026-10-22T08:30:00' }], DAY, NOW).length, 0);
});
t('일정: UTC 입력 → DST 반영 ET, 순서 정렬, 날짜만 있는 일정은 시각 추정 안 함', () => {
    const events = C.calendarEvidence([{ event: 'Later', date: '2026-10-23 14:00:00' }, { event: 'Earlier', date: '2026-10-23T12:30:00Z', estimate: 2 }, { event: 'Unknown time', date: '2026-10-23' }], NOW);
    assert.equal(events.length, 2);
    assert.equal(events[0].timeEt, '2026-10-23 08:30 ET');
    assert.equal(events[0].estimate, 2);
    const cached = C.calendarEvidence({ events: [{ event: 'Fed minutes', date: '2026-10-23', time: '18:00', previous: 2 }] }, NOW);
    assert.equal(cached[0].timeEt, '2026-10-23 14:00 ET', '실제 Redis 객체·분리된 UTC 날짜/시각');
    assert.equal(cached[0].previous, 2);
});
t('서사: 5단계·요약 동일·길이·권유·금액·언어 간 부호 검사', () => {
    assert.deepEqual(closingReportProblems(brief()), []);
    const b = brief(); b.structured.closingNarrative.why.ko = 'Cross-Asset 긴장';
    assert.ok(closingReportProblems(b).includes('narrative:ko:jargon'));
    const advice = brief(); advice.structured.closingNarrative.indicators.en = 'Buy now for guaranteed returns.';
    assert.ok(closingReportProblems(advice).some(r => r.endsWith(':advice')));
    const amounts = brief(); amounts.structured.closingNarrative.indicators = tri('자금 20억 달러 관측.', 'A $20 billion flow was observed.', '200億ドルの資金を観測。');
    assert.ok(closingReportProblems(amounts).some(r => r.endsWith(':amount')));
    const sign = brief(); sign.structured.closingNarrative.verdict.ja = sign.structured.closingNarrative.verdict.ja.replace('-2.60%', '+2.60%');
    assert.ok(closingReportProblems(sign).includes('narrative:verdict:cross-lang-facts'));
    const missing = brief(); delete missing.structured.closingNarrative.watchNext;
    assert.ok(closingReportProblems(missing).includes('narrative:watchNext:en:empty'));
    const long = brief(); long.structured.closingNarrative.why.ko = '가'.repeat(C.LIMITS.why.ko + 1);
    // 날짜·횟수 표기 차이(2026-10-23 / 2026年10月23日 / 10월 23일, «4 basis points»/«4bp»)는 언어 간 사실 충돌이 아니다 — 운영 측정 오탐(10/24)
    const dates = brief(); dates.structured.closingNarrative.watchNext = tri('2026년 10월 26일 08:30 ET 지표(예상 -0.1). 금리 +4bp.', 'Index at 2026-10-26 08:30 ET (estimate -0.1). Yields +4 basis points.', '2026年10月26日 08:30 ETの指標(予想-0.1)。金利+4bp。');
    assert.equal(closingReportProblems(dates).includes('narrative:watchNext:cross-lang-facts'), false);
    const money = brief(); money.structured.closingNarrative.indicators = tri('GEX는 -6,222만 달러, 금리 +4bp.', 'GEX was about -$62.2M; yields +4bp.', 'GEXは約-6,222万ドル、金利+4bp。');
    assert.equal(closingReportProblems(money).includes('narrative:indicators:cross-lang-facts'), false, '금액 단위 표기 차이는 언어 간 충돌이 아니다(10/24 5차 실측)');
    const moneyBp = brief(); moneyBp.structured.closingNarrative.indicators = tri('GEX는 -6,222만 달러, 금리 +4bp.', 'GEX was about -$62.2M; yields +5bp.', 'GEXは約-6,222万ドル、金利+4bp。');
    assert.ok(closingReportProblems(moneyBp).includes('narrative:indicators:cross-lang-facts'), '금액을 빼도 다른 수치 차이는 잡는다');
    const stamps = brief(); stamps.structured.closingNarrative.why.ja = 'ET 2026-10-23 17:42 の報道と2026年10月23日 9:05 ET の発表、2026-10-23 08:30（ET）。';
    C.alignSummary(stamps.structured);
    assert.equal(stamps.structured.closingNarrative.why.ja, '2026-10-23 17:42 ET の報道と2026-10-23 09:05 ET の発表、2026-10-23 08:30 ET。', '시각 표기만 정본으로(10/24 6차 실측)');
    const already = brief(); already.structured.closingNarrative.why.en = 'At 2026-10-23 17:42 ET Kitco reported.';
    C.alignSummary(already.structured); assert.equal(already.structured.closingNarrative.why.en, 'At 2026-10-23 17:42 ET Kitco reported.');
    const yoso = brief(); yoso.structured.closingNarrative.watchNext.ja = '市場予想7を上回れば製造業指標が予想より強いことを示し、予想-0.1に対し前回-0.04。予想される影響。';
    C.alignSummary(yoso.structured);
    assert.equal(yoso.structured.closingNarrative.watchNext.ja, '市場予想7を上回れば製造業指標が市場予想より強いことを示し、市場予想-0.1に対し前回-0.04。予想される影響。', '비교 자리의 予想만 市場予想으로');
    const rp = C.narrativeRepairPrompt({ sessionDate: '2026-10-22', evidence: { news: [{ id: 'market-5', publishedEt: '2026-10-22 16:36 ET', timing: 'after_cash_close' }] }, macroStr: '', narrative: { ...narrative, causeRefs: [{ newsId: 'market-5', kind: 'reported_context' }] }, reasons: ['narrative:after-close-cause', 'narrative:why:cross-lang-facts'] });
    assert.match(rp, /causeRefs market-5 was published 2026-10-22 16:36 ET, AFTER the cash close/);
    assert.match(rp, /why: measured numbers\/ET times per language are ko=/);
    const buy = brief(); buy.structured.closingNarrative.whatHappened.ko = '나스닥은 일부 반도체 매수로 하락폭이 제한됐다. 공매도가 늘었고 순매수가 이어졌다.';
    C.alignSummary(buy.structured);
    assert.equal(buy.structured.closingNarrative.whatHappened.ko, '나스닥은 일부 반도체 매수세로 하락폭이 제한됐다. 공매도가 늘었고 순매수가 이어졌다.', '관찰된 매매만 매수세로(10/24 8차 실측)');
    assert.equal(closingReportProblems(buy).some(r => r.endsWith(':advice')), false);
    const clock = brief(); clock.structured.closingNarrative.watchNext.ja = clock.structured.closingNarrative.watchNext.ja + ' 10:30 ET';
    assert.ok(closingReportProblems(clock).includes('narrative:watchNext:cross-lang-facts'), 'ET 시각이 다르면 탈락');
    const value = brief(); value.structured.closingNarrative.verdict.ko = value.structured.closingNarrative.verdict.ko.replace('-2.60%', '-2.50%');
    assert.ok(closingReportProblems(value).includes('narrative:verdict:cross-lang-facts'), '수치가 다르면 탈락');
    const summary = brief(); summary.structured.marketOverview.summary = tri('x', 'y', 'z');
    assert.deepEqual(C.alignSummary(summary.structured).marketOverview.summary, narrative.verdict, '요약 = 판정(코드 복사)');
    const abbr = brief(); abbr.structured.closingNarrative.verdict.en = 'S&P 500 -1.21% and NASDAQ Composite -2.60% closed lower, so U.S. stocks ended down.';
    assert.equal(closingReportProblems(C.alignSummary(abbr.structured) && abbr).some(r => r === 'narrative:verdict:en:sentences'), false, '«U.S.» 약어는 문장 끝이 아니다');
    const two = brief(); two.structured.closingNarrative.verdict.en = 'S&P 500 -1.21% and NASDAQ Composite -2.60% closed lower. Growth led.';
    assert.equal(closingReportProblems(C.alignSummary(two.structured) && two).includes('narrative:verdict:en:sentences'), false, '짧은 두 문장은 허용(10/24 일본어 실측)');
    const three = brief(); three.structured.closingNarrative.verdict.en = 'S&P 500 -1.21% and NASDAQ Composite -2.60% closed lower. Growth led. Defensives lagged.';
    assert.ok(closingReportProblems(C.alignSummary(three.structured) && three).includes('narrative:verdict:en:sentences'));
    const ids = brief(); ids.structured.closingNarrative.why.ko = '2026-10-22 08:30 ET Source 보도(market-1)는 장중 재료다. 인과는 미확인이다.';
    C.alignSummary(ids.structured);
    assert.equal(ids.structured.closingNarrative.why.ko.includes('market-1'), false, '괄호 속 뉴스 ID 는 지운다');
    const bare = brief(); bare.structured.closingNarrative.why.en = 'market-1 at 2026-10-22 08:30 ET provided session context.';
    assert.ok(closingReportProblems(bare).includes('narrative:news-id-text'), '문장 속 ID 는 탈락 → 고침 요청');
    const jargon = brief(); jargon.structured.closingNarrative.indicators.ko = 'VIX/VIX3M 은 콘탱고 구조다.';
    C.alignSummary(jargon.structured);
    assert.equal(jargon.structured.closingNarrative.indicators.ko, 'VIX/VIX3M 은 평상시 구조다.');
    assert.equal(closingReportProblems(jargon).includes('narrative:ko:jargon'), false);
    assert.ok(lengthProblems(long.structured).length);
    const malformed = brief(); malformed.structured.closingNarrative.why.ko = 123;
    assert.doesNotThrow(() => closingReportProblems(malformed));
    assert.ok(closingReportProblems(malformed).length, '형식 오류는 예외 대신 탈락 사유');
});
t('장후 보도는 선행 원인으로 분류할 수 없고 보도 시각 누락도 차단', () => {
    const b = brief(); b.structured.closingNarrative.causeRefs = [{ newsId: 'market-2', kind: 'reported_context' }];
    assert.ok(closingReportProblems(b).includes('narrative:after-close-cause'));
    b.structured.closingNarrative.causeRefs[0].kind = 'retrospective';
    assert.ok(closingReportProblems(b).some(r => r.startsWith('narrative:news-time:')));
    const unknown = brief(); unknown.structured.closingNarrative.causeRefs[0].newsId = 'invented';
    assert.ok(closingReportProblems(unknown).includes('narrative:news-ref'));
});
t('두 생성기는 같은 프롬프트·구조 사용, 시각과 입력 근거 유지', () => {
    const prompt = C.buildClosingPrompt({ sessionDate: DAY, macroStr: '', levelsSection: '', evidence: brief().reportEvidence, sectorSummaries: [], keyLevelsSchema: '', keyLevelsRequirement: '' });
    for (const field of C.FIELDS) assert.ok(prompt.includes(field));
    for (const text of ['2026-10-22 08:30 ET', '2026-10-22T12:30:00.000Z', 'Publication time is not event time', 'No profit guarantee']) assert.ok(prompt.includes(text), text);
    for (const file of ['src/app/api/intel/cross-sector-brief/route.ts', 'scripts/lambda-cross-sector/index.js']) {
        const source = fs.readFileSync(file, 'utf8');
        assert.ok(source.includes('CLOSING.buildClosingPrompt('));
        assert.equal(/redisIdxNasdaq \|\| redisNq|redisIdxSpx \|\| redisSpx/.test(source), false);
    }
});
t('화면: 판정+현황 뒤 펼침 안에 원인→지표→다음 일정 원문 전부 보존', () => {
    const html = renderToStaticMarkup(<ClosingNarrative narrative={narrative} locale="ko" />);
    assert.ok(html.indexOf(narrative.whatHappened.ko) < html.indexOf('<details>'));
    assert.ok(html.indexOf(narrative.why.ko) > html.indexOf('<details>'));
    assert.ok(html.indexOf(narrative.why.ko) < html.indexOf(narrative.indicators.ko));
    assert.ok(html.indexOf(narrative.indicators.ko) < html.indexOf(narrative.watchNext.ko));
    assert.equal(/line-clamp|text-overflow|overflow:\s*hidden/.test(html), false);
});
t('푸시: 판정 숫자 포함, 권유 거절, 숫자 없는 요약은 정적 대체', () => {
    assert.equal(closingAiLines(brief(), DAY, DAY, 2026).ko.line, narrative.verdict.ko);
    const b = brief(); b.structured.marketOverview.summary.ko = '성장주를 중심으로 시장이 하락했으며 주요 섹터에도 약세가 확산했다.';
    assert.equal(closingAiLines(b, DAY, DAY, 2026).ko.reason, 'no-close-number');
});

(async () => {
    const fixture = JSON.parse(fs.readFileSync('tests/fixtures/crossBriefServe.v4.json', 'utf8'));
    const old = fixture.brief;
    const good = { ...structuredClone(old), ...brief(), date: DAY, generatedAt: NOW.toISOString(), reportSource: fixture.prompt + JSON.stringify(brief().reportEvidence) };
    good.structured = { ...structuredClone(old.structured), ...good.structured,
        marketOverview: { ...old.structured.marketOverview, ...good.structured.marketOverview } };
    good.guard = buildGenerationGuard({ brief: good, source: good.reportSource, provider: 'a55', model: 'offline-fixture' });
    assert.equal(good.guard.ok, true, JSON.stringify(good.guard.reasons));
    assert.equal(evaluateServedV4(good, DAY).ok, true);
    const lambda = await selectServedBrief(async key => key.includes('-v3:') ? good : null, [DAY]);
    assert.equal(lambda?.source, 'v3', '정상 새 Lambda 서사는 기존 언어·금액·숫자 가드도 통과');
    const payload = toServedPayload(lambda!);
    assert.equal('reportSource' in payload, false);
    assert.equal('reportEvidence' in payload, false);
    assert.equal('sectorInputs' in toServedPayload({ ...lambda!, brief: { ...lambda!.brief, sectorInputs: [] } }), false);
    const brokenNew = { ...old, ...brief(), date: DAY, generatedAt: NOW.toISOString(), reportSource: '' };
    brokenNew.structured.closingNarrative.causeRefs = [{ newsId: 'market-2', kind: 'reported_context' }];
    const reads: string[] = [];
    const selected = await selectServedBrief(async key => { reads.push(key); return key.includes('-v3:') ? brokenNew : key.includes('-v2:') ? old : null; }, [DAY]);
    assert.equal(selected?.source, 'v2', '새 Lambda 서사가 탈락하면 기존 대체본 선택');
    assert.ok(reads.every(key => key.endsWith(DAY)), '지정한 거래일만 조회');
    console.log(`${count + 2}개 통과`);
})().catch(e => { console.error(e); process.exitCode = 1; });
