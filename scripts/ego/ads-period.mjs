const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
const d = await page.evaluate(() => {
  const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
  const all = walk(document, []); const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
  const sel = all.filter(e => /^(오늘|어제|지난 7일|지난 14일|지난 30일|이번 달|지난달|사용자 설정)$/.test(txt(e)) && e.getBoundingClientRect().width > 0)
    .map(e => ({ t: txt(e), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width/2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height/2),
                 sel: (e.getAttribute('aria-checked') === 'true') || /selected|active|checked/i.test(e.className || '') || (e.querySelector && !!e.querySelector('input:checked')) }));
  const label = (document.body.innerText || '').match(/(오늘|어제|지난 \d+일|이번 달|지난달|20\d\d[./]\d+[./]\d+\s*[-–~]\s*20\d\d[./]\d+[./]\d+)/g) || [];
  return { sel: sel.slice(0, 10), labels: [...new Set(label)].slice(0, 6), url: location.href.slice(-40) };
});
console.log('기간 후보=' + JSON.stringify(d.sel));
console.log('화면 라벨=' + JSON.stringify(d.labels) + ' · url=' + d.url);
