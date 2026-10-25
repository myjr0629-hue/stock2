// [2026-10-26 TRACKER T30] 실적 브리프 크론 — 회사 신원 관문 반례(관문 10260127 P1·10260307 P2 재현 포함).
//   정식명은 정적 표에서만 온다 — 공급사 프로필 호출이 없으므로 «프로필 없는 종목의 반복 조회가 뒤 종목을 막는» 경로 자체가 없다.
import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'offline-fixture';
process.env.FMP_API_KEY = 'offline-fixture';
const store = new Map<string, any>();
let rows: any[] = [];
let reply: any = {};
let modelCalls = 0;
let modelInputs: string[] = [];
let writes = 0;
let foreignFetches = 0;
globalThis.fetch = (async (input: any, init: any) => {
  const url = new URL(String(input));
  if (url.pathname === '/mget') return Response.json({ results: url.searchParams.get('keys')!.split(',').map(k => store.get(k) ?? null) });
  if (url.pathname === '/get') return Response.json({ result: store.get(url.searchParams.get('key')!) ?? null });
  if (url.pathname === '/set') {
    const body = JSON.parse(init.body); store.set(body.key, body.value); writes++;
    return Response.json({ ok: true });
  }
  if (url.pathname === '/api/market/earnings-calendar') return Response.json({ rows });
  foreignFetches++;
  throw new Error(`unexpected-fetch ${url.host}${url.pathname}`);
}) as typeof fetch;
require('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient.prototype.send = async (cmd: any) => {
  modelCalls++;
  modelInputs.push(cmd.input.messages[0].content[0].text);
  return { output: { message: { content: [{ text: JSON.stringify(typeof reply === 'function' ? reply() : reply) }] } } };
};
const B = require('../src/lib/earnings/earningsBrief') as typeof import('../src/lib/earnings/earningsBrief');
const { GET } = require('../src/app/api/cron/earnings-brief/route');
const call = async (query = '') => (await GET(new Request(`http://localhost/api/cron/earnings-brief${query}`))).json();
const row = (ticker: string, date = '2026-10-27') => ({ ticker, date, epsEstimate: 1, revenueEstimate: 1e9 });
const text = (enName: string) => ({
  ko: { name: '시험회사', watch: '핵심 장비 부문 매출과 마진 동인; 고객 설비 투자와 제품 구성 변화가 수익성에 미치는 영향을 확인' },
  en: { name: enName, watch: 'Core equipment revenue and margin drivers; customer investment and product mix determine profitability' },
  ja: { name: 'テスト企業', watch: '主力装置の売上と利益率の要因；顧客設備投資と製品構成が収益性に与える影響を確認' },
});
let failures = 0;
const test = async (name: string, fn: () => any) => {
  store.clear(); rows = []; reply = {}; writes = 0; modelCalls = 0; modelInputs = []; foreignFetches = 0;
  try { await fn(); console.log(`통과 ${name}`); }
  catch (e) { failures++; console.error(`실패 ${name}`, e); }
};

(async () => {
  await test('관문 P1: en.name 없는 TER 오염본은 exact/dateFrom/근접 날짜 모두 거절', () => {
    const bad = { ko: { name: '테라도스', watch: '데이터 웨어하우스 구독 고객 수와 갱신율 추이를 확인' }, ja: { name: 'テラデータ', watch: 'データウェアハウス契約の顧客維持率を確認' } };
    for (const r of [row('TER'), { ...row('TER'), date: '2026-12-27', dateFrom: '2026-10-27' }, { ...row('TER'), date: '2026-10-29' }]) {
      for (const en of [undefined, {}, { name: '   ' }]) {
        const out = B.attachBriefs([r], { entries: { 'TER|2026-10-27': { ...bad, en } as any } });
        assert.equal(out.blocked, 1);
        assert.equal(out.rows[0].brief, undefined);
      }
    }
  });

  await test('관문 P2: 표에 없는 종목 24개가 앞에 있어도 뒤 정상 6종목은 같은 회차에 생성(공급사 호출 0)', async () => {
    const tail = ['TER', 'VRT', 'VKTX', 'PSX', 'PWR', 'XYZ'];
    rows = [...Array.from({ length: 24 }, (_, i) => row(`ZZ${String(i).padStart(2, '0')}`)), ...tail.map((t) => row(t))];
    const names: Record<string, string> = { TER: 'Teradyne', VRT: 'Vertiv', VKTX: 'Viking Therapeutics', PSX: 'Phillips 66', PWR: 'Quanta Services', XYZ: 'Block' };
    reply = () => Object.fromEntries(tail.map((t) => [t, text(names[t])]));
    const res = await call();
    assert.equal(foreignFetches, 0, '공급사 프로필 호출 없음');
    assert.equal(res.made, 6);
    assert.equal(res.unresolved.length, 24);
    assert.equal(modelCalls, 1, '표에 없는 24종목은 모델에 보내지 않는다');
    assert.ok(!/ZZ\d\d/.test(modelInputs[0]), '모델 입력에 표 밖 종목 없음');
    const saved = store.get(B.EARNINGS_BRIEF_KEY).entries;
    for (const t of tail) assert.equal(saved[`${t}|2026-10-27`].en.name, names[t], t);
    assert.equal(saved['PSX|2026-10-27'].ko.name, '필립스 66', '모델 ko 이름 대신 정식명');
    assert.equal(saved['VRT|2026-10-27'].ja.name, 'バーティブ');
    // 두 번째 회차: 만들 것이 없으면 모델·공급사 모두 0
    const again = await call();
    assert.equal(again.skipped, 'all-cached');
    assert.equal(modelCalls, 1);
    assert.equal(foreignFetches, 0);
  });

  await test('표에 없는 종목의 기존 저장본은 원문 그대로 유지(다른 종목 생성으로 팩을 다시 써도)', async () => {
    rows = [row('TER'), row('ZZZZ')];
    const existing = { ko: { name: '아무 회사', watch: '표 밖 종목의 예전 글' }, tries: 99 };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'ZZZZ|2026-10-25': existing } });
    reply = { TER: text('Teradyne') };
    await call();
    const saved = store.get(B.EARNINGS_BRIEF_KEY);
    assert.equal(saved.entries['TER|2026-10-27'].en.name, 'Teradyne');
    assert.deepEqual(saved.entries['ZZZZ|2026-10-25'], existing);
  });

  await test('정식명 입력: 모델 입력에 Teradyne·업종이 들어가고 Teradata 는 오지 않는다', async () => {
    rows = [row('TER')];
    reply = { TER: text('Teradyne') };
    await call();
    assert.match(modelInputs[0], /"name": "Teradyne"/);
    assert.match(modelInputs[0], /Semiconductor test equipment/);
  });

  await test('저장 출구: 새 생성·번역 채우기·캐시 이월 모두 이름 누락/불일치 검사', async () => {
    rows = [row('TER'), row('VRT')];
    const cleanVrt = text('Vertiv');
    const bad = { ko: text('x').ko, ja: text('x').ja, tries: 99 };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'TER|2026-10-27': bad, 'VRT|2026-10-27': cleanVrt } });
    reply = { TER: text('Teradata') };
    const r1 = await call();
    assert.deepEqual(r1.invalidated, ['TER|2026-10-27']);
    assert.ok(r1.rejected.includes('TER(company-name-mismatch)'));
    assert.equal(store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-27'], undefined, '모델이 또 Teradata 를 주면 어떤 언어도 저장 안 함');
    assert.deepEqual(store.get(B.EARNINGS_BRIEF_KEY).entries['VRT|2026-10-27'], cleanVrt);
    // 정식명이 있는 기존 ko 를 유지하면서 en/ja 를 채우는 경로도 새 응답을 검증한다.
    const partial = { ko: text('x').ko, en: { name: 'Teradyne' } };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'TER|2026-10-27': partial } });
    rows = [row('TER')];
    reply = { TER: { ko: text('x').ko, ja: text('x').ja } };
    await call();
    assert.deepEqual(store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-27'], { ...partial, tries: 1 }, 'en.name 없는 응답은 저장 안 함(시도 횟수만)');
    reply = { TER: text('Teradyne') };
    await call();
    const saved = store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-27'];
    assert.equal(saved.en.name, 'Teradyne');
    assert.equal(saved.ja.watch, text('x').ja.watch);
    assert.equal(saved.ko.name, '테라다인');
  });

  await test('불일치 응답이 계속 와도 기존 정상 글의 채우기는 tries 상한에서 멈춘다(무한 재호출 없음)', async () => {
    rows = [row('TER')];
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'TER|2026-10-27': { ko: text('x').ko, en: { name: 'Teradyne' } } } });
    reply = { TER: text('Teradata') };
    await call(); await call();
    assert.equal(modelCalls, 2);
    const third = await call();
    assert.equal(third.skipped, 'all-cached');
    assert.equal(modelCalls, 2);
  });

  await test('운영자 invalidate=TER: 정상 글도 전체 재생성, 표 밖 티커는 무시, 잘못된 형식은 400', async () => {
    rows = [row('TER'), row('ZZZZ')];
    const zz = { ko: { name: '아무 회사', watch: '표 밖' } };
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'TER|2026-10-27': { ...text('Teradyne'), tries: 1 }, 'ZZZZ|2026-10-27': zz } });
    reply = { TER: { ...text('Teradyne'), en: { ...text('Teradyne').en, watch: 'Semiconductor test demand from AI accelerators and mobile SoC complexity drives tester utilization' } } };
    const res = await call('?invalidate=TER,ZZZZ');
    assert.deepEqual(res.invalidated, ['TER|2026-10-27']);
    const saved = store.get(B.EARNINGS_BRIEF_KEY).entries;
    assert.match(saved['TER|2026-10-27'].en.watch, /AI accelerators/);
    assert.equal(saved['TER|2026-10-27'].tries, undefined);
    assert.deepEqual(saved['ZZZZ|2026-10-27'], zz);
    const badReq = await GET(new Request('http://localhost/api/cron/earnings-brief?invalidate=TER;DROP'));
    assert.equal(badReq.status, 400);
  });

  await test('모델 실패여도 무효화는 먼저 저장된다(오염 글이 되살아나지 않는다)', async () => {
    rows = [row('TER')];
    store.set(B.EARNINGS_BRIEF_KEY, { entries: { 'TER|2026-10-25': { ...text('Teradata'), tries: 99 } } });
    reply = 'not json';
    const res = await call();
    assert.deepEqual(res.invalidated, ['TER|2026-10-25']);
    assert.equal(store.get(B.EARNINGS_BRIEF_KEY).entries['TER|2026-10-25'], undefined);
  });

  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
