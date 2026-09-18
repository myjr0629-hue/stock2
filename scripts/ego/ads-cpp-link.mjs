/* «App Store Connect 계정 연결» 안내가 정확히 무엇을 요구하는지 읽는다(읽기 전용) */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
const d = await page.evaluate(() => {
  const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
  const all = walk(document, []); const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
  const box = all.filter(e => /사용 가능한 제품 페이지가 없습니다|App Store Connect 계정 연결/.test(txt(e))).sort((a,b)=>txt(a).length-txt(b).length);
  const full = box.length ? txt(box[box.length-1]).slice(0, 600) : null;
  const links = all.filter(e => e.tagName === 'A' && /연결|Connect|자세히|더 알아보기|Learn/.test(txt(e))).map(e => ({ t: txt(e).slice(0,30), href: e.getAttribute('href') })).slice(0, 6);
  return { full, links };
});
console.log('안내문=' + JSON.stringify(d.full));
console.log('링크=' + JSON.stringify(d.links));
