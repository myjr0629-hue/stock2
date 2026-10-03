/* ============================================================================
 * gsc-dataset-watch — Search Console «데이터셋 사이트»(myjr0629-hue.github.io/options-market-structure-daily/) 판독. 읽기 전용.
 *   gsc_ghpages 레인(주 1회): ① Sitemaps 상태(Success·마지막 읽음·발견된 페이지) ② 색인 보고서(색인됨/미색인 숫자). 쓰기 동작(색인 요청)은 하지 않는다.
 * 실행: bash scripts/ego-run.sh scripts/ego/gsc-dataset-watch.mjs 150  → 결과 /tmp/ego/gsc-dataset-watch-<KST 날짜>.json + 요약 출력
 * 로그인은 contact@(u/0) 기본 세션 — 로그인 화면이 나오면 LOGIN_REQUIRED 로 끝낸다(계정 정보 입력 금지).
 * ========================================================================== */
import fs from 'node:fs';
const RID = encodeURIComponent('https://myjr0629-hue.github.io/options-market-structure-daily/');
const BASE = 'https://search.google.com/search-console';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const task = await L.space(); if (!task) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await task.newPage(); // 이 스크립트 전용 탭 — 끝에서 닫는다
const text = () => page.evaluate(() => ({ url: location.href, t: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1800) }));
const out = { at: new Date().toISOString() };
try {
  await page.goto(`${BASE}/sitemaps?resource_id=${RID}`); await wait(9000);
  out.sitemaps = await text();
  if (/accounts\.google\.com|ServiceLogin/.test(out.sitemaps.url)) { console.log('LOGIN_REQUIRED — 구글 로그인 필요(대표). 계정 정보는 입력하지 않는다.'); }
  else { await page.goto(`${BASE}/index?resource_id=${RID}`); await wait(9000); out.index = await text(); }
} catch (e) { out.error = String(e && e.message || e).slice(0, 160); }
try { await page.close(); } catch {}
fs.writeFileSync(`/tmp/ego/gsc-dataset-watch-${day}.json`, JSON.stringify(out, null, 1));
const brief = (o) => { if (!o) return '(없음)'; const t = o.t.replace(/\n/g, ' | '); const k = t.indexOf('PrivacyTerms'); return (k >= 0 ? t.slice(k + 12) : t).slice(0, 700); }; // 왼쪽 메뉴 글자는 건너뛴다
console.log('SITEMAPS:', brief(out.sitemaps)); console.log('INDEX:', brief(out.index)); if (out.error) console.log('오류:', out.error);
