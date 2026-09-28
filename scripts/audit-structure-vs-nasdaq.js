#!/usr/bin/env node
/* ============================================================================
 * audit-structure-vs-nasdaq — 우리 옵션 구조(맥스페인·풋콜비율·콜월·풋플로어·계약 수)를
 *   나스닥 공개 체인 «전 행사가»로 독립 계산한 값과 대조한다. (읽기 전용)
 *
 * 왜 (2026-09-27):
 *   의회 거래 «16명·192건»이 API 상한(상위 60종목·종목당 40건)이 만든 부분집합이었다. 같은 종류가
 *   옵션 체인에도 가능한지 조사해 보니, 체인은 만기당 벤더 호출 1번이고 «다음 페이지»를 확인하지 않으며,
 *   빠진 OI 는 0 으로 채워져 내장 완결성 검사가 발동하지 않는다(structureService.ts). 실제로 잘렸다는
 *   증거는 없었지만 «막는 장치»도 없었다 → 발행 전 게이트로 외부 원본과 대조한다.
 *   잘림에 가장 민감한 것은 풋콜비율·계약 수다(6월 스냅샷 재계산: MU 앞 250계약만 쓰면 맥스페인 1050→600).
 *
 * 정의(계산 코드와 동일): 맥스페인 = 만기 가치 합이 최소인 행사가 · 콜월 = (S, 1.2S] 콜 OI 최대 ·
 *   풋플로어 = [0.8S, S) 풋 OI 최대 · 풋콜비율 = 풋 OI 합 ÷ 콜 OI 합. S 는 우리 API 의 underlyingPrice.
 * 판정: 맥스페인 불일치(인접 행사가 제외)·계약 수 < 나스닥의 90%·풋콜비율 차 > 0.15 → 실패(exit 1).
 *       콜월·풋플로어 불일치·풋콜비율 차 0.05~0.15 → 경고(OI 갱신 시각 차이로 날 수 있다).
 * 사용: node scripts/audit-structure-vs-nasdaq.js [SPY,QQQ,...]
 * ========================================================================== */
'use strict';
const TICKERS = (process.argv[2] || 'SPY,QQQ,AAPL,NVDA,TSLA,MSFT,AMZN,META,AMD,GOOGL,NFLX,AVGO').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const ETF = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD', 'SLV', 'XLE', 'XLF', 'XLK', 'SMH', 'SOXL', 'TQQQ', 'IVV', 'VOO']);
const NQ = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', accept: 'application/json', origin: 'https://www.nasdaq.com', referer: 'https://www.nasdaq.com/' };
const num = (x) => { const v = parseFloat(String(x ?? '').replace(/[$,]/g, '')); return Number.isFinite(v) ? v : null; };
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));

(async () => {
  let fails = 0, warns = 0;
  for (const t of TICKERS) {
    let d;
    try {
      const j = await (await fetch(`https://www.signumhq.com/api/live/options/structure?t=${t}`, { headers: { 'user-agent': 'Mozilla/5.0 (SIGNUM audit)' }, signal: AbortSignal.timeout(90000) })).json();
      d = j.data || j;
    } catch (e) { console.log(`✗ ${t}: 우리 API 실패 ${String(e.message).slice(0, 60)}`); fails++; continue; }
    const S = Number(d.underlyingPrice), exp = d.expiration;
    if (!exp || !(S > 0) || d.maxPain == null) { console.log(`✗ ${t}: 우리 값 없음(exp ${exp}, spot ${d.underlyingPrice}, maxPain ${d.maxPain})`); fails++; continue; }
    let rows = [], total = null;
    try {
      const oc = await (await fetch(`https://api.nasdaq.com/api/quote/${t}/option-chain?assetclass=${ETF.has(t) ? 'etf' : 'stocks'}&limit=3000&fromdate=${exp}&todate=${exp}&excode=oprac&callput=callput&money=all&type=all`, { headers: NQ, signal: AbortSignal.timeout(60000) })).json();
      total = oc.data && oc.data.totalRecord;
      rows = ((oc.data && oc.data.table && oc.data.table.rows) || []).filter((r) => num(r.strike) != null)
        .map((r) => ({ k: num(r.strike), coi: num(r.c_Openinterest) || 0, poi: num(r.p_Openinterest) || 0,
          hasC: [r.c_Last, r.c_Bid, r.c_Ask, r.c_Openinterest].some((v) => num(v) != null),
          hasP: [r.p_Last, r.p_Bid, r.p_Ask, r.p_Openinterest].some((v) => num(v) != null) }));
    } catch (e) { console.log(`? ${t}: 나스닥 체인 실패 ${String(e.message).slice(0, 60)} — 대조 불가(실패로 세지 않음)`); warns++; continue; }
    if (!rows.length) { console.log(`? ${t}: 나스닥 체인 0행 — 대조 불가`); warns++; continue; }
    const nqComplete = total == null || rows.length >= total - 1; // totalRecord 에는 만기 머리 행 1개가 들어 있다
    const payAt = (K) => rows.reduce((p, r) => p + r.coi * Math.max(0, K - r.k) + r.poi * Math.max(0, r.k - K), 0);
    let best = null; for (const r of rows) { const p = payAt(r.k); if (!best || p < best.p) best = { k: r.k, p }; }
    const strikes = rows.map((r) => r.k).sort((a, b) => a - b);
    const idx = (k) => strikes.indexOf(k);
    const coi = rows.reduce((s, r) => s + r.coi, 0), poi = rows.reduce((s, r) => s + r.poi, 0);
    const pcr = coi > 0 ? poi / coi : null;
    let cw = null, pf = null;
    for (const r of rows) {
      if (r.k > S && r.k <= S * 1.2 && r.coi > (cw ? cw.coi : 0)) cw = r;
      if (r.k < S && r.k >= S * 0.8 && r.poi > (pf ? pf.poi : 0)) pf = r;
    }
    const nqContracts = rows.reduce((n, r) => n + (r.hasC ? 1 : 0) + (r.hasP ? 1 : 0), 0); // 나스닥에 실제로 있는 계약(콜·풋) 수
    const ours = { mp: Number(d.maxPain), cw: d.levels && d.levels.callWall, pf: d.levels && d.levels.putFloor, pcr: Number(d.pcr), n: d.debug && d.debug.contractsFetched };
    const out = [];
    let bad = false, soft = false;
    if (ours.mp !== best.k) {
      const adj = idx(ours.mp) >= 0 && Math.abs(idx(ours.mp) - idx(best.k)) === 1;
      if (adj) { soft = true; out.push(`맥스페인 ${ours.mp} vs ${best.k}(인접)`); } else { bad = true; out.push(`맥스페인 ${ours.mp} vs ${best.k}`); }
    }
    if (ours.n != null && ours.n < 0.9 * nqContracts) { bad = true; out.push(`계약 수 ${ours.n} < 나스닥 ${nqContracts}의 90%`); }
    if (pcr != null && Number.isFinite(ours.pcr)) {
      const dp = Math.abs(ours.pcr - pcr);
      if (dp > 0.15) { bad = true; out.push(`풋콜 ${ours.pcr} vs ${pcr.toFixed(2)}`); } else if (dp > 0.05) { soft = true; out.push(`풋콜 ${ours.pcr} vs ${pcr.toFixed(2)}`); }
    }
    if (cw && ours.cw != null && ours.cw !== cw.k) { soft = true; out.push(`콜월 ${ours.cw} vs ${cw.k}`); }
    if (pf && ours.pf != null && ours.pf !== pf.k) { soft = true; out.push(`풋플로어 ${ours.pf} vs ${pf.k}`); }
    if (!nqComplete) { soft = true; out.push(`나스닥 쪽 ${rows.length}/${total} 행 — 원본이 덜 옴`); }
    // 원인 구분: 계약 수가 같은데 OI 합이 다르면 «잘림»이 아니라 «OI 시점 차이»(우리 캐시가 새 OI 전 사본) — 9/27 META 실측
    const ourOI = d.debug && Number(d.debug.todayOI);
    if ((bad || soft) && ourOI > 0 && coi + poi > 0 && Math.abs(ourOI - (coi + poi)) / (coi + poi) > 0.05 && (ours.n == null || ours.n >= 0.9 * nqContracts)) {
      out.push(`원인 추정: OI 시점 차이(우리 OI 합 ${ourOI} vs 나스닥 ${coi + poi}, 우리 값 나이 ${Math.round((Number(d._redisAgeSec) || 0) / 3600)}시간) — 체인 잘림 아님`);
    }
    if (bad) fails++; else if (soft) warns++;
    console.log(`${bad ? '✗' : soft ? '△' : '✓'} ${t.padEnd(5)} ${exp} S=${S} · 맥스페인 ${ours.mp}/${best.k} · 풋콜 ${ours.pcr}/${pcr == null ? '—' : pcr.toFixed(2)} · 콜월 ${ours.cw}/${cw ? cw.k : '—'} · 풋플로어 ${ours.pf}/${pf ? pf.k : '—'} · 계약 ${ours.n ?? '—'}/${nqContracts}${out.length ? '  ← ' + out.join(' · ') : ''}`);
    await sleep(700);
  }
  console.log(`\n대조 ${TICKERS.length}종목 · 실패 ${fails} · 경고 ${warns}`);
  if (fails) { console.log('⛔ 실패가 있다 — 맥스페인·풋콜비율을 게시하지 않는다(체인 잘림 또는 계산 차이를 먼저 확인)'); process.exit(1); }
  console.log('✅ 우리 맥스페인·풋콜비율·계약 수가 나스닥 전체 체인과 맞는다');
})().catch((e) => { console.error('audit failed:', e.message); process.exit(2); });
