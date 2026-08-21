#!/usr/bin/env node
// ============================================================================
// yt-boost — 「같은 영상 하나로 여러 언어 시장에 걸친다」
// ----------------------------------------------------------------------------
// ⛔ 대표 지시 2026-08-21: "수단과 방법을 가리지 말고 트래픽을 올려"
//   "치트키라도 쓰면서 내가 모르는 소구점을 짚어내고 여기 뚫고 가보자고 해야지"
//
// 우리가 «안 쓰고 있던» 자리 (전부 공짜다)
//
//   ① 현지화(localizations)  영어 영상에 «일본어 제목·설명»을 붙일 수 있다.
//      일본 사용자는 일본어 제목으로 본다 — 영상 하나가 두 시장에 걸린다.
//      ⛔ snippet.defaultLanguage 가 있어야 붙는다 (우리는 en/ja 로 설정돼 있다)
//
//   ② 자막(captions)  우리는 «대본 원문»을 갖고 있다. ASR 자동자막 말고 진짜 자막을 넣으면
//      정확도가 올라가고, 유튜브가 그걸 «전 언어로 자동 번역»해준다.
//      검색·추천 표면이 통째로 늘어난다.
//
//   ③ 설명 5,000자  우리는 366자만 썼다 (7%). 설명은 검색에 색인된다.
//   ④ 해시태그 15개  우리는 3개만 썼다. 앞 3개는 제목 위에 뜬다.
//
// ⛔ 지키는 선: 금융·주식 «영역 안». 그리고 «없는 사실을 만들지 않는다».
//   현지화 문구는 «번역»이지 새 주장이 아니다.
//
// 사용: node scripts/yt-boost.mjs <plan.json> <videoId> [--write]
//       SIGNUM_YT=jp node scripts/yt-boost.mjs ...
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PLAN = process.argv[2], VID = process.argv[3];
const WRITE = process.argv.includes('--write');
if (!PLAN || !VID) { console.error('사용: yt-boost <plan.json> <videoId> [--write]'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
const RTKEY = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp'
  ? 'YT_JP_REFRESH_TOKEN' : 'YT_REFRESH_TOKEN';
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };

const tok = await (async () => {
  const j = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
      refresh_token: g(RTKEY), grant_type: 'refresh_token' }),
  })).json();
  if (!j.access_token) { console.error('  토큰 실패'); process.exit(1); }
  return j.access_token;
})();
const H = { Authorization: `Bearer ${tok}` };
const HJ = { ...H, 'Content-Type': 'application/json' };

const item = [].concat(JSON.parse(readFileSync(PLAN, 'utf8')))[0];

// ── 현재 상태 ───────────────────────────────────────────────────────────────
const cur = await (await fetch(
  `https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations&id=${VID}`, { headers: H })).json();
const sn = cur.items?.[0]?.snippet;
if (!sn) { console.error('  영상을 못 읽었다'); process.exit(1); }
const have = Object.keys(cur.items[0].localizations || {});
console.log(`\n  ${sn.title}`);
console.log(`   기본언어 ${sn.defaultLanguage || '미설정'}  ·  현지화 [${have.join(', ') || '없음'}]  ·  설명 ${sn.description.length}자`);

// ── ① 현지화 ────────────────────────────────────────────────────────────────
const loc = item.localizations || {};
const want = Object.keys(loc);
if (!want.length) {
  console.log('   ⚠ plan 에 localizations 가 없다 — 건너뛴다');
} else {
  console.log(`\n   ① 현지화 추가: ${want.join(', ')}`);
  for (const [lg, v] of Object.entries(loc)) {
    console.log(`      ${lg}  ${v.title}`);
    console.log(`          설명 ${v.description.length}자`);
  }
  if (WRITE) {
    // ⛔ 기존 현지화를 지우지 않는다 — 병합
    const merged = { ...(cur.items[0].localizations || {}), ...loc };
    const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet,localizations', {
      method: 'PUT', headers: HJ,
      body: JSON.stringify({
        id: VID,
        snippet: { title: sn.title, description: sn.description, categoryId: sn.categoryId,
          tags: sn.tags, defaultLanguage: sn.defaultLanguage, defaultAudioLanguage: sn.defaultAudioLanguage },
        localizations: merged,
      }),
    });
    const j = await r.json();
    console.log(r.ok ? `      ✔ 반영 — 현지화 [${Object.keys(j.localizations || {}).join(', ')}]`
      : `      ✗ ${r.status} ${JSON.stringify(j).slice(0, 180)}`);
  }
}

// ── ② 자막 ──────────────────────────────────────────────────────────────────
const srt = `.agent/srt/${(item.scriptTag || '').toLowerCase()}.srt`;
const capLang = item.lang || 'en';
console.log(`\n   ② 자막 (${capLang})`);
const caps = await (await fetch(
  `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${VID}`, { headers: H })).json();
const tracks = caps.items || [];
console.log(`      기존 트랙 ${tracks.length}개: ${tracks.map((t) => `${t.snippet.language}(${t.snippet.trackKind})`).join(', ') || '없음'}`);

if (!existsSync(srt)) {
  console.log(`      ⚠ ${srt} 가 없다 — 먼저 만든다:  node scripts/make-srt.mjs ${item.scriptTag}`);
} else if (tracks.some((t) => t.snippet.language === capLang && t.snippet.trackKind !== 'ASR')) {
  console.log('      · 이미 «직접 넣은» 트랙이 있다 — 건너뛴다');
} else if (WRITE) {
  // multipart 업로드 — curl 로 던진다 (node fetch 로 multipart 조립하면 경계 처리가 번거롭다)
  const meta = JSON.stringify({ snippet: { videoId: VID, language: capLang, name: '', isDraft: false } });
  const r = spawnSync('curl', ['-s', '-X', 'POST',
    'https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart',
    '-H', `Authorization: Bearer ${tok}`,
    '-F', `metadata=${meta};type=application/json`,
    '-F', `file=@${srt};type=text/plain`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = (r.stdout || '').trim();
  console.log(out.includes('"id"') ? '      ✔ 자막 업로드 완료' : `      ✗ ${out.slice(0, 220)}`);
} else {
  console.log(`      · ${srt} 준비됨 — --write 로 올린다`);
}

console.log(WRITE ? '' : '\n  ── 미리보기만 했다. 반영하려면 --write ──\n');
