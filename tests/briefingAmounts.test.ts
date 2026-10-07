/**
 * 모닝브리핑 읽는 길의 금액 자릿수 검사 — src/lib/ai/amountGuard.ts (stripMismatchedAmountSentences · hasUnitAmounts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/briefingAmounts.test.ts
 * 출발점: 2026-10-07 운영 모닝브리핑(generatedAt 12:05:41Z, 세 언어 동일 시각) —
 *   en «Tesla securing $20 billion in credit facilities» · ja «200億ドル» · ko «$20억»(= $2 billion, 10배 낮게).
 *   SEC 8-K(2026-09-29, 0001628280-26-063820)는 «$20.0 billion senior unsecured three-year delayed draw term loan facility».
 */
import assert from 'node:assert/strict';
import { hasUnitAmounts, stripMismatchedAmountSentences } from '../src/lib/ai/amountGuard';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

// 10/7 운영 원문 (그대로)
const EN = "Wednesday pre-market trading shows S&P 500 futures at 7839.25 (-0.44%) and NASDAQ 100 futures at 31245.50 (-0.76%), with weakness concentrated in Semiconductors (-1.6%) and Technology (-0.9%). Market sentiment is pressured by two structural concerns: individual investors remain skeptical despite all-time highs, and the concentration of Nvidia, Apple, and Microsoft now representing 21% of the S&P 500 has reached unprecedented levels, raising diversification concerns for index holders. The 10-year Treasury yield declined 4bp to 5.27% and gold fell 1.06%, signaling a flight to safety amid the divergence between megacap tech strength and broader market hesitation. Recent SEC filings show Tesla securing $20 billion in credit facilities and reporting Q3 results, while NVIDIA announced the $11.9 billion Hugging Face acquisition to consolidate AI platform capabilities. Breadth stands at 63.1% in neutral regime with RLSI at 45.3 and VIX at 16, indicating selective weakness rather than panic selling. The FOMC Minutes release at 18:00 ET is the key variable for interpreting the Fed's policy stance and rate trajectory.";
const KO = "수요일 개장 전 거래에서 S&P 500 선물이 7839.25(-0.44%), NASDAQ 100 선물이 31245.50(-0.76%)으로 약세 출발함. 반도체 섹터가 -1.6%, 기술주가 -0.9% 하락하는 가운데 개별 투자자들의 매수 심리 부족과 Nvidia, Apple, Microsoft 3개 종목이 S&P 500의 21%를 차지하는 극도의 집중도 우려가 시장 심리를 압박하는 것으로 관찰됨. 한편 10년물 미국채 수익률이 5.27%(-4bp)로 하락하고 금값이 -1.06% 내려가며 안전자산 선호 현상이 나타남. Tesla가 최근 $20억 신용 한도 확보(9월 29일 8-K)와 3분기 실적 발표(10월 2일 8-K)를 진행한 가운데, NVIDIA는 Hugging Face 인수($119억, 9월 3일 8-K)로 AI 플랫폼 통합을 추진 중임. RLSI 45.3과 VIX 16 수준에서 시장은 중립 국면을 유지하고 있으며, 광폭 매도세 없이 선별적 약세가 관찰됨.";
const JA = "水曜日のプレマーケットではS&P 500先物が7839.25(-0.44%)、NASDAQ 100先物が31245.50(-0.76%)と弱気で寄り付き、半導体セクターが-1.6%、テクノロジーが-0.9%の下落を示している。市場心理は2つの構造的懸念に圧迫されており、個人投資家が過去最高値にもかかわらず買い気配を示さず、Nvidia、Apple、Microsoftの3社がS&P 500の21%を占める前例のない集中度が指数ファンド保有者の分散懸念を招いている。10年物米国債利回りが4bp低下して5.27%となり、金が-1.06%下げるなか、安全資産への逃避が観察される。最近のSEC提出では、Teslaが200億ドルのクレジット枠を確保し第3四半期決算を報告、NVIDIAはHugging Face買収(119億ドル)でAIプラットフォーム統合を進めている。ブレッドスが63.1%、RLSI 45.3、VIX 16で中立レジームを示しており、パニック売却ではなく選別的な弱さが観察される。本日18:00 ETのFOMC議事録公開が連邦準備制度の政策姿勢と金利経路解釈の重要変数となる。";

console.log('━━━ 1. 10/7 운영 모닝브리핑 실측 ━━━');
t('ko — «$20억» 문장만 빠지고 나머지 문장은 그대로 · 쓸 만한 글', () => {
  const r = stripMismatchedAmountSentences(EN, KO, 'ko');
  assert.equal(r.removed.length, 1);
  assert.ok(r.removed[0].includes('$20억'));
  assert.ok(!r.text.includes('$20억'));
  assert.ok(r.text.includes('7839.25(-0.44%)'), '앞 문장 유지');
  assert.ok(r.text.includes('RLSI 45.3'), '뒤 문장 유지');
  assert.equal(r.usable, true);
});
t('ja — «200億ドル»·«119億ドル» 는 영어판 $20 billion·$11.9 billion 과 같은 크기 → 아무것도 안 뺀다', () => {
  const r = stripMismatchedAmountSentences(EN, JA, 'ja');
  assert.equal(r.removed.length, 0);
  assert.equal(r.text, JA);
});
t('ko 를 고쳐 «$200억» 으로 쓰면 통과(문장 유지)', () => {
  const fixed = KO.replace('$20억', '$200억');
  const r = stripMismatchedAmountSentences(EN, fixed, 'ko');
  assert.equal(r.removed.length, 0);
  assert.equal(r.text, fixed);
});
t('ko «$119억»(= $11.9 billion) 단독 문장은 통과', () => {
  const r = stripMismatchedAmountSentences(EN, 'NVIDIA는 Hugging Face 인수($119억, 9월 3일 8-K)로 AI 플랫폼 통합을 추진 중임.', 'ko');
  assert.equal(r.removed.length, 0);
});

console.log('━━━ 2. 읽기 비용 0 — 금액이 없는 글은 영어판을 읽을 이유가 없다 ━━━');
t('hasUnitAmounts — 숫자+만·억·조 / 万·億·兆 만 참', () => {
  assert.equal(hasUnitAmounts('Tesla가 $20억 신용 한도'), true);
  assert.equal(hasUnitAmounts('1조 5,000억 달러'), true);
  assert.equal(hasUnitAmounts('3万人'), true);
  assert.equal(hasUnitAmounts('200億ドル'), true);
  assert.equal(hasUnitAmounts('5천억 원'), true);
  assert.equal(hasUnitAmounts('S&P 500 선물이 7839.25(-0.44%)로 약세, 이만큼 하락하고 만에 반등'), false);
  assert.equal(hasUnitAmounts('시장은 중립 국면을 유지하고 있으며 억제된 변동성'), false);
  assert.equal(hasUnitAmounts(''), false);
});

console.log('━━━ 3. 구조·경계 ━━━');
t('줄바꿈은 줄 구조로 보존 — 틀린 문장이 있는 줄만 줄어든다', () => {
  const en = 'Tesla secured a $20 billion facility.\nVIX stands at 16.';
  const ko = 'Tesla가 $20억 신용 한도를 확보했다. 그래도 계약 구조는 단순하다.\nVIX 는 16 수준이다.';
  const r = stripMismatchedAmountSentences(en, ko, 'ko');
  assert.deepEqual(r.removed, ['Tesla가 $20억 신용 한도를 확보했다.']);
  assert.equal(r.text, '그래도 계약 구조는 단순하다.\nVIX 는 16 수준이다.');
});
t('쉼표 묶음 오류(«1,5000억»)는 크기와 관계없이 뺀다', () => {
  const r = stripMismatchedAmountSentences('Buyback of $150 billion.', '자사주 매입 규모는 1,5000억 달러다. 시장은 차분하다.', 'ko');
  assert.equal(r.removed.length, 1);
  assert.equal(r.text, '시장은 차분하다.');
});
t('빼고 남은 글이 너무 짧으면 usable=false (호출자는 원문 유지)', () => {
  const r = stripMismatchedAmountSentences('Deal of $20 billion announced today by the company.', 'Tesla 가 $20억 규모 계약을 발표했다.', 'ko');
  assert.equal(r.removed.length, 1);
  assert.equal(r.usable, false);
});
t('영어판에 금액이 하나도 없는데 ko 에 단위 금액이 있으면 «지어낸 숫자» — 그 문장을 뺀다', () => {
  const r = stripMismatchedAmountSentences('Stocks fell today.', '주가 하락. 시가총액은 3조 달러다.', 'ko');
  assert.equal(r.removed.length, 1);
});
t('±12% 반올림은 통과 — «약 500억» ← $51 billion', () => {
  const r = stripMismatchedAmountSentences('A $51 billion deal.', '약 500억 달러 규모 거래다.', 'ko');
  assert.equal(r.removed.length, 0);
});
t('빈 글·금액 없는 글은 그대로', () => {
  assert.equal(stripMismatchedAmountSentences('x', '', 'ko').text, '');
  const r = stripMismatchedAmountSentences('VIX 16', '시장은 중립이다. 변동성은 낮다.', 'ko');
  assert.equal(r.removed.length, 0);
  assert.equal(r.text, '시장은 중립이다. 변동성은 낮다.');
});

console.log(`\n통과 ${n}건`);
