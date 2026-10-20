/** 순수 구성·검사·실제 프록시 디코더만 시험. 네트워크·모델·캐시 호출 없음. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildTacticalPrompt, cachedEvidence, datedHeadline, checkTacticalOutput } from '../src/lib/ai/tacticalPrompt';
import { textIntegrityReasons } from '../src/lib/ai/textIntegrity';
import { cleanInsight, gateInsight } from '../src/lib/ai/outputGate';
import { buildLineFacts, buildLineUserPrompt, checkLineOutput, WL_LINE_SYSTEM } from '../src/lib/ai/watchlistLine';
import { checkDepthLine, watchlistNoScheduleReasons } from '../src/lib/ai/watchlistDepth';
import { newsForStock } from '../src/lib/ai/stockEvidence';
import { evidenceTime, scheduledLineAt, isUpcomingLine, evidenceValidUntil, earningsReleaseAt } from '../src/lib/ai/evidenceTime';
import { checkTacticalStored, scheduleClaimReasons } from '../src/lib/ai/tacticalPrompt';
import { liveInsight } from '../src/lib/app/watchlistAiLine';

const now = new Date('2026-10-20T15:00:00Z');
const headline = datedHeadline({ title: 'Treasury auction draws weak demand', published_utc: '2026-10-20T14:00:00Z' }, 'Polygon', now)!;
const facts = {
    rlsiScore: 34, nasdaqChange: -0.3, vix: 18.4, us10y: 5.15, us10yChangeBp: 6,
    gexIndex: 7, triggerSupport: 640, triggerCurrent: 645, triggerResistance: 650,
    marketNewsHeadlines: [headline], asOf: now.toISOString(),
    scheduledEvents: ['[economic calendar; 2026-10-21 08:30 ET] Import prices (scheduled; not a released result)'],
};
let count = 0;
function test(name: string, fn: () => void) { fn(); count++; console.log(`ok - ${name}`); }

test('dated evidence: ET 오늘·발행시각·출처·FMP DST 변환, 누락/미래/손상 배제', () => {
    assert.match(headline, /Polygon; 2026-10-20T14:00:00.000Z/);
    assert.match(datedHeadline({ title: 'FMP news', publishedDate: '2026-10-20 10:00:00' }, 'FMP', now)!, /T14:00:00/);
    for (const published_utc of ['', 'bad', '2026-10-21T14:00:00Z', '2026-10-19T14:00:00Z']) assert.equal(datedHeadline({ title: 'x', published_utc }, 'Polygon', now), null);
    assert.equal(datedHeadline({ title: '깨진\uFFFD글', published_utc: now.toISOString() }, 'Polygon', now), null);
});

test('NEWS PULSE·경제·실적은 기존 캐시 모양에서만, 지난/오래된 일정 제외', () => {
    const e = cachedEvidence({ items: [{ headline: 'Stock news NVDA', publishedAt: now.toISOString() }] },
        { updatedAt: now.toISOString(), events: [{ date: '2026-10-21', time: '08:30', event: 'Import prices' }, { date: '2026-10-19', event: 'Past' }] },
        { generatedAt: now.toISOString(), rows: [{ date: '2026-10-20', hour: 'amc', ticker: 'ZZZ', dateStatus: 'est' }] }, now);
    assert.equal(e.news.length, 1);
    assert.ok(e.events.length >= 2);
    assert.ok(e.events.some(x => /ZZZ.*estimated schedule/.test(x)));
    assert.ok(!e.events.some(x => /Past/.test(x)));
    assert.ok(cachedEvidence(null, { updatedAt: now.toISOString(), events: [{ date: '2026-10-20', time: '08:30', event: 'Already released' }] }, null, now).events.length === 0);
    assert.equal(cachedEvidence(null, { updatedAt: '2026-10-19T00:00:00Z', events: [{ date: '2026-10-21', event: 'Stale' }] }, null, now).events.length, 0);
});

test('원천별 시간대: econ UTC · FMP 뉴스/실적 ET · 명시 오프셋과 정규화 UTC 우선', () => {
    for (const [date, utc, et] of [['2026-10-20', '12:30', '08:30'], ['2026-12-01', '12:30', '07:30']]) {
        const econ = evidenceTime('fmp:econ-calendar', `${date} ${utc}`)!;
        assert.equal(econ.iso, `${date}T12:30:00.000Z`);
        assert.equal(econ.time, et);
        for (const source of ['fmp:news', 'wall:et'] as const) {
            assert.equal(evidenceTime(source, `${date} ${et}`)?.iso, econ.iso);
            assert.equal(evidenceTime(source, `${date}T12:30:00Z`)?.iso, econ.iso);
        }
    }
    assert.equal(evidenceTime('fmp:news', '2026-11-01T01:30:00-05:00')?.iso, '2026-11-01T06:30:00.000Z');
    assert.equal(evidenceTime('fmp:econ-calendar', '2026-10-20 12:30:45')?.iso, '2026-10-20T12:30:45.000Z');
    assert.match(datedHeadline({ title: 'Normalized news', published_utc: '2026-10-20T14:00:00Z', publishedDate: '2026-10-20 12:00:00' }, 'FMP', now)!, /T14:00:00.000Z/);
    for (const value of [undefined, '', '2026-02-30 12:30', '2026-10-20 24:00', '2026-10-20 bad', '2026-10-20']) {
        assert.equal(evidenceTime('fmp:econ-calendar', value), null);
    }
    assert.equal(evidenceTime('fmp:news', '2026-03-08 02:30:00'), null);
});

test('관문 재현: UTC 12:30 → 여름 08:30/겨울 07:30 ET, 경과한 일정은 Tactical 입력에서 제외', () => {
    for (const [date, et, before, after] of [
        ['2026-10-20', '08:30', '2026-10-20T12:00:00Z', '2026-10-20T13:00:00Z'],
        ['2026-12-01', '07:30', '2026-12-01T12:00:00Z', '2026-12-01T14:00:00Z'],
    ]) {
        const eventsAt = (iso: string) => cachedEvidence(null, { updatedAt: iso, events: [{ date, time: '12:30', event: 'Fixed macro release' }] }, null, new Date(iso));
        const upcoming = eventsAt(before);
        assert.deepEqual(upcoming.marketEvents, [`[economic calendar; ${date} ${et} ET] Fixed macro release (scheduled; not a released result)`]);
        assert.deepEqual(upcoming.events, upcoming.marketEvents);
        assert.ok(buildTacticalPrompt({ ...facts, asOf: before, scheduledEvents: upcoming.events }, 'en').includes(upcoming.marketEvents[0]));
        for (const iso of [`${date}T12:30:00Z`, after]) {
            const elapsed = eventsAt(iso);
            assert.deepEqual(elapsed.events, []);
            assert.doesNotMatch(buildTacticalPrompt({ ...facts, asOf: iso, scheduledEvents: elapsed.events }, 'en'), /Fixed macro release|12:30 ET/);
        }
    }
});

test('3월·11월 DST 경계: UTC 순간으로 판정, ET 중복 시각에도 지난 일정 재등장 없음', () => {
    for (const [date, first, second, firstET, secondET] of [
        ['2026-03-08', '06:59', '07:00', '01:59', '03:00'],
        ['2026-11-01', '05:59', '06:00', '01:59', '01:00'],
    ]) {
        assert.equal(evidenceTime('fmp:econ-calendar', `${date} ${first}`)?.time, firstET);
        assert.equal(evidenceTime('fmp:econ-calendar', `${date} ${second}`)?.time, secondET);
        const iso = `${date}T${first}:30Z`;
        const e = cachedEvidence(null, { updatedAt: iso, events: [
            { date, time: first, event: 'Elapsed before DST switch' },
            { date, time: second, event: 'Upcoming after DST switch' },
        ] }, null, new Date(iso));
        assert.equal(e.marketEvents.length, 1);
        assert.match(e.marketEvents[0], new RegExp(`${secondET} ET.*Upcoming after DST switch`));
        for (const source of ['fmp:news', 'wall:et'] as const) {
            const wall = date === '2026-03-08' ? '03:00' : '02:00';
            assert.equal(evidenceTime(source, `${date} ${wall}`)?.iso, `${date}T07:00:00.000Z`);
        }
    }
});

test('UTC 자정의 ET 날짜 이동: 내일 UTC→오늘 ET, 모레 UTC→내일 ET, 시각 없는 일정 제외', () => {
    const iso = '2026-10-20T23:00:00Z';
    const e = cachedEvidence(null, { updatedAt: iso, events: [
        { date: '2026-10-21', time: '02:00', event: 'Tonight' },
        { date: '2026-10-22', time: '02:00', event: 'Tomorrow night' },
        { date: '2026-10-21', event: 'Unknown time' }, null,
    ] }, null, new Date(iso));
    assert.equal(e.marketEvents.length, 2);
    assert.match(e.marketEvents[0], /2026-10-20 22:00 ET.*Tonight/);
    assert.match(e.marketEvents[1], /2026-10-21 22:00 ET.*Tomorrow night/);
});

test('종목 뉴스: A/ET 오탐 재현·공급사 태그 우선·태그 없을 때 제목의 명시적 표기만', () => {
    const evidence = (headline: string, extra = {}) => cachedEvidence({ items: [{ headline, publishedAt: now.toISOString(), ...extra }] }, null, null, now).stockNews[0];
    assert.equal(newsForStock(evidence('A new Apple product launch'), 'A'), false);
    assert.equal(newsForStock(evidence('CPI release at 08:30 ET'), 'ET'), false);
    assert.equal(newsForStock(evidence('$A Agilent Technologies, Inc.'), 'A'), false);
    assert.equal(newsForStock(evidence('Energy Transfer LP $ET'), 'ET'), false);
    assert.equal(newsForStock(evidence('A new Apple product launch', { tickers: ['AAPL'] }), 'A'), false);
    assert.equal(newsForStock(evidence('Supplier article', { symbols: ['a'] }), 'A'), true);
    assert.equal(newsForStock(evidence('Supplier article', { tickers: ['ET'] }), 'ET'), true);
    assert.equal(newsForStock(evidence('NVDA supply contract', { tickers: ['AAPL'] }), 'NVDA'), false);
    for (const h of ['NVDA supply contract', '$NVDA supply contract', 'NVIDIA Corporation signs agreement', 'Results from NVDA.']) assert.equal(newsForStock(evidence(h), 'NVDA'), true, h);
    for (const h of ['nvda supply contract', 'XNVDA supply contract', 'NVDA2 supply contract', 'NVDA.B supply contract', 'Unknown company']) assert.equal(newsForStock(evidence(h, { description: 'NVDA supply contract' }), 'NVDA'), false, h);
    assert.equal(newsForStock(evidence('BRK.B report'), 'BRK.B'), true);
    assert.equal(newsForStock(evidence('BRKxB report'), 'BRK.B'), false);
    // 시장 전체 경제 일정은 종목 실적 목록에 들어가지 않는다.
    const e = cachedEvidence(null, { updatedAt: now.toISOString(), events: [{ date: '2026-10-21', time: '08:30', event: 'CPI 08:30 ET' }] }, null, now);
    assert.equal(e.stockEvents.length, 0);
    assert.match(e.marketEvents[0], /CPI/);
});

test('실적 WFC 07:00 ET: 08:00에는 발표됨·실제치 포함, 가디언/내 종목 같은 입력', () => {
    const at = new Date('2026-10-13T12:00:00Z'); // 08:00 EDT
    const e = cachedEvidence(null, null, { generatedAt: at.toISOString(), rows: [{ ticker: 'WFC', date: '2026-10-13', hour: 'bmo', epsActual: 1.6, revenueActual: 20000000000 }] }, at);
    const own = e.stockEvents.find(x => x.ticker === 'WFC')!.text;
    assert.match(own, /07:00 ET.*WFC \(released; epsActual=1.6; revenueActual=20000000000/);
    assert.doesNotMatch(own, /scheduled|estimated/);
    assert.ok(e.events.includes(own));
    const p = buildTacticalPrompt({ ...facts, asOf: at.toISOString(), scheduledEvents: e.events }, 'en');
    assert.ok(p.includes(own));
    assert.match(p, /released or release status unconfirmed are NEVER upcoming/);
    const before = new Date('2026-10-13T10:59:59Z');
    const beforeRows = cachedEvidence(null, null, { generatedAt: before.toISOString(), rows: [{ ticker: 'WFC', date: '2026-10-13', hour: 'bmo' }] }, before);
    assert.match(beforeRows.stockEvents.find(x => x.ticker === 'WFC')!.text, /07:00 ET.*scheduled; not a released result/);
});

test('실적: 공급사 분 단위 시각 우선·BMO 당일=미확인/AMC 16:00 경계·시각 미상·겨울 ET', () => {
    const rowAt = (iso: string, row: any) => {
        const at = new Date(iso);
        return cachedEvidence(null, null, { generatedAt: iso, rows: [row] }, at).stockEvents.find(e => e.ticker === row.ticker)!.text;
    };
    const row = { ticker: 'ZZZ', date: '2026-10-20', hour: 'bmo' };
    assert.match(rowAt('2026-10-20T12:00:00Z', { ...row, etTime: '08:15' }), /08:15 ET.*scheduled/);
    assert.match(rowAt('2026-10-20T12:15:00Z', { ...row, etTime: '08:15' }), /released; actuals unavailable/);
    // BMO 만 알면 장전 06:00~09:15 어디든 가능 — 당일에는 «예정»이라 말하지 않는다(관문 1차 WFC 07:00 계열).
    assert.match(rowAt('2026-10-20T04:01:00Z', row), /BMO; exact release time unknown\] ZZZ \(release status unconfirmed\)/);
    assert.match(rowAt('2026-10-20T11:59:59Z', row), /release status unconfirmed/);
    assert.doesNotMatch(rowAt('2026-10-20T11:59:59Z', row), /scheduled/);
    assert.match(rowAt('2026-10-19T23:00:00Z', row), /BMO; exact release time unknown\] ZZZ \(estimated schedule; scheduled/);   // 전날 19:00 ET = 내일 예정
    assert.match(rowAt('2026-10-20T19:59:59Z', { ...row, hour: 'amc' }), /AMC timing boundary 16:00 ET.*scheduled/);
    assert.match(rowAt('2026-10-20T20:00:00Z', { ...row, hour: 'amc' }), /release status unconfirmed; AMC timing boundary elapsed/);
    assert.match(rowAt('2026-10-20T20:00:00Z', { ...row, hour: 'amc', etTime: '16:30' }), /16:30 ET.*scheduled/);
    assert.match(rowAt('2026-10-20T20:00:00Z', { ...row, hour: '' }), /release status unconfirmed/);
    assert.match(rowAt('2026-10-20T12:00:00Z', { ...row, hour: '', epsActual: 0 }), /released; epsActual=0/);
    // 겨울(EST, UTC−5): AMC 16:00 ET = 21:00 UTC
    assert.match(rowAt('2026-12-01T20:59:59Z', { ...row, date: '2026-12-01', hour: 'amc' }), /scheduled/);
    assert.match(rowAt('2026-12-01T21:00:00Z', { ...row, date: '2026-12-01', hour: 'amc' }), /release status unconfirmed/);
    assert.match(rowAt('2026-12-01T13:29:59Z', { ...row, date: '2026-12-01', etTime: '08:30' }), /08:30 ET.*scheduled/);
    assert.match(rowAt('2026-12-01T13:30:00Z', { ...row, date: '2026-12-01', etTime: '08:30' }), /released/);
    // DST 전환일 23:30 ET에서도 «내일»은 하루만 이동한다.
    assert.match(rowAt('2026-11-02T04:30:00Z', { ...row, date: '2026-11-02' }), /scheduled/);
    assert.match(rowAt('2026-03-08T04:30:00Z', { ...row, date: '2026-03-08' }), /scheduled/);
});

test('ko/en/ja: 뉴스→전이+고유자원→한 가지 확인, 공백 350자 계약', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(facts, loc);
        assert.match(p, /WHY[\s\S]*SO WHAT[\s\S]*NEXT/);
        assert.match(p, /at least one available proprietary resource/);
        assert.match(p, /exactly ONE supplied/);
        assert.match(p, /Maximum 350 characters/);
        assert.match(p, /auction draws weak demand/);
        assert.match(p, /2026-10-21 08:30 ET/);
    }
    const p = buildTacticalPrompt({ ...facts, divergenceCase: 'A' } as typeof facts, 'ko');
    assert.match(p, /Divergence.*never a replacement/);
});

test('3문장·뉴스 출처/시각·두 번째 문장 고유자원 출구 검사', () => {
    const p = buildTacticalPrompt(facts, 'ko');
    const good = 'Polygon 10:00 ET 보도한 국채 입찰 수요 약화와 금리 압력이 연결돼 해석됩니다. 시장 참여 약화에 얇은 감마 방어가 겹쳐 충격 흡수력이 제한적입니다. 옵션 지지선 640 유지 여부가 다음 확인 기준입니다.';
    assert.deepEqual(checkTacticalOutput(good, 'ko', p), []);
    assert.ok(checkTacticalOutput(good.replace('Polygon 10:00 ET ', ''), 'ko', p).includes('tactical:news-source-time-required'));
    assert.ok(checkTacticalOutput(good.replace('감마 방어', '수급'), 'ko', p).includes('tactical:positioning-required'));
    assert.ok(checkTacticalOutput(good.split('. ').slice(0, 2).join('. '), 'ko', p).includes('tactical:three-sentences'));
});

test('뉴스 없는 입력: 명시적 미확인, 옛 코어의 무시각 헤드라인 제외', () => {
    const p = buildTacticalPrompt({ ...facts, marketNewsHeadlines: ['Fed cuts rates'] }, 'ko');
    assert.match(p, /TODAY_NEWS: \[\]/);
    assert.match(p, /cause is unconfirmed/);
    assert.doesNotMatch(p.slice(p.indexOf('TODAY_NEWS:')), /Fed cuts/);
    assert.ok(checkTacticalOutput('연준의 금리 인하 발표가 오늘 시장을 움직였습니다.', 'ko', p).some(r => r.startsWith('event:unsupported:')));
    assert.ok(checkTacticalOutput('확인한 자료를 바탕으로 지금 매수하세요.', 'ko', p).includes('tactical:advice'));
    assert.ok(checkTacticalOutput('x'.repeat(351), 'en', p).includes('tactical:too-long'));
    assert.ok(checkTacticalOutput('Options support is 99999.', 'en', p).includes('tactical:number'));
    assert.ok(!checkTacticalOutput('Macro cause is unconfirmed. Dealer gamma buffers pressure. The next test going forward is options support.', 'en', p).some(r => r.startsWith('event:unsupported:')));
});

test('출력 검사: U+FFFD·제어문자·미완성 surrogate·다른 언어 거절, 정상 본문 보존', () => {
    const text = '국채 입찰 수요 약화와 금리 압력이 연결돼 해석되며 감마 방어는 약합니다.';
    assert.equal(textIntegrityReasons(text).length, 0);
    for (const bad of ['\uFFFD', '\u0000', '\u000B', '\uD800']) {
        assert.ok(textIntegrityReasons(text + bad).length);
        assert.equal(gateInsight(text + bad, 'ko', { now }).ok, false);
    }
    assert.ok(cleanInsight(text + '\uFFFD').includes('\uFFFD'));
    assert.ok(checkTacticalOutput(text + 'に', 'ko', buildTacticalPrompt(facts, 'ko')).includes('language:mixed-script'));
});

const row = { price: 145, maxPain: 155, callWall: 160, putFloor: 135, gammaFlipLevel: 140, levelsChainDate: '2026-10-20', levelsExpiration: '2026-10-23', levelsSource: 'structure', darkPoolPct: 40, darkPoolDate: '2026-10-20' };
const f = buildLineFacts('NVDA', row)!;
const chips = { ko: 'Put Floor $135 위 {PF} · Max Pain $155 아래 {MP}', en: '{PF} above Put Floor $135 · {MP} below Max Pain $155', ja: 'Put Floor $135の{PF}上 · Max Pain $155の{MP}下' };
const insight = { ko: '장외 비중은 방향 미확정, 감마 방어가 변수', en: 'Off-exchange share cannot confirm gamma support', ja: '場外比率だけでは方向不明、ガンマ防御の維持が焦点' };
test('기존 칩 유지 + 별도 3언어 인사이트, 자료 없을 때 null', () => {
    const c = checkLineOutput(JSON.stringify({ ...chips, insight }), f);
    assert.equal(c.ok, true, c.reasons.join(','));
    assert.deepEqual(c.insight, insight);
    assert.equal(checkLineOutput(JSON.stringify(chips), f).ok, true);
    // 해석이 없거나(10/20 실제 모델 insight:null) 근거 없는 해석이면 해석만 버리고 칩 줄은 통과 — 칩 줄이 해석 때문에 사라지지 않는다
    assert.equal(checkLineOutput(JSON.stringify({ ...chips, insight: null }), f).insight, undefined);
    assert.equal(checkLineOutput(JSON.stringify({ ...chips, insight: null }), f).ok, true);
    const noCtx = checkLineOutput(JSON.stringify({ ...chips, insight }), { ...f, darkPool: null });
    assert.equal(noCtx.ok, true);
    assert.equal(noCtx.insight, undefined);
    const oneBad = checkLineOutput(JSON.stringify({ ...chips, insight: { ...insight, ko: '연준 금리 인하가 지어낸 원인' } }), f);
    assert.equal(oneBad.ok, true);
    assert.deepEqual(oneBad.insight, { en: insight.en, ja: insight.ja }, '탈락한 언어만 빠진다(사용자는 자기 언어만 본다)');
    assert.ok(oneBad.insightReasons!.some(r => r.startsWith('ko:')));
    // 10/20 실제 모델 응답 모양: 칩 줄이 한 겹 안에 · 해석이 지표 나열(« · »)이면 해석만 버림
    const nested = checkLineOutput(JSON.stringify({ options_map: chips, insight: { ko: '장외 비중 39.9% · 옵션 예상 변동 ±3.1%', en: 'Off-exchange 39.9% · implied move ±3.1%', ja: '場外比率39.9% · 想定変動幅±3.1%' } }), f);
    assert.equal(nested.ok, true, nested.reasons.join(','));
    assert.deepEqual(nested.text, chips);
    assert.equal(nested.insight, undefined);
    assert.match(WL_LINE_SYSTEM, /FINAL OUTPUT SCHEMA/);
    // 한도 넘는 해석은 첫 절만(10/20 실제 모델 ko 응답) · 첫 절도 길면 탈락
    const long = checkLineOutput(JSON.stringify({ ...chips, insight: { ko: '양감마 구간이라 딜러 헤지가 변동을 누르는 자리, 만기까지 되돌림 압력 있음', en: 'Positive gamma: dealer hedging dampens swings', ja: '正ガンマ圏でヘッジ売買が値動きを抑えやすく、満期まで続く位置' } }), f);
    assert.deepEqual(long.insight, { ko: '양감마 구간이라 딜러 헤지가 변동을 누르는 자리', en: 'Positive gamma: dealer hedging dampens swings', ja: '正ガンマ圏でヘッジ売買が値動きを抑えやすく、満期まで続く位置' }, (long.insightReasons || []).join(','));
    assert.match(WL_LINE_SYSTEM, /chip lines stay top-level strings exactly/);
    assert.match(buildLineUserPrompt(f), /FINRA.*2026-10-20/);
});
test('카드: 인사이트의 첫 열은 기존 AI 너비 보존, 공유 버튼 고정 열과 분리', () => {
    const page = readFileSync('src/app/[locale]/app-view/watchlist/page.tsx', 'utf8');
    assert.match(page, /r\.aiInsight && <p className=\{p\.ai\}><span className=\{`\$\{p\.aiTag\} invisible`\} aria-hidden="true"/);
    const css = readFileSync('src/app/[locale]/app-view/watchlist/watchlist.module.css', 'utf8');
    assert.match(css, /\.aiShare \{ position: absolute; z-index: 2; left: -2px; top: 10px; \}/);
});

test('인사이트: 없는 사건·숫자·권유·제어문자·혼용·초과 길이 차단', () => {
    for (const bad of ['연준 금리 인하로 감마 방어가 강해졌습니다', '장외 비중 99%가 감마 방어를 지지합니다', '지금 매수하세요', insight.ko + '\uFFFD', insight.ko + 'に', '가'.repeat(37)]) {
        assert.ok(checkDepthLine(bad, 'ko', f.factsText).length, bad);
    }
    assert.equal(checkLineOutput(JSON.stringify({ ...chips, ko: chips.ko + '\u0000' }), f).ok, false);
});

test('시각 판정 정본(evidenceTime): 근거 줄·실적 경계·유효 기한 — 여름·겨울·정각 경계', () => {
    for (const [day, utc] of [['2026-10-20', '12:30'], ['2026-12-01', '13:30']]) {
        const release = Date.parse(`${day}T${utc}:00Z`);           // 08:30 ET
        const econ = cachedEvidence(null, { updatedAt: new Date(release - 3600_000).toISOString(), events: [{ date: day, time: utc, event: 'CPI' }] }, null, new Date(release - 3600_000)).marketEvents[0];
        assert.match(econ, new RegExp(`\\[economic calendar; ${day} 08:30 ET\\] CPI`));
        assert.equal(scheduledLineAt(econ), release);
        assert.equal(isUpcomingLine(econ, release - 1), true);
        assert.equal(isUpcomingLine(econ, release), false, '정각부터 예정 아님');
        assert.equal(evidenceValidUntil([econ], release - 3600_000), release);
        assert.equal(evidenceValidUntil([econ], release), release, '이미 지난 예정으로 만든 글은 처음부터 무효');
        assert.equal(earningsReleaseAt(day, 'amc', null)!.ms, Date.parse(`${day}T${utc === '12:30' ? '20' : '21'}:00:00Z`));
        assert.equal(earningsReleaseAt(day, 'bmo', null)!.ms, Date.parse(`${day}T0${utc === '12:30' ? '4' : '5'}:00:00Z`));
        assert.equal(earningsReleaseAt(day, 'bmo', '07:00')!.ms, Date.parse(`${day}T${utc === '12:30' ? '11' : '12'}:00:00Z`));
    }
    // 예정 줄이 아니면(발표됨·미확인) 기한·예정 판정에서 빠진다
    assert.equal(scheduledLineAt('[earnings calendar; 2026-10-20; 07:00 ET] WFC (released; epsActual=1.6)'), null);
    // 날짜만 있는 «내일» 예정은 그 날짜 0시(ET)에 예정이 끝난다
    assert.equal(scheduledLineAt('[earnings calendar; 2026-10-21; release time unknown] X (estimated schedule; scheduled; not a released result)'), Date.parse('2026-10-21T04:00:00Z'));
});

test('읽기 검사(저장본·복구): 지난 예정만 막고 멀쩡한 옛 글·자정 뒤 장외 글은 살린다', () => {
    const at = '2026-10-20T12:31:00Z';   // 08:31 ET
    const base = { ...facts, asOf: at, marketNewsHeadlines: [], scheduledEvents: ['[economic calendar; 2026-10-20 08:30 ET] CPI (scheduled; not a released result)', '[economic calendar; 2026-10-20 10:00 ET] ISM (scheduled; not a released result)'] };
    const p = (loc: 'ko' | 'en' | 'ja') => buildTacticalPrompt(base, loc);
    assert.ok(!p('en').includes('08:30 ET] CPI'), '지난 예정은 프롬프트에서도 빠진다');
    assert.ok(checkTacticalStored('A. B. The next test is CPI scheduled at 08:30 ET.', p('en')).length > 0);
    assert.ok(checkTacticalStored('가. 나. 다음 확인은 오전 8시 30분 소비자물가 발표 예정입니다.', p('ko')).length > 0);
    assert.ok(checkTacticalStored('甲。乙。次の確認は8時30分のCPI発表予定です。', p('ja')).length > 0);
    assert.deepEqual(checkTacticalStored('A. B. The next test is ISM scheduled at 10:00 ET.', p('en')), []);
    // 옛 형식(10/19 이전 프롬프트)의 «변수» 서술 — 예정 주장이 아니므로 그대로 내보낸다(장외 «준비 중» 전환 없음)
    const old = '10년물 금리가 오르며 성장주 차익 매물이 나왔다. RLSI 37과 공포탐욕 34가 내부 체력 약화를 보여 준다. 연준 정책 경로와 7,500 옵션 지지선이 방향을 가를 변수다.';
    const midnight = buildTacticalPrompt({ ...facts, asOf: '2026-10-21T05:00:00Z', marketNewsHeadlines: [], scheduledEvents: [] }, 'ko');
    assert.deepEqual(checkTacticalStored(old, midnight), []);
    assert.deepEqual(checkTacticalStored('가. 나. 다음 확인 기준은 미확인입니다.', midnight), []);
    // 내 종목 해석: «발표 뒤» 서술은 정상, «예정» 주장은 앞으로 있을 예정만
    const lines = ['[earnings calendar; 2026-10-20; 07:00 ET] WFC (released; epsActual=1.6)'];
    assert.deepEqual(scheduleClaimReasons('실적 발표 뒤 옵션 벽 위 유지', lines, Date.parse(at), 'claims'), []);
    assert.ok(scheduleClaimReasons('07:00 실적 발표 예정', lines, Date.parse(at), 'claims').length > 0);
    assert.deepEqual(scheduleClaimReasons('3시간 동안 옵션 벽 위 유지', lines, Date.parse(at), 'claims'), [], '«3시간»은 시각이 아니다');
});

test('관문 5차 재현 4건: 감마 부호·ET 시각 오기·명칭군 밖/다른 회사 예정·화면 기한', () => {
    // ① 양감마(가격 145 > Gamma Flip 140) 근거에 «음감마» 해석 → 탈락, 맞는 부호·Max Pain 아래는 통과
    const src = buildLineUserPrompt(f);
    assert.match(src, /positive gamma zone/);
    for (const [loc, t] of [['ko', '음감마라 딜러 헤지가 변동을 키우는 자리'], ['en', 'Negative gamma: dealer hedging amplifies moves'], ['ja', '負ガンマでヘッジ売買が値動きを増幅する位置']] as const)
        assert.ok(checkDepthLine(t, loc, src).includes('insight:gamma-sign'), `${loc} ${t}`);
    assert.deepEqual(checkDepthLine('양감마라 딜러 헤지가 변동을 누르는 자리', 'ko', src), []);
    assert.ok(checkDepthLine('Max Pain 위라 만기 쪽 되돌림 압력', 'ko', src).includes('insight:level-side'));
    // ② 뉴스 14:00Z = 10:00 ET → «14:00 ET»(UTC 숫자에 ET) 탈락 · «UTC» 표기 탈락 · «10:00 ET» 통과
    const p = buildTacticalPrompt(facts, 'en');
    assert.match(p, /Polygon; 2026-10-20T14:00:00.000Z; 10:00 ET\]/);
    const tail = ' Weak breadth and thin dealer gamma leave limited absorption. The options support at 640 is the next test.';
    assert.ok(checkTacticalOutput('Polygon reported weak Treasury auction demand at 14:00 ET.' + tail, 'en', p).includes('tactical:news-source-time-required'));
    assert.ok(checkTacticalOutput('Polygon reported weak Treasury auction demand at 14:00 UTC.' + tail, 'en', p).includes('tactical:utc-time'));
    assert.deepEqual(checkTacticalOutput('Polygon reported weak Treasury auction demand at 10:00 ET.' + tail, 'en', p), []);
    // ③ 예정 근거가 없는데 «ISM scheduled later today» · 내일 INTC 만 있는데 «오늘 밤 TSLA 실적 예정» → 탈락
    const empty = buildTacticalPrompt({ ...facts, scheduledEvents: [] }, 'en');
    assert.ok(checkTacticalStored('A. B. ISM is scheduled later today.', empty).some((r: string) => r.startsWith('schedule:')));
    const intc = buildTacticalPrompt({ ...facts, scheduledEvents: ['[earnings calendar; 2026-10-21; AMC timing boundary 16:00 ET; exact release time unknown] INTC (confirmed; scheduled; not a released result)'] }, 'ko');
    const r = checkTacticalStored('가. 나. 오늘 밤 TSLA 실적 발표 예정이 다음 확인입니다.', intc);
    assert.ok(r.some((r: string) => r.startsWith('schedule:')), r.join(','));
    assert.ok(checkTacticalStored('가. 나. 오늘 밤 INTC 실적 발표 예정이 다음 확인입니다.', intc).some((r: string) => r.startsWith('schedule:')));
    assert.deepEqual(checkTacticalStored('가. 나. 내일 INTC 실적 발표 예정이 다음 확인입니다.', intc), []);
    // ④ 화면: 응답의 insightUntil 이 지나면 15분 캐시 안이어도 그리지 않는다
    const e = { insight: '08:30 실적 발표 예정', insightUntil: Date.parse('2026-10-20T12:30:00Z') };
    assert.equal(liveInsight(e, Date.parse('2026-10-20T12:29:59Z')), e.insight);
    assert.equal(liveInsight(e, Date.parse('2026-10-20T12:30:00Z')), null);
    assert.equal(liveInsight({ insight: 'x' }, 0), 'x');
});

test('관문 6차 재현: 어순 무관 감마 부호 · 번역된 회사명 · 일정 조각 합치기 · 옵션 경계+내일 정상', () => {
    const src = buildLineUserPrompt(f);   // 양감마
    for (const [loc, t] of [['ko', '감마가 음수라 딜러 헤지가 변동을 키우는 자리'], ['en', 'Dealer gamma is negative here, so hedging adds to swings'], ['ja', 'ガンマがマイナスでヘッジが値動きを増幅']] as const)
        assert.ok(checkDepthLine(t, loc, src).includes('insight:gamma-sign'), `${loc} ${t}`);
    const intcToday = buildTacticalPrompt({ ...facts, scheduledEvents: ['[earnings calendar; 2026-10-20; 16:00 ET] INTC (confirmed; scheduled; not a released result)'] }, 'ko');
    assert.ok(checkTacticalStored('가. 나. 오늘 밤 테슬라 실적 발표 예정이 다음 확인입니다.', intcToday).some((r: string) => r.startsWith('schedule:')));
    assert.ok(checkTacticalOutput('Polygon 10:00 ET 보도한 국채 입찰 수요 약화와 금리 압력이 연결돼 해석됩니다. 시장 참여 약화에 얇은 감마 방어가 겹쳐 충격 흡수력이 제한적입니다. 오늘 밤 테슬라 실적 발표 예정이 다음 확인 기준입니다.', 'ko', intcToday).some((r: string) => r.startsWith('schedule:')));
    assert.deepEqual(checkTacticalStored('가. 나. 오늘 16:00 ET INTC 실적 발표 예정이 다음 확인입니다.', intcToday), []);
    const cpiPpi = buildTacticalPrompt({ ...facts, asOf: '2026-10-20T11:00:00Z', scheduledEvents: ['[economic calendar; 2026-10-20 08:30 ET] CPI (scheduled; not a released result)', '[economic calendar; 2026-10-21 08:30 ET] PPI (scheduled; not a released result)'] }, 'en');
    assert.ok(checkTacticalStored('A. B. CPI is scheduled tomorrow at 08:30 ET.', cpiPpi).some((r: string) => r.startsWith('schedule:')));
    assert.deepEqual(checkTacticalStored('A. B. PPI is scheduled tomorrow at 08:30 ET.', cpiPpi), []);
    assert.deepEqual(checkTacticalStored('A. B. CPI is scheduled today at 08:30 ET.', cpiPpi), []);
    const none = buildTacticalPrompt({ ...facts, scheduledEvents: [] }, 'en');
    assert.deepEqual(checkTacticalStored('A. B. The next test is options support at 640 tomorrow.', none), []);
    assert.deepEqual(checkTacticalOutput('Polygon reported weak Treasury auction demand at 10:00 ET. Weak breadth and thin dealer gamma leave limited absorption. The next test is options support at 640 tomorrow.', 'en', none), []);
    // 내 종목: 자기 종목 실적 줄은 이름 없이도 같은 종목
    const own = 'FACTS — NVDA (x)\n[earnings calendar; 2026-10-21; AMC timing boundary 16:00 ET; exact release time unknown] NVDA (confirmed; scheduled; not a released result)';
    assert.deepEqual(scheduleClaimReasons('내일 실적 발표 예정, 예상 변동 안', [own.split('\n')[1]], Date.parse('2026-10-20T15:00:00Z'), 'claims', 'NVDA'), []);
    assert.ok(scheduleClaimReasons('오늘 밤 실적 발표 예정', [own.split('\n')[1]], Date.parse('2026-10-20T15:00:00Z'), 'claims', 'NVDA').length > 0);
});

test('관문 7차 재현: 자기 종목 카드의 다른 회사 · 미확인어 우회 · 명시 날짜 · 복수 사건 · 감마 수식어 오탈락', () => {
    const now = Date.parse('2026-10-20T15:00:00Z');
    const nvdaTomorrow = '[earnings calendar; 2026-10-21; AMC timing boundary 16:00 ET; exact release time unknown] NVDA (confirmed; scheduled; not a released result)';
    assert.ok(scheduleClaimReasons('테슬라 실적 발표 예정이 변수', [nvdaTomorrow], now, 'claims', 'NVDA').length > 0);
    assert.ok(scheduleClaimReasons('TSLA earnings scheduled tomorrow', [nvdaTomorrow], now, 'claims', 'NVDA').length > 0);
    assert.deepEqual(scheduleClaimReasons('내일 실적 발표 예정, 예상 변동 안', [nvdaTomorrow], now, 'claims', 'NVDA'), []);
    assert.deepEqual(scheduleClaimReasons('엔비디아 내일 실적 발표 예정', [nvdaTomorrow], now, 'claims', 'NVDA'), []);
    const ev = ['[economic calendar; 2026-10-20 08:30 ET] CPI (scheduled; not a released result)', '[economic calendar; 2026-10-21 08:30 ET] PPI (scheduled; not a released result)'];
    const early = Date.parse('2026-10-20T11:00:00Z');   // 07:00 ET
    for (const t of ['CPI is scheduled tomorrow at 08:30 ET; actuals are unknown.', 'CPI is scheduled on 2026-10-21 at 08:30 ET.', 'CPI is scheduled on 10/21 at 08:30 ET.', 'CPI and PPI are scheduled tomorrow at 08:30 ET.'])
        for (const mode of ['strict', 'claims'] as const) assert.ok(scheduleClaimReasons(t, ev, early, mode).some((r: string) => r.startsWith('schedule:')), `${mode} ${t}`);
    for (const t of ['PPI is scheduled on 2026-10-21 at 08:30 ET.', 'CPI is scheduled today at 08:30 ET and PPI tomorrow at 08:30 ET.'.split(' and ')[0] + '.', 'The next test is unconfirmed.'])
        assert.deepEqual(scheduleClaimReasons(t, ev, early, 'strict'), [], t);
    const src = buildLineUserPrompt(f);   // 양감마
    assert.deepEqual(checkDepthLine('Positive gamma buffers negative shocks', 'en', src), []);
    assert.deepEqual(checkDepthLine('양감마가 부정적 충격을 완충하는 자리', 'ko', src), []);
    assert.ok(checkDepthLine('Gamma is negative, hedging adds to swings', 'en', src).includes('insight:gamma-sign'));
});

test('관문 8차 재현: 내 종목 해석 일정·타사 금지 · 감마 노출/순 부호 · 현지어 맥스페인 · 연도 · 시각 표기 · 경계 시각', () => {
    const src = buildLineUserPrompt(f);   // NVDA · 양감마 · Max Pain 아래
    for (const t of ['IBM earnings scheduled tomorrow', 'Earnings scheduled tomorrow, implied move', '테슬라 소식이 Call Wall 앞에서 시험받는 자리'])
        assert.ok(checkDepthLine(t, /[가-힣]/.test(t) ? 'ko' : 'en', src).some(r => r === 'insight:schedule' || r === 'insight:other-name'), t);
    assert.ok(checkDepthLine('감마 노출이 음수라 변동을 증폭하는 자리', 'ko', src).includes('insight:gamma-sign'));
    assert.ok(checkDepthLine('Gamma exposure is net negative here', 'en', src).includes('insight:gamma-sign'));
    assert.ok(checkDepthLine('맥스페인 위라 만기 쪽 되돌림 압력 자리', 'ko', src).includes('insight:level-side'));
    assert.ok(checkDepthLine('マックスペインの上で満期へ戻り圧力がある位置', 'ja', src).includes('insight:level-side'));
    assert.deepEqual(checkDepthLine('맥스페인 아래라 만기 쪽 되돌림 압력 자리', 'ko', src), []);
    const ev = ['[economic calendar; 2026-10-20 08:30 ET] CPI (scheduled; not a released result)', '[earnings calendar; 2026-10-21; AMC timing boundary 16:00 ET; exact release time unknown] NVDA (confirmed; scheduled; not a released result)'];
    const early = Date.parse('2026-10-20T11:00:00Z');
    for (const t of ['CPI is scheduled on 2025-10-20 at 08:30 ET.', 'CPI is scheduled today at 8:30 PM ET.', 'CPI is scheduled today at 08:30 KST.', 'NVDA earnings scheduled tomorrow at 16:00 ET.', 'IBM and CPI are scheduled today at 08:30 ET.'])
        assert.ok(scheduleClaimReasons(t, ev, early, 'strict').length > 0, t);
    for (const t of ['CPI is scheduled on 2026-10-20 at 08:30 ET.', 'NVDA earnings are scheduled tomorrow after the close.'])
        assert.deepEqual(scheduleClaimReasons(t, ev, early, 'strict'), [], t);
});

test('관문 9차 재현: 근거 밖 경제 일정 · 상대 날짜 · 사전 밖 회사명 · 네 레벨 방향', () => {
    const ev = ['[economic calendar; 2026-10-20 08:30 ET] CPI (scheduled; not a released result)'];
    const early = Date.parse('2026-10-20T11:00:00Z');
    for (const t of ['CPI and retail sales are scheduled today at 08:30 ET.', 'CPI is scheduled next week at 08:30 ET.', 'CPI는 금요일 08:30 ET 발표 예정입니다.'])
        assert.ok(scheduleClaimReasons(t, ev, early, 'strict').length > 0, t);
    assert.deepEqual(scheduleClaimReasons('CPI is scheduled today at 08:30 ET.', ev, early, 'strict'), []);
    const src = buildLineUserPrompt(f);   // 145 · PF 135 · CW 160 · MP 155 · GF 140
    for (const [loc, t] of [['ko', '삼성전자 계약으로 감마 방어가 강화된 자리'], ['en', 'Samsung deal strengthens the gamma cushion'], ['ko', '풋플로어 아래라 지지가 약한 자리'], ['ko', '콜월을 넘어 상단이 열린 자리'], ['en', 'Price sits over the Call Wall cap']] as const)
        assert.ok(checkDepthLine(t, loc, src).some(r => r === 'insight:other-name' || r === 'insight:level-side'), t);
    for (const [loc, t] of [['ko', '풋플로어 위라 받침이 있는 자리'], ['ko', '콜월 아래라 위쪽 상단이 막힌 자리'.replace('위쪽 ', '')], ['en', 'Positive gamma keeps the range below the Call Wall']] as const)
        assert.deepEqual(checkDepthLine(t, loc, src).filter(r => r === 'insight:level-side' || r === 'insight:other-name'), [], t);
});

test('관문 10차 재현: 레벨이 주어인 문장의 위/아래', () => {
    const src = buildLineUserPrompt(f);   // 145 · CW 160 (Call Wall 이 위)
    for (const [loc, t] of [['ko', '콜월이 아래라 상승 여력이 남은 자리'], ['en', 'Call Wall below spot leaves upside open'], ['en', 'Call Wall is below the price here']] as const)
        assert.ok(checkDepthLine(t, loc, src).includes('insight:level-side'), t);
    for (const [loc, t] of [['ko', '콜월이 위라 상단이 막힌 자리'], ['en', 'Call Wall above spot caps the upside'], ['ja', 'コールウォールが上で上値が抑えられる位置']] as const)
        assert.deepEqual(checkDepthLine(t, loc, src).filter(r => r === 'insight:level-side'), [], t);
});

test('관문 11차 재현: 감마 서술 수식어 여러 개', () => {
    const src = buildLineUserPrompt(f);   // 양감마
    for (const t of ['Gamma is now net negative, amplifying swings', 'Dealer gamma has flipped negative here', 'Gamma exposure turned deeply negative', 'Gamma went short into expiry'])
        assert.ok(checkDepthLine(t, 'en', src).includes('insight:gamma-sign'), t);
    assert.deepEqual(checkDepthLine('Positive gamma buffers negative shocks', 'en', src).filter(r => r === 'insight:gamma-sign'), []);
});

test('운영 실측(10/20 14시): 근거의 만기 날짜는 허용 · «into the print» 차단', () => {
    const src = buildLineUserPrompt(f);   // 만기 10/23 · 양감마
    assert.match(src, /10\/23/);
    assert.deepEqual(watchlistNoScheduleReasons('양감마라 10/23 만기 전 변동이 눌리는 자리', 'NVDA', src), []);
    assert.ok(watchlistNoScheduleReasons('양감마라 10/24 전 변동이 눌리는 자리', 'NVDA', src).includes('insight:schedule'));
    assert.ok(watchlistNoScheduleReasons('Positive gamma damps moves into the print', 'NVDA', src).includes('insight:schedule'));
    for (const d of ['10/2', '0/23', '1/23']) assert.ok(watchlistNoScheduleReasons(`Positive gamma damps moves into the ${d} expiry`, 'NVDA', src).includes('insight:schedule'), d);
});

async function main() {
    // 프록시 서버를 띄우거나 Redis에 연결하지 않고 실제 readBody 함수 본문을 로드한다.
    const proxy = readFileSync('scripts/ec2-redis-proxy.js', 'utf8');
    const decoderSource = proxy.slice(proxy.indexOf('async function readBody(req)'), proxy.indexOf('// ── HTTP Server'));
    const readBody = runInNewContext(`${decoderSource}; readBody`, { require, Buffer });
    const sample = JSON.stringify({ ko: '오늘 시장을 가르는 핵심 변수', ja: '市場の重要な変数', en: 'Macro → gamma 😀' });
    const bytes = Buffer.from(sample);
    for (let i = 1; i < bytes.length; i++) assert.equal(await readBody([bytes.subarray(0, i), bytes.subarray(i)]), sample);
    assert.equal(await readBody([...bytes].map(b => Buffer.from([b]))), sample);
    const split = Buffer.from('핵심');
    assert.ok((split.subarray(0, 1).toString('utf8') + split.subarray(1).toString('utf8')).includes('\uFFFD'));
    count++; console.log(`ok - 멀티바이트 모든 ${bytes.length - 1}개 경계·1바이트 청크(운영 프록시 readBody 원본)`);
    if (process.argv.includes('--examples')) {
        mkdirSync('out/ai-depth-macro', { recursive: true });
        writeFileSync('out/ai-depth-macro/prompt-examples.md', `# 구성 예시 — 합성 고정 자료, 실제 모델 호출 없음\n\n## 전: 가디언 (기존 지시 발췌)\n\n첫 문장: 오늘 시장을 움직인 핵심 뉴스 이벤트와 시장 반응의 인과관계를 명확히 서술. 괴리 모드에서는 괴리 진단으로 시작하며 RLSI, Breadth, 거래량 수치를 반드시 포함.\n\n## 후: 가디언 실제 구성 프롬프트 (ko)\n\n\`\`\`text\n${buildTacticalPrompt(facts, 'ko')}\n\`\`\`\n\n## 전: 내 종목\n\nUse the 2–3 most useful facts, taking them in the order given. Separate parts with ·.\n\n## 후: 내 종목 실제 시스템 지시\n\n\`\`\`text\n${WL_LINE_SYSTEM}\n\`\`\`\n\n## 후: 내 종목 실제 사용자 입력\n\n\`\`\`text\n${buildLineUserPrompt(f)}\n\`\`\`\n\n## 인사이트 검사 통과 예시 (모델 결과 아님)\n\n${JSON.stringify(insight, null, 2)}\n`);
    }
    console.log(`${count} passed; model/network/cache calls: 0`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
