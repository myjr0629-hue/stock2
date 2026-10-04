/* ============================================================================
 * findupapp-find — FindUpApp 에서 «SIGNUM» 을 검색해 우리 등록이 공개 목록에 보이는지 읽는다(읽기 전용·비로그인 사이트라 이 화면이 곧 공개 시야).
 * 실행: bash scripts/ego-run.sh scripts/ego/findupapp-find.mjs 100  → 결과 /tmp/ego/findupapp-find.json + 요약 출력
 * 쓰기 동작 없음(검색칸 입력만). 카드의 앱 이름·스토어·링크(href)를 읽는다.
 * ========================================================================== */
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await ts.newPage();
const out = { at: new Date().toISOString(), q: 'SIGNUM' };
try {
  await page.goto('https://findupapp.com/ja'); await wait(8000);
  const getBox = () => page.evaluate(() => { const i = [...document.querySelectorAll('input')].find((x) => /検索|search/i.test(x.placeholder || '') && x.getBoundingClientRect().width > 0); if (!i) return null; const b = i.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; });
  let box = await getBox(); if (!box) { await wait(5000); box = await getBox(); }
  if (!box) { out.pageText = await page.evaluate(() => document.title + ' | ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)); throw new Error('검색칸 없음'); }
  await page.mouse.click(box.x, box.y, {}); await wait(400);
  await page.cdp('Input.insertText', { text: 'SIGNUM' }); await wait(5000);
  out.snap = await page.evaluate(() => ({
    url: location.href,
    text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1600),
    links: [...document.querySelectorAll('a[href]')].filter((a) => /signum/i.test((a.innerText || '') + a.href)).map((a) => ({ t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80), h: a.href })).slice(0, 10),
  }));
} catch (e) { out.err = String(e && e.message || e).slice(0, 200); }
try { await page.close(); } catch {}
fs.mkdirSync('/tmp/ego', { recursive: true }); fs.writeFileSync('/tmp/ego/findupapp-find.json', JSON.stringify(out, null, 1));
console.log('FIND:', JSON.stringify(out).slice(0, 2400));
