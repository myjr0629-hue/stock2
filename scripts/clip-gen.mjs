#!/usr/bin/env node
// ============================================================================
// clip-gen — 대본에 필요한 배경 클립이 «없으면 만든다»
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-24 대표 지시)
//   "거기에 맞는 영상 다시말해서 캐나다를 상징하는 캐릭터를 만들어도좋고
//    그런것도 능동적으로 하도록"
//
//   그동안 나는 «있는 클립 중에 비슷한 것»을 골라 썼다. 그래서 금리 편에
//   만화 여우가 깔렸고, 세로 영상에 가로 클립이 두 번 들어갔다.
//   소재가 정해지면 그 소재의 그림을 «만드는» 것이 맞다.
//
// ⛔ 만들기 전에 반드시 라이브러리를 먼저 본다 — 있는 걸 또 만들지 않는다.
//   `node scripts/clip-gen.mjs --check <이름...>` 이 그 확인을 대신한다.
//
// ⛔ 쇼츠는 «9:16» 이다. 가로 클립을 세로 영상에 넣는 실수를 두 번 했다.
//   생성 시 aspect_ratio 를 고정하고, 저장 후 실측으로 다시 확인한다.
//
// 사용:
//   node scripts/clip-gen.mjs --check ani-two-doors ani-factory-line
//   node scripts/clip-gen.mjs --brief .agent/_clip_briefs.json
//   node scripts/clip-gen.mjs --brief .agent/_clip_briefs.json --dry
//
// brief.json = [{ name, prompt, desc, tags[] }]
//   desc 는 «한국어로, 프레임을 보고 적듯이» 쓴다. CLIP_INDEX 에 그대로 들어간다.
//   desc 가 없는 클립은 쓰지 않는다 (clip-index 의 규칙).
// ============================================================================

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const OUT = 'public/shorts/bg/video';
const IDX = '.agent/CLIP_INDEX.json';

const clips = existsSync(IDX) ? JSON.parse(readFileSync(IDX, 'utf8')).clips || {} : {};

// ── --check : 없는 것만 알려준다 ────────────────────────────────────────────
if (argv.includes('--check')) {
  const names = argv.slice(argv.indexOf('--check') + 1).filter((a) => !a.startsWith('--'));
  let miss = 0;
  for (const n of names) {
    const c = clips[n];
    if (!c) { console.log(`  ⛔ 없음   ${n}`); miss++; continue; }
    const bad = c.aspect !== '9:16' ? '  ⛔ 가로다 — 쇼츠에 쓰지 말 것' : '';
    console.log(`  ✅ ${n.padEnd(22)} ${c.aspect} ${c.sec}s  ${String(c.desc || '설명없음').slice(0, 40)}${bad}`);
  }
  console.log(miss ? `\n${miss}개를 만들어야 한다 — --brief 로 발주한다` : '\n전부 있다');
  process.exit(0);
}

// ── --brief : 발주 ──────────────────────────────────────────────────────────
const bi = argv.indexOf('--brief');
if (bi < 0) { console.error('--check 또는 --brief 가 필요하다'); process.exit(1); }
const briefs = JSON.parse(readFileSync(argv[bi + 1], 'utf8'));

const TOKEN = (readFileSync('.env.local', 'utf8')
  .match(/^REPLICATE_API_TOKEN=["']?([^"'\r\n]+)/m) || [])[1];
if (!TOKEN && !DRY) { console.error('.env.local 에 REPLICATE_API_TOKEN 이 없다'); process.exit(1); }

// ⛔ 스타일을 매 클립마다 다시 정하지 않는다. 라이브러리 전체가 한 벌로 보여야 한다.
//   기존 ani-* 클립의 결(캐릭터 있는 평면 애니, 밝은 톤)을 문장으로 고정한다.
//   ⛔ 어둡게 만들지 않는다 — 습관적으로 어둡게 만들어 지적받았다. 밝기를 명시한다.
const STYLE = 'flat 2D editorial animation, clean vector shapes, bright even lighting, '
  + 'mid-tone background around 120 luminance, no text, no logos, no watermark, '
  + 'centered subject with generous headroom, slow deliberate motion, seamless loop';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const made = [];
for (const b of briefs) {
  if (clips[b.name]) { console.log(`  건너뜀 (이미 있음) ${b.name}`); continue; }
  if (!b.desc) { console.error(`  ⛔ ${b.name}: desc 가 없다 — 설명 없는 클립은 쓰지 않는다`); continue; }
  const prompt = `${b.prompt}. ${STYLE}`;
  console.log(`\n■ ${b.name}`);
  console.log(`   ${prompt.slice(0, 150)}...`);
  if (DRY) { made.push(b.name); continue; }

  const { default: Replicate } = await import('replicate');
  const rep = new Replicate({ auth: TOKEN });
  try {
    const out = await rep.run('kwaivgi/kling-v2.0', {
      input: { prompt, aspect_ratio: '9:16', duration: 5 },
    });
    const url = typeof out === 'string' ? out : String(out);
    if (!url.startsWith('http')) throw new Error(`URL 을 못 받았다: ${url.slice(0, 120)}`);
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(`${OUT}/${b.name}.mp4`, buf);
    console.log(`   저장 ${(buf.length / 1e6).toFixed(1)}MB → ${OUT}/${b.name}.mp4`);
    made.push(b.name);
  } catch (e) {
    console.error(`   ⛔ 실패: ${String(e.message).slice(0, 200)}`);
  }
}

if (made.length && !DRY) {
  // ⛔ 만든 뒤 반드시 색인한다. 색인에 desc 가 없으면 다음 세션이 또 파일명으로 고른다.
  console.log('\n색인 갱신 — node scripts/clip-index.mjs');
  spawnSync(process.execPath, ['scripts/clip-index.mjs'], { stdio: 'inherit' });

  const idx = JSON.parse(readFileSync(IDX, 'utf8'));
  for (const b of briefs) {
    const c = idx.clips[b.name];
    if (!c) continue;
    c.desc = b.desc;                       // 손으로 쓴 설명을 보존한다
    c.tags = b.tags || c.tags || [];
    if (c.aspect !== '9:16')
      console.error(`   ⛔ ${b.name} 이 ${c.aspect} 로 나왔다 — 쇼츠에 쓰지 말 것`);
  }
  writeFileSync(IDX, JSON.stringify(idx, null, 1));
  console.log('설명·태그를 색인에 반영했다');
}
console.log(`\n만든 것 ${made.length}개: ${made.join(', ') || '없음'}`);
