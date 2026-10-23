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
import { orphanNumberReasons, directionSignReasons } from '../src/lib/ai/claimChecks';
import { etDateLabel, polishTacticalText, marketStateHint } from '../src/lib/ai/tacticalPrompt';
import { rankStockContext, flowSummary, gammaMechanismReasons, fitDepthLine } from '../src/lib/ai/watchlistDepth';

const now = new Date('2026-10-20T15:00:00Z');
const headline = datedHeadline({ title: 'Treasury auction draws weak demand', published_utc: '2026-10-20T14:00:00Z' }, 'Polygon', now)!;
const facts = {
    rlsiScore: 34, nasdaqChange: -0.3, vix: 18.4, us10y: 5.15, us10yChangeBp: 6,
    gexIndex: 7, triggerSupport: 640, triggerCurrent: 645, triggerResistance: 650,
    marketNewsHeadlines: [headline], asOf: now.toISOString(),
    scheduledEvents: ['[economic calendar; 2026-10-21 08:30 ET] Import prices (scheduled; not a released result)'],
};
let count = 0;
let failed = 0;
function test(name: string, fn: () => void) { try { fn(); count++; console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`FAIL - ${name}`, e); process.exitCode = 1; } }

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

test('ko/en/ja: 뉴스→전이+고유자원→한 가지 확인, ko/ja 420자·en 720자 계약', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(facts, loc);
        assert.match(p, /WHY[\s\S]*SO WHAT[\s\S]*NEXT/);
        assert.match(p, /at least one available proprietary resource/);
        assert.match(p, /exactly ONE supplied/);
        assert.match(p, loc === 'en' ? /Maximum 720 characters/ : /Maximum 420 characters/);
        assert.match(p, /auction draws weak demand/);
        assert.match(p, /2026-10-21 08:30 ET/);
    }
    const p = buildTacticalPrompt({ ...facts, divergenceCase: 'A' } as typeof facts, 'ko');
    assert.match(p, /Divergence.*never a replacement/);
});

test('3문장·뉴스 출처/시각·두 번째 문장 고유자원 출구 검사', () => {
    const p = buildTacticalPrompt(facts, 'ko');
    const good = '나스닥 현물 관측은 미확인입니다. 배경은 10/20 10:00 ET 보도한 국채 입찰 수요 약화와 금리 압력이 연결돼 해석됩니다. 시장 참여 약화에 얇은 감마 방어가 겹쳐 충격 흡수력이 제한적입니다. 옵션 지지선 640 유지 여부가 다음 확인 기준입니다.';
    assert.deepEqual(checkTacticalOutput(good, 'ko', p), []);
    assert.ok(checkTacticalOutput(good.replace('10/20 10:00 ET ', ''), 'ko', p).includes('tactical:news-source-time-required'));
    assert.ok(checkTacticalOutput(good.replace('감마 방어', '수급'), 'ko', p).includes('tactical:positioning-required'));
    assert.ok(checkTacticalOutput(good.split('. ').slice(0, 2).join('. '), 'ko', p).includes('tactical:four-sentences'));
});

test('뉴스 없는 입력: 명시적 미확인, 옛 코어의 무시각 헤드라인 제외', () => {
    const p = buildTacticalPrompt({ ...facts, marketNewsHeadlines: ['Fed cuts rates'] }, 'ko');
    assert.match(p, /TODAY_NEWS: \[\]/);
    assert.match(p, /뚜렷한 재료는 확인되지/);
    assert.doesNotMatch(p.slice(p.indexOf('TODAY_NEWS:')), /Fed cuts/);
    assert.ok(checkTacticalOutput('연준의 금리 인하 발표가 오늘 시장을 움직였습니다.', 'ko', p).some(r => r.startsWith('event:unsupported:')));
    assert.ok(checkTacticalOutput('확인한 자료를 바탕으로 지금 매수하세요.', 'ko', p).includes('tactical:advice'));
    assert.ok(checkTacticalOutput('x'.repeat(721), 'en', p).includes('tactical:too-long'));
    assert.ok(checkTacticalOutput('가'.repeat(421), 'ko', p).includes('tactical:too-long'));
    assert.ok(!checkTacticalOutput('x'.repeat(720), 'en', p).includes('tactical:too-long'));
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
    const long = checkLineOutput(JSON.stringify({ ...chips, insight: { ko: '양감마 구간이라 딜러 헤지가 변동을 누르는 자리, 만기까지 되돌림 압력이 계속 남아 있는 상태임', en: 'Positive gamma: dealer hedging dampens swings', ja: '正ガンマ圏でヘッジ売買が値動きを抑えやすく、満期まで続く位置' } }), f);
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
    for (const bad of ['연준 금리 인하로 감마 방어가 강해졌습니다', '장외 비중 99%가 감마 방어를 지지합니다', '지금 매수하세요', insight.ko + '\uFFFD', insight.ko + 'に', '가'.repeat(45)]) {
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
    assert.deepEqual(checkTacticalOutput('Nasdaq spot observations are unavailable. A 10/20 10:00 ET report described weak Treasury auction demand.' + tail, 'en', p), []);
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
    assert.deepEqual(checkTacticalOutput('Nasdaq spot observations are unavailable. A 10/20 10:00 ET report described weak Treasury auction demand. Weak breadth and thin dealer gamma leave limited absorption. The next test is options support at 640.', 'en', none), []);
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
    for (const t of ['PPI is scheduled on 2026-10-21 at 08:30 ET.', 'CPI is scheduled on 10/20 (Tue) at 08:30 ET.', 'The next test is unconfirmed.'])
        assert.deepEqual(scheduleClaimReasons(t, ev, early, 'strict'), [], t);
    // 10/21 정책: 생성(strict)은 «오늘·내일»만 쓴 예정 주장을 받지 않는다(절대 날짜 필수) — 저장본 읽기(claims)는 예전 판정 그대로
    assert.deepEqual(scheduleClaimReasons('CPI is scheduled today at 08:30 ET.', ev, early, 'strict'), ['schedule:relative-day']);
    assert.deepEqual(scheduleClaimReasons('CPI is scheduled today at 08:30 ET.', ev, early, 'claims'), []);
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
    for (const t of ['CPI is scheduled on 2026-10-20 at 08:30 ET.', 'NVDA earnings are scheduled on 10/21 after the close.'])
        assert.deepEqual(scheduleClaimReasons(t, ev, early, 'strict'), [], t);
    assert.deepEqual(scheduleClaimReasons('NVDA earnings are scheduled tomorrow after the close.', ev, early, 'claims'), []);
});

test('관문 9차 재현: 근거 밖 경제 일정 · 상대 날짜 · 사전 밖 회사명 · 네 레벨 방향', () => {
    const ev = ['[economic calendar; 2026-10-20 08:30 ET] CPI (scheduled; not a released result)'];
    const early = Date.parse('2026-10-20T11:00:00Z');
    for (const t of ['CPI and retail sales are scheduled today at 08:30 ET.', 'CPI is scheduled next week at 08:30 ET.', 'CPI는 금요일 08:30 ET 발표 예정입니다.'])
        assert.ok(scheduleClaimReasons(t, ev, early, 'strict').length > 0, t);
    assert.deepEqual(scheduleClaimReasons('CPI is scheduled on 10/20 at 08:30 ET.', ev, early, 'strict'), []);
    assert.deepEqual(scheduleClaimReasons('CPI is scheduled today at 08:30 ET.', ev, early, 'claims'), []);
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

test('운영 실측(10/20 14시) 뒤 결정: 해석에는 날짜를 쓰지 않는다(근거에 있어도) · 세션·실적 은어 차단', () => {
    const src = buildLineUserPrompt(f);
    for (const t of ['양감마라 10/23 만기 전 변동이 눌리는 자리', 'Positive gamma damps moves into the 10/23–24 expiry', 'Positive gamma damps moves into the 10/20 expiry', '10/23 장 마감 후 양감마로 변동이 눌리는 자리', '장 마감 후 양감마로 변동이 눌리는 자리', 'Positive gamma damps moves into the print'])
        assert.ok(watchlistNoScheduleReasons(t, 'NVDA', src).includes('insight:schedule'), t);
    assert.deepEqual(watchlistNoScheduleReasons('양감마라 만기까지 변동이 눌리는 자리', 'NVDA', src), []);
    for (const t of ['성장전략이 콜월 앞에서 시험받는 자리', '시장 전반과 달리 감마 방어가 있는 자리', '공장 전환 소식이 콜월 앞에 선 자리']) assert.deepEqual(watchlistNoScheduleReasons(t, 'NVDA', src), [], t);
    for (const t of ['장전 거래에서 감마 방어가 약한 자리', '장 마감 후 변동이 눌리는 자리']) assert.ok(watchlistNoScheduleReasons(t, 'NVDA', src).includes('insight:schedule'), t);
    assert.match(WL_LINE_SYSTEM, /into expiry/);
});

// ━━━ 10/21 v2: 운영 예시 결함 3건 회귀(고아 숫자·방향 모순·상대 날짜) + 내 종목 근거 우선순위 ━━━
test('v2 ① 고아 숫자: «이는 -0.74% 하락»은 탈락, «TLT -0.74% 하락»은 통과(세 언어)', () => {
    const bad = '23:13 ET 보도에 따르면 유가가 배럴당 110달러 근처까지 오르면서 미국 10년물 금리 5.15%를 지탱하고 있으며, 이는 -0.74% 하락과 일치한다.';
    assert.deepEqual(orphanNumberReasons(bad), ['orphan-number:-0.74%']);
    assert.deepEqual(orphanNumberReasons(bad.replace('이는 -0.74%', 'TLT -0.74%')), []);
    assert.deepEqual(orphanNumberReasons('At 23:13 ET, oil near $110 is consistent with the 10-year yield at 5.15%, reflected in TLT -0.74% decline.'), []);
    assert.deepEqual(orphanNumberReasons('米10年債利回り5.15%を支えており、TLT -0.74%の下落と整合的だ。'), []);
    assert.deepEqual(orphanNumberReasons('This matches a -0.74% decline.'), ['orphan-number:-0.74%']);
    // 시각·날짜·지수 이름 속 숫자·작은 개수는 값이 아니다
    assert.deepEqual(orphanNumberReasons('10/20(화) 08:30 ET 주택 착공 발표, S&P 500 지수 2개 신호'), []);
});

test('v2 ② 방향 모순: 양수 등락을 «약세/弱気»로 서술하면 탈락, 대조 접속어·반대 부호는 마디를 나눈다', () => {
    assert.deepEqual(directionSignReasons('S&P 500 +0.23% 상승에도 불구하고 나스닥 +0.19%와 49% 참여폭은 약세를 보이고 있다.'), ['direction-sign:+0.19%']);
    assert.deepEqual(directionSignReasons('S&P 500 +0.23%の上昇にもかかわらずNASDAQ +0.19%とブレッドス49%は弱気を示し、'), ['direction-sign:+0.19%']);
    assert.deepEqual(directionSignReasons('Nasdaq +0.19% weakened against the S&P'), ['direction-sign:+0.19%']);
    assert.deepEqual(directionSignReasons('TLT -0.74% 하락과 금리 상승이 맞물렸다.'), []);
    assert.deepEqual(directionSignReasons('S&P 500 +0.23%와 나스닥 -0.19% 하락이 엇갈렸다.'), []);
    assert.deepEqual(directionSignReasons('VIX +5% as stocks fell.'), []);
    assert.deepEqual(directionSignReasons('나스닥 +0.19%는 S&P 500보다 덜 올랐고 참여폭 49%는 약하다.'), []);
    assert.deepEqual(directionSignReasons('S&P 500 +0.23% gains contrast with NASDAQ +0.19% and breadth at 49%.'), []);
    // 실제 모델 1차 실행에서 나온 오탐 2건(고정): 다른 지표의 서술어 · 달러 인덱스의 «달러»
    assert.deepEqual(directionSignReasons('S&P 500 +0.23% 상승과 나스닥 +0.19% 상승 속에서 GEX +7는 중립 수준이고 49% 참여폭은 약세를 보이며'), []);
    assert.deepEqual(orphanNumberReasons('미국 10년물 금리 5.15%와 101.8 달러 인덱스 상승과 연결해 해석된다.'), []);
    assert.deepEqual(orphanNumberReasons('米10年債利回り5.15%と101.8ドル指数の上昇と整合的である。'), []);
    assert.deepEqual(orphanNumberReasons('consistent with the 10-year rising to 5.15%'), []);
    assert.deepEqual(orphanNumberReasons('36 점의 극단적 약세 신호와 49%의 중립 참여폭은'), ['orphan-number:36']);
    assert.deepEqual(orphanNumberReasons('10년물 금리 5.15%와 +0.31% 상승으로 연결해 해석된다.'), ['orphan-number:+0.31%']);
    assert.deepEqual(orphanNumberReasons('An earnings move past the ±6.4% implied range meets negative gamma'), []);
    // 관문 10201522 재현: 수준 값(GEX -40)은 등락이 아니다 · 수준+변화량 연달아 · 현지어 레벨 이름
    assert.deepEqual(directionSignReasons('GEX -40은 상승 움직임을 증폭하는 음감마입니다'), []);
    assert.deepEqual(orphanNumberReasons('미국 10년물 금리 5.15%로 +6bp 상승했다.'), []);
    assert.deepEqual(orphanNumberReasons('맥스페인 365 위라 만기 회귀 압력이 남는 자리'), []);
    assert.deepEqual(orphanNumberReasons('マックスペイン365の上で満期回帰の圧力が残る位置'), []);
    // 관문 10201535 재현: 다른 주어의 방향어 · 변화량→수준 어순
    assert.deepEqual(directionSignReasons('TLT -0.74%는 금리 상승과 연결해 해석되며 감마 방어가 변수입니다'), []);
    assert.deepEqual(orphanNumberReasons('미국 10년물 금리가 +6bp 상승해 5.15%가 됐으며 감마 방어가 변수입니다'), []);
    assert.deepEqual(directionSignReasons('나스닥 +0.19%와 49% 참여폭은 약세'), ['direction-sign:+0.19%']);
});

test('v2 ③ 상대 날짜: 생성 검사는 «내일 08:30 ET»를 받지 않고 «10/20(화) 08:30 ET»를 받는다 · 틀린 요일 탈락 · 프롬프트에 DATE_LABELS', () => {
    const asOf = '2026-10-20T03:26:33.633Z';   // ET 10/19 23:26 — KST 독자는 이미 10/20 낮
    const ev = ['[economic calendar; 2026-10-20 08:30 ET] Housing Starts (Sep) (scheduled; not a released result)'];
    const nowMs = Date.parse(asOf);
    assert.deepEqual(scheduleClaimReasons('내일 08:30 ET Housing Starts 발표가 다음 조건부 테스트가 된다.', ev, nowMs, 'strict'), ['schedule:relative-day']);
    assert.deepEqual(scheduleClaimReasons('Housing Starts is scheduled at 08:30 ET.', ev, nowMs, 'strict'), ['schedule:date-required']);
    assert.deepEqual(scheduleClaimReasons('10/20(화) 08:30 ET Housing Starts 발표가 다음 조건부 테스트다.', ev, nowMs, 'strict'), []);
    assert.deepEqual(scheduleClaimReasons('Housing Starts on 10/20 (Tue) at 08:30 ET is the next test.', ev, nowMs, 'strict'), []);
    assert.deepEqual(scheduleClaimReasons('10/20(火) 08:30 ETのHousing Startsが次の条件付きテストだ。', ev, nowMs, 'strict'), []);
    assert.ok(scheduleClaimReasons('10/20(수) 08:30 ET Housing Starts 발표', ev, nowMs, 'strict')[0].startsWith('schedule:weekday'));
    assert.ok(scheduleClaimReasons('10/21(수) 08:30 ET Housing Starts 발표', ev, nowMs, 'strict').includes('schedule:claim-not-upcoming'));
    assert.equal(etDateLabel('2026-10-20', 'ko'), '10/20(화)');
    assert.equal(etDateLabel('2026-10-20', 'en'), '10/20 (Tue)');
    assert.equal(etDateLabel('2026-10-20', 'ja'), '10/20(火)');
    const p = buildTacticalPrompt({ rlsiScore: 32, nasdaqChange: 0.19, vix: 18.4, asOf, scheduledEvents: ev }, 'ko');
    assert.match(p, /DATE_LABELS: \{"2026-10-20":"10\/20\(화\)"\}/);
    assert.match(p, /Never use relative day words/);
    // 운영 예시 ko 원문 전체 — 세 결함이 모두 사유로 잡힌다
    const text = '23:13 ET 보도에 따르면 유가가 중동 공급 리스크로 배럴당 110달러 근처까지 오르면서 미국 10년물 금리 5.15%를 지탱하고 있으며, 이는 -0.74% 하락과 일치한다. S&P 500 +0.23% 상승에도 불구하고 나스닥 +0.19%와 49% 참여폭은 약세를 보이고 있으며, GEX +7는 중립 수준으로 감마 포지셔닝이 현재의 상승 압력을 흡수하는 상태다. 내일 08:30 ET 주택 통계(Housing Starts, Building Permits) 발표가 다음 조건부 테스트가 된다.';
    const r = checkTacticalOutput(text, 'ko', p);
    for (const want of ['tactical:orphan-number:-0.74%', 'tactical:direction-sign:+0.19%', 'schedule:relative-day']) assert.ok(r.includes(want), `${want} :: ${r.join(',')}`);
});

const tslaRow = { price: 370, maxPain: 365, callWall: 400, putFloor: 340, gammaFlipLevel: 375, levelsChainDate: '2026-10-19', levelsExpiration: '2026-10-23', levelsSource: 'structure', darkPoolPct: 47.5, darkPoolDate: '2026-10-19', impliedMovePct: 6.4, impliedMoveExpiry: '2026-10-23', impliedMoveDef: 'atm-straddle-mid/1' };
const tslaEarn = '[earnings calendar; 2026-10-21; AMC timing boundary 16:00 ET; exact release time unknown] TSLA (confirmed; scheduled; not a released result)';
const genAt = Date.parse('2026-10-20T03:26:00Z');   // ET 10/19 23:26
test('v2 ④ 내 종목 근거 우선순위: 실적 D-n ≤5 > 종목 뉴스 > 이례 흐름 > 내부자 > 감마', () => {
    const tf = buildLineFacts('TSLA', tslaRow)!;
    assert.ok(tf, 'TSLA 사실');
    const base = { ticker: 'TSLA', earnings: [tslaEarn], news: [], darkPool: tf.darkPool, implied: tf.implied };
    const r = rankStockContext(base, genAt);
    assert.equal(r.top, 'earnings');
    assert.match(r.topLine, /^TOP EVIDENCE \[earnings\]: TSLA earnings are scheduled 2 ET calendar day\(s\) ahead.*±6\.4% to the 10\/23 expiry includes that release/);
    assert.equal(r.lines[0], tslaEarn);
    assert.equal(rankStockContext({ ...base, earnings: [tslaEarn.replace('2026-10-21', '2026-10-27')] }, genAt).top, 'positioning', 'D-8 은 실적 근거가 아니다');
    const news = '[NEWS PULSE; 2026-10-20T02:00:00.000Z; 22:00 ET] Tesla recalls Cybertruck units';
    assert.equal(rankStockContext({ ...base, earnings: [], news: [news] }, genAt).top, 'news');
    const flow = flowSummary('TSLA', { sessionDate: '2026-10-19', items: [{ type: 'CALL', premium: 9e6 }, { type: 'CALL', premium: 5e6 }, { type: 'PUT', premium: 1e6 }] });
    assert.equal(flow?.unusual, true);
    assert.match(flow!.line, /calls 93% \/ puts 7%/);
    assert.equal(flowSummary('TSLA', { sessionDate: '2026-10-19', items: [{ type: 'CALL', premium: 5e6 }, { type: 'PUT', premium: 5e6 }, { type: 'PUT', premium: 1e6 }] })?.unusual, false);
    assert.equal(rankStockContext({ ...base, earnings: [], flow }, genAt).top, 'flow');
    assert.equal(rankStockContext({ ...base, earnings: [], insider: '[insider filing; 2026-10-17] TSLA Director open-market purchase (SEC Form 4 code P; an observation, not a forecast)' }, genAt).top, 'insider');
    assert.equal(rankStockContext({ ...base, earnings: [] }, genAt).top, 'positioning');
});

test('v2 ⑤ 내 종목 해석 출구: 실적 무시 일반론·근거 없는 일반론·스타일 복사·D-n 탈락, 실적 중심 문장 통과·발표 뒤 내려감', () => {
    const tf = buildLineFacts('TSLA', tslaRow)!;
    const r = rankStockContext({ ticker: 'TSLA', earnings: [tslaEarn], news: [], darkPool: tf.darkPool, implied: tf.implied }, genAt);
    tf.contextText = r.lines.join('\n'); tf.topLine = r.topLine;
    const src = buildLineUserPrompt(tf);
    assert.match(src, /^TOP EVIDENCE \[earnings\]/m);
    assert.ok(checkDepthLine('음감마 구간에서 딜러 헤지가 변동을 증폭시키는 자리', 'ko', src, genAt).includes('insight:ignores-top-earnings'));
    assert.deepEqual(checkDepthLine('실적 반응이 예상 변동 ±6.4%를 넘으면 음감마가 키우는 자리', 'ko', src, genAt), []);
    assert.deepEqual(checkDepthLine('An earnings move past the ±6.4% implied move meets negative gamma', 'en', src, genAt), []);
    assert.deepEqual(checkDepthLine('決算反応が想定変動幅±6.4%を超えると負ガンマが増幅する位置', 'ja', src, genAt), []);
    assert.ok(checkDepthLine('실적 반응이 예상 변동을 넘으면 음감마가 키우는 자리', 'ko', src, genAt).includes('insight:style-copy'));
    assert.ok(checkDepthLine('D-1 실적 앞 예상 변동 ±6.4% 음감마 자리', 'ko', src, genAt).includes('insight:schedule'));
    // 관문 10201535 ①: 발표 전 실적을 결과로 단정하면 탈락(조건형은 통과)
    for (const [l, t] of [['ko', '실적이 예상을 웃돌아 음감마 변동을 키우는 자리'], ['en', 'Earnings beat meets negative gamma amplification'], ['ja', '決算が予想を上回って負ガンマが増幅する位置']] as const)
        assert.ok(checkDepthLine(t, l, src, genAt).includes('insight:earnings-result'), t);
    assert.ok(!checkDepthLine('실적 반응이 예상 변동 ±6.4%를 웃돌면 음감마가 키우는 자리', 'ko', src, genAt).includes('insight:earnings-result'));
    // 관문 10201544 재현: «초과해·exceeded» 결과 단정 · 소수점 뒤 «억제» · 예상과 무관한 «맥스페인 웃돌아»
    for (const [l, t] of [['ko', '실적이 예상을 초과해 음감마 변동이 커지는 자리'], ['en', 'Earnings exceeded estimates into negative gamma'], ['ja', '決算が市場予想を超えて負ガンマが増幅する位置']] as const)
        assert.ok(checkDepthLine(t, l, src, genAt).includes('insight:earnings-result'), t);
    assert.ok(checkDepthLine('실적 앞 음감마가 예상 변동 ±6.4%를 억제하는 자리', 'ko', src, genAt).includes('insight:gamma-mechanism'));
    assert.ok(!checkDepthLine('맥스페인 웃돌아 만기 회귀 압력이 남는 자리', 'ko', src, genAt).includes('insight:earnings-result'));
    assert.ok(!checkDepthLine('If earnings beat the implied range, negative gamma amplifies it', 'en', src, genAt).includes('insight:earnings-result'));
    assert.ok(checkDepthLine('내일 실적 앞 예상 변동 ±6.4% 음감마 자리', 'ko', src, genAt).includes('insight:schedule'));
    // 발표 경계(10/21 16:00 ET)가 지나면 «실적» 말 허용이 풀린다 → 저장본 해석이 내려간다
    assert.ok(checkDepthLine('실적 반응이 예상 변동 ±6.4%를 넘으면 음감마가 키우는 자리', 'ko', src, Date.parse('2026-10-21T21:00:00Z')).includes('insight:schedule'));
    // 감마만 남은 종목(마지막 수단)은 자기 숫자에 묶어야 한다 — 종목끼리 같은 일반론 차단
    const pr = rankStockContext({ ticker: 'TSLA', earnings: [], news: [], darkPool: tf.darkPool, implied: tf.implied }, genAt);
    const tf2 = buildLineFacts('TSLA', tslaRow)!; tf2.contextText = pr.lines.join('\n'); tf2.topLine = pr.topLine;
    const src2 = buildLineUserPrompt(tf2);
    assert.ok(checkDepthLine('음감마라 딜러 헤지가 변동을 키우는 자리', 'ko', src2, genAt).includes('insight:generic'));
    assert.deepEqual(checkDepthLine('예상 변동 ±6.4%가 음감마와 겹쳐 흔들림이 큰 자리', 'ko', src2, genAt), []);
    // 고아 숫자는 해석에서도 탈락
    assert.ok(checkDepthLine('±6.4%가 음감마와 겹쳐 흔들림이 큰 자리', 'ko', src2, genAt).some(x => x.startsWith('insight:orphan-number')));
});

test('v2 ⑥ 근거 지평: 내 종목은 D-5 실적까지, Tactical 일정(events)은 오늘·내일만(예전과 같다)', () => {
    const n = new Date('2026-10-20T15:00:00Z');
    // 가상 티커(회사 공지 보정 목록 CONFIRMED_EARNINGS 밖)
    const earnings = { generatedAt: n.toISOString(), rows: [{ date: '2026-10-23', hour: 'amc', ticker: 'ZZA', dateStatus: 'confirmed' }, { date: '2026-10-21', hour: 'amc', ticker: 'ZZB', dateStatus: 'confirmed' }] };
    const mine = (x: { stockEvents: Array<{ ticker: string }> }) => x.stockEvents.map(e => e.ticker).filter(t => t.startsWith('ZZ')).sort();
    const wide = cachedEvidence(null, null, earnings, n, { stockDays: 5 });
    assert.deepEqual(mine(wide), ['ZZA', 'ZZB']);
    assert.ok(!wide.events.some(e => /ZZA/.test(e)) && wide.events.some(e => /ZZB/.test(e)));
    const narrow = cachedEvidence(null, null, earnings, n);
    assert.deepEqual(mine(narrow), ['ZZB']);
    assert.deepEqual(narrow.events, wide.events);
});

test('v2 ⑦ 같은 날 같은 해석 반복 방지 · 내부자 줄(장내 매수 P, 7일 안)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const S = require('../src/services/watchlistAiLineService');
    const seen: Record<string, string> = {};
    const a = S.dedupeInsights('NVDA', { ko: '음감마라 딜러 헤지가 변동을 키우는 자리', en: 'Negative gamma: hedging amplifies moves' }, seen);
    assert.deepEqual(a.reasons, []);
    const b = S.dedupeInsights('MU', { ko: '음감마라 딜러 헤지가 변동을 키우는 자리.', en: 'Implied move ±5.1% meets negative gamma' }, seen);
    assert.deepEqual(b.reasons, ['ko:insight:duplicate:NVDA']);
    assert.deepEqual(b.kept, { en: 'Implied move ±5.1% meets negative gamma' });
    assert.deepEqual(S.dedupeInsights('NVDA', { ko: '음감마라 딜러 헤지가 변동을 키우는 자리' }, seen).reasons, [], '자기 종목의 재생성은 같은 문장이어도 된다');
    // 숫자만 바꾼 틀(실제 모델 NVDA ±3.1%·AAPL ±2.2%)도 같은 문장
    const s2: Record<string, string> = {};
    S.dedupeInsights('NVDA', { ko: '예상 변동 ±3.1%가 음감마 구간과 겹쳐 흔들림이 커지는 자리' }, s2);
    assert.deepEqual(S.dedupeInsights('AAPL', { ko: '예상 변동 ±2.2%가 음감마 구간과 겹쳐 흔들림이 커지는 자리' }, s2).reasons, ['ko:insight:duplicate:NVDA']);
    const buys = [{ ticker: 'TSLA', date: '2026-10-16', role: 'Director' }, { ticker: 'TSLA', date: '2026-10-01', role: 'CEO' }, { ticker: 'MU', date: '2026-10-19', role: 'CFO' }];
    assert.equal(S.insiderLineFor('TSLA', buys, Date.parse('2026-10-20T15:00:00Z')), '[insider filing; 2026-10-16] TSLA Director open-market purchase (SEC Form 4 code P; an observation, not a forecast)');
    assert.equal(S.insiderLineFor('AAPL', buys, Date.parse('2026-10-20T15:00:00Z')), null);
    assert.equal(S.insiderLineFor('TSLA', [{ ticker: 'TSLA', date: '2026-10-01', role: 'CEO' }], Date.parse('2026-10-20T15:00:00Z')), null);
});

test('v2 ⑧ 감마 기제(음감마=키움·양감마=누름) 반대 서술 탈락 · 연결형으로 끝나는 첫 절은 자르지 않는다', () => {
    for (const t of ['예상 변동 ±2.2%가 음감마 구간 안에 머물면서 위쪽 움직임이 제약받는 자리', 'Negative gamma zone constrains the ±3.1% implied move', '想定変動幅±2.2%が負ガンマ圏に収まり上値が抑制される位置', '양감마라 딜러 헤지가 변동을 키우는 자리'])
        assert.deepEqual(gammaMechanismReasons(t), ['insight:gamma-mechanism'], t);
    for (const t of ['실적 반응이 예상 변동 ±6.4%를 넘으면 음감마가 증폭하는 자리', 'Positive gamma: dealer hedging dampens swings', '負ガンマでヘッジ売買が値動きを増幅する位置', '음감마지만 콜월이 상승을 제한하는 자리', 'Negative gamma, but the Call Wall caps the upside'])
        assert.deepEqual(gammaMechanismReasons(t), [], t);
    // 관문 10201535 ④: 부정문은 판정하지 않는다
    for (const t of ['음감마라 변동을 억제하지 못하는 자리', 'Negative gamma does not dampen swings here', '負ガンマで値動きを抑制できない位置']) assert.deepEqual(gammaMechanismReasons(t), [], t);
    const long = '예상 변동 ±4.8%는 Max Pain과 Call Wall 사이 공간에 담기며, 양감마 구간에서 상승 움직임이 제약받는 자리';
    assert.equal(fitDepthLine(long, 'ko'), long);
    assert.equal(fitDepthLine('想定変動幅±4.8%がMax PainとCall Wallの間に収まり、正ガンマ圏で上昇が抑制される位置で満期まで続く', 'ja'), '想定変動幅±4.8%がMax PainとCall Wallの間に収まり、正ガンマ圏で上昇が抑制される位置で満期まで続く');
});

test('v2 ⑨ 운영 17:03 실측: 입력 이름표(TODAY_NEWS) 노출 탈락(생성·저장본) · 3~4문장 허용·NEXT 는 마지막 문장', () => {
    const asOf = '2026-10-20T08:00:00.000Z';
    const ev = ['[economic calendar; 2026-10-20 08:30 ET] Housing Starts (Sep) (scheduled; not a released result)'];
    const news = ['[NEWS PULSE; 2026-10-20T07:43:00.000Z; 03:43 ET] Treasury yields fall ahead of housing and jobs data'];
    const p = buildTacticalPrompt({ rlsiScore: 36, nasdaqChange: 0.19, vix: 18.6, gexIndex: 7, tltChangePct: -0.74, asOf, scheduledEvents: ev, marketNewsHeadlines: news } as any, 'ko');
    const leak = '오늘 TODAY_NEWS에 따르면 미국 국채 금리가 하락했다는 보도가 있다(03:43 ET, NEWS PULSE). TLT -0.74%와 VIX 18.6 속에서 GEX +7는 중립권이라 감마가 압력을 흡수하는지 뚜렷하지 않다. 다음 조건부 테스트는 10/20(화) 08:30 ET Housing Starts (Sep)이다.';
    assert.ok(checkTacticalOutput(leak, 'ko', p).includes('tactical:internal-label'));
    assert.ok(checkTacticalStored(leak, p).includes('tactical:internal-label'));
    const four = '나스닥 현물 관측은 미확인입니다. 배경은 10/20 03:43 ET 보도에 따르면 미국 국채 금리가 하락했습니다. 옵션 포지션(GEX +7)은 중립권이라 흔들림을 줄이지 않습니다. 다음 조건부 테스트는 10/20(화) 08:30 ET(한국 21:30) 예정된 Housing Starts (Sep)로, 약하면 압력이 커지고 강하면 완화되는 구조입니다.';
    const r = checkTacticalOutput(four, 'ko', p);
    assert.ok(!r.includes('tactical:four-sentences') && !r.includes('tactical:positioning-required') && !r.some(x => x.startsWith('schedule:')), r.join(','));
    assert.ok(checkTacticalOutput('WHY: ' + four, 'ko', p).includes('tactical:internal-label'));
});

test('10/21 대표 «이것만 읽어도 시장 상태 이해» — 상태 판정 → 왜 → 그래서 → 다음(결과별 읽기) 구조 · 방어 문구 없이 통과', () => {
    const asOf = '2026-10-20T23:30:20.000Z';
    const ev = ['[economic calendar; 2026-10-21 10:30 ET] EIA Crude Oil Stocks Change (Oct/16) (scheduled; not a released result)'];
    const news = ['[NEWS PULSE; 2026-10-20T23:24:15.000Z; 19:24 ET] Gold declines below $4,150 as elevated oil prices reinforce prospects of further Fed tightening'];
    const ctx = { rlsiScore: 36.4, nasdaqChange: 0.78, vix: 17.31, gexIndex: 5, gexLevel: 'NEUTRAL', asOf, scheduledEvents: ev, marketNewsHeadlines: news } as any;
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(ctx, loc);
        assert.match(p, /MARKET_STATE: market health weak; options positioning neutral; volatility calm/);
        assert.match(p, /four or five natural sentences in this order — STATE, WHY, SO WHAT, NEXT/);
        assert.match(p, /two-way reading/);
        assert.match(p, /never add a parenthetical such as/);
        // 상태 판정 재료(MARKET_STATE)는 근거(데이터) 부분이 아니다 — 근거 대조는 TODAY_NEWS 부터
        assert.ok(p.indexOf('MARKET_STATE:') < p.indexOf('TODAY_NEWS:'));
    }
    const p = buildTacticalPrompt(ctx, 'ko');
    const good = '나스닥 현물 관측은 미확인입니다. 배경은 10/20 19:24 ET 보도로, 높은 유가가 연준 긴축 관측과 맞물렸습니다. 시장 건강도(RLSI) 36점으로 약하고 옵션 포지션(GEX +5)은 중립이라 흔들림을 줄이지도 키우지도 않습니다. 다음 분기점은 10/21(수) 10:30 ET(한국 23:30) 예정된 EIA Crude Oil Stocks Change로, 재고가 줄면 유가 압력이 커지고 늘면 누그러지는 구조입니다.';
    assert.deepEqual(checkTacticalOutput(good, 'ko', p), []);
    // 두 번째 문장(WHY)의 시각이 공급된 뉴스 시각이 아니면 탈락(예전 첫 문장 규칙과 같은 판정)
    assert.ok(checkTacticalOutput(good.replace('19:24 ET', '23:24 ET'), 'ko', p).includes('tactical:news-source-time-required'));
    // 출처·시각이 어느 문장에도 없으면 탈락
    assert.ok(checkTacticalOutput(good.replace('배경은 10/20 19:24 ET 보도로, ', '배경은 '), 'ko', p).includes('tactical:news-source-time-required'));
    // 뉴스가 없으면 두 번째 문장의 «원인 미확인»으로 통과, 어디에도 없으면 탈락
    const pNo = buildTacticalPrompt({ ...ctx, marketNewsHeadlines: undefined }, 'ko');
    const noNews = good.replace('배경은 10/20 19:24 ET 보도로, 높은 유가가 연준 긴축 관측과 맞물렸습니다.', '오늘 시장을 움직인 거시 원인은 아직 확인되지 않았습니다.');
    assert.deepEqual(checkTacticalOutput(noNews, 'ko', pNo), []);
    assert.ok(checkTacticalOutput(noNews.replace('오늘 시장을 움직인 거시 원인은 아직 확인되지 않았습니다.', '유가와 금리가 함께 움직였습니다.'), 'ko', pNo).includes('tactical:unconfirmed-cause-required'));
    // 숫자 나열 셈은 SO WHAT(WHY·첫·마지막 문장 제외) — 예전과 같은 범위
    const roll = good.replace('시장 건강도(RLSI) 36점으로 약하고', '나스닥 +0.78%, VIX 17.3, 달러 인덱스(DXY) 101.7, 미국 10년물 금리 5.12% 속에 시장 건강도(RLSI) 36점으로 약하고');
    assert.ok(checkTacticalOutput(roll, 'ko', p).includes('tactical:number-rollcall'));
    // 관문 10210927 ① — 첫 문장의 틀린 시각을 두 번째 문장의 «미확인»(다른 것에 대한)으로 빠져나가지 못한다
    const bypass = '10:30 ET 기준 지수는 올랐지만 힘이 빠진 상승장입니다. 옵션 포지션은 미확인입니다. 시장 건강도(RLSI) 36점으로 약하고 옵션 포지션(GEX +5)은 중립입니다. 다음 분기점은 10/21(수) 10:30 ET 예정된 EIA Crude Oil Stocks Change(원유 재고)로, 재고가 줄면 유가 상승 압력이 이어지고 늘면 누그러지는 쪽으로 읽힙니다.';
    assert.ok(checkTacticalOutput(bypass, 'ko', p).includes('tactical:state-time-forbidden'));
    // 관문 10211005 ② — 첫 문장의 «미확인»(옵션 포지션)이 WHY 로 잡혀도 두 번째 문장의 틀린 뉴스 시각(실제 19:24 → 10:30)은 탈락
    const bypass2 = '지수는 올랐지만 옵션 포지션은 미확인인 상승장입니다. 배경은 10:30 ET NEWS PULSE 보도로, 금이 4,150달러 아래로 밀렸습니다. 시장 건강도(RLSI) 36점으로 약하고 옵션 포지션(GEX +5)은 중립입니다. 다음 분기점은 10/21(수) 10:30 ET 예정된 EIA Crude Oil Stocks Change(원유 재고)로, 재고가 줄면 유가 상승 압력이 이어지고 늘면 누그러지는 쪽으로 읽힙니다.';
    assert.ok(checkTacticalOutput(bypass2, 'ko', p).includes('tactical:news-source-time-required'));
    // 관문 10210927 ④ — 새 구조 이름표 «STATE:» 노출도 탈락, 입력 이름표 MARKET_STATE 는 저장본 읽기에서도 탈락
    assert.ok(checkTacticalOutput('STATE: ' + good, 'ko', p).includes('tactical:internal-label'));
    assert.ok(checkTacticalStored(good.replace('나스닥', 'MARKET_STATE 나스닥'), p).includes('tactical:internal-label'));
});

test('10/21 Tactical 다듬기 — 내부 지표명 날것·«게이트»·연결어미 오타(뜻·숫자·자리표 불변)', () => {
    assert.equal(polishTacticalText('RLSI {RLSI}점으로 약하고, 게이트 GEX +5는 중립', 'ko'), '시장 건강도(RLSI) {RLSI}점으로 약하고, 옵션 포지션(GEX) +5는 중립');
    assert.equal(polishTacticalText('금이 4,150달러 아래로 밀렸데, 오늘', 'ko'), '금이 4,150달러 아래로 밀렸는데, 오늘');
    assert.equal(polishTacticalText('그 가운데 한데 모여', 'ko'), '그 가운데 한데 모여');               // 낱말은 그대로
    const already = '시장 건강도(RLSI) 36점, 옵션 포지션(GEX +5)은 중립';
    assert.equal(polishTacticalText(already, 'ko'), already);                                            // 이미 쉬운 이름이면 그대로(멱등)
    assert.equal(polishTacticalText(polishTacticalText('RLSI 36, GEX +5', 'en'), 'en'), 'market health (RLSI) 36, options positioning (GEX) +5');
    assert.equal(polishTacticalText('RLSI {RLSI}点、GEX +5', 'ja'), '市場の健全度(RLSI) {RLSI}点、オプション・ポジション(GEX) +5');
    assert.equal(polishTacticalText('{RLSI} and (GEX +5) gamma', 'en'), '{RLSI} and (GEX +5) gamma');      // 자리표·괄호 속 약어는 건드리지 않는다
    // 관문 10210927 ② — 공백 든 자리표 «{ RLSI }» 도 그대로(채우기가 깨지지 않게), 자리표 밖 약어만
    assert.equal(polishTacticalText('시장 점수 { RLSI }점, { GEX } 수준', 'ko'), '시장 점수 { RLSI }점, { GEX } 수준');
    assert.equal(polishTacticalText('RLSI { RLSI }점', 'ko'), '시장 건강도(RLSI) { RLSI }점');
    assert.equal(polishTacticalText('RLSI { RLSI }', 'en'), 'market health (RLSI) { RLSI }');
    assert.equal(polishTacticalText('RLSI { RLSI }点', 'ja'), '市場の健全度(RLSI) { RLSI }点');
    assert.equal(polishTacticalText('Aggregate GEX is neutral, with gamma flat.', 'en'), 'Aggregate GEX is neutral, with gamma flat.');   // 관문 10211015 ② «gate» 는 낱말일 때만
    assert.equal(polishTacticalText('gate GEX +5 neutral', 'en'), 'options positioning (GEX) +5 neutral');
});

test('10/21 상태 판정 재료 — 자리표 낡음 판정과 같은 문턱(RLSI 45·65 · 감마 쉴드 등급 · VIX 18·25 · 지수 ±0.3%)', () => {
    assert.equal(marketStateHint({ nasdaqChange: -2.66, rlsiScore: 34.3, gexLevel: 'LONG_GAMMA', vix: 20.2, breadthPct: 29 }), 'market health weak; breadth narrow; options positioning cushioning; volatility elevated');
    assert.equal(marketStateHint({ nasdaqChange: 0.1, rlsiScore: 61, vix: 14 }), 'market health middling; options positioning missing; volatility calm');
    assert.equal(marketStateHint({ nasdaqChange: 0.3, rlsiScore: 44.9, gexLevel: 'SHORT_GAMMA', vix: 25 }), 'market health weak; options positioning amplifying; volatility stressed');
    assert.equal(marketStateHint({ nasdaqChange: -0.29, rlsiScore: 65, gexLevel: 'NEUTRAL', vix: 18 }), 'market health strong; options positioning neutral; volatility elevated');
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
