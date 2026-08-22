// race 1편의 «올라가는 속도» 를 자동으로 남긴다.
// ----------------------------------------------------------------------------
// ⛔ 왜 필요한가 (2026-08-23)
//   기존 28편은 «분 단위 이력이 하나도 없다». 그래서 새 편이 빨라 보여도
//   「원래 초반은 이렇다」인지 「이번이 다르다」인지 가릴 근거가 없다.
//   ⇒ 지금부터 남긴다. 다음 편부터는 같은 창에서 대조가 된다.
//
// 사용: node scripts/_track-loop.mjs <videoId> [분간격=3] [총시간분=180]
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';

const ID = process.argv[2] || 'wfO7CbK8-xQ';
const EVERY = Number(process.argv[3] || 3) * 60000;
const UNTIL = Date.now() + Number(process.argv[4] || 180) * 60000;
const OUT = `.agent/_track_${ID}.tsv`;

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET,
      refresh_token: env.YT_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  return (await r.json()).access_token;
}

if (!existsSync(OUT)) writeFileSync(OUT, 'iso\tminutes\tviews\tlikes\tcomments\tperMin\n');

let pubMs = null, prev = null, prevT = null;
while (Date.now() < UNTIL) {
  try {
    const AT = await token();
    const j = await (await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ID}`,
      { headers: { authorization: `Bearer ${AT}` } })).json();
    const v = j.items?.[0];
    if (v) {
      if (pubMs === null) pubMs = Date.parse(v.snippet.publishedAt);
      const now = Date.now();
      const mins = (now - pubMs) / 60000;
      const views = +v.statistics.viewCount;
      // 「올라가는 속도」 = 직전 표본 이후의 분당 증가분. 누적÷경과가 아니다.
      //   누적÷경과는 초반 급등을 뒤로 갈수록 «희석» 해 실제 감속을 못 보여준다.
      const perMin = (prev !== null && prevT !== null)
        ? ((views - prev) / ((now - prevT) / 60000)).toFixed(1) : '';
      appendFileSync(OUT, [new Date(now).toISOString(), mins.toFixed(1), views,
        v.statistics.likeCount || 0, v.statistics.commentCount || 0, perMin].join('\t') + '\n');
      console.log(`${mins.toFixed(1)}분\t${views}회\t직전대비 ${perMin || '-'}/분`);
      prev = views; prevT = now;
    }
  } catch (e) {
    appendFileSync(OUT, `${new Date().toISOString()}\tERR\t${String(e).slice(0, 80)}\n`);
  }
  await new Promise((r) => setTimeout(r, EVERY));
}
console.log('추적 종료');
