/* 광고그룹에 «맞춤 제품 페이지(CPP)» 를 붙일 수 있는지 읽기 전용 확인 — 예산·입찰 무변경 */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
await page.goto('https://app-ads.apple.com/cm/app/23872040/report/campaign/2144650799'); await L.wait(14000);
const u = await page.url(); console.log('url=' + u.slice(0, 80));
if (/idmsa|signin/.test(u)) { console.log('SESSION_EXPIRED'); process.exit(0); }
const dump = await page.evaluate(() => {
  const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
  const all = walk(document, []);
  const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
  const tabs = [...new Set(all.filter(e => /^(A|BUTTON|LI)$/.test(e.tagName) && txt(e).length < 22 && txt(e) && e.getBoundingClientRect().width > 0).map(txt))];
  const groups = all.filter(e => /^(A)$/.test(e.tagName) && /adgroup/.test(e.getAttribute('href') || '')).map(e => ({ t: txt(e).slice(0, 40), href: (e.getAttribute('href') || '').slice(-30) }));
  const cpp = all.filter(e => /제품 페이지|Product Page|맞춤 제품|광고 만들기|Create Ad|크리에이티브|Creative/.test(txt(e)) && txt(e).length < 40).map(txt);
  return { tabs: tabs.slice(0, 22), groups: groups.slice(0, 6), cpp: [...new Set(cpp)].slice(0, 8) };
});
console.log('탭/버튼=' + JSON.stringify(dump.tabs));
console.log('광고그룹=' + JSON.stringify(dump.groups));
console.log('CPP 관련=' + JSON.stringify(dump.cpp));
// 광고그룹으로 들어가 «광고/크리에이티브» 가 있는지 본다
const g = dump.groups[0];
if (g) {
  await page.goto('https://app-ads.apple.com' + (g.href.startsWith('/') ? g.href : '/cm/app/23872040/report/campaign/2144650799/adgroup/' + g.href.replace(/\D/g, '')));
  await L.wait(13000);
  console.log('adgroup url=' + (await page.url()).slice(-60));
  const d2 = await page.evaluate(() => {
    const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
    const all = walk(document, []); const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
    return { tabs: [...new Set(all.filter(e => /^(A|BUTTON|LI)$/.test(e.tagName) && txt(e) && txt(e).length < 20 && e.getBoundingClientRect().width > 0).map(txt))].slice(0, 24),
             cpp: [...new Set(all.filter(e => /제품 페이지|맞춤 제품|광고 만들기|크리에이티브|Creative|Product Page/.test(txt(e)) && txt(e).length < 44).map(txt))].slice(0, 8) };
  });
  console.log('adgroup 탭=' + JSON.stringify(d2.tabs));
  console.log('adgroup CPP=' + JSON.stringify(d2.cpp));
}
