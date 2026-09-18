/* Quora 답변 생존 확인 — 서버 fetch 는 403 이라 브라우저로 본다(기록: 링크 답변은 지워진다) */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /quora\.com/);
// ⚠ ego 안의 node 는 셸 환경변수를 물려받지 않는다(실측) → 파일로 넘긴다: /tmp/urls.txt 한 줄에 하나
const fs = await import('node:fs');
const urls = fs.readFileSync('/tmp/urls.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
for (const u of urls) {
  await page.goto(u); await L.wait(6000);
  console.log(JSON.stringify(await page.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    return { url: location.href.slice(0, 70), gone: /삭제|deleted|not found|no longer available|이 페이지를 찾을 수 없/i.test(t.slice(0, 1500)),
             hasAnswer: /signum|SIGNUM|dark pool|gamma|max pain/i.test(t), len: t.length, head: t.slice(0, 200) };
  })));
}
