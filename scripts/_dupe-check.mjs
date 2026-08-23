#!/usr/bin/env node
// ============================================================================
// _dupe-check — 「이미 올린 영상과 같은 소리를 또 하는가」
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-24). 이건 내가 실제로 저지른 실수다.
//   일본 채널의 «터진 갈래» 를 확장한다며 SCRIPT_JPPOST 를 만들었는데,
//   그게 이미 공개돼 825회를 기록 중이던 SCRIPT_JPGAMMA 와 «같은 영상» 이었다:
//     둘 다 12종목 · 11/12 · p=0.0063 · NVDA 예외 · 「逆でした」
//   제목 목록만 보고 갈래를 판단했고, 기존 대본의 «본문» 을 다시 읽지 않았다.
//   업로드까지 갔고 예약까지 걸었다. 사람이 잡지 않았으면 그대로 나갔다.
//
//   ⇒ 사람의 기억에 맡기지 않는다. 대본끼리 «숫자와 문장» 을 직접 대조한다.
//
// 무엇을 보는가 (둘 다 본다 — 하나만 보면 놓친다)
//   ① 숫자 겹침 : 대본에 나오는 수치 토큰의 교집합. 같은 발견이면 숫자가 같다.
//                문장은 얼마든지 바꿔 쓸 수 있지만 «p=0.0063» 은 못 바꾼다.
//   ② 문장 겹침 : 자막 큐의 문자 3-gram 자카드
//
// 사용: node scripts/_dupe-check.mjs <SCRIPT_TAG>
// 종료코드 0=문제없음 · 1=겹침 의심
// ============================================================================
import { scriptSource } from './_script-source.mjs';

const TAG = (process.argv[2] || '').toUpperCase();
if (!TAG) { console.error('사용: _dupe-check <SCRIPT_TAG>'); process.exit(1); }

const src = scriptSource();
const blocks = new Map();
const re = /export const SCRIPT_([A-Z0-9_]+)\s*:/g;
const marks = [];
for (let m; (m = re.exec(src)); ) marks.push([m[1], m.index]);
marks.forEach(([tag, i], k) => blocks.set(tag, src.slice(i, k + 1 < marks.length ? marks[k + 1][1] : src.length)));

if (!blocks.has(TAG)) { console.error(`SCRIPT_${TAG} 를 못 찾는다`); process.exit(1); }

/** 대본에서 «화면·낭독에 실제로 나가는» 문자열만 뽑는다 (주석은 뺀다) */
function speech(blk) {
  const noComment = blk.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const out = [];
  for (const m of noComment.matchAll(/\b(say|ask|head|line|value|v|claim|title|loop|sub)\s*:\s*'([^']*)'/g))
    out.push(m[2].replace(/\\n/g, ' '));
  return out.join(' ');
}
/** 수치 토큰 — 「12」「0.0063」「3.813」「11銘柄」처럼 발견을 특정하는 것들 */
function nums(s) {
  return new Set((s.match(/\d+(?:[.,]\d+)*\s*%?/g) || [])
    .map((x) => x.replace(/\s/g, ''))
    .filter((x) => x.replace(/[^\d]/g, '').length >= 2));   // 한 자리 숫자는 흔해서 뺀다
}
function grams(s) {
  const t = s.replace(/\s+/g, '');
  const g = new Set();
  for (let i = 0; i + 3 <= t.length; i++) g.add(t.slice(i, i + 3));
  return g;
}
const jac = (a, b) => {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
};

// ── 토큰마다 «희소도» 를 매긴다 ─────────────────────────────────────────────
// ⛔ 단순 겹침 비율은 첫 시험에서 실패했다 (JPPOST vs JPGAMMA 29% — 기준 미달).
//   같은 발견이라도 표현하는 숫자는 달라진다: JPGAMMA 는 「13,000일 · 3,840 · 9,288」,
//   JPPOST 는 「320일 · 770일 · 1.124」. 겹친 것은 «12» 와 «0.0063» 둘뿐이었다.
//   그런데 이 둘의 무게는 전혀 다르다 — «12» 는 거의 모든 대본에 있고,
//   «0.0063» 은 전 대본에서 «딱 두 편» 에만 있다. 후자는 사실상 지문이다.
//   ⇒ 겹친 «개수» 가 아니라 겹친 것의 «희소도» 를 더한다.
const speeches = new Map([...blocks].map(([t, b]) => [t, speech(b)]));
const df = new Map();                                  // 토큰 → 등장 대본 수
for (const s of speeches.values())
  for (const x of nums(s)) df.set(x, (df.get(x) || 0) + 1);
const N = blocks.size;
const idf = (x) => Math.log(N / (df.get(x) || 1));     // 두 편에만 있으면 크게, 흔하면 0 에 가깝게

const mine = speeches.get(TAG);
const mineN = nums(mine), mineG = grams(mine);
const mineW = [...mineN].reduce((s, x) => s + idf(x), 0) || 1;

const rows = [];
for (const [tag, s] of speeches) {
  if (tag === TAG) continue;
  const n = nums(s);
  const shared = [...mineN].filter((x) => n.has(x));
  rows.push({
    tag,
    numShare: shared.reduce((a, x) => a + idf(x), 0) / mineW,   // 희소도 가중
    shared: shared.sort((a, b) => idf(b) - idf(a)),
    text: jac(mineG, grams(s)),
  });
}
rows.sort((a, b) => (b.numShare + b.text) - (a.numShare + a.text));

console.log(`\n  SCRIPT_${TAG} · 수치 토큰 ${mineN.size}개 · 대본 ${N}편`);
console.log(`\n  ${'대본'.padEnd(14)}${'가중겹침'.padStart(8)}${'문장겹침'.padStart(8)}   겹친 것 (희소한 순)`);
for (const r of rows.slice(0, 5))
  console.log(`  ${r.tag.padEnd(14)}${(r.numShare * 100).toFixed(0).padStart(7)}%${(r.text * 100).toFixed(0).padStart(7)}%   ${r.shared.slice(0, 5).map((x) => `${x}(${df.get(x)}편)`).join(' ')}`);

// ── 판정은 «지문» 으로 한다 ────────────────────────────────────────────────
// ⛔ 가중 겹침 비율로는 못 갈랐다 (실측: JPGAMMA 27% 인데 무관한 RECORDS 가 28%).
//   비율은 흔한 토큰의 잡음에 묻힌다. 갈라내는 것은 «어떤 값을 공유하느냐» 다.
//
//   지문 = ① 소수점을 가진 통계값이고  ② 전 대본에서 2편 이하에만 나오는 것
//   「0.0063」 은 부호검정 p 값이다. 서로 다른 두 발견이 이 값을 우연히 공유하지 않는다.
//   반대로 「12」「2021」「500」 은 어디에나 있어 지문이 못 된다. 연도도 뺀다.
const isFingerprint = (x) => {
  const t = x.replace(/[%,]/g, '');
  if (/^(19|20)\d{2}$/.test(t)) return false;          // 연도
  if (!/\./.test(t)) return false;                     // 소수점 없는 값은 흔하다
  return t.replace(/[^\d]/g, '').length >= 3;          // 유효숫자 3자리 이상
};
for (const r of rows) r.fp = r.shared.filter((x) => isFingerprint(x) && df.get(x) <= 2);

const hit = rows.filter((r) => r.fp.length);
if (hit.length) {
  console.log('\n  ⛔ «이 두 대본에만 있는 통계값» 을 공유한다 — 같은 발견일 가능성이 높다:');
  for (const r of hit) console.log(`     SCRIPT_${r.tag}  ←  ${r.fp.join(' ')}`);
  console.log('     올리기 전에 그 대본을 «직접 읽어라». 같은 발견 두 편은 서로를 잡아먹는다.');
  process.exit(1);
}
// 지문이 없어도 문장이 통째로 닮았으면 세운다
const worst = rows[0];
if (worst && worst.text >= 0.35) {
  console.log(`\n  ⛔ SCRIPT_${worst.tag} 와 문장이 ${(worst.text * 100).toFixed(0)}% 겹친다 — 직접 읽어라.`);
  process.exit(1);
}
console.log('\n  ✔ 겹치는 통계값·문장 없음');
process.exit(0);
