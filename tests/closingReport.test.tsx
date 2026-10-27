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
    const yoso = brief(); yoso.structured.closingNarrative.watchNext.ja = '市場予想7を上回れば製造業指標が予想より強いことを示し、成長率予想12.5%は維持。予想される影響。';
    C.alignSummary(yoso.structured);
    assert.equal(yoso.structured.closingNarrative.watchNext.ja, '市場予想7を上回れば製造業指標が予想より強いことを示し、成長率予想12.5%は維持。予想される影響。', '予想 자동 치환 없음(관문 10241411)');
    const rp = C.narrativeRepairPrompt({ sessionDate: '2026-10-22', evidence: { news: [{ id: 'market-5', publishedEt: '2026-10-22 16:36 ET', timing: 'after_cash_close' }] }, macroStr: '', narrative: { ...narrative, causeRefs: [{ newsId: 'market-5', kind: 'reported_context' }] }, reasons: ['narrative:after-close-cause', 'narrative:why:cross-lang-facts'] });
    assert.match(rp, /causeRefs market-5 was published 2026-10-22 16:36 ET, AFTER the cash close/);
    assert.match(rp, /why: measured numbers\/ET times per language are ko=/);
    const rl = C.narrativeRepairPrompt({ sessionDate: '2026-10-22', evidence: { news: [] }, macroStr: '', narrative: { ...narrative, whatHappened: { ...narrative.whatHappened, ko: '가'.repeat(382) } }, reasons: ['narrative:whatHappened:ko:length'] });
    assert.match(rl, new RegExp(`whatHappened\\.ko is 382 characters — rewrite it to at most ${C.TARGETS.whatHappened.ko} characters`));
    const buy = brief(); buy.structured.closingNarrative.whatHappened.ko = '나스닥은 일부 반도체 매수로 하락폭이 제한됐다. 공매도가 늘었고 순매수가 이어졌다.';
    C.alignSummary(buy.structured);
    assert.equal(buy.structured.closingNarrative.whatHappened.ko, '나스닥은 일부 반도체 매수로 하락폭이 제한됐다. 공매도가 늘었고 순매수가 이어졌다.', '매수 자동 치환 없음 — 고침 요청으로(관문 10241411)');
    // ★10/24 T25 — «반도체 매수로 하락폭이 제한됐다»는 시장 참여자 행동(원인·수단의 «로») 서술이다. 권유로 막던 기대값을 바꾼다(운영 Tactical ko 6회 중 4회가 같은 «매도로» 오탐).
    //   같은 «매수로»라도 권유(전략 행동·평가·명령)면 계속 서빙 가드가 잡고 고침 요청으로 간다.
    assert.equal(closingReportProblems(buy).some(r => r.endsWith(':advice')), false, '원인 서술 «매수로»는 권유 아님');
    const buyAdv = brief(); buyAdv.structured.closingNarrative.whatHappened.ko = '나스닥은 하락했다. 지금은 반도체 매수로 접근하는 게 좋다.';
    assert.ok(closingReportProblems(buyAdv).some(r => r.endsWith(':advice')), '«매수로 접근하는 게 좋다»는 서빙 가드가 잡고 고침 요청으로 간다');
    const est = brief(); est.structured.closingNarrative.why.ko = '소비자심리 48은 시장 예상치 46.3을 웃돌았고 반도체 매수 지지가 있었다.';
    C.alignSummary(est.structured);
    assert.equal(est.structured.closingNarrative.why.ko, '소비자심리 48은 시장 예상치 46.3을 웃돌았고 반도체 매수 지지가 있었다.');
    // 10/24 9차 실측 — 장후 보도를 «장중 보도»로 묶은 문장은 탈락, 같은 문장에 «마감 후»가 있으면 대조 서술로 통과
    assert.equal(C.afterCloseCalledIntraday('Reports published during the session include FXEmpire (2026-10-23 14:29 ET) and Schwab Network (2026-10-23 16:10 ET).', '2026-10-23 16:10 ET', 'en'), true);
    assert.equal(C.afterCloseCalledIntraday('FXEmpire reported during the session, while Schwab Network (2026-10-23 16:10 ET) came after the close.', '2026-10-23 16:10 ET', 'en'), false);
    assert.equal(C.afterCloseCalledIntraday('정규장 중 나온 보도로는 Schwab Network(2026-10-23 16:10 ET)가 있었다.', '2026-10-23 16:10 ET', 'ko'), true);
    assert.equal(C.afterCloseCalledIntraday('Kitco(2026-10-23 17:42 ET) 보도는 마감 이후 기사다.', '2026-10-23 17:42 ET', 'ko'), false);
    assert.equal(C.afterCloseCalledIntraday('Kitcoは2026-10-23 17:42 ETに報じ、取引終了後の報道である。', '2026-10-23 17:42 ET', 'ja'), false);
    // 본문 어느 언어에도 시각이 없는 causeRefs 는 뺀다(한 언어라도 인용하면 유지)
    const orphan = brief(); const ev = orphan.reportEvidence;
    orphan.structured.closingNarrative.causeRefs = [...orphan.structured.closingNarrative.causeRefs, { newsId: 'zz-9', kind: 'after_close' }];
    C.alignSummary(orphan.structured, { ...ev, news: [...ev.news, { id: 'zz-9', publishedEt: '2026-10-22 23:59 ET', timing: 'after_cash_close' }] });
    assert.equal(orphan.structured.closingNarrative.causeRefs.some((r: any) => r.newsId === 'zz-9'), false);
    assert.deepEqual(orphan.structured.closingNarrative.causeRefs, narrative.causeRefs);
    // 번역 안 된 보조 뉴스 항목은 뺀다
    const untr = { newsImpact: { items: [{ headline: { ko: 'Gold extends weekly losses as crude rises', en: 'Gold extends weekly losses as crude rises', ja: 'Gold extends weekly losses as crude rises' } }, { headline: { ko: '금 약세', en: 'Gold weak', ja: '金が軟調' } }] } };
    assert.deepEqual(C.dropUntranslatedNews(untr).newsImpact.items.map((x: any) => x.headline.en), ['Gold weak']);
    // 관문 10241205 반례 4건
    const mSign = brief(); mSign.structured.closingNarrative.indicators = tri('GEX는 +6,222만 달러, 금리 +4bp.', 'GEX was about -$62.2M; yields +4bp.', 'GEXは約-6,222万ドル、金利+4bp。');
    assert.ok(closingReportProblems(mSign).includes('narrative:indicators:cross-lang-facts'), '금액 부호 반전은 탈락');
    const adv = brief(); adv.structured.closingNarrative.whatHappened.ko = '반도체가 강했다. 지금 매수에 나서세요.';
    C.alignSummary(adv.structured);
    assert.equal(adv.structured.closingNarrative.whatHappened.ko, '반도체가 강했다. 지금 매수에 나서세요.', '권유 문장은 정규화하지 않는다');
    assert.ok(closingReportProblems(adv).some(r => r.endsWith(':advice')));
    const advTail = brief(); advTail.structured.closingNarrative.whatHappened.ko = '반도체 매수로 반등했다. 반도체 매수가 기회다.';
    C.alignSummary(advTail.structured);
    assert.equal(advTail.structured.closingNarrative.whatHappened.ko, '반도체 매수로 반등했다. 반도체 매수가 기회다.');
    const guide = brief(); guide.structured.closingNarrative.why.ko = '회사는 매출 전망 46.3억 달러를 유지했다.';
    C.alignSummary(guide.structured);
    assert.equal(guide.structured.closingNarrative.why.ko, '회사는 매출 전망 46.3억 달러를 유지했다.', '회사 가이던스·금액은 그대로');
    const hidden = brief(); const hev = { ...hidden.reportEvidence, news: [...hidden.reportEvidence.news, { id: 'zz-8', source: 'Kitco', publishedEt: '2026-10-22 17:42 ET', timing: 'after_cash_close' }] };
    hidden.reportEvidence = hev;
    hidden.structured.closingNarrative.causeRefs = [...hidden.structured.closingNarrative.causeRefs, { newsId: 'zz-8', kind: 'reported_context' }];
    hidden.structured.closingNarrative.why = tri(hidden.structured.closingNarrative.why.ko + ' Kitco 장후 보도가 상승을 이끌었다.', hidden.structured.closingNarrative.why.en + ' A Kitco report drove the rally.', hidden.structured.closingNarrative.why.ja + ' Kitcoの報道が上昇を主導した。');
    C.alignSummary(hidden.structured, hev);
    assert.ok(hidden.structured.closingNarrative.causeRefs.some((r: any) => r.newsId === 'zz-8'), '출처 이름이 본문에 있으면 참조를 지우지 않는다');
    const hp = closingReportProblems(hidden);
    assert.ok(hp.includes('narrative:after-close-cause') && hp.some(r => r.startsWith('narrative:news-time')), hp.join(','));
    // 관문 10241213 반례 3건
    const adv2 = brief(); adv2.structured.closingNarrative.whatHappened.ko = '지금 매수가 정답이다.';
    C.alignSummary(adv2.structured);
    assert.equal(adv2.structured.closingNarrative.whatHappened.ko, '지금 매수가 정답이다.');
    assert.ok(closingReportProblems(adv2).some(r => r.endsWith(':advice')));
    const swap = brief(); swap.structured.closingNarrative.indicators = tri('GEX +6,220만 달러, 자금흐름 -2억 7,160만 달러, 금리 +4bp.', 'GEX -$62.2M, flows +$271.6M, yields +4bp.', 'GEX -6,220万ドル、資金フロー +2億7,160万ドル、金利+4bp。');
    assert.ok(closingReportProblems(swap).includes('narrative:indicators:cross-lang-facts'), '두 금액의 부호를 바꿔도 잡는다');
    const same = brief(); same.structured.closingNarrative.indicators = tri('GEX -6,220만 달러, 자금흐름 +2억 7,160만 달러, 금리 +4bp.', 'GEX -$62.2M, flows +$271.6M, yields +4bp.', 'GEX -6,220万ドル、資金フロー +2億7,160万ドル、金利+4bp。');
    assert.equal(closingReportProblems(same).includes('narrative:indicators:cross-lang-facts'), false);
    const growth = brief(); growth.structured.closingNarrative.why.ko = '회사는 매출 성장률 전망 12.5%를 유지했다.';
    C.alignSummary(growth.structured);
    assert.equal(growth.structured.closingNarrative.why.ko, '회사는 매출 성장률 전망 12.5%를 유지했다.');
    // 관문 10241222 반례 3건 + 13차 실측(한 언어의 빠뜨림은 통과)
    const imp = brief(); imp.structured.closingNarrative.whatHappened.ko = '지금 매수로 반등을 노려라.';
    C.alignSummary(imp.structured);
    assert.equal(imp.structured.closingNarrative.whatHappened.ko, '지금 매수로 반등을 노려라.');
    assert.ok(closingReportProblems(imp).some(r => r.endsWith(':advice')));
    const near = brief(); near.structured.closingNarrative.indicators = tri('GEX +6,000만 달러, 금리 +4bp.', 'GEX -$62.2M; yields +4bp.', 'GEX -6,220万ドル、金利+4bp。');
    assert.ok(closingReportProblems(near).includes('narrative:indicators:cross-lang-facts'), '크기가 조금 달라도 반대 부호는 잡는다');
    const pair = brief(); pair.structured.closingNarrative.indicators = tri('GEX -6,220만 달러, 자금 +6,300만 달러, 금리 +4bp.', 'GEX -$62.2M, flows +$63M, yields +4bp.', 'GEX -6,220万ドル、資金 +6,300万ドル、金利+4bp。');
    assert.equal(closingReportProblems(pair).includes('narrative:indicators:cross-lang-facts'), false, '비슷한 크기의 두 금액은 짝지어 비교');
    const omit = brief(); omit.structured.closingNarrative.watchNext = tri('2026-10-26 08:30 ET 지표 시장 예상치 -0.1, 이전 -0.04. 내구재는 시장 예상치 0.6%.', 'At 2026-10-26 08:30 ET estimate -0.1, prior -0.04. Durables estimate 0.6%, prior -0.1%.', '2026-10-26 08:30 ETの指標は市場予想-0.1、前回-0.04。耐久財は市場予想0.6%、前回-0.1%。');
    assert.equal(closingReportProblems(omit).includes('narrative:watchNext:cross-lang-facts'), false, '한 언어의 빠뜨림은 틀림이 아니다');
    const solo = brief(); solo.structured.closingNarrative.watchNext = tri('2026-10-26 08:30 ET 지표 시장 예상치 -0.2.', 'At 2026-10-26 08:30 ET estimate -0.1.', '2026-10-26 08:30 ETの指標は市場予想-0.1。');
    assert.ok(closingReportProblems(solo).includes('narrative:watchNext:cross-lang-facts'), '한 언어만 다른 값은 잡는다');
    // 관문 10241229 반례 3건
    const hort = brief(); hort.structured.closingNarrative.whatHappened.ko = '지금 매수로 반등을 준비합시다.';
    C.alignSummary(hort.structured);
    assert.equal(hort.structured.closingNarrative.whatHappened.ko, '지금 매수로 반등을 준비합시다.');
    assert.ok(closingReportProblems(hort).some(r => r.endsWith(':advice')));
    const koja = brief(); koja.structured.closingNarrative.watchNext = tri('2026-10-26 08:30 ET 내구재 이전 -0.1%.', 'At 2026-10-26 08:30 ET durables.', '2026-10-26 08:30 ETの耐久財は前回+0.1%。');
    assert.ok(closingReportProblems(koja).includes('narrative:watchNext:cross-lang-facts'), 'ko·ja 부호 충돌도 잡는다');
    const swap2 = brief(); swap2.structured.closingNarrative.indicators = tri('GEX +6,220만 달러, 자금 -6,300만 달러, 금리 +4bp.', 'GEX -$62.2M, flows +$63M, yields +4bp.', 'GEX -6,220万ドル、資金 +6,300万ドル、金利+4bp。');
    assert.ok(closingReportProblems(swap2).includes('narrative:indicators:cross-lang-facts'), '비슷한 크기 두 금액의 부호 맞바꿈도 잡는다');
    // 관문 10241236 정상본 오탐 3건
    const round = brief(); round.structured.closingNarrative.indicators = tri('GEX 약 -6,000만 달러, 자금 +6,300만 달러, 금리 +4bp.', 'GEX -$62.2M, flows +$63M, yields +4bp.', 'GEX -6,220万ドル、資金 +6,300万ドル、金利+4bp。');
    assert.equal(closingReportProblems(round).includes('narrative:indicators:cross-lang-facts'), false, '정상 반올림');
    const order = brief(); order.structured.closingNarrative.watchNext = tri('2026-10-26 08:30 ET 내구재 -0.1%, 물가 +0.1%.', 'At 2026-10-26 08:30 ET.', '2026-10-26 08:30 ETの物価+0.1%、耐久財-0.1%。');
    assert.equal(closingReportProblems(order).includes('narrative:watchNext:cross-lang-facts'), false, '순서 차이');
    const state = brief(); state.structured.closingNarrative.whatHappened.ko = '반도체 매수로 하락폭이 제한된 상태다.';
    C.alignSummary(state.structured);
    assert.equal(state.structured.closingNarrative.whatHappened.ko, '반도체 매수로 하락폭이 제한된 상태다.');
    // 관문 10241251 반례 2건
    const gex2 = brief(); gex2.structured.closingNarrative.indicators = tri('GEX +6,000만 달러, 자금 -6,300만 달러, 금리 +4bp.', 'GEX -$62.2M, flows -$63M, yields +4bp.', 'GEX -6,220万ドル、資金 -6,300万ドル、金利+4bp。');
    assert.ok(closingReportProblems(gex2).includes('narrative:indicators:cross-lang-facts'));
    const bag = brief(); bag.structured.closingNarrative.watchNext = tri('2026-10-26 08:30 ET 내구재 -0.1%, 물가 +0.1%.', 'At 2026-10-26 08:30 ET durables -0.1%, prices -0.1%.', '2026-10-26 08:30 ETの耐久財-0.1%、物価+0.1%。');
    assert.ok(closingReportProblems(bag).includes('narrative:watchNext:cross-lang-facts'));
    // 관문 10241258 반례 2건
    const swapIdx = brief(); for (const l of ['ko', 'en', 'ja'] as const) swapIdx.structured.closingNarrative.verdict[l] = swapIdx.structured.closingNarrative.verdict[l].replace('-1.21%', '#').replace('-2.60%', '-1.21%').replace('#', '-2.60%');
    C.alignSummary(swapIdx.structured);
    assert.ok(closingReportProblems(swapIdx).some(r => r.startsWith('narrative:cash-close-index')), '지수와 값을 맞바꾸면 탈락');
    const unsigned = brief(); unsigned.structured.closingNarrative.indicators = tri('GEX는 6,220만 달러, 금리 +4bp.', 'GEX -$62.2M; yields +4bp.', 'GEXは-6,220万ドル、金利+4bp。');
    assert.ok(closingReportProblems(unsigned).includes('narrative:indicators:cross-lang-facts'), '음수 금액의 부호를 빠뜨리면 탈락');
    const worded = brief(); worded.structured.closingNarrative.indicators = tri('GEX는 마이너스 6,220만 달러, 금리 +4bp.', 'GEX -$62.2M; yields +4bp.', 'GEXは-6,220万ドル、金利+4bp。');
    assert.equal(closingReportProblems(worded).includes('narrative:indicators:cross-lang-facts'), false, '말로 음수를 밝히면 통과');
    // 운영 dry 10/24 13:47 — 수동형 매수됐다 · 가장 가까운 일정 건너뛰기
    const pass = brief(); pass.structured.closingNarrative.why.ko = 'FXEmpire는 장중에 일부 칩 종목만 매수됐다고 전했다.';
    C.alignSummary(pass.structured);
    assert.equal(pass.structured.closingNarrative.why.ko, 'FXEmpire는 장중에 일부 칩 종목만 매수됐다고 전했다.');
    const should = brief(); should.structured.closingNarrative.why.ko = '칩 종목은 지금 매수됐어야 했다고 판단했다.';
    C.alignSummary(should.structured);
    assert.equal(should.structured.closingNarrative.why.ko, '칩 종목은 지금 매수됐어야 했다고 판단했다.', '당위형은 정규화하지 않는다(관문 10241349)');
    assert.ok(closingReportProblems(should).some(r => r.endsWith(':advice')));
    const outlook = brief(); outlook.structured.closingNarrative.indicators.ko = '내년 시장 전망 10% 상승에 대비할 필요가 있었다.';
    C.alignSummary(outlook.structured);
    assert.equal(outlook.structured.closingNarrative.indicators.ko, '내년 시장 전망 10% 상승에 대비할 필요가 있었다.', '전망은 치환하지 않는다(관문 10241357)');
    assert.ok(closingReportProblems(outlook).some(r => r.endsWith(':advice')));
    const reason = brief(); reason.structured.closingNarrative.why.ko = '칩 종목은 매수됐고 지금도 계속 사는 것이 합리적이라고 판단했다.';
    C.alignSummary(reason.structured);
    assert.ok(closingReportProblems(reason).some(r => r.endsWith(':advice')), '정규화가 권유 검출 낱말을 지우지 않는다(관문 10241411)');
    const keep = brief(); keep.structured.closingNarrative.why = tri('회사는 전망을 유지했다.', 'The company kept its outlook.', '会社は見通しを維持した。');
    assert.deepEqual(C.adviceSuspects(keep.structured), [], '가이던스 유지·재확인은 의심 아님');
    // 관문 10241426 — 한국어 매수 관찰문도 Lambda 고침 대상, 고침 지시는 걸린 구절을 인용
    const kobuy = brief(); kobuy.structured.closingNarrative.whatHappened.ko = '나스닥은 일부 반도체 매수로 하락폭이 제한됐다.';
    assert.equal(C.adviceSuspects(kobuy.structured).includes('narrative:whatHappened:ko:advice'), false, '★10/24 T25 원인 서술 «매수로»는 Lambda 고침 대상 아님(서빙 가드와 같게)');
    const kobuyAdv = brief(); kobuyAdv.structured.closingNarrative.whatHappened.ko = '반도체 매수로 전환할 시점이다.';
    assert.ok(C.adviceSuspects(kobuyAdv.structured).includes('narrative:whatHappened:ko:advice'), '권유 «매수로 전환할 시점»은 Lambda 도 고침');
    assert.deepEqual(C.adviceSuspects((() => { const b = brief(); b.structured.closingNarrative.whatHappened.ko = '매수세가 몰렸고 순매수가 이어졌으며 공매도는 줄었다.'; return b; })().structured), []);
    const rq = C.narrativeRepairPrompt({ sessionDate: '2026-10-22', evidence: { news: [] }, macroStr: '', narrative: { ...narrative, watchNext: { ...narrative.watchNext, ja: '市場予想-0.1を上回れば予想より強い活動を示す。' } }, reasons: ['narrative:watchNext:ja:advice'] });
    assert.match(rq, /watchNext\.ja: rewrite these fragments without the flagged word — «.*予想より強い/);
    const lam = fs.readFileSync('scripts/lambda-cross-sector/index.js', 'utf8');
    assert.ok(/better\(score\(candidate\), score\(structured\)\)/.test(lam), 'Lambda 채택은 근거 검사 우선');
    // Lambda 권유어 검사 = 서빙 가드(생성 파일이 원본과 같아야 한다)
    const gen = require('../scripts/build-lambda-advice-guard.cjs');
    assert.equal(fs.readFileSync(gen.OUT, 'utf8'), gen.build(), 'adviceGuard.generated.js 를 다시 만들어라: node scripts/build-lambda-advice-guard.cjs');
    for (const t of ['나스닥은 일부 반도체 매수로 하락폭이 제한됐다.', 'FXEmpire는 나스닥의 선별적 반도체 매수를 전했다.', '市場予想-0.1を上回れば予想より強い活動を示す。']) {
        const b = brief(); b.structured.closingNarrative.whatHappened.ko = t; b.structured.closingNarrative.whatHappened.ja = t;
        const served = closingReportProblems(b).filter(r => r.endsWith(':advice') && r.startsWith('narrative:whatHappened:'));
        assert.deepEqual(C.adviceSuspects(b.structured).filter((r: string) => r.startsWith('narrative:whatHappened:')).sort(), served.sort(), t);
    }
    const kind = brief(); kind.structured.closingNarrative.causeRefs = kind.structured.closingNarrative.causeRefs.map((r: any) => ({ ...r, kind: 'before_or_during_cash_session' }));
    C.alignSummary(kind.structured);
    assert.ok(kind.structured.closingNarrative.causeRefs.every((r: any) => r.kind === 'reported_context'), 'timing 값 kind 는 같은 뜻으로');
    const best = brief(); best.structured.closingNarrative.why.ko = '칩 종목은 매수됐고 추가 진입이 최선이라고 판단했다.';
    C.alignSummary(best.structured);
    assert.equal(best.structured.closingNarrative.why.ko, '칩 종목은 매수됐고 추가 진입이 최선이라고 판단했다.', '평가어 문장은 정규화 제외(관문 10241403)');
    // Lambda 권유어 의심: 서빙 가드가 잡는 낱말이면 고침을 부른다
    const sus = brief(); sus.structured.closingNarrative.why.ko = '소비자심리 48은 시장 전망 46.3을 웃돌았다.';
    assert.ok(C.adviceSuspects(sus.structured).includes('narrative:why:ko:advice'));
    assert.deepEqual(C.adviceSuspects(brief().structured), [], '정상 서사는 의심 0');
    const lambdaSrc = fs.readFileSync('scripts/lambda-cross-sector/index.js', 'utf8');
    assert.ok(lambdaSrc.includes('CLOSING.adviceSuspects(s)'), 'Lambda 고침 사유에 권유어 의심 포함');
    const ev2 = brief(); ev2.reportEvidence = { ...ev2.reportEvidence, events: [{ at: '2026-10-26T12:30:00.000Z', timeEt: '2026-10-26 08:30 ET', event: 'Chicago Fed' }, { at: '2026-10-27T12:30:00.000Z', timeEt: '2026-10-27 08:30 ET', event: 'Durable Goods' }] };
    ev2.structured.closingNarrative.watchNext = tri('다음 거래일 일정은 제공되지 않았다. 2026-10-27 08:30 ET 내구재.', 'No next-session calendar. 2026-10-27 08:30 ET durables.', '次の日程はない。2026-10-27 08:30 ETの耐久財。');
    assert.ok(closingReportProblems(ev2).includes('narrative:event-next:en'));
    ev2.structured.closingNarrative.watchNext = tri('2026-10-26 08:30 ET 시카고 연은, 2026-10-27 08:30 ET 내구재.', '2026-10-26 08:30 ET Chicago Fed, 2026-10-27 08:30 ET durables.', '2026-10-26 08:30 ETシカゴ連銀、2026-10-27 08:30 ET耐久財。');
    assert.equal(closingReportProblems(ev2).some(r => r.startsWith('narrative:event-')), false);
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

t('T4b ①: 쉬운 말 뒤 원어 괄호 풀이는 치환 전에 지워 «평상시 구조(평상시 구조)» 중복이 생기지 않는다', () => {
    const b: any = brief();
    b.structured.closingNarrative.indicators.ko = '단기 불안이 3개월 불안보다 낮은 평상시 구조(콘탱고)가 유지됐다. 역전 구조(백워데이션 구조)는 아니다. 콘탱고 상태다.';
    C.alignSummary(b.structured);
    assert.equal(b.structured.closingNarrative.indicators.ko, '단기 불안이 3개월 불안보다 낮은 평상시 구조가 유지됐다. 역전 구조는 아니다. 평상시 구조다.');
    assert.doesNotMatch(C.narrativeDirective(), /평상시 구조\(단기/, '지시문 예시가 «쉬운 말(풀이)» 괄호 모양을 보이지 않는다');
});
t('T4b ③: ko·ja 본문의 영어 섹터 이름 → 상단 카드와 같은 표시명(숫자·괄호 값 불변, en 그대로)', () => {
    assert.equal(C.localizeSectorNames('Silicon Core(+2.73%)와 Cyber Shield (AI Security & Zero Trust)(+2.80%), Fintech Pulse (-2.36) · Silicon Core (ARM 6.08%) · M7', 'ko'),
        '반도체 코어(+2.73%)와 사이버 쉴드(+2.80%), 핀테크 펄스 (-2.36) · 반도체 코어 (ARM 6.08%) · M7');
    assert.equal(C.localizeSectorNames('Cyber Shield（+2.80%）', 'ja'), 'サイバーシールド（+2.80%）');
    assert.equal(C.localizeSectorNames('실리콘 코어(+2.73%)와 사이버 실드, 오빗 디펜스', 'ko'), '반도체 코어(+2.73%)와 사이버 쉴드, 우주 방산');
    assert.equal(C.localizeSectorNames('クォンタムエッジとオービット・ディフェンス', 'ja'), '量子エッジとオービット防衛');
    assert.equal(C.localizeSectorNames('반도체 코어(Silicon Core)가 +2.73%', 'ko'), '반도체 코어가 +2.73%');
    assert.equal(C.localizeSectorNames('シリコンコア（Silicon Core）', 'ja'), 'シリコンコア');
    assert.equal(C.localizeSectorNames('Cyber Shield (+2.80%)', 'en'), 'Cyber Shield (+2.80%)');
    const b: any = brief();
    b.structured.closingNarrative.whatHappened = tri('Cyber Shield(+2.80%)가 강했다.', 'Cyber Shield (+2.80%) led.', 'Cyber Shield（+2.80%）が強かった。');
    b.structured.marketOverview.keyDrivers = { ko: ['Fintech Pulse -2.36%'], en: ['Fintech Pulse -2.36%'], ja: ['Fintech Pulse -2.36%'] };
    b.structured.sectorRotation = { winners: [{ sector: 'Cyber Shield', change: '+2.80%', reason: tri('Cyber Shield 강세', 'Cyber Shield strength', 'Cyber Shield高') }] };
    C.alignSummary(b.structured);
    assert.equal(b.structured.closingNarrative.whatHappened.ko, '사이버 쉴드(+2.80%)가 강했다.');
    assert.equal(b.structured.closingNarrative.whatHappened.ja, 'サイバーシールド（+2.80%）が強かった。');
    assert.equal(b.structured.closingNarrative.whatHappened.en, 'Cyber Shield (+2.80%) led.');
    assert.deepEqual(b.structured.marketOverview.keyDrivers.ko, ['핀테크 펄스 -2.36%']);
    assert.equal(b.structured.sectorRotation.winners[0].sector, 'Cyber Shield', '언어 없는 매칭용 sector 칸은 그대로');
    assert.equal(b.structured.sectorRotation.winners[0].reason.ko, '사이버 쉴드 강세');
});
t('T4b ③: 섹터 표시명 사전 = 앱 리포트 상단 카드 사전(SECTOR_APP_COPY.name)', () => {
    const page = fs.readFileSync('src/app/[locale]/app-view/intel/page.tsx', 'utf8');
    const block = page.slice(page.indexOf('const SECTOR_APP_COPY'), page.indexOf('function toAppLocale'));
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const part = block.slice(block.indexOf(`  ${loc}: {`));
        for (const [id, names] of Object.entries(C.SECTOR_DISPLAY) as [string, Record<string, string>][]) {
            const m = new RegExp(`\\b${id}: \\{ name: '([^']+)'`).exec(part);
            assert.equal(m?.[1], names[loc], `${loc}.${id}`);
        }
    }
});
t('T4b ②③: 프롬프트 — 정규장 시간대 보도를 장후 보도보다 먼저, 섹터 displayName 포함, 원본 근거·섹터 입력 불변', () => {
    const ev: any = { sessionDate: DAY, regularClose: cash, news: [
        { id: 'market-1', publishedEt: '2026-10-22 17:23 ET', timing: 'after_cash_close', title: 'late' },
        { id: 'market-2', publishedEt: '2026-10-22 11:00 ET', timing: 'before_or_during_cash_session', title: 'mid' },
        { id: 'cyber_shield-1', publishedEt: '2026-10-22 09:24 ET', timing: 'before_or_during_cash_session', title: 'cyber' },
    ], events: [] };
    const sectors: any[] = [{ sector: 'Cyber Shield (AI Security & Zero Trust)', sectorId: 'cyber_shield', changePct: 2.8 }];
    const before = JSON.stringify({ ev, sectors });
    const prompt = C.buildClosingPrompt({ sessionDate: DAY, macroStr: '', levelsSection: '', evidence: ev, sectorSummaries: sectors, keyLevelsSchema: '', keyLevelsRequirement: '' });
    assert.ok(prompt.indexOf('"market-2"') < prompt.indexOf('"market-1"') && prompt.indexOf('"cyber_shield-1"') < prompt.indexOf('"market-1"'));
    assert.ok(prompt.indexOf('"market-2"') < prompt.indexOf('"cyber_shield-1"'), '정규장 보도끼리는 원래 순서');
    assert.match(prompt, /"displayName": \{\s*"ko": "사이버 쉴드",\s*"en": "Cyber Shield",\s*"ja": "サイバーシールド"/);
    assert.equal(JSON.stringify({ ev, sectors }), before);
    assert.match(prompt, /마감 뒤 소식:/);
    assert.match(prompt, /NEVER a cause of the session move/);
    assert.match(prompt, /ko 운송 제외 내구재 주문\(전월 대비\)/);
});
t('T4b ⑤: 배지 — 두 지수 같은 방향 ±0.30% 이상·VIX 반대 아님일 때만 MIXED·반대 톤을 판정 방향으로, CAUTIOUS·애매한 날은 그대로', () => {
    const ev = (sp: number, nq: number, vix?: number) => ({ regularClose: { spx: { changePct: sp }, nasdaq: { changePct: nq } }, readings: vix == null ? {} : { vix: { changePct: vix } } });
    const tone = (t: string, e: any) => C.settleTone({ marketOverview: { tone: t } }, e).marketOverview.tone;
    assert.equal(tone('MIXED', ev(0.70, 0.82, -5.45)), 'BULLISH', '10/26 운영 입력');
    assert.equal(tone('BEARISH', ev(0.70, 0.82, -5.45)), 'BULLISH');
    assert.equal(tone('CAUTIOUS', ev(0.70, 0.82, -5.45)), 'CAUTIOUS');
    assert.equal(tone('MIXED', ev(0.70, 0.82, 3.1)), 'MIXED', 'VIX 상승이면 그대로');
    assert.equal(tone('BEARISH', ev(-0.52, -0.21, 2.2)), 'BEARISH', '10/23: NASDAQ -0.21% 애매 — 모델 판단');
    assert.equal(tone('MIXED', ev(-0.52, -0.21, 2.2)), 'MIXED');
    assert.equal(tone('MIXED', ev(-1.2, -2.6, 4)), 'BEARISH');
    assert.equal(tone('BULLISH', ev(-1.2, -2.6)), 'BEARISH', 'VIX 없음은 반대 아님');
    assert.equal(tone('MIXED', ev(0.4, -0.5, -1)), 'MIXED', '지수 엇갈림');
    assert.equal(tone('MIXED', { regularClose: {} }), 'MIXED', '종가 없음');
});
t('T4b ②: 장후로 분류하고 본문에서 뺀 참조는 정리, 원인(reported_context)으로 분류한 장후 참조는 남겨 검사가 잡는다', () => {
    const ev: any = { news: [
        { id: 'market-10', publishedEt: '2026-10-22 10:17 ET', timing: 'before_or_during_cash_session', source: 'Kitco' },
        { id: 'market-5', publishedEt: '2026-10-22 16:36 ET', timing: 'after_cash_close', source: 'Kitco' },
    ] };
    const mk = (kind: string) => ({ closingNarrative: { why: tri('Kitco(2026-10-22 10:17 ET) 보도.', 'Kitco (2026-10-22 10:17 ET) reported.', 'Kitco（2026-10-22 10:17 ET）の報道。'),
        causeRefs: [{ newsId: 'market-10', kind: 'reported_context' }, { newsId: 'market-5', kind }] } });
    for (const kind of ['after_close', 'retrospective']) assert.deepEqual(C.alignSummary(mk(kind), ev).closingNarrative.causeRefs.map((r: any) => r.newsId), ['market-10'], kind);
    assert.deepEqual(C.alignSummary(mk('reported_context'), ev).closingNarrative.causeRefs.map((r: any) => r.newsId), ['market-10', 'market-5']);
});
t('T4b: 한국어 서사의 한자·가나는 고침 요청 사유(구체 구절 포함)', () => {
    const b: any = brief();
    b.structured.closingNarrative.why.ko = '美 10년물 금리는 보합이었고 이는 위험 회피와 整合한다. ' + b.structured.closingNarrative.why.ko;
    const reasons = closingReportProblems(b);
    assert.ok(reasons.includes('narrative:ko:script'));
    const rp = C.narrativeRepairPrompt({ sessionDate: DAY, evidence: b.reportEvidence, macroStr: '', narrative: b.structured.closingNarrative, reasons: ['narrative:ko:script'] });
    assert.match(rp, /Hangul only/); assert.match(rp, /美 10년물/);
    assert.ok(!closingReportProblems(brief()).includes('narrative:ko:script'));
});
t('T4b ②: 참조 ID 바로잡기 — 본문이 시각까지 인용한 참조 안 된 같은 출처 보도가 하나뿐일 때만', () => {
    const ev: any = { news: [
        { id: 'market-7', publishedEt: '2026-10-22 14:07 ET', timing: 'before_or_during_cash_session', source: 'FXEmpire' },
        { id: 'silicon_core-2', publishedEt: '2026-10-22 14:29 ET', timing: 'before_or_during_cash_session', source: 'FXEmpire' },
        { id: 'market-3', publishedEt: '2026-10-22 15:38 ET', timing: 'before_or_during_cash_session', source: 'CNBC' },
    ] };
    const why = tri('FXEmpire(2026-10-22 14:29 ET)와 CNBC(2026-10-22 15:38 ET) 보도.', 'FXEmpire (2026-10-22 14:29 ET) and CNBC (2026-10-22 15:38 ET).', 'FXEmpire（2026-10-22 14:29 ET）とCNBC（2026-10-22 15:38 ET）。');
    const out = C.alignSummary({ closingNarrative: { why, causeRefs: [{ newsId: 'market-7', kind: 'reported_context' }, { newsId: 'cnbc-amd', kind: 'reported_context' }] } }, ev);
    assert.deepEqual(out.closingNarrative.causeRefs.map((r: any) => r.newsId), ['silicon_core-2', 'market-3']);
    const keep = C.alignSummary({ closingNarrative: { why, causeRefs: [{ newsId: 'zzz-1', kind: 'reported_context' }] } }, ev);
    assert.deepEqual(keep.closingNarrative.causeRefs.map((r: any) => r.newsId), ['zzz-1'], '후보가 여럿이거나 출처가 안 맞으면 그대로(검사가 잡는다)');
});
t('T4b 관문 10270904: 시각 없이 장후 보도를 원인으로 쓴 글은 참조 정리·바로잡기가 검사를 지우지 않는다', () => {
    const ev: any = { news: [
        { id: 'market-10', publishedEt: '2026-10-22 10:17 ET', timing: 'before_or_during_cash_session', source: 'Kitco' },
        { id: 'market-5', publishedEt: '2026-10-22 16:36 ET', timing: 'after_cash_close', source: 'Kitco' },
    ] };
    const why = tri('Kitco(2026-10-22 10:17 ET) 보도. Kitco의 장후 보도가 하락을 이끌었다.', 'Kitco (2026-10-22 10:17 ET) reported. A Kitco after-close report drove the decline.', 'Kitco（2026-10-22 10:17 ET）の報道。Kitcoの引け後報道が下落を招いた。');
    for (const kind of ['reported_context', 'after_close', 'retrospective']) {
        const out = C.alignSummary({ closingNarrative: { why, causeRefs: [{ newsId: 'market-10', kind: 'reported_context' }, { newsId: 'market-5', kind }] } }, ev);
        assert.deepEqual(out.closingNarrative.causeRefs.map((r: any) => r.newsId), ['market-10', 'market-5'], kind);
        assert.ok(C.evidenceProblems(out, { ...ev, regularClose: cash, sessionDate: DAY }).some((r: string) => /news-time|after-close-cause/.test(r)), kind);
    }
    const solo = C.alignSummary({ closingNarrative: { why, causeRefs: [{ newsId: 'market-5', kind: 'reported_context' }] } }, ev);
    assert.deepEqual(solo.closingNarrative.causeRefs, [{ newsId: 'market-5', kind: 'reported_context' }], '장후 참조를 장중 보도로 바꾸지 않는다');
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
