/**
 * UC 카드 금액 자릿수 — src/app/api/undercurrent/shared.ts(fmtNotional·moneyFallback·enforceAmounts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/ucAmounts.test.ts
 * 출발점: 9/30 운영 UC 피드 — en «3.3B notional» → ko «330억 달러»·ja «329億ドル» · «1.01B» → ja «101億ドル» · «1.51B» → ja «151億ドル»
 */
import assert from 'node:assert/strict';
import { fmtNotional, moneyFallback, enforceAmounts } from '../src/app/api/undercurrent/shared';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

t('fmtNotional: 3.254B → en $3.3B · ko 약 33억 달러 · ja 約33億ドル', () => {
  assert.equal(fmtNotional(3254000000, 'en'), '$3.3B');
  assert.equal(fmtNotional(3254000000, 'ko'), '약 33억 달러');
  assert.equal(fmtNotional(3254000000, 'ja'), '約33億ドル');
});
t('fmtNotional: 1.01B·1.51B·5천만·1.2조·없음', () => {
  assert.equal(fmtNotional(1.01e9, 'ko'), '약 10억 달러');
  assert.equal(fmtNotional(1.51e9, 'ja'), '約15億ドル');
  assert.equal(fmtNotional(5e7, 'ko'), '약 5,000만 달러');
  assert.equal(fmtNotional(1.2e12, 'ko'), '약 1.2조 달러');
  assert.equal(fmtNotional(null, 'ko'), null);
});

const NVDA = { newOiNotional: 3254000000, newOiSide: 'call', newOiContracts: 143075, oiPcr: 0.81, volumePcr: 2.48, price: 227.21, maxPain: 225 } as any;
const ORCL = { newOiNotional: 1010000000, newOiSide: 'call', newOiContracts: 64886, oiPcr: 0.42, volumePcr: 2.18, price: 135, maxPain: 140 } as any;
const GOOGL = { newOiNotional: 1510000000, newOiSide: 'call', newOiContracts: 36281, oiPcr: 0.38, volumePcr: 2.8, price: 340.92, maxPain: 342.5 } as any;

t('운영 실측 ko: NVDA «330억 달러»(10배) → 사실 문장으로 교체 · ORCL «10억 달러»(맞음) 유지', () => {
  const cards: any[] = [
    { ticker: 'NVDA', money: NVDA, moneyRead: '어제 330억 달러 규모의 상승 포지션이 신규로 열렸고, 콜옵션이 풋옵션의 2.5배 이상으로 압도적이다.' },
    { ticker: 'ORCL', money: ORCL, moneyRead: '어제 상승 쪽에 10억 달러 규모의 새 포지션이 대량으로 걸렸지만, 시장의 낙관이 제한적이다.' },
  ];
  assert.equal(enforceAmounts('ko', cards), 1);
  // 이 카드엔 optionsDate 가 없다 → 사실 문장은 «어제»가 아니라 «최근 세션»(2026-10-03 상대 날짜 수리)
  assert.equal(cards[0].moneyRead, '최근 세션 상승 쪽에 약 33억 달러 규모의 새 포지션이 열렸다.');
  assert.match(cards[1].moneyRead, /10억 달러/);
});
t('운영 실측 ja: ORCL «101億ドル»·NVDA «329億ドル»·GOOGL «151億ドル» → 모두 교체', () => {
  const cards: any[] = [
    { ticker: 'ORCL', money: ORCL, moneyRead: '昨日は上昇方向に64,886件の新規ポジション（101億ドル相当）が開かれ、市場心理は強気です。' },
    { ticker: 'NVDA', money: NVDA, moneyRead: '昨日は上昇方向に143,075件の新規ポジション（329億ドル相当）が開かれました。' },
    { ticker: 'GOOGL', money: GOOGL, moneyRead: '昨日は上昇方向に36,281件の新規ポジション（151億ドル相当）が開かれました。' },
  ];
  assert.equal(enforceAmounts('ja', cards), 3);
  // optionsDate 없음 → «昨日» 대신 «直近のセッション»(2026-10-03)
  assert.equal(cards[0].moneyRead, '直近のセッションは上昇方向に約10億ドル相当の新規ポジションが開かれました。');
  assert.equal(cards[1].moneyRead, '直近のセッションは上昇方向に約33億ドル相当の新規ポジションが開かれました。');
});
t('맞는 ja «約33億ドル»·금액 없는 문장은 그대로 · en 은 건드리지 않는다', () => {
  const ok: any[] = [{ money: NVDA, moneyRead: '昨日は上昇方向に約33億ドル相当の新規ポジション。' }, { money: NVDA, moneyRead: 'コールが優勢です。' }];
  assert.equal(enforceAmounts('ja', ok), 0);
  const en: any[] = [{ money: NVDA, moneyRead: 'Massive new call positions (3.3B notional).' }];
  assert.equal(enforceAmounts('en', en), 0);
});
t('생성 때: 제목의 금액은 원문(헤드라인)과 대조 — «1500억 달러» ← $150 Billion 유지, 틀리면 원문 제목으로', () => {
  const cards: any[] = [
    { money: NVDA, plainTitle: '엔비디아의 1500억 달러 자사주 매입, 역사가 말해주는 긍정 신호', moneyRead: null },
    { money: NVDA, plainTitle: '엔비디아의 1조 5천억 달러 자사주 매입', moneyRead: null },
  ];
  const src = { title: "History Says Nvidia's Record $150 Billion Buyback Is Good News for the Stock" };
  assert.equal(enforceAmounts('ko', cards, { sourceOf: () => src }), 1);
  assert.match(cards[0].plainTitle, /1500억 달러/);
  assert.equal(cards[1].plainTitle, src.title);
});
t('tickerRead(extra): 틀리면 사실 문장, 금액이 없으면 null', () => {
  const box: any = { tickerRead: '어제 330억 달러 규모의 콜 포지션이 새로 생겼다.' };
  enforceAmounts('ko', [], { extra: { box, field: 'tickerRead', money: NVDA } });
  // 날짜(optionsDate)가 없으면 «어제»가 아니라 «최근 세션»(프롬프트의 «in the latest session»과 같은 말 — 2026-10-03)
  assert.equal(box.tickerRead, '최근 세션 상승 쪽에 약 33억 달러 규모의 새 포지션이 열렸다.');
  assert.equal(moneyFallback('ko', { newOiNotional: null } as any), null);
});
t('사실 문장은 그 옵션 세션의 요일로(63 통합) — 날짜가 있으면 «어제» 대신 요일', () => {
  assert.equal(moneyFallback('ko', { ...NVDA, optionsDate: '2026-09-28' }), '월요일 상승 쪽에 약 33억 달러 규모의 새 포지션이 열렸다.');
  assert.equal(moneyFallback('ja', { ...NVDA, optionsDate: '2026-09-25' }), '金曜日は上昇方向に約33億ドル相当の新規ポジションが開かれました。');
});
console.log(`\n✅ ucAmounts: ${n}건 통과`);
