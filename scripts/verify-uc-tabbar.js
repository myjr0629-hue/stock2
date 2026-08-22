#!/usr/bin/env node
// ============================================================================
// verify-uc-tabbar — 「기사 상세에서 하단 탭이 먹통」 버그 실화면 재현·검증
// ----------------------------------------------------------------------------
// 대표 제보(2026-08-23): 기사를 열면 하단 탭이 안 먹고, 상단 뒤로가기를 눌러야만 먹힌다.
// 원인: 탭바 onClick 이 setDetail(null) 을 안 해서 early return 이 상세를 계속 렌더.
//
// 이 스크립트는 «사람이 하는 그대로» 한다: 카드 클릭 → 상세 확인 → 탭 클릭 → 이동 확인.
// 통과 조건은 «탭을 눌렀을 때 상세가 닫히고 해당 탭 화면이 나오는가» 하나뿐이다.
// ============================================================================
const puppeteer = require('puppeteer');
const BASE = process.env.BASE || 'https://www.signumhq.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  await page.goto(`${BASE}/en/undercurrent`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => { try { ['signumhq.locale','undercurrent.locale'].forEach(k=>localStorage.setItem(k,'en')); } catch {} });
  await page.goto(`${BASE}/en/undercurrent`, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(9000);

  // ① 기사 카드를 연다 — «이 종목 전체 보기» 같은 상세 전용 문구가 나오는지로 판정
  const opened = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('button, [role="button"], article')]
      .filter((e) => (e.textContent || '').length > 60 && e.querySelector('img'));
    if (!cards.length) return false;
    cards[0].click();
    return true;
  });
  if (!opened) { console.error('✗ 기사 카드를 못 찾음'); process.exit(1); }
  await sleep(3500);

  const inDetail = await page.evaluate(() =>
    /전체 보기|View all|이 종목|Money read|돈의 움직임|What the money/i.test(document.body.innerText));
  console.log(`상세 진입: ${inDetail ? 'OK' : '실패'}`);
  if (!inDetail) { console.error('✗ 상세 화면이 안 열렸다'); await browser.close(); process.exit(1); }

  const beforeText = await page.evaluate(() => document.body.innerText.slice(0, 300));

  // ② 상단 뒤로가기를 «누르지 않고» 곧장 하단 탭을 누른다 — 이게 버그 재현 경로다
  const tapped = await page.evaluate(() => {
    const nav = document.querySelector('nav') || document.body;
    const btns = [...nav.querySelectorAll('button')];
    const target = btns.find((b) => /whale|큰손|クジラ/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    if (!target) return null;
    target.click();
    return target.getAttribute('aria-label') || target.textContent;
  });
  if (!tapped) { console.error('✗ 하단 탭 버튼을 못 찾음'); await browser.close(); process.exit(1); }
  await sleep(3500);

  const afterText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  const stillDetail = await page.evaluate(() =>
    /전체 보기|View all|돈의 움직임|What the money/i.test(document.body.innerText));

  const moved = afterText !== beforeText && !stillDetail;
  console.log(`탭 클릭(${tapped}) 후 → ${moved ? '✓ 이동함' : '✗ 여전히 상세'}`);
  console.log(`  이동 후 첫 줄: ${afterText.split('\n').filter(Boolean)[0] || ''}`);

  await page.screenshot({ path: '/tmp/uc-tabbar-after.png' });
  await browser.close();
  process.exit(moved ? 0 : 1);
})();
