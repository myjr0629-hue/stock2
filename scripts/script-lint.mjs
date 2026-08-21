#!/usr/bin/env node
// ============================================================================
// script-lint — 대본을 «렌더 전에» 검사한다
// ----------------------------------------------------------------------------
// ⛔ 자막이 3줄이 되면 상자가 위로 자라 레퍼런스 밴드(66~82%)를 벗어난다.
//    CAPTION.maxCharsPerLine = 21, maxLines = 2 → 실질 상한 38자.
//    2026-08-20 실측: 44자 낭독 한 줄 때문에 자막띠가 63.7% 로 내려앉았다.
//
// 사용: node scripts/script-lint.mjs SCRIPT_TAG
// ============================================================================
import { readFileSync } from 'node:fs';
import { scriptSource } from './_script-source.mjs';
const TAG = process.argv[2];
if (!TAG) { console.error('사용: script-lint <TAG>'); process.exit(1); }
const src = scriptSource();
const i = src.indexOf(`export const SCRIPT_${TAG}`);
if (i < 0) { console.error(`SCRIPT_${TAG} 없음`); process.exit(1); }
const end = src.indexOf('\nexport const SCRIPT_', i + 10);
let blk = src.slice(i, end < 0 ? src.length : end);
// 아웃트로는 «고정 클립»이라 자막으로 그려지지 않는다 — 길이 규칙 대상이 아니다
const oi = blk.indexOf('\n  outro:');
if (oi > 0) blk = blk.slice(0, oi);

const LIMIT = 38;
let bad = 0;
for (const m of blk.matchAll(/\b(say|ask|line|head|sub)\s*:\s*'([^']*)'/g)) {
  const [, key, text] = m;
  const t = text.replace(/\n/g, ' ');
  const cap = key === 'say' || key === 'ask';
  const over = cap && t.length > LIMIT;
  if (over) bad++;
  if (cap) console.log(`  ${over ? '✗' : '✔'} ${key.padEnd(4)} ${String(t.length).padStart(3)}자  ${t}`);
}
console.log(bad ? `\n  ⛔ ${bad}줄이 ${LIMIT}자 초과 — 자막이 3줄이 되어 밴드를 벗어난다\n`
                : `\n  ✅ 모든 자막이 2줄 안에 들어간다 (<= ${LIMIT}자)\n`);
process.exit(bad ? 1 : 0);
