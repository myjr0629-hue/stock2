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
import { scriptSource } from './_script-source.mjs';

// ── 규격의 근거는 전부 위 표. 숫자를 통과시키려고 낮추지 않는다 ──────────────
// ⛔ 자막 한 줄 상한은 «언어마다 다르다» (2026-08-21 실측)
//   영어 38자: 한 줄이 약 2.0초. 우리 CAPTION.maxCharsPerLine=21 × 2줄.
//   일본어 18자: 두 방법이 일치했다 —
//     ① 우리 TTS(ElevenLabs multilingual v2) 실측 초당 5.92자 → 3.0초 = 18자
//     ② 일본 레퍼런스 15편의 자막 큐 지속 중앙 2.98초 × 5.92 = 18자
//   영어 38자를 일본어에 쓰면 «한 줄이 6.4초» 가 된다.
const CAP_BY_LANG = { en: 38, ja: 18, ko: 20 };
const CAP_CHARS   = CAP_BY_LANG.en;
const NUM_MAX     = 3.2;         // 레퍼런스 중앙 1.0%, 최고 6.3%. 우리 상한을 3.2 로
const PRON_MIN    = 2.5;         // 레퍼런스 중앙 3.9%, 최저 0%. 하한을 2.5 로
const WPC         = [5.0, 7.6];  // 레퍼런스 5.1~7.3 에 여유
const HOOK_WORDS  = 12;          // 레퍼런스 훅은 전부 한 호흡

const PRON = new Set(['you', 'your', "you're", 'yourself', 'we', 'us', 'our', "we're", "we've"]);
const HOOK_OPEN = /^(hold on|okay|look|wait|no,|but |forget|stop|everyone|nobody)/i;
// ⛔ 일본어 여는 말 (2026-08-21). 위 사전은 영어 전용이라 일본어 훅은 «항상 선언»으로 잡혔다.
//   뜻은 같다 — 「잠깐」「사실은」「다들 ~라고 하지만」처럼 통념을 세우고 꺾는 말.
const HOOK_OPEN_JA = /^(ちょっと待|待って|実は|でも|しかし|違います|違う|みんな|誰も|そう言われ|本当に|よく聞く|信じ)/;
// 일본어는 «글자/큐»로 호흡을 본다 (자막 상한 18자 기준, 한 호흡에 8~16자)
const CPC_JA = [8, 16];

export function checkScript(tag, src, lang = 'en') {
  const cap = CAP_BY_LANG[lang] ?? CAP_CHARS;
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

  // ⛔ 일본어는 «띄어쓰기가 없다». 공백으로 자르면 큐 하나가 통째로 «단어 1개»가 되어
  //   단어/큐 는 항상 1.0 이 나오고, 대명사 비율은 항상 0% 가 된다 (2026-08-21 실측).
  //   영어에서 뽑은 지표를 그대로 씌우면 «측정 오류»를 위반으로 보고하게 된다.
  //   ⇒ 공백을 쓰지 않는 언어는 «글자»로 센다.
  const SPACED = lang !== 'ja';
  const joined = cues.map((c) => c[1]).join(SPACED ? ' ' : '');
  const words = SPACED ? joined.split(/\s+/).filter(Boolean) : [...joined.replace(/\s/g, '')];
  const n = words.length;
  const num  = words.filter((w) => /[0-9]/.test(w)).length / n * 100;
  const wpc  = n / cues.length;

  // ① 훅 — 레퍼런스는 3편 중 1편이 질문·반박으로 연다. 우리는 32/32 가 선언이었다
  //   ⛔ 여는 말 사전이 영어 전용이라 일본어는 «영원히 선언»으로 잡혔다. 언어별로 둔다.
  const first = cues[0][1];
  const opener = lang === 'ja' ? HOOK_OPEN_JA : HOOK_OPEN;
  const isQ = /[?？]/.test(first) || (lang === 'ja' && /(のか|だろうか|ますか|ですか)。?$/.test(first));
  const hookType = isQ ? '질문' : (opener.test(first) ? '반박' : '선언');
  ok('훅 유형', hookType !== '선언', `${hookType} — "${first}"`,
    '질문 또는 반박 (레퍼런스 7편 중 3편. 우리 32편은 100% 선언이었다)');
  const hookLen = SPACED ? first.split(/\s+/).length : [...first.replace(/\s/g, '')].length;
  ok('훅 길이', SPACED ? hookLen <= HOOK_WORDS : hookLen <= cap,
    SPACED ? `${hookLen}단어` : `${hookLen}자`, SPACED ? `<= ${HOOK_WORDS}단어` : `<= ${cap}자`);

  // ② 사람에게 하는 말인가 — 2인칭·1인칭 복수 비율
  //   ⛔ 일본어는 «대명사를 생략하는 언어»다. 私たち·あなた 를 영어만큼 쓰면 부자연스럽다.
  //     일본어 레퍼런스로 이 값을 재본 적이 «없다» → 없는 근거로 막지 않는다. 표시만 한다.
  if (SPACED) {
    const pron = words.filter((w) => PRON.has(w.toLowerCase().replace(/[^a-z']/g, ''))).length / n * 100;
    ok('우리/너 비율', pron >= PRON_MIN, `${pron.toFixed(1)}%`,
      `>= ${PRON_MIN}% (레퍼런스 중앙 3.9% · 우리 과거 중앙 1.9%)`);
  } else {
    ok('우리/너 비율', true, '해당 없음 (일본어는 대명사 생략)', '일본어 레퍼런스 미측정 — 막지 않는다');
  }

  // ③ 자료 낭독이 되지 않는가 — 숫자 밀도
  ok('숫자 밀도', num <= NUM_MAX, `${num.toFixed(1)}%`,
    `<= ${NUM_MAX}% (레퍼런스 중앙 1.0% · 우리 과거 중앙 2.6%)`);

  // ④ 호흡 — 일본어는 «글자/큐»로 본다
  const band = SPACED ? WPC : CPC_JA;
  ok(SPACED ? '단어/큐' : '글자/큐', wpc >= band[0] && wpc <= band[1], wpc.toFixed(1),
    `${band[0]}~${band[1]}${SPACED ? ' (레퍼런스 5.1~7.3)' : ' (ja 자막 상한 18자 · 한 호흡 분량)'}`);

  // ⑤ 자막 줄수 — 기존 script-lint 규칙을 흡수
  const over = cues.filter((c) => c[1].length > cap);
  ok('자막 2줄 유지', over.length === 0,
    over.length ? `${over.length}줄 초과 (최장 ${Math.max(...over.map((c) => c[1].length))}자, ${lang} 상한 ${cap})` : `최장 ${Math.max(...cues.map((c) => c[1].length))}자`,
    `모든 줄 <= ${cap}자 (${lang})`);

  return R;
}

const direct = String(process.argv[1] || '').endsWith('script-check.mjs');
if (direct) {
  const tag = process.argv[2];
  if (!tag) { console.error('사용: script-check <SCRIPT_TAG>'); process.exit(1); }
  const src = scriptSource();
  // ⛔ 언어를 안 넘기면 일본어 대본도 영어 규칙으로 재게 된다 (2026-08-21).
  const lang = (process.argv[3] || 'en').toLowerCase();
  const R = checkScript(tag, src, lang);
  console.log(`\n\n  SCRIPT_${tag}`);
  for (const r of R)
    console.log(`   ${r.pass ? '✔' : '✗'} ${r.name.padEnd(12)} ${String(r.got).padEnd(40)} ${r.pass ? '' : '기준 ' + r.want}`);
  const f = R.filter((r) => !r.pass).length;
  console.log(f ? `   ✗ 위반 ${f}건 — 대본을 고친다\n` : '   ✔ 대본 통과\n');
  process.exit(f ? 1 : 0);
}
