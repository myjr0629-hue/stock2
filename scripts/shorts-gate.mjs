#!/usr/bin/env node
// ============================================================================
// shorts-gate — 정본 규격을 «사람 기억»이 아니라 «계산»으로 강제한다
// ----------------------------------------------------------------------------
// 왜 만드는가 (2026-08-20 대표 지적)
//   "오늘 하루종일 조사한것 그것에 대해서 완벽하게 숙지 적용되어있는 상태로
//    영상을 작업한것인지 (…) 그렇지 않다면 열심히 조사하고 틀을 잡은 목적이 없으니까"
//
//   맞는 지적이다. 실제로 개념편에만 적용하고 «브리핑 템플릿은 감사하지 않았다».
//   규격을 문서에만 적어두면 다음 영상에서 또 빠진다.
//   ⇒ 업로드 직전에 «영상 파일과 메타데이터를 직접 재서» 위반이면 막는다.
//
// 규격 출처: .agent/SHORTS_PLAYBOOK.md §2(영상) §3(메타데이터)
//   전부 실측에서 나온 숫자다. 여기 숫자를 바꾸려면 «새 실측»이 있어야 한다.
//
// 사용:
//   node scripts/shorts-gate.mjs <plan.json>          업로드 계획 전체 검사
//   node scripts/shorts-gate.mjs <video.mp4>          영상 하나만 검사
// 종료코드: 위반 있으면 1 (yt-upload 가 이걸 보고 막는다)
// ============================================================================

import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkTitle } from './title-check.mjs';
import { checkTopic } from './topic-check.mjs';
import { checkScript } from './script-check.mjs';
import { checkInsight } from './insight-check.mjs';
import { auditCut } from './cut-audit.mjs';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FFMPEG = join(FFDIR, 'ffmpeg.exe');
const FFPROBE = join(FFDIR, 'ffprobe.exe');
const sh = (b, a) => { const r = spawnSync(b, a, { maxBuffer: 1 << 30, encoding: 'buffer' }); return r; };
const txt = (b, a) => { const r = spawnSync(b, a, { maxBuffer: 1 << 30, encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); };

// ── 정본 규격 — ⛔ «계급»마다 다르다 ────────────────────────────────────────
// 2026-08-20 실측: 지금까지 잰 레퍼런스 9편은 전부 «개념 설명» 계급이었고,
//   그 규격을 브리핑에 그대로 썼다. 브리핑 계급(6편·4채널)은 다르게 측정된다:
//     길이  개념 23.7~62.0  vs  브리핑 43.4~54.4  (우리 27.1 → 계급의 절반)
//     컷/분 개념 0~22.8      vs  브리핑 6.5~16.5   (우리 31.7 → 계급의 2배)
//     밝기  개념 66~235      vs  브리핑 39.6~123.7
//   근거: .agent/BRIEFING_BENCHMARK.md
// plan.json 의 각 항목에 "class": "brief" | "concept" 를 넣는다 (기본 concept)
const SPEC_BY_CLASS = {
  concept: { secRange: [30, 61], cutsPerMin: [8, 24], brightMin: 90, capTopPct: [66, 82] },
  // ⚠ 컷/분 상한 24 — 측정된 브리핑 계급은 6.5~16.5 지만 그 6편은 «전부 토킹헤드»다.
  //   TrendyVest 98K 는 45.9초에 5컷(9초에 한 번) — 말하는 사람 얼굴이라 컷이 필요 없다.
  //   우리는 «데이터 카드» 포맷이라 카드 하나를 9초 붙잡으면 빈 화면이 된다.
  //   → 구조가 다른 포맷에 남의 숫자를 그대로 씌우지 않는다. 24 로 두고 «미해결»로 표시한다.
  //   숙제: 데이터 카드형 브리핑 채널을 따로 표본으로 모아 재측정할 것.
  brief:   { secRange: [38, 59], cutsPerMin: [5, 24], brightMin: 55, capTopPct: [62, 86] },
  // ⚠ ad 계급은 «측정된 레퍼런스가 없다». 앱 광고를 오가닉 쇼츠로 올리는 채널 표본을
  //   아직 못 모았다. 그래서 다른 계급에서 «확실히 근거 있는 것»만 가져온다:
  //     자막 위치·첫컷·빈화면·라우드니스 = 계급 무관 (플랫폼 UI·우리 채널 신호)
  //     길이·컷/분·밝기 = 넓게 둔다. 근거가 생기면 좁힌다.
  ad:      { secRange: [15, 61], cutsPerMin: [5, 30], brightMin: 70, capTopPct: [66, 84] },
};
const SPEC = {
  capTopPct: [66, 82],      // 자막띠 상단 — DTW 실사 76~80%. 여유 포함
  brightMin: 90,            // 상위 3계급 197~235. 브랜드가 다크블루라 90 을 하한으로
  lufs: [-15.5, -13.0],     // 유튜브 표준 -14
  cutsPerMin: [6, 40],      // Primate 19.5~22.8 / DTW 2.6~2.9 / 0 은 최하위
  firstCutSec: 2.8,         // 우리 채널 전수: 첫컷 시각 ↔ 지속률 -0.90 (유일한 신호)
  secRange: [8, 60],        // 쇼츠
  titleMax: 100,
  tagCount: [8, 15],
  descMax: 1200,            // 설명 길이는 조회수와 무관(상관 0.01) — 짧게 유지
  hashtags: [1, 3],
  banHours: [22, 23, 0],    // KST 22~01 = d-0.15 · n=578 · 99% 유의
  emptyMaxSec: 0.8,         // 본문이 비어 있는 최장 구간. 자막만 뜨는 시간은 이탈 지점이다
};

const GW = 96, GH = 171, GS = GW * GH;

function probe(f) {
  const r = txt(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames',
    '-show_entries', 'format=duration', '-of', 'default=nw=1', f]);
  const g = (k) => (r.match(new RegExp(`${k}=(.+)`)) || [])[1]?.trim();
  const [n, d] = (g('r_frame_rate') || '30/1').split('/').map(Number);
  return { w: +g('width'), h: +g('height'), fps: n / d, dur: +g('duration') };
}

function analyse(file) {
  const p = probe(file);
  const g = sh(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file,
    '-vf', `scale=${GW}:${GH}`, '-pix_fmt', 'gray', '-c:v', 'rawvideo', '-f', 'image2pipe', '-']).stdout;
  const n = Math.floor(g.length / GS);
  const fr = (i) => g.subarray(i * GS, (i + 1) * GS);

  // 컷 + 첫 컷 시각
  // ⛔ 디바운스 필수 — 우리 템플릿은 컷마다 «흰 플래시»를 얹는다.
  //    플래시는 들어갈 때 한 번, 빠질 때 한 번 = 컷 하나가 2회로 세어졌다
  //    (실측: 컷/분 30 → 46.5 로 부풀었다). 5프레임 안의 연속 검출은 한 컷으로 본다.
  // 플래시는 «들어갈 때»(a-1)와 «빠질 때»(a+4)가 정확히 5프레임 차라 DEBOUNCE=5 로는
  // 경계에 걸려 안 걸러졌다 (실측: 브리핑 컷/분 17.6 이 23.5 로 부풀었다).
  // 실제 컷은 최소 1초(30프레임) 간격이므로 8 은 안전하다.
  const DEBOUNCE = 8;
  let cuts = 0, firstCut = null, lastCutFrame = -99;
  for (let i = 1; i < n; i++) {
    let s = 0; const a = fr(i - 1), b = fr(i);
    for (let k = 0; k < GS; k++) s += Math.abs(a[k] - b[k]);
    if (s / GS > 18 && i - lastCutFrame > DEBOUNCE) {
      cuts++; lastCutFrame = i;
      if (firstCut === null) firstCut = i / p.fps;
    }
  }

  // 밝기 — 정본과 같은 자(signalstats YAVG)
  const ys = [...txt(FFMPEG, ['-hide_banner', '-v', 'error', '-i', file,
    '-vf', 'fps=4,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
    '-f', 'null', '-']).matchAll(/YAVG=([\d.]+)/g)].map((m) => +m[1]);
  const bright = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;

  // 자막띠 — 글자는 «가로 고주파». 행별 에너지에서 하단 큰 띠를 찾는다
  const rowE = new Float64Array(GH);
  const step = Math.max(1, Math.floor(n / 200));
  let smp = 0;
  for (let i = 0; i < n; i += step) {
    const f2 = fr(i); smp++;
    for (let y = 0; y < GH; y++) {
      let s = 0;
      for (let x = 1; x < GW; x++) s += Math.abs(f2[y * GW + x] - f2[y * GW + x - 1]);
      rowE[y] += s / (GW - 1);
    }
  }
  for (let y = 0; y < GH; y++) rowE[y] /= smp;
  const sorted = [...rowE].sort((a, b) => a - b);
  const thr = sorted[Math.floor(GH / 2)] + (sorted[Math.floor(GH * 0.9)] - sorted[Math.floor(GH / 2)]) * 0.55;
  const bands = []; let s0 = -1;
  for (let y = 0; y < GH; y++) {
    const on = rowE[y] > thr;
    if (on && s0 < 0) s0 = y;
    if ((!on || y === GH - 1) && s0 >= 0) { if (y - s0 >= 2) bands.push([s0, y]); s0 = -1; }
  }
  const cap = bands.filter((b) => b[0] > GH * 0.55).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;

  // ── 빈 화면 구간 — «자막은 있는데 본문이 없는» 시간 ──────────────────────
  //    본문 영역(세로 22~68%)의 프레임별 엣지 에너지를 재서, 낮은 구간이 이어지면 «빔».
  //    사람 눈으로 매번 찾지 않는다.
  const B0 = Math.round(GH * 0.22), B1 = Math.round(GH * 0.68);
  const bodyE = [];
  for (let i = 0; i < n; i++) {
    const f2 = fr(i); let s2 = 0, k2 = 0;
    for (let y = B0; y < B1; y++)
      for (let x = 1; x < GW; x++) { s2 += Math.abs(f2[y * GW + x] - f2[y * GW + x - 1]); k2++; }
    bodyE.push(s2 / k2);
  }
  const sb = [...bodyE].sort((a, b) => a - b);
  const EMPTY = sb[Math.floor(sb.length * 0.5)] * 0.42;      // 중앙값의 42% 미만이면 «빔»
  let run = 0, worst = 0, worstAt = 0;
  for (let i = 0; i < n; i++) {
    if (bodyE[i] < EMPTY) { run++; if (run > worst) { worst = run; worstAt = (i - run + 1) / p.fps; } }
    else run = 0;
  }
  const emptySec = +(worst / p.fps).toFixed(2);

  // 라우드니스
  const ln = txt(FFMPEG, ['-hide_banner', '-i', file, '-af',
    'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
  const lufs = +((ln.match(/"input_i"\s*:\s*"(-?[\d.]+)"/) || [])[1] ?? NaN);

  return {
    sec: +p.dur.toFixed(1), w: p.w, h: p.h,
    cutsPerMin: +(cuts / (n / p.fps) * 60).toFixed(1),
    firstCutSec: firstCut === null ? null : +firstCut.toFixed(2),
    bright: +bright.toFixed(1),
    capTopPct: cap ? +(cap[0] / GH * 100).toFixed(1) : null,
    capBotPct: cap ? +(cap[1] / GH * 100).toFixed(1) : null,
    emptySec, emptyAt: +worstAt.toFixed(1),
    lufs,
  };
}

/** 썸네일이 «프레임 0» 과 같은가 — -ss 는 키프레임으로 튄다(실측 사고) */
function thumbIsFrame0(video, thumb) {
  if (!thumb || !existsSync(thumb)) return null;
  const grab = (args) => sh(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args,
    '-vf', 'scale=32:57', '-pix_fmt', 'gray', '-frames:v', '1', '-c:v', 'rawvideo', '-f', 'image2pipe', '-']).stdout;
  const a = grab(['-i', video, '-vf', 'select=eq(n\\,0),scale=32:57']);
  const b = grab(['-i', thumb]);
  if (!a?.length || !b?.length || a.length !== b.length) return null;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return +(d / a.length).toFixed(2);          // 0 에 가까울수록 같은 그림
}

// ── 판정 ────────────────────────────────────────────────────────────────────
const R = [];
const ok = (name, pass, got, want) => R.push({ name, pass, got, want });

function checkVideo(file, thumb, cls = 'concept') {
  const S = { ...SPEC, ...(SPEC_BY_CLASS[cls] || SPEC_BY_CLASS.concept) };
  const m = analyse(file);
  R.push({ name: '계급', pass: true, got: cls, want: '' });
  ok('해상도 1080x1920', m.w === 1080 && m.h === 1920, `${m.w}x${m.h}`, '1080x1920');
  ok('길이', m.sec >= S.secRange[0] && m.sec < S.secRange[1], `${m.sec}s`, `${S.secRange[0]}~${S.secRange[1]}s`);
  ok('평균 밝기', m.bright >= S.brightMin, m.bright, `>= ${S.brightMin}`);
  ok('라우드니스', m.lufs >= SPEC.lufs[0] && m.lufs <= SPEC.lufs[1], `${m.lufs} LUFS`, `${SPEC.lufs[0]}~${SPEC.lufs[1]}`);
  ok('컷/분', m.cutsPerMin >= S.cutsPerMin[0] && m.cutsPerMin <= S.cutsPerMin[1], m.cutsPerMin, `${S.cutsPerMin[0]}~${S.cutsPerMin[1]}`);
  ok('첫 컷 시각', m.firstCutSec !== null && m.firstCutSec <= SPEC.firstCutSec, m.firstCutSec === null ? '컷 없음' : `${m.firstCutSec}s`, `<= ${SPEC.firstCutSec}s`);
  ok('자막띠 위치', m.capTopPct !== null && m.capTopPct >= S.capTopPct[0] && m.capTopPct <= S.capTopPct[1],
    m.capTopPct === null ? '검출 안 됨' : `${m.capTopPct}~${m.capBotPct}%`, `상단 ${S.capTopPct[0]}~${S.capTopPct[1]}%`);
  ok('빈 화면 구간', m.emptySec <= SPEC.emptyMaxSec,
    m.emptySec > 0 ? `${m.emptySec}초 @ ${m.emptyAt}s` : '없음',
    `<= ${SPEC.emptyMaxSec}초 (본문이 비면 이탈한다)`);
  const t = thumbIsFrame0(file, thumb);
  ok('썸네일 = 프레임 0', t !== null && t < 6, t === null ? '비교 불가' : `차이 ${t}`, '차이 < 6');
  return m;
}

function checkMeta(it) {
  const T = it.title || '', D = it.description || '', G = it.tags || [];
  // 제목 «형식 + 수요» — 실측 규칙 (scripts/title-check.mjs)
  for (const r of checkTitle(T)) ok(r.name, r.pass, r.got, r.want);
  ok('제목 길이', T.length > 0 && T.length <= SPEC.titleMax, `${T.length}자`, `<= ${SPEC.titleMax}`);
  ok('FREE 존재', /\bfree\b/i.test(T) || /\bfree\b/i.test(D), (/\bfree\b/i.test(T) ? '제목' : '') + (/\bfree\b/i.test(D) ? ' 설명' : '') || '없음', '제목 또는 설명');
  const head = D.slice(0, 120);
  // ⛔ 유튜브는 설명 앞 ~100자만 노출하고 자른다. 쇼츠에서 «더보기»는 거의 안 눌린다.
  //    링크가 뒤에 있으면 «있어도 없는 것»이다 → 첫 줄에 있어야 한다 (대표 지시 2026-08-20)
  ok('앱 주소 (첫 줄)', /signumhq\.com/i.test(head),
    /signumhq\.com/i.test(head) ? '첫 줄에 있음' : (/signumhq\.com/i.test(D) ? '본문에만 있음 — 잘려서 안 보인다' : '없음'),
    '설명 앞 120자 안에 필수');
  ok('태그 개수', G.length >= SPEC.tagCount[0] && G.length <= SPEC.tagCount[1], G.length, `${SPEC.tagCount[0]}~${SPEC.tagCount[1]}`);
  ok('설명 길이', D.length <= SPEC.descMax, `${D.length}자`, `<= ${SPEC.descMax} (조회수와 무관 — 짧게)`);
  const ht = (D.match(/#\S+/g) || []).length;
  ok('해시태그', ht >= SPEC.hashtags[0] && ht <= SPEC.hashtags[1], ht, `${SPEC.hashtags[0]}~${SPEC.hashtags[1]}`);
  ok('제목에 물음표·이모지 없음', !/[?\u{1F300}-\u{1FAFF}]/u.test(T), /[?]/.test(T) ? '물음표 있음' : '없음', '효과 없음 — 넣지 않는다');
  if (it.publishAtKST && it.privacy !== 'unlisted') {
    const h = +String(it.publishAtKST).match(/[ T](\d{2}):/)[1];
    ok('게시시각', !SPEC.banHours.includes(h), `KST ${h}시`, 'KST 22~01 금지');
  }
  // ⛔ signumhq.com 은 «웹사이트»다. 앱 주소가 아니다 (대표 반복 지적 2026-08-20~21).
  //    고정 댓글에는 «스토어 링크»가 들어가야 한다. .agent/APP_LINKS.json 이 정본.
  // ⛔ 앱 주소 = signumhq.com/app (기기 판별 스마트 링크) 또는 스토어 직링크.
  //    맨 signumhq.com 은 «웹사이트»라 앱 주소가 아니다. .agent/APP_LINKS.json 이 정본.
  const STORE = /signumhq\.com\/app|apps\.apple\.com|play\.google\.com\/store/i;
  ok('고정댓글 존재', !!it.pinnedComment, it.pinnedComment ? '있음' : '없음', '모든 영상에 필수');
  ok('고정댓글 앱스토어 링크', STORE.test(it.pinnedComment || ''),
    STORE.test(it.pinnedComment || '') ? '스토어 링크 있음'
      : (/signumhq\.com/i.test(it.pinnedComment || '') ? '사이트 주소만 — 앱 주소가 아니다' : '없음'),
    'signumhq.com/app 또는 스토어 직링크 (맨 사이트 주소는 앱 주소가 아니다)');
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg || !existsSync(arg)) { console.error('사용: shorts-gate <plan.json | video.mp4>'); process.exit(1); }

const items = arg.endsWith('.json')
  ? JSON.parse(readFileSync(arg, 'utf8'))
  : [{ file: arg, title: '(영상만 검사)', description: 'https://www.signumhq.com FREE', tags: Array(10).fill('x') }];

let bad = 0;
for (const it of items) {
  R.length = 0;
  console.log(`\n  ┌ ${it.title}`);
  console.log(`  │ ${it.file}`);
  // ⛔ 게이트는 «영상만»이 아니다 (대표 지시 2026-08-21).
  //    소재 → 대본 → 영상 → 메타 네 층을 전부 통과해야 업로드한다.
  if (arg.endsWith('.json')) for (const r of checkTopic(it)) R.push(r);
  // ⛔ 인사이트는 «선택»이 아니다 (대표 지시 2026-08-21):
  //    "강력한 인사이트를 줘야 무엇인가 얻어가지 상황설명만 하는것이 아니라"
  if (arg.endsWith('.json'))
    for (const r of checkInsight(it, readFileSync('src/remotion/kit/scripts.ts', 'utf8'))) R.push(r);
  if (it.scriptTag) {
    const src = readFileSync('src/remotion/kit/scripts.ts', 'utf8');
    for (const r of checkScript(it.scriptTag, src)) R.push(r);
    // ⛔ 2026-08-21: cutFor 가 길이 상한을 맞추려 «뒤에서부터» 비트를 버린다.
    //    결론·인사이트가 통째로 사라져도 렌더는 정상이라 영상 검사로는 못 잡는다.
    const a = auditCut(it.scriptTag, 'yt');
    ok('잘린 비트', !a.error && a.dropped && a.dropped.length === 0,
      a.error ? '검사 실패' : (a.dropped.length ? `${a.dropped.length}개 사라짐: ${a.dropped.map((d) => d.say).join(' / ')}` : `${a.kept}/${a.total}비트 · ${a.cutSec}s`),
      '대본에 쓴 비트가 영상에 전부 있어야 한다');
  } else if (arg.endsWith('.json')) {
    R.push({ name: '대본 태그', pass: false, got: '없음', want: 'plan 에 scriptTag 를 넣어야 대본을 잰다' });
  }
  const m = checkVideo(it.file, it.thumb, it.class || 'concept');
  if (arg.endsWith('.json')) checkMeta(it);
  const fails = R.filter((r) => !r.pass);
  for (const r of R)
    console.log(`  │ ${r.pass ? '✔' : '✗'} ${r.name.padEnd(22)} ${String(r.got).padEnd(20)} ${r.pass ? '' : '기준 ' + r.want}`);
  console.log(`  └ ${fails.length ? `✗ 위반 ${fails.length}건` : '✅ 전 항목 통과'}`);
  bad += fails.length;
}
if (bad) {
  console.log(`\n  ⛔ 총 ${bad}건 위반 — 업로드하지 않는다.`);
  console.log('  규격 근거: .agent/SHORTS_PLAYBOOK.md §2 §3 (전부 실측)\n');
  process.exit(1);
}
console.log('\n  ✅ 정본 규격 전 항목 통과\n');
