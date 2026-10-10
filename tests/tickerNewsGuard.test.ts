/**
 * 종목 뉴스 번역 검사 (src/lib/ai/tickerNewsGuard.ts — 라우트에서 옮긴 checked + 사다리 출구 가드)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/tickerNewsGuard.test.ts
 *
 * 고정하는 것: 운영이 막아 온 오류(권유·예측·유령 회사명·음차·요일 지어내기·금액 자릿수·빈 칸)는 옮긴 뒤에도 그대로 막힌다 ·
 *   묶음 단위 판정(60% 미만이면 현행으로) · 품질 비교용 제목별 판정·캡처 프롬프트에서 제목 복원.
 */
import assert from 'node:assert/strict';
import { checked, judgeNewsBatch, newsItemVerdicts, tickerNewsGate, titlesFromNewsPrompt, NEWS_LADDER_MIN_PASS } from '@/lib/ai/tickerNewsGuard';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const JA = 'マイクロンの四半期売上が過去最高となった';
const items = (arr: Array<[string, string]>) => JSON.stringify({ items: arr.map(([ko, ja], i) => ({ id: i + 1, ko, ja, impact: 'BULLISH' })) });

t('정상 번역은 통과 · impact 는 허용값만', () => {
    const c = checked({ ko: '마이크론이 AI 메모리 수요에 힘입어 분기 매출 사상 최고치를 기록했다', ja: JA, impact: 'BULLISH' }, 'Micron posts record quarterly revenue on AI memory demand');
    assert.ok(c.ko && c.ja); assert.equal(c.impact, 'BULLISH');
    assert.equal(checked({ ko: c.ko, ja: JA, impact: 'WEIRD' }, 'Micron posts record revenue').impact, 'NEUTRAL');
});
t('막는 것: 권유 · 예측 · 유령 회사명 · 음차 · 지어낸 요일 · 짧은 칸 · 언어 혼입 (옮기기 전과 같다)', () => {
    const title = 'Nvidia stock down over 2% on Thursday';
    const ok = '엔비디아 주가가 목요일 2% 넘게 하락했다는 소식을 전한 기사다';
    assert.ok(checked({ ko: ok, ja: JA }, title).ko);
    assert.equal(checked({ ko: '지금 사야 한다는 의견이 나온 엔비디아 관련 기사다', ja: JA }, title).ko, '');            // 권유
    assert.equal(checked({ ko: '엔비디아 주가가 상승할 것으로 예상된다는 보도가 나왔다', ja: JA }, title).ko, '');          // 예측
    assert.equal(checked({ ko: '앤스로픽과 관련된 엔비디아 주가 하락 소식을 전한 기사다', ja: JA }, title).ko, '');       // 유령
    assert.equal(checked({ ko: '도잉이 엔비디아 거래를 조사한다는 소식을 전한 기사입니다', ja: JA }, 'DOJ probes Nvidia deal').ko, '');   // 음차
    assert.equal(checked({ ko: '엔비디아 주가가 목요일 화요일 종가 대비 2% 하락했다는 기사다', ja: JA }, title).ko, '');   // 요일
    assert.equal(checked({ ko: '짧음', ja: JA }, title).ko, '');
    assert.equal(checked({ ko: ok, ja: 'これは한국어が混ざった日本語の文章ですよ' }, title).ja, '');
    assert.equal(checked({ ko: ok, ja: '' }, title).ja, '');
});
t('금액 자릿수: «$150 Billion» 을 1,5000억 으로 쓰면 막는다', () => {
    const c = checked({ ko: '엔비디아가 15조 달러 규모의 투자를 발표했다고 전한 기사다', ja: JA }, 'Nvidia announces $150 Billion investment');
    assert.equal(c.ko, '');
});
t('묶음 판정: 60% 미만 통과면 현행으로(false), 이상이면 ① 응답 사용 · JSON 아님은 사유 json', () => {
    const titles = ['Micron posts record quarterly revenue', 'Micron unveils new HBM chip', 'Micron CEO speaks on demand', 'Micron raises dividend', 'Micron expands Idaho fab'];
    const ko = (s: string) => `마이크론 관련 보도로 ${s} 내용을 전한 기사다 요약`;
    const good = items(titles.map((tt) => [ko(tt.slice(7, 12)), JA] as [string, string]));
    assert.equal(judgeNewsBatch(good, titles).ok, true);
    // 5건 중 3건 통과 = 60% → 통과, 2건 통과 → 미달
    const three = items([[ko('a1'), JA], [ko('a2'), JA], [ko('a3'), JA], ['x', 'y'], ['x', 'y']]);
    const two = items([[ko('a1'), JA], [ko('a2'), JA], ['x', 'y'], ['x', 'y'], ['x', 'y']]);
    assert.equal(NEWS_LADDER_MIN_PASS, 0.6);
    assert.equal(judgeNewsBatch(three, titles).ok, true);
    const v2 = judgeNewsBatch(two, titles); assert.equal(v2.ok, false); assert.equal(v2.reason, 'items:2/5');
    assert.equal(judgeNewsBatch('not json', titles).reason, 'json');
    assert.equal(tickerNewsGate(titles)(good), true); assert.equal(tickerNewsGate(titles)(two), 'items:2/5');
    // 한 건 묶음은 그 한 건이 통과해야 한다
    assert.equal(judgeNewsBatch(items([['x', 'y']]), ['Micron posts record']).ok, false);
});
t('제목별 판정(품질 비교용) · 빠진 id 는 absent', () => {
    const titles = ['Micron posts record quarterly revenue', 'Micron unveils new HBM chip'];
    const txt = JSON.stringify({ items: [{ id: 2, ko: '마이크론이 새로운 HBM 칩을 공개했다는 소식을 전한 기사다', ja: JA, impact: 'NEUTRAL' }] });
    const v = newsItemVerdicts(txt, titles);
    assert.deepEqual(v, [{ id: 1, ko: false, ja: false, present: false }, { id: 2, ko: true, ja: true, present: true }]);
});
t('캡처된 프롬프트에서 제목을 되찾는다', () => {
    const up = ['Ticker: MU', 'Headlines (2):', JSON.stringify([{ id: 1, title: 'A [bracket] title', source: 'x' }, { id: 2, title: 'B', source: 'y' }], null, 1), 'JSON only.'].join('\n');
    assert.deepEqual(titlesFromNewsPrompt(up), ['A [bracket] title', 'B']);
    assert.deepEqual(titlesFromNewsPrompt('no list'), []);
});

console.log(`\n${n} passed`);
