#!/usr/bin/env node
// 읽기 전용: .env* 로드 없음. 공개 캘린더 API는 after()가 쓰기를 예약하므로 호출 금지.
// node scripts/check-earnings-brief-company-identity.cjs --date 2026-10-26 [--store ec2|upstash]
// 오프라인: --snapshot <정제 JSON: {calendar,pack}>. stdout은 회사명·키·판정만 출력.
// 회사 신원은 정적 정식명 표(src/lib/earnings/earningsCompanies.ts)만 쓴다 — 공급사 호출 없음.
// ko/ja 이름 불일치(nameDrift)는 화면 출구가 정식명으로 덮으므로 표시 결함은 아니지만 참고로 낸다.
require('./offline-test-typescript.cjs');
const fs = require('node:fs');
const { briefCompanyFor, checkBriefCompany } = require('../src/lib/earnings/earningsBriefIdentity');
const { daysBetweenYmd } = require('../src/lib/marketCalendar');
const { EARNINGS_BRIEF_KEY } = require('../src/lib/earnings/earningsBrief');
const CALENDAR_KEY = 'market:earnings-calendar:v4';

function calendarForAudit(calendar, date) {
  // 공개 API와 같은 회사 공지 날짜 보정. 서비스의 읽기/생성 함수는 호출하지 않는다.
  const { applyConfirmedEarnings } = require('../src/lib/earningsConfirmed');
  const { earningsCalendarUniverse } = require('../src/services/earningsCalendarService');
  const overlay = applyConfirmedEarnings(calendar.rows, date, { universe: earningsCalendarUniverse() });
  return { ...calendar, rows: overlay.rows, auditOverlay: { repaired: overlay.repaired, added: overlay.added } };
}

function weekWindow(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) throw new Error('invalid-date');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 13);
  return { from, to: d.toISOString().slice(0, 10) };
}

function auditSnapshot(snapshot, date) {
  if (!Array.isArray(snapshot?.calendar?.rows) || !snapshot.calendar.rows.length || !snapshot?.pack?.entries || typeof snapshot.pack.entries !== 'object') throw new Error('stored-calendar-or-brief-unavailable');
  const range = weekWindow(date);
  const rows = snapshot.calendar.rows.filter((r) => r.date >= range.from && r.date <= range.to);
  const checks = [];
  for (const row of rows) {
    const company = briefCompanyFor(row.ticker);
    // 응답의 정확한 키뿐 아니라 날짜 수정 시 붙을 수 있는 모든 ±30일 저장본도 대조한다.
    const entries = Object.entries(snapshot.pack.entries).filter(([key]) => {
      const [ticker, day] = key.split('|');
      const delta = daysBetweenYmd(row.date, day);
      return ticker === row.ticker && (day === row.dateFrom || (delta != null && Math.abs(delta) <= 30));
    });
    if (!entries.length) checks.push({ ticker: row.ticker, date: row.date, status: 'missing-brief', expected: company?.name ?? null });
    for (const [key, entry] of entries) {
      const result = checkBriefCompany(entry, company);
      const nameDrift = company ? ['ko', 'ja'].filter((l) => entry?.[l]?.name && entry[l].name !== company[l]).map((l) => `${l}:${entry[l].name}→${company[l]}`) : [];
      checks.push({ ticker: row.ticker, date: row.date, key, expected: company?.name ?? null, actual: entry?.en?.name ?? null, status: result.ok ? 'match' : result.reason, ...(nameDrift.length ? { nameDrift } : {}) });
    }
  }
  const mismatches = checks.filter((c) => c.status === 'company-name-mismatch' || c.status === 'company-name-missing');
  const unchecked = checks.filter((c) => c.status === 'company-unresolved' || c.status === 'missing-brief');
  return {
    range, calendarGeneratedAt: snapshot.calendar.generatedAt ?? null, briefGeneratedAt: snapshot.pack.generatedAt ?? null,
    rows: rows.length, checks, mismatches, unchecked,
    // 실제 삭제/생성은 운영 세션의 인증된 크론에서만. 이 스크립트는 계획만 산출한다.
    invalidateTickers: [...new Set(mismatches.map((c) => c.ticker))].sort(),
    complete: rows.length > 0 && unchecked.length === 0,
  };
}

function cacheReader(store) {
  const proxyKey = process.env.EC2_REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY;
  const upKey = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const backend = store || (proxyKey ? 'ec2' : 'upstash');
  const base = backend === 'ec2' ? process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081'
    : process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = backend === 'ec2' ? proxyKey : upKey;
  if (!['ec2', 'upstash'].includes(backend) || !base || !token) throw new Error('read-only-cache-credentials-unavailable');
  return { backend, get: async (key) => {
    if (![CALENDAR_KEY, EARNINGS_BRIEF_KEY].includes(key)) throw new Error('read-key-not-allowed');
    const url = new URL(base);
    url.pathname = backend === 'ec2' ? '/get' : `/get/${encodeURIComponent(key)}`;
    if (backend === 'ec2') url.searchParams.set('key', key);
    try {
      const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!res.ok) throw new Error();
      const body = await res.json();
      if (body.error || !Object.hasOwn(body, 'result')) throw new Error();
      return typeof body.result === 'string' ? JSON.parse(body.result) : body.result;
    } catch { throw new Error('read-only-cache-get-failed'); }
  } };
}

async function main(args) {
  const allowed = new Set(['--date', '--store', '--snapshot']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1]) throw new Error('invalid-arguments');
    options[args[i]] = args[i + 1];
  }
  const date = options['--date'] || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const range = weekWindow(date);
  let snapshot, backend;
  if (options['--snapshot']) {
    // 환경 파일을 입력 파일로 지정해도 읽지 않는다.
    if (/^\.env/.test(require('node:path').basename(options['--snapshot'])) || /^\.env/.test(require('node:path').basename(fs.realpathSync(options['--snapshot'])))) throw new Error('environment-file-forbidden');
    snapshot = JSON.parse(fs.readFileSync(options['--snapshot'], 'utf8'));
    backend = 'snapshot';
  } else {
    const reader = cacheReader(options['--store']);
    backend = reader.backend;
    const [calendar, pack] = await Promise.all([reader.get(CALENDAR_KEY), reader.get(EARNINGS_BRIEF_KEY)]);
    if (!Array.isArray(calendar?.rows) || !pack?.entries) throw new Error('stored-calendar-or-brief-unavailable');
    snapshot = { calendar: calendarForAudit(calendar, date), pack };
  }
  const report = { observedAt: new Date().toISOString(), backend, calendarOverlay: snapshot.calendar?.auditOverlay ?? null, ...auditSnapshot(snapshot, date) };
  console.log(JSON.stringify(report, null, 2));
  return report.mismatches.length ? 1 : report.complete ? 0 : 2;
}
module.exports = { weekWindow, auditSnapshot, cacheReader, main };
if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((err) => {
  // 원시 예외에는 인증 URL이 들어갈 수 있어 고정 오류 코드만 출력한다.
  const codes = new Set(['invalid-date', 'invalid-arguments', 'environment-file-forbidden', 'stored-calendar-or-brief-unavailable', 'read-only-cache-credentials-unavailable', 'read-only-cache-get-failed', 'read-key-not-allowed']);
  console.error(JSON.stringify({ complete: false, error: codes.has(err.message) ? err.message : 'audit-failed' }));
  process.exitCode = 2;
});
