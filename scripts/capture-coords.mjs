// ============================================================================
// scripts/capture-coords.mjs — 캡처 이미지 위 «강조 네모칸» 좌표를 실측한다
// ----------------------------------------------------------------------------
// 왜: 좌표를 눈대중으로 잡으면 링이 타일에서 어긋난다(1차본 실패 원인).
//     DOM 의 getBoundingClientRect 를 그대로 읽어 DPR 2 를 곱하면 «픽셀 정확»하다.
//
// 실행:  node scripts/capture-coords.mjs [TICKER]
// 출력:  00_PHONE_CAPTURE/CALLOUT_COORDS.json
// ============================================================================

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const TICKER = process.argv[2] || 'AMD';
const OUT = 'E:/SIGNUM_UPLOAD/AD_OUTSOURCE/00_PHONE_CAPTURE';
const BASE = 'https://www.signumhq.com/en/app-view';
const VW = 603, VH = 1311, DPR = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CTA = '^(start|continue|next|done|got it|agree|시작|확인|동의|다음)$';

async function dismissNotice(page) {
  for (let i = 0; i < 8; i++) {
    const st = await page.evaluate((c) => {
      const t = document.body.innerText || '';
      if (!/\d\s*\/\s*\d\s*·|REQUIRED NOTICE/i.test(t)) return 'gone';
      const rx = new RegExp(c, 'i');
      const b = [...document.querySelectorAll('button,[role="button"]')]
        .filter((e) => rx.test((e.innerText || '').trim()))
        .find((e) => !e.disabled);
      if (b) { b.click(); return 'clicked'; }
      return 'stuck';
    }, CTA);
    if (st === 'gone') return true;
    if (st === 'stuck') return false;
    await sleep(1100);
  }
  return false;
}

/** 화면에서 label 로 시작하는 «타일 박스»를 찾아 이미지 픽셀 좌표로 돌려준다 */
const measure = (page, labels) =>
  page.evaluate((labs, dpr) => {
    const out = {};
    for (const lab of labs) {
      // 그 문구를 가진 «가장 작은» 요소를 찾고, 카드처럼 보일 때까지 부모로 올라간다
      let best = null;
      for (const el of document.querySelectorAll('div,section,article,button')) {
        const txt = (el.innerText || '').trim();
        if (!txt.toUpperCase().startsWith(lab.toUpperCase())) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 60 || r.height < 40) continue;
        if (!best || r.width * r.height < best.r.width * best.r.height) best = { el, r };
      }
      if (!best) { out[lab] = null; continue; }
      const r = best.r;
      out[lab] = {
        x: Math.round(r.left * dpr),
        y: Math.round((r.top + window.scrollY) * dpr),
        w: Math.round(r.width * dpr),
        h: Math.round(r.height * dpr),
      };
    }
    return out;
  }, labels, DPR);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars'],
    defaultViewport: { width: VW, height: VH, deviceScaleFactor: DPR, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();

  await page.goto(`${BASE}/cmd`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('app-active-ticker', t);
    localStorage.setItem('signum_ad_unlock', JSON.stringify({ unlockedUntil: Date.now() + 3600000, tier: 'premium' }));
  }, TICKER);

  const result = {};

  await page.goto(`${BASE}/cmd`, { waitUntil: 'networkidle2' });
  await sleep(1400); await dismissNotice(page);
  await page.addStyleTag({ content: 'aside.app-anchor-ad{display:none !important}' });
  await sleep(2000);
  result['cap-command-overview.png'] =
    await measure(page, ['MAX PAIN', 'GAMMA FLIP', 'TOTAL PREMIUM', 'RSI 14', 'VWAP', 'DAY RANGE']);

  // AI 탭
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button,[role="tab"],div,span')]
      .find((e) => /^AI\s*✱?$/i.test((e.innerText || '').trim()));
    if (el) el.click();
  });
  await sleep(9000);
  result['cap-command-ai.png'] =
    await measure(page, ['AI DEEP ANALYSIS', 'PRICE MOVE ATTRIBUTION', 'OPTIONS POSITIONING']);

  await page.goto(`${BASE}/guardian`, { waitUntil: 'networkidle2' });
  await sleep(1400); await dismissNotice(page);
  await page.addStyleTag({ content: 'aside.app-anchor-ad{display:none !important}' });
  await sleep(2500);
  result['cap-guardian.png'] = await measure(page, ['GRAVITY GAUGE', 'SCORE TIMELINE', 'FEDWATCH']);

  await page.goto(`${BASE}/flow`, { waitUntil: 'networkidle2' });
  await sleep(1400); await dismissNotice(page);
  await page.addStyleTag({ content: 'aside.app-anchor-ad{display:none !important}' });
  await sleep(2500);
  result['cap-flow.png'] = await measure(page, ['OPTIONS FLOW OVERVIEW', 'OPTIONS PRESSURE INDEX', 'MAX PAIN']);

  await page.goto(`${BASE}/intel`, { waitUntil: 'networkidle2' });
  await sleep(1400); await dismissNotice(page);
  await page.addStyleTag({ content: 'aside.app-anchor-ad{display:none !important}' });
  await sleep(2500);
  result['cap-intel.png'] = await measure(page, ['Sector Intelligence', 'M7 Tech', 'Silicon Core']);

  await browser.close();

  const p = path.join(OUT, 'CALLOUT_COORDS.json');
  fs.writeFileSync(p, JSON.stringify({ canvas: [VW * DPR, VH * DPR], ticker: TICKER, boxes: result }, null, 2));

  for (const [img, boxes] of Object.entries(result)) {
    console.log(`\n${img}`);
    for (const [k, v] of Object.entries(boxes)) {
      console.log(v ? `  ${k.padEnd(24)} x=${v.x} y=${v.y} w=${v.w} h=${v.h}` : `  ${k.padEnd(24)} ✗ 못 찾음`);
    }
  }
  console.log(`\n→ ${p}\n`);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
