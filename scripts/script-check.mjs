#!/usr/bin/env node
// ============================================================================
// script-check — 「대본」을 렌더 전에 «레퍼런스와 같은 자»로 잰다
// ----------------------------------------------------------------------------
// 왜 만드는가 (대표 지시 2026-08-21)
//   "대본 레퍼런스들보다 뛰어나야한다. 레퍼런스의 흐름을 기본으로하되 더 고도하 해야한다"
//   "방식이 유니크한것이 아닌 레퍼런스들을 강화하는 쪽으로"
//
// ⛔ 실측 근거 (2026-08-21). 조회 32만~84만 매크로/해설 7편의 자동자막을
//   롤업 중복 제거 후 계량한 값 ↔ 우리 대본 32편의 같은 값.
//
//     항목          레퍼런스 중앙    우리 중앙      판정
//     훅 유형       선언4/반박2/질문1  선언 32/32   ✗ 우리는 100% 선언
//     숫자 밀도     1.0%            2.6%         ✗ 2.6배 — 자료 낭독처럼 들린다
//     우리/너 비율  3.9%            1.9%         ✗ 절반 — 남 얘기처럼 들린다
//     단어/큐       6.9             7.1          ✔
//     WPM          195             222          △ 빠르다
//
//   원본: .agent/_script_grammar.json · .agent/MACRO_BENCHMARK.md
//
// 사용: node scripts/script-check.mjs SCRIPT_TAG
// ============================================================================
import { readFileSync } from 'node:fs';

// ── 규격의 근거는 전부 위 표. 숫자를 통과시키려고 낮추지 않는다 ──────────────
const CAP_CHARS   = 38;          // 자막 2줄 상한 (초과 시 3줄 → 밴드 이탈)
const NUM_MAX     = 3.2;         // 레퍼런스 중앙 1.0%, 최고 6.3%. 우리 상한을 3.2 로
const PRON_MIN    = 2.5;         // 레퍼런스 중앙 3.9%, 최저 0%. 하한을 2.5 로
const WPC         = [5.0, 7.6];  // 레퍼런스 5.1~7.3 에 여유
const HOOK_WORDS  = 12;          // 레퍼런스 훅은 전부 한 호흡

const PRON = new Set(['you', 'your', "you're", 'yourself', 'we', 'us', 'our', "we're", "we've"]);
const HOOK_OPEN = /^(hold on|okay|look|wait|no,|but |forget|stop|everyone|nobody)/i;

export function checkScript(tag, src) {
  const i = src.indexOf(`export const SCRIPT_${tag}`);
  if (i < 0) return [{ name: '대본 존재', pass: false, got: `SCRIPT_${tag} 없음`, want: 'scripts.ts' }];
  const end = src.indexOf('\nexport const SCRIPT_', i + 10);
  let blk = src.slice(i, end < 0 ? src.length : end);
  const oi = blk.indexOf('\n  outro:');          // 아웃트로는 고정 클립 — 대본이 아니다
  if (oi > 0) blk = blk.slice(0, oi);

  const cues = [];
  for (const m of blk.matchAll(/\b(say|ask)\s*:\s*'([^']*)'/g)) cues.push([m[1], m[2].replace(/\n/g, ' ')]);

  const R = [];
  const ok = (name, pass, got, want) => R.push({ name, pass, got, want });
  if (!cues.length) { ok('자막 큐', false, '0개', '>= 1'); return R; }

  const words = cues.map((c) => c[1]).join(' ').split(/\s+/).filter(Boolean);
  const n = words.length;
  const pron = words.filter((w) => PRON.has(w.toLowerCase().replace(/[^a-z']/g, ''))).length / n * 100;
  const num  = words.filter((w) => /[0-9]/.test(w)).length / n * 100;
  const wpc  = n / cues.length;

  // ① 훅 — 레퍼런스는 3편 중 1편이 질문·반박으로 연다. 우리는 32/32 가 선언이었다
  const first = cues[0][1];
  const hookType = /[?]/.test(first) ? '질문' : (HOOK_OPEN.test(first) ? '반박' : '선언');
  ok('훅 유형', hookType !== '선언', `${hookType} — "${first}"`,
    '질문 또는 반박 (레퍼런스 7편 중 3편. 우리 32편은 100% 선언이었다)');
  ok('훅 길이', first.split(/\s+/).length <= HOOK_WORDS, `${first.split(/\s+/).length}단어`, `<= ${HOOK_WORDS}단어`);

  // ② 사람에게 하는 말인가 — 2인칭·1인칭 복수 비율
  ok('우리/너 비율', pron >= PRON_MIN, `${pron.toFixed(1)}%`,
    `>= ${PRON_MIN}% (레퍼런스 중앙 3.9% · 우리 과거 중앙 1.9%)`);

  // ③ 자료 낭독이 되지 않는가 — 숫자 밀도
  ok('숫자 밀도', num <= NUM_MAX, `${num.toFixed(1)}%`,
    `<= ${NUM_MAX}% (레퍼런스 중앙 1.0% · 우리 과거 중앙 2.6%)`);

  // ④ 호흡
  ok('단어/큐', wpc >= WPC[0] && wpc <= WPC[1], wpc.toFixed(1), `${WPC[0]}~${WPC[1]} (레퍼런스 5.1~7.3)`);

  // ⑤ 자막 줄수 — 기존 script-lint 규칙을 흡수
  const over = cues.filter((c) => c[1].length > CAP_CHARS);
  ok('자막 2줄 유지', over.length === 0,
    over.length ? `${over.length}줄 초과 (최장 ${Math.max(...over.map((c) => c[1].length))}자)` : `최장 ${Math.max(...cues.map((c) => c[1].length))}자`,
    `모든 줄 <= ${CAP_CHARS}자`);

  return R;
}

const direct = String(process.argv[1] || '').endsWith('script-check.mjs');
if (direct) {
  const tag = process.argv[2];
  if (!tag) { console.error('사용: script-check <SCRIPT_TAG>'); process.exit(1); }
  const src = readFileSync('src/remotion/kit/scripts.ts', 'utf8');
  const R = checkScript(tag, src);
  console.log(`\n\n  SCRIPT_${tag}`);
  for (const r of R)
    console.log(`   ${r.pass ? '✔' : '✗'} ${r.name.padEnd(12)} ${String(r.got).padEnd(40)} ${r.pass ? '' : '기준 ' + r.want}`);
  const f = R.filter((r) => !r.pass).length;
  console.log(f ? `   ✗ 위반 ${f}건 — 대본을 고친다\n` : '   ✔ 대본 통과\n');
  process.exit(f ? 1 : 0);
}
