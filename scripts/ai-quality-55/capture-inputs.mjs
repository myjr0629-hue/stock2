// 운영 앱 화면이 AI 라우트에 보내는 요청 본문을 그대로 가로채 파일로 저장한다 (읽기 전용 · 평범한 페이지 열기만).
// 사용: node capture-inputs.mjs flow|deep|probe-intel <TICKER...>   /   node capture-inputs.mjs intel
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/Users/eunhoon/Documents/signum-work/research/DIFF-2026-10-12/raw/impl5-inputs';
const BASE = 'https://www.signumhq.com';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAX_WAIT_MS = 90_000;

fs.mkdirSync(OUT, { recursive: true });

// 사용자 식별 정보로 보이는 키 제거(방어용)
const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|token|access_?token|refresh_?token|api_?key|password|email)$/i;
function scrub(v, hits = []) {
  if (Array.isArray(v)) return v.map(x => scrub(x, hits));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      if (SENSITIVE_KEY.test(k)) { hits.push(k); continue; }
      o[k] = scrub(val, hits);
    }
    return o;
  }
  return v;
}

let browser;
async function getBrowser() {
  if (!browser) browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  return browser;
}

async function withPage(fn) {
  const b = await getBrowser();
  const ctx = await b.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrs.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  page.on('pageerror', e => consoleErrs.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  try { return await fn(page, consoleErrs); } finally { await ctx.close().catch(() => {}); }
}

// 한 화면에서 targetPath POST 를 가로챈다. accept(body)=true 인 첫 요청의 본문+응답 저장.
async function captureOne({ url, targetPath, accept, clickAiTab = false, maxWait = MAX_WAIT_MS }) {
  return withPage(async (page, consoleErrs) => {
    const seen = []; // {ts, body, status, ms, resBody}
    const pending = new Map();
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes(targetPath)) {
        let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch {}
        const rec = { t0: Date.now(), body, rawLen: (req.postData() || '').length, status: null, ms: null, resBody: null };
        pending.set(req, rec); seen.push(rec);
      }
    });
    page.on('response', async res => {
      const req = res.request();
      const rec = pending.get(req);
      if (!rec) return;
      rec.status = res.status(); rec.ms = Date.now() - rec.t0;
      const to = new Promise(r => setTimeout(() => r({ _bodyReadTimeout: true }), 20_000));
      try { rec.resBody = await Promise.race([res.json(), to]); } catch (e) { rec.resBody = { _bodyReadError: String(e.message).slice(0, 200) }; }
      rec.done = true;
    });
    page.on('requestfailed', req => { const rec = pending.get(req); if (rec && !rec.done) { rec.failed = req.failure()?.errorText || 'failed'; rec.done = true; } });

    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(e => consoleErrs.push('goto: ' + e.message));
    let clicked = false;
    let good = null;
    while (Date.now() - t0 < maxWait) {
      good = seen.find(r => r.done && r.body && accept(r.body));
      if (good) break;
      // 요청이 하나도 안 나가고 20초가 지나면 AI 탭 후보를 한 번 눌러 본다(광고·구매 버튼은 누르지 않음)
      if (clickAiTab && !clicked && Date.now() - t0 > 20_000 && seen.length === 0) {
        clicked = true;
        const info = await page.evaluate(() => {
          const els = [...document.querySelectorAll('button,[role=tab],a')];
          const bad = /광고|ad\b|watch|구매|purchase|buy|구독|subscribe|upgrade|PRO|결제|무료로|trial|redeem/i;
          const cand = els.find(e => /^\s*AI\s*$/i.test((e.textContent || '').trim()) || /^\s*AI (분석|Analysis)\s*$/i.test((e.textContent || '').trim()));
          if (cand && !bad.test(cand.textContent || '')) { cand.click(); return 'clicked: ' + (cand.textContent || '').trim(); }
          return 'no-candidate: ' + els.map(e => (e.textContent || '').trim()).filter(t => t && t.length < 20).slice(0, 40).join(' | ');
        });
        consoleErrs.push('aiTab: ' + info);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    const result = { good, seen: seen.map(r => ({ status: r.status, ms: r.ms, failed: r.failed || null, mp: r.body?.flowData?.materialPhase ?? r.body?.snapshot?.materialPhase ?? null })), consoleErrs: consoleErrs.slice(-15) };
    if (!good) {
      result.pageText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 1200)).catch(() => '');
    }
    return result;
  });
}

function save(name, obj) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
}

async function doTicker(kind, T) {
  const cfg = kind === 'flow'
    ? { url: `${BASE}/ko/app-view/flow?t=${T}`, targetPath: '/api/flow/ai-analysis', accept: b => b?.flowData?.materialPhase === 'complete', clickAiTab: false, file: `flow-${T}.json` }
    : { url: `${BASE}/ko/app-view/cmd?t=${T}`, targetPath: '/api/command/deep-analysis', accept: b => b?.snapshot?.materialPhase === 'complete', clickAiTab: true, file: `deep-${T}.json` };
  const r = await captureOne(cfg);
  if (r.good) {
    const hits = [];
    const requestBody = scrub(r.good.body, hits);
    save(cfg.file, { ticker: T, requestBody, response: { status: r.good.status, ms: r.good.ms, body: r.good.resBody }, capturedAt: new Date().toISOString(), scrubbedKeys: hits, requestsSeen: r.seen });
    const model = r.good.resBody?.model ?? r.good.resBody?.meta?.model ?? null;
    return `${kind} ${T}: OK status=${r.good.status} ms=${r.good.ms} model=${model} seen=${JSON.stringify(r.seen)}`;
  }
  save(cfg.file.replace('.json', '.FAILED.json'), { ticker: T, failed: true, requestsSeen: r.seen, consoleErrs: r.consoleErrs, pageText: r.pageText, capturedAt: new Date().toISOString() });
  return `${kind} ${T}: FAIL seen=${JSON.stringify(r.seen)} errs=${JSON.stringify(r.consoleErrs.slice(-3))}`;
}

async function runPool(items, worker, conc = 2) {
  const q = [...items]; const outs = [];
  await Promise.all(Array.from({ length: conc }, async () => { while (q.length) { const it = q.shift(); try { const o = await worker(it); console.log(o); outs.push(o); } catch (e) { console.log('ERR', it, e.message); outs.push('ERR ' + it + ' ' + e.message); } } }));
  return outs;
}


// ── 인텔: 섹터 카드를 눌러 /api/intel/perplexity-analysis 요청 본문(stocks)을 가로챈다 ──
const SECTOR_LABELS = ['M7 테크', '반도체 코어', '우주 방산', '클라우드 포트리스', '피지컬 AI', '사이버 쉴드', '전력 매트릭스', '핀테크 펄스', '바이오 펄스', '퀀텀 엣지'];

async function captureSector(label, startIdx) {
  return withPage(async (page, consoleErrs) => {
    const seen = []; const pending = new Map();
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes('/api/intel/perplexity-analysis')) {
        let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch {}
        const rec = { t0: Date.now(), body, status: null, ms: null, resBody: null, done: false };
        pending.set(req, rec); seen.push(rec);
      }
    });
    page.on('response', async res => {
      const rec = pending.get(res.request()); if (!rec) return;
      rec.status = res.status(); rec.ms = Date.now() - rec.t0;
      const to = new Promise(r => setTimeout(() => r({ _bodyReadTimeout: true }), 30_000));
      try { rec.resBody = await Promise.race([res.json(), to]); } catch (e) { rec.resBody = { _bodyReadError: String(e.message).slice(0, 200) }; }
      rec.done = true;
    });
    await page.goto(`${BASE}/ko/app-view/intel`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(e => consoleErrs.push('goto: ' + e.message));
    // 섹터 버튼이 뜨고 하이드레이션이 끝날 때까지 기다린 뒤 누른다. 요청이 안 나가면 8초 간격으로 최대 4번 다시 누른다
    // (동의 오버레이는 건드리지 않는다 — DOM 클릭만).
    const t0 = Date.now(); let clicked = null; let attempts = 0;
    await new Promise(r => setTimeout(r, 12_000));
    while (Date.now() - t0 < 70_000 && attempts < 4 && seen.length === 0) {
      attempts += 1;
      clicked = await page.evaluate((label) => {
        const b = [...document.querySelectorAll('button')].find(e => (e.textContent || '').trim().replace(/^●/, '').startsWith(label));
        if (b) { b.scrollIntoView(); b.click(); return (b.textContent || '').trim().slice(0, 40); }
        return null;
      }, label);
      for (let i = 0; i < 8 && seen.length === 0; i++) await new Promise(r => setTimeout(r, 1000));
    }
    // 요청이 나가고 응답이 끝날 때까지(최대 80초) + 추가 요청 대기 4초
    const t1 = Date.now(); let lastCount = -1, stable = 0;
    while (Date.now() - t1 < 80_000) {
      await new Promise(r => setTimeout(r, 1000));
      const allDone = seen.length > 0 && seen.every(r => r.done);
      if (allDone) { stable = seen.length === lastCount ? stable + 1 : 0; lastCount = seen.length; if (stable >= 4) break; }
    }
    const pageText = seen.length ? undefined : await page.evaluate(() => (document.body?.innerText || '').slice(0, 800)).catch(() => '');
    return { label, clicked, seen, consoleErrs: consoleErrs.slice(-8), pageText };
  });
}

async function doIntel(labels) {
  // 섹터 화면은 시세 갱신마다 요청을 다시 보내고 앞 요청은 취소(abort)된다 → «응답이 끝난 마지막 요청»만 저장한다.
  await runPool(labels.map((label, i) => ({ label, n: i + 1 })), async ({ label, n }) => {
    const r = await captureSector(label);
    const completed = r.seen.filter(rec => rec.body && rec.status !== null && rec.done);
    const rec = completed[completed.length - 1];
    if (!rec) {
      save(`intel-${n}.FAILED.json`, { sectorGuess: label, clicked: r.clicked, requestsSeen: r.seen.length, consoleErrs: r.consoleErrs, pageText: r.pageText });
      return `intel-${n} (${label}): FAIL no completed request (seen=${r.seen.length}, clicked=${r.clicked})`;
    }
    const hits = []; const requestBody = scrub(rec.body, hits);
    const tickers = (requestBody.stocks || []).map(s => s.ticker);
    save(`intel-${n}.json`, { sectorGuess: label, clickedButton: r.clicked, requestBody, response: { status: rec.status, ms: rec.ms, body: rec.resBody }, capturedAt: new Date().toISOString(), scrubbedKeys: hits, tickers, requestsSeen: r.seen.length, completedRequests: completed.length });
    return `intel-${n}.json (${label}): [${tickers.join(',')}] status=${rec.status} ms=${rec.ms} model=${rec.resBody?.meta?.model ?? rec.resBody?.model ?? null} seen=${r.seen.length} completed=${completed.length}`;
  });
}

// ── 합성: 인텔 화면에서 못 얻은 종목은 /api/watchlist/batch 행(realtime)으로 StockData 를 «가능한 필드만» 채운다 ──
async function doSynth(tickers) {
  const stocks = [];
  for (const T of tickers) {
    const res = await fetch(`${BASE}/api/watchlist/batch?tickers=${T}&mode=price`, { headers: { 'user-agent': UA } });
    const j = await res.json();
    const row = (j.results || []).find(r => r.ticker === T) || {};
    const rt = row.realtime || {};
    const v = x => (x === undefined || Number.isNaN(x) ? null : x);
    stocks.push({
      ticker: T, price: v(rt.price) ?? null, changePct: v(rt.changePct) ?? null, gex: v(rt.gex) ?? null, pcr: v(rt.pcr) ?? null,
      gammaRegime: v(rt.gammaRegime) ?? null, netPremium: v(rt.netPremium) ?? null, callWall: v(rt.callWall) ?? null, putFloor: v(rt.putFloor) ?? null,
      maxPain: v(rt.maxPain) ?? null, whaleIndex: v(rt.whaleIndex) ?? null, darkPoolPct: v(rt.darkPoolPct) ?? null, ivSkew: v(rt.ivSkew) ?? null,
      impliedMovePct: v(rt.impliedMovePct) ?? null, squeezeScore: v(rt.squeezeScore) ?? null, contextScore: v(row.alphaSnapshot?.score) ?? null,
    });
    console.log(`synth ${T}: http=${res.status} source=${j.meta?.source} session=${rt.session}`);
  }
  save('intel-synth.json', {
    SYNTHETIC: true,
    note: '인텔 화면 요청 본문이 아니라 /api/watchlist/batch?mode=price 의 realtime 행에서 합성한 StockData. null = 원천에 없음(실제 인텔 화면은 null 대신 0/미측정으로 보낼 수 있음). gammaRegime 은 realtime.gammaRegime 이 있으면 채웠다.',
    reason: '이 종목은 인텔 섹터 화면의 perplexity-analysis 요청(stocks)에 들어 있지 않았다(PLTR: 피지컬 AI 섹터 리포트 keyStocksData 에서 제외 · SPY: 섹터 없음).',
    requestBody: { stocks }, capturedAt: new Date().toISOString(),
  });
}

const [mode, ...args] = process.argv.slice(2);
try {
  if (mode === 'flow' || mode === 'deep') {
    await runPool(args, T => doTicker(mode, T));
  } else if (mode === 'synth') {
    await doSynth(args);
  } else if (mode === 'intel') {
    await doIntel(args.length ? args : SECTOR_LABELS);
  } else {
    console.log('unknown mode', mode);
  }
} finally {
  if (browser) await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
  try { browser?.process()?.kill('SIGKILL'); } catch {}
  process.exit(0);
}
