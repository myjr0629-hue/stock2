#!/usr/bin/env node
// ============================================================================
// bg-scan — 배경 클립 «인벤토리»를 만들고 유지한다
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-12): "영상을 추가하게 되면 그때도 다시 파악하고 전부 리스트화·분석해서
//                        활용할 것은 가져다 쓰는 것이 좋겠다"
//
// 하는 일
//   1. 원본 폴더(기본 E:/SIGNUM_UPLOAD/video)를 스캔해 새 파일을 찾는다
//   2. ffprobe 로 규격을 재고, 검토용 프레임을 뽑는다
//   3. .agent/BG_LIBRARY.json 에 «이미 붙여둔 사람 라벨»을 보존한 채 병합한다
//   4. 라벨이 붙은 것만 public/shorts/bg/video/ 로 «사용 가능한 형태»로 굽는다
//        · 상단-좌 0.9 크롭 = 우하단 워터마크 제거
//        · -g 15 = Remotion OffthreadVideo 프레임 탐색이 멈추지 않게 (필수)
//        · -an   = 오디오 제거
//
// 사용
//   node scripts/bg-scan.mjs                 새 파일 스캔 + 프레임 추출 (라벨 없는 건 대기)
//   node scripts/bg-scan.mjs --build         라벨 붙은 것만 라이브러리로 굽는다
//   node scripts/bg-scan.mjs --list          현재 인벤토리 표로 출력
//
// 라벨은 사람이(=클로드가 프레임을 보고) BG_LIBRARY.json 에 채운다. 자동 분류하지 않는다 —
// 「이 배경이 어떤 문장에 붙는가」는 대본을 아는 쪽만 판단할 수 있다.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const IS_WIN = process.platform === 'win32';
const COMP = join('node_modules', '@remotion', IS_WIN ? 'compositor-win32-x64-msvc' : 'compositor-darwin-arm64');
const FFMPEG = join(COMP, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
const FFPROBE = join(COMP, IS_WIN ? 'ffprobe.exe' : 'ffprobe');
const ENV = IS_WIN ? { ...process.env } : { ...process.env, DYLD_LIBRARY_PATH: COMP };
const sh = (bin, args) => execFileSync(bin, args, { env: ENV, maxBuffer: 1 << 28 }).toString();

// ── 원본 폴더 — 출처마다 «워터마크 유무»가 다르다 (2026-08-12 실측) ────────────
//   higgsfield : 웹에서 직접 받은 것. 워터마크 없음 → 크롭하지 않는다(프레임 100% 사용)
//   flow       : Flow 로 뽑은 것. 우하단에 ✦ 워터마크. 중심 ≈ (605,1158)/720x1280
//                0.90 크롭으로는 별 «끝이 남는다» → 0.88 이 안전선(실측)
const SOURCES = [
  { tag: 'hf', dir: 'E:/SIGNUM_UPLOAD/video', crop: 1.0 },
  { tag: 'flow', dir: 'E:/SIGNUM_UPLOAD/video flow', crop: 0.88 },
];
const OUT = 'public/shorts/bg/video';
const REVIEW = 'public/shorts/bg/.review';
const INDEX = '.agent/BG_LIBRARY.json';

const mode = process.argv.includes('--build') ? 'build'
  : process.argv.includes('--list') ? 'list' : 'scan';

const load = () => (existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { clips: {} });
const save = (db) => writeFileSync(INDEX, JSON.stringify(db, null, 2) + '\n', 'utf8');

function probe(file) {
  const raw = sh(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file]).trim().split('\n');
  const [num, den] = (raw[2] || '24/1').split('/').map(Number);
  return { w: +raw[0], h: +raw[1], fps: +(num / den).toFixed(2), sec: +Number(raw[3]).toFixed(2) };
}

const db = load();

if (mode === 'list') {
  const rows = Object.values(db.clips);
  const labelled = rows.filter((c) => c.slug);
  console.log(`인벤토리 ${rows.length}개 · 라벨 완료 ${labelled.length} · 대기 ${rows.length - labelled.length}\n`);
  const by = {};
  for (const c of labelled) (by[c.role] ||= []).push(c);
  for (const role of Object.keys(by).sort()) {
    console.log(`── ${role} (${by[role].length})`);
    for (const c of by[role]) console.log(`   ${String(c.slug).padEnd(24)} ${String(c.sec).padEnd(6)}s  ${c.light ?? ''}  ${c.desc ?? ''}`);
  }
  process.exit(0);
}

mkdirSync(REVIEW, { recursive: true });
mkdirSync(OUT, { recursive: true });

if (mode === 'scan') {
  let added = 0;
  for (const S of SOURCES) {
    if (!existsSync(S.dir)) { console.log(`  폴더 없음(건너뜀): ${S.dir}`); continue; }
    const files = readdirSync(S.dir).filter((f) => /\.(mp4|mov|webm)$/i.test(f));
    for (const f of files) {
      const key = basename(f, extname(f));
      if (db.clips[key]) continue;                     // 이미 아는 파일 — 라벨을 덮어쓰지 않는다
      const full = join(S.dir, f);
      const spec = probe(full);
      // 검토 프레임은 «크롭을 적용한 상태»로 뽑는다 — 실제로 쓸 화각을 보고 판단해야 한다
      const vf = S.crop < 1
        ? `crop=iw*${S.crop}:ih*${S.crop}:0:0,scale=260:462`
        : 'scale=260:462';
      const shot = join(REVIEW, `${key}.png`);
      sh(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss',
        String(Math.min(2.0, Math.max(0.5, spec.sec / 2))), '-i', full, '-frames:v', '1', '-vf', vf, shot]);
      db.clips[key] = {
        src: full, source: S.tag, crop: S.crop, ...spec,
        review: shot, slug: null, role: null, light: null, desc: null,
      };
      added++;
    }
  }
  save(db);
  const pending = Object.values(db.clips).filter((c) => !c.slug).length;
  console.log(`새로 발견 ${added}개 · 라벨 대기 ${pending}개`);
  console.log(`검토 프레임: ${REVIEW}  → 프레임을 보고 ${INDEX} 의 slug/role/light/desc 를 채운다`);
  console.log(`라벨을 채운 뒤:  node scripts/bg-scan.mjs --build`);
  process.exit(0);
}

// ── build ───────────────────────────────────────────────────────────────────
let built = 0, skipped = 0;
for (const [key, c] of Object.entries(db.clips)) {
  if (!c.slug) { skipped++; continue; }
  const dst = join(OUT, `${c.slug}.mp4`);
  if (existsSync(dst) && !process.argv.includes('--force')) continue;
  if (!existsSync(c.src)) { console.log(`  원본 없음  ${key}`); continue; }
  // 크롭은 «출처별»이다 — 힉스필드는 워터마크가 없어 자르지 않는다(프레임 100% 사용).
  // Flow 만 우하단 ✦ 때문에 0.88 로 자른다. 0.90 은 별 끝이 남는다(실측).
  const crop = c.crop ?? 1.0;
  const vf = crop < 1
    ? `crop=iw*${crop}:ih*${crop}:0:0,scale=720:1280:flags=lanczos`
    : 'scale=720:1280:flags=lanczos';
  sh(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', c.src, '-an', '-vf', vf,
    '-c:v', 'libx264', '-g', '15', '-pix_fmt', 'yuv420p', '-crf', '20', dst]);
  c.out = dst;
  c.loopFrames = Math.floor(c.sec * 30);               // Remotion 30fps 기준
  built++;
  console.log(`  ✔ ${c.slug}.mp4  ${c.sec}s  loopFrames ${c.loopFrames}`);
}
save(db);
console.log(`\n구움 ${built}개 · 라벨 없어 건너뜀 ${skipped}개`);
