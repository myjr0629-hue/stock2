/**
 * 옵션 레벨 «공급사 체인 지연» 판정 시험 — src/lib/levelsSupplierDelay.ts + 서버 경로(structureService 판본 읽기 → applyLevelsToRealtime)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/levelsSupplierDelay.test.ts
 *
 * 출발점(10/1 대표 제보): SNDK 옵션 EOD 가 9/25 뒤 며칠 안 왔다 — 공급사 결측(40종목 중 SNDK 만, 같은 시각 MU 9/29).
 *   «내 종목» 지도는 «레벨 갱신 대기»로만 가려 앱 버그처럼 보였다. 가리는 기준(isTooStaleLevels — 기대 판본보다 2거래일 이상 늦음)은
 *   그대로 두고, 그 까닭을 서버가 같은 함수로 판정해 싣는다: 'supplier-delay'(이 종목만 공급사가 늦다) · 'stale'(그 밖) · null(안 가림).
 * 세션 날짜는 marketCalendar 휴장표 — 9월·10월은 EDT(UTC−4), 11/1 뒤는 EST(UTC−5). 11/26 추수감사절 휴장 · 11/27 조기 폐장.
 */
import assert from 'node:assert/strict';
import {
  levelsStaleReason, staleFields, chainFetchedAt, mergeSupplierDelay, supplierDelayLogLine, supplierDelayKey, VENDOR_EOD_KEY,
} from '../src/lib/levelsSupplierDelay';
import { isTooStaleLevels } from '../src/lib/app/watchlistInsights';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log(`  ✓ ${name}`); });

/** ET 벽시계 → ms (EDT −4 · 11/1 부터 EST −5) */
const et = (y: number, m: number, d: number, h = 0, mi = 0) => {
  const off = (m > 11 || (m === 11 && d >= 1)) ? 5 : 4;
  return Date.UTC(y, m - 1, d, h + off, mi);
};

(async () => {
  console.log('── ① 판정(순수 함수) — 정상 · 한 종목 지연 · 전 종목 지연 · 우리가 늦게 받음');
  await t('정상 — 판본이 기대 세션 안(10/2 장중에 10/1 체인) → null(가리지 않는다)', () => {
    assert.equal(levelsStaleReason({ chainDate: '2026-10-01', fetchedAt: et(2026, 10, 2, 10), refChainDate: '2026-10-01' }, et(2026, 10, 2, 10, 5)), null);
    assert.equal(levelsStaleReason({ chainDate: '2026-09-30', fetchedAt: et(2026, 10, 2, 10), refChainDate: '2026-10-01' }, et(2026, 10, 2, 10, 5)), null);   // 1세션 늦음은 가리지 않는다
  });
  await t('한 종목 지연(9/30 실제 사례 SNDK) — 9/25 체인을 9/30 장중에 받았고 다른 종목은 9/29 → supplier-delay · 기준일 9/25', () => {
    const x = { chainDate: '2026-09-25', fetchedAt: et(2026, 9, 30, 10), refChainDate: '2026-09-29' };
    const now = et(2026, 9, 30, 10, 30);
    assert.equal(isTooStaleLevels('2026-09-25', now), true);
    assert.equal(levelsStaleReason(x, now), 'supplier-delay');
    assert.deepEqual(staleFields(x, now), { levelsStaleReason: 'supplier-delay', levelsStaleAsOf: '2026-09-25' });
  });
  await t('전 종목 지연 = 우리 쪽 — 공급사 최신 체인 날짜도 같이 멈췄다(9/25 · 9/24) → stale', () => {
    const now = et(2026, 9, 30, 10, 30);
    assert.equal(levelsStaleReason({ chainDate: '2026-09-25', fetchedAt: et(2026, 9, 30, 10), refChainDate: '2026-09-25' }, now), 'stale');
    assert.equal(levelsStaleReason({ chainDate: '2026-09-25', fetchedAt: et(2026, 9, 30, 10), refChainDate: '2026-09-24' }, now), 'stale');
    // 기준이 이 종목보다 뒤라도 그 기준 자체가 너무 오래됐으면(9/28 > 9/25 이지만 10/2 장중엔 2세션 늦음) 우리 쪽
    assert.equal(levelsStaleReason({ chainDate: '2026-09-25', fetchedAt: et(2026, 10, 2, 10), refChainDate: '2026-09-28' }, et(2026, 10, 2, 10, 30)), 'stale');
  });
  await t('우리가 늦게 받음 — 9/30 에 받은 9/29 체인(그땐 정상)을 토요일에 본다 → stale(공급사 탓이 아니다)', () => {
    assert.equal(levelsStaleReason({ chainDate: '2026-09-29', fetchedAt: et(2026, 9, 30, 10), refChainDate: '2026-10-02' }, et(2026, 10, 3, 10)), 'stale');
  });
  await t('받은 시각·기준을 모르면 공급사 탓으로 말하지 않는다 → stale · 날짜 모양이 아니면 null', () => {
    const now = et(2026, 9, 30, 10, 30);
    assert.equal(levelsStaleReason({ chainDate: '2026-09-25', fetchedAt: null, refChainDate: '2026-09-29' }, now), 'stale');
    assert.equal(levelsStaleReason({ chainDate: '2026-09-25', fetchedAt: et(2026, 9, 30, 10), refChainDate: null }, now), 'stale');
    assert.equal(levelsStaleReason({ chainDate: null, fetchedAt: et(2026, 9, 30, 10), refChainDate: '2026-09-29' }, now), null);
    assert.equal(levelsStaleReason({ chainDate: '9/25', fetchedAt: et(2026, 9, 30, 10), refChainDate: '2026-09-29' }, now), null);
    assert.deepEqual(staleFields({ chainDate: '2026-10-01' }, et(2026, 10, 2, 10)), { levelsStaleReason: null, levelsStaleAsOf: null });
  });
  await t('받은 시각이 지금보다 1분 넘게 뒤(시계 어긋남)면 증거로 쓰지 않는다', () => {
    const now = et(2026, 9, 30, 10, 30);
    assert.equal(levelsStaleReason({ chainDate: '2026-09-25', fetchedAt: now + 5 * 60_000, refChainDate: '2026-09-29' }, now), 'stale');
    assert.equal(levelsStaleReason({ chainDate: '2026-09-25', fetchedAt: now + 30_000, refChainDate: '2026-09-29' }, now), 'supplier-delay');
  });

  console.log('── ② 주말·휴장·06:00 ET 경계(marketCalendar)');
  await t('주말 — 금 10/2 장중에 받은 9/29 체인(그때 이미 2세션 늦음) · 기준 10/2 → 일요일에도 supplier-delay', () => {
    const x = { chainDate: '2026-09-29', fetchedAt: et(2026, 10, 2, 10), refChainDate: '2026-10-02' };
    assert.equal(levelsStaleReason(x, et(2026, 10, 3, 12)), 'supplier-delay');
    assert.equal(levelsStaleReason(x, et(2026, 10, 4, 12)), 'supplier-delay');
  });
  await t('월요일 아침 — 금요일 장중 판본(목 10/1 체인)은 월 06:00 ET 뒤에도 정상 → null', () => {
    assert.equal(levelsStaleReason({ chainDate: '2026-10-01', fetchedAt: et(2026, 10, 2, 15), refChainDate: '2026-10-02' }, et(2026, 10, 5, 7)), null);
  });
  await t('06:00 ET 경계 — 화 10/6 05:59 까지 10/1 체인은 null, 06:00 부터 가린다(그 뒤에 받았으면 supplier-delay)', () => {
    assert.equal(levelsStaleReason({ chainDate: '2026-10-01', fetchedAt: et(2026, 10, 5, 15), refChainDate: '2026-10-05' }, et(2026, 10, 6, 5, 59)), null);
    assert.equal(levelsStaleReason({ chainDate: '2026-10-01', fetchedAt: et(2026, 10, 5, 15), refChainDate: '2026-10-05' }, et(2026, 10, 6, 6, 0)), 'stale');   // 월 장중엔 정상이었다
    assert.equal(levelsStaleReason({ chainDate: '2026-10-01', fetchedAt: et(2026, 10, 6, 6, 30), refChainDate: '2026-10-05' }, et(2026, 10, 6, 6, 31)), 'supplier-delay');
  });
  await t('휴장 — 11/26 추수감사절(목) 다음 날 11/27 07:00 ET: 기대 판본 11/25 · 11/24 체인은 null, 11/23 은 가린다', () => {
    const now = et(2026, 11, 27, 7);
    assert.equal(levelsStaleReason({ chainDate: '2026-11-24', fetchedAt: et(2026, 11, 27, 6, 30), refChainDate: '2026-11-25' }, now), null);
    assert.equal(levelsStaleReason({ chainDate: '2026-11-23', fetchedAt: et(2026, 11, 27, 6, 30), refChainDate: '2026-11-25' }, now), 'supplier-delay');
    // 휴장 당일(11/26 10:00 ET)도 같은 기대 판본 — 휴장은 세션이 아니다
    assert.equal(levelsStaleReason({ chainDate: '2026-11-23', fetchedAt: et(2026, 11, 26, 9), refChainDate: '2026-11-25' }, et(2026, 11, 26, 10)), 'supplier-delay');
    assert.equal(levelsStaleReason({ chainDate: '2026-11-24', fetchedAt: et(2026, 11, 26, 9), refChainDate: '2026-11-25' }, et(2026, 11, 26, 10)), null);
  });

  console.log('── ③ 받은 시각 · 기록 · 로그 한 줄');
  await t('chainFetchedAt — 직접 경로 = 저장 시각 · 프로브 = 프로브를 쓴 시각 · 모르면 null', () => {
    assert.equal(chainFetchedAt({ debug: { chainSource: 'vendor-direct' } }, 1000), 1000);
    assert.equal(chainFetchedAt({ debug: { chainSource: 'lambda-probe', probeTs: 777 } }, 1000), 777);
    assert.equal(chainFetchedAt({ debug: { chainSource: 'lambda-probe', probeTs: null } }, 1000), null);
    assert.equal(chainFetchedAt({ levelsAsOf: 555 }), 555);
    assert.equal(chainFetchedAt({}), null);
  });
  await t('mergeSupplierDelay — 처음 본 종목은 새 줄 · 같은 기준일은 lastSeen 만 · 기준일이 바뀌면 새로', () => {
    const a = mergeSupplierDelay(null, 'SNDK', { asOf: '2026-09-25', ref: '2026-09-29', at: 100, fetchedAt: 90 });
    assert.deepEqual(a, { SNDK: { asOf: '2026-09-25', ref: '2026-09-29', firstSeen: 100, lastSeen: 100, fetchedAt: 90 } });
    const b = mergeSupplierDelay(a, 'SNDK', { asOf: '2026-09-25', ref: '2026-09-30', at: 200, fetchedAt: 190 });
    assert.deepEqual(b.SNDK, { asOf: '2026-09-25', ref: '2026-09-30', firstSeen: 100, lastSeen: 200, fetchedAt: 190 });
    assert.equal(a.SNDK.lastSeen, 100);   // 원래 객체는 그대로
    const c = mergeSupplierDelay(b, 'SNDK', { asOf: '2026-09-26', ref: '2026-09-30', at: 300, fetchedAt: null });
    assert.equal(c.SNDK.firstSeen, 300);
    const d = mergeSupplierDelay(c, 'XYZ', { asOf: '2026-09-24', ref: null, at: 400, fetchedAt: null });
    assert.deepEqual(Object.keys(d).sort(), ['SNDK', 'XYZ']);
  });
  await t('기록 키는 levels:*(EC2 전용 접두사) · 운영 로그 한 줄 모양', () => {
    assert.equal(supplierDelayKey('2026-09-30'), 'levels:supplier-delay:2026-09-30');
    assert.ok(VENDOR_EOD_KEY.startsWith('levels:'));
    assert.equal(supplierDelayLogLine('SNDK', '2026-09-25', '2026-09-29', et(2026, 9, 30, 10, 1)),
      '[levels] 공급사 체인 지연 SNDK · 9/25 기준 (공급사 최신 9/29 · 받은 시각 9/30 10:01 ET)');
    assert.equal(supplierDelayLogLine('SNDK', '2026-09-25', null, null), '[levels] 공급사 체인 지연 SNDK · 9/25 기준 (공급사 최신 ? · 받은 시각 ? ET)');
  });

  console.log('── ④ 서버 경로 — 판본 읽기(mget 한 번) → 레벨 한 벌 → 배치 행(applyLevelsToRealtime). Redis 는 모의(fetch 가로채기)');
  process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
  process.env.EC2_REDIS_PROXY_KEY = 'k';
  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  const store = new Map<string, any>();
  const mgetKeys: string[][] = [];
  let upstash = 0;
  (globalThis as any).fetch = async (input: any) => {
    const url = String(input);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('http://ec2.test/mget')) {
      const keys = decodeURIComponent(url.split('keys=')[1]).split(',');
      mgetKeys.push(keys);
      return json({ results: keys.map((k) => (store.has(k) ? store.get(k) : null)) });
    }
    if (url.startsWith('http://ec2.test/get')) return json({ result: null });
    if (url.startsWith('http://ec2.test/set')) return json({ ok: true });
    if (url.startsWith('https://upstash.test')) { upstash++; return json({ result: null }); }
    throw new Error('unexpected fetch ' + url);
  };
  // 판본 모양(구조 계산 성공 응답) — 만기는 시험 시계와 무관하게 «아직 안 지난» 날짜
  const version = (ticker: string, chainDate: string, S: number, at: number) => ({
    timestamp: at,
    data: {
      ticker, levelsProducer: 'structureService', options_status: 'OK', expiration: '2099-01-16', chainDate, underlyingPrice: S,
      maxPain: S, levels: { callWall: Math.round(S * 1.1), putFloor: Math.round(S * 0.9), pinZone: S }, gammaFlipLevel: null, gammaFlipType: 'ALL_LONG',
      structure: { strikes: [Math.round(S * 0.9), S, Math.round(S * 1.1)], callsOI: [1, 5, 9], putsOI: [9, 5, 1], gexCum: [1, 2, 3] },
      debug: { chainSource: 'vendor-direct' },
    },
  });
  const S = await import('../src/services/structureService');
  const { applyLevelsToRealtime } = await import('../src/lib/optionLevelGate');
  const realNow = Date.now;
  const NOW = et(2026, 9, 30, 10, 30);
  Date.now = () => NOW;
  try {
    store.set(VENDOR_EOD_KEY, { date: '2026-09-29', seenAt: et(2026, 9, 29, 17, 40), ticker: 'MU' });
    store.set('structure:v2:SNDK', version('SNDK', '2026-09-25', 1500, et(2026, 9, 30, 10)));
    store.set('structure:v2:MU', version('MU', '2026-09-29', 1050, et(2026, 9, 30, 10, 20)));
    await t('한 종목 지연 — SNDK supplier-delay·9/25 · MU null · 판본 읽기는 mget 한 번(공급사 최신 날짜 키 포함)', async () => {
      mgetKeys.length = 0;
      const { levels } = await S.peekStructureLevelsDetailed(['SNDK', 'MU']);
      assert.equal(mgetKeys.length, 1);
      assert.ok(mgetKeys[0].includes(VENDOR_EOD_KEY));
      assert.equal(levels.get('SNDK')?.levelsStaleReason, 'supplier-delay');
      assert.equal(levels.get('SNDK')?.levelsStaleAsOf, '2026-09-25');
      assert.equal(levels.get('MU')?.levelsStaleReason, null);
      assert.equal(levels.get('MU')?.levelsStaleAsOf, null);
      // 배치 행 출구(watchlist/batch · portfolio · intel 이 같은 함수) — 위젯이 읽는 realtime 필드
      const rt: any = { price: 1500, session: 'reg' };
      applyLevelsToRealtime(rt, levels.get('SNDK'));
      assert.equal(rt.levelsStaleReason, 'supplier-delay');
      assert.equal(rt.levelsStaleAsOf, '2026-09-25');
      assert.equal(rt.levelsChainDate, '2026-09-25');
      assert.equal(rt.callWall, 1650);   // 값은 그대로 싣는다(가릴지는 화면이 정한다 — 화면과 같은 기준)
      const rt2: any = { price: 1050, session: 'reg' };
      applyLevelsToRealtime(rt2, levels.get('MU'));
      assert.equal(rt2.levelsStaleReason, null);
      assert.ok('levelsStaleReason' in rt2 && 'levelsStaleAsOf' in rt2);   // 키는 늘 있다(서버가 판정을 싣는다는 표시)
      const rt3: any = { price: 10 };
      applyLevelsToRealtime(rt3, null);
      assert.equal(rt3.levelsStaleReason, null);
    });
    await t('전 종목 지연 — 공급사 최신 체인 날짜가 9/25 에 멈췄다 → SNDK 도 stale(우리 쪽 문제로 본다)', async () => {
      store.set(VENDOR_EOD_KEY, { date: '2026-09-25', seenAt: et(2026, 9, 25, 17, 40), ticker: 'SPY' });
      const { levels } = await S.peekStructureLevelsDetailed(['SNDK']);
      assert.equal(levels.get('SNDK')?.levelsStaleReason, 'stale');
      assert.equal(levels.get('SNDK')?.levelsStaleAsOf, '2026-09-25');
    });
    await t('Upstash 호출 0회(EC2 정상 · levels:* 는 EC2 전용)', () => { assert.equal(upstash, 0); });
  } finally {
    Date.now = realNow;
  }

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
