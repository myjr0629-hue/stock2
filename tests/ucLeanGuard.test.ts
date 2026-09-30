/**
 * UC 방향(풋·콜) 모순·깨진 글자 검사 — src/app/api/undercurrent/shared.ts(leanOf·contradictsLean·factSentence·enforceLean)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/ucLeanGuard.test.ts
 * 출발점(9/30 운영·미리보기 실측): NVDA oiPcr(풋÷콜) 0.81·거래량 콜÷풋 2.48 인데
 *   «풋 옵션이 콜 옵션보다 약간 많지만(0.81 비율)» · «방어적 포지셔닝(풋옵션 비중 높음)» · «콜�션 비중이 높고»
 */
import assert from 'node:assert/strict';
import { leanOf, contradictsLean, factSentence, enforceLean } from '../src/app/api/undercurrent/shared';
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const NVDA = { oiPcr: 0.81, volumePcr: 2.48, newOiNotional: 3254000000, newOiSide: 'call' } as any;
const GOOGL = { oiPcr: 0.38, volumePcr: 2.8 } as any;
const ORCL = { oiPcr: 0.42, volumePcr: 2.18 } as any;
const PUTS = { oiPcr: 1.6, volumePcr: 0.5 } as any;   // 풋÷콜 1.6 · 거래량 풋÷콜 2.0

t('leanOf 경계: 1.21 풋 · 1.0 비슷 · 0.79 콜 · 없음 null', () => {
  assert.equal(leanOf(1.21), 'put-heavy'); assert.equal(leanOf(1), 'balanced'); assert.equal(leanOf(0.79), 'call-heavy'); assert.equal(leanOf(null), null);
});
t('운영 실측 문장: 풋÷콜 0.81·0.40 인데 «풋이 더 많다»·«방어적(풋 비중 높음)» → 모순', () => {
  assert.equal(contradictsLean('ko', 'NVDA의 옵션 포지셔닝은 혼합 신호를 보이고 있습니다: 풋 옵션이 콜 옵션보다 약간 많지만(0.81 비율), 기관 거래는…', NVDA), true);
  assert.equal(contradictsLean('ko', '옵션 시장은 방어적 포지셔닝(풋옵션 비중 높음)을 유지하고 있으며', NVDA), true);
});
t('맞는 방향은 그대로: GOOGL «콜옵션이 풋옵션의 2.8배 이상으로 강하게 우세» · ORCL «풋옵션 비중이 매우 낮고» · 영어 «call-heavy flow»', () => {
  assert.equal(contradictsLean('ko', '어제 15억 달러 규모의 상승 포지션이 신규로 열렸고, 콜옵션이 풋옵션의 2.8배 이상으로 강하게 우세하며', GOOGL), false);
  assert.equal(contradictsLean('ko', '풋옵션 비중이 매우 낮고(0.42) 현재가가 최대손익분기점보다 아래에 있어', ORCL), false);
  assert.equal(contradictsLean('en', 'Massive new call positions opened with call-heavy flow (2.48 ratio)', NVDA), false);
});
t('반대쪽도 잡는다: 풋÷콜 1.6·2.0 인데 «콜 우세»(ko·ja·en)', () => {
  assert.equal(contradictsLean('ko', '콜옵션 비중이 높아 상승 쪽으로 기울었다', PUTS), true);
  assert.equal(contradictsLean('ja', 'コールが優勢で強気の構えです', PUTS), true);
  assert.equal(contradictsLean('en', 'Flow is call-heavy.', PUTS), true);
});
t('factSentence: ko·ja·en — 금액 + 두 방향', () => {
  assert.equal(factSentence('ko', NVDA), '어제 상승 쪽에 약 33억 달러 규모의 새 포지션이 열렸다. 옵션 포지션은 콜·풋이 비슷하다(풋÷콜 0.81), 전 거래일 거래량은 콜 쪽이 많다(풋÷콜 0.40).');
  assert.equal(factSentence('ja', GOOGL), 'オプション建玉はコールが多い（プット÷コール0.38）、前営業日の出来高はコールが多い（プット÷コール0.36）。');
  assert.equal(factSentence('en', ORCL), 'Open positions: more calls than puts (put/call 0.42); prior-session volume: more calls than puts (put/call 0.46).');
  assert.equal(factSentence('ko', {} as any), null);
});
t('enforceLean: 모순 moneyRead·tickerRead → 사실 문장 · 깨진 글자(U+FFFD) → 사실 문장 · 맞는 문장 유지', () => {
  const cards: any[] = [
    { money: NVDA, moneyRead: '실적 강세 뉴스와 달리, 옵션 시장은 방어적 포지셔닝(풋옵션 비중 높음)을 유지하고 있으며' },
    { money: GOOGL, moneyRead: '콜옵션이 풋옵션의 2.8배 이상으로 강하게 우세하다.' },
  ];
  const box: any = { tickerRead: '동시에 콜�션 비중이 높고(0.4 풋/콜 비율) 짧은 공매도 압박(44점)을 보이고 있다.' };
  assert.equal(enforceLean('ko', cards, { extra: { box, field: 'tickerRead', money: NVDA } }), 2);
  assert.match(cards[0].moneyRead, /^어제 상승 쪽에 약 33억 달러/);
  assert.match(cards[1].moneyRead, /2\.8배/);
  assert.match(box.tickerRead, /콜·풋이 비슷하다\(풋÷콜 0\.81\)/);
});
t('부정문은 주장 아님: «no new defensive hedging»(AAPL 운영 실측 오탐) · «방어적 포지션은 보이지 않는다»', () => {
  const AAPL = { oiPcr: 0.86, volumePcr: 1.77 } as any;
  assert.equal(contradictsLean('en', "options traders remain call-biased (56% call volume) with no new defensive hedging", AAPL), false);
  assert.equal(contradictsLean('ko', '방어적 포지션은 보이지 않는다', AAPL), false);
});
console.log(`\n✅ ucLeanGuard: ${n}건 통과`);
