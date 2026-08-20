// ============================================================================
// scripts/capture-subtab.mjs — 앱의 «하위 탭» 화면을 통짜로 캡처한다
// ----------------------------------------------------------------------------
// 왜: 광고에서 「고래」「다크풀」을 말하려면 그 말이 실제로 적힌 화면이 있어야 한다.
//     Flow 의 WHALE & DP 탭은 기본 화면에 없어서 따로 눌러 들어가야 한다.
//
// 실행:  node scripts/capture-subtab.mjs
// 출력:  public/ad/tall-undercurrent.png (+ 좌표는 콘솔)
// ============================================================================

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'public/ad';
const BASE = 'https://www.signumhq.com/en';
const FF = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';
const SHELL_W = 430, VH = 935, DPR = 3, FINAL_W = 1206;
const TMP = path.join(OUT, '_raw');
fs.mkdirSync(TMP, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CTA = '^(start|continue|next|done|got it|agree|시작|확인|동의|다음)$';

async function dismiss(page) {
  for (let i = 0; i < 8; i++) {
    const st = await page.evaluate((c) => {
      const t = document.body.innerText || '';
      if (!/\d\s*\/\s*\d\s*·|REQUIRED NOTICE/i.test(t)) return 'gone';
      const rx = new RegExp(c, 'i');
      const btns = [...document.querySelectorAll('button,[role="button"]')]
        .filter((e) => rx.test((e.innerText || '').trim()));
      const live = btns.find((e) => !e.disabled && e.getAttribute('aria-disabled') !== 'true');
      if (live) { live.click(); return 'clicked'; }
      // 버튼이 비활성 = 필수 «동의 체크박스»가 남아 있다 (1/2 단계)
      let n = 0;
      for (const c of document.querySelectorAll('input[type=checkbox]')) if (!c.checked) { c.click(); n++; }
      if (n) return 'checked';
      // 체크박스가 커스텀 요소일 수 있다 — 동의 문구를 담은 박스를 직접 누른다
      const agree = [...document.querySelectorAll('div,label,span')]
        .find((e) => /I confirm that I have read/i.test((e.innerText || '').trim())
          && e.getBoundingClientRect().height < 160);
      if (agree) { agree.click(); return 'checked'; }
      return 'stuck';
    }, CTA);
    if (st === 'gone') return true;
    if (st === 'stuck') return false;
    await sleep(1000);
  }
  return false;
}

function downscale(raw, final) {
  execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
    '-vf', `scale=${FINAL_W}:-2:flags=lanczos`, final]);
  fs.unlinkSync(raw);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'],
    defaultViewport: { width: SHELL_W, height: VH, deviceScaleFactor: DPR, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(`${BASE}/undercurrent`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('app-active-ticker', 'AMD');
    localStorage.setItem('signum_ad_unlock', JSON.stringify({ unlockedUntil: Date.now() + 3600000, tier: 'premium' }));
  });
  await page.goto(`${BASE}/undercurrent`, { waitUntil: 'networkidle2' });
  await sleep(1500); await dismiss(page);
  await page.addStyleTag({ content: 'aside.app-anchor-ad{display:none !important}' });
  await sleep(2000);

  await sleep(3000);

  // 통짜 캡처
  const h = await page.evaluate(() => {
    const el = document.querySelector('.app-main');
    return el ? Math.ceil(el.scrollHeight) + 40 : document.documentElement.scrollHeight;
  });
  await page.setViewport({ width: SHELL_W, height: h, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await sleep(2800);
  // ★ 뷰포트를 늘리면 앱이 리마운트되면서 온보딩 고지가 «다시» 뜬다 (2026-08-19 실측).
  //   그래서 리사이즈 «후»에 한 번 더 닫고, 남아 있으면 저장하지 않는다.
  await dismiss(page);
  await sleep(1800);
  await page.addStyleTag({ content: 'aside.app-anchor-ad{display:none !important}' });
  const blocked = await page.evaluate(() =>
    /\d\s*\/\s*\d\s*·|REQUIRED NOTICE/i.test(document.body.innerText || ''));
  if (blocked) { console.error('✗ 온보딩이 안 닫혀서 저장하지 않는다'); process.exit(1); }

  const raw = path.join(TMP, 'tall-undercurrent.png');
  await page.screenshot({ path: raw, type: 'png' });
  downscale(raw, path.join(OUT, 'tall-undercurrent.png'));
  console.log(`  ✔ public/ad/tall-undercurrent.png  (스크롤 ${h}px)`);

  // 좌표 실측
  const k = FINAL_W / SHELL_W;
  const boxes = await page.evaluate((labs, kk) => {
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
        x: Math.round(best.left * kk), y: Math.round(best.top * kk),
        w: Math.round(best.width * kk), h: Math.round(best.height * kk),
      } : null;
    }
    return out;
  }, ['UNDERCURRENT', 'FEED', 'JUDGMENT', 'MACRO'], k);

  console.log('\n  좌표 (저장 이미지 픽셀 기준)');
  for (const [n, b] of Object.entries(boxes)) {
    console.log(b ? `    ${n.padEnd(12)} x=${b.x} y=${b.y} w=${b.w} h=${b.h}` : `    ${n.padEnd(12)} 없음`);
  }
  // 화면에 실제로 적힌 문구 확인 — 광고 문구를 지어내지 않기 위해
  const words = await page.evaluate(() =>
    (document.body.innerText || '').split('\n').map((s) => s.trim())
      .filter((s) => /undercurrent|feed|signal|macro/i.test(s)).slice(0, 14));
  console.log('\n  화면에 실제로 있는 문구:');
  words.forEach((w) => console.log('    ·', w));

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
