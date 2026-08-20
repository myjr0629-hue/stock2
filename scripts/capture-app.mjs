// ============================================================================
// scripts/capture-app.mjs — SIGNUM 앱 화면 캡처 (여백 없음 + 긴 스크롤본)
// ----------------------------------------------------------------------------
// ★ 실측으로 확정된 규격
//   앱 셸 `.app-main` 은 max-width **430px**. 그보다 넓은 뷰포트로 찍으면
//   좌우가 죽은 여백이 된다(603px 로 찍었을 때 이미지 기준 좌우 173px 씩 낭비).
//   → 뷰포트 폭을 430 «정확히» 맞춰 여백 0 으로 만든다.
//
//   해상도는 DPR 3 으로 크게 뽑은 뒤 1206 폭으로 내려 받는다.
//   (2.8배로 직접 찍는 것보다 3배→축소가 글자가 더 선명하다)
//
//   내부 스크롤(.app-main)은 화면 높이의 약 2.9배다. 그래서 두 종류를 만든다.
//     cap-*.png   한 화면          1206 x 2622
//     tall-*.png  전체 스크롤 통짜   1206 x (길이만큼)  ← 폰 안 스와이프용
//
// 실행:  node scripts/capture-app.mjs [TICKER]
// ============================================================================

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TICKER = process.argv[2] || 'AMD';
const OUT = 'E:/SIGNUM_UPLOAD/AD_OUTSOURCE/00_PHONE_CAPTURE';
const BASE = 'https://www.signumhq.com/en/app-view';
const FF = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';

const SHELL_W = 430;          // ← 앱 셸 max-width. 실측값. 바꾸면 여백이 생긴다
const VH = 935;               // 430 x 935 = 기존 자산과 같은 세로비 (2.174)
const DPR = 3;
const FINAL_W = 1206;         // 기존 01_app_screens 자산과 동일 폭

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP = path.join(OUT, '_raw');
fs.mkdirSync(TMP, { recursive: true });

const CTA = '^(start|continue|next|done|got it|agree|i (understand|agree)|시작|확인|동의|다음)$';

/** 온보딩 마법사(1/2 고지 → 2/2 알림 → Start)를 끝까지 통과 */
async function dismissNotice(page) {
  for (let i = 0; i < 8; i++) {
    const state = await page.evaluate((ctaSrc) => {
      const t = document.body.innerText || '';
      if (!/\d\s*\/\s*\d\s*·|REQUIRED NOTICE|Financial Data Notice/i.test(t)) return 'gone';
      const rx = new RegExp(ctaSrc, 'i');
      const btns = [...document.querySelectorAll('button,[role="button"]')]
        .filter((e) => rx.test((e.innerText || '').trim()));
      const live = btns.find((e) => !e.disabled && e.getAttribute('aria-disabled') !== 'true');
      if (live) { live.click(); return 'clicked'; }
      if (btns.length && /REQUIRED NOTICE|NOT INVESTMENT ADVICE|Terms|Privacy/i.test(t)) {
        let n = 0;
        for (const c of document.querySelectorAll('input[type=checkbox]')) if (!c.checked) { c.click(); n++; }
        if (n) return 'checked';
      }
      return 'stuck';
    }, CTA);
    if (state === 'gone') return true;
    if (state === 'stuck') return false;
    await sleep(1100);
  }
  return false;
}

/** 타사 상표가 박힌 하단 스폰서 배너를 캡처 시점에만 숨긴다 (제품 코드는 무수정) */
const hideAnchorAd = (page) =>
  page.addStyleTag({ content: 'aside.app-anchor-ad{display:none !important}' }).catch(() => {});

async function gotoTab(page, tab) {
  await page.setViewport({ width: SHELL_W, height: VH, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/${tab}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1400);
  if (!(await dismissNotice(page))) console.log(`    ⚠ ${tab}: 온보딩을 못 닫았다`);
  await hideAnchorAd(page);
  await sleep(1800);
}

const clickByText = (page, re) =>
  page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('button,[role="tab"],[role="button"],div,span')]
      .find((e) => {
        const s = (e.innerText || '').trim();
        const r = e.getBoundingClientRect();
        return rx.test(s) && s.length < 20 && r.height > 18 && r.height < 90 && r.width > 40 && r.width < 260;
      });
    if (!el) return false;
    el.click();
    return true;
  }, re);

async function waitForText(page, needle, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate((n) => (document.body.innerText || '').includes(n), needle)) return true;
    await sleep(1200);
  }
  return false;
}

/** DPR3 원본을 1206 폭으로 내려 저장한다 */
function downscale(rawPath, finalPath) {
  execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawPath,
    '-vf', `scale=${FINAL_W}:-2:flags=lanczos`, finalPath]);
  fs.unlinkSync(rawPath);
  const dim = execFileSync(FF.replace('ffmpeg.exe', 'ffprobe.exe'),
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0', finalPath]).toString().trim();
  return { dim, kb: Math.round(fs.statSync(finalPath).size / 1024) };
}

/**
 * 화면 위 «강조 네모칸» 좌표를 잰다.
 *   눈대중 금지 — DOM 의 getBoundingClientRect 를 읽어 최종 이미지 배율을 곱한다.
 *   배율 = FINAL_W / SHELL_W (뷰포트 논리픽셀 → 저장 이미지 픽셀)
 */
const SCALE = FINAL_W / SHELL_W;
const COORDS = {};

async function measure(page, name, labels) {
  const boxes = await page.evaluate((labs, k) => {
    const out = {};
    for (const lab of labs) {
      let best = null;
      for (const el of document.querySelectorAll('div,section,article,button')) {
        const txt = (el.innerText || '').trim();
        if (!txt.toUpperCase().startsWith(lab.toUpperCase())) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 60 || r.height < 40) continue;
        if (!best || r.width * r.height < best.width * best.height) best = r;
      }
      out[lab] = best ? {
        x: Math.round(best.left * k), y: Math.round(best.top * k),
        w: Math.round(best.width * k), h: Math.round(best.height * k),
      } : null;
    }
    return out;
  }, labels, SCALE);
  COORDS[name] = { ...(COORDS[name] || {}), ...boxes };
  const hit = Object.values(boxes).filter(Boolean).length;
  console.log(`      좌표 ${hit}/${labels.length}개 실측`);
  return boxes;
}

async function shot(page, name, labels = []) {
  const blocked = await page.evaluate(() =>
    /\d\s*\/\s*\d\s*·|REQUIRED NOTICE/i.test(document.body.innerText || ''));
  if (blocked) { console.log(`  ✗ ${name}  온보딩에 가려서 건너뜀`); return; }
  const raw = path.join(TMP, name);
  await page.screenshot({ path: raw, type: 'png' });
  const r = downscale(raw, path.join(OUT, name));
  console.log(`  ✔ ${name.padEnd(28)} ${r.dim}  ${r.kb}KB`);
  if (labels.length) await measure(page, name, labels);
}

/**
 * 스크롤 «통짜» 캡처. 뷰포트를 내부 스크롤 높이만큼 늘려 한 장으로 찍는다.
 * 폰 화면 안에서 위→아래로 흐르게 만들 때 쓴다.
 */
async function shotTall(page, name, labels = []) {
  const h = await page.evaluate(() => {
    const el = document.querySelector('.app-main');
    return el ? Math.ceil(el.scrollHeight) + 40 : document.documentElement.scrollHeight;
  });
  await page.setViewport({ width: SHELL_W, height: h, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await sleep(2600);                       // 늘어난 높이로 차트가 다시 그려질 시간
  await hideAnchorAd(page);
  const raw = path.join(TMP, name);
  await page.screenshot({ path: raw, type: 'png' });
  const r = downscale(raw, path.join(OUT, name));
  console.log(`  ✔ ${name.padEnd(28)} ${r.dim}  ${r.kb}KB   (스크롤 ${h}px)`);
  if (labels.length) await measure(page, name, labels);   // 뷰포트를 되돌리기 «전»에 잰다
  await page.setViewport({ width: SHELL_W, height: VH, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await sleep(1200);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    defaultViewport: { width: SHELL_W, height: VH, deviceScaleFactor: DPR, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(`${BASE}/cmd`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((t) => {
    try {
      localStorage.setItem('app-active-ticker', t);
      // AI 패널은 «광고 시청 1시간» 게이트(ValueWall) 뒤에 있다. 임시 브라우저에만 언락.
      // 표시되는 분석문·수치는 서버가 만든 실데이터 그대로다.
      localStorage.setItem('signum_ad_unlock',
        JSON.stringify({ unlockedUntil: Date.now() + 3600000, tier: 'premium' }));
    } catch (e) {}
  }, TICKER);

  console.log(`\n  ${TICKER} · 셸폭 ${SHELL_W} (여백 0) · DPR ${DPR} → ${FINAL_W}px 로 저장\n`);

  // 1) Command · OVERVIEW
  await gotoTab(page, 'cmd');
  await waitForText(page, 'MAX PAIN', 20000);
  await shot(page, 'cap-command-overview.png', ['MAX PAIN', 'GAMMA FLIP', 'TOTAL PREMIUM', 'RSI 14', 'VWAP', 'DAY RANGE']);
  await shotTall(page, 'tall-command-overview.png', ['MAX PAIN', 'GAMMA FLIP', 'TOTAL PREMIUM', 'RSI 14', 'VWAP', 'DAY RANGE']);

  // 2) Command · AI
  if (await clickByText(page, '^AI\\s*✱?$')) {
    const ok = await waitForText(page, 'AI DEEP ANALYSIS', 60000);
    await sleep(2500);
    console.log(`    AI 로드 ${ok ? '완료' : '실패(타임아웃)'}`);
    await shot(page, 'cap-command-ai.png', ['AI DEEP ANALYSIS', 'PRICE MOVE ATTRIBUTION', 'TECHNICAL STRUCTURE ANALYSIS', 'OPTIONS POSITIONING']);

    // 긴 버전은 «접힌 분석 항목을 전부 펼쳐서» 찍는다 — 분석 깊이가 보여야 광고가 산다
    const opened = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('button,[role="button"],div')]
        .filter((e) => /^(PRICE MOVE ATTRIBUTION|TECHNICAL STRUCTURE ANALYSIS|OPTIONS POSITIONING & DEALER STRUCTURE|NEWS & MARKET CONTEXT)/i
          .test((e.innerText || '').trim()) && e.getBoundingClientRect().height < 140);
      const seen = new Set(); let n = 0;
      for (const h of heads) {
        const k = (h.innerText || '').trim().slice(0, 30);
        if (seen.has(k)) continue;
        seen.add(k); h.click(); n++;
      }
      return n;
    });
    console.log(`    분석 항목 ${opened}개 펼침`);
    await sleep(2200);
    await shotTall(page, 'tall-command-ai.png', ['AI DEEP ANALYSIS', 'PRICE MOVE ATTRIBUTION', 'TECHNICAL STRUCTURE ANALYSIS', 'OPTIONS POSITIONING']);
  } else console.log('    ✗ AI 탭을 못 찾음');

  // 3~5) Guardian / Flow / Intel
  const REST = {
    dash: ['FUTURES', 'DARK POOL', 'RISK'],
    guardian: ['GRAVITY GAUGE', 'SCORE TIMELINE', 'FEDWATCH'],
    flow: ['OPTIONS FLOW OVERVIEW', 'OPTIONS PRESSURE INDEX', 'MAX PAIN'],
    intel: ['M7 Tech', 'Silicon Core'],
  };
  for (const [tab, needle] of [['dash', ''], ['guardian', 'GRAVITY'], ['flow', ''], ['intel', '']]) {
    await gotoTab(page, tab);
    if (needle) await waitForText(page, needle, 20000);
    await sleep(2000);
    await shot(page, `cap-${tab}.png`, REST[tab]);
    await shotTall(page, `tall-${tab}.png`, REST[tab]);
  }

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });

  const cp = path.join(OUT, 'CALLOUT_COORDS.json');
  fs.writeFileSync(cp, JSON.stringify({
    note: '좌표는 저장된 PNG 픽셀 기준. 같은 실행에서 측정했으므로 이미지와 항상 일치한다.',
    ticker: TICKER, shellWidth: SHELL_W, imageWidth: FINAL_W, boxes: COORDS,
  }, null, 2));
  console.log(`
  좌표 → ${cp}`);
  console.log(`\n  → ${OUT}\n`);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
