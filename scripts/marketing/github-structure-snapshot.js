#!/usr/bin/env node
// 옵션 시장 구조 일일 스냅샷 생성기 — GitHub 저장소 options-market-structure-daily 용 (t104)
// 공개 API 의 «파생 지표»만 담는다(시세·체인 재배포 금지). 출력: <outDir>/<YYYY-MM-DD>.json + README 표 조각.
// 사용: node scripts/marketing/github-structure-snapshot.js [outDir=/tmp/ego/gh/repo] [dateET]
'use strict';
const fs = require('fs'); const path = require('path');
const TICKERS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'AMD', 'GOOGL', 'NFLX', 'AVGO'];
const BASE = 'https://www.signumhq.com/api/live/options/structure?t=';
const outDir = process.argv[2] || '/tmp/ego/gh/repo';
const dateET = process.argv[3] || new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
(async () => {
  const out = { snapshotDateET: dateET, takenAt: new Date().toISOString(), source: 'Derived metrics from the SIGNUM HQ app (signumhq.com). Not quotes, not advice. CC BY 4.0.', fields: { expiration: 'expiration the levels refer to', spot: 'reference price at snapshot time (session shown)', maxPain: 'strike where total option-holder value is minimized at expiration', netGex: 'net dealer gamma exposure (USD per 1% move); positive = dealers net long gamma', gammaFlip: 'spot level where net GEX changes sign', callWall: 'strike with the largest call open interest', putFloor: 'strike with the largest put open interest', pinZone: 'strike with the heaviest combined open interest', putCallRatio: 'put/call open-interest ratio' }, tickers: {} };
  let ok = 0;
  for (const t of TICKERS) { try { const r = await fetch(BASE + t, { headers: { 'User-Agent': 'Mozilla/5.0 (SIGNUM snapshot)' }, signal: AbortSignal.timeout(60000) }); const j = await r.json(); const d = j.data || j; if (d && d.maxPain != null) ok++; out.tickers[t] = { expiration: d.expiration, session: d.session, spot: d.underlyingPrice, maxPain: d.maxPain, netGex: Number.isFinite(d.netGex) ? Math.round(d.netGex) : null, gammaFlip: d.gammaFlipLevel, callWall: d.levels && d.levels.callWall, putFloor: d.levels && d.levels.putFloor, pinZone: d.levels && d.levels.pinZone, putCallRatio: d.pcr }; } catch (e) { out.tickers[t] = { error: String(e.message).slice(0, 60) }; } }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${dateET}.json`); fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const rows = TICKERS.map((t) => { const x = out.tickers[t]; return x.maxPain != null ? `| ${t} | ${x.spot} | ${x.maxPain} | ${x.gammaFlip} | ${x.callWall} | ${x.putFloor} | ${x.netGex} |` : `| ${t} | — | — | — | — | — | — |`; });
  const table = [`### ${dateET}`, '', '| Ticker | Spot | Max pain | Gamma flip | Call wall | Put floor | Net GEX |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
  fs.writeFileSync(path.join(outDir, `${dateET}.md`), table + '\n');
  console.log(`snapshot ${dateET}: ${ok}/${TICKERS.length} ok → ${file} (+ .md table). Upload both to github.com/myjr0629-hue/options-market-structure-daily via the web upload page (no push token on this machine).`);
})().catch((e) => { console.error('snapshot failed:', e.message); process.exit(1); });
