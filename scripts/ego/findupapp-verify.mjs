/* ============================================================================
 * findupapp-verify — FindUpApp 에 등록한 우리 상세 페이지를 «새로 열어» 공개 시야에서 확인한다(읽기 전용 · 이 사이트는 로그인이 없어 이 화면이 곧 공개 시야).
 *   항목마다: 제목·본문 일부·카테고리·스토어로 나가는 a[href](우리 스토어 ID 포함 여부)·로그인/오류 문구.
 * 실행: bash scripts/ego-run.sh scripts/ego/findupapp-verify.mjs 120 → /tmp/ego/findupapp-verify.json
 * 대상은 아래 URLS 상수(우리 등록 2건). 다른 URL 은 작업 파일 없이 바꾸지 않는다.
 * ========================================================================== */
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const URLS = ['https://findupapp.com/ja/app/ios/6783130444', 'https://findupapp.com/ja/app/android/com.signumhq.app'];
const NEED = [/6783130444/, /com\.signumhq\.app/];
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await ts.newPage();
const out = { at: new Date().toISOString(), items: [] };
for (let i = 0; i < URLS.length; i++) {
  const u = URLS[i]; const it = { url: u };
  try {
    await page.goto(u); await wait(7000);
    const d = await page.evaluate(() => ({
      url: location.href, title: document.title,
      text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1100),
      out: [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /apps\.apple\.com|play\.google\.com|signumhq/i.test(h)).slice(0, 8),
    }));
    Object.assign(it, d);
    it.storeLinkOk = d.out.some((h) => NEED[i].test(h));
    it.hasSignum = /SIGNUM/i.test(d.title + ' ' + d.text);
    it.loginWall = /ログインが必要|Sign in|ログインして/.test(d.text);
  } catch (e) { it.err = String(e && e.message || e).slice(0, 160); }
  out.items.push(it);
}
try { await page.close(); } catch {}
fs.mkdirSync('/tmp/ego', { recursive: true }); fs.writeFileSync('/tmp/ego/findupapp-verify.json', JSON.stringify(out, null, 1));
for (const it of out.items) console.log('ITEM:', JSON.stringify({ url: it.url, final: it.url === undefined ? '' : it.url, title: it.title, storeLinkOk: it.storeLinkOk, hasSignum: it.hasSignum, loginWall: it.loginWall, out: it.out, text: (it.text || '').slice(0, 420).replace(/\n/g, ' | '), err: it.err }));
