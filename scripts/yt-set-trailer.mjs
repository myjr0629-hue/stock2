#!/usr/bin/env node
// ============================================================================
// yt-set-trailer — 트레일러를 올리고 «채널 트레일러»로 지정한다 (전부 API)
// ----------------------------------------------------------------------------
// ⛔ 비공개(unlisted)로 올린다. 33초 세로 영상을 «공개»로 두면 쇼츠 피드에 섞여
//   낮은 지속률로 채널 평균을 끌어내린다. 트레일러는 채널 페이지에서만 재생되면 된다.
// ⛔ 이건 쇼츠가 아니므로 shorts-gate(30초 상한)의 대상이 아니다.
// ============================================================================
import { readFileSync, statSync, createReadStream, existsSync } from 'node:fs';

const FILE = process.argv[2];
if (!FILE || !existsSync(FILE)) { console.error('사용: yt-set-trailer <mp4>'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }),
  })).json();
  return j.access_token;
})();

const NL = '\n';
const meta = {
  snippet: {
    title: 'SIGNUM HQ - We run the numbers',
    description: [
      'https://www.signumhq.com/app - FREE market intel on iOS and Android.', '',
      'Everyone reports the headline. We compute the number and put it on screen.',
      'Raw daily closes and the options book, run through our own math.', '',
      'Four series, new on every trading day, under thirty seconds each:',
      '- Why The Market Moved', '- Chip Watch', '- Macro Decoded', '- Options And Flow', '',
      'Every figure in this trailer ran in one of our videos. Check them yourself.',
      'Educational only. Not investment advice.',
    ].join(NL),
    tags: ['stock market', 'investing', 'finance', 'options', 'market analysis'],
    categoryId: '25', defaultLanguage: 'en', defaultAudioLanguage: 'en',
  },
  status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
};

// ── 재개 가능 업로드 ────────────────────────────────────────────────────────
const size = statSync(FILE).size;
const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
  method: 'POST',
  headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
    'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' },
  body: JSON.stringify(meta),
});
const loc = init.headers.get('location');
if (!loc) { console.error('업로드 세션 실패', init.status, (await init.text()).slice(0, 200)); process.exit(1); }

const put = await fetch(loc, {
  method: 'PUT', headers: { 'Content-Length': String(size), 'Content-Type': 'video/mp4' },
  body: createReadStream(FILE), duplex: 'half',
});
const v = await put.json();
if (!v.id) { console.error('업로드 실패', JSON.stringify(v).slice(0, 240)); process.exit(1); }
console.log(`  ✔ 업로드 ${v.id}  (unlisted)`);

// ── 썸네일 ──────────────────────────────────────────────────────────────────
const thumb = FILE.replace(/\.mp4$/i, '_thumb.jpg');
if (existsSync(thumb)) {
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${v.id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'image/jpeg' },
    body: readFileSync(thumb),
  });
  console.log(`  ${r.ok ? '✔' : '✗'} 썸네일`);
}

// ── 채널 트레일러로 지정 ────────────────────────────────────────────────────
const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&mine=true',
  { headers: { Authorization: `Bearer ${tok}` } })).json();
const c = ch.items[0];
const bs = c.brandingSettings || {};
bs.channel = { ...(bs.channel || {}), unsubscribedTrailer: v.id };
const up = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', {
  method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: c.id, brandingSettings: bs }),
});
const uj = await up.json();
console.log(up.ok
  ? `  ✔ 채널 트레일러로 지정  ${uj.brandingSettings?.channel?.unsubscribedTrailer}`
  : `  ✗ 지정 실패 ${up.status} ${JSON.stringify(uj).slice(0, 200)}`);
console.log(`  https://youtu.be/${v.id}`);
