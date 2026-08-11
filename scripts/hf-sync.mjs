#!/usr/bin/env node
// ============================================================================
// hf-sync — 힉스필드에서 수확한 클립을 배경 라이브러리로 내린다
// ----------------------------------------------------------------------------
// 입력: 브라우저에서 뽑은 매니페스트 JSON (배열: {id, prompt, url})
// 출력: public/shorts/bg/<카테고리>/<슬러그>.mp4  +  public/shorts/bg/index.json
//
// ⚠️ 원본을 그대로 쓰지 않고 -g 15 로 재인코딩한다.
//    시덴스 원본은 GOP 가 길어 OffthreadVideo 프레임 탐색이 멈춘다(2026-08-10 실측).
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIBS = [
  '.agent/HARVEST_PROMPTS_2026-08-11.json',
  '.agent/HARVEST_PROMPTS_HITECH_2026-08-11.json',
  '.agent/HARVEST_PROMPTS_T2B_2026-08-11.json',
].map((f) => path.join(ROOT, f));
const OUT = path.join(ROOT, 'public/shorts/bg');
const RAW = path.join(OUT, '.raw');
const BIN = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64');
const FFMPEG = path.join(BIN, 'ffmpeg');

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('usage: node scripts/hf-sync.mjs <manifest.json>');
  process.exit(1);
}

const CATS = {
  A_morning: 'morning', B_hook: 'hook', C_anime: 'anime', D_fantasy: 'fantasy',
  E_sector_doc: 'sector', F_logo_plate: 'plate', G_endcard_plate: 'endcard', H_stinger: 'stinger',
  // 2026-08-11 재편 — 소재가 금융·테크·하이테크인 본진 카테고리
  T_tech: 'tech', T_finance: 'finance', T_stylized: 'stylized',
  // 대본 «비트 전용» 배경 — 파일명이 순서를 그대로 갖는다 (brief-01 = 훅)
  Z_brief: 'brief',
};

const lib = Object.assign({}, ...LIBS.filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const KEY_LEN = 44;

/** 프롬프트 앞머리 → {cat, idx} */
const index = new Map();
for (const [k, cat] of Object.entries(CATS)) {
  (lib[k] || []).forEach((p, i) => index.set(norm(p).slice(0, KEY_LEN), { cat, idx: i + 1, prompt: p }));
}

function slugOf(prompt) {
  const stop = new Set(['a','an','the','of','in','on','at','and','with','into','from','over','across','through','its','their','that','while','then','as','by','to']);
  return norm(prompt).split(' ').filter((w) => w.length > 2 && !stop.has(w)).slice(0, 4).join('-');
}

const jobs = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
fs.mkdirSync(RAW, { recursive: true });

const results = [];
let got = 0, skip = 0, miss = 0;

for (const job of jobs) {
  if (!job.url || !job.prompt) continue;
  const hit = index.get(norm(job.prompt).slice(0, KEY_LEN));
  const cat = hit ? hit.cat : 'unsorted';
  const n = hit ? String(hit.idx).padStart(2, '0') : job.id.slice(0, 6);
  if (!hit) miss++;

  const dir = path.join(OUT, cat);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${cat}-${n}-${slugOf(job.prompt)}`.slice(0, 60);
  const finalPath = path.join(dir, `${name}.mp4`);
  const rel = path.relative(path.join(ROOT, 'public'), finalPath);

  if (fs.existsSync(finalPath)) {
    skip++;
    results.push({ key: name, cat, file: rel, prompt: job.prompt });
    continue;
  }

  const rawPath = path.join(RAW, `${job.id}.mp4`);
  if (!fs.existsSync(rawPath)) {
    try {
      execFileSync('curl', ['-sSfL', '-o', rawPath, job.url], { stdio: 'pipe' });
    } catch (e) {
      console.error(`  ✗ download ${name}: ${e.message.slice(0, 80)}`);
      continue;
    }
  }

  // -g 15 (0.5초 키프레임) — 렌더 시 프레임 탐색이 멈추지 않게
  try {
    execFileSync(FFMPEG, [
      '-y', '-loglevel', 'error', '-i', rawPath,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-g', '15', '-keyint_min', '15', '-sc_threshold', '0',
      '-pix_fmt', 'yuv420p', finalPath,
    ], { env: { ...process.env, DYLD_LIBRARY_PATH: BIN }, stdio: 'pipe' });
  } catch (e) {
    console.error(`  ✗ encode ${name}`);
    continue;
  }

  got++;
  console.log(`  ✓ ${cat.padEnd(8)} ${name}`);
  results.push({ key: name, cat, file: rel, prompt: job.prompt });
}

// 인덱스 갱신 (기존 항목 보존 + 병합)
const idxPath = path.join(OUT, 'index.json');
const prev = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : [];
const merged = new Map(prev.map((r) => [r.key, r]));
for (const r of results) merged.set(r.key, r);
const list = [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
fs.writeFileSync(idxPath, JSON.stringify(list, null, 2));

// ── 주제 태그 — 배경 자동 매칭이 이걸 보고 고른다 ──────────────────────────
const TOPIC = {
  semis: /semiconductor|wafer|cleanroom|silicon|lithograph|EUV|chip fab|silicon die/i,
  datacenter: /data cent|server (hall|tower|rack|corridor)|GPU rack|fibre optic|fiber optic/i,
  robotics: /humanoid robot|robotic arm|clay robot|friendly robot/i,
  auto: /assembly line|electric car|EV battery|chassis|lidar/i,
  energy: /refinery|oil|solar farm|wind turbine|foundry|molten metal/i,
  shipping: /container|harbor|harbour|terminal|quay|cargo|ship deck/i,
  pharma: /pharmaceutical|laborator|vials|pipette/i,
  health: /hospital|clinic/i,
  bank: /exchange building|vault|gold bar|marble hall|trading floor|atrium/i,
  retail: /retail warehouse|conveyor|packages/i,
  agri: /wheat|harvest|farmer|crop/i,
  space: /rocket|astronaut|launch pad|satellite|Earth/i,
  quantum: /quantum|dilution refrigerator|superconduct/i,
  materials: /carbon fibre|carbon fiber|copper mine|haul truck|ore/i,
  network: /undersea|antenna|satellite dish/i,
  airline: /airport|aircraft|apron/i,
  luxury: /atelier|leather|luxury/i,
  city: /skyline|metropolis|downtown|avenue|city/i,
  sky: /cloud|sky|balloon|bird|flock/i,
};
function topicsOf(p) {
  return Object.entries(TOPIC).filter(([, re]) => re.test(p)).map(([k]) => k);
}

const bglib = {};
for (const r of list) {
  (bglib[r.cat] ||= []).push({ key: r.key, src: r.file.replace(/\\/g, '/'), topics: topicsOf(r.prompt) });
}
fs.writeFileSync(path.join(ROOT, 'src/remotion/kit/bglib.json'), JSON.stringify(bglib, null, 2));

const byCat = list.reduce((a, r) => ((a[r.cat] = (a[r.cat] || 0) + 1), a), {});
console.log(`\n새로 받음 ${got} · 이미 있음 ${skip} · 라이브러리 미매칭 ${miss}`);
console.log(`총 ${list.length}편 →`, byCat);
console.log('bglib → src/remotion/kit/bglib.json');
