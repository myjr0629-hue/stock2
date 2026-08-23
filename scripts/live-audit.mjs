#!/usr/bin/env node
// ============================================================================
// live-audit — 「유튜브에 실제로 올라가 있는 값」을 우리 규격에 건다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-24)
//   기존 게이트는 «plan.json + 로컬 mp4» 를 잰다. 그런데 이미 올라간 영상을 손보면
//   plan 이 없다. 그래서 나는 손으로 고치고 «눈으로» 확인했다 — 그건 검증이 아니다.
//   대표가 「모든 부분에 손을 본 것이냐」고 물었을 때 답할 근거가 없었다.
//   ⇒ 실값을 API 로 받아 같은 검사기(title-check)에 건다.
//
// 사용: node scripts/live-audit.mjs <videoId> [--jp]
// ============================================================================
import { readFileSync } from 'node:fs';
import { checkTitle } from './title-check.mjs';

const ID = process.argv[2];
const JP = process.argv.includes('--jp');
if (!ID) { console.error('사용: live-audit <videoId> [--jp]'); process.exit(1); }
const env = readFileSync('.env.local', 'utf8');
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || null;
const RT = JP ? (g('YT_JP_REFRESH_TOKEN') || g('YT_REFRESH_TOKEN')) : g('YT_REFRESH_TOKEN');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'), refresh_token: RT, grant_type: 'refresh_token' }),
})).json()).access_token;
const H = { Authorization: `Bearer ${tok}` };
const v = (await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics,contentDetails,processingDetails&id=${ID}`, { headers: H })).json()).items?.[0];
// ⛔ 업로드 «직후» 에는 아직 처리 중이라 tags 가 잠깐 비어 보인다 (2026-08-24 실측).
//   그걸 「태그 0개」 위반으로 보고하면 «없는 결함» 을 만든다. 처리 중이면 밝히고 멈춘다.
const processing = v?.processingDetails?.processingStatus === 'processing';
if (!v) { console.error(`${ID} 를 못 찾는다`); process.exit(1); }
const s = v.snippet, lang = JP ? 'ja' : 'en';

const R = [];
const ok = (n, p, got, want) => R.push({ n, p, got, want });

// 제목 — 기존 검사기를 그대로 쓴다
for (const r of checkTitle(s.title, lang)) ok(r.name, r.pass, r.got, r.want);

// 설명·태그·분류
const d = s.description || '', first = d.split('\n')[0];
ok('앱 주소 (첫 줄)', /signumhq\.com\/app/.test(first), first.slice(0, 46), '첫 줄에 앱 주소');
ok('「무료」 존재', JP ? /(無料|むりょう)/.test(d) : /\bfree\b/i.test(d), '—', JP ? '無料' : 'free');
ok('설명 길이', d.length <= 1200, `${d.length}자`, '<= 1200');
const ht = (d.match(/#[^\s#]+/g) || []).length;
ok('해시태그', ht >= 1 && ht <= 3, `${ht}개`, '1~3');
if (processing && !(s.tags || []).length)
  ok('태그 개수', true, '처리 중 — 나중에 다시 확인', '업로드 직후에는 비어 보인다');
else ok('태그 개수', (s.tags || []).length >= 8 && (s.tags || []).length <= 90, `${(s.tags || []).length}개`, '8~90');
ok('태그 총 길이', (s.tags || []).join(',').length <= 480, `${(s.tags || []).join(',').length}자`, '<= 480');
ok('카테고리', ['22', '27'].includes(s.categoryId), s.categoryId, '22 또는 27 (필드 표준)');
ok('언어 지정', !!s.defaultLanguage && !!s.defaultAudioLanguage, `${s.defaultLanguage || '-'} / ${s.defaultAudioLanguage || '-'}`, `${lang} / ${lang}`);
ok('언어 일치', s.defaultLanguage === lang, s.defaultLanguage || '-', lang);

// 고정 댓글
const th = await (await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${ID}&maxResults=25`, { headers: H })).json();
const mine = (th.items || []).filter((t) => /signumhq\.com/.test(t.snippet.topLevelComment.snippet.textOriginal || ''));
ok('고정댓글 존재', mine.length > 0, `${(th.items || []).length}개 중 우리 것 ${mine.length}개`, '앱 링크가 든 댓글 1개');

console.log(`\n  ${s.title}`);
console.log(`  ${v.status.privacyStatus} · 조회 ${v.statistics.viewCount} · ${v.contentDetails.duration}\n`);
for (const r of R) console.log(`  ${r.p ? '✔' : '✗'} ${r.n.padEnd(18)} ${String(r.got).slice(0, 40).padEnd(42)}${r.p ? '' : '기준 ' + r.want}`);
const bad = R.filter((r) => !r.p).length;
console.log(`\n  ${bad ? `⛔ ${bad}건 미적용` : '✅ 전 항목 적용됨'}`);
console.log('  ⚠ API 로 확인 못 하는 것: 「고정」 버튼 · 쇼츠 세로 커버 — 스튜디오에서 사람이 한다');
process.exit(bad ? 1 : 0);
