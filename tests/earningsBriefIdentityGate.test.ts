import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'offline-fixture';
process.env.FMP_API_KEY = 'offline-fixture';
const store = new Map<string, any>();
let rows: any[] = [];
let profileFetch: (url: URL, init: any) => Promise<Response> = async () => { throw new Error('offline-profile-failure'); };
let reply: any = {};
let modelCalls = 0;
let writes = 0;
globalThis.fetch = (async (input: any, init: any) => {
  const url = new URL(String(input));
  if (url.pathname === '/mget') return Response.json({ results: url.searchParams.get('keys')!.split(',').map(k => store.get(k) ?? null) });
  if (url.pathname === '/get') return Response.json({ result: store.get(url.searchParams.get('key')!) ?? null });
  if (url.pathname === '/set') {
    const body = JSON.parse(init.body); store.set(body.key, body.value); writes++;
    return Response.json({ ok: true });
  }
  if (url.pathname === '/api/market/earnings-calendar') return Response.json({ rows });
  assert.equal(url.pathname, '/stable/profile');
  return profileFetch(url, init);
}) as typeof fetch;
require('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient.prototype.send = async () => {
  modelCalls++;
  return { output: { message: { content: [{ text: JSON.stringify(reply) }] } } };
};
const B = require('../src/lib/earnings/earningsBrief') as typeof import('../src/lib/earnings/earningsBrief');
const { GET } = require('../src/app/api/cron/earnings-brief/route');
const call = async (query = '') => (await GET(new Request(`http://localhost/api/cron/earnings-brief${query}`))).json();
const row = (ticker: string) => ({ ticker, date: '2026-10-27', epsEstimate: 1, revenueEstimate: 1e9 });
const company = { name: 'Example Devices', sector: 'Technology', industry: 'Test equipment', source: 'profile' as const };
const text = {
  ko: { name: '시험회사', watch: '핵심 장비 부문 매출과 마진 동인; 고객 설비 투자와 제품 구성 변화가 수익성에 미치는 영향을 확인' },
  en: { name: company.name, watch: 'Core equipment revenue and margin drivers; customer investment and product mix determine profitability' },
  ja: { name: 'テスト企業', watch: '主力装置の売上と利益率の要因；顧客設備投資と製品構成が収益性に与える影響を確認' },
};
let failures = 0;
const test = async (name: string, fn: () => any) => {
  store.clear(); rows = []; reply = {}; writes = 0; modelCalls = 0;
  profileFetch = async () => { throw new Error('offline-profile-failure'); };
  try { await fn(); console.log(`통과 ${name}`); }
  catch (e) { failures++; console.error(`실패 ${name}`, e); }
};

(async () => {
  await test('관문 P1: en.name 없는 TER 오염본은 exact/dateFrom/근접 날짜 모두 거절', () => {
    const bad = { ko: { name: '테라도스', watch: '데이터 웨어하우스 구독 고객 수와 갱신율 추이를 확인' }, ja: { name: 'テラデータ', watch: 'データウェアハウス契約の顧客維持率を確認' } };
    for (const r of [row('TER'), { ...row('TER'), date: '2026-12-27', dateFrom: '2026-10-27' }, { ...row('TER'), date: '2026-10-29' }]) {
      for (const en of [undefined, {}, { name: '   ' }]) {
        const out = B.attachBriefs([r], { entries: { 'TER|2026-10-27': { ...bad, en } } });
        assert.equal(out.blocked, 1);
        assert.equal(out.rows[0].brief, undefined);
      }
    }
  });
  await test('관문 P2: 30종목·2.9초·12초 예산, 두 번째 호출은 뒤 6종목을 확인(모델 실패해도 프로필 보존)', async () => {
    const nowOriginal = Date.now;
    const timeoutOriginal = AbortSignal.timeout;
    let now = nowOriginal();
    const timeouts = new WeakMap<AbortSignal, number>();
    Date.now = () => now;
    AbortSignal.timeout = (ms) => { const signal = new AbortController().signal; timeouts.set(signal, ms); return signal; };
    const fetched: string[] = [];
    try {
      rows = Array.from({ length: 30 }, (_, i) => row(`ZZ${String(i).padStart(2, '0')}`));
      profileFetch = async (url, init) => {
        const symbol = url.searchParams.get('symbol')!;
        fetched.push(symbol);
        const start = now, budget = timeouts.get(init.signal)!;
        await Promise.resolve(); // 동시 6개는 같은 시작 시각을 공유
        now = Math.max(now, start + Math.min(2900, budget));
        if (budget < 2900) throw new Error('offline-timeout');
        return Response.json([{ symbol, companyName: `Company ${symbol}`, industry: 'Test equipment' }]);
      };
      await call();
      assert.equal(fetched.length, 30);
      const first = store.get(B.EARNINGS_BRIEF_KEY);
      const firstConfirmed = Object.values(first?.companies ?? {}).filter(Boolean).length;
      const second = await call();
      assert.deepEqual(fetched.slice(30), rows.slice(24).map(r => r.ticker));
      assert.equal(firstConfirmed, 24);
      assert.equal(first.generatedAt, undefined, '프로필 확인만으로 AI 생성 시각을 새로 찍지 않는다');
      assert.deepEqual(second.unresolved, []);
      assert.equal(Object.keys(store.get(B.EARNINGS_BRIEF_KEY).companies).length, 30);
    } finally { Date.now = nowOriginal; AbortSignal.timeout = timeoutOriginal; }
  });
  await test('entry.company 재사용: 공급사 장애에도 기존 정상 저장본 유지, 모델/프로필 재호출 없음', async () => {
    rows = [row('ZZZZ')];
    const entry = { ...text, company };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'ZZZZ|2026-10-27': entry } });
    let fetches = 0;
    profileFetch = async () => { fetches++; throw new Error('offline-profile-failure'); };
    const result = await call();
    assert.equal(fetches, 0);
    assert.equal(modelCalls, 0);
    assert.equal(result.skipped, 'all-cached');
    assert.deepEqual(store.get(B.EARNINGS_BRIEF_KEY).entries['ZZZZ|2026-10-27'], entry);
  });
  await test('프로필 실패: 회사명 매핑만 있는 오염본도 추측 생성·삭제 없이 유지, 새 종목 보류', async () => {
    rows = [row('MSFT'), row('ZZZZ')];
    const previous = { entries: { 'MSFT|2026-10-27': { ...text, en: { ...text.en, name: 'Other Company' } }, 'ZZZZ|2026-10-25': text } };
    store.set(B.EARNINGS_BRIEF_KEY, previous);
    const result = await call('?invalidate=MSFT,ZZZZ');
    assert.equal(modelCalls, 0);
    assert.deepEqual(result.unresolved, ['MSFT', 'ZZZZ']);
    assert.deepEqual(store.get(B.EARNINGS_BRIEF_KEY).entries, previous.entries);
    assert.equal(writes, 0);
  });
  await test('저장 출구: 새 생성·번역 채우기·캐시 이월 모두 이름 누락/불일치 검사', async () => {
    rows = [row('TER'), row('TDC')];
    const cleanTdc = { ...text, en: { ...text.en, name: 'Teradata' } };
    const bad = { ko: text.ko, ja: text.ja, tries: 99 };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'TER|2026-10-27': bad, 'TDC|2026-10-27': cleanTdc } });
    reply = { TER: { ...text, en: { ...text.en, name: 'Teradata' } } };
    await call();
    assert.equal(store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-27'], undefined);
    assert.deepEqual(store.get(B.EARNINGS_BRIEF_KEY).entries['TDC|2026-10-27'], cleanTdc);
    // 정식 회사명이 있는 기존 ko를 유지하면서 en/ja를 채우는 경로도 새 응답을 검증한다.
    const partial = { ko: text.ko, en: { name: 'Teradyne' } };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'TER|2026-10-27': partial } });
    rows = [row('TER')];
    reply = { TER: { ko: text.ko, ja: text.ja } };
    await call();
    assert.deepEqual(store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-27'], partial);
    reply = { TER: { ...text, en: { ...text.en, name: 'Teradyne' } } };
    await call();
    assert.equal(store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-27'].en.name, 'Teradyne');
    assert.equal(store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-27'].ja.watch, text.ja.watch);
  });
  await test('혼합 저장: 다른 회사 생성 성공으로 팩을 써도 프로필 미확인 저장본은 원문 그대로 유지', async () => {
    rows = [row('TER'), row('ZZZZ')];
    const existing = { ko: text.ko, tries: 99 };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'ZZZZ|2026-10-25': existing } });
    reply = { TER: { ...text, en: { ...text.en, name: 'Teradyne' } } };
    await call();
    const saved = store.get(B.EARNINGS_BRIEF_KEY);
    assert.equal(saved.entries['TER|2026-10-27'].en.name, 'Teradyne');
    assert.deepEqual(saved.entries['ZZZZ|2026-10-25'], existing);
    assert.equal(saved.companies.ZZZZ, undefined, '모델 이름/본문을 프로필로 승격하지 않는다');
    assert.equal(B.briefNeedsFill({ ...text, tries: 99 }, null), true, '확인할 수 없어 응답에서 거절된 글도 재생성 신호 유지');
  });
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
