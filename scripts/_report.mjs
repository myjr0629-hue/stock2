#!/usr/bin/env node
// ============================================================================
// _report — 테스트 편들의 결과를 한 장으로 낸다.
// ----------------------------------------------------------------------------
// ⛔ 왜 필요한가 (2026-08-23)
//   지금까지 판정을 «그때그때 눈으로» 했다. 그래서 테스트1 이 끊긴 것도 한참 뒤에 알았다.
//   판정 기준을 코드에 박아두면 다음 세션·다른 사람도 같은 기준으로 읽는다.
//
// 판정 기준 (§0-b 실측 근거)
//   우리 21편에서 «첫날이 최종의 95%» (rho=0.934) 였다. 그래서 초반 곡선이 곧 결과다.
//   - 종료 판정 : 최근 15분 이상 증가 0
//   - 비교      : 기존 28편의 48시간 조회 중앙 42회 · 역대 최고 220회
//
// 사용: node scripts/_report.mjs                 (추적 파일이 있는 전부)
//       node scripts/_report.mjs <id> [<id>...]
// ============================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const BASE_MED = 42;     // 기존 28편 48시간 조회 중앙값
const BASE_BEST = 220;   // 기존 역대 최고 (48시간)

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const AT = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET,
    refresh_token: env.YT_REFRESH_TOKEN, grant_type: 'refresh_token',
  }),
})).json()).access_token;
const H = { headers: { authorization: `Bearer ${AT}` } };

let ids = process.argv.slice(2);
if (!ids.length) {
  ids = readdirSync('.agent').filter((f) => /^_track_.+\.tsv$/.test(f))
    .map((f) => f.replace(/^_track_/, '').replace(/\.tsv$/, ''));
}
if (!ids.length) { console.log('  추적 파일이 없다'); process.exit(0); }

const j = await (await fetch(
  `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}`, H)).json();

const curve = (id) => {
  const p = `.agent/_track_${id}.tsv`;
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n').slice(1)
    .map((l) => l.split('\t')).filter((c) => c.length >= 3 && c[1] !== 'ERR')
    .map((c) => ({ ms: Date.parse(c[0]), min: +c[1], views: +c[2] }))
    .sort((a, b) => a.min - b.min);
};

console.log('\n  ══════════ 테스트 결과 보고 ══════════');
console.log(`  기준선: 기존 28편 48시간 조회 중앙 ${BASE_MED}회 · 역대 최고 ${BASE_BEST}회\n`);

const out = [];
for (const id of ids) {
  const v = j.items?.find((x) => x.id === id);
  if (!v) { console.log(`  ${id} — 못 읽음`); continue; }
  const ageMin = (Date.now() - Date.parse(v.snippet.publishedAt)) / 60000;
  const views = +v.statistics.viewCount;
  const c = curve(id);

  // 종료 판정 — 최근 15분간 증가가 없으면 끝난 것으로 본다
  const cutoff = Date.now() - 15 * 60000;
  const recent = c.filter((r) => r.ms >= cutoff);
  const grew = recent.length >= 2 ? recent[recent.length - 1].views - recent[0].views : null;
  const done = recent.length >= 3 && grew === 0;

  // 파동 세기 — 3분 이상 멈췄다가 다시 오른 횟수
  let waves = 0, wasFlat = false;
  for (let i = 1; i < c.length; i++) {
    const d = c[i].views - c[i - 1].views;
    if (d === 0) wasFlat = true;
    else if (d > 0 && wasFlat) { waves++; wasFlat = false; }
  }

  out.push({ id, t: v.snippet.title, views, ageMin, done, waves,
    likes: +(v.statistics.likeCount || 0), cmts: +(v.statistics.commentCount || 0) });

  console.log(`  ── ${v.snippet.title.slice(0, 58)}`);
  console.log(`     ${id} · ${ageMin.toFixed(0)}분 경과`);
  console.log(`     조회 ${views}회   좋아요 ${v.statistics.likeCount || 0}   댓글 ${v.statistics.commentCount || 0}`);
  console.log(`     상태 ${done ? '✅ 종료 (최근 15분 증가 0)' : `▶ 진행 중 (최근 15분 +${grew ?? '?'}회)`}`);
  console.log(`     기존 중앙 대비 ${(views / BASE_MED).toFixed(1)}배 · 역대 최고 대비 ${(views / BASE_BEST).toFixed(2)}배`);
  console.log(`     2차 이후 파동 ${waves}회`);
  if (c.length) {
    const marks = [1, 5, 10, 15, 30, 60, 120, 240];
    const at = (m) => { const r = [...c].reverse().find((x) => x.min <= m); return r ? r.views : null; };
    console.log('     곡선  ' + marks.filter((m) => m <= ageMin)
      .map((m) => `${m}분 ${at(m) ?? '-'}`).join('  ·  '));
  }
  console.log('');
}

if (out.length >= 2) {
  console.log('  ── 같은 경과 시점 대조 ──');
  const cs = out.map((o) => ({ o, c: curve(o.id) }));
  const minAge = Math.min(...out.map((o) => o.ageMin));
  for (const m of [5, 10, 15, 20, 30, 45, 60].filter((m) => m <= minAge)) {
    const line = cs.map(({ o, c }) => {
      const r = [...c].reverse().find((x) => x.min <= m);
      return `${o.id.slice(0, 6)} ${String(r ? r.views : '-').padStart(4)}`;
    }).join('   ');
    console.log(`     ${String(m).padStart(3)}분   ${line}`);
  }
  console.log('\n  ⛔ 주의: 테스트1(wfO7CbK)은 30분 시점에 테스트2 업로드로 «잘렸다».');
  console.log('     그 뒤 수치는 자연 종료가 아니다. 대조에서 빼고 읽을 것.');
}
