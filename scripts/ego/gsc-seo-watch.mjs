/* ============================================================================
 * gsc-seo-watch — Search Console «읽기만»: 구글이 우리 canonical 을 보게 됐는가 / 노출·클릭이 늘었는가
 *   실행: bash scripts/ego-run.sh scripts/ego/gsc-seo-watch.mjs 300
 *   결과: 표준 출력 + /tmp/ego/gsc-seo-watch-<YYYY-MM-DD>.json (전후 비교용)
 *
 * 왜 (2026-09-30): Next 15.5 스트리밍 메타데이터가 구글봇에게 canonical·hreflang·title 을 body 로 보내
 *   구글이 «User-declared canonical: None» 으로 색인해 왔다(growth/google-head-metadata 로 수리).
 *   수리의 성적표는 아래 숫자다 — 기준선(9/30 02시 KST, 수리 전):
 *     성과 28일  클릭 13 · 노출 807 · CTR 1.6% · 평균 11.4위   (90일 클릭 26 · 노출 1.58천 · 20.6위)
 *     색인       3.78천 / 미색인 4.21천 — 사용자 canonical 없는 중복 649(검증 Failed) · 발견됨-미색인 3,049 · 크롤됨-미색인 437
 *     성과 7일   클릭 5 · 노출 253 · CTR 2% · 평균 8.7위
 *     URL 검사   표본 4개 전부 «User-declared canonical: None» — /flow/NIO(색인, 9/24) · /en/flow/NIO(미색인, 9/24)
 *                · /en/flow/MSI(미색인, 9/22) · /ko/flow/NVDA(색인, 8/31) — 전부 구글봇 스마트폰 크롤
 *   ⚠ URL 검사의 «실시간 테스트»(Google-InspectionTool)는 원래 head 로 받는다 — 그 화면으로 수리를 판정하지 말 것.
 *     판정은 «색인된 판»의 User-declared canonical(재크롤 뒤)과 색인 보고서 숫자 추세로 한다.
 * ========================================================================== */
import fs from 'node:fs';
const RID = encodeURIComponent('https://www.signumhq.com/');
const BASE = 'https://search.google.com/search-console';
const SAMPLE = ['https://www.signumhq.com/flow/NIO', 'https://www.signumhq.com/en/flow/NIO', 'https://www.signumhq.com/en/flow/MSI', 'https://www.signumhq.com/ko/flow/NVDA'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { at: new Date().toISOString(), perf: {}, index: {}, inspect: {} };
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // KST 날짜
const save = () => fs.writeFileSync(`/tmp/ego/gsc-seo-watch-${day}.json`, JSON.stringify(out, null, 1));

// ★2026-10-03: 작업공간 번호(1)를 박아 두었더니 작업공간이 바뀐 뒤 «task space not found: 1» 로 죽었다 → 공용 space() 로 찾는다(대표가 쥐고 있으면 되찾지 않고 중단)
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const task = await L.space(); if (!task) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await task.newPage(); // 이 스크립트 전용 탭 — 끝에서 닫는다
const text = () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'));
try {
  // 1) 성과(웹 검색) 7·28일
  for (const days of [7, 28]) {
    await page.goto(`${BASE}/performance/search-analytics?resource_id=${RID}&num_of_days=${days}`); await wait(9000);
    const t = await text();
    const m = (re) => (t.match(re) || [])[1] || null;
    out.perf[`d${days}`] = { clicks: m(/Total clicks\s*\n\s*([\d,.K]+)/), impressions: m(/Total impressions\s*\n\s*([\d,.K]+)/), ctr: m(/Average CTR\s*\n\s*([\d.,%]+)/), position: m(/Average position\s*\n\s*([\d.,]+)/) };
  }
  save();
  // 2) 색인(페이지) — 전체·사유별
  await page.goto(`${BASE}/index?resource_id=${RID}`); await wait(9000);
  {
    const t = await text();
    const m = (re) => (t.match(re) || [])[1] || null;
    out.index = { updated: m(/Last update:\s*([\d/]+)/), notIndexed: m(/Not indexed\s*\n\s*([\d,.K]+)/), indexed: m(/\nIndexed\s*\n\s*([\d,.K]+)/), reasons: {} };
    for (const r of ['Duplicate without user-selected canonical', 'Discovered - currently not indexed', 'Crawled - currently not indexed', 'Duplicate, Google chose different canonical than user', 'Page with redirect']) {
      const i = t.indexOf(r); if (i < 0) continue;
      const seg = t.slice(i, i + 160).split('\n');
      const n = seg.map((s) => s.trim()).find((s) => /^[\d,.]+K?$/.test(s));
      const v = seg.map((s) => s.trim()).find((s) => /^(Failed|Passed|Started|Not Started|Pending)$/i.test(s));
      out.index.reasons[r] = { pages: n || null, validation: v || null };
    }
  }
  save();
  // 3) URL 검사 — 색인된 판의 canonical(실시간 테스트 아님)
  for (const u of SAMPLE) {
    await page.goto(`${BASE}?resource_id=${RID}`); await wait(6000);
    const box = `input[aria-label="Inspect any URL in https://www.signumhq.com/"]`;
    await page.waitForSelector(box, { timeout: 20000 });
    await page.fill(box, u);
    await page.click('button[aria-label="Search"]', { label: 'inspect url' });
    await wait(14000);
    let t = await text();
    if (/URL is on Google/.test(t) && !/User-declared canonical/.test(t)) {
      // 색인된 URL 은 세부(Page indexing)가 접혀 있다 → 펼쳐서 읽는다(읽기만)
      for (const sel of ['text="Page is indexed"', 'text="Page indexing"']) {
        try { await page.click(sel, { label: 'expand page indexing' }); await wait(3000); t = await text(); if (/User-declared canonical/.test(t)) break; } catch {}
      }
    }
    // 값 = 제목 다음의 «비어 있지 않은» 첫 줄. 폭 없는 공백·NBSP·머티리얼 아이콘 글리프(사설 영역 \ue000~\uf8ff)는 지운다
    const g = (label, n = 160) => { const j = t.indexOf(label); return j < 0 ? null : (t.slice(j + label.length, j + label.length + n).split('\n').map((s) => s.replace(/[\u200b\u00a0\ue000-\uf8ff]/g, '').trim()).filter(Boolean)[0] || null); };
    out.inspect[u] = { status: (t.match(/URL is (on|not on) Google/) || [])[0] || null, userCanonical: g('User-declared canonical'), googleCanonical: g('Google-selected canonical'), lastCrawl: g('Last crawl'), crawledAs: g('Crawled as') };
    save();
  }
} finally {
  try { await page.close(); } catch {}
}
console.log(JSON.stringify(out, null, 1));
