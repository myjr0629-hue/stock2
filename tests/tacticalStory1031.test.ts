// ★2026-10-31 대표 «Tactical 이 UC 보다 빈약 — 지표만 늘어놓고 스토리가 없다» — 재료(원인 기사·FedWatch·금리·공포탐욕·섹터) + WHY 계약 시험
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTacticalCauseHeadline, filterMarketHeadlines } from '@/lib/ai/tacticalNews';
import { tacticalFedwatchFrom, tacticalMacroDrivers, causeNewsFromArchive, mergeCauseNews, driversForPrompt } from '@/lib/ai/tacticalDrivers';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, checkTacticalTranslated, storedDriverReasons, tacticalDriverSnapshot, tacticalNextBoundaryReasons, TACTICAL_GATE_MAX_CHARS } from '@/lib/ai/tacticalPrompt';
import { sectorPairReasons } from '@/lib/ai/tacticalDrivers';
import { SECTOR_ETF_KO, SECTOR_NAME_EN } from '@/lib/ai/sectorLabels';
import { SECTOR_MAP } from '@/services/universePolicy';
import { claimReasons } from '@/lib/ai/claimChecks';

let failed = 0;
const test = (name: string, fn: () => void) => { try { fn(); console.log('ok -', name); } catch (e) { failed++; console.error('FAIL -', name, e); } };
const { context } = JSON.parse(readFileSync('tests/fixtures/tactical-story/post-1030.json', 'utf8'));

test('① 원인 기사 — 장 마감 시장 기사는 통과, 개별 회사 기사는 제외(10/30 운영 코어 뉴스 실물)', () => {
    const pass = [
        '[NEWS PULSE; 2026-10-31T00:10:00.000Z; 20:10 ET] Tech Selloff Wipes Out $1 Trillion In Value',
        '[NEWS PULSE; 2026-10-31T00:05:39.000Z; 20:05 ET] S&P 500, Nasdaq End Third Straight Week Lower As Investors Move Away From Tech, AI',
        '[NEWS PULSE; 2026-10-30T23:36:17.000Z; 19:36 ET] S&P 500 Snapshot: Stocks Edge Lower for 3rd Straight Week',
    ];
    const drop = [
        '[NEWS PULSE; 2026-10-30T23:58:27.000Z; 19:58 ET] Why Merck Stock Flew Higher on Friday',
        '[NEWS PULSE; 2026-10-30T23:55:00.000Z; 19:55 ET] Review & Preview: Ending on a Down Note',
        '[Polygon; 2026-10-30T22:20:00.000Z; 18:20 ET] Okta Stock Can Find More Buyers as It Joins the S&P 500 — Okta can expect a new pool',
        '[Polygon; 2026-10-30T23:36:14.000Z; 19:36 ET] Moving Averages of the Ivy Portfolio and S&P 500: October 2026 — This article',
        '[NEWS PULSE; 2026-10-30T23:48:46.000Z; 19:48 ET] Alaska Air to cut 200 jobs as fuel costs threaten $700 million annual loss',
    ];
    for (const h of pass) assert.ok(isTacticalCauseHeadline(h), h);
    for (const h of drop) assert.ok(!isTacticalCauseHeadline(h), h);
    // 예전 거시 필터는 그대로(순환매가 쓴다) — 장 마감 기사는 여전히 통과하지 않는다
    assert.deepEqual(filterMarketHeadlines(pass), []);
});

test('② FedWatch — 신선도 96시간·1주 전 기준은 지금 기준 7~12일(화면 카드와 같은 창)', () => {
    const now = Date.parse('2026-10-31T00:39:00Z');
    const latest = { ease: 0, noChange: 28, hike: 72, scrapedAt: '2026-10-30T22:53:18.960Z', nextMeetingDate: 'Dec 10, 2026' };
    const week = { ease: 0, noChange: 90.6, hike: 9.4, at: '2026-10-24T00:08:22.941Z', meeting: 'Dec 10, 2026' };
    assert.deepEqual(tacticalFedwatchFrom(latest, week, now), { hike: 72, hold: 28, cut: 0, weekAgoHike: 9.4, at: '2026-10-30T22:53:18.960Z' });
    // 지금 기준 7일이 안 된 기준은 1주 전이 아니다(0 으로 메우지 않고 null)
    assert.equal(tacticalFedwatchFrom(latest, week, Date.parse('2026-10-30T23:30:00Z'))!.weekAgoHike, null);
    assert.equal(tacticalFedwatchFrom(latest, null, now)!.weekAgoHike, null);
    assert.equal(tacticalFedwatchFrom(latest, week, now + 5 * 24 * 3600_000), null, '96시간 넘은 스크랩은 지금 시장 값이 아니다');
    assert.equal(tacticalFedwatchFrom({ ...latest, scrapedAt: '2026-10-31T02:00:00Z' }, week, now), null, '미래 스크랩 거절');
    assert.equal(tacticalFedwatchFrom({ ease: 0, noChange: 0, hike: 0, scrapedAt: latest.scrapedAt }, week, now), null, '0/0/0 은 자료 없음');
});

test('③ 재료 묶음 — 섹터 등락은 세션·날짜가 맞을 때만, 공포탐욕은 CNN 값만, 낡은 10년물 제외', () => {
    const sectors = [
        { id: 'XLE', name: '에너지', change: 1.9 }, { id: 'XLP', name: '필수소비재', change: 1.4 }, { id: 'SMH', name: '반도체', change: -7 },
        { id: 'XLK', name: '기술주', change: -4.9 }, { id: 'AI_PWR', name: 'AI 전력망', change: -3.3 }, { id: 'XLU', name: '유틸리티', change: 0.7 },
    ];
    const fiveDay = Object.fromEntries(sectors.map(s => [s.id, { todayChange: s.change, asOf: '2026-10-30', changes: [0.2, -0.4, 0.1, s.change] }]));
    const en = (ko: string) => ({ 에너지: 'Energy', 필수소비재: 'Consumer Staples', 반도체: 'Semiconductors', 기술주: 'Technology', 'AI 전력망': 'AI Power Grid', 유틸리티: 'Utilities' } as Record<string, string>)[ko] ?? ko;
    const base = { sectors, fiveDay, sectorNameEn: en, us10yLevel: 4.94, us10yChangeBp: -4, us2yLevel: 4.56, fearGreedScore: 26.2, fearGreedSource: 'CNN F&G: fear' };
    const post = tacticalMacroDrivers({ ...base, session: 'POST', cashSessionDate: '2026-10-30', nowMs: Date.parse('2026-10-30T23:30:00Z') })!;
    assert.deepEqual(post.sectors, { sessionDate: '2026-10-30', leaders: [{ en: 'Energy', etf: 'XLE', chgPct: 1.9 }], laggards: [{ en: 'Semiconductors', etf: 'SMH', chgPct: -7 }] });
    assert.deepEqual(post.us10y, { levelPct: 4.94, changeBp: -4 });
    assert.deepEqual(post.fearGreed, { score: 26, zone: 'fear' });
    assert.ok(!JSON.stringify(post).includes('AI_PWR'), '내부 묶음 id 는 글에 새지 않는다');
    // 장후 표 날짜가 그 정규장이 아니면(어제 일봉) 쓰지 않는다 · 장전은 쓰지 않는다
    assert.equal(tacticalMacroDrivers({ ...base, session: 'POST', cashSessionDate: '2026-10-31', nowMs: 0 })!.sectors, undefined);
    assert.equal(tacticalMacroDrivers({ ...base, session: 'PRE', cashSessionDate: '2026-10-30', nowMs: 0 })!.sectors, undefined);
    const reg = tacticalMacroDrivers({ ...base, fiveDay: {}, session: 'REG', nowMs: Date.parse('2026-10-30T18:56:00Z') })!;
    assert.equal(reg.sectors!.sessionDate, '2026-10-30');
    assert.equal(reg.sectors!.live, true);
    assert.equal(tacticalMacroDrivers({ ...base, fearGreedSource: 'VIX Fallback', session: 'PRE' })!.fearGreed, undefined, 'VIX 대체값은 공포탐욕 지수가 아니다');
    assert.equal(tacticalMacroDrivers({ ...base, us10yStale: true, session: 'PRE' })!.us10y, undefined);
    assert.equal(tacticalMacroDrivers({}), undefined, '재료가 하나도 없으면 undefined(프롬프트는 «재료 없음» 경로)');
    // 언어별 섹터 이름 — 한 호출 3언어에서 다른 언어 글자가 새지 않게
    const local = (e: string, l: 'ko' | 'ja') => (l === 'ko' ? ({ Energy: '에너지' } as Record<string, string>)[e] : ({ Energy: 'エネルギー' } as Record<string, string>)[e]);
    assert.match(JSON.stringify(driversForPrompt(post, 'ko', local)), /"sector":"에너지"/);
    assert.match(JSON.stringify(driversForPrompt(post, 'ja', local)), /"sector":"エネルギー"/);
    assert.doesNotMatch(JSON.stringify(driversForPrompt(post, 'en', local)), /[가-힣\u3040-\u30ff]/);
});

test('④ 보관 원인 기사 — 오늘·지금 이전·긴급도 7+·거시 2/지정학 1/시장 3·개별 회사 제외', () => {
    const now = Date.parse('2026-10-30T23:30:00Z');
    const it = (publishedAt: string, category: string, urgency: number, summaryEN: string) => ({ publishedAt, category, urgency, summaryEN });
    const items = [
        it('2026-10-30T16:32:31Z', 'MACRO', 8, "St. Louis Fed President Musalem said a rate hike is needed 'soon', the first signal on the Fed's next move."),
        it('2026-10-30T11:01:00Z', 'MACRO', 7, 'Gold slipped below $4,000 as oil prices and US inflation boosted bets on a Fed rate hike.'),
        it('2026-10-30T16:54:00Z', 'MACRO', 7, 'St. Louis Fed President Musalem said another rate hike is needed soon, offering the first signal of Fed thinking.'),
        it('2026-10-30T12:25:00Z', 'GEOPOLITICAL', 8, 'Crude oil rose past $115 a barrel as attacks in Saudi Arabia fueled concerns about global supply.'),
        it('2026-10-30T18:00:55Z', 'US_MARKET', 9, 'US benchmark equity indexes slid intraday following a tech sell-off after Amazon and Intel earnings.'),
        it('2026-10-30T18:16:00Z', 'US_MARKET', 8, "Reddit shares plunged 30%. The company said its Q3 search traffic was 'down meaningfully'."),
        it('2026-10-30T23:55:00Z', 'US_MARKET', 9, 'The broader market fell sharply with tech stocks leading a steep decline.'),   // 지금 이후
        it('2026-10-29T18:00:00Z', 'US_MARKET', 9, 'Stocks fell sharply as tech sold off on the previous day.'),               // 어제
        it('2026-10-30T15:00:00Z', 'US_MARKET', 5, 'Stocks fell slightly in a quiet session.'),                                 // 긴급도 낮음
    ];
    const out = causeNewsFromArchive(items, now);
    assert.equal(out.length, 4);
    assert.ok(out.every(l => /^\[NEWS PULSE; 2026-10-30T\d\d:\d\d:\d\d\.000Z; \d\d:\d\d ET\] /.test(l)), out.join('\n'));
    assert.ok(out.some(l => l.includes('Musalem said a rate hike is needed')));
    assert.ok(!out.some(l => /Reddit|previous day|quiet session|broader market/.test(l)));
    assert.ok(out[0] > out[1], '최신 먼저');
    // 합치기 — 같은 기사 제거·시장 원인만·상한
    const merged = mergeCauseNews(['[NEWS PULSE; 2026-10-30T23:36:17.000Z; 19:36 ET] S&P 500 Snapshot: Stocks Edge Lower for 3rd Straight Week',
        '[Polygon; 2026-10-30T23:36:17.000Z; 19:36 ET] S&P 500 Snapshot: Stocks Edge Lower for 3rd Straight Week — The S&P 500 fell 0.57%',
        '[NEWS PULSE; 2026-10-30T23:58:27.000Z; 19:58 ET] Why Merck Stock Flew Higher on Friday'], out);
    assert.equal(merged.filter(l => l.includes('Snapshot')).length, 1);
    assert.ok(!merged.some(l => l.includes('Merck')));
});

const prompt = (loc: 'ko' | 'en' | 'ja', over: Record<string, unknown> = {}) => buildTacticalPrompt({ ...context, ...over }, loc);

test('⑤ 프롬프트 — MACRO_DRIVERS 는 근거(데이터) 칸·OBSERVATIONS 와 분리·없으면 null·휴장일엔 직전 정규장 기사', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const p = prompt(loc);
        assert.ok(p.indexOf('TODAY_NEWS:') < p.indexOf('MACRO_DRIVERS:'), '숫자 대조 범위(TODAY_NEWS 부터) 안');
        assert.match(p, /MACRO_DRIVERS: \{"next FOMC rate pricing \(FedWatch, Fed funds futures\)":\{"hikePct":72,"holdPct":28,"cutPct":0\}/);
        assert.doesNotMatch(p.match(/^OBSERVATIONS: .*$/m)![0], /macroDrivers|FedWatch/);
        assert.match(p, /WHY \(ONE sentence — the heart of the story\)/);
        assert.match(p, /ONLY when TODAY_NEWS is empty AND MACRO_DRIVERS is null/);
        assert.match(p, /never a Treasury yield, a probability, an index level/);
    }
    assert.match(prompt('ko', { macroDrivers: undefined }), /^MACRO_DRIVERS: null$/m);
    // 토요일(ET) 휴장 — 금요일 장 마감 기사를 원인 근거로 쓸 수 있다(예전엔 «오늘(토)» 기사만이라 항상 빈칸)
    const sat = prompt('ko', { asOf: '2026-10-31T14:00:00.000Z', session: 'CLOSED' });
    assert.match(sat.match(/^TODAY_NEWS: .*$/m)![0], /Nasdaq Composite posted its worst day since June/);
    // 정규장(REG)은 오늘 기사만
    const reg = prompt('ko', { asOf: '2026-11-02T15:00:00.000Z', session: 'REG' });
    assert.match(reg, /^TODAY_NEWS: \[\]$/m);
});

const FIRST = '10/30(금) 정규장에서 나스닥 종합은 2.9%, S&P500은 1.8% 내렸고, 지금 종가 이후 선물 변화는 미확인입니다.';
const SO = '시장 건강도(RLSI 30.8)가 약해 반등을 받칠 힘이 부족하고, 옵션 포지션(GEX +8)은 중립이라 흔들림을 받쳐 주지도 키우지도 않습니다.';
const NEXT = '다음 분기점은 S&P 500 옵션 지지선 7500으로, 아래에서는 딜러 헤지가 흔들림을 키우고 위에서는 완충합니다.';
const ko = (why: string, next = NEXT) => [FIRST, why, SO, next].join(' ');

test('⑥ WHY 계약 — 재료가 있으면 «재료 확인 안 됨» 탈락 · 지표 숫자만으로도 통과 · 보도 인용은 날짜+시각', () => {
    const p = prompt('ko');
    const drivers = '시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%에 긴축 우려가 겹쳤고, 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 오르고 반도체(SMH) −7%가 밀렸습니다.';
    assert.deepEqual(checkTacticalOutput(ko(drivers), 'ko', p), []);
    const cited = '기술주 급락으로 시가총액이 크게 줄었다는 10/30(금) 16:08 ET 보도 속에, 시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%와 공포·탐욕 지수 26(공포 구간)이 위험 회피를 키웠습니다.';
    assert.deepEqual(checkTacticalOutput(ko(cited), 'ko', p), []);
    // 운영 10/30 장후 문장 — 재료(FedWatch 72%·공포탐욕 26)가 있는데 «확인되지 않았습니다»
    assert.ok(checkTacticalOutput(ko('오늘 시장 전체를 움직인 뚜렷한 재료는 확인되지 않았습니다.'), 'ko', p).includes('tactical:why-material-required'));
    // 시각만(날짜 없음) 인용 → 탈락(첫 실모델 «09:50 ET 보도 속에»)
    assert.ok(checkTacticalOutput(ko(cited.replace('10/30(금) 16:08 ET', '16:08 ET')), 'ko', p).includes('tactical:news-source-time-required'));
    // 보도만 인용하고 지표 숫자가 하나도 없으면 «소재를 지표로» 풀지 않은 것
    assert.ok(checkTacticalOutput(ko('기술주 급락을 다룬 10/30(금) 16:08 ET 보도 속에 위험 회피가 짙어졌습니다.'), 'ko', p).includes('tactical:why-drivers-required'));
    // 입력에 없는 확률(85%)은 숫자 대조가 막는다 — 허용 목록은 입력 숫자뿐(정수는 쓴 자릿수 반올림 ±1 — 기존 계약)
    assert.ok(checkTacticalOutput(ko(drivers.replace('72%', '85%')), 'ko', p).includes('tactical:number'));
    // MACRO_DRIVERS 가 없는 프롬프트에서 72% 는 근거 없는 숫자
    assert.ok(checkTacticalOutput(ko(drivers), 'ko', prompt('ko', { macroDrivers: undefined, marketNewsHeadlines: [] })).includes('tactical:number'));
    // 재료가 정말 없으면 예전 계약 그대로(«확인되지 않았습니다» 통과·다른 서술 탈락)
    const none = prompt('ko', { macroDrivers: undefined, marketNewsHeadlines: [] });
    assert.ok(!checkTacticalOutput(ko('오늘 시장 전체를 움직인 뚜렷한 재료는 확인되지 않았습니다.'), 'ko', none).some(r => r.startsWith('tactical:why') || r.includes('cause-required')));
    assert.ok(checkTacticalOutput(ko('유가와 금리가 함께 움직였습니다.'), 'ko', none).includes('tactical:unconfirmed-cause-required'));
});

test('⑦ WHY 나열·지어낸 변화 · NEXT 경계 계약', () => {
    const p = prompt('ko');
    const roll = '시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 미국 10년물 금리 4.94%, 미국 2년물 금리 4.56%, 공포·탐욕 지수 26, 에너지(XLE) +1.9%, 반도체(SMH) −7%가 함께 움직였습니다.';
    assert.ok(checkTacticalOutput(ko(roll), 'ko', p).includes('tactical:why-rollcall'));
    // 1주 전 값이 입력에 없는데 «72%로 높아져» — 실모델 10/31 첫 시도
    const rose = '시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 72%로 높아져 긴축 우려가 커졌고, 공포·탐욕 지수 26(공포 구간)으로 위험 회피가 짙어졌습니다.';
    assert.ok(checkTacticalOutput(ko(rose), 'ko', p).includes('tactical:why-unsupported-change'));
    const withWeek = prompt('ko', { macroDrivers: { ...context.macroDrivers, fedwatch: { ...context.macroDrivers.fedwatch, weekAgoHikePct: 9.4 } } });
    const rose2 = '시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 1주 전 9.4%에서 72%로 뛰어 긴축 우려가 커졌고, 공포·탐욕 지수 26(공포 구간)으로 위험 회피가 짙어졌습니다.';
    assert.ok(!checkTacticalOutput(ko(rose2), 'ko', withWeek).includes('tactical:why-unsupported-change'));
    assert.deepEqual(checkTacticalOutput(ko(rose2), 'ko', withWeek), []);
    const enText = ['In the 10/30 cash session Nasdaq Composite fell 2.9% and S&P 500 fell 1.8%; futures change since that close is unconfirmed.',
        'Markets now price a 72% chance of a hike at the next FOMC (FedWatch), up from a week ago, while the Fear & Greed index sits at 26 (fear).',
        'Market health (RLSI 30.8) is weak, so rebounds lack support, and options positioning (GEX +8) is neutral.',
        'The next test is the S&P 500 put floor at 7500: below it dealer hedging amplifies swings, above it the cushion holds.'].join(' ');
    assert.ok(checkTacticalOutput(enText, 'en', prompt('en')).includes('tactical:why-unsupported-change'));
    assert.ok(!checkTacticalOutput(enText.replace(', up from a week ago', ''), 'en', prompt('en')).includes('tactical:why-unsupported-change'));
    const jaText = ['本日(10/30)の通常取引でナスダック総合は2.9%、S&P500は1.8%下落し、現在の取引終了後の先物変化は未確認です。',
        '市場が織り込む次回FOMCの利上げ確率(FedWatch)が72%へ跳ね上がり、恐怖・強欲指数26(恐怖ゾーン)とリスク回避が深まりました。',
        '市場の健全度(RLSI 30.8)が弱く反発を支える力が乏しく、オプション・ポジション(GEX +8)は中立です。',
        '次の分岐点はS&P500のプット・フロア7500で、その下ではディーラーのヘッジが値動きを増幅します。'].join('');
    assert.ok(checkTacticalOutput(jaText, 'ja', prompt('ja')).includes('tactical:why-unsupported-change'));
    assert.ok(!checkTacticalOutput(jaText.replace('72%へ跳ね上がり', '72%で'), 'ja', prompt('ja')).includes('tactical:why-unsupported-change'));
    // NEXT — 지표를 경계로 쓰면 탈락(실모델 «다음 분기점은 미국 10년물 금리 4.94%로 …»), 옵션 경계·미확인은 통과
    assert.deepEqual(tacticalNextBoundaryReasons('다음 분기점은 미국 10년물 금리 4.94%로, 이 수준 위에서는 긴축 우려가 완화되고 아래에서는 심화됩니다.'), ['tactical:next-boundary-required']);
    assert.deepEqual(tacticalNextBoundaryReasons(NEXT), []);
    assert.deepEqual(tacticalNextBoundaryReasons('The next test is the S&P 500 put floor at 7500: below it dealer hedging amplifies swings.'), []);
    assert.deepEqual(tacticalNextBoundaryReasons('次の分岐点はS&P500のプット・フロア7500です。'), []);
    assert.deepEqual(tacticalNextBoundaryReasons('다음 분기점은 아직 확인되지 않았습니다.'), []);
    assert.deepEqual(tacticalNextBoundaryReasons('다음 분기점은 11/3(화) 10:00 ET(한국 00:00) 예정된 ISM 제조업(ISM Manufacturing PMI)입니다.'), [], '일정 주장은 일정 검사가 맡는다');
    assert.ok(checkTacticalOutput(ko('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%와 공포·탐욕 지수 26(공포 구간)이 위험 회피를 키웠습니다.', '다음 분기점은 미국 10년물 금리 4.94%로, 이 수준 위에서는 긴축 우려가 완화됩니다.'), 'ko', p).includes('tactical:next-boundary-required'));
    // 원인 서술의 회사 이름은 입력에 있는 회사만(실모델 «Alphabet, Amazon and Intel» → «애플·아마존·인텔»)
    const comp = (names: string) => ko(`${names} 실적 부진을 다룬 10/30(금) 09:50 ET 보도 속에, 시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%와 공포·탐욕 지수 26(공포 구간)이 위험 회피를 키웠습니다.`);
    assert.ok(checkTacticalOutput(comp('애플·아마존·인텔'), 'ko', p).includes('tactical:why-company-ungrounded'));
    assert.ok(!checkTacticalOutput(comp('알파벳·아마존·인텔'), 'ko', p).includes('tactical:why-company-ungrounded'));
    assert.ok(!checkTacticalOutput(ko('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%와 공포·탐욕 지수 26(공포 구간) 속에 소비자 심리가 위축됐습니다.'), 'ko', p).includes('tactical:why-company-ungrounded'), '«소비자» 속 «비자»는 회사가 아니다');
    // 길이 상한(출구) — 스토리형 +30~50%
    assert.deepEqual(TACTICAL_GATE_MAX_CHARS, { ko: 680, ja: 700, en: 1150 });
});

test('⑧ 숫자 주어(Tactical 옵션) — 확률·괄호 속 전일 대비 변화는 주어가 있다(고아 숫자 아님) · 주어 없는 숫자는 그대로 탈락', () => {
    assert.deepEqual(claimReasons('시장이 반영한 다음 FOMC 금리 인상 확률 72%입니다.', 't', { tactical: true }), []);
    assert.deepEqual(claimReasons('markets now price a 72% chance of a hike at the next FOMC.', 't', { tactical: true }), []);
    assert.deepEqual(claimReasons('次回FOMCの利上げ確率72%です。', 't', { tactical: true }), []);
    assert.deepEqual(claimReasons('미국 10년물 금리 4.94%(전일 대비 4bp 하락)로 금리 부담이 줄었습니다.', 't', { tactical: true }), []);
    assert.deepEqual(claimReasons('米10年債利回り4.94%(前日比4bp低下)です。', 't', { tactical: true }), []);
    assert.ok(claimReasons('미국 10년물 금리 4.94%이고, 이는 -0.74% 하락과 일치합니다.', 't', { tactical: true }).some(r => r.includes('orphan-number')));
});

test('⑨ 관문 10311015 — 재료 숫자는 «그 지표의 값»·방향은 입력 변화량 부호와 대조(다른 지표 숫자 빌리기 차단)', () => {
    const p = prompt('ko');
    const w = (why: string) => checkTacticalOutput(ko(why), 'ko', p);
    const tail = ', 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.';
    // 관문 재현 5건
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 26%' + tail).includes('tactical:driver-value:fedwatch'));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%에, 공포·탐욕 지수 72(공포 구간)가 겹쳤습니다.').includes('tactical:driver-value:feargreed'));
    assert.ok(w('미국 10년물 금리 30.8%' + tail).includes('tactical:driver-value:us10y'));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 72%로 하락' + tail).includes('tactical:driver-unsupported-change:fedwatch'));
    assert.ok(w('미국 10년물 금리 4.94% 상승' + tail).includes('tactical:driver-direction:us10y'));
    // 인상·동결 가르기 — 28 은 동결 확률
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 28%' + tail).includes('tactical:driver-value:fedwatch'));
    assert.ok(!w('시장이 반영한 다음 FOMC 금리 동결 확률(FedWatch) 28%' + tail).some(r => r.startsWith('tactical:driver')));
    // 섹터 부호
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26 속에 에너지(XLE) −1.9%가 밀렸습니다.').includes('tactical:driver-direction:sector:XLE'));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26 속에 반도체(SMH) −4%가 밀렸습니다.').includes('tactical:driver-value:sector:SMH'));
    // 정상 문장 — 같은 지표의 수준·변화(괄호)·반올림
    assert.ok(!w('미국 10년물 금리 4.94%(전일 대비 4bp 하락)와 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 오르고 반도체(SMH) −7%가 밀렸습니다.').some(r => r.startsWith('tactical:driver')));
    assert.ok(!w('미국 10년물 금리가 4bp 내려 4.9%가 됐지만 공포·탐욕 지수 26(공포 구간) 속에 반도체(SMH) −7%가 밀렸습니다.').some(r => r.startsWith('tactical:driver')));
    // 영어 «a 26% chance of a hike»(이름 앞 숫자) · 일본어 상승/하락
    const en = (why: string) => checkTacticalOutput(['In the 10/30 cash session Nasdaq Composite fell 2.9% and S&P 500 fell 1.8%; futures change since that close is unconfirmed.', why,
        'Market health (RLSI 30.8) is weak, so rebounds lack support, and options positioning (GEX +8) is neutral.',
        'The next test is the S&P 500 put floor at 7500: below it dealer hedging amplifies swings, above it the cushion holds.'].join(' '), 'en', prompt('en'));
    assert.ok(en('Markets now price a 26% chance of a hike at the next FOMC (FedWatch), with the Fear & Greed index at 26 (fear).').includes('tactical:driver-value:fedwatch'));
    assert.ok(!en('Markets now price a 72% chance of a hike at the next FOMC (FedWatch), with the Fear & Greed index at 26 (fear).').some(r => r.startsWith('tactical:driver')));
    assert.ok(en('The 10-year Treasury yield rose to 4.94% as markets price a 72% chance of a hike at the next FOMC.').includes('tactical:driver-direction:us10y'));
    const ja = (why: string) => checkTacticalOutput(['本日(10/30)の通常取引でナスダック総合は2.9%、S&P500は1.8%下落し、現在の取引終了後の先物変化は未確認です。', why,
        '市場の健全度(RLSI 30.8)が弱く反発を支える力が乏しく、オプション・ポジション(GEX +8)は中立です。',
        '次の分岐点はS&P500のプット・フロア7500で、その下ではディーラーのヘッジが値動きを増幅します。'].join(''), 'ja', prompt('ja'));
    assert.ok(!ja('米10年債利回り4.94%(前日比4bp低下)の中で恐怖・強欲指数26(恐怖ゾーン)とリスク回避が深まりました。').some(r => r.startsWith('tactical:driver')));
    assert.ok(ja('米10年債利回り4.94%に上昇する中で恐怖・強欲指数26(恐怖ゾーン)とリスク回避が深まりました。').includes('tactical:driver-direction:us10y'));
    // 관문 10311024 ① 지금 값·1주 전 값 자리 바꿈 «72%에서 9.4%로» · ② 부호 없는 섹터 숫자 + 반대 방향어 «에너지(XLE) 1.9% 하락»
    const wk = prompt('ko', { macroDrivers: { ...context.macroDrivers, fedwatch: { ...context.macroDrivers.fedwatch, weekAgoHikePct: 9.4 } } });
    const ww = (why: string) => checkTacticalOutput(ko(why), 'ko', wk);
    assert.ok(ww('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 72%에서 9.4%로 바뀌었고' + tail).includes('tactical:driver-value:fedwatch'));
    assert.ok(ww('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 9.4%' + tail).includes('tactical:driver-value:fedwatch'), '표식 없는 숫자 하나는 지금 값');
    for (const ok of ['시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 9.4%에서 72%로 뛰었고', '시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 1주 전 9.4%에서 72%로 뛰었고',
        '시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 72%(1주 전 9.4%)에 이르렀고'])
        assert.ok(!ww(ok + tail).some(r => r.startsWith('tactical:driver')), ok);
    assert.ok(ww('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 1주 전 9.4%에서 72%로 낮아졌고' + tail).includes('tactical:driver-direction:fedwatch'));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26 속에 에너지(XLE) 1.9% 하락이 나타났습니다.').includes('tactical:driver-direction:sector:XLE'));
    assert.ok(en('Markets now price a 72% chance of a hike at the next FOMC, while Energy (XLE) fell 1.9%.').includes('tactical:driver-direction:sector:XLE'));
    assert.ok(!en('Markets now price a 72% chance of a hike at the next FOMC, while Semiconductors (SMH) fell 7%.').some(r => r.startsWith('tactical:driver')));
    // 공포·탐욕 구간 낱말·섹터 이름 바꿔치기 · FedWatch 만 쓴 확률
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26(탐욕 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-zone:feargreed'));
    assert.ok(en('Markets now price a 72% chance of a hike at the next FOMC, with the Fear & Greed index at 26 (greed).').includes('tactical:driver-zone:feargreed'));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26 속에 반도체(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-sector-name:sector:XLE'));
    assert.ok(w('FedWatch 기준 26%의 인상 가능성 속에, 공포·탐욕 지수 26(공포 구간)으로 위험 회피가 짙어졌습니다.').includes('tactical:driver-value:fedwatch'));
    assert.ok(!w('스퀴즈 분출 확률 27%와 공포·탐욕 지수 26(공포 구간)이 겹쳤습니다.').some(r => r.startsWith('tactical:driver-value:fedwatch')), '스퀴즈 확률은 금리 경로 확률이 아니다');
    // 입력에 이전 값이 없는 지표의 변화 서술 · 영어 «up from 9.4% a week ago»(표식이 숫자 뒤)
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수가 26으로 내려앉아 에너지(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-unsupported-change:feargreed'));
    assert.ok(w('미국 2년물 금리 4.56%로 상승한 가운데 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-unsupported-change:us2y'));
    const enWk = (why: string) => checkTacticalOutput(['In the 10/30 cash session Nasdaq Composite fell 2.9% and S&P 500 fell 1.8%; futures change since that close is unconfirmed.', why,
        'Market health (RLSI 30.8) is weak, so rebounds lack support, and options positioning (GEX +8) is neutral.',
        'The next test is the S&P 500 put floor at 7500: below it dealer hedging amplifies swings, above it the cushion holds.'].join(' '), 'en', prompt('en', { macroDrivers: { ...context.macroDrivers, fedwatch: { ...context.macroDrivers.fedwatch, weekAgoHikePct: 9.4 } } }));
    assert.ok(!enWk('Markets now price a 72% chance of a hike at the next FOMC up from 9.4% a week ago, with the Fear & Greed index at 26 (fear).').some(r => r.startsWith('tactical:driver')));
    // 관문 10311028 — ① 부호 붙은 변화량 «+4bp»(입력 −4bp) ② 티커 없는 섹터 이름 «에너지 섹터가 7% 하락» ③ «26(극단적 공포 구간)»(입력 공포)
    assert.ok(w('미국 10년물 금리 4.94%(전일 대비 +4bp)' + tail).includes('tactical:driver-direction:us10y'));
    assert.ok(!w('미국 10년물 금리 4.94%(전일 대비 −4bp)' + tail).some(r => r.startsWith('tactical:driver')));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26 속에 에너지 섹터가 7% 하락했습니다.').some(r => r.startsWith('tactical:driver-value:sector:XLE')));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26 속에 반도체 섹터가 7% 밀렸습니다.').every(r => !r.startsWith('tactical:driver')));
    assert.ok(en('Markets now price a 72% chance of a hike at the next FOMC, while the Energy sector fell 7%.').some(r => r.startsWith('tactical:driver-value:sector:XLE')));
    assert.ok(!en('Markets now price a 72% chance of a hike at the next FOMC, while Clean Energy fell 7%.').some(r => r.startsWith('tactical:driver-value:sector:XLE')), '«Clean Energy» 는 에너지 섹터가 아니다');
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26(극단적 공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-zone:feargreed'));
    // 재료 줄이 없는 옛 프롬프트도 OBSERVATIONS 의 10년물·공포탐욕으로 대조
    const old = prompt('ko', { macroDrivers: undefined });
    assert.ok(checkTacticalOutput(ko('미국 10년물 금리 30.8%' + tail), 'ko', old).includes('tactical:driver-value:us10y'));
});

test('⑩ 관문 10311033 ① — 섹터 이름·ETF 짝은 고정 정본과 대조(입력에 없는 다른 섹터 이름도) · 3언어 · 앞 이름·괄호 속 뒤 이름', () => {
    // 정본 표 = universePolicy.SECTOR_MAP 의 ETF 티커 칸(SSOT) — 새 섹터가 생기면 이 시험이 알린다
    const ssot = Object.fromEntries(Object.entries(SECTOR_MAP).filter(([id]) => /^[A-Z]{2,5}$/.test(id)).map(([id, v]) => [id, v.name]));
    assert.deepEqual(SECTOR_ETF_KO, ssot);
    for (const ko of Object.values(SECTOR_ETF_KO)) assert.ok(SECTOR_NAME_EN[ko], `영어 이름 없음: ${ko}`);
    const p = prompt('ko');   // 재료 섹터 = 에너지(XLE)·반도체(SMH)뿐 — «기술주»는 입력에 없다
    const w = (why: string) => checkTacticalOutput(ko(why), 'ko', p);
    const head = '시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26(공포 구간) 속에 ';
    // 관문 재현: «기술주(XLE) +1.9%» — 예전엔 빈 목록
    assert.ok(w(head + '기술주(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-sector-name:sector:XLE'));
    assert.ok(w(head + 'XLE(기술주) +1.9%만 올랐습니다.').includes('tactical:driver-sector-name:sector:XLE'));
    assert.ok(w(head + '기술 섹터(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-sector-name:sector:XLE'));
    assert.ok(w(head + '유틸리티(SMH) −7%가 밀렸습니다.').includes('tactical:driver-sector-name:sector:SMH'));
    assert.ok(!w(head + '에너지(XLE) +1.9%만 오르고 반도체(SMH) −7%가 밀렸습니다.').some(r => r.startsWith('tactical:driver')));
    const en = (why: string) => checkTacticalOutput(['In the 10/30 cash session Nasdaq Composite fell 2.9% and S&P 500 fell 1.8%; futures change since that close is unconfirmed.', why,
        'Market health (RLSI 30.8) is weak, so rebounds lack support, and options positioning (GEX +8) is neutral.',
        'The next test is the S&P 500 put floor at 7500: below it dealer hedging amplifies swings, above it the cushion holds.'].join(' '), 'en', prompt('en'));
    assert.ok(en('Markets now price a 72% chance of a hike at the next FOMC, while Technology (XLE) rose 1.9%.').includes('tactical:driver-sector-name:sector:XLE'));
    assert.ok(en('Markets now price a 72% chance of a hike at the next FOMC, while Clean Energy (XLE) rose 1.9%.').includes('tactical:driver-sector-name:sector:XLE'), '«Clean Energy» 는 에너지가 아니다');
    assert.ok(!en('Markets now price a 72% chance of a hike at the next FOMC, while the Energy sector (XLE) rose 1.9% and Semiconductors (SMH) fell 7%.').some(r => r.startsWith('tactical:driver')));
    const ja = (why: string) => checkTacticalOutput(['本日(10/30)の通常取引でナスダック総合は2.9%、S&P500は1.8%下落し、現在の取引終了後の先物変化は未確認です。', why,
        '市場の健全度(RLSI 30.8)が弱く反発を支える力が乏しく、オプション・ポジション(GEX +8)は中立です。',
        '次の分岐点はS&P500のプット・フロア7500で、その下ではディーラーのヘッジが値動きを増幅します。'].join(''), 'ja', prompt('ja'));
    assert.ok(ja('市場が織り込む次回FOMCの利上げ確率(FedWatch)72%の中、テクノロジー(XLE)+1.9%だけが上昇しました。').includes('tactical:driver-sector-name:sector:XLE'));
    assert.ok(!ja('市場が織り込む次回FOMCの利上げ確率(FedWatch)72%の中、エネルギー(XLE)+1.9%だけが上昇し、半導体(SMH)は−7%と下げました。').some(r => r.startsWith('tactical:driver')));
    // 함정 — 다른 이름의 꼬리·낱말 일부·일반 낱말 뒤 ETF 는 짝이 아니다
    assert.deepEqual(sectorPairReasons('Clean Energy (ICLN) fell 3%, Fintech (XLF) names held, 반도체 산업(SMH) −7%.'), []);
    // 정본 밖 티커(내부 묶음·개별 종목)는 기존 규칙만 — 이름이 붙어도 이 검사는 판정하지 않는다
    assert.deepEqual(sectorPairReasons('기술주(NVDA) 약세, AI 전력망(AI_PWR) 약세'), []);
    // 번역본·저장본도 같은 짝 검사(재료 스냅샷이 없어도 — 고정 사실)
    assert.ok(checkTacticalTranslated(ko(head + '기술주(XLE) +1.9%만 올랐습니다.'), 'ko', p).includes('tactical:driver-sector-name:sector:XLE'));
    assert.ok(checkTacticalStored(ko(head + '기술주(XLE) +1.9%만 올랐습니다.'), p).includes('tactical:driver-sector-name:sector:XLE'));
});

test('⑪ 관문 10311033 남은 위험 — 저장본·복구본 지표 대조는 «생성 당시 재료 스냅샷»으로 · 스냅샷 없으면 숫자 대조 생략(예전 동작)', () => {
    const p = prompt('ko');
    const snap = tacticalDriverSnapshot(p)!;
    assert.ok(snap && JSON.parse(snap).v === 1 && JSON.parse(snap).drivers.includes('FedWatch'));
    const good = ko('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 오르고 반도체(SMH) −7%가 밀렸습니다.');
    const bad = ko('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 26%, 공포·탐욕 지수 72(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.');
    // 스냅샷 있음: 생성 검사와 같은 함수로 탈락
    const r = checkTacticalStored(bad, p, { driverSnapshot: snap, driverText: bad });
    assert.ok(r.includes('tactical:driver-value:fedwatch') && r.includes('tactical:driver-value:feargreed'), r.join(','));
    assert.deepEqual(checkTacticalStored(good, p, { driverSnapshot: snap, driverText: good }).filter(x => x.startsWith('tactical:driver')), []);
    // 스냅샷 없음(이 변경 전 저장분·v2 복구본) = 숫자 대조 생략 — 예전 동작 그대로
    assert.deepEqual(checkTacticalStored(bad, p).filter(x => x.startsWith('tactical:driver')), []);
    // 대조 기준은 «지금 프롬프트»가 아니라 스냅샷 — 지금 재료가 바뀌어도(확률 72→80) 생성 당시 정상 글은 통과(«준비 중» 고정 회귀 방지)
    const now = prompt('ko', { macroDrivers: { ...context.macroDrivers, fedwatch: { ...context.macroDrivers.fedwatch, nextFomcHikePct: 80, nextFomcHoldPct: 20 }, fearGreed: { score: 40, zone: 'fear' } } });
    assert.ok(checkTacticalOutput(good, 'ko', now).includes('tactical:driver-value:fedwatch'), '전제: 지금 재료로 대조하면 정상 글도 탈락한다');
    assert.deepEqual(checkTacticalStored(good, now, { driverSnapshot: snap, driverText: good }).filter(x => x.startsWith('tactical:driver')), []);
    // 채운 글이 없으면(자리표가 남음·basis 없음) 숫자 대조 생략 · 깨진 스냅샷도 생략
    assert.deepEqual(storedDriverReasons(bad, snap, undefined), []);
    assert.deepEqual(storedDriverReasons(bad, '{broken', bad), []);
    // 재료 줄이 없는 옛 프롬프트 = OBSERVATIONS 칸만 스냅샷(10년물 30.8% 는 탈락)
    const old = prompt('ko', { macroDrivers: undefined });
    const oldSnap = tacticalDriverSnapshot(old)!;
    assert.equal(JSON.parse(oldSnap).drivers, '');
    const t = ko('미국 10년물 금리 30.8%, 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.');
    assert.ok(storedDriverReasons(t, oldSnap, t).includes('tactical:driver-value:us10y'));
});

test('⑫ 관문 10311057 ① — 장후·휴장 섹터 등락은 «그 날짜 일봉»의 전일 대비(코어 change 가 스냅샷 대체값 ≈0% 여도) · 일봉 등락 없으면 뺀다', () => {
    const sectors = [
        { id: 'XLE', name: '에너지', change: 0.01 }, { id: 'XLP', name: '필수소비재', change: 0 }, { id: 'SMH', name: '반도체', change: -0.02 },
        { id: 'XLK', name: '기술주', change: 0 }, { id: 'XLU', name: '유틸리티', change: 0.01 },
    ];   // 마지막 세션 등락 조회 실패 → 스냅샷 계산(장외 ≈0%) 대체값
    const daily: Record<string, number> = { XLE: 1.9, XLP: 1.4, SMH: -7, XLK: -4.9, XLU: 0.7 };
    const fiveDay = Object.fromEntries(sectors.map(s => [s.id, { todayChange: s.change, asOf: '2026-10-30', changes: [0.3, -0.2, 0.5, daily[s.id]] }]));
    const en = (ko: string) => ({ 에너지: 'Energy', 필수소비재: 'Consumer Staples', 반도체: 'Semiconductors', 기술주: 'Technology', 유틸리티: 'Utilities' } as Record<string, string>)[ko] ?? ko;
    for (const session of ['POST', 'CLOSED']) {
        const d = tacticalMacroDrivers({ sectors, fiveDay, sectorNameEn: en, session, cashSessionDate: '2026-10-30', nowMs: Date.parse('2026-10-31T02:00:00Z') })!;
        assert.deepEqual(d.sectors, { sessionDate: '2026-10-30', leaders: [{ en: 'Energy', etf: 'XLE', chgPct: 1.9 }], laggards: [{ en: 'Semiconductors', etf: 'SMH', chgPct: -7 }] }, session);
    }
    // 일봉 등락이 없는 섹터는 0 으로 메우지 않고 뺀다(넷 미만이면 섹터 칸 전체 없음)
    const noDaily = Object.fromEntries(sectors.map(s => [s.id, { todayChange: s.change, asOf: '2026-10-30' }]));
    assert.equal(tacticalMacroDrivers({ sectors, fiveDay: noDaily, sectorNameEn: en, session: 'POST', cashSessionDate: '2026-10-30', nowMs: 0 }), undefined);
    // 장중(REG)은 코어 change(지금 값) 그대로
    const reg = tacticalMacroDrivers({ sectors: sectors.map(s => ({ ...s, change: daily[s.id] / 2 })), fiveDay: noDaily, sectorNameEn: en, session: 'REG', nowMs: Date.parse('2026-10-30T15:00:00Z') })!;
    assert.deepEqual(reg.sectors?.leaders, [{ en: 'Energy', etf: 'XLE', chgPct: 1 }]);
});

test('⑬ 관문 10311118 — 부호 붙은 수준·확률 숫자는 입력 값 부호와 대조(«10년물 −4.94%»·«-72% chance» 차단) · 정상 부호는 통과', () => {
    const p = prompt('ko');
    const w = (why: string) => checkTacticalOutput(ko(why), 'ko', p);
    const tail = ', 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.';
    assert.ok(w('미국 10년물 금리 −4.94%' + tail).includes('tactical:driver-direction:us10y'));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) -72%' + tail).includes('tactical:driver-direction:fedwatch'));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%, 공포·탐욕 지수 −26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.').includes('tactical:driver-direction:feargreed'));
    const en = (why: string) => checkTacticalOutput(['In the 10/30 cash session Nasdaq Composite fell 2.9% and S&P 500 fell 1.8%; futures change since that close is unconfirmed.', why,
        'Market health (RLSI 30.8) is weak, so rebounds lack support, and options positioning (GEX +8) is neutral.',
        'The next test is the S&P 500 put floor at 7500: below it dealer hedging amplifies swings, above it the cushion holds.'].join(' '), 'en', prompt('en'));
    assert.ok(en('Markets now price a -72% chance of a hike at the next FOMC (FedWatch), with the Fear & Greed index at 26 (fear).').includes('tactical:driver-direction:fedwatch'));
    const ja = (why: string) => checkTacticalOutput(['本日(10/30)の通常取引でナスダック総合は2.9%、S&P500は1.8%下落し、現在の取引終了後の先物変化は未確認です。', why,
        '市場の健全度(RLSI 30.8)が弱く反発を支える力が乏しく、オプション・ポジション(GEX +8)は中立です。',
        '次の分岐点はS&P500のプット・フロア7500で、その下ではディーラーのヘッジが値動きを増幅します。'].join(''), 'ja', prompt('ja'));
    assert.ok(ja('米10年債利回り−4.94%の中で恐怖・強欲指数26(恐怖ゾーン)とリスク回避が深まりました。').includes('tactical:driver-direction:us10y'));
    // 정상 — 부호 없는 수준 · 음수 변화량(−4bp) · 음수 섹터(−7%)
    assert.ok(!w('미국 10년물 금리 4.94%(전일 대비 −4bp 하락)와 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 오르고 반도체(SMH) −7%가 밀렸습니다.').some(r => r.startsWith('tactical:driver')));
    // 저장본 스냅샷 경로도 같은 함수
    const bad = ko('미국 10년물 금리 −4.94%' + tail);
    assert.ok(storedDriverReasons(bad, tacticalDriverSnapshot(p), bad).includes('tactical:driver-direction:us10y'));
});

test('⑭ 관문 10311121 — 그사이 FOMC 가 열려 «다음 회의»가 바뀌면 1주 전 확률을 쓰지 않는다(다른 회의 확률을 변화로 잇지 않게) · 회의 날짜 모르면 쓰지 않는다', () => {
    const now = Date.parse('2026-10-31T00:39:00Z');
    const latest = { ease: 0, noChange: 28, hike: 72, scrapedAt: '2026-10-30T22:53:18.960Z', nextMeetingDate: 'Dec 10, 2026' };
    const week = { ease: 0, noChange: 90.6, hike: 9.4, at: '2026-10-24T00:08:22.941Z' };
    assert.equal(tacticalFedwatchFrom(latest, { ...week, meeting: 'Dec 10, 2026' }, now)!.weekAgoHike, 9.4);
    assert.equal(tacticalFedwatchFrom(latest, { ...week, meeting: '2026-12-10' }, now)!.weekAgoHike, 9.4, '표기가 달라도 같은 날짜면 같은 회의');
    assert.equal(tacticalFedwatchFrom(latest, { ...week, meeting: 'Oct 29, 2026' }, now)!.weekAgoHike, null, '회의가 바뀌었다(10/29 회의 → 12/10 회의)');
    assert.equal(tacticalFedwatchFrom(latest, week, now)!.weekAgoHike, null, '1주 전 행의 회의를 모르면 쓰지 않는다');
    assert.equal(tacticalFedwatchFrom({ ...latest, nextMeetingDate: null }, { ...week, meeting: 'Dec 10, 2026' }, now)!.weekAgoHike, null);
    // 1주 전 값이 없으면 프롬프트에 hikePctOneWeekAgo 가 없고, «9.4%에서 72%로 뛰었다»는 지어낸 변화로 탈락
    const d = tacticalMacroDrivers({ fedwatch: tacticalFedwatchFrom(latest, { ...week, meeting: 'Oct 29, 2026' }, now), nowMs: now })!;
    assert.equal(d.fedwatch!.weekAgoHikePct, undefined);
    const p = prompt('ko', { macroDrivers: { ...context.macroDrivers, fedwatch: d.fedwatch } });
    const r = checkTacticalOutput(ko('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch)이 9.4%에서 72%로 뛰었고, 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.'), 'ko', p);
    assert.ok(r.some(x => x === 'tactical:why-unsupported-change' || x.startsWith('tactical:driver-')), r.join(','));
});

test('⑮ 관문 10311124 — «인상 가능성·odds of a hike·利上げの可能性»도 확률 지표 이름(다른 지표 숫자 26 빌리기 차단) · 정상 값은 통과', () => {
    const p = prompt('ko');
    const w = (why: string) => checkTacticalOutput(ko(why), 'ko', p);
    const tail = ', 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.';
    assert.ok(w('시장이 반영한 다음 FOMC 금리 인상 가능성은 26%' + tail).includes('tactical:driver-value:fedwatch'));
    assert.ok(!w('시장이 반영한 다음 FOMC 금리 인상 가능성은 72%' + tail).some(r => r.startsWith('tactical:driver')));
    assert.ok(w('시장이 반영한 다음 FOMC 금리 동결 가능성은 72%' + tail).includes('tactical:driver-value:fedwatch:hold'));
    assert.ok(!w('반등 가능성이 낮은 가운데 시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%' + tail).some(r => r.startsWith('tactical:driver')), '«반등 가능성»은 금리 경로가 아니다');
    const en = (why: string) => checkTacticalOutput(['In the 10/30 cash session Nasdaq Composite fell 2.9% and S&P 500 fell 1.8%; futures change since that close is unconfirmed.', why,
        'Market health (RLSI 30.8) is weak, so rebounds lack support, and options positioning (GEX +8) is neutral.',
        'The next test is the S&P 500 put floor at 7500: below it dealer hedging amplifies swings, above it the cushion holds.'].join(' '), 'en', prompt('en'));
    assert.ok(en('Markets now see the odds of a hike at the next FOMC at 26%, with the Fear & Greed index at 26 (fear).').includes('tactical:driver-value:fedwatch'));
    assert.ok(!en('Markets now see the odds of a hike at the next FOMC at 72%, with the Fear & Greed index at 26 (fear).').some(r => r.startsWith('tactical:driver')));
    const ja = (why: string) => checkTacticalOutput(['本日(10/30)の通常取引でナスダック総合は2.9%、S&P500は1.8%下落し、現在の取引終了後の先物変化は未確認です。', why,
        '市場の健全度(RLSI 30.8)が弱く反発を支える力が乏しく、オプション・ポジション(GEX +8)は中立です。',
        '次の分岐点はS&P500のプット・フロア7500で、その下ではディーラーのヘッジが値動きを増幅します。'].join(''), 'ja', prompt('ja'));
    assert.ok(ja('市場が織り込む次回FOMCの利上げの可能性は26%で、恐怖・強欲指数26(恐怖ゾーン)とリスク回避が深まりました。').includes('tactical:driver-value:fedwatch'));
    assert.ok(!ja('市場が織り込む次回FOMCの利上げの可能性は72%で、恐怖・強欲指数26(恐怖ゾーン)とリスク回避が深まりました。').some(r => r.startsWith('tactical:driver')));
});

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('통과 tacticalStory1031');
