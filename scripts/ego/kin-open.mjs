/* 지식iN — 후보 질문을 열어 «기존 답변»을 읽는다(없는 이야기를 쓰기 위해). */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /kin\.naver\.com/);
const Q = process.env.Q || '애프터마켓 등락율';
await page.goto('https://kin.naver.com/search/list.naver?query=' + encodeURIComponent(Q) + '&sort=date'); await L.wait(5000);
const list = await page.evaluate(() => [...document.querySelectorAll('a[href*="detail.naver"]')]
  .map(a => ({ t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60), href: a.href }))
  .filter(x => x.t && /주식|미국|마켓|나스닥|증권|앱/.test(x.t)).filter((v, i, a) => a.findIndex(z => z.href === v.href) === i).slice(0, 6));
console.log('후보=' + JSON.stringify(list, null, 1).slice(0, 900));
for (const c of list.slice(0, 3)) {
  await page.goto(c.href); await L.wait(4500);
  const d = await page.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    const q = (document.querySelector('.c-heading__title, .title') || {}).innerText || '';
    const body = (document.querySelector('.c-heading__content, .questionDetail') || {}).innerText || '';
    return { url: location.href, q: q.replace(/\s+/g, ' ').slice(0, 80), body: body.replace(/\s+/g, ' ').slice(0, 220),
             answers: [...document.querySelectorAll('.answer-content__list .answerArea, .answer-content__item')].length,
             hasWriteBtn: !!document.querySelector('button._answerWriteButton'), closed: /채택된 답변|질문 마감/.test(t) };
  });
  console.log('— ' + JSON.stringify(d).slice(0, 520));
}
