/**
 * 고래 신규 포지션 «날짜» 시험 — 포지션이 열린 세션 = 묶음 prevDate (2026-10-03 운영 주체 결정)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/whaleOpeningDate.test.ts
 *
 * 근거(실측): 공급사 레코드 D 의 OI 는 D 아침 OCC 공표 = D−1 마감 포지션.
 *   NVDA 261016C00405000 — 10/01 레코드 OI 12·거래 873 → 10/02 레코드 OI 870(10/02 거래 0). «+858 · 10/2»는 실제로 10/1 에 열렸다.
 * 같은 묶음·같은 뜻을 쓰는 문(이 파일): UC 큰손 레이더(shared.fetchOptionsOpening → feedCore optionsDate → 부제·카드 문장·AI session) ·
 *   기관 신규 포지션(services/institutionalFlow — 옵션 흐름 SEO 페이지·대시보드 카드 입력). 내 종목 칩은 tests/watchlistInsights·watchlistData.
 */
import assert from 'node:assert/strict';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log(`  ✓ ${name}`); });

process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
let bundle: any = null;
(globalThis as any).fetch = async (input: any) => {
  const url = String(input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.includes('/api/flow/options-eod?all=1')) return json(bundle);
  if (url.startsWith('http://ec2.test/get')) {
    const key = decodeURIComponent(url.split('key=')[1] || '');
    if (key === 'intrinio:options:eod') return json({ result: JSON.stringify(rawBundle) });
    return json({ result: null });
  }
  if (url.startsWith('http://ec2.test/set')) return json({ ok: true });
  throw new Error('unexpected fetch ' + url);
};

// 묶음 원본(EC2 키 intrinio:options:eod) — 레코드 10/02 · 직전 10/01. 기관 집계는 «시장 전체» 문턱(50종목)을 넘겨야 값이 나온다.
const top = (k: number) => [{ c: `X${k}C`, k: 100, e: '2099-01-15', t: 'C', v: 900, oi: 900, d: 850 + k, iv: 0.5, dl: 0.5 }];
const rawBundle: any = { date: '2026-10-02', prevDate: '2026-10-01', tickers: {} as Record<string, any> };
for (let i = 0; i < 60; i++) rawBundle.tickers[`T${i}`] = { top: top(i) };
rawBundle.tickers.NVDA = { top: [{ c: 'NVDA261016C00405000', k: 405, e: '2026-10-16', t: 'C', v: 0, oi: 870, d: 858, iv: 0.6, dl: 0.2 }] };

(async () => {
  console.log('── UC 큰손 레이더 — fetchOptionsOpening 의 날짜 = 포지션이 열린 세션');
  const { fetchOptionsOpening, moneyFallback } = await import('../src/app/api/undercurrent/shared');
  bundle = {
    available: true, date: '2026-10-02', prevDate: '2026-10-01', opening: { NVDA: { contracts: 858, notional: 3.5e7, side: 'call' } },
    openingStale: { MU: { contracts: 2100, notional: 1.2e8, side: 'put', callContracts: 0, putContracts: 2100, callNotional: 0, putNotional: 1.2e8, date: '2026-10-01', prevDate: '2026-09-30' } },
  };
  await t('묶음 date 10/2(레코드) → 돌려주는 date 는 prevDate 10/1(그 세션에 열렸다) · 지각 종목 MU 는 자기 prevDate 9/30', async () => {
    const o = await fetchOptionsOpening('https://www.signumhq.com');
    assert.equal(o.date, '2026-10-01');
    assert.equal(o.byTicker.NVDA?.contracts, 858);
    assert.equal(o.byTicker.NVDA?.date, undefined, '묶음 종목은 묶음 날짜(o.date)를 쓴다');
    assert.deepEqual(o.byTicker.MU, { contracts: 2100, notional: 1.2e8, side: 'put', date: '2026-09-30' });
  });
  await t('prevDate 가 없거나 날짜 모양이 아니면 날짜를 지어내지 않는다(null — 화면은 «어제» 대신 날짜 없는 예전 문구)', async () => {
    bundle = { available: true, date: '2026-10-02', opening: {} };
    assert.equal((await fetchOptionsOpening('https://www.signumhq.com')).date, null);
    bundle = { available: true, date: '2026-10-02', prevDate: '10/1', opening: {} };
    assert.equal((await fetchOptionsOpening('https://www.signumhq.com')).date, null);
  });
  await t('카드 문장(금액이 틀렸을 때 대신 쓰는 사실 문장)은 그 세션의 요일 — 10/1 = 목요일(예전엔 레코드 10/2 금요일)', () => {
    assert.equal(moneyFallback('ko', { newOiNotional: 3.3e9, newOiSide: 'call', optionsDate: '2026-10-01' }), '목요일 상승 쪽에 약 33억 달러 규모의 새 포지션이 열렸다.');
    assert.equal(moneyFallback('ja', { newOiNotional: 3.3e9, newOiSide: 'call', optionsDate: '2026-10-01' }), '木曜日は上昇方向に約33億ドル相当の新規ポジションが開かれました。');
  });

  console.log('── 기관 신규 포지션(institutionalFlow) — 옵션 흐름 SEO 페이지 «Session of …»·대시보드 카드의 기준일');
  const F = await import('../src/services/institutionalFlow');
  await t('순위(옵션 흐름 SEO 페이지) date = prevDate 10/1 · 최대 단일 계약 NVDA 405C +858 그대로', async () => {
    const L = await F.getInstitutionalFlowLeaders();
    assert.equal(L?.date, '2026-10-01');
    assert.ok(L!.contracts.some((c) => c.ticker === 'NVDA' && c.contracts === 858));
  });
  await t('요약·한 종목도 같은 날짜(prevDate) — 이력 비교·쓸 수 있는 판 판정은 레코드 날짜 그대로', async () => {
    const S = await F.getInstitutionalFlowSummary();
    assert.equal(S?.date, '2026-10-01');
    const N = await F.getInstitutionalFlowForTicker('NVDA');
    assert.equal(N?.date, '2026-10-01');
    assert.equal(N?.contracts, 858);
  });

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
