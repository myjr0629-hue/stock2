/* Quora 내 답변 목록에서 실제 URL 을 «클릭 가능한 링크»로 가져온다(추측 금지 §40①) */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /quora\.com/);
await page.goto('https://www.quora.com/profile/Jiyoung-Kim-236/answers'); await L.wait(9000);
const d = await page.evaluate(() => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  const links = [...document.querySelectorAll('a[href*="/answer/"]')].map(a => a.href).filter((v, i, a) => a.indexOf(v) === i);
  return { url: location.href, gone: /Page Not Found/.test(t.slice(0, 400)), len: t.length,
           answers: links.slice(0, 8), oracle: links.filter(u => /Oracle/i.test(u)) };
});
console.log(JSON.stringify(d, null, 1).slice(0, 900));
