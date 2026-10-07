#!/usr/bin/env node
// AI 글 숫자 = 화면 숫자 자동 대조 점검기 (앱 강화 T5, 2026-10-07) — 읽기 전용(화면 로드·API GET 만, 로그인·결제·동의 없음).
//
// 무엇을 하나: 앱 화면(폰 390x844, 아이폰/안드로이드 UA + 앱 셸 쿠키 sig_native=1)을 열어
//   ① Flow AI INTEL — 화면이 보내고 받은 /api/flow/ai-analysis 응답 글 ↔ 같은 화면의 현물가·콜 월·풋 플로어·감마 플립·P/C·종합 점수
//   ② Command AI 딥 분석 — /api/command/deep-analysis 응답 글 ↔ 같은 화면의 현물가·콜 월·풋 플로어·감마 플립·P/C
//   ③ Guardian TACTICAL·RLSI·감마 — /api/debug/guardian 응답 글 ↔ 같은 응답의 시장·RLSI·GEX·스퀴즈·참여폭 + 세 언어 사실 일치
//   ④ 모닝브리핑 — 깨진 소수(«+0. 48%») · 예측어
//   를 대조하고, 불일치 건수를 표로 낸다. (점검기는 수리 코드와 정규식을 공유하지 않는다 — 독립 감사.)
//
// 사용:
//   BASE=https://www.signumhq.com TICKERS=NVDA,AAPL,TSLA,SPY LOCALES=ko,ja,en SURFACES=flow,cmd,guardian,brief OUT=./out node scripts/check-ai-vs-screen.mjs
//   프리뷰는 로컬 프록시(pv-proxy-post.mjs)를 띄우고 BASE=http://localhost:8793
// 종료 코드: 불일치가 있으면 1.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
const puppeteer = require('puppeteer');

const BASE = (process.env.BASE || 'https://www.signumhq.com').replace(/\/$/, '');
const OUT = process.env.OUT || join(process.cwd(), 'ai-check-out');
const TICKERS = (process.env.TICKERS || 'NVDA,AAPL,TSLA,SPY').split(',');
const LOCALES = (process.env.LOCALES || 'ko,ja,en').split(',');
const SURFACES = (process.env.SURFACES || 'flow,cmd,guardian,brief').split(',');
const UA_KIND = process.env.UA || 'ios';
const AI_WAIT = Number(process.env.AI_WAIT || 120000);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = new URL(BASE).hostname;
const UA = UA_KIND === 'android'
  ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

// ── 숫자·문장 도구 (점검기 독립 구현) ──────────────────────────────────────────────
const num = (s) => Number(String(s).replace(/[,$%\s]/g, '').replace('−', '-'));
const FORECAST = [
  /\b(?:will|shall)\s+(?:likely\s+|probably\s+)?(?:continue|rise|fall|drop|decline|climb|rally|bounce|reverse|recover|break|push|pull|drive|trigger|accelerate|extend|expand|persist|follow|lead|move|gain|lose|surge|become|remain)\b/i,
  /\b(?:is|are|was|were)\s+(?:expected|likely|poised|set|bound|due|projected|anticipated)\s+to\s+(?!be\b|reflect|represent|indicate|signal|suggest|mean\b)/i,
  /\bhistorically\s+(?:precede|lead|follow|signal)/i, /\bimminent\b/i,
  /(?:[할될질을]\s?것(?:이다|이며|으로|입니다))/, /(?:예상|전망)(?:된다|됩니다)/, /임박/, /분수령/, /반등\s*(?:가능성|기대|예상)/,
  /見込み/, /予想される/, /(?:だろう|でしょう)/, /今後の見通し/,
];
const forecastCount = (t) => String(t || '').split(/(?<=[.!?。])\s*|\n/).filter((s) => !/["“「]|according to|에 따르면|によると/i.test(s) && FORECAST.some((r) => r.test(s))).length;
const levelNums = (text, price) => {
  const out = [];
  const re = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g; let m;
  while ((m = re.exec(text))) {
    const v = num(m[1]); if (!(v >= 0.3 * price && v <= 3 * price)) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (/^\s?(?:[BMKT]\b|million|billion|억|만|億|万|兆|조)/i.test(after)) continue;
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (/(target|목표|目標|SMA|EMA|\bMA\s?\d|\d{2,3}[- ]?(?:day|일|日)|52|EPS|매출|revenue|売上|insider|내부자|インサイダー|premium|프리미엄|プレミアム)[^$]{0,22}$/i.test(before)) continue;
    out.push(v);
  }
  return out;
};
const near = (a, b, tol) => Math.abs(a - b) <= Math.abs(b) * tol;

// ── 브라우저 ────────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent(UA);
  await page.setCookie({ name: 'sig_native', value: '1', domain: host, path: '/' });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem('app-active-ticker'); } catch {}
    const st = document.createElement('style');
    st.textContent = '[role="dialog"][aria-labelledby="app-onboarding-title"]{display:none!important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
  });
  page.__api = [];
  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (/\/api\/(flow\/ai-analysis|command\/deep-analysis)/.test(u) && res.request().method() === 'POST') {
        let body = null; try { body = JSON.parse(await res.text()); } catch {}
        let req = null; try { req = JSON.parse(res.request().postData() || '{}'); } catch {}
        page.__api.push({ url: u, status: res.status(), body, req });
      }
    } catch {}
  });
  return page;
}
const bodyText = (page) => page.evaluate(() => document.body.innerText).catch(() => '');
async function waitFor(page, pred, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(pred).catch(() => false)) return true; await sleep(800); } return false; }
async function clickByText(page, text, sel = 'button') {
  return page.evaluate((tx, s) => {
    const el = [...document.querySelectorAll(s)].find((e) => (e.innerText || '').replace(/\s+/g, ' ').trim().toUpperCase().includes(tx.toUpperCase()));
    if (!el) return false; el.click(); return true;
  }, text, sel);
}
async function waitApi(page, re, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const hit = page.__api.find((a) => re.test(a.url)); if (hit) return hit; await sleep(800); } return null; }

const LBL = {
  call: /(?:콜\s*월|콜월|コール\s?ウォール|Call\s*Wall)\s*[:：]?\s*\$?\s?(\d[\d,.]*)/i,
  put: /(?:풋\s*플로어|풋플로어|プット\s?フロア|Put\s*Floor)\s*[:：]?\s*\$?\s?(\d[\d,.]*)/i,
  flip: /(?:감마\s*플립|ガンマ\s?フリップ|Gamma\s*Flip)\s*[:：]?\s*\$?\s?(\d[\d,.]*)/i,
  spot: /(?:현물|現物|Spot)\s*\$\s?(\d[\d,.]*)/i,
  pc: /\bP\/C\s*(?:압력|Pressure|圧力)?\s*[|:：]?\s*(\d+\.\d{1,3})/i,
  composite: /(?:종합\s*점수|総合スコア|Composite)\s*([+\-−]?\d+)/i,
};
const grab = (text, re) => { const m = text.match(re); return m ? num(m[1]) : null; };

const rows = [];
const add = (r) => { rows.push(r); console.log(`[${r.surface} ${r.ticker || ''} ${r.locale || ''}] ${r.note || ''} 비교 ${r.compared} · 불일치 ${r.mismatches.length}${r.mismatches.length ? ' :: ' + r.mismatches.slice(0, 3).join(' | ') : ''}`); };

// ── ① Flow AI INTEL ─────────────────────────────────────────────────────────────
// 화면(숫자)은 종목당 한 번(ko) 열고, AI 글은 응답의 ko·en·ja 세 벌을 전부 같은 화면 숫자와 대조한다(응답은 3개 언어를 한 덩어리로 준다).
async function checkFlow(tk) {
  const page = await newPage();
  try {
    await page.goto(`${BASE}/ko/app-view/flow?t=${tk}`, { waitUntil: 'domcontentloaded', timeout: 70000 }).catch(() => {});
    await waitFor(page, () => /C\/P RATIO/.test(document.body.innerText), 80000);
    await clickByText(page, 'AI INTEL');
    const api = await waitApi(page, /flow\/ai-analysis/, AI_WAIT);
    await sleep(2500);
    const t = await bodyText(page);
    const screen = { spot: grab(t, LBL.spot), call: grab(t, LBL.call), put: grab(t, LBL.put), flip: grab(t, LBL.flip), pc: grab(t, LBL.pc), composite: grab(t, LBL.composite) };
    const status = api ? api.status : null;
    const b = api?.body;
    if (api && (!b || b.error)) { try { writeFileSync(join(OUT, `api-flow-${tk}.json`), JSON.stringify({ status, resp: b, req: api.req }, null, 1), 'utf8'); } catch {} }
    const note = `응답 ${status ?? '없음'}${b?.error ? ' ' + b.error + (b.reasons ? ' ' + JSON.stringify(b.reasons).slice(0, 300) : '') : ''}${b?.fromCache ? ' (캐시)' : ''}${b?.staleMode ? ' [' + b.staleMode + ']' : ''} · 화면 spot ${screen.spot} call ${screen.call} put ${screen.put} flip ${screen.flip} P/C ${screen.pc} 종합 ${screen.composite}`;
    const textOf = (loc) => (b && b.structuralThesis ? [b.structuralThesis?.[loc], b.repricingCondition?.[loc], ...(b.factorHighlights || []).map((h) => h.insight?.[loc])].filter(Boolean) : []);
    for (const loc of LOCALES) {
      const texts = textOf(loc); const all = texts.join('\n');
      const mism = []; let compared = texts.length;
      if (all && screen.spot) {
        const levels = [screen.spot, screen.call, screen.put, screen.flip].filter((v) => v > 0);
        for (const v of levelNums(all, screen.spot)) { compared++; if (!levels.some((l) => near(v, l, 0.015))) mism.push(`수준 $${v} ∉ 화면 ${levels.join('/')}`); }
        for (const m of all.matchAll(/(?:P\/C|put\/call(?: ratio)?|풋\/?콜(?:\s*비율)?|プット\/?コール(?:比率|比)?)[^0-9\n]{0,10}(\d+\.\d{1,3})(?!\d)(?!\s*%)/gi)) {
          const v = num(m[1]); const after = all.slice(m.index + m[0].length, m.index + m[0].length + 8);
          if (/^\s*(?:미만|이하|이상|未満|以下|以上|[~–-]\s*\d)/.test(after) || /(below|under|above|over|between|범위)/i.test(m[0])) continue;
          compared++; if (screen.pc != null && !near(v, screen.pc, 0.03)) mism.push(`P/C ${v} ≠ 화면 ${screen.pc}`);
        }
        for (const m of all.matchAll(/(?:composite(?: score)?|종합\s*(?:점수)?|総合(?:スコア)?)[^0-9\n+\-−]{0,8}([+\-−]?\d{1,3})(?![\d.%])/gi)) {
          compared++; if (screen.composite != null && Math.abs(num(m[1]) - screen.composite) > 1) mism.push(`종합 ${m[1]} ≠ 화면 ${screen.composite}`);
        }
      }
      const fc = forecastCount(all); if (fc) mism.push(`예측어 문장 ${fc}건`);
      if (!all) mism.push(status === 200 ? 'AI 글 없음' : `AI 글 없음(${status ?? '응답 없음'})`);
      add({ surface: 'flow', ticker: tk, locale: loc, note: loc === LOCALES[0] ? note : '', compared, mismatches: mism, aiStatus: status, screen, sample: all.slice(0, 220) });
    }
    // 세 언어 사실 일치 — 수준($) 집합이 같아야 한다
    if (b?.structuralThesis) {
      const sets = LOCALES.map((l) => new Set(textOf(l).flatMap((x) => levelNums(x, screen.spot || b.basis?.price || 100)).map((v) => v.toFixed(1))));
      const u = new Set(sets.flatMap((x) => [...x])); const mism = [];
      for (const v of u) if (!sets.every((x) => x.has(v))) mism.push(`언어 간 수준 불일치 $${v}`);
      add({ surface: 'flow-3lang', ticker: tk, note: '세 언어가 같은 수준을 쓰는가', compared: u.size, mismatches: mism });
    }
  } finally { await page.close(); }
}

// ── ② Command AI 딥 분석 ─────────────────────────────────────────────────────────
async function checkCmd(tk) {
  const page = await newPage();
  try {
    await page.goto(`${BASE}/ko/app-view/cmd?t=${tk}`, { waitUntil: 'domcontentloaded', timeout: 70000 }).catch(() => {});
    await waitFor(page, () => /Call Wall|콜 월|コールウォール|CALL WALL/i.test(document.body.innerText), 80000);
    const api = await waitApi(page, /command\/deep-analysis/, AI_WAIT);
    await sleep(2500);
    const t = await bodyText(page);
    const px = grab(t, /\$\s?(\d{2,4}\.\d{2})/);
    const screen = { price: px, call: grab(t, LBL.call), put: grab(t, LBL.put), flip: grab(t, LBL.flip) };
    const b = api?.body; const status = api ? api.status : null;
    if (api && (!b || b.error)) { try { writeFileSync(join(OUT, `api-cmd-${tk}.json`), JSON.stringify({ status, resp: b, req: api.req }, null, 1), 'utf8'); } catch {} }
    const note = `응답 ${status ?? '없음'}${b?.error ? ' ' + b.error + (b.reasons ? ' ' + JSON.stringify(b.reasons).slice(0, 300) : '') : ''}${b?.fromCache ? ' (캐시)' : ''}${b?.staleMode ? ' [' + b.staleMode + ']' : ''} · 화면 price ${screen.price} call ${screen.call} put ${screen.put} flip ${screen.flip}`;
    for (const loc of LOCALES) {
      const slots = b && b.currentState ? [b.currentState?.[loc], ...(b.sections || []).map((x) => x.content?.[loc]), b.keyInsight?.[loc]].filter(Boolean) : [];
      const all = slots.join('\n');
      const mism = []; let compared = slots.length;
      if (all && screen.price) {
        const levels = [screen.price, screen.call, screen.put, screen.flip].filter((v) => v > 0);
        const basisLv = [b.basis?.price, b.basis?.callWall, b.basis?.putFloor, b.basis?.maxPain, b.basis?.gammaFlip, ...(b.basis?.extras || [])].filter((v) => v > 0);
        // 화면 수준(현물·콜월·풋플로어·감마플립)과 가깝게 쓴 $수준은 그 값이어야 한다 — 이동평균·목표가 등 재료의 다른 수준은 허용(basis.extras)
        for (const v of levelNums(all, screen.price)) {
          compared++;
          if (!levels.some((l) => near(v, l, 0.015)) && !basisLv.some((l) => near(v, l, 0.015))) mism.push(`수준 $${v} ∉ 화면 ${levels.join('/')} · 재료`);
        }
      }
      const fc = forecastCount(all); if (fc) mism.push(`예측어 문장 ${fc}건`);
      if (!all) mism.push(status === 200 ? 'AI 글 없음' : `AI 글 없음(${status ?? '응답 없음'})`);
      add({ surface: 'cmd', ticker: tk, locale: loc, note: loc === LOCALES[0] ? note : '', compared, mismatches: mism, aiStatus: status, screen, sample: all.slice(0, 220) });
    }
  } finally { await page.close(); }
}

// ── ③ Guardian (API: 같은 응답의 화면 값) ─────────────────────────────────────────
async function getJson(path) { const r = await fetch(`${BASE}${path}`, { headers: { 'user-agent': UA } }); if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); }
const GLIT = [
  ['NDX', /(?:나스닥|NASDAQ|Nasdaq|ナスダック)[^0-9\n.,;。]{0,14}?([+\-−]?\d+\.\d+)\s?%/g, (d) => d.market?.nqChangePercent ?? d.market?.factors?.nasdaq100?.chgPct, 0.06, true],
  ['SPX', /(?:S&P\s?500|S&P)[^0-9\n.,;。]{0,14}?([+\-−]?\d+\.\d+)\s?%/g, (d) => d.market?.factors?.spx?.chgPct, 0.06, true],
  ['GOLD', /(?:금값|\bGold\b|\bgold\b|ゴールド)[^0-9\n.,;。]{0,14}?([+\-−]?\d+\.\d+)\s?%/g, (d) => d.market?.factors?.gold?.chgPct, 0.06, true],
  ['OIL', /(?:유가|원유|WTI|\b[Oo]il\b|原油)[^0-9\n.,;。]{0,14}?([+\-−]?\d+\.\d+)\s?%/g, (d) => d.market?.factors?.oil?.chgPct, 0.06, true],
  ['VIX', /\bVIX[^0-9\n.,;。]{0,10}?(\d+(?:\.\d+)?)(?![\d.,]|\s?%)/g, (d) => d.market?.vix ?? d.market?.factors?.vix?.level, 0.2, false],
  ['RLSI', /\bRLSI[^0-9\n.,;。]{0,10}?(\d+(?:\.\d+)?)(?![\d.,]|\s?%)/g, (d) => d.rlsi?.score, 1.01, false],
  ['GEX', /\bGEX(?:\s?(?:지수|index|指数))?[^0-9\n.,;。]{0,10}?([+\-−]?\d+)(?![\d.,M]|\s?%)/g, (d) => d.gammaShield?.gexIndex, 1.01, false],
  ['SQUEEZE', /(?:[Ss]queeze(?:\s?risk)?|스퀴즈(?:\s?리스크)?|スクイーズ(?:リスク)?)[^0-9\n.,;。]{0,12}?(\d+(?:\.\d+)?)\s?%/g, (d) => d.gammaShield?.squeezeRisk, 1.01, false],
];
async function checkGuardian() {
  const per = {};
  for (const loc of LOCALES) {
    let j; try { j = await getJson(`/api/debug/guardian?force=false&locale=${loc}`); } catch (e) { add({ surface: 'guardian', locale: loc, note: `응답 실패 ${e.message}`, compared: 0, mismatches: [`응답 실패`] }); continue; }
    const d = j.data || j; const v = d.verdict || {};
    const texts = { TACTICAL: v.description, RLSI: v.realityInsight, GAMMA: v.gammaInsight };
    const mism = []; let compared = 0; const found = {};
    for (const [name, text] of Object.entries(texts)) {
      if (!text) continue;
      for (const [key, re, actualFn, tol] of GLIT) {
        const actual = actualFn(d); if (typeof actual !== 'number') continue;
        re.lastIndex = 0; let m;
        while ((m = re.exec(text))) {
          const ctx = text.slice(Math.max(0, m.index - 6), m.index + m[0].length + 12);
          if (/(above|below|over|under|넘|돌파|이상|이하|if |when |なら|超|以下|以上|threshold|임계)/i.test(ctx)) continue;
          const w = num(m[1]); compared++;
          const ok = Math.abs(Math.abs(w) - Math.abs(actual)) <= tol + (/\./.test(m[1]) ? 0 : 0.45);
          (found[`${name}.${key}`] ||= {})[loc] = w;
          if (!ok) mism.push(`${name} ${key} ${m[1]} ≠ 화면 ${Math.round(actual * 100) / 100}`);
        }
      }
      const fc = forecastCount(text); if (fc) mism.push(`${name} 예측어 문장 ${fc}건`);
      compared++;
    }
    per[loc] = found;
    add({ surface: 'guardian', locale: loc, note: `RLSI ${d.rlsi?.score?.toFixed?.(1)} GEX ${d.gammaShield?.gexIndex} 스퀴즈 ${d.gammaShield?.squeezeRisk}`, compared, mismatches: mism, sample: String(v.description || '').slice(0, 160) });
  }
  // 세 언어 사실 일치 — 같은 칸·같은 지표의 글 속 값이 언어끼리 같아야 한다
  const keys = new Set(Object.values(per).flatMap((o) => Object.keys(o)));
  const cross = [];
  for (const k of keys) {
    const vals = LOCALES.map((l) => per[l]?.[k]?.[l]).filter((x) => typeof x === 'number');
    if (vals.length >= 2 && Math.max(...vals) - Math.min(...vals) > 0.06) cross.push(`${k}: ${LOCALES.map((l) => `${l}=${per[l]?.[k]?.[l] ?? '-'}`).join(' ')}`);
  }
  add({ surface: 'guardian-3lang', note: '세 언어 사실 일치(같은 칸·같은 지표 값)', compared: keys.size, mismatches: cross.map((c) => `언어 간 불일치 ${c}`) });
}

// ── ④ 모닝브리핑 ────────────────────────────────────────────────────────────────
async function checkBrief() {
  for (const loc of LOCALES) {
    try {
      const j = await getJson(`/api/guardian/briefing?locale=${loc}`);
      const t = String(j.briefing || '');
      const broken = [...t.matchAll(/\d\.\s+\d/g)].length;
      const fc = forecastCount(t);
      const mism = []; if (broken) mism.push(`깨진 소수 ${broken}건`); if (fc) mism.push(`예측어 문장 ${fc}건`);
      add({ surface: 'brief', locale: loc, note: `source ${j.source} ${String(j.generatedAt || '').slice(0, 16)}`, compared: 2, mismatches: mism, sample: t.slice(0, 120) });
    } catch (e) { add({ surface: 'brief', locale: loc, note: `응답 실패 ${e.message}`, compared: 0, mismatches: ['응답 실패'] }); }
  }
}

// ── 실행 ────────────────────────────────────────────────────────────────────────
if (SURFACES.includes('flow')) for (const tk of TICKERS) await checkFlow(tk).catch((e) => add({ surface: 'flow', ticker: tk, note: `점검 실패 ${e.message}`, compared: 0, mismatches: ['점검 실패'] }));
if (SURFACES.includes('cmd')) for (const tk of TICKERS) await checkCmd(tk).catch((e) => add({ surface: 'cmd', ticker: tk, note: `점검 실패 ${e.message}`, compared: 0, mismatches: ['점검 실패'] }));
if (SURFACES.includes('guardian')) await checkGuardian();
if (SURFACES.includes('brief')) await checkBrief();
await browser.close();

const total = rows.reduce((a, r) => a + r.mismatches.length, 0);
const compared = rows.reduce((a, r) => a + r.compared, 0);
const bySurface = {};
for (const r of rows) { const s = (bySurface[r.surface] ||= { rows: 0, compared: 0, mismatches: 0 }); s.rows++; s.compared += r.compared; s.mismatches += r.mismatches.length; }
console.log('\n── 표면별 요약 (BASE=' + BASE + ')');
for (const [k, v] of Object.entries(bySurface)) console.log(`  ${k.padEnd(14)} 점검 ${String(v.rows).padStart(2)}행 · 비교 ${String(v.compared).padStart(3)}건 · 불일치 ${v.mismatches}건`);
console.log(`  합계: 비교 ${compared}건 · 불일치 ${total}건`);
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), tickers: TICKERS, locales: LOCALES, bySurface, total, compared, rows }, null, 2), 'utf8');
process.exitCode = total ? 1 : 0;
