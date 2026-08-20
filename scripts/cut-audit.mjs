#!/usr/bin/env node
// ============================================================================
// cut-audit — 「대본에 썼는데 영상에는 없는 비트」를 잡는다
// ----------------------------------------------------------------------------
// ⛔ 2026-08-21 사고: GOLD821 의 결론 비트("Not a fear trade. A currency trade.")가
//   cutFor 의 40초 상한에 걸려 «통째로» 잘렸다. 렌더는 정상, 게이트도 통과 —
//   내용만 사라졌다. 게이트가 «영상»만 재기 때문에 구조적으로 못 잡는 구멍이었다.
//
// ⇒ 이 스크립트는 cutFor 를 «실제로 돌려» 잘린 비트를 이름으로 보고한다.
//   shorts-gate 가 호출한다. 잘린 비트가 있으면 업로드를 막는다.
//
// 사용: node scripts/cut-audit.mjs <SCRIPT_TAG> [platform]
// ============================================================================
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

export function auditCut(tag, platform = 'yt') {
  const probe = `
import { SCRIPT_${tag} } from './src/remotion/kit/scripts';
import { cutFor, totalSecOf, WINDOW } from './src/remotion/kit/variants';
const p = SCRIPT_${tag};
const c = cutFor(p, '${platform}');
const kept = new Set(c.beats.map((b) => b.say));
const dropped = p.beats.filter((b) => !kept.has(b.say));
console.log(JSON.stringify({
  total: p.beats.length, kept: c.beats.length,
  dropped: dropped.map((b) => ({ role: b.role, say: b.say })),
  fullSec: +totalSecOf(p).toFixed(1), cutSec: +totalSecOf(c).toFixed(1),
  max: WINDOW['${platform}'].max,
}));
`;
  const f = `.cut-audit-${tag}.mts`;
  writeFileSync(f, probe);
  const r = spawnSync('npx', ['tsx', f], { encoding: 'utf8', shell: true, maxBuffer: 1 << 28 });
  try { unlinkSync(f); } catch {}
  const out = (r.stdout || '').trim();
  const lines = out.trim().split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean);
  const last = lines.length ? lines[lines.length - 1] : '';
  const i = last.indexOf('{');
  if (i < 0) return { error: (r.stderr || out).slice(-300) };
  return JSON.parse(last.slice(i));
}

const direct = String(process.argv[1] || '').endsWith('cut-audit.mjs');
if (direct) {
  const tag = process.argv[2];
  if (!tag) { console.error('사용: cut-audit <SCRIPT_TAG> [yt|tt|reels]'); process.exit(1); }
  const a = auditCut(tag, process.argv[3] || 'yt');
  if (a.error) { console.error('  ✗ ' + a.error); process.exit(1); }
  console.log(`  대본 ${a.total}비트 · 영상 ${a.kept}비트 · ${a.fullSec}s → ${a.cutSec}s (상한 ${a.max}s)`);
  if (!a.dropped.length) { console.log('  ✔ 잘린 비트 없음'); process.exit(0); }
  console.log(`  ✗ 잘린 비트 ${a.dropped.length}개 — 대본에 썼는데 영상에 없다:`);
  for (const d of a.dropped) console.log(`     [${d.role}] ${d.say}`);
  process.exit(1);
}
