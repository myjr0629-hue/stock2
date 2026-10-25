import assert from 'node:assert/strict';
import { briefCompanyFor, briefCompanyReady, checkBriefCompany, normalizeBriefCompanyName } from '../src/lib/earnings/earningsBriefIdentity';
import { briefNeedsFill, briefInvalidationKeys } from '../src/lib/earnings/earningsBrief';
import { readBriefCompanies } from '../src/services/earningsBriefCompanyService';
const { auditSnapshot, weekWindow, cacheReader, main } = require('../scripts/check-earnings-brief-company-identity.cjs');

(async () => {
  const ter = briefCompanyFor('TER')!;
  const tdc = briefCompanyFor('TDC')!;
  assert.equal(ter.name, 'Teradyne');
  assert.equal(tdc.name, 'Teradata');
  assert.equal(briefCompanyFor('TER', { symbol: 'TDC', companyName: 'Teradata', industry: 'Software' })!.industry, 'Semiconductor test equipment');
  assert.equal(checkBriefCompany({ en: { name: 'Teradata' } }, ter).ok, false);
  assert.equal(checkBriefCompany({ en: { name: 'Teradyne' } }, tdc).ok, false);
  assert.equal(checkBriefCompany({ en: { name: 'Teradyne Inc.' } }, ter).ok, true);
  for (const name of ['Teradyne Robotics', 'Teradata / Teradyne', 'TER', '', 'Teradyne Semiconductor']) {
    assert.equal(checkBriefCompany({ en: { name } }, ter).ok, false, name);
  }
  assert.equal(normalizeBriefCompanyName('Alphabet (Google)'), normalizeBriefCompanyName('Alphabet Inc.'));
  assert.equal(briefCompanyFor('MSFT')!.name, 'Microsoft', 'SEO와 동일 회사명 자료');
  assert.equal(briefCompanyFor('NEW', { symbol: 'OTHER', companyName: 'Other' }), null);
  assert.equal(briefCompanyFor('NEW', { name: 'NEW', sector: 'Technology' }), null, '티커 이름을 회사명으로 받지 않음');
  assert.equal(briefCompanyReady(briefCompanyFor('MSFT')), false, '업종 없는 회사는 생성하지 않음');
  assert.equal(briefCompanyReady(ter), true);
  const full = { ko: { watch: '오염 문구' }, en: { name: 'Teradata', watch: 'Wrong company' }, ja: { watch: '別会社' }, tries: 99 };
  assert.equal(briefNeedsFill(full, ter), true);
  assert.deepEqual(briefInvalidationKeys({ 'TER|2026-10-27': full, 'TER|2026-10-29': full, 'TDC|2026-11-05': full }, { TER: ter, TDC: tdc }), ['TER|2026-10-27', 'TER|2026-10-29']);
  assert.deepEqual(briefInvalidationKeys({ 'TDC|2026-11-05': full }, { TDC: tdc }, ['TDC']), ['TDC|2026-11-05']);

  assert.deepEqual(weekWindow('2026-10-26'), { from: '2026-10-26', to: '2026-11-08' });
  assert.deepEqual(weekWindow('2026-11-01'), weekWindow('2026-10-26'), '일요일도 같은 ET 달력 주');
  assert.throws(() => weekWindow('2026-02-30'));
  const snapshot = {
    calendar: { rows: [{ ticker: 'TER', date: '2026-10-27' }, { ticker: 'TDC', date: '2026-11-05' }, { ticker: 'ZZZZ', date: '2026-11-06' }, { ticker: 'TER', date: '2027-01-01' }] },
    pack: { entries: { 'TER|2026-10-27': full, 'TER|2026-10-29': full, 'TDC|2026-11-05': full, 'ZZZZ|2026-11-06': full, 'TER|2026-07-27': full } },
  };
  const report = auditSnapshot(snapshot, '2026-10-26');
  assert.equal(report.rows, 3);
  assert.equal(report.checks.length, 4, '가까운 날짜 글도 모두 대조');
  assert.equal(report.mismatches.length, 2);
  assert.equal(report.unchecked.length, 1);
  assert.equal(report.complete, false);
  assert.deepEqual(report.invalidateTickers, ['TER']);
  const dateFromReport = auditSnapshot({ calendar: { rows: [{ ticker: 'TER', date: '2026-10-27', dateFrom: '2026-08-27' }] }, pack: { entries: { 'TER|2026-08-27': full } } }, '2026-10-26');
  assert.equal(dateFromReport.mismatches.length, 1, '명시적 dateFrom은 30일 밖이어도 출구와 같이 검사');
  assert.throws(() => auditSnapshot({ calendar: { rows: [] }, pack: {} }, '2026-10-26'));
  assert.equal(auditSnapshot({ calendar: { rows: [{ ticker: 'TER', date: '2027-01-01' }] }, pack: { entries: {} } }, '2026-10-26').complete, false, '대상 0건은 전부 일치가 아님');
  await assert.rejects(() => main(['--snapshot', '.env.local']), /environment-file-forbidden/);

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FMP_API_KEY;
  const originalProxyKey = process.env.EC2_REDIS_PROXY_KEY;
  try {
    process.env.FMP_API_KEY = 'offline-fixture';
    process.env.EC2_REDIS_PROXY_KEY = 'offline-fixture';
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.ok(!init?.method || init.method === 'GET', '모든 요청은 GET');
      if (url.pathname === '/get') return Response.json({ result: snapshot.pack });
      assert.equal(url.pathname, '/stable/profile');
      const symbol = url.searchParams.get('symbol');
      return Response.json([{ symbol, companyName: 'New Company Inc.', sector: 'Industrials', industry: 'Test equipment' }]);
    };
    const companies = await readBriefCompanies(['TER', 'TDC', 'NEW'], { profiles: {} });
    assert.equal(calls, 1, '고정 업종 있는 TER/TDC는 공급사 호출 불필요');
    assert.equal(companies.NEW!.name, 'New Company Inc.');
    assert.equal(companies.NEW!.industry, 'Test equipment');
    const reader = cacheReader('ec2');
    assert.deepEqual(await reader.get('earnings:brief:v3'), snapshot.pack);
    await assert.rejects(() => reader.get('arbitrary:private:key'), /read-key-not-allowed/);
    globalThis.fetch = async () => { throw new Error('sensitive-url-must-not-escape'); };
    await assert.rejects(() => reader.get('earnings:brief:v3'), /^Error: read-only-cache-get-failed$/);
    const failed = await readBriefCompanies(['NEW'], { profiles: {} });
    assert.equal(failed.NEW, null);
    globalThis.fetch = async () => Response.json([{ symbol: 'OTHER', companyName: 'Wrong Company', sector: 'Technology' }]);
    assert.equal((await readBriefCompanies(['NEW'], { profiles: {} })).NEW, null, '공급사 symbol 불일치 거절');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.FMP_API_KEY; else process.env.FMP_API_KEY = originalKey;
    if (originalProxyKey === undefined) delete process.env.EC2_REDIS_PROXY_KEY; else process.env.EC2_REDIS_PROXY_KEY = originalProxyKey;
  }
  console.log('회사 정식명·TER/TDC 혼동 반례·전체 무효화·2주 저장본 대조·GET 전용 점검 통과');
})().catch((error) => { console.error(error); process.exitCode = 1; });
