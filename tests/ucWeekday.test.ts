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
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

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
console.log(`\n${n} passed`);
