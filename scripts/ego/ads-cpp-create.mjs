/* 광고그룹에 «맞춤 제품 페이지» 광고를 만든다 — 크리에이티브만, 예산·입찰 무변경.
 * DRY=1 이면 화면만 읽고 만들지 않는다. */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const DRY = process.env.DRY === '1';
const AG = process.env.AG || '2151021409', CP = process.env.CP || '2144650799', NAME = process.env.NAME || 'CPP web home';
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
await page.goto(`https://app-ads.apple.com/cm/app/23872040/report/campaign/${CP}/adgroup/${AG}`); await L.wait(13000);
if (/idmsa|signin/.test(await page.url())) { console.log('SESSION_EXPIRED'); process.exit(0); }
await L.trapDialogs(page);
console.log('광고소재탭=' + JSON.stringify(await L.clickText(page, /^광고 소재$/, { deep: true, after: 10000 })));
const before = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').match(/광고 관리[\s\S]{0,300}/)?.[0]?.slice(0, 280) || null);
console.log('현재=' + JSON.stringify(before));
console.log('광고생성=' + JSON.stringify(await L.clickText(page, /^광고 생성$/, { deep: true, after: 9000 })));
const dlg = await page.evaluate(() => {
  const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
  const all = walk(document, []); const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    heads: [...new Set(all.filter(e => /^(H1|H2|H3)$/.test(e.tagName)).map(txt).filter(Boolean))].slice(0, 6),
    options: [...new Set(all.filter(e => /기본 제품 페이지|web home|맞춤형 제품 페이지|사용 가능한 제품 페이지/.test(txt(e)) && txt(e).length < 60).map(txt))].slice(0, 8),
    inputs: all.filter(e => e.tagName === 'INPUT' && e.getBoundingClientRect().width > 0).map(e => ({ t: e.type, ph: (e.placeholder || '').slice(0, 24), checked: e.checked })).slice(0, 8),
    buttons: [...new Set(all.filter(e => e.tagName === 'BUTTON' && txt(e) && txt(e).length < 20 && e.getBoundingClientRect().width > 0).map(txt))].slice(0, 14),
  };
});
console.log('대화상자=' + JSON.stringify(dlg));
console.log('dialogs=' + JSON.stringify(await L.dialogs(page)));
if (DRY) { console.log('DRY — 만들지 않음'); process.exit(0); }
