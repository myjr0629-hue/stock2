#!/usr/bin/env node
/**
 * check-earnings-confirmed — «회사가 공지한 실적일 목록»(src/lib/earningsConfirmed.ts)의 근거를 다시 연다 (2026-10-08)
 * ============================================================================
 * 왜 있나: 목록은 «회사 원문을 보고 옮겨 적은 값»이다. 원문이 바뀌었거나(일정 변경), 옮겨 적다 틀렸거나, 링크가 죽었으면 잡아야 한다.
 *
 * 사용:
 *   node scripts/check-earnings-confirmed.mjs              # 근거 주소를 열어 quote 가 그대로 있는지 확인
 *   node scripts/check-earnings-confirmed.mjs --live       # + 운영 /api/market/earnings-calendar 와 대조(날짜·표식)
 *   node scripts/check-earnings-confirmed.mjs --offline    # 네트워크 없이 모양만 검사
 *   node scripts/check-earnings-confirmed.mjs --base https://<프리뷰>  (--live 와 함께 — 보호된 프리뷰는 vercel curl 로 따로)
 *
 * 판정: OK(quote 찾음) · MISSING(열렸는데 quote 없음 — 일정이 바뀌었는지 확인) · UNREACHABLE(봇 차단·시간 초과 — 사람이 열어 확인) · SKIP(PDF 등)
 * 종료 코드: 모양 오류·MISSING 이 하나라도 있으면 1.
 * 키·토큰을 쓰지 않는다(공개 주소만 연다).
 * ============================================================================
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

// 목록은 TS 파일 그대로 읽는다(복사본을 두지 않는다) — ts-node(이미 devDependency)로 불러온다
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node', esModuleInterop: true } });
const lib = require(path.join(ROOT, 'src/lib/earningsConfirmed.ts'));
const { CONFIRMED_EARNINGS, PENDING_EARNINGS } = lib;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const problems = [];
const seen = new Set();
for (const c of CONFIRMED_EARNINGS) {
  const tag = `CONFIRMED ${c.ticker}`;
  if (seen.has(c.ticker)) problems.push(`${tag}: 같은 종목이 두 번 있다`);
  seen.add(c.ticker);
  if (!/^[A-Z][A-Z0-9.]{0,5}$/.test(c.ticker)) problems.push(`${tag}: 티커 모양`);
  if (!YMD.test(c.date)) problems.push(`${tag}: date 모양`);
  if (!['amc', 'bmo', ''].includes(c.hour)) problems.push(`${tag}: hour`);
  if (!/^https:\/\//.test(c.sourceUrl)) problems.push(`${tag}: sourceUrl 은 https`);
  if (c.checkUrl && !/^https:\/\//.test(c.checkUrl)) problems.push(`${tag}: checkUrl 은 https`);
  if (/apikey=|token=|api_key=/i.test(`${c.sourceUrl} ${c.checkUrl || ''}`)) problems.push(`${tag}: 주소에 키/토큰 모양이 있다(공개 저장소)`);
  if (!c.quote || c.quote.length < 8) problems.push(`${tag}: quote 가 비었다`);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(c.verifiedAt)) problems.push(`${tag}: verifiedAt`);
  if (c.announcedOn && !YMD.test(c.announcedOn)) problems.push(`${tag}: announcedOn`);
  if (c.announcedOn && c.date < c.announcedOn) problems.push(`${tag}: 발표일이 공지일보다 앞선다`);
}
for (const p of PENDING_EARNINGS) {
  const tag = `PENDING ${p.ticker}`;
  if (seen.has(p.ticker)) problems.push(`${tag}: CONFIRMED 와 겹친다`);
  if (!YMD.test(p.until)) problems.push(`${tag}: until`);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(p.checkedAt)) problems.push(`${tag}: checkedAt`);
}
console.log(`목록: 회사 공지 ${CONFIRMED_EARNINGS.length}건 · 공지 전 표식 ${PENDING_EARNINGS.length}건 · 모양 오류 ${problems.length}건`);
for (const m of problems) console.log('  ✗', m);

// ── 원문 열기 ─────────────────────────────────────────────────────────────
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'accept-language': 'en-US,en;q=0.9',
};
const norm = (s) => String(s)
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\\//g, '/')
  .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;| | /g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8217;|&rsquo;|’/g, "'")
  .replace(/&#8211;|&ndash;|&#8212;|&mdash;|–|—/g, '-').replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim().toLowerCase();

/** curl 로 연다 — Node fetch 는 야후처럼 응답 헤더가 큰 사이트에서 «headers overflow» 로 죽는다. curl 은 맥·리눅스 기본 도구다 */
function open(url) {
  const sep = '\n__HTTP__';
  // SEC 는 브라우저 흉내를 막고 «누가 읽는지 밝힌» 요청만 받는다(정책)
  const ua = /(^|\.)sec\.gov$/i.test(new URL(url).hostname) ? 'SIGNUM HQ research contact@signumhq.com' : BROWSER_HEADERS['user-agent'];
  try {
    const out = execFileSync('curl', [
      '-s', '-m', '30', '--compressed', '-L', '-A', ua,
      '-H', `Accept: ${BROWSER_HEADERS.accept}`, '-H', `Accept-Language: ${BROWSER_HEADERS['accept-language']}`,
      '-H', 'Upgrade-Insecure-Requests: 1', '-H', 'Sec-Fetch-Dest: document', '-H', 'Sec-Fetch-Mode: navigate', '-H', 'Sec-Fetch-Site: none',
      '-w', `${sep}%{http_code}|%{content_type}`, url,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const i = out.lastIndexOf(sep);
    const [code, ct = ''] = out.slice(i + sep.length).split('|');
    const status = Number(code) || 0;
    if (/pdf|octet-stream/i.test(ct) || url.toLowerCase().endsWith('.pdf')) return { status, skip: 'binary' };
    return { status, text: out.slice(0, i) };
  } catch (e) {
    return { status: 0, err: e?.status === 28 ? 'timeout' : `curl-${e?.status ?? 'error'}` };
  }
}

let missing = 0;
if (!flag('--offline')) {
  console.log('\n근거 열기:');
  for (const c of CONFIRMED_EARNINGS) {
    // sourceUrl(사람이 보는 원문) 먼저, checkUrl(기계가 읽는 사본·피드)도 — 어느 쪽에서든 quote 를 찾으면 OK
    const urls = [...new Set([c.sourceUrl, c.checkUrl].filter(Boolean))];
    let verdict = null, via = urls[0], reachable = 0, lastFail = '', skipped = '';
    for (const url of urls) {
      const r = open(url);
      if (r.skip) { skipped = r.skip; continue; }
      if (r.err || r.status >= 400 || r.status === 0) { lastFail = r.err ? r.err : `http ${r.status}`; continue; }
      reachable += 1;
      if (norm(r.text).includes(norm(c.quote))) { verdict = 'OK'; via = url; break; }
    }
    if (!verdict) verdict = reachable ? 'MISSING' : skipped ? `SKIP(${skipped})` : `UNREACHABLE(${lastFail})`;
    if (verdict === 'MISSING') missing += 1;
    console.log(`  ${verdict.padEnd(24)} ${c.ticker.padEnd(5)} ${c.date} ${c.hour || '  '}  ${via.slice(0, 96)}`);
  }
}

// ── 운영 캘린더와 대조 ────────────────────────────────────────────────────
if (flag('--live')) {
  const base = arg('--base', 'https://www.signumhq.com');
  const r = await fetch(`${base}/api/market/earnings-calendar`, { headers: BROWSER_HEADERS });
  const j = await r.json().catch(() => null);
  console.log(`\n운영 대조(${base}): http ${r.status} · 행 ${j?.rows?.length ?? '?'} · 생성 ${j?.generatedAt ?? '?'} · 덮기 ${JSON.stringify(j?.confirmedOverlay ? { repaired: j.confirmedOverlay.repaired.length, confirmed: j.confirmedOverlay.confirmed, est: j.confirmedOverlay.est } : null)}`);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  let bad = 0;
  for (const c of CONFIRMED_EARNINGS) {
    if (c.date < today) continue;
    const rows = (j?.rows || []).filter((x) => x.ticker === c.ticker);
    const hit = rows.find((x) => x.date === c.date);
    const ok = hit && hit.dateStatus === 'confirmed';
    if (!ok) { bad += 1; console.log(`  ✗ ${c.ticker}: 목록 ${c.date} ↔ 운영 ${rows.map((x) => `${x.date}${x.dateStatus ? '(' + x.dateStatus + ')' : ''}`).join(', ') || '행 없음'}`); }
  }
  console.log(bad ? `  → 어긋남 ${bad}건` : '  → 목록의 모든 항목이 운영 캘린더에 같은 날짜·confirmed 로 나온다');
  if (bad) process.exitCode = 1;
}

if (problems.length || missing) process.exitCode = 1;
