/**
 * 번역 금액 자릿수 검사 — src/lib/ai/amountGuard.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/amountGuard.test.ts
 * 출발점: 9/30 운영 종목 뉴스 NVDA — $150 Billion → ja «1,5000億ドル»(10배), ko «1,500억 달러»(맞음)
 */
import assert from 'node:assert/strict';
import { checkAmounts, amountsOk, sourceAmounts, translatedAmounts, hasMalformedGrouping } from '../src/lib/ai/amountGuard';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const NVDA = "History Says Nvidia's Record $150 Billion Buyback Is Good News for the Stock";

console.log('━━━ 1. 9/30 운영 실측 ━━━');
t('ja «1,5000億ドル» — 형식 오류(쉼표 묶음 4자리)·10배 → 실패', () => {
  const r = checkAmounts(NVDA, '歴史によると、Nvidiaの過去最高1,5000億ドルの買い戻しは株価に良い影響を与えます。', 'ja');
  assert.equal(r.ok, false);
});
t('ja 쉼표 없이 «15000億ドル»(10배)도 실패 — 형식만이 아니라 크기로 잡는다', () => {
  assert.equal(checkAmounts(NVDA, '過去最高15000億ドルの自社株買い', 'ja').reason?.startsWith('mismatch'), true);
});
t('ko «1,500억 달러» → 통과 · ja «1500億ドル»·«1,500億ドル» → 통과', () => {
  assert.equal(amountsOk(NVDA, '역사적 자료에 따르면, 엔비디아의 사상 최대 1,500억 달러 매입은 주가에 긍정적인 영향을 미칩니다.', 'ko'), true);
  assert.equal(amountsOk(NVDA, '過去最高1500億ドルの自社株買い', 'ja'), true);
  assert.equal(amountsOk(NVDA, '過去最高1,500億ドルの自社株買い', 'ja'), true);
});
t('ko «15억 달러»(100분의 1) → 실패', () => {
  assert.equal(amountsOk(NVDA, '엔비디아 사상 최대 15억 달러 자사주 매입', 'ko'), false);
});

console.log('━━━ 2. 단위·묶음 ━━━');
t('조·억 묶음: «1조 5,000억 달러» = $1.5 trillion · «1兆5000億ドル»', () => {
  assert.deepEqual(translatedAmounts('1조 5,000억 달러', 'ko'), [1.5e12]);
  assert.deepEqual(translatedAmounts('1兆5000億ドル', 'ja'), [1.5e12]);
  assert.equal(amountsOk('Apple nears $1.5 trillion in buybacks', '애플 자사주 매입 1조 5,000억 달러 근접', 'ko'), true);
});
t('천·千: «5천억» = 5e11 · «1천500억» = 1.5e11 · «5千億» = 5e11', () => {
  assert.deepEqual(translatedAmounts('5천억 원', 'ko'), [5e11]);
  assert.deepEqual(translatedAmounts('1천500억 달러', 'ko'), [1.5e11]);
  assert.deepEqual(translatedAmounts('5千億円', 'ja'), [5e11]);
});
t('B·bn·M 약어와 범위: «$20B» «$1.2bn» «10-12 billion»', () => {
  assert.ok(sourceAmounts('DOJ probes $20B Groq deal').includes(2e10));
  assert.ok(sourceAmounts('raises $1.2bn').includes(1.2e9));
  const r = sourceAmounts('capex of $10-12 billion');
  assert.ok(r.includes(1e10) && r.includes(1.2e10));
  assert.equal(amountsOk('capex of $10-12 billion', '설비투자 100억~120억 달러', 'ko'), true);
});
t('만·万: «3만 명» ← «30,000 jobs» · «5,000만 달러» ← «$50 million»', () => {
  assert.equal(amountsOk('Intel to cut 30,000 jobs', '인텔, 3만 명 감원', 'ko'), true);
  assert.equal(amountsOk('Startup raises $50 million', '스타트업, 5,000만 달러 조달', 'ko'), true);
  assert.equal(amountsOk('Startup raises $50 million', 'スタートアップが5000万ドルを調達', 'ja'), true);
});
t('반올림은 통과: $148 billion → «약 1,500억 달러»(1.4%)', () => {
  assert.equal(amountsOk('Buyback of $148 billion', '약 1,500억 달러 규모 자사주 매입', 'ko'), true);
});

console.log('━━━ 3. 지어낸 금액·오탐 방지 ━━━');
t('원문에 수가 없는데 번역에 금액 → 실패(지어냄)', () => {
  assert.equal(checkAmounts('Nvidia shares rise after upgrade', '엔비디아, 목표가 상향 뒤 시가총액 4조 달러 돌파', 'ko').reason?.startsWith('invented'), true);
});
t('단위 없는 수·기간어(«3일 만에»·«2분기»·«1년 만에»)는 금액이 아니다', () => {
  assert.deepEqual(translatedAmounts('3일 만에 반등 · 2분기 실적 · 1년 만에 최고', 'ko'), []);
  assert.equal(amountsOk('Stock rebounds', '3일 만에 반등', 'ko'), true);
});
t('기억·추억·億万長者 같은 낱말은 금액이 아니다', () => {
  assert.deepEqual(translatedAmounts('투자자들의 기억 속 추억', 'ko'), []);
  assert.deepEqual(translatedAmounts('億万長者の投資家', 'ja'), []);
});
t('참고 글(같은 항목의 영어 요약)의 수도 허용', () => {
  assert.equal(amountsOk('Nvidia buyback news', '1,500억 달러 매입', 'ko', ['Nvidia announced a $150 billion buyback.']), true);
});
t('쉼표 형식 검사: 1,500 ok · 1,5000 · 15,00 실패', () => {
  assert.equal(hasMalformedGrouping('1,500억'), false);
  assert.equal(hasMalformedGrouping('1,5000億'), true);
  assert.equal(hasMalformedGrouping('15,00'), true);
  assert.equal(hasMalformedGrouping('1,234,567'), false);
});

console.log(`\n✅ amountGuard: ${n}건 통과`);
