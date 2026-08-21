#!/usr/bin/env node
// ============================================================================
// slot-plan — 「오늘 무엇을 언제 올릴지」를 정한다
// ----------------------------------------------------------------------------
// ⛔ 대표 지적 (2026-08-21):
//   "영상을 만드는것은 좋은데 그것이 «그 시점 불필요한 영상»이면 안되는것이고
//    그리고 스케쥴 틀을 잡아야 할듯하다 어떤 소제의 영상을 올릴지도
//    그렇게해서 자동화를 해야하는 부분이고"
//
// 그동안 없던 것: 슬롯 틀. 20:00 은 «근거 없이» 고른 시각이었다.
//
// ── 설계 원칙 ───────────────────────────────────────────────────────────────
// ① 시간대는 «시청자»가 아니라 «소재 유효성»으로 정한다
//    우리 채널 실측에서 게시 시간대 효과는 잡히지 않았다
//    (구간 중앙 40~86, 전부 겹침, n=2~7). 그러니 시간으로 조회를 얻으려 하지 않는다.
//    대신 «그 시각에 그 소재가 말이 되는가»로 정한다.
//
// ② 소재는 «유효기간»으로 나눈다
//    LIVE      그날/그 순간에만 유효   (만기일·지표발표·실적일·오늘의 옵션북)
//    FRESH     2~3일 유효             (상관 전환·변동성 극단 같은 최근 이상값)
//    EVERGREEN 시점 무관              (개념 설명 — 검색으로 계속 들어온다)
//
// ③ ⛔ LIVE 소재가 없으면 «만들지 않는다». EVERGREEN 으로 채운다.
//    없는 시의성을 지어내는 순간 그 편은 «그 시점 불필요한 영상»이 된다.
//
// ── 슬롯 (KST) ──────────────────────────────────────────────────────────────
//   A 20:00  미국 개장 전(22:30 개장)   → LIVE-preview : 오늘 장에서 «벌어질» 것
//   B 06:00  미국 마감 후(05:00 마감)   → LIVE-review  : 어제 장에서 «벌어진» 것
//   C 13:00  장과 무관                 → EVERGREEN    : 개념·구조
//
// 사용: node scripts/slot-plan.mjs [YYYY-MM-DD]
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DAY = process.argv[2] || '2026-08-21';
const [Y, M, D] = DAY.split('-').map(Number);
const dt = new Date(Date.UTC(Y, M - 1, D));
const DOW = dt.getUTCDay();                       // 0=일 … 5=금
const NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// 그 달의 셋째 금요일 = 월간 옵션 만기일
function thirdFriday(y, m) {
  let d = 1;
  while (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 5) d++;
  return d + 14;
}
const isOpex = DOW === 5 && D === thirdFriday(Y, M);
const isWeekend = DOW === 0 || DOW === 6;

// ── 오늘의 «달력 사실» — 이게 LIVE 소재의 근거다 ────────────────────────────
const calendar = [];
if (isOpex) calendar.push({ kind: 'LIVE', why: '월간 옵션 만기일 (셋째 금요일)' });
if (DOW === 5 && !isOpex) calendar.push({ kind: 'LIVE', why: '주간 옵션 만기일' });
if (isWeekend) calendar.push({ kind: 'NONE', why: '미국 장이 열리지 않는다' });

// ── 레이더가 캔 이상값을 유효기간으로 분류한다 ──────────────────────────────
const radar = existsSync('.agent/TOPIC_RADAR.json')
  ? JSON.parse(readFileSync('.agent/TOPIC_RADAR.json', 'utf8')).found : [];
const shelf = (f) => {
  if (f.kind === '임박' || f.kind === '괴리') return 'LIVE';   // 옵션북 — 오늘 값이다
  if (f.kind === '전환') return 'FRESH';                       // 관계 변화 — 며칠 간다
  return 'FRESH';                                              // 극단 — 며칠 간다
};
const pool = radar.map((f) => ({ ...f, shelf: shelf(f) }));

// ── EVERGREEN 후보 — 수요표 상위에서, 아직 안 만든 것 ───────────────────────
const demand = existsSync('.agent/DEMAND.json')
  ? JSON.parse(readFileSync('.agent/DEMAND.json', 'utf8')).terms || {} : {};
const made = existsSync('.agent/PUBLISH_LOG.md') ? readFileSync('.agent/PUBLISH_LOG.md', 'utf8').toLowerCase() : '';
// ⛔ 수요표에는 'bond yields explained' 와 'bond yields' 가 «둘 다» 있다 (제목 매칭용).
//   그대로 두면 슬롯 두 개가 사실상 같은 소재를 집는다 → 어근으로 묶어 하나만 남긴다.
const core = (k) => k.replace(/\b(explained|explain|simply|guide|basics)\b/g, '').replace(/\s+/g, ' ').trim();
const seenCore = new Set();
const evergreen = Object.entries(demand)
  .filter(([k, v]) => v >= 5000 && /explained|trading|investing|funds|yields|rates/.test(k))
  .filter(([k]) => !made.includes(k))
  .sort((a, b) => b[1] - a[1])
  .filter(([k]) => { const c = core(k); if (seenCore.has(c)) return false; seenCore.add(c); return true; })
  .slice(0, 8);

const SLOTS = [
  { id: 'A', at: '20:00', want: 'LIVE',      note: '미국 개장 전 — 오늘 벌어질 것' },
  { id: 'B', at: '06:00', want: 'LIVE',      note: '미국 마감 후 — 어제 벌어진 것' },
  { id: 'C', at: '13:00', want: 'EVERGREEN', note: '장과 무관 — 개념·구조' },
];

console.log(`\n  ══ ${DAY} (${NAMES[DOW]}) 슬롯 계획 ══`);
if (calendar.length) for (const c of calendar) console.log(`  달력: ${c.why}`);
else console.log('  달력: 특이사항 없음');
console.log(`  레이더: LIVE ${pool.filter((p) => p.shelf === 'LIVE').length}건 · FRESH ${pool.filter((p) => p.shelf === 'FRESH').length}건`);
console.log(`  EVERGREEN 후보: ${evergreen.length}건\n`);

const used = new Set();
const plan = [];
for (const s of SLOTS) {
  let pick = null;
  if (isWeekend && s.want === 'LIVE') {
    // ⛔ 장이 안 열리는 날에 LIVE 를 만들지 않는다
    const e = evergreen.find(([k]) => !used.has(k));
    if (e) used.add(e[0]);   // ⛔ 안 넣으면 세 슬롯이 «같은 소재»를 집는다 (2026-08-21 확인)
    pick = e
      ? { type: 'EVERGREEN', label: e[0], why: `주말 — LIVE 가 성립하지 않는다 · 소형중앙 ${e[1].toLocaleString()}` }
      : { type: 'SKIP', label: '(소재 없음)', why: '⛔ 억지로 만들지 않는다' };
  } else if (s.want === 'LIVE') {
    const c = pool.filter((p) => p.shelf === 'LIVE' && !used.has(p.hook))[0];
    if (c) { used.add(c.hook); pick = { type: 'LIVE', label: c.hook, why: `${c.kind} · 문: ${c.door ?? '-'}` }; }
    else {
      const f = pool.filter((p) => p.shelf === 'FRESH' && !used.has(p.hook))[0];
      if (f) { used.add(f.hook); pick = { type: 'FRESH', label: f.hook, why: `LIVE 없음 → FRESH 로 대체 (${f.kind})` }; }
    }
  }
  if (!pick) {
    const e = evergreen.find(([k]) => !used.has(k));
    if (e) { used.add(e[0]); pick = { type: 'EVERGREEN', label: e[0], why: `소형중앙 ${e[1].toLocaleString()}` }; }
    else pick = { type: 'SKIP', label: '(소재 없음)', why: '⛔ 억지로 만들지 않는다 — 빈 슬롯으로 둔다' };
  }
  plan.push({ ...s, ...pick });
  console.log(`  [${s.id}] KST ${s.at}  ${String(pick.type).padEnd(9)} ${pick.label}`);
  console.log(`         ${s.note}  |  ${pick.why}`);
}

writeFileSync(`.agent/SLOT_PLAN_${DAY}.json`, JSON.stringify({ day: DAY, dow: NAMES[DOW], isOpex, isWeekend, plan }, null, 1));
console.log(`\n  → .agent/SLOT_PLAN_${DAY}.json\n`);
console.log('  ⛔ LIVE 슬롯에 LIVE 소재가 없으면 FRESH → EVERGREEN 순으로 내린다.');
console.log('     시의성을 «지어내지» 않는다. 없으면 빈 슬롯으로 둔다.\n');
