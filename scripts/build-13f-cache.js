// ============================================================================
// 13-F 기관 보유 색인 빌더 — SEC «Form 13F Data Sets» (분기 공개 데이터) 전수 색인
// (2026-10-07 재작성 · 앱 강화 1단계. 이전 판 = Massive/Polygon 피드 3,800쪽 순회 → 9/23 해지·분당 5회 한도로 5쪽만 받아 색인을 소표본으로 덮어썼다)
//
// 원천: https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets  (무료·공개·키 없음, 분기마다 갱신)
//   · 파일 = 제출일 3개월 창의 ZIP (예: 01jun2026-31aug2026_form13f.zip ≈ 100MB, INFOTABLE.tsv 397MB·380만 행). 새 파일은 창이 끝난 뒤 4일~2주 안에 올라온다.
//   · SUBMISSION(제출·기준일) · COVERPAGE(기관 이름·정정 유형) · INFOTABLE(보유: CUSIP·주식수·평가액) — 모두 탭 구분.
//   · 한 분기의 본 제출(기준일 = 분기 말)은 마감(분기 후 45일)이 창 안에 들어와 창이 끝나면 완전하다.
//
// 처리:
//   ① 안내 페이지에서 가장 최근 ZIP 을 찾는다(경로가 바뀐 적 있다: structureddata → datastandardsinnovation — 하드코딩하지 않는다)
//   ② 변경이 없으면(파일명·Last-Modified 같음) 아무것도 하지 않고 끝낸다 → 주 1회 실행해도 실제 쓰기는 분기에 한 번
//   ③ /tmp 로 받아 ZIP 중앙 디렉터리를 읽고 zlib 로 스트리밍 해제(의존성 0)
//   ④ 기준일 = 13F-HR 제출이 가장 많은 PERIODOFREPORT. (기관, 기준일)마다 최신 제출만 — 정정: RESTATEMENT 는 통째 대체, NEW HOLDINGS 는 추가
//   ⑤ 옵션(PUTCALL)·원금(PRN) 제외, (기관, CUSIP) 합산 → CUSIP 역색인. 평가액은 «as-filed 단위 오기재»(천 달러로 적은 기관)를 중앙값 가격으로 바로잡는다
//   ⑥ ★ 저장 거부 가드: 제출 기관·CUSIP·NVDA/AAPL/MSFT 보유 기관 수가 기준 미만이면 아무것도 쓰지 않고 실패로 끝낸다(좋은 색인을 소표본으로 덮지 않는다)
//   ⑦ Upstash REST 파이프라인으로 cache:13f:cusip:{CUSIP}(상위 60 + 정확 집계) · cache:13f:meta 저장. TTL 150일(분기 갱신 + 여유)
//
// 환경변수: UPSTASH_REDIS_REST_URL/TOKEN (또는 KV_REST_API_*) · SEC_USER_AGENT(선택)
// 플래그: DRY=1(계산·출력만, 쓰기 없음) · SRC_ZIP=/경로.zip(내려받지 않고 로컬 파일) · FORCE=1(같은 파일이어도 다시) · EMIT_CUSIPS=/경로.json(보유 기관 수 순 CUSIP 목록)
// 실행: node scripts/build-13f-cache.js   (Lambda signum-13f 와 같은 파일 — exports.handler)
// ============================================================================
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { StringDecoder } = require('string_decoder');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const SEC_PAGE = 'https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets';
const SEC_ORIGIN = 'https://www.sec.gov';
const SEC_UA = process.env.SEC_USER_AGENT || 'SIGNUM HQ admin@signumhq.com';
const DRY = process.env.DRY === '1';
const FORCE = process.env.FORCE === '1';
const SRC_ZIP = process.env.SRC_ZIP || '';
const EMIT_CUSIPS = process.env.EMIT_CUSIPS || '';
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();

const STORE_TOP = 60;                       // CUSIP 마다 저장하는 상위 보유 기관 수(화면은 20)
const TTL_SECONDS = 150 * 86400;            // 분기 갱신 + 여유. (예전 14일은 «주간 재색인» 전제였다 — 이제 분기마다만 쓴다)
const SOURCE_TAG = 'sec-form13f-datasets';

/**
 * 저장 거부 기준 — 정상(2026 Q2): 제출 기관 8,857 · CUSIP 24,558 · NVDA 5,911곳. 기준은 그 «절반 미만»부터 막는다.
 * (9/27·10/4 의 소표본: 5쪽·NVDA 22~24곳 → 전부 걸린다)
 */
const GUARD_DEFAULT = {
  minFilers: 3000,
  minCusips: 10000,
  minHoldings: 1000000,            // (기관, CUSIP) 쌍
  sentinels: { '67066G104': 'NVDA', '037833100': 'AAPL', '594918104': 'MSFT' },
  sentinelMinHolders: 1500,
};
// 시험용 덮어쓰기(GUARD_JSON)는 DRY=1 일 때만 듣는다 — 운영(쓰기) 실행에서는 환경변수로 가드를 낮출 수 없다
const GUARD = DRY && process.env.GUARD_JSON ? { ...GUARD_DEFAULT, ...JSON.parse(process.env.GUARD_JSON) } : GUARD_DEFAULT;

// ───────────────────────── 순수 함수 (tests/sec13fIngest.test.ts) ─────────────────────────

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/** '31-JUL-2026' → '2026-07-31'. 모르는 형식은 null */
function isoDate(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const mm = MONTHS[m[2].toUpperCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

/** 안내 페이지 HTML → 데이터셋 목록(최신 순). 파일명 = DDmonYYYY-DDmonYYYY_form13f.zip (제출일 창) */
function parseDatasetLinks(html) {
  const out = [];
  const re = /href="([^"]*\/(\d{2})([a-z]{3})(\d{4})-(\d{2})([a-z]{3})(\d{4})_form13f\.zip)"/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(String(html || '')))) {
    const file = m[1].split('/').pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const start = `${m[4]}-${MONTHS[m[3].toUpperCase()]}-${m[2]}`;
    const end = `${m[7]}-${MONTHS[m[6].toUpperCase()]}-${m[5]}`;
    out.push({ file, name: file.replace(/_form13f\.zip$/, ''), url: m[1].startsWith('http') ? m[1] : SEC_ORIGIN + m[1], windowStart: start, windowEnd: end });
  }
  return out.sort((a, b) => (a.windowEnd < b.windowEnd ? 1 : a.windowEnd > b.windowEnd ? -1 : 0));
}

/**
 * 기관 이름 정리 — 원본 그대로를 쓰되 잡음만 뺀다.
 *   끝의 «\\AZ»(주 코드)·«\\» · EDGAR 표기 « /DE/ · /MN · /ADV · /CAN/ » · 앞뒤·겹친 공백
 */
function cleanFilerName(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\\+[A-Za-z]{0,3}$/, '').trim();          // …LLC\AZ → …LLC · …AG\ → …AG
  s = s.replace(/\s*\/[A-Za-z]{2,4}\/?$/, '').trim();     //  /DE/ · /MN · /ADV · /CAN/
  s = s.replace(/\s*,\s*$/, '').trim();
  return s;
}

/**
 * 큰 기관의 로고 도메인 — 이름 패턴으로 고른다(CIK 표는 틀렸다: 옛 표는 0000019617 을 Morgan Stanley 로 적었지만 실제는 JPMorgan Chase).
 * 순서 중요 — 먼저 맞는 것이 이긴다. 확실한 것만 둔다(틀린 로고보다 이니셜 칩이 낫다).
 */
const DOMAIN_RULES = [
  [/^VANGUARD\b/i, 'vanguard.com'],
  [/^BLACKROCK\b/i, 'blackrock.com'],
  [/^STATE STREET\b/i, 'statestreet.com'],
  [/^FMR\b|^FIL LTD\b|^FIDELITY\b/i, 'fidelity.com'],
  [/^GEODE CAPITAL\b/i, 'geodecapital.com'],
  [/^MORGAN STANLEY\b/i, 'morganstanley.com'],
  [/^JPMORGAN\b|^J\.?P\.? MORGAN\b/i, 'jpmorgan.com'],
  [/^BANK OF AMERICA\b/i, 'bankofamerica.com'],
  [/^INVESCO\b/i, 'invesco.com'],
  [/^NORGES BANK\b/i, 'nbim.no'],
  [/^GOLDMAN SACHS\b/i, 'goldmansachs.com'],
  [/^NORTHERN TRUST\b/i, 'northerntrust.com'],
  [/^CAPITAL (WORLD|INTERNATIONAL|RESEARCH|GROUP)\b/i, 'capitalgroup.com'],
  [/^CHARLES SCHWAB\b|^SCHWAB\b/i, 'schwab.com'],
  [/^UBS\b/i, 'ubs.com'],
  [/^BANK OF NEW YORK MELLON\b|^BNY\b/i, 'bnymellon.com'],
  [/^ROYAL BANK OF CANADA\b/i, 'rbc.com'],
  [/^WELLINGTON MANAGEMENT\b/i, 'wellington.com'],
  [/^WELLS FARGO\b/i, 'wellsfargo.com'],
  [/^DIMENSIONAL FUND\b/i, 'dimensional.com'],
  [/^AMERIPRISE\b/i, 'ameriprise.com'],
  [/^LEGAL & GENERAL\b/i, 'lgim.com'],
  [/^FRANKLIN RESOURCES\b/i, 'franklintempleton.com'],
  [/^PRICE T ROWE\b|^T\.? ?ROWE PRICE\b/i, 'troweprice.com'],
  [/^NUVEEN\b/i, 'nuveen.com'],
  [/^AMUNDI\b/i, 'amundi.com'],
  [/^DEUTSCHE BANK\b/i, 'db.com'],
  [/^BARCLAYS\b/i, 'barclays.com'],
  [/^MASSACHUSETTS FINANCIAL SERVICES\b/i, 'mfs.com'],
  [/^ALLIANCEBERNSTEIN\b/i, 'alliancebernstein.com'],
  [/^BERKSHIRE HATHAWAY\b/i, 'berkshirehathaway.com'],
  [/^AQR CAPITAL\b/i, 'aqr.com'],
  [/^CITIGROUP\b/i, 'citigroup.com'],
  [/^HSBC\b/i, 'hsbc.com'],
  [/^PRINCIPAL FINANCIAL\b/i, 'principal.com'],
  [/^PNC FINANCIAL\b/i, 'pnc.com'],
  [/^CITADEL ADVISORS\b/i, 'citadel.com'],
  [/^JANE STREET\b/i, 'janestreet.com'],
  [/^D\.? ?E\.? SHAW\b/i, 'deshaw.com'],
  [/^MILLENNIUM MANAGEMENT\b/i, 'mlp.com'],
  [/^TWO SIGMA\b/i, 'twosigma.com'],
  [/^RENAISSANCE TECHNOLOGIES\b/i, 'rentec.com'],
  [/^SUSQUEHANNA\b/i, 'sig.com'],
  [/^BRIDGEWATER\b/i, 'bridgewater.com'],
  [/^POINT72\b/i, 'point72.com'],
  [/^ARK INVESTMENT\b/i, 'ark-invest.com'],
  [/^PIMCO\b|^PACIFIC INVESTMENT MANAGEMENT\b/i, 'pimco.com'],
  [/^DODGE & COX\b/i, 'dodgeandcox.com'],
  [/^JENNISON\b/i, 'jennison.com'],
  [/^VAN ECK\b/i, 'vaneck.com'],
  [/^FIRST TRUST\b/i, 'ftportfolios.com'],
  [/^AMERICAN CENTURY\b/i, 'americancentury.com'],
  [/^NEUBERGER BERMAN\b/i, 'nb.com'],
  [/^SCHRODER\b/i, 'schroders.com'],
  [/^LPL FINANCIAL\b/i, 'lpl.com'],
  [/^RAYMOND JAMES\b/i, 'raymondjames.com'],
];
function domainForFiler(name) {
  const s = String(name || '').trim();
  for (const [re, domain] of DOMAIN_RULES) if (re.test(s)) return domain;
  return null;
}

/** CUSIP 정규화 — 앞뒤 공백 제거·대문자(원본에 «67066g104» 같은 소문자 표기가 있다 — 같은 종목이 둘로 갈려 49곳이 빠졌다). 9자가 아니면 null */
function normalizeCusip(raw) {
  const c = String(raw || '').trim().toUpperCase();
  return c.length === 9 ? c : null;
}

/** 제출 목록에서 기준일 고르기 — 13F-HR(+/A) 제출이 가장 많은 PERIODOFREPORT. 반환 { period:'2026-06-30', raw:'30-JUN-2026', count } */
function chooseReportPeriod(subRows) {
  const counts = new Map();
  for (const s of subRows) {
    if (s.type !== '13F-HR' && s.type !== '13F-HR/A') continue;
    counts.set(s.period, (counts.get(s.period) || 0) + 1);
  }
  let best = null;
  for (const [raw, count] of counts) if (!best || count > best.count) best = { raw, count };
  return best ? { raw: best.raw, period: isoDate(best.raw), count: best.count } : null;
}

/**
 * (기관, 기준일)마다 «지금 유효한 제출들»을 고른다.
 *   · 13F-HR 본 제출 → 그 제출 하나로 시작(같은 기관의 나중 본 제출이 이전을 대체)
 *   · 13F-HR/A RESTATEMENT(또는 유형 미표기) → 통째 대체
 *   · 13F-HR/A NEW HOLDINGS → 유효 목록에 추가. 단, 그 앞에 기준이 되는 제출이 이 데이터에 없으면(원본이 이전 창에 있다) 제외
 * subs: [{acc, cik, type, period(raw), filingDate(raw)}], covers: Map(acc → {amendmentType, name})
 * 반환: { accToCik: Map(acc → cik), filers: Map(cik → {name, filingDate(ISO)}), skippedNewHoldings }
 */
function resolveAccessions(subs, covers, periodRaw) {
  const groups = new Map();
  for (const s of subs) {
    if (s.period !== periodRaw) continue;
    if (s.type !== '13F-HR' && s.type !== '13F-HR/A') continue;
    if (!groups.has(s.cik)) groups.set(s.cik, []);
    groups.get(s.cik).push(s);
  }
  const accToCik = new Map();
  const filers = new Map();
  let skippedNewHoldings = 0;
  for (const [cik, list] of groups) {
    list.sort((a, b) => {
      const da = isoDate(a.filingDate) || '', db = isoDate(b.filingDate) || '';
      return da < db ? -1 : da > db ? 1 : a.acc < b.acc ? -1 : a.acc > b.acc ? 1 : 0;
    });
    let cur = [];
    let hasBase = false;
    for (const s of list) {
      const at = (covers.get(s.acc) || {}).amendmentType || '';
      if (s.type === '13F-HR') { cur = [s]; hasBase = true; }
      else if (at === 'NEW HOLDINGS') { if (hasBase) cur.push(s); else skippedNewHoldings++; }
      else { cur = [s]; hasBase = true; }                 // RESTATEMENT · 유형 없는 정정
    }
    if (!cur.length) continue;
    for (const s of cur) accToCik.set(s.acc, cik);
    const last = cur[cur.length - 1];
    const cv = covers.get(cur[0].acc) || covers.get(last.acc) || {};
    filers.set(cik, { name: cleanFilerName(cv.name) || `CIK ${cik.replace(/^0+/, '')}`, filingDate: isoDate(last.filingDate) });
  }
  return { accToCik, filers, skippedNewHoldings };
}

function median(arr) {
  if (!arr.length) return null;
  const a = Float64Array.from(arr).sort();
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * 한 보유 행의 평가액을 «CUSIP 대표 가격»으로 맞춘다. 주식수를 믿는다(평가액 단위 오기재가 흔하다: 2026 Q2 NVDA 8,863행 중 천 달러로 적은 곳 499곳).
 *   pStar = 그 CUSIP 의 (평가액/주식수) 중앙값(5행 이상일 때). 모르면 null → as-filed 그대로.
 *   r = (행의 가격) / pStar
 *     0.5 ≤ r ≤ 2            정상 — 평가액 = 주식수 × pStar (한 가격으로 통일)
 *     r ≈ 1/1000 · r ≈ 1000  단위 오기재(천 달러·천 배) — 주식수를 믿고 같은 식으로
 *     0.02 < r < 50          어긋남(원인 불명) — 주식수를 믿는다
 *     그 밖                   주식수와 평가액이 크게 어긋나 어느 쪽도 못 믿는다 → 제외(합계를 오염시킨다: 예 NVDA 70억 주로 적은 연기금 1곳)
 */
function reconcileHolding(shares, value, pStar) {
  if (!(shares > 0) || !(value > 0)) return { keep: false, flag: 'invalid' };
  if (!pStar) return { keep: true, marketValue: value, flag: null };
  const r = (value / shares) / pStar;
  if (r >= 0.5 && r <= 2) return { keep: true, marketValue: Math.round(shares * pStar), flag: null };
  if ((r >= 1 / 1250 && r <= 1 / 800) || (r >= 800 && r <= 1250)) return { keep: true, marketValue: Math.round(shares * pStar), flag: 'unit' };
  if (r > 0.02 && r < 50) return { keep: true, marketValue: Math.round(shares * pStar), flag: 'mismatch' };
  return { keep: false, flag: 'inconsistent' };
}

/**
 * CUSIP 하나의 저장 항목을 만든다.
 * holders: [{cik, shares, value}] — (기관, CUSIP) 합산 완료. filers: Map(cik → {name, filingDate})
 * 반환: { entry, stats:{unit, mismatch, inconsistent} } — entry.holders 는 평가액 순 상위 STORE_TOP, 합계는 «전체» 보유 기관 기준
 */
function buildCusipEntry(holders, filers, ctx) {
  const prices = [];
  for (const h of holders) if (h.shares > 0 && h.value > 0) prices.push(h.value / h.shares);
  const pStar = holders.length >= 5 ? median(prices) : null;
  const kept = [];
  const stats = { unit: 0, mismatch: 0, inconsistent: 0 };
  for (const h of holders) {
    const r = reconcileHolding(h.shares, h.value, pStar);
    if (!r.keep) { if (r.flag === 'inconsistent') stats.inconsistent++; continue; }
    if (r.flag === 'unit') stats.unit++; else if (r.flag === 'mismatch') stats.mismatch++;
    kept.push({ cik: h.cik, shares: h.shares, marketValue: r.marketValue });
  }
  kept.sort((a, b) => b.marketValue - a.marketValue || b.shares - a.shares);
  let totalShares = 0, totalValue = 0;
  for (const h of kept) { totalShares += h.shares; totalValue += h.marketValue; }
  const top = kept.slice(0, STORE_TOP).map((h) => {
    const f = filers.get(h.cik) || {};
    return {
      cik: h.cik,
      name: f.name || null,
      domain: domainForFiler(f.name),
      shares: h.shares,
      marketValue: h.marketValue,
      period: ctx.period,
      filingDate: f.filingDate || null,
    };
  });
  return {
    entry: {
      holders: top,
      totalHolders: kept.length,
      totalShares, totalValue,
      period: ctx.period,
      updatedAt: ctx.updatedAt,
      source: SOURCE_TAG,
      dataset: ctx.dataset,
      universeFilers: ctx.universeFilers,
      ...(pStar ? { refPrice: Math.round(pStar * 10000) / 10000 } : {}),
    },
    stats,
  };
}

/** 저장 거부 가드 — 통과하면 { ok:true }, 아니면 { ok:false, failures:[…] } */
function checkGuards(s, guard = GUARD) {
  const failures = [];
  if (!(s.filers >= guard.minFilers)) failures.push(`제출 기관 ${s.filers} < ${guard.minFilers}`);
  if (!(s.cusips >= guard.minCusips)) failures.push(`CUSIP ${s.cusips} < ${guard.minCusips}`);
  if (!(s.holdings >= guard.minHoldings)) failures.push(`보유 행 ${s.holdings} < ${guard.minHoldings}`);
  for (const [cusip, sym] of Object.entries(guard.sentinels)) {
    const n = (s.sentinelHolders || {})[cusip] || 0;
    if (n < guard.sentinelMinHolders) failures.push(`${sym} 보유 기관 ${n} < ${guard.sentinelMinHolders}`);
  }
  if (s.previousPeriod && s.period && s.period < s.previousPeriod) failures.push(`기준일이 거꾸로 간다 ${s.period} < ${s.previousPeriod}`);
  return failures.length ? { ok: false, failures } : { ok: true, failures: [] };
}

// ───────────────────────── ZIP · TSV 스트리밍 (의존성 없음) ─────────────────────────

/** ZIP 중앙 디렉터리 읽기 — 항목: {name, method, compSize, size, localOffset}. zip64 는 지원하지 않는다(이 데이터셋은 4GB 미만) */
function readZipEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('ZIP 끝 레코드(EOCD)를 찾지 못했다 — 파일이 잘렸거나 ZIP 이 아니다');
    const total = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new Error('zip64 는 지원하지 않는다');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const entries = [];
    let p = 0;
    for (let i = 0; i < total; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP 중앙 디렉터리 항목이 깨졌다');
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const unc = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      if (compSize === 0xffffffff || unc === 0xffffffff || localOffset === 0xffffffff) throw new Error('zip64 항목은 지원하지 않는다');
      entries.push({ name: cd.toString('utf8', p + 46, p + 46 + nameLen), method, compSize, size: unc, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally { fs.closeSync(fd); }
}

/** ZIP 항목 하나를 해제 스트림으로 */
function openZipEntry(file, entry) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(30);
  fs.readSync(fd, head, 0, 30, entry.localOffset);
  fs.closeSync(fd);
  if (head.readUInt32LE(0) !== 0x04034b50) throw new Error(`ZIP 로컬 헤더가 깨졌다: ${entry.name}`);
  const dataStart = entry.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const raw = fs.createReadStream(file, { start: dataStart, end: dataStart + entry.compSize - 1, highWaterMark: 1 << 20 });
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`지원하지 않는 압축 방식 ${entry.method}: ${entry.name}`);
  const inflate = zlib.createInflateRaw();
  raw.on('error', (e) => inflate.destroy(e));
  return raw.pipe(inflate);
}

/** 스트림을 줄 단위로(헤더 포함) 돌린다. onLine(line, lineNo) — 줄바꿈 \n(\r 제거) */
async function forEachLine(readable, onLine) {
  const dec = new StringDecoder('utf8');
  let rest = '';
  let n = 0;
  for await (const chunk of readable) {
    const text = rest + dec.write(chunk);
    let start = 0;
    for (;;) {
      const nl = text.indexOf('\n', start);
      if (nl < 0) break;
      let end = nl;
      if (end > start && text.charCodeAt(end - 1) === 13) end--;
      onLine(text.slice(start, end), n++);
      start = nl + 1;
    }
    rest = text.slice(start);
  }
  rest += dec.end();
  if (rest.length) onLine(rest.replace(/\r$/, ''), n++);
}

// ───────────────────────── 네트워크 ─────────────────────────

async function secGet(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': SEC_UA, Accept: '*/*', ...(init.headers || {}) } });
  return res;
}

async function findLatestDataset() {
  const res = await secGet(SEC_PAGE);
  if (!res.ok) throw new Error(`SEC 안내 페이지 HTTP ${res.status}`);
  const list = parseDatasetLinks(await res.text());
  if (!list.length) throw new Error('SEC 안내 페이지에서 *_form13f.zip 링크를 찾지 못했다(페이지 구조가 바뀌었을 수 있다)');
  return list[0];
}

async function headDataset(url) {
  const res = await secGet(url, { method: 'HEAD' });
  if (!res.ok) throw new Error(`데이터셋 HEAD HTTP ${res.status}`);
  return { bytes: Number(res.headers.get('content-length') || 0), lastModified: res.headers.get('last-modified') || null };
}

async function downloadTo(url, dest, expectBytes) {
  const res = await secGet(url);
  if (!res.ok || !res.body) throw new Error(`데이터셋 다운로드 HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  const got = fs.statSync(dest).size;
  if (expectBytes && got !== expectBytes) throw new Error(`다운로드 크기 불일치 ${got} ≠ ${expectBytes}`);
  return got;
}

async function redisPipeline(commands, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${REDIS_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
      });
      if (!res.ok) throw new Error(`Upstash ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
  }
  throw lastErr;
}

async function readMeta() {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await redisPipeline([['GET', 'cache:13f:meta']]);
    const v = r && r[0] && r[0].result;
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

// ───────────────────────── 본 처리 ─────────────────────────

async function mainInner(state, opts = {}) {
  const t0 = Date.now();
  const log = (...a) => console.log(...a);
  const meta = await readMeta();

  // ① 데이터셋 찾기 · ② 변경 없으면 종료
  let ds, head;
  let zipPath = SRC_ZIP;
  if (SRC_ZIP) {
    ds = { file: path.basename(SRC_ZIP), name: path.basename(SRC_ZIP).replace(/_form13f\.zip$/, ''), url: 'file://' + SRC_ZIP, windowStart: null, windowEnd: null };
    head = { bytes: fs.statSync(SRC_ZIP).size, lastModified: null };
  } else {
    ds = await findLatestDataset();
    head = await headDataset(ds.url);
    log(`최신 데이터셋: ${ds.file} (${(head.bytes / 1048576).toFixed(1)}MB, Last-Modified ${head.lastModified})`);
    if (!FORCE && !opts.force && meta && meta.source === SOURCE_TAG && meta.dataset === ds.name && meta.datasetLastModified === head.lastModified && meta.complete) {
      log(`변경 없음 — 이미 색인됨(기준일 ${meta.period}, ${meta.cusipsCached} CUSIP, ${meta.updatedAt}). 쓰기 없이 종료.`);
      return { skipped: true, dataset: ds.name, period: meta.period };
    }
    zipPath = path.join(os.tmpdir(), ds.file);
    log(`내려받는 중 → ${zipPath}`);
    const got = await downloadTo(ds.url, zipPath, head.bytes);
    log(`  ${(got / 1048576).toFixed(1)}MB 완료 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    state.downloaded = zipPath;
  }

  // ③ ZIP
  const entries = readZipEntries(zipPath);
  const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
  for (const need of ['SUBMISSION.tsv', 'COVERPAGE.tsv', 'INFOTABLE.tsv']) if (!byName[need]) throw new Error(`ZIP 안에 ${need} 가 없다: ${entries.map((e) => e.name).join(', ')}`);

  // SUBMISSION: ACCESSION_NUMBER FILING_DATE SUBMISSIONTYPE CIK PERIODOFREPORT
  const subs = [];
  {
    let col = null;
    await forEachLine(openZipEntry(zipPath, byName['SUBMISSION.tsv']), (line, n) => {
      const f = line.split('\t');
      if (n === 0) { col = Object.fromEntries(f.map((h, i) => [h, i])); return; }
      subs.push({ acc: f[col.ACCESSION_NUMBER], filingDate: f[col.FILING_DATE], type: f[col.SUBMISSIONTYPE], cik: f[col.CIK], period: f[col.PERIODOFREPORT] });
    });
  }
  // COVERPAGE: 정정 유형·기관 이름
  const covers = new Map();
  {
    let col = null;
    await forEachLine(openZipEntry(zipPath, byName['COVERPAGE.tsv']), (line, n) => {
      const f = line.split('\t');
      if (n === 0) { col = Object.fromEntries(f.map((h, i) => [h, i])); return; }
      covers.set(f[col.ACCESSION_NUMBER], { amendmentType: f[col.AMENDMENTTYPE] || '', name: f[col.FILINGMANAGER_NAME] || '' });
    });
  }
  log(`제출 ${subs.length}건 · 표지 ${covers.size}건`);

  // ④ 기준일 · 유효 제출
  const per = chooseReportPeriod(subs);
  if (!per || !per.period) throw new Error('기준일을 정하지 못했다');
  const { accToCik, filers, skippedNewHoldings } = resolveAccessions(subs, covers, per.raw);
  log(`기준일 ${per.period} — 13F-HR 제출 ${per.count}건 → 유효 제출 ${accToCik.size}건 · 제출 기관 ${filers.size}곳 (원본 없는 NEW HOLDINGS 정정 ${skippedNewHoldings}건 제외)`);

  // ⑤ INFOTABLE 스캔 → (CUSIP → CIK → {sh,val})
  const byCusip = new Map();
  const issuerOf = new Map();
  let infoRows = 0, kept = 0, pairs = 0;
  {
    let col = null, iAcc = 0, iCusip = 0, iVal = 0, iSh = 0, iType = 0, iPc = 0, iName = 0;
    await forEachLine(openZipEntry(zipPath, byName['INFOTABLE.tsv']), (line, n) => {
      if (n === 0) {
        col = Object.fromEntries(line.split('\t').map((h, i) => [h, i]));
        iAcc = col.ACCESSION_NUMBER; iCusip = col.CUSIP; iVal = col.VALUE; iSh = col.SSHPRNAMT; iType = col.SSHPRNAMTTYPE; iPc = col.PUTCALL; iName = col.NAMEOFISSUER;
        for (const k of ['ACCESSION_NUMBER', 'CUSIP', 'VALUE', 'SSHPRNAMT', 'SSHPRNAMTTYPE', 'PUTCALL']) if (col[k] === undefined) throw new Error(`INFOTABLE 열 ${k} 가 없다 — SEC 형식이 바뀌었다`);
        return;
      }
      infoRows++;
      const f = line.split('\t');
      const cik = accToCik.get(f[iAcc]);
      if (cik === undefined) return;
      if (f[iPc]) return;                         // 옵션(Put/Call) 제외
      if (f[iType] !== 'SH') return;              // 원금(PRN) 제외
      const sh = Number(f[iSh]), val = Number(f[iVal]);
      if (!(sh > 0) || !(val > 0)) return;
      const cusip = normalizeCusip(f[iCusip]);
      if (!cusip) return;
      let m = byCusip.get(cusip);
      if (!m) { m = new Map(); byCusip.set(cusip, m); issuerOf.set(cusip, f[iName]); }
      const cur = m.get(cik);
      if (cur) { cur.sh += sh; cur.val += val; }
      else { m.set(cik, { sh, val }); pairs++; }
      kept++;
    });
  }
  log(`INFOTABLE ${infoRows}행 → 사용 ${kept}행 · (기관, CUSIP) ${pairs}쌍 · CUSIP ${byCusip.size}개 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // ⑥ 가드(쓰기 전)
  const sentinelHolders = {};
  for (const c of Object.keys(GUARD.sentinels)) sentinelHolders[c] = byCusip.has(c) ? byCusip.get(c).size : 0;
  const guard = checkGuards({
    filers: filers.size, cusips: byCusip.size, holdings: pairs, sentinelHolders,
    period: per.period, previousPeriod: meta && meta.source === SOURCE_TAG ? meta.period : null,
  });
  log(`가드: ${guard.ok ? '통과' : '★ 실패 — ' + guard.failures.join(' · ')} (NVDA ${sentinelHolders['67066G104']} · AAPL ${sentinelHolders['037833100']} · MSFT ${sentinelHolders['594918104']})`);
  if (!guard.ok) {
    // 아무것도 쓰지 않는다. 좋은 색인을 소표본으로 덮지 않는 것이 이 가드의 전부다.
    throw new Error(`저장 거부: ${guard.failures.join(' · ')}`);
  }

  // ⑦ 항목 만들기·저장
  const updatedAt = new Date().toISOString();
  const ctx = { period: per.period, updatedAt, dataset: ds.name, universeFilers: filers.size };
  const flags = { unit: 0, mismatch: 0, inconsistent: 0 };
  let batch = [], saved = 0;
  const flush = async () => { if (batch.length && !DRY) { await redisPipeline(batch); } saved += batch.length; batch = []; };
  const emit = [];
  const printed = {};
  for (const [cusip, m] of byCusip) {
    const holders = [];
    for (const [cik, v] of m) holders.push({ cik, shares: v.sh, value: v.val });
    const { entry, stats } = buildCusipEntry(holders, filers, ctx);
    flags.unit += stats.unit; flags.mismatch += stats.mismatch; flags.inconsistent += stats.inconsistent;
    if (EMIT_CUSIPS && entry.totalHolders >= 40) emit.push({ cusip, holders: entry.totalHolders, issuer: issuerOf.get(cusip) });
    if (GUARD.sentinels[cusip]) printed[cusip] = entry;
    batch.push(['SET', `cache:13f:cusip:${cusip}`, JSON.stringify(entry), 'EX', String(TTL_SECONDS)]);
    if (batch.length >= 100) await flush();
  }
  const metaOut = {
    source: SOURCE_TAG, period: per.period, dataset: ds.name, datasetFile: ds.file, datasetBytes: head.bytes, datasetLastModified: head.lastModified,
    windowStart: ds.windowStart, windowEnd: ds.windowEnd,
    filers: filers.size, accessions: accToCik.size, cusipsCached: byCusip.size, uniqueHoldings: pairs, infoRows, usedRows: kept,
    skippedNewHoldings, correctedUnit: flags.unit, mismatchKept: flags.mismatch, droppedInconsistent: flags.inconsistent,
    complete: true, updatedAt, elapsedMs: Date.now() - t0,
  };
  batch.push(['SET', 'cache:13f:meta', JSON.stringify(metaOut), 'EX', String(TTL_SECONDS)]);
  await flush();

  for (const [cusip, sym] of Object.entries(GUARD.sentinels)) {
    const e = printed[cusip];
    if (!e) continue;
    log(`\n${sym}: ${e.totalHolders}곳 · ${(e.totalShares / 1e9).toFixed(3)}B주 · $${(e.totalValue / 1e12).toFixed(3)}T (대표 가격 $${e.refPrice})`);
    e.holders.slice(0, 8).forEach((h, i) => log(`  ${i + 1}. ${h.name} — ${(h.shares / 1e6).toFixed(1)}M주 · $${(h.marketValue / 1e9).toFixed(2)}B`));
  }
  if (EMIT_CUSIPS) { emit.sort((a, b) => b.holders - a.holders); fs.writeFileSync(EMIT_CUSIPS, JSON.stringify(emit)); log(`CUSIP 목록 ${emit.length}건 → ${EMIT_CUSIPS}`); }
  log(`\n${DRY ? '(DRY — Redis 쓰기 없음) ' : '✅ 저장 '}${byCusip.size} CUSIP · 단위 보정 ${flags.unit}행 · 불일치 유지 ${flags.mismatch}행 · 제외 ${flags.inconsistent}행 · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return { ...metaOut, dry: DRY };
}

async function main(opts = {}) {
  const state = { downloaded: null };      // 내려받은 임시 ZIP — 끝나면(실패해도) 지운다(Lambda /tmp 는 컨테이너가 재사용된다)
  try { return await mainInner(state, opts); }
  finally { if (state.downloaded) { try { fs.unlinkSync(state.downloaded); } catch { /* 이미 없음 */ } } }
}

exports.handler = async (event) => {
  const r = await main({ force: !!(event && event.force === true) });      // 수동 호출 {"force":true} = 같은 파일이어도 다시 색인(코드 수정 뒤 한 번)
  return { statusCode: 200, body: JSON.stringify(r) };
};

exports._internals = {
  isoDate, normalizeCusip, parseDatasetLinks, cleanFilerName, domainForFiler, chooseReportPeriod, resolveAccessions,
  median, reconcileHolding, buildCusipEntry, checkGuards, readZipEntries, openZipEntry, forEachLine, GUARD, STORE_TOP, TTL_SECONDS,
};

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
