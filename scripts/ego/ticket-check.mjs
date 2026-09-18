/* 대표 티켓이 풀렸는지 한 번에 확인 — t198(계정 연결) · t196(네이버 소유확인) · t192(Qiita) */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com|naver|qiita/);
// t198 — 광고그룹 «광고 소재» 에 제품 페이지가 보이나
await page.goto('https://app-ads.apple.com/cm/app/23872040/report/campaign/2144650799/adgroup/2151021409'); await L.wait(13000);
if (/idmsa|signin/.test(await page.url())) console.log('t198=SESSION_EXPIRED');
else {
  await L.clickText(page, /^광고 소재$/, { deep: true, after: 10000 });
  console.log('t198=' + JSON.stringify(await page.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    return { 제품페이지없음: /사용 가능한 제품 페이지가 없습니다|사용 가능한 제품 페이지 없음/.test(t), 기본광고: /Default Ad/.test(t), CPP이름: /web home/.test(t) };
  })));
}
// t196 — 네이버 소유확인
await page.goto('https://searchadvisor.naver.com/console/board'); await L.wait(7000);
console.log('t196=' + JSON.stringify(await page.evaluate(() => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ');
  return { 미완: /소유확인 진행/.test(t), 사이트: /signumhq\.com/.test(t) };
})));
// t192 — Qiita 공개 글
await page.goto('https://qiita.com/signumhq'); await L.wait(6000);
console.log('t192=' + JSON.stringify(await page.evaluate(() => ({ items: [...document.querySelectorAll('a[href*="/signumhq/items/"]')].map(a => a.href).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2), title: /ダークプール/.test(document.body.innerText) }))));
