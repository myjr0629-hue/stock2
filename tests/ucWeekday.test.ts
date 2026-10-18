/**
 * UC 카드 AI 문구 «요일 = 데이터 세션(ET) 요일» — src/lib/ai/ucNumbers.ts(ucWeekdayProblems) · shared.enforceLean(생성·캐시 출구 공통) · storyPayload
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/ucWeekday.test.ts
 * 출발점(2026-10-18 감사 P1-5, 운영 /api/undercurrent/feed): GOOGL·AAPL·AMZN·AMD·AVGO·NVDA 6장의 moneyRead =
 *   «금요일 세션에 새로 열린 포지션은 약 53억 달러(NVDA)…» — 같은 카드 money.optionsDate = 2026-10-15(목요일).
 *   같은 optionsDate 인 BAC·ORCL 카드(결정형 문구)는 «목요일»로 맞게 나온다.
 */
import assert from 'node:assert/strict';
import { ucWeekdayProblems } from '@/lib/ai/ucNumbers';
import { enforceLean, storyPayload, buildSystem, moneyFallback } from '@/app/api/undercurrent/shared';

let n = 0;
let failed = 0;
const t = (name: string, fn: () => void) => {
    try { fn(); n++; console.log('ok -', name); }
    catch (e) { failed++; process.exitCode = 1; console.error('FAIL -', name, e); }
};

// 운영 NVDA 카드 money — optionsDate 2026-10-15 = 목요일
const NVDA: any = { newOiNotional: 5.3e9, newOiContracts: 123456, newOiSide: 'call', optionsDate: '2026-10-15', oiPcr: 0.81, volumePcr: 1.42, price: 183.2, maxPain: 180, callWall: 190, putFloor: 170 };
const KO_BAD = '금요일 세션에 새로 열린 포지션은 약 53억 달러(NVDA)로 상승 쪽에 쏠렸다.';
const EN_BAD = 'On Friday, about $5.3B in new call positions opened (NVDA), leaning to the upside.';
const JA_BAD = '金曜日のセッションで約53億ドルの新規ポジションが開かれ、上昇方向に傾いています。';

t('ucWeekdayProblems — 운영 NVDA: 금요일/Friday/金曜日 은 목요일(10/15) 데이터와 어긋난다', () => {
    assert.equal(ucWeekdayProblems('ko', KO_BAD, '2026-10-15').length, 1);
    assert.equal(ucWeekdayProblems('en', EN_BAD, '2026-10-15').length, 1);
    assert.equal(ucWeekdayProblems('ja', JA_BAD, '2026-10-15').length, 1);
});
t('ucWeekdayProblems — 맞는 요일(목요일/Thursday/木曜日)·요일 없는 문장·날짜 없음은 통과', () => {
    assert.deepEqual(ucWeekdayProblems('ko', '목요일 세션에 새로 열린 포지션은 약 53억 달러다.', '2026-10-15'), []);
    assert.deepEqual(ucWeekdayProblems('en', 'On Thursday, about $5.3B in new call positions opened.', '2026-10-15'), []);
    assert.deepEqual(ucWeekdayProblems('ja', '木曜日のセッションで約53億ドル。', '2026-10-15'), []);
    assert.deepEqual(ucWeekdayProblems('ko', '최근 세션에 새로 열린 포지션은 약 53억 달러다.', '2026-10-15'), []);
    assert.deepEqual(ucWeekdayProblems('ko', KO_BAD, null), []);          // 날짜를 모르면 판정하지 않는다
    assert.deepEqual(ucWeekdayProblems('ko', KO_BAD, 'garbage'), []);
});
t('ucWeekdayProblems — 옵션 «만기» 요일은 세션 요일이 아니어도 된다', () => {
    assert.deepEqual(ucWeekdayProblems('ko', '목요일 약 53억 달러가 열렸고, 금요일 만기 기준 최대 고통 가격은 180달러다.', '2026-10-15'), []);
    assert.deepEqual(ucWeekdayProblems('en', 'On Thursday $5.3B opened; max pain for Friday expiry is $180.', '2026-10-15'), []);
});
t('enforceLean — 금요일 moneyRead 는 결정형 사실 문장(목요일)으로 바뀐다 (ko·en·ja)', () => {
    const cards: any[] = [{ ticker: 'NVDA', money: NVDA, moneyRead: KO_BAD }];
    assert.equal(enforceLean('ko', cards), 1);
    assert.ok(cards[0].moneyRead.includes('목요일') && !cards[0].moneyRead.includes('금요일'), cards[0].moneyRead);
    const en: any[] = [{ ticker: 'NVDA', money: NVDA, moneyRead: EN_BAD }];
    assert.equal(enforceLean('en', en), 1);
    assert.ok(!/Friday/.test(en[0].moneyRead), en[0].moneyRead);
    const ja: any[] = [{ ticker: 'NVDA', money: NVDA, moneyRead: JA_BAD }];
    assert.equal(enforceLean('ja', ja), 1);
    assert.ok(ja[0].moneyRead.includes('木曜日') && !ja[0].moneyRead.includes('金曜'), ja[0].moneyRead);
});
t('enforceLean — 맞는 목요일 카드는 그대로, whyItMatters 의 요일(뉴스 일정)은 건드리지 않는다', () => {
    const ok = '목요일 세션에 새로 열린 포지션은 약 53억 달러로 상승 쪽에 쏠렸다.';
    const cards: any[] = [{ ticker: 'BAC', money: NVDA, moneyRead: ok, whyItMatters: '금요일에 실적 발표가 예정돼 있다.' }];
    assert.equal(enforceLean('ko', cards), 0);
    assert.equal(cards[0].moneyRead, ok);
    assert.equal(cards[0].whyItMatters, '금요일에 실적 발표가 예정돼 있다.');
});
t('enforceLean — 종목 화면 tickerRead(extra)도 같은 검사', () => {
    const box: any = { tickerRead: KO_BAD };
    assert.equal(enforceLean('ko', [], { extra: { box, field: 'tickerRead', money: NVDA } }), 1);
    assert.ok(box.tickerRead.includes('목요일') && !box.tickerRead.includes('금요일'), box.tickerRead);
});
t('storyPayload — 모델이 그대로 베낄 «세션 요일»을 그 언어로 준다(목요일 / Thursday / 木曜日)', () => {
    const story = [{ ticker: 'NVDA', title: 'x', money: NVDA }];
    assert.equal(JSON.parse(storyPayload(story as any, 'ko'))[0].money.sessionDayText, '목요일');
    assert.equal(JSON.parse(storyPayload(story as any, 'en'))[0].money.sessionDayText, 'Thursday');
    assert.equal(JSON.parse(storyPayload(story as any, 'ja'))[0].money.sessionDayText, '木曜日');
    assert.equal(JSON.parse(storyPayload([{ ticker: 'X', title: 'x', money: { ...NVDA, optionsDate: null } }] as any, 'ko'))[0].money.sessionDayText, null);
});
t('buildSystem — 요일은 sessionDayText 를 그대로 쓰고 오늘 날짜로 추론하지 않는다고 지시한다', () => {
    const s = buildSystem('ko');
    assert.ok(/sessionDayText/.test(s));
    assert.ok(/never infer|NEVER infer/i.test(s));
});
t('moneyFallback — 결정형 문구는 optionsDate 요일(목요일)', () => {
    assert.ok((moneyFallback('ko', NVDA) || '').startsWith('목요일'));
});
t('관문 2 — 금요일 실적을 앞둔 정상 목요일 문장은 비율이 없어도 그대로 유지한다', () => {
    const text = 'On Thursday, $5.3B in new call positions opened ahead of Friday earnings.';
    const money = { ...NVDA, oiPcr: null, volumePcr: null };
    const cards = [{ money, moneyRead: text }];
    const box = { tickerRead: text };
    assert.equal(enforceLean('en', cards, { extra: { box, field: 'tickerRead', money } }), 0);
    assert.equal(cards[0].moneyRead, text);
    assert.equal(box.tickerRead, text);
});
t('관문 6 — 만기 단어가 가까워도 명시적인 세션 요일 오류는 고친다', () => {
    const text = '금요일 세션에 만기를 앞두고 새 포지션이 열렸다.';
    assert.equal(ucWeekdayProblems('ko', text, NVDA.optionsDate).length, 1);
    const cards = [{ money: NVDA, moneyRead: text }];
    assert.equal(enforceLean('ko', cards), 1);
    assert.ok(cards[0].moneyRead?.includes('목요일'));
});
t('실적·만기 일정은 그 요일에 직접 붙을 때만 예외(ko·en·ja)', () => {
    const cases = [
        ['ko', '목요일 신규 포지션이 열렸고 금요일 실적 발표를 앞두고 있다.'],
        ['ko', '금요일 만기를 앞두고 목요일 신규 포지션이 열렸다.'],
        ['en', 'On Thursday, new call positions opened ahead of Friday expiry.'],
        ['en', 'New positions opened on Thursday, ahead of earnings on Friday.'],
        ['en', "On Thursday, new positions opened ahead of Friday's earnings."],
        ['ja', '木曜日のセッションで新規ポジションが開かれ、金曜日の決算を控えています。'],
        ['ja', '金曜日の満期を前に木曜日に新規ポジションが開かれました。'],
    ] as const;
    for (const [loc, s] of cases) assert.deepEqual(ucWeekdayProblems(loc, s, NVDA.optionsDate), [], s);
});
t('만기·실적이 같은 절에 있어도 세션 요일의 오류는 면제하지 않는다(ko·en·ja)', () => {
    for (const [loc, s] of [
        ['ko', '실적 발표를 앞둔 금요일 세션에 새 포지션이 열렸다.'],
        ['en', 'During the Friday session before expiry, new positions opened.'],
        ['en', 'During the friday session before earnings, new positions opened.'],
        ['ja', '金曜日のセッションで満期を前に新規ポジションが開かれました。'],
    ] as const) assert.equal(ucWeekdayProblems(loc, s, NVDA.optionsDate).length, 1, s);
});
t('요일의 용도가 불확실하거나 날짜가 잘못되면 정상 문구를 제거하지 않는다', () => {
    assert.deepEqual(ucWeekdayProblems('en', 'Investors await Friday.', NVDA.optionsDate), []);
    assert.deepEqual(ucWeekdayProblems('ko', KO_BAD, '2026-02-30'), []);
    assert.deepEqual(ucWeekdayProblems('ko', KO_BAD, '2026-13-01'), []);
});
t('생성·캐시 재검사와 tickerRead(extra)에서 일정 문장 보존·잘못된 세션 교정은 멱등이다', () => {
    for (const [loc, good, bad] of [
        ['ko', '목요일 신규 포지션이 열렸고 금요일 실적을 앞두고 있다.', KO_BAD],
        ['en', 'On Thursday, new positions opened ahead of Friday earnings.', EN_BAD],
        ['ja', '木曜日に新規ポジションが開かれ、金曜日の決算を控えています。', JA_BAD],
    ] as const) {
        const cards = [{ money: NVDA, moneyRead: good }, { money: NVDA, moneyRead: bad }];
        const box = { tickerRead: bad };
        const opts = { extra: { box, field: 'tickerRead', money: NVDA } };
        assert.equal(enforceLean(loc, cards, opts), 2, loc);
        assert.equal(cards[0].moneyRead, good, loc);
        assert.equal(enforceLean(loc, cards, opts), 0, loc);
    }
});
for (const [loc, text] of [
    ['en', "On Thursday, new call positions opened ahead of Friday's upcoming earnings."],
    ['ko', '목요일 신규 포지션이 열렸고 금요일에 실적 발표를 앞두고 있다.'],
    ['ja', '木曜日に新規ポジションが開かれ、金曜日に決算発表を控えています。'],
] as const) t(`3차 관문 2 — ${loc} 실적 일정은 비율 없는 생성·캐시·종목 문장에서도 보존한다`, () => {
    const money = { ...NVDA, oiPcr: null, volumePcr: null };
    const cards = [{ money, moneyRead: text }];
    const box = { tickerRead: text };
    const opts = { extra: { box, field: 'tickerRead', money } };
    assert.deepEqual(ucWeekdayProblems(loc, text, money.optionsDate), []);
    assert.equal(enforceLean(loc, cards, opts), 0);
    assert.equal(enforceLean(loc, cards, opts), 0);
    assert.equal(cards[0].moneyRead, text);
    assert.equal(box.tickerRead, text);
});
t('일정 예외 확장 후에도 조사·수식어가 세션 오류를 면제하지 않는다', () => {
    for (const [loc, text] of [
        ['ko', '금요일 세션에 실적 발표를 앞두고 새 포지션이 열렸다.'],
        ['en', "During Friday's session ahead of upcoming earnings, new call positions opened."],
        ['ja', '金曜日のセッションに決算発表を前に新規ポジションが開かれました。'],
    ] as const) assert.equal(ucWeekdayProblems(loc, text, NVDA.optionsDate).length, 1, text);
});
for (const text of [
    'On Thursday, new call positions opened ahead of Friday morning earnings.',
    'On Thursday, new call positions opened ahead of the earnings call on Friday.',
]) t(`4차 관문 4 — 실적 시간·earnings call 문장 보존: ${text}`, () => {
    const money = { ...NVDA, oiPcr: null, volumePcr: null };
    const cards = [{ money, moneyRead: text }];
    const box = { tickerRead: text };
    const opts = { extra: { box, field: 'tickerRead', money } };
    assert.deepEqual(ucWeekdayProblems('en', text, money.optionsDate), []);
    assert.equal(enforceLean('en', cards, opts), 0);
    assert.equal(enforceLean('en', cards, opts), 0);
    assert.equal(cards[0].moneyRead, text);
    assert.equal(box.tickerRead, text);
});
t('실적 시간·call 예외에서도 명시적 금요일 세션 오류는 유지', () => {
    for (const text of [
        'During the Friday session, new positions opened ahead of morning earnings.',
        'New positions opened during the session on Friday ahead of the earnings call.',
    ]) assert.equal(ucWeekdayProblems('en', text, NVDA.optionsDate).length, 1, text);
});
console.log(`\n${n} passed, ${failed} failed`);
