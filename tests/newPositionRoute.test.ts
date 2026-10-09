/**
 * premium-metrics 라우트의 «신규 포지션» 정상본 신선도 (2026-10-09)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/newPositionRoute.test.ts
 *
 * 위험: 라우트의 «마지막 정상본 즉시 반환 + 배경 갱신(void fn())»은 서버리스 인스턴스가 응답 직후 멈추면 갱신이 끝나지 못한다.
 *   그러면 새 묶음(금요일 저녁 레코드)이 올라온 뒤에도 정상본이 «목요일 추정»을 계속 내보낸다 → 정상본에 asOf 를 달고 15분이 지나면 새로 계산한다.
 * 지키는 것:
 *   · 첫 요청(정상본 없음) — 계산해서 기다리고 institutionalFlow 에 basis·date·asOf 가 실린다
 *   · 정상본이 «신선»(1분) → 그대로 즉시 반환(배경 갱신은 걸되 기다리지 않는다) — 옛 동작
 *   · 정상본이 «오래됨»(20분) → 즉시 반환하지 않고 새로 계산한 값(새 묶음 날짜)을 준다
 *   · 새로 계산이 안 되면(묶음을 못 읽음) 오래된 정상본이라도 낸다 — 빈 카드보다 낫다
 */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
process.env.REDIS_PROXY_KEY = 'k';

const store = new Map<string, any>();
let bundle: any = null;
let readBundle = true;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = String(input);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('http://ec2.test/get')) {
    const key = decodeURIComponent(url.split('key=')[1] || '');
    if (key === 'intrinio:options:eod') return readBundle ? json({ result: JSON.stringify(bundle) }) : json({ result: null });
    return json({ result: store.has(key) ? store.get(key) : null });
  }
  if (url.startsWith('http://ec2.test/set')) {
    const b = JSON.parse(init?.body || '{}');
    store.set(b.key, b.value);
    return json({ ok: true });
  }
  throw new Error('offline ' + url);        // 다른 카드(구조·가디언)는 실패해도 라우트가 계속 나간다
};

const edt = (ymd: string, h: number, m = 0) => Date.parse(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`);
const bundleOf = (date: string, prevDate: string, nextSession: string) => {
  const b: any = { date, prevDate, tickers: {} };
  for (let i = 0; i < 60; i++) b.tickers[`T${i}`] = { top: [
    { c: `X${i}A`, k: 100, e: '2099-01-15', t: 'C', v: 1500, oi: 1000, d: 50 },
    { c: `X${i}B`, k: 100, e: nextSession, t: 'C', v: 100000, oi: 100, d: 30 },
  ] };
  return b;
};

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const KEY = 'premium:instflow:lastgood:v2';

(async () => {
  const { GET } = await import('../src/app/api/live/premium-metrics/route');
  const call = async () => {
    const res = await GET(new NextRequest('https://x.test/api/live/premium-metrics?locale=ko'));
    return res.json();
  };
  const realNow = Date.now;
  // 시계를 목요일 17:30 ET 로 둔다(마지막 마감 세션 = 10/8)
  const setNow = (ms: number) => { Date.now = () => ms; };
  const THU = edt('2026-10-08', 17, 30);

  try {
    await t('첫 요청(정상본 없음) — 계산해서 기다린다: 목요일 추정 · basis·date·asOf 가 실린다', async () => {
      setNow(THU); store.clear(); bundle = bundleOf('2026-10-08', '2026-10-07', '2026-10-09');
      const j = await call();
      assert.equal(j.institutionalFlow?.basis, 'estimate');
      assert.equal(j.institutionalFlow?.date, '2026-10-08');
      assert.equal(typeof j.institutionalFlow?.asOf, 'number');
    });
    await t('정상본이 1분 된 신선한 값이면 그대로 즉시 반환 — 같은 asOf', async () => {
      const first = store.get(KEY);
      assert.ok(first, '정상본 저장');
      setNow(THU + 60_000);
      const j = await call();
      assert.equal(j.institutionalFlow.asOf, first.asOf);
    });
    await t('정상본이 20분 된 오래된 값이면 즉시 반환하지 않고 새로 계산 — 새 묶음(금요일 저녁 10/9) 날짜로 넘어간다', async () => {
      const old = store.get(KEY);
      bundle = bundleOf('2026-10-09', '2026-10-08', '2026-10-12');
      setNow(THU + 20 * 60_000 + 24 * 3600_000);      // 금요일 17:50 ET — 정상본(asOf = 목 17:30)은 하루 넘게 낡았다
      const j = await call();
      assert.equal(j.institutionalFlow.date, '2026-10-09');
      assert.equal(j.institutionalFlow.basis, 'estimate');
      assert.ok(j.institutionalFlow.asOf > old.asOf);
    });
    await t('새로 계산이 안 되면(묶음 못 읽음) 오래된 정상본이라도 낸다 — 날짜가 붙어 있으니 빈 카드보다 낫다', async () => {
      const cur = store.get(KEY);
      readBundle = false;
      setNow(Date.now() + 30 * 60_000);
      const j = await call();
      assert.equal(j.institutionalFlow?.date, cur.date);
      readBundle = true;
    });
  } finally { Date.now = realNow; }
  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
