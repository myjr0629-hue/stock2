/* 광고그룹의 «광고(크리에이티브)» 탭을 열어 맞춤 제품 페이지 선택이 가능한지 확인 */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
const AG = process.env.AG || '2151021409', CP = process.env.CP || '2144650799';
await page.goto(`https://app-ads.apple.com/cm/app/23872040/report/campaign/${CP}/adgroup/${AG}`); await L.wait(14000);
console.log('url=' + (await page.url()).slice(-58));
const d = await page.evaluate(() => {
  const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
  const all = walk(document, []); const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
  const clickable = all.filter(e => /^(A|BUTTON|LI|SPAN)$/.test(e.tagName) && txt(e) && txt(e).length < 22 && e.getBoundingClientRect().width > 0);
  return { tabs: [...new Set(clickable.map(txt))].slice(0, 30),
           cpp: [...new Set(all.filter(e => /제품 페이지|맞춤 제품|광고 만들기|크리에이티브|Creative|Product Page|광고 그룹 설정/.test(txt(e)) && txt(e).length < 44).map(txt))].slice(0, 10) };
});
console.log('탭=' + JSON.stringify(d.tabs));
console.log('CPP/설정=' + JSON.stringify(d.cpp));
// «광고» 또는 «광고 그룹 설정 편집» 으로 들어가 제품 페이지 선택이 있는지
const opened = await L.clickText(page, /^광고 소재$/, { deep: true, after: 11000 });
console.log('진입=' + JSON.stringify(opened));
if (opened) {
  const d2 = await page.evaluate(() => {
    const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
    const all = walk(document, []); const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
    return { heads: [...new Set(all.filter(e => /^(H1|H2|H3|LEGEND)$/.test(e.tagName)).map(txt).filter(Boolean))].slice(0, 8),
             cpp: [...new Set(all.filter(e => /제품 페이지|맞춤 제품|Product Page|web home|기본|사용자 설정/.test(txt(e)) && txt(e).length < 70).map(txt))].slice(0, 12),
             buttons: [...new Set(all.filter(e => /^(BUTTON|A)$/.test(e.tagName) && txt(e) && txt(e).length < 24 && e.getBoundingClientRect().width > 0).map(txt))].slice(0, 20),
             body: (document.body.innerText||'').replace(/\s+/g,' ').slice(0, 420) };
  });
  console.log('상세=' + JSON.stringify(d2));
}
