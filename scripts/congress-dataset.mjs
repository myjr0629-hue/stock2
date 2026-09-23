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
 * ⚠ 종목별 상세는 API 가 최근 40건까지만 준다 → 매수·매도 건수·추정 순매수는 종목 신호(전량)에서,
 *   의원 수는 받은 행에서 센다. 행이 모자라면 rows_complete=false 로 밝힌다.
 *
 * 사용: node scripts/congress-dataset.mjs [--out /tmp/ego/gh]
 *   → congress-trades-90d.csv · congress-by-ticker-90d.json · congress.html
 *   → 그다음 scripts/github-upload.mjs 로 세 파일을 올린다(/tmp/ego/gh-task.json).
 * ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : '/tmp/ego/gh'; })();
const API = 'https://www.signumhq.com/api/flow/congress';
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
const getJson = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'signum-dataset/1.0' } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

const list = await getJson(`${API}?days=90`);
if (!list.available || !Array.isArray(list.signals) || !list.signals.length) { console.error('⛔ 신호가 비었다 — 발행하지 않는다'); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const cut = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

const rows = [];
const tickers = [];
for (const s of list.signals) {
  const d = await getJson(`${API}?t=${encodeURIComponent(s.ticker)}`);
  const tr = (d.trades || []).filter((t) => t.transactionDate && t.transactionDate >= cut && t.side !== 'exchange');
  const members = new Set(tr.map((t) => personKey(t.person, t.chamber)));
  // 표시 이름은 호칭(«Mr» 등)을 뺀 표기로 — «Scott Mr Franklin» 이 아니라 «Scott Franklin»
  const clean = (p) => String(p || '').split(/\s+/).filter((w) => !HONORIFIC.has(w.toLowerCase().replace(/[.,]/g, ''))).join(' ');
  const names = [...new Map(tr.map((t) => [personKey(t.person, t.chamber), `${clean(t.person)} (${t.chamber === 'senate' ? 'Senate' : 'House'})`])).values()];
  tickers.push({
    ticker: s.ticker, buys: s.buys, sells: s.sells, net_estimate_usd: Math.round(s.netMid),
    distinct_members: members.size, members: names, last_transaction: s.lastTransaction, last_disclosure: s.lastDisclosure,
    rows_complete: tr.length >= s.buys + s.sells,
  });
  for (const t of tr) rows.push({ ...t, member_key: personKey(t.person, t.chamber) });
  await new Promise((z) => setTimeout(z, 120));
}
rows.sort((a, b) => (a.disclosureDate < b.disclosureDate ? 1 : -1));

const csvEsc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ['ticker', 'side', 'transactionDate', 'disclosureDate', 'lagDays', 'amountRange', 'amountMid', 'person', 'chamber', 'member_key', 'link'];
writeFileSync(join(OUT, 'congress-trades-90d.csv'), [cols.join(','), ...rows.map((r) => cols.map((c) => csvEsc(r[c])).join(','))].join('\n') + '\n');
writeFileSync(join(OUT, 'congress-by-ticker-90d.json'), JSON.stringify({ generated: today, window_days: 90, source: 'US Senate eFD and House Clerk periodic transaction reports (STOCK Act), via SIGNUM HQ', note: 'Amounts are disclosed as ranges; net_estimate_usd uses range midpoints. distinct_members merges spelling variants of the same member.', tickers }, null, 1) + '\n');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtUsd = (n) => `${n < 0 ? '−' : '+'}$${(Math.abs(n) / 1e6).toFixed(2)}M`;
const top = tickers.slice(0, 25);
const ld = {
  '@context': 'https://schema.org/', '@type': 'Dataset',
  name: 'US Congress Stock Trades — last 90 days, per ticker',
  description: `Stock trades disclosed by members of the US Senate and House under the STOCK Act over the last 90 days (window ending ${today}), folded per ticker: number of buys and sells, estimated net dollar flow from the disclosed ranges, number of distinct members (spelling variants of the same member merged), last transaction and last disclosure date. Row-level file keeps the transaction date, disclosure date, reporting lag in days, amount range and a link to the official filing. Public records compiled for research; not investment advice.`,
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
const html = `<!doctype html>
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
<p class="sub">Window ${cut} → ${today} · ${tickers.length} tickers · ${rows.length} disclosed trades · updated ${today}</p>
<p>Members of Congress must report stock trades over $1,000 within 45 days (STOCK Act, 2012), and only as dollar ranges. This page folds the last 90 days of those reports per ticker. Two things the raw tables hide are counted separately: <b>how many different members</b> are behind the filings (one member filing 17 times is one decision), and the <b>reporting lag</b> between the trade and the disclosure.</p>
<p>Largest net flow in this window: <b>${esc(lead.ticker)}</b> — ${lead.buys} buys, ${lead.sells} sells, estimated ${fmtUsd(lead.net_estimate_usd)}, ${lead.distinct_members} member${lead.distinct_members === 1 ? '' : 's'}.</p>
<h2>Top 25 by estimated net flow</h2>
<div class="wrap"><table>
<thead><tr><th>Ticker</th><th>Buys</th><th>Sells</th><th>Net (est.)</th><th>Members</th><th>Last trade</th><th>Last disclosed</th></tr></thead>
<tbody>
${top.map((t) => `<tr><td><b>${esc(t.ticker)}</b></td><td class="num">${t.buys}</td><td class="num">${t.sells}</td><td class="num ${t.net_estimate_usd >= 0 ? 'pos' : 'neg'}">${fmtUsd(t.net_estimate_usd)}</td><td class="num">${t.distinct_members}${t.rows_complete ? '' : '+'}</td><td class="num">${esc(t.last_transaction)}</td><td class="num">${esc(t.last_disclosure)}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="sub">Net is estimated from the midpoints of the disclosed ranges. “+” after a member count means only the most recent 40 filings for that ticker were available.</p>
<h2>Files</h2>
<p><a href="congress-trades-90d.csv">congress-trades-90d.csv</a> — one row per disclosed trade: ticker, side, transaction date, disclosure date, lag in days, amount range, range midpoint, member, chamber, merged member key, official filing link.<br>
<a href="congress-by-ticker-90d.json">congress-by-ticker-90d.json</a> — the per-ticker summary above, all ${tickers.length} tickers.</p>
<h2>Source and license</h2>
<p>US Senate Electronic Financial Disclosures and US House Clerk periodic transaction reports, compiled by SIGNUM HQ. Data: CC BY 4.0. Public records for research and education — not investment advice, and a disclosure is a record of a past trade, not a signal of future prices.</p>
<p>The same per-ticker view (with options flow and 13F holders next to it) is in the free SIGNUM HQ app for iOS and Android: <a href="${APP}">signumhq.com/app</a>.</p>
</main></body></html>
`;
writeFileSync(join(OUT, 'congress.html'), html);
console.log(`✅ ${tickers.length} tickers · ${rows.length} rows · 1위 ${lead.ticker} ${lead.buys}/${lead.sells} members ${lead.distinct_members}`);
console.log(['congress-trades-90d.csv', 'congress-by-ticker-90d.json', 'congress.html'].map((f) => join(OUT, f)).join('\n'));
