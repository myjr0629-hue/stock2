#!/usr/bin/env node
// ============================================================================
// x-card — 티커 하나로 «X 에 바로 붙일 수 있는 가로 카드»를 끝까지 만든다.
//
//   실데이터 조회 → 앱 실화면 캡처(검수 게이트 통과) → 가로 카드 합성
//
// 왜 한 명령으로 묶나 (2026-08-31):
//   대표 지적 — 세로 폰샷을 그대로 붙였더니 X 카드에서 축소돼 티커도 안 읽혔다.
//   고친 뒤에도 매번 캡처·수치·문구를 손으로 맞추면 «그날 바빠서» 다시 옛
//   방식으로 돌아간다. 손이 갈 자리를 없애는 게 유일한 해법이다.
//
// ★ 각도는 데이터가 고른다. 세 축 중 그 종목에서 «가장 벗어난» 것을 큰 숫자로
//   올린다. 매번 같은 지표를 올리면 피드가 한 장짜리 템플릿으로 보인다.
//
// 실행: node scripts/x-card.js NVDA [en|ko|ja]
// ============================================================================
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE = 'https://www.signumhq.com';
const OUT_DIR = process.env.X_CARD_OUT || '/tmp/rshots';
const SHOT_DIR = path.join(OUT_DIR, 'shots');

/** 브랜드 악센트. 성격에 따라 둘 중 하나 — 강세/약세 색은 쓰지 않는다(예측 금지). */
const CYAN = [79, 209, 232];
const GOLD = [231, 194, 90];

const n1 = (v) => (v == null ? null : Number(v).toFixed(1));

async function main() {
    const ticker = (process.argv[2] || '').toUpperCase();
    const loc = process.argv[3] || 'en';
    if (!ticker) { console.error('사용: node scripts/x-card.js <TICKER> [en|ko|ja]'); process.exit(1); }

    const dp = await fetch(`${BASE}/api/flow/dark-pool?t=${ticker}`).then((r) => r.json());
    if (!dp?.available) { console.error(`${ticker}: 장외 데이터 없음`); process.exit(2); }

    // 앱 실화면 — 캡처 공장의 검수 게이트가 「로딩 중」 화면을 막아 준다.
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    execFileSync('node', [path.join(__dirname, 'make-x-shot.js'), 'signum', loc, 'cmd', ticker],
        { env: { ...process.env, X_SHOT_OUT: SHOT_DIR }, stdio: 'inherit' });
    const shot = fs.readdirSync(SHOT_DIR)
        .filter((f) => f.endsWith(`-cmd-${loc}-${ticker}.png`))
        .sort()
        .pop();
    if (!shot) { console.error('캡처 실패 — 카드를 만들지 않는다'); process.exit(3); }
    const shotPath = path.join(SHOT_DIR, shot);

    // ── 각도 선택: 그 종목에서 가장 크게 벗어난 축 ─────────────────────────
    const dev = dp.shortDev, vr = dp.volRatio;
    let big, unit, label, sub, accent;

    if (dev != null && Math.abs(dev) >= 8) {
        big = n1(dp.shortPct); unit = '%';
        label = 'of its off-exchange volume printed short';
        sub = `against a ${n1(dp.shortAvg)}% 20-day norm · ${n1(dp.pct)}% off-exchange`;
        accent = dev > 0 ? GOLD : CYAN;
    } else if (vr != null && vr >= 1.6) {
        big = n1(vr); unit = 'x';
        label = 'its own 20-day off-exchange volume';
        sub = `${n1(dp.pct)}% off-exchange · short ${n1(dp.shortPct)}% vs a ${n1(dp.shortAvg)}% norm`;
        accent = CYAN;
    } else {
        big = n1(dp.pct); unit = '%';
        label = 'of its volume printed off-exchange';
        sub = `market average ${dp.marketAvg}% · volume ${n1(vr)}x its own norm`;
        accent = CYAN;
    }

    const cfg = {
        kicker: `Off-exchange tape · ${dp.date}`,
        ticker: `$${ticker}`,
        big, bigUnit: unit, bigLabel: label, sub,
        foot: 'signumhq.com/en/dark-pool · Data source: FINRA · free, no account',
        shot: shotPath,
        accent,
    };

    const out = path.join(OUT_DIR, `xcard-${ticker}-${dp.date}.png`);
    execFileSync('python3', [path.join(__dirname, 'make-x-card.py'), JSON.stringify(cfg), out],
        { stdio: 'inherit' });

    // 붙일 문장까지 같이 준다 — 이미지만 있으면 매번 문구를 새로 고민하게 된다.
    console.log('\n--- 붙일 문장 ---');
    console.log(`$${ticker}: ${big}${unit} ${label}.`);
    console.log(`${sub}.`);
    console.log(`\nFINRA regShoDaily, ${dp.date}. Free for every US ticker:\n${BASE}/en/dark-pool`);
}

main().catch((e) => { console.error(e); process.exit(1); });
