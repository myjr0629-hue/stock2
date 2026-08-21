#!/usr/bin/env node
// ============================================================================
// yt-upload — 완성된 쇼츠를 «비공개 + 예약»으로 채널에 올린다
// ----------------------------------------------------------------------------
// 대표 지시 (2026-08-20): "이제는 니가 직접 올려라 개시는 내가 하더라도"
//   → 업로드는 내가 한다. 공개 전환(개시)은 대표가 한다.
//   → 그래서 privacyStatus 는 항상 «private» 로 올리고, publishAt 을 붙여 예약만 걸어둔다.
//     대표가 스튜디오에서 즉시 공개로 바꾸거나 예약을 그대로 두면 된다.
//
// ⛔ 자막 파일(SRT)을 같이 올리지 않는다 — 영상에 자막이 구워져 있어 이중 자막이 된다
// ⛔ 썸네일은 «본편 프레임 캡처»만 쓴다 (쇼츠는 커버 프레임이 곧 썸네일)
// ⛔ 고정 댓글에는 반드시 앱 주소를 넣는다
//
// 스코프: youtube.force-ssl (videos.insert / thumbnails.set / commentThreads.insert 가능)
//
// 사용:
//   node scripts/yt-upload.mjs <plan.json>
//   node scripts/yt-upload.mjs <plan.json> --dry     # 실제 업로드 없이 검증만
//
// plan.json  = [{ file, title, description, tags[], publishAtKST, thumb?, pinnedComment? }]
// 출력: .agent/PUBLISH_LOG.md 에 추가 기록 + 콘솔
// ============================================================================

import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DRY = process.argv.includes('--dry');
const PLAN = process.argv[2];
if (!PLAN || !existsSync(PLAN)) { console.error('plan.json 이 필요하다'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
// ⛔ 채널 스위치 — SIGNUM_YT=jp 면 일본 채널 토큰을 쓴다 (2026-08-21)
//   기본값은 hq. 환경변수를 «안 주면» 지금까지와 완전히 같게 동작한다.
const RTKEY = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp'
  ? 'YT_JP_REFRESH_TOKEN' : 'YT_REFRESH_TOKEN';
// ⛔ 영상의 «언어»도 채널을 따라가야 한다. en 으로 고정돼 있으면 일본 채널에서
//   자동자막·번역·추천이 전부 영어 기준으로 잡힌다 (2026-08-21).
const LANG = String(process.env.SIGNUM_YT || 'hq').toLowerCase() === 'jp' ? 'ja' : 'en';
const envGet = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
const CID = envGet('YT_CLIENT_ID'), CSEC = envGet('YT_CLIENT_SECRET'), RT = envGet(RTKEY);
if (!CID || !CSEC || !RT) { console.error('.env.local 에 YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN 이 있어야 한다'); process.exit(1); }

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token: RT, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`토큰 갱신 실패: ${JSON.stringify(j)}`);
  return j;
}

/** KST 문자열("2026-08-20 14:30") → RFC3339 UTC. 유튜브 publishAt 은 UTC 만 받는다 */
function kstToUtc(s) {
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) throw new Error(`publishAtKST 형식이 "YYYY-MM-DD HH:MM" 이 아니다: ${s}`);
  const [, Y, M, D, h, mi] = m.map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h - 9, mi, 0)).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ── 재개 가능 업로드 ────────────────────────────────────────────────────────
async function upload(tok, item) {
  const size = statSync(item.file).size;
  const meta = {
    snippet: {
      title: item.title,
      description: item.description,
      tags: item.tags || [],
      categoryId: '25',                    // News & Politics — 금융 시황 채널 기준
      defaultLanguage: LANG,
      defaultAudioLanguage: LANG,
    },
    // ⛔ private 은 «대표 본인만» 볼 수 있다 — 링크를 줘도 남이 못 연다.
    //    홍보 링크로 쓰려면 unlisted(일부공개). 검색·피드에는 안 뜨고 링크로만 열린다.
    status: {
      privacyStatus: item.privacy === 'unlisted' ? 'unlisted' : 'private',
      ...(item.privacy === 'unlisted' ? {} : { publishAt: kstToUtc(item.publishAtKST) }),
      selfDeclaredMadeForKids: false,
      license: 'youtube',
      embeddable: true,
    },
  };
  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    { method: 'POST', headers: {
        Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4',
      }, body: JSON.stringify(meta) });
  if (!init.ok) throw new Error(`업로드 시작 실패 ${init.status}: ${(await init.text()).slice(0, 400)}`);
  const url = init.headers.get('location');
  if (!url) throw new Error('업로드 URL 을 못 받았다');

  const body = createReadStream(item.file);
  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Length': String(size), 'Content-Type': 'video/mp4' },
    body, duplex: 'half',
  });
  if (!put.ok) throw new Error(`업로드 실패 ${put.status}: ${(await put.text()).slice(0, 400)}`);
  return put.json();
}

async function setThumb(tok, id, path) {
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'image/jpeg' },
    body: readFileSync(path),
  });
  return r.ok ? 'ok' : `실패 ${r.status} ${(await r.text()).slice(0, 160)}`;
}

/**
 * 고정 댓글 — 유튜브 API 는 «고정»을 지원하지 않는다. 댓글만 달고 고정은 사람이 한다.
 * ⛔ 업로드 «직후» 에는 영상이 아직 처리 중이라 400/403 이 난다 (실측 2026-08-20).
 *    한 번 실패했다고 포기하면 «앱 주소가 든 댓글»이 영영 안 달린다 → 간격을 두고 재시도한다.
 */
async function comment(tok, id, text, tries = 5) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, 12000));
    const r = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: text } } } }),
    });
    if (r.ok) return `ok (시도 ${i + 1})`;
    last = `${r.status} ${(await r.text()).slice(0, 120)}`;
  }
  return `실패 ${last} — 공개 후 수동으로 달 것`;
}

// ── 사전 검증 — 규약 위반을 «올리기 전에» 잡는다 ────────────────────────────
function validate(it, i) {
  const e = [];
  if (!existsSync(it.file)) e.push(`파일 없음: ${it.file}`);
  if (!it.title) e.push('제목 없음');
  if (it.title && it.title.length > 100) e.push(`제목 ${it.title.length}자 (상한 100)`);
  if (!it.description) e.push('설명 없음');
  if (it.description && it.description.length > 5000) e.push('설명 5000자 초과');
  if (!/signumhq\.com/i.test(it.description || '')) e.push('설명에 앱 주소가 없다');
  if (!/\bfree\b/i.test(it.title || '') && !/\bfree\b/i.test(it.description || ''))
    e.push('제목·설명 어디에도 FREE 가 없다');           // 대표 지시(2026-08-20)
  if (it.privacy !== 'unlisted') {
    if (!it.publishAtKST) e.push('publishAtKST 없음');
    else {
      const h = +String(it.publishAtKST).match(/[ T](\d{2}):/)[1];
      if (h >= 22 || h < 1) e.push(`게시 ${h}시 KST — 실측상 최악 구간(d-0.15, n=578)`);
    }
  }
  if (it.pinnedComment && !/signumhq\.com/i.test(it.pinnedComment)) e.push('고정 댓글에 앱 주소가 없다');
  if (it.thumb && !existsSync(it.thumb)) e.push(`썸네일 없음: ${it.thumb}`);
  if ((it.tags || []).join(',').length > 480) e.push('태그 총 길이 500자 초과 위험');
  return e;
}

const items = JSON.parse(readFileSync(PLAN, 'utf8'));
console.log(`\n  계획 ${items.length}건 · ${DRY ? '검증만(--dry)' : '실제 업로드'}\n`);

let bad = 0;
items.forEach((it, i) => {
  const e = validate(it, i);
  console.log(`  [${i + 1}] ${it.title}`);
  console.log(`      ${it.file}`);
  console.log(`      ${it.privacy === 'unlisted' ? '일부공개(unlisted) — 링크로만 열림 · 예약 없음' : `게시예약 KST ${it.publishAtKST}`}`);
  if (e.length) { bad++; e.forEach((x) => console.log(`      ✗ ${x}`)); }
  else console.log('      ✔ 규약 통과');
});
if (bad) { console.log(`\n  ${bad}건 위반 — 업로드하지 않는다\n`); process.exit(1); }
if (DRY) { console.log('\n  검증만 수행했다. 실제 업로드는 --dry 없이 실행\n'); process.exit(0); }

// ⛔ 정본 규격 게이트 — 사람 기억에 맡기지 않는다 (2026-08-20 대표 지적)
//   "조사보고에서 끝낸것이 아니라" — 실제로 개념편에만 적용하고 브리핑은 감사하지 않았다.
//   이제 업로드 경로에서 «영상 파일을 직접 재서» 위반이면 여기서 멈춘다.
{
  const g = spawnSync(process.execPath, ['scripts/shorts-gate.mjs', PLAN], { stdio: 'inherit' });
  if (g.status !== 0) { console.error('  shorts-gate 불통과 — 업로드를 중단한다'); process.exit(1); }
}

const { access_token, scope } = await accessToken();
console.log(`\n  스코프: ${scope}`);
if (!/youtube\.force-ssl|youtube\.upload/.test(scope)) {
  console.error('  업로드 스코프가 없다. node scripts/yt-auth.mjs 로 다시 인증해야 한다'); process.exit(1);
}

const done = [];
for (const it of items) {
  process.stdout.write(`\n  ▶ ${it.title}\n    업로드 중...`);
  const v = await upload(access_token, it);
  const url = `https://youtube.com/shorts/${v.id}`;
  process.stdout.write(` ✔ ${v.id}\n`);
  if (it.thumb) console.log(`    썸네일: ${await setThumb(access_token, v.id, it.thumb)}`);
  if (it.pinnedComment) console.log(`    댓글:   ${await comment(access_token, v.id, it.pinnedComment)}  (고정은 스튜디오에서 수동)`);
  console.log(`    ${url}`);
  done.push({ ...it, id: v.id, url });
}

const log = `\n## ${items[0].publishAtKST.slice(0, 10)} 업로드 (비공개+예약)\n\n` +
  done.map((d) => `- [${d.title}](${d.url}) — 예약 KST ${d.publishAtKST} · \`${d.id}\``).join('\n') + '\n';
appendFileSync('.agent/PUBLISH_LOG.md', log);
console.log(`\n  ${done.length}건 완료 → .agent/PUBLISH_LOG.md 기록`);
console.log('  ⚠ 전부 «비공개+예약» 상태다. 개시는 스튜디오에서 대표가 한다.');
console.log('  ⚠ 사람이 해야 하는 일 2가지 (API 없음):');
console.log('     1) 고정 댓글의 「고정」 버튼');
console.log('     2) Studio > 세부정보 > 썸네일 에 <이름>_thumb.jpg 업로드');
console.log('        - 쇼츠 커버는 API 로 못 바꾼다 (2026-08-21 확인)');
