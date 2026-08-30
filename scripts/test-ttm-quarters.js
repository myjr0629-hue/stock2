#!/usr/bin/env node
/**
 * TTM(최근 4분기) 선별 규칙 테스트 — 전부 **실측 케이스**다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * PER 과 FCF 수익률이 이 선별에 걸려 있다. 잘못 고르면 화면에 「그럴듯한
 * 거짓 배수」가 뜬다. 2026-08-30 실측에서 나온 함정들:
 *
 *   · ONTO 는 start_date 가 깨진 행이 있다(2024-09-29~2026-01-03 = 461일).
 *     그런데 그 행의 매출은 281M 으로 **정상 분기 수준**이다(동종 218~343M).
 *     → 기간 «길이»로 거르면 멀쩡한 분기를 버린다. end_date 간격으로 판정한다.
 *   · ONTO 는 행 순서도 어긋나 있다(3번째가 2024 Q4).
 *   · WOLF 는 손익이 2026 Q3 까지인데 현금흐름은 2026 Q1 까지다(두 분기 지연).
 *     → 계열마다 «그 계열 안에서» 4분기를 고른다.
 *
 * 사용:  node scripts/test-ttm-quarters.js
 */
const DAY = 86400_000;

/** src/services/intrinioClient.ts 의 pickTTMQuarters 와 «같은» 규칙 */
function pickTTMQuarters(funds) {
    const rows = funds
        .map((f) => ({ f, e: Date.parse(String(f?.end_date || "")) }))
        .filter((r) => Number.isFinite(r.e))
        .sort((a, b) => b.e - a.e);
    const uniq = [];
    for (const r of rows) {
        if (uniq.length && Math.abs(uniq[uniq.length - 1].e - r.e) < 5 * DAY) continue;
        uniq.push(r);
    }
    if (uniq.length < 4) return null;
    const picked = [uniq[0]];
    for (const r of uniq.slice(1)) {
        if (picked.length >= 4) break;
        const gap = (picked[picked.length - 1].e - r.e) / DAY;
        if (gap < 80 || gap > 100) continue;
        picked.push(r);
    }
    if (picked.length < 4) return null;
    const span = (picked[0].e - picked[3].e) / DAY;
    if (span < 250 || span > 290) return null;
    return picked.map((r) => r.f);
}

const CASES = [
    { name: "ONTO 손익 (start_date 깨진 행 포함)",
      ends: ["2026-06-30","2026-03-31","2026-01-03","2025-09-27","2025-06-28","2025-03-29","2024-09-28","2024-06-29"],
      want: ["2026-06-30","2026-03-31","2026-01-03","2025-09-27"] },
    { name: "WOLF 손익",
      ends: ["2026-03-29","2025-12-28","2025-09-28","2025-06-29","2025-03-30","2024-12-29"],
      want: ["2026-03-29","2025-12-28","2025-09-28","2025-06-29"] },
    { name: "WOLF 현금흐름 (두 분기 지연)",
      ends: ["2025-09-28","2025-06-29","2025-03-30","2024-12-29","2024-09-29","2024-06-30"],
      want: ["2025-09-28","2025-06-29","2025-03-30","2024-12-29"] },
    { name: "NVDA 손익",
      ends: ["2026-07-26","2026-04-26","2026-01-25","2025-10-26"],
      want: ["2026-07-26","2026-04-26","2026-01-25","2025-10-26"] },
    { name: "SYM 현금흐름",
      ends: ["2026-06-27","2026-03-28","2025-12-27","2025-09-27"],
      want: ["2026-06-27","2026-03-28","2025-12-27","2025-09-27"] },
    // ── 거부해야 하는 것들 ──
    { name: "분기가 3개뿐",
      ends: ["2026-06-30","2026-03-31","2026-01-03"], want: null },
    { name: "중간 분기 누락 (간격 180일)",
      ends: ["2026-06-30","2026-01-03","2025-09-27","2025-06-28"], want: null },
    { name: "같은 끝날짜 중복",
      ends: ["2026-06-30","2026-06-29","2026-03-31","2026-01-03"], want: null },
];

let bad = 0;
console.log(`  TTM 분기 선별 · ${CASES.length}케이스`);
console.log("=".repeat(72));
for (const c of CASES) {
    const got = pickTTMQuarters(c.ends.map((e) => ({ end_date: e })));
    const gotEnds = got ? got.map((x) => x.end_date) : null;
    const ok = JSON.stringify(gotEnds) === JSON.stringify(c.want);
    if (!ok) bad++;
    console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${c.name}`);
    if (!ok) console.log(`      기대 ${JSON.stringify(c.want)}\n      실제 ${JSON.stringify(gotEnds)}`);
}
console.log();
if (bad) { console.log(`  \x1b[31m${bad}건 실패\x1b[0m\n`); process.exit(1); }
console.log(`  \x1b[32m${CASES.length}/${CASES.length} 통과\x1b[0m\n`);
