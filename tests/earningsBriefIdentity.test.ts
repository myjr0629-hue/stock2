// [2026-10-26 TRACKER T30] 실적 관전 포인트 «회사 신원» — 정적 정식명 표·대조·무효화 계획·읽기 전용 점검 스크립트.
import assert from 'node:assert/strict';
import { briefCompanyFor, checkBriefCompany, normalizeBriefCompanyName } from '../src/lib/earnings/earningsBriefIdentity';
import { EARNINGS_COMPANIES } from '../src/lib/earnings/earningsCompanies';
import { briefNeedsFill, briefInvalidationKeys, attachBriefs } from '../src/lib/earnings/earningsBrief';
import { earningsCalendarUniverse } from '../src/services/earningsCalendarService';
const { auditSnapshot, weekWindow, cacheReader, main } = require('../scripts/check-earnings-brief-company-identity.cjs');

(async () => {
  // 1) 표 범위 — 실적 캘린더 유니버스 전 종목(ETF·SPCX 제외)이 정식명·업종을 가진다. 유니버스에 종목을 넣으면 여기서 잡힌다.
  const EXEMPT = new Set(['TLT', 'GLD', 'IEF', 'SHY', 'SPCX']);
  const missing = [...earningsCalendarUniverse()].filter((t) => !EXEMPT.has(t) && !EARNINGS_COMPANIES[t]);
  assert.deepEqual(missing, [], `정식명 표 누락: ${missing.join(',')}`);
  for (const [t, c] of Object.entries(EARNINGS_COMPANIES)) {
    assert.ok(c.en.trim() && c.ko.trim() && c.ja.trim() && c.industry.trim().length >= 5, `${t} 필드 빈칸`);
    assert.notEqual(normalizeBriefCompanyName(c.en), '', t);
  }

  // 2) 운영에서 틀렸던 회사 — 정식명·업종
  const ter = briefCompanyFor('TER')!;
  assert.equal(ter.name, 'Teradyne');
  assert.match(ter.industry, /Semiconductor test/);
  assert.equal(ter.ko, '테라다인');
  assert.equal(ter.ja, 'テラダイン');
  assert.equal(briefCompanyFor('ter')!.name, 'Teradyne', '소문자 티커');
  for (const [t, name] of [['VRT', 'Vertiv'], ['VKTX', 'Viking Therapeutics'], ['S', 'SentinelOne'], ['AI', 'C3.ai'], ['XYZ', 'Block']] as const) {
    assert.equal(briefCompanyFor(t)!.name, name, t);
  }
  assert.equal(briefCompanyFor('ZZZZ'), null, '표에 없는 종목은 null');
  assert.equal(briefCompanyFor('SPCX'), null);

  // 3) 대조 — 정규화(법인 접미사·대소문자·구두점·The)만 동치, 다른 회사·부분 일치·티커는 거절
  assert.equal(checkBriefCompany({ en: { name: 'Teradata' } }, ter).reason, 'company-name-mismatch');
  assert.equal(checkBriefCompany({ en: { name: 'Teradyne Inc.' } }, ter).ok, true);
  assert.equal(checkBriefCompany({ en: { name: 'TERADYNE, INC' } }, ter).ok, true);
  for (const name of ['Teradyne Robotics', 'Teradata / Teradyne', 'TER', 'Teradyne Semiconductor', 'Tera dyne']) {
    assert.equal(checkBriefCompany({ en: { name } }, ter).ok, false, name);
  }
  for (const en of [undefined, {}, { name: '' }, { name: '   ' }]) {
    assert.equal(checkBriefCompany({ en } as any, ter).reason, 'company-name-missing', JSON.stringify(en));
  }
  assert.equal(checkBriefCompany(null, ter).reason, 'company-name-missing');
  assert.equal(checkBriefCompany({ en: { name: 'Anything' } }, null).reason, 'company-unresolved');
  // aka — 운영 저장본의 정상 표기가 오탐으로 지워지지 않는다
  for (const [t, name] of [['VST', 'Vistra Energy'], ['VST', 'Vistra Corp'], ['GOOGL', 'Alphabet (Google)'], ['GOOGL', 'Alphabet Inc.'], ['KO', 'The Coca-Cola Company'],
    ['NVDA', 'NVIDIA Corporation'], ['META', 'Meta Platforms, Inc.'], ['TSM', 'Taiwan Semiconductor Manufacturing Company, Limited'], ['HOOD', 'Robinhood Markets, Inc.'], ['DIS', 'The Walt Disney Company'],
    ['JPM', 'JPMorgan Chase & Co.'], ['PG', 'P&G'], ['MRK', 'Merck & Co., Inc.'], ['RKLB', 'Rocket Lab Corporation'], ['RKLB', 'Rocket Lab USA, Inc.'], ['HON', 'Honeywell Technologies']] as const) {
    assert.equal(checkBriefCompany({ en: { name } }, briefCompanyFor(t)).ok, true, `${t}=${name}`);
  }
  assert.equal(checkBriefCompany({ en: { name: 'Virtus Investment Partners' } }, briefCompanyFor('VRT')).ok, false);
  // 관문 10260403 P1 — 정식명보다 짧은 통칭은 다른 상장사를 통과시킨다(대만 Taiwan Semiconductor Co.·세무 SW Vertex Inc.(VERX))
  for (const [t, name] of [['TSM', 'Taiwan Semiconductor Co., Ltd.'], ['VRTX', 'Vertex, Inc.'], ['VRTX', 'Vertex'], ['MO', 'Philip Morris'], ['PM', 'Philip Morris Companies'],
    ['META', 'Meta Materials'], ['COST', 'Costco Wholesale Industries'], ['GOOGL', 'Google'], ['DE', 'Deere Park']] as const) {
    assert.equal(checkBriefCompany({ en: { name } }, briefCompanyFor(t)).ok, false, `${t}≠${name}`);
  }
  // 짧은 통칭 aka 금지 규칙 자체를 고정 — aka 가 정식명의 앞부분만 잘라 낸 형태면 실패
  for (const [t, c] of Object.entries(EARNINGS_COMPANIES)) for (const a of c.aka ?? []) {
    const na = normalizeBriefCompanyName(a), ne = normalizeBriefCompanyName(c.en);
    assert.ok(!(ne.startsWith(na + ' ') && na.split(' ').length === 1), `${t} aka «${a}» 는 정식명의 짧은 통칭`);
  }
  // 관문 10260403 P2 — 매각·분사가 끝난 사업을 업종 입력에 넣지 않는다
  assert.doesNotMatch(briefCompanyFor('CCI')!.industry, /fiber/i);
  assert.doesNotMatch(briefCompanyFor('OXY')!.industry, /chemical/i);
  assert.doesNotMatch(briefCompanyFor('HON')!.industry, /aerospace/i);
  assert.equal(briefCompanyFor('RKLB')!.name, 'Rocket Lab');
  assert.equal(checkBriefCompany({ en: { name: 'Sprint (T-Mobile)' } }, briefCompanyFor('S')).ok, false);

  // 4) 채우기 판정·무효화 계획
  const full = { ko: { name: '테라도스', watch: '오염 문구' }, en: { name: 'Teradata', watch: 'Wrong company' }, ja: { name: 'テラデータ', watch: '別会社' }, tries: 99 };
  const clean = { ko: { name: '테라다인', watch: '정상' }, en: { name: 'Teradyne', watch: 'Fine' }, ja: { name: 'テラダイン', watch: '正常' } };
  assert.equal(briefNeedsFill(full, 'TER'), true, '완성·tries 상한이어도 회사가 다르면 다시 만든다');
  assert.equal(briefNeedsFill(clean, 'TER'), false);
  assert.equal(briefNeedsFill(full), false, '티커 없이 부르면 예전 규칙(언어 빠짐·tries) 그대로');
  assert.equal(briefNeedsFill({ ...full, tries: 99 }, 'ZZZZ'), false, '표에 없는 종목은 예전 규칙 그대로');
  assert.deepEqual(briefInvalidationKeys({ 'TER|2026-10-27': full, 'TER|2026-10-29': full, 'TER|2026-11-01': clean, 'ZZZZ|2026-11-05': full }),
    ['TER|2026-10-27', 'TER|2026-10-29'], '표에 없는 ZZZZ 는 삭제 근거 없음');
  assert.deepEqual(briefInvalidationKeys({ 'TER|2026-11-01': clean, 'ZZZZ|2026-11-05': full }, ['ter', 'ZZZZ']), ['TER|2026-11-01'], '강제 무효화도 표에 있는 종목만');

  // 5) 출구 — 정식명이 이긴다, 표에 없는 종목은 기존 그대로
  const psx = { ko: { name: '펠리칸 파이프라인', watch: '정제 마진과 가동률' }, en: { name: 'Phillips 66', watch: 'Refining crack spreads' }, ja: { name: 'フィリップス66', watch: '精製マージン' } };
  const att = attachBriefs([{ ticker: 'PSX', date: '2026-10-28', epsEstimate: 1, revenueEstimate: 1e9 }, { ticker: 'ZZZZ', date: '2026-10-28', epsEstimate: 1, revenueEstimate: 1e9 }],
    { entries: { 'PSX|2026-10-28': psx, 'ZZZZ|2026-10-28': { ko: { name: '아무 회사', watch: '표 밖 종목 글' } } } });
  assert.equal(att.rows[0].brief!.ko!.name, '필립스 66', '모델이 지은 ko 이름 대신 정식명');
  assert.equal(att.rows[0].brief!.ko!.watch, '정제 마진과 가동률', '글은 그대로');
  assert.equal(att.rows[1].brief!.ko!.name, '아무 회사', '표에 없는 종목은 기존 그대로(영어 셀 없어도 표시)');
  assert.equal(att.blocked, 0);

  // 6) 읽기 전용 점검 스크립트 — 2주 창·±30일/dateFrom 저장본까지 대조
  assert.deepEqual(weekWindow('2026-10-26'), { from: '2026-10-26', to: '2026-11-08' });
  assert.deepEqual(weekWindow('2026-11-01'), weekWindow('2026-10-26'), '일요일도 같은 ET 달력 주');
  assert.throws(() => weekWindow('2026-02-30'));
  const snapshot = {
    calendar: { rows: [{ ticker: 'TER', date: '2026-10-27' }, { ticker: 'PSX', date: '2026-10-28' }, { ticker: 'ZZZZ', date: '2026-11-06' }, { ticker: 'TER', date: '2027-01-01' }] },
    pack: { entries: { 'TER|2026-10-27': full, 'TER|2026-10-29': full, 'PSX|2026-10-28': psx, 'ZZZZ|2026-11-06': full, 'TER|2026-07-27': full } },
  };
  const report = auditSnapshot(snapshot, '2026-10-26');
  assert.equal(report.rows, 3);
  assert.equal(report.checks.length, 4, '가까운 날짜 글도 모두 대조');
  assert.equal(report.mismatches.length, 2);
  assert.equal(report.unchecked.length, 1, '표에 없는 ZZZZ 는 미검증으로 따로');
  assert.equal(report.complete, false);
  assert.deepEqual(report.invalidateTickers, ['TER']);
  assert.deepEqual(report.checks.find((c: any) => c.ticker === 'PSX').nameDrift, ['ko:펠리칸 파이프라인→필립스 66']);
  const dateFromReport = auditSnapshot({ calendar: { rows: [{ ticker: 'TER', date: '2026-10-27', dateFrom: '2026-08-27' }] }, pack: { entries: { 'TER|2026-08-27': full } } }, '2026-10-26');
  assert.equal(dateFromReport.mismatches.length, 1, '명시적 dateFrom은 30일 밖이어도 출구와 같이 검사');
  assert.throws(() => auditSnapshot({ calendar: { rows: [] }, pack: {} }, '2026-10-26'));
  assert.equal(auditSnapshot({ calendar: { rows: [{ ticker: 'TER', date: '2027-01-01' }] }, pack: { entries: {} } }, '2026-10-26').complete, false, '대상 0건은 전부 일치가 아님');
  await assert.rejects(() => main(['--snapshot', '.env.local']), /environment-file-forbidden/);

  const originalFetch = globalThis.fetch;
  const originalProxyKey = process.env.EC2_REDIS_PROXY_KEY;
  try {
    process.env.EC2_REDIS_PROXY_KEY = 'offline-fixture';
    let calls = 0;
    globalThis.fetch = (async (input: any, init: any) => {
      calls++;
      const url = new URL(String(input));
      assert.ok(!init?.method || init.method === 'GET', '모든 요청은 GET');
      assert.equal(url.pathname, '/get');
      return Response.json({ result: snapshot.pack });
    }) as typeof fetch;
    const reader = cacheReader('ec2');
    assert.deepEqual(await reader.get('earnings:brief:v3'), snapshot.pack);
    assert.equal(calls, 1);
    await assert.rejects(() => reader.get('cmd:data:TER'), /read-key-not-allowed/, '공급사 프로필 키도 읽지 않는다');
    await assert.rejects(() => reader.get('arbitrary:private:key'), /read-key-not-allowed/);
    globalThis.fetch = (async () => { throw new Error('sensitive-url-must-not-escape'); }) as typeof fetch;
    await assert.rejects(() => reader.get('earnings:brief:v3'), /^Error: read-only-cache-get-failed$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProxyKey === undefined) delete process.env.EC2_REDIS_PROXY_KEY; else process.env.EC2_REDIS_PROXY_KEY = originalProxyKey;
  }
  console.log('정식명 표(유니버스 전 종목)·TER/VRT/VKTX/S/AI/XYZ 반례·aka·무효화 계획·출구 정식명·2주 저장본 대조·GET 전용 점검 통과');
})().catch((error) => { console.error(error); process.exitCode = 1; });
