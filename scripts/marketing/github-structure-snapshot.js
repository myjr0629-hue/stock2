#!/usr/bin/env node
// 옵션 시장 구조 일일 스냅샷 생성기 — GitHub 저장소 options-market-structure-daily 용 (t104)
// 공개 API 의 «파생 지표»만 담는다(시세·체인 재배포 금지). 출력: <outDir>/<YYYY-MM-DD>.json + README 표 조각.
// 사용: node scripts/marketing/github-structure-snapshot.js [outDir=/tmp/ego/gh/repo] [dateET — 주면 «마지막 정규장 날짜»와 같아야 한다]
'use strict';
const fs = require('fs'); const path = require('path');
const TICKERS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'AMD', 'GOOGL', 'NFLX', 'AVGO'];
const BASE = 'https://www.signumhq.com/api/live/options/structure?t=';
const outDir = process.argv[2] || '/tmp/ego/gh/repo';
// ★2026-09-27 날짜를 «지금 UTC − 4시간»으로만 정해 공개 데이터셋에 토요일 파일(2026-09-19.json — 내용은 금요일 9/18 값)이
//   올라갔다. 이제 달력으로 판정한다: 마지막 정규장 마감 ~ 다음 거래일 04:00 ET 사이에만, 그 거래일 날짜로만 찍는다.
//   지난 거래일은 지금 API 값으로 재구성할 수 없다(값이 그 뒤 세션 것) — 빠진 날은 빈칸으로 둔다.
const cal = require('../lib/us-market-calendar');
const win = cal.snapshotWindow(Date.now());
if (!win.ok) { console.error('⛔ 스냅샷 창 밖: ' + win.reason); process.exit(2); }
if (process.argv[3] && process.argv[3] !== win.ymd) { console.error(`⛔ 지정한 날짜 ${process.argv[3]} ≠ 마지막 정규장 ${win.ymd} — 지난 날·휴장일 파일은 만들지 않는다(빈칸으로 둔다)`); process.exit(2); }
const dateET = win.ymd;
(async () => {
  const out = { snapshotDateET: dateET, takenAt: new Date().toISOString(), source: 'Derived metrics from the SIGNUM HQ app (signumhq.com). Not quotes, not advice. CC BY 4.0.', fields: { ageSec: 'age of the app value in seconds when the snapshot was taken (0 = freshly computed)', expiration: 'expiration the levels refer to', spot: 'reference price at snapshot time (session shown)', maxPain: 'strike where total option-holder value is minimized at expiration', netGex: 'net dealer gamma exposure (USD per 1% move); positive = dealers net long gamma', gammaFlip: 'spot level where net GEX changes sign', callWall: 'strike with the largest call open interest', putFloor: 'strike with the largest put open interest', pinZone: 'strike with the heaviest combined open interest', putCallRatio: 'put/call open-interest ratio' }, tickers: {} };
  let ok = 0;
  for (const t of TICKERS) { try { const r = await fetch(BASE + t, { headers: { 'User-Agent': 'Mozilla/5.0 (SIGNUM snapshot)' }, signal: AbortSignal.timeout(60000) }); const j = await r.json(); const d = j.data || j; if (d && d.maxPain != null) ok++; // ★2026-09-25: 값의 나이를 싣는다 — 옵션 구조 API 가 조용한 종목에 몇 시간 전 사본을 주던 결함(fix/structure-lastgood-age)을 데이터셋이 «오늘 값»으로 굳히지 않게
      const ageSec = Number(d._staleSec ?? d._redisAgeSec ?? 0) || 0; if (ageSec > 900) console.log(`⚠ ${t}: ${ageSec}s 된 값(세션 ${d.session}) — 스냅샷에 ageSec 로 표시`);
      out.tickers[t] = { ageSec, expiration: d.expiration, session: d.session, spot: d.underlyingPrice, maxPain: d.maxPain, netGex: Number.isFinite(d.netGex) ? Math.round(d.netGex) : null, gammaFlip: d.gammaFlipLevel, callWall: d.levels && d.levels.callWall, putFloor: d.levels && d.levels.putFloor, pinZone: d.levels && d.levels.pinZone, putCallRatio: d.pcr }; } catch (e) { out.tickers[t] = { error: String(e.message).slice(0, 60) }; } }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${dateET}.json`); fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const rows = TICKERS.map((t) => { const x = out.tickers[t]; return x.maxPain != null ? `| ${t} | ${x.spot} | ${x.maxPain} | ${x.gammaFlip} | ${x.callWall} | ${x.putFloor} | ${x.netGex} |` : `| ${t} | — | — | — | — | — | — |`; });
  const table = [`### ${dateET}`, '', '| Ticker | Spot | Max pain | Gamma flip | Call wall | Put floor | Net GEX |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
  fs.writeFileSync(path.join(outDir, `${dateET}.md`), table + '\n');
  console.log(`snapshot ${dateET}: ${ok}/${TICKERS.length} ok → ${file} (+ .md table). Upload both to github.com/myjr0629-hue/options-market-structure-daily via the web upload page (no push token on this machine).`);
})().catch((e) => { console.error('snapshot failed:', e.message); process.exit(1); });
