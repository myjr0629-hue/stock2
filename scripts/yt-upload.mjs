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
      // ⛔ 기본 25(News & Politics). 항목에서 덮어쓸 수 있다.
      //   실측 2026-08-23 : 영어권 신규채널 폭발작 532편의 카테고리는
      //   22 People&Blogs 48.7% · 27 Education 38.5% · 25 News&Politics 4.1% 였다.
      //   (대조군 1,692편은 51.8% / 32.2% / 6.2%) — 25 는 이 바닥의 표준이 아니다.
      //   다만 「25 라서 안 된다」는 증거는 약하다. A/B 로만 바꾼다.
      categoryId: String(item.categoryId || '25'),
      defaultLanguage: LANG,
      defaultAudioLanguage: LANG,
    },
    // ⛔ private 은 «대표 본인만» 볼 수 있다 — 링크를 줘도 남이 못 연다.
    //    홍보 링크로 쓰려면 unlisted(일부공개). 검색·피드에는 안 뜨고 링크로만 열린다.
    status: {
      // ⛔ 기본은 private+예약이다 (개시는 대표 몫). 'public' 은 대표가 «명시적으로»
      //   지시한 테스트 업로드에만 쓴다 — 2026-08-23 "이것 그냥 테스트로 공개로 올려봐".
      privacyStatus: item.privacy === 'public' ? 'public'
        : item.privacy === 'unlisted' ? 'unlisted' : 'private',
      ...(item.privacy === 'public' || item.privacy === 'unlisted'
        ? {} : { publishAt: kstToUtc(item.publishAtKST) }),
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
  // 유튜브는 세로 썸네일을 받아도 1280x720 «가로»로 바꾼다 (2026-08-21 실측).
  //   좌우가 흐린 배경으로 채워져 «가운데만» 우리 그림이 된다.
  //   ⇒ finish-video 가 만들어둔 _thumb16.jpg 가 있으면 «그것»을 올린다.
  //   ⛔ 쇼츠 «피드»의 세로 커버는 별개 필드이고 API 가 없다 — 스튜디오에서만.
  const wide = String(path).replace(/_thumb\.jpg$/i, '_thumb16.jpg');
  const use = existsSync(wide) ? wide : path;
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'image/jpeg' },
    body: readFileSync(use),
  });
  return r.ok ? `ok (${use.endsWith('_thumb16.jpg') ? '16:9' : '세로'})` : `실패 ${r.status} ${(await r.text()).slice(0, 160)}`;
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
  // 「무료」를 반드시 밝힌다 (대표 지시 2026-08-20)
  // ⛔ 단어는 언어를 따라간다. 일본어 설명에 'FREE' 를 박으면 그 줄만 영어가 되어
  //   문장이 어긋난다 — 일본어에서는 «無料» 가 같은 일을 한다. (2026-08-21)
  const FREE_WORD = LANG === 'ja' ? /(無料|むりょう)/ : /\bfree\b/i;
  if (!FREE_WORD.test(it.title || '') && !FREE_WORD.test(it.description || ''))
    e.push(`제목·설명 어디에도 ${LANG === 'ja' ? '「無料」' : 'FREE'} 가 없다`);
  // ⛔ 예약 검사는 «예약이 있는 건» 에만 돈다.
  //   public/unlisted 는 예약 없이 바로 게시되므로 publishAtKST 가 없다.
  //   (이 가드가 없으면 String(undefined).match(...) 로 죽는다)
  if (it.privacy !== 'unlisted' && it.privacy !== 'public') {
    if (!it.publishAtKST) e.push('publishAtKST 없음');
    else {
      const m = String(it.publishAtKST).match(/[ T](\d{2}):/);
      if (!m) e.push(`publishAtKST 형식 오류: ${it.publishAtKST}`);
      else {
        const h = +m[1];
        if (h >= 22 || h < 1) e.push(`게시 ${h}시 KST — 실측상 최악 구간(d-0.15, n=578)`);
      }
    }
  }
  if (it.pinnedComment && !/signumhq\.com/i.test(it.pinnedComment)) e.push('고정 댓글에 앱 주소가 없다');
  // ⛔ 「이미 올린 영상과 같은 소리를 또 하는가」 (2026-08-24 신설)
  //   실제 사고: SCRIPT_JPPOST 를 «갈래 확장»으로 만들었는데 이미 825회를 기록 중이던
  //   SCRIPT_JPGAMMA 와 같은 발견이었다 (12종목·11/12·p=0.0063·NVDA 예외).
  //   업로드·예약까지 갔고 사람이 잡았다. 기억에 맡기지 않고 여기서 막는다.
  if (it.scriptTag) {
    const r = spawnSync(process.execPath, ['scripts/_dupe-check.mjs', it.scriptTag],
      { encoding: 'utf8' });
    if (r.status !== 0 && it.dupeOk) {
      // ⛔ 의도된 중복만 통과한다. 검사를 «끄지» 않고, 사람이 쓴 사유를 «요구» 한다.
      //   실제 사례(2026-08-24): 롱폼이 숏폼 3편의 발견을 묶은 편집본이라 전부 겹친다.
      //   사유가 없으면 그대로 막힌다 — 그래야 JPPOST 같은 «모르고 낸 중복» 은 계속 잡힌다.
      console.warn(`      ⚠ 대본 중복 «인지하고» 진행: ${it.dupeOk}`);
      String(r.stdout || '').split('\n').filter((l) => /SCRIPT_/.test(l))
        .forEach((l) => console.warn('        ' + l.trim()));
    } else if (r.status !== 0) {
      e.push('기존 대본과 같은 발견일 수 있다 — node scripts/_dupe-check.mjs ' + it.scriptTag);
      String(r.stdout || '').split('\n').filter((l) => /SCRIPT_|⛔/.test(l))
        .forEach((l) => e.push('   ' + l.trim()));
    }
  }
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
  console.log(`      ${
    it.privacy === 'public' ? '⚠ 즉시 «공개» — 올리는 순간 전 세계에 보인다 (대표 명시 지시분만)'
    : it.privacy === 'unlisted' ? '일부공개(unlisted) — 링크로만 열림 · 예약 없음'
    : `게시예약 KST ${it.publishAtKST}`}`);
  if (e.length) { bad++; e.forEach((x) => console.log(`      ✗ ${x}`)); }
  else console.log('      ✔ 규약 통과');
});
if (bad) { console.log(`\n  ${bad}건 위반 — 업로드하지 않는다\n`); process.exit(1); }
// ⛔ 시청자 시간대 검사 (2026-08-23 신설).
//   테스트3 을 미국 동부 새벽 4:36 에 올렸다 — 시청자가 자는 시간이다.
//   시각을 보지도 않고 올렸고 막을 장치가 없었다.
//   ⚠ 표본이 얇다(새벽 2편) — 금지가 아니라 경고다. --force-hour 로 강행한다.
{
  if (process.argv.includes('--force-hour')) {
    console.warn('  ⚠ --force-hour — 시간대 검사를 건너뛴다.');
  } else {
    // ⛔ «업로드 시각» 이 아니라 «게시 시각» 을 본다 (2026-08-24).
    //   예약 업로드는 지금 올려도 게시는 나중이다. 이 구분이 없어서 JST 00:01 에
    //   「14:00 게시」 건을 막았다 — 검사 대상 자체가 틀렸다.
    const sched = items.map((x) => x.publishAtKST).filter(Boolean);
    const at = sched.length ? ['--at=' + sched[0]] : [];
    const hq = spawnSync(process.execPath, ['scripts/_publish-hour.mjs', ...at], { stdio: 'inherit' });
    if (hq.status !== 0) {
      console.error('  시청자가 자는 시간대다 — 업로드를 중단한다.');
      process.exit(1);
    }
  }
}

// ⛔ 직전 편이 «아직 달리는지» 먼저 본다 (2026-08-23 신설).
//   테스트1 이 30분째 2차 파동으로 오르는 중에 테스트2 를 올렸고,
//   테스트1 은 그 순간 280회에서 멈췄다. 유튜브는 «가장 최신 쇼츠» 에 배포를 몰아준다.
//   이 결론(z=3.02)을 직접 재서 보고해놓고 30분 뒤에 어겼다.
//   ⇒ 기억·판단에 맡기지 않고 업로드 경로에서 막는다.
//   ⚠ 이 검사를 건너뛰려면 --force-interval 을 «명시» 해야 한다.
{
  // ⛔ 이 검사는 «지금 게시되는» 건에만 뜻이 있다 (2026-08-24).
  //   예약분은 지금 올려도 게시가 몇 시간 뒤다. 그때 직전 편은 이미 끝나 있다.
  //   실제로 「14시간 뒤 게시」 건이 지금 달리는 직전 편 때문에 막혔다 — 잘못 막은 것이다.
  //   ⇒ 예약이 6시간 이상 남았으면, 지금 상태 대신 «게시 간격» 을 본다.
  //     간격이 곧 자기잠식을 결정하는 값이고, 그건 예약 시각이 이미 정해놨다.
  const firstAt = items.map((x) => x.publishAtKST).filter(Boolean)[0];
  const hoursOut = firstAt
    ? (Date.UTC(+firstAt.slice(0, 4), +firstAt.slice(5, 7) - 1, +firstAt.slice(8, 10),
                +firstAt.slice(11, 13) - 9, +firstAt.slice(14, 16)) - Date.now()) / 36e5
    : 0;
  if (process.argv.includes('--force-interval')) {
    console.warn('  ⚠ --force-interval — 직전 편 검사를 건너뛴다. 직전 편이 잘릴 수 있다.');
  } else if (hoursOut >= 6) {
    console.log(`  게시까지 ${hoursOut.toFixed(1)}시간 — 직전 편 «현재» 상태는 보지 않는다.`);
    console.log('  (예약분은 게시 «간격» 이 자기잠식을 결정하고, 그건 예약 시각이 정해놨다)');
  } else {
    const q = spawnSync(process.execPath, ['scripts/_prev-still-running.mjs'], { stdio: 'inherit' });
    if (q.status !== 0) {
      console.error('  직전 편이 아직 달린다 — 업로드를 중단한다.');
      console.error('  기울기가 30분 이상 0 이 된 뒤에 다시 실행한다.');
      process.exit(1);
    }
  }
}

// ⛔ 게이트는 --dry 에서도 «반드시» 돌다 (2026-08-23 수정).
//   전에는 DRY 가 이 앞에서 종료해서, --dry 가 통과라고 말해놓고 실제 실행은
//   20건 위반으로 막혔다. 「검증만」이 핵심 검사를 건너뛰면 그건 검증이 아니다.
// ⛔ 정본 규격 게이트 — 사람 기억에 맡기지 않는다 (2026-08-20 대표 지적)
//   "조사보고에서 끝낸것이 아니라" — 실제로 개념편에만 적용하고 브리핑은 감사하지 않았다.
//   이제 업로드 경로에서 «영상 파일을 직접 재서» 위반이면 여기서 멈춘다.
{
  const g = spawnSync(process.execPath, ['scripts/shorts-gate.mjs', PLAN], { stdio: 'inherit' });
  if (g.status !== 0) { console.error('  shorts-gate 불통과 — 업로드를 중단한다'); process.exit(1); }
}

if (DRY) { console.log('\n  검증만 수행했다 (게이트 포함). 실제 업로드는 --dry 없이 실행\n'); process.exit(0); }


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
  // ⛔ 비공개(예약) 영상에는 댓글을 못 단다 — API 가 403 을 낸다.
  //   전에는 그걸 «실패»로 찍고 끝냈고, 게시된 뒤에 다는 절차가 없었다.
  //   그래서 예약으로 올린 3편이 «댓글 0» 인 채로 며칠을 돌았다 (2026-08-24 대표 지적).
  //   ⇒ 지금 못 달면 «대기열»에 남긴다. 게시 시각이 지나면 yt-admin 이 처리한다.
  if (it.pinnedComment) {
    const sched = it.privacy !== 'public' && it.privacy !== 'unlisted';
    if (sched) {
      appendFileSync('.agent/PENDING_COMMENTS.jsonl', JSON.stringify({
        id: v.id, ch: LANG === "ja" ? "jp" : "hq", title: it.title,
        publishAtKST: it.publishAtKST, text: it.pinnedComment,
      }) + '\n');
      console.log('    댓글:   대기열 등록 (비공개라 지금은 못 단다)');
      console.log('            게시 후 →  node scripts/yt-admin.mjs pending');
    } else {
      console.log(`    댓글:   ${await comment(access_token, v.id, it.pinnedComment)}  (고정은 스튜디오에서 수동)`);
    }
  }
  console.log(`    ${url}`);
  done.push({ ...it, id: v.id, url });
}

// ⛔ public/unlisted 는 publishAtKST 가 없다 — 예약 전제로 쓴 이 줄이 업로드 성공 «뒤에» 죽었다
//   (2026-08-23, wfO7CbK8-xQ). 영상은 올라갔는데 기록이 안 남는 게 더 나쁘다.
const today = new Date().toISOString().slice(0, 10);
const mode = items[0].privacy === 'public' ? '즉시 공개'
  : items[0].privacy === 'unlisted' ? '일부공개' : '비공개+예약';
const log = `\n## ${(items[0].publishAtKST || today).slice(0, 10)} 업로드 (${mode})\n\n` +
  done.map((d) => `- [${d.title}](${d.url}) — ${d.publishAtKST ? `예약 KST ${d.publishAtKST}` : mode} · \`${d.id}\``).join('\n') + '\n';
appendFileSync('.agent/PUBLISH_LOG.md', log);
console.log(`\n  ${done.length}건 완료 → .agent/PUBLISH_LOG.md 기록`);
console.log(mode === '즉시 공개' ? '  ⚠ «즉시 공개» 로 올렸다 — 이미 전 세계에 보인다.' : '  ⚠ 전부 «비공개+예약» 상태다. 개시는 스튜디오에서 대표가 한다.');
console.log('  ⚠ 사람이 해야 하는 일 2가지 (API 없음):');
console.log('     1) 고정 댓글의 「고정」 버튼');
console.log('     2) Studio > 세부정보 > 썸네일 에 <이름>_thumb.jpg 업로드');
console.log('        - 쇼츠 커버는 API 로 못 바꾼다 (2026-08-21 확인)');
