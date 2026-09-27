#!/usr/bin/env node
/* ============================================================================
 * congress-dataset — 미국 의회 주식 거래(STOCK Act 공시) 90일치를 «공개 데이터셋 페이지»로 만든다.
 *
 * ★2026-09-23 확장: 의회 거래는 사람 이름이 붙은 데이터라 검색 수요가 크다(«congress stock trades»,
 *   «Pelosi stock tracker» …). 우리 웹을 건드리지 않고(라이브 웹 변경 = 실화면 검증 필요) 이미 켜져 있는
 *   GitHub Pages 데이터셋 사이트(options-market-structure-daily)에 «페이지 하나»로 얹는다.
 *   schema.org Dataset JSON-LD + distribution(CSV·JSON) → 구글 데이터셋 검색·일반 검색 대상.
 *
 * 원자료: 우리 API /api/flow/congress (상원 eFD·하원 Clerk 공시를 벤더가 모은 것). 행마다 공식 공시 링크를 싣는다.
 * ⚠ 같은 의원이 다른 표기로 온다(«Scott Mr Franklin»/«Scott Franklin») → 여기서도 personKey 로 묶어
 *   «서로 다른 의원 수»를 센다(앱 쪽 수리는 fix/congress-person-key 브랜치, 운영 반영 대기).
 * ⚠ 종목별 상세는 API 가 기본 40건까지만 준다 → limit=1000 으로 전부 받고, 받은 행 수가 매수+매도와 같은지 본다.
 *   API 가 «전부»라고 답하지 않으면(complete≠true) 부분집합 표기로 쓴다 — 전체가 아니면 전체라고 쓰지 않는다.
 *
 * 사용: node scripts/congress-dataset.mjs [--out /tmp/ego/gh] [--deployment <프리뷰 URL>]
 *   → congress-trades-90d.csv · congress-by-ticker-90d.json · congress.html · 의원별 페이지
 *   → 그다음 scripts/github-upload.mjs 로 올린다(/tmp/ego/gh-task.json).
 *   --deployment: 운영 대신 프리뷰 배포를 읽는다(`vercel curl` 이 보호 우회를 붙인다 — 연결된 저장소 폴더에서 실행).
 * ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = argOf('--out') || '/tmp/ego/gh';
const DEPLOYMENT = argOf('--deployment');
const API_PATH = '/api/flow/congress';
const API = 'https://www.signumhq.com' + API_PATH;
const LIMIT = 1000; // API 상한 — 목록·종목 상세 모두 «전부» 달라고 한다
const SITE = 'https://myjr0629-hue.github.io/options-market-structure-daily';
const APP = 'https://signumhq.com/app?from=github_pages';
mkdirSync(OUT, { recursive: true });

const HONORIFIC = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'hon', 'honorable', 'sen', 'senator', 'rep', 'representative']);
const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
function personKey(person, chamber) {
  const toks = String(person || '').toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter((w) => w && !HONORIFIC.has(w));
  while (toks.length > 2 && SUFFIX.has(toks[toks.length - 1])) toks.pop();
  return `${chamber || ''}:${toks.length > 1 ? `${toks[0]} ${toks[toks.length - 1]}` : toks[0] || '-'}`;
}
const execFileP = promisify(execFile);
const getJson = DEPLOYMENT
  ? async (q) => { const { stdout } = await execFileP('vercel', ['curl', API_PATH + q, '--deployment', DEPLOYMENT, '--', '-s', '--fail'], { maxBuffer: 64 << 20 }); return JSON.parse(stdout); }
  : async (q) => { const r = await fetch(API + q, { headers: { 'user-agent': 'signum-dataset/1.0' } }); if (!r.ok) throw new Error(`${r.status} ${API + q}`); return r.json(); };

const list = await getJson(`?days=90&limit=${LIMIT}`);
if (!list.available || !Array.isArray(list.signals) || !list.signals.length) { console.error('⛔ 신호가 비었다 — 발행하지 않는다'); process.exit(1); }
// ★2026-09-27 커버리지를 밝힌다 — 예전 목록 API 는 순매수 추정액(절대값) 상위 60종목만, 종목 상세는 최근 40건만 줬고,
//   원천도 원별 최신 250건뿐이었다. 9/23 판은 «60 tickers · 192 disclosed trades»라고 써서 전체처럼 읽혔는데,
//   같은 창의 종목은 173개(9/27 API count)였고 TKNO 는 68건 중 40건만 실렸다. 게시물 «16명·192건»도 이 부분집합이었다.
//   → API(fix/congress-coverage 이후)가 complete=true 라고 답하고, 여기서 센 것도 맞을 때만 «전체»라고 쓴다.
const tickersTotal = Number.isFinite(list.count) ? list.count : null;
const today = new Date().toISOString().slice(0, 10);
// 창 시작은 API 가 쓴 날을 그대로 쓴다(자정 넘김에 하루 어긋나지 않게). 옛 API 는 windowFrom 이 없다.
const cut = list.windowFrom || new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
// API 의 창 규칙과 같다: 교환(exchange) 제외, 매매일이 있으면 창 시작 이상
const inWindow = (t) => t.side !== 'exchange' && !(t.transactionDate && t.transactionDate < cut);

const rows = [];
const tickers = [];
for (const s of list.signals) {
  const d = await getJson(`?t=${encodeURIComponent(s.ticker)}&days=90&limit=${LIMIT}`);
  const tr = (d.trades || []).filter(inWindow);
  const members = new Set(tr.map((t) => personKey(t.person, t.chamber)));
  // 표시 이름은 호칭(«Mr» 등)을 뺀 표기로 — «Scott Mr Franklin» 이 아니라 «Scott Franklin»
  const clean = (p) => String(p || '').split(/\s+/).filter((w) => !HONORIFIC.has(w.toLowerCase().replace(/[.,]/g, ''))).join(' ');
  const names = [...new Map(tr.map((t) => [personKey(t.person, t.chamber), `${clean(t.person)} (${t.chamber === 'senate' ? 'Senate' : 'House'})`])).values()];
  tickers.push({
    ticker: s.ticker, buys: s.buys, sells: s.sells, net_estimate_usd: Math.round(s.netMid),
    distinct_members: members.size, members: names, last_transaction: s.lastTransaction, last_disclosure: s.lastDisclosure,
    // 종목 상세가 «잘리지 않았다»(complete)고 답하고, 받은 행이 신호의 매수+매도와 정확히 같아야 완전하다.
    // (옛 API 는 complete 필드가 없다 → 개수만 본다)
    rows_complete: d.complete !== false && tr.length === s.buys + s.sells,
  });
  for (const t of tr) rows.push({ ...t, member_key: personKey(t.person, t.chamber) });
  await new Promise((z) => setTimeout(z, 120));
}
rows.sort((a, b) => (a.disclosureDate < b.disclosureDate ? 1 : -1));

// 전체인가 — API 목록이 complete=true(원천을 창 시작까지 받았고 limit 에 안 잘림) + 종목 수 일치 + 종목마다 행 수 일치
const isComplete = list.complete === true && tickersTotal != null && tickers.length === tickersTotal && tickers.every((t) => t.rows_complete);
const incompleteTickers = tickers.filter((t) => !t.rows_complete).map((t) => t.ticker);
const coverage = {
  is_complete: isComplete,
  source_complete: list.complete === true,
  source_fetched_at: list.coverage?.fetchedAt ?? null,
  source_covered_from: list.coverage?.coveredFrom ?? null,
  tickers_in_window: tickersTotal,
  tickers_included: tickers.length,
  selection: isComplete ? 'all tickers with disclosed trades in the window' : 'tickers with the largest absolute estimated net flow',
  per_ticker_row_cap: isComplete ? null : (list.complete === undefined ? 40 : LIMIT),
  all_rows_complete: incompleteTickers.length === 0,
  row_count: rows.length,
};
console.log(`커버리지: ${isComplete ? '✅ 전체' : '⚠ 부분집합'} · 종목 ${tickers.length}/${tickersTotal} · 행 ${rows.length} · 원천 complete=${list.complete} coveredFrom=${coverage.source_covered_from} · 행 모자란 종목 ${incompleteTickers.length}`);

const csvEsc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ['ticker', 'side', 'transactionDate', 'disclosureDate', 'lagDays', 'amountRange', 'amountMid', 'person', 'chamber', 'member_key', 'link'];
writeFileSync(join(OUT, 'congress-trades-90d.csv'), [cols.join(','), ...rows.map((r) => cols.map((c) => csvEsc(r[c])).join(','))].join('\n') + '\n');
writeFileSync(join(OUT, 'congress-by-ticker-90d.json'), JSON.stringify({ generated: today, window_days: 90, window_from: cut, source: 'US Senate eFD and House Clerk periodic transaction reports (STOCK Act), via SIGNUM HQ', note: 'Amounts are disclosed as ranges; net_estimate_usd uses range midpoints. distinct_members merges spelling variants of the same member.', coverage, tickers }, null, 1) + '\n');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtUsd = (n) => `${n < 0 ? '−' : '+'}$${(Math.abs(n) / 1e6).toFixed(2)}M`;
const top = tickers.slice(0, 25);
const memberCount = new Set(rows.map((r) => r.member_key)).size;
// 부분집합이면 «무엇이 빠졌는지»를 문장으로 쓴다(전체면 전체라고 쓴다)
const oldApi = list.complete === undefined;
const subsetWhy = [
  tickersTotal != null && tickers.length < tickersTotal ? `${tickers.length} of the ${tickersTotal} tickers with disclosures in the window (largest estimated net flow)` : null,
  oldApi ? 'at most 40 filings per ticker' : null,
  !oldApi && list.complete !== true ? 'the source feed was not read all the way back to the window start' : null,
  incompleteTickers.length ? `incomplete rows for ${incompleteTickers.slice(0, 20).join(', ')}${incompleteTickers.length > 20 ? ', …' : ''}` : null,
].filter(Boolean);
if (!subsetWhy.length) subsetWhy.push('coverage could not be confirmed');
const scopeLd = isComplete
  ? `Coverage: complete for the window — all ${tickers.length} tickers with disclosed stock trades and all ${rows.length} buys and sells by ${memberCount} members (exchanges excluded).`
  : `Coverage: a subset — ${subsetWhy.join('; ')} — so totals here are not all congressional trades.`;
const ld = {
  '@context': 'https://schema.org/', '@type': 'Dataset',
  name: 'US Congress Stock Trades — last 90 days, per ticker',
  description: `Stock trades disclosed by members of the US Senate and House under the STOCK Act over the last 90 days (window ending ${today}), folded per ticker: number of buys and sells, estimated net dollar flow from the disclosed ranges, number of distinct members (spelling variants of the same member merged), last transaction and last disclosure date. ${scopeLd} Row-level file keeps the transaction date, disclosure date, reporting lag in days, amount range and a link to the official filing. Public records compiled for research; not investment advice.`,
  url: `${SITE}/congress.html`,
  sameAs: 'https://github.com/myjr0629-hue/options-market-structure-daily',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  isAccessibleForFree: true,
  keywords: ['congress stock trades', 'STOCK Act', 'periodic transaction report', 'senate stock trades', 'house stock trades', 'insider trading', 'US stocks'],
  creator: { '@type': 'Organization', name: 'SIGNUM HQ', url: 'https://www.signumhq.com' },
  temporalCoverage: `${cut}/${today}`,
  dateModified: today,
  variableMeasured: ['buys', 'sells', 'net_estimate_usd', 'distinct_members', 'lagDays', 'amountRange'],
  distribution: [
    { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}/congress-trades-90d.csv` },
    { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/congress-by-ticker-90d.json` },
  ],
};
const lead = tickers[0];
let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>US Congress Stock Trades — last 90 days, per ticker (open dataset)</title>
<meta name="description" content="Stock trades disclosed by US senators and representatives in the last 90 days, per ticker: buys, sells, estimated net flow, distinct members and reporting lag. CSV and JSON, CC BY 4.0.">
<link rel="canonical" href="${SITE}/congress.html">
<script type="application/ld+json">
${JSON.stringify(ld, null, 1)}
</script>
<style>
:root{--ink:#10151f;--sub:#5a6577;--line:#e2e6ee;--bg:#fbfbf8;--acc:#0f7b55;--neg:#b4233a}
@media (prefers-color-scheme:dark){:root{--ink:#e9ecf2;--sub:#98a2b3;--line:#263041;--bg:#0c1118;--acc:#34d399;--neg:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:920px;margin:0 auto;padding:40px 16px 64px}
h1{font-size:28px;line-height:1.2;margin:0 0 8px;text-wrap:balance}h2{font-size:19px;margin:34px 0 10px}
p{max-width:68ch}.sub{color:var(--sub)}.num{font-variant-numeric:tabular-nums}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--sub)}.pos{color:var(--acc)}.neg{color:var(--neg)}
a{color:var(--acc)}code{font-size:13px}
</style>
</head>
<body><main>
<h1>US Congress Stock Trades — last 90 days, per ticker</h1>
${isComplete
  ? `<p class="sub">Window ${cut} → ${today} · ${tickers.length} tickers · ${rows.length} trades · ${memberCount} members · updated ${today}</p>
<p class="sub"><b>Coverage:</b> complete for the window — every ticker with a disclosed stock trade and every buy and sell (exchanges excluded), from filings disclosed up to ${esc(String(coverage.source_fetched_at || today).slice(0, 10))}.</p>`
  : `<p class="sub">Window ${cut} → ${today} · ${tickers.length}${tickersTotal ? ` of ${tickersTotal}` : ''} tickers (largest estimated net flow) · ${rows.length} trade rows · updated ${today}</p>
<p class="sub"><b>Coverage:</b> this is a subset — ${esc(subsetWhy.join('; '))}. Do not read the counts as all congressional trades.</p>`}
<p>Members of Congress must report stock trades over $1,000 within 45 days (STOCK Act, 2012), and only as dollar ranges. This page folds the last 90 days of those reports per ticker. Two things the raw tables hide are counted separately: <b>how many different members</b> are behind the filings (one member filing 17 times is one decision), and the <b>reporting lag</b> between the trade and the disclosure.</p>
<p>Largest net flow in this window: <b>${esc(lead.ticker)}</b> — ${lead.buys} buys, ${lead.sells} sells, estimated ${fmtUsd(lead.net_estimate_usd)}, ${lead.distinct_members} member${lead.distinct_members === 1 ? '' : 's'}.</p>
<h2>Top 25 by estimated net flow</h2>
<div class="wrap"><table>
<thead><tr><th>Ticker</th><th>Buys</th><th>Sells</th><th>Net (est.)</th><th>Members</th><th>Last trade</th><th>Last disclosed</th></tr></thead>
<tbody>
${top.map((t) => `<tr><td><b>${esc(t.ticker)}</b></td><td class="num">${t.buys}</td><td class="num">${t.sells}</td><td class="num ${t.net_estimate_usd >= 0 ? 'pos' : 'neg'}">${fmtUsd(t.net_estimate_usd)}</td><td class="num">${t.distinct_members}${t.rows_complete ? '' : '+'}</td><td class="num">${esc(t.last_transaction)}</td><td class="num">${esc(t.last_disclosure)}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="sub">Net is estimated from the midpoints of the disclosed ranges.${incompleteTickers.length ? ' “+” after a member count means not all filings for that ticker were available.' : ''}</p>
<h2>Files</h2>
<p><a href="congress-trades-90d.csv">congress-trades-90d.csv</a> — one row per disclosed trade: ticker, side, transaction date, disclosure date, lag in days, amount range, range midpoint, member, chamber, merged member key, official filing link.<br>
<a href="congress-by-ticker-90d.json">congress-by-ticker-90d.json</a> — the per-ticker summary above, all ${tickers.length} tickers.</p>
<h2>Source and license</h2>
<p>US Senate Electronic Financial Disclosures and US House Clerk periodic transaction reports, compiled by SIGNUM HQ. Data: CC BY 4.0. Public records for research and education — not investment advice, and a disclosure is a record of a past trade, not a signal of future prices.</p>
<p>The same per-ticker view (with options flow and 13F holders next to it) is in the free SIGNUM HQ app for iOS and Android: <a href="${APP}">signumhq.com/app</a>.</p>
</main></body></html>
`;
// ── 의원별 페이지(롱테일 검색 «<의원> stock trades») ──────────────────────────
// ★2026-09-23 확장: 사람 이름으로 찾는 수요를 받는다. 같은 의원의 표기 차이는 member_key 로 합친다.
const slugOf = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).filter((w) => !HONORIFIC.has(w)).join('-');
const byMember = new Map();
for (const r of rows) {
  const k = r.member_key;
  if (!byMember.has(k)) byMember.set(k, { key: k, chamber: r.chamber, names: new Map(), trades: [] });
  const m = byMember.get(k); m.trades.push(r);
  const clean = String(r.person || '').split(/\s+/).filter((w) => !HONORIFIC.has(w.toLowerCase().replace(/[.,]/g, ''))).join(' ');
  m.names.set(clean, (m.names.get(clean) || 0) + 1);
}
const members = [...byMember.values()].map((m) => {
  // 표시 이름: 가장 짧은 표기(중간 이름 없는 쪽) — «David Harold McCormick» 보다 «David McCormick» 이 검색어에 가깝다
  const full = [...m.names.keys()].sort((a, b) => a.length - b.length)[0];
  const parts = full.split(/\s+/); const display = parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : full;
  const buys = m.trades.filter((t) => t.side === 'buy').length, sells = m.trades.filter((t) => t.side === 'sell').length;
  const lags = m.trades.map((t) => t.lagDays).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return { ...m, display, fullName: full, slug: `congress-${slugOf(display)}.html`, buys, sells,
    tickers: [...new Set(m.trades.map((t) => t.ticker))], lagMedian: lags.length ? lags[Math.floor(lags.length / 2)] : null };
}).sort((a, b) => b.trades.length - a.trades.length);
const chamberName = (c) => (c === 'senate' ? 'Senate' : 'House');
for (const m of members) {
  const title = `${m.display} stock trades — last 90 days (${chamberName(m.chamber)} disclosures)`;
  const mld = { '@context': 'https://schema.org/', '@type': 'Dataset', name: title,
    description: `Stock trades disclosed by ${m.fullName} (US ${chamberName(m.chamber)}) under the STOCK Act in the 90 days ending ${today}: ${m.trades.length} trades (${m.buys} buys, ${m.sells} sells) across ${m.tickers.length} tickers${isComplete ? '' : ' in this dataset (a subset of the window\'s filings — there may be more)'}, with transaction date, disclosure date, reporting lag, amount range and official filing link. Public records; not investment advice.`,
    url: `${SITE}/${m.slug}`, isPartOf: `${SITE}/congress.html`, license: 'https://creativecommons.org/licenses/by/4.0/', isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: 'SIGNUM HQ', url: 'https://www.signumhq.com' }, temporalCoverage: `${cut}/${today}`, dateModified: today,
    keywords: [`${m.display} stock trades`, `${m.display} stocks`, 'congress stock trades', 'STOCK Act'] };
  const trs = m.trades.slice().sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1)).map((t) =>
    `<tr><td><b>${esc(t.ticker)}</b></td><td class="${t.side === 'buy' ? 'pos' : 'neg'}">${t.side}</td><td class="num">${esc(t.transactionDate)}</td><td class="num">${esc(t.disclosureDate)}</td><td class="num">${t.lagDays ?? ''}</td><td class="num">${esc(t.amountRange)}</td><td>${t.link ? `<a href="${esc(t.link)}" rel="nofollow">filing</a>` : ''}</td></tr>`).join('\n');
  const page = html.split('<body>')[0].replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(mld.description.slice(0, 300))}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${SITE}/${m.slug}">`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${JSON.stringify(mld, null, 1)}\n</script>`)
    + `<body><main>
<p class="sub"><a href="congress.html">← US Congress stock trades, all members</a></p>
<h1>${esc(m.display)} stock trades — last 90 days</h1>
<p class="sub">US ${chamberName(m.chamber)} · window ${cut} → ${today} · updated ${today}</p>
${isComplete ? '' : `<p class="sub"><b>Coverage:</b> counts here come from a subset of the window's filings (${esc(subsetWhy.join('; '))}) — this member may have more trades.</p>\n`}<p>${esc(m.fullName)} disclosed <b>${m.trades.length}</b> stock trade${m.trades.length === 1 ? '' : 's'}${isComplete ? '' : ' in this dataset'} in this window: ${m.buys} buy${m.buys === 1 ? '' : 's'} and ${m.sells} sell${m.sells === 1 ? '' : 's'} across ${m.tickers.length} ticker${m.tickers.length === 1 ? '' : 's'} (${m.tickers.slice(0, 12).map(esc).join(', ')}${m.tickers.length > 12 ? ', …' : ''}). ${m.lagMedian != null ? `Median time from trade to disclosure: <b>${m.lagMedian} days</b>.` : ''}</p>
<div class="wrap"><table>
<thead><tr><th>Ticker</th><th>Side</th><th>Traded</th><th>Disclosed</th><th>Lag (days)</th><th>Amount range</th><th>Source</th></tr></thead>
<tbody>
${trs}
</tbody></table></div>
<p class="sub">Amounts are disclosed as ranges. A disclosure records a past trade, often weeks late; it is not a signal of future prices and not investment advice. Spelling variants of the same member are merged.</p>
<p>The same per-ticker view — who in Congress traded it, next to options flow and 13F holders — is in the free SIGNUM HQ app for iOS and Android: <a href="${APP}">signumhq.com/app</a>.</p>
</main></body></html>
`;
  writeFileSync(join(OUT, m.slug), page);
}
const memberList = `<h2>By member</h2>\n<p>${members.map((m) => `<a href="${m.slug}">${esc(m.display)}</a> (${chamberName(m.chamber)}, ${m.trades.length})`).join(' · ')}</p>\n`;
html = html.replace('<h2>Files</h2>', memberList + '<h2>Files</h2>');
writeFileSync(join(OUT, 'members.json'), JSON.stringify(members.map((m) => ({ slug: m.slug, display: m.display, chamber: m.chamber, trades: m.trades.length })), null, 1));
writeFileSync(join(OUT, 'congress.html'), html);
console.log(`✅ ${tickers.length} tickers · ${rows.length} rows · 1위 ${lead.ticker} ${lead.buys}/${lead.sells} members ${lead.distinct_members}`);
console.log(['congress-trades-90d.csv', 'congress-by-ticker-90d.json', 'congress.html', ...members.map((m) => m.slug)].map((f) => join(OUT, f)).join('\n'));
console.log(`의원 페이지 ${members.length}개`);
