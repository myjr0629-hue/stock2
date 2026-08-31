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
const { composePost } = require('./_applink');

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

    // ── 문구 (로케일별) ───────────────────────────────────────────────────
    // ⚠️ 카드 안 문장이 앱 화면 언어와 다르면 «번역기 돌린 것»처럼 보인다.
    //    캡처도 같은 로케일로 뜨므로 문구도 반드시 같은 언어여야 한다.
    const T = {
        en: {
            kicker: (d) => `Off-exchange tape · ${d}`,
            shortL: 'of its off-exchange volume printed short',
            shortS: (a, p) => `against a ${a}% 20-day norm · ${p}% off-exchange`,
            volL: 'its own 20-day off-exchange volume',
            volS: (p, sp, sa) => `${p}% off-exchange · short ${sp}% vs a ${sa}% norm`,
            thinL: 'its own 20-day off-exchange volume',
            thinS: (p, m) => `${p}% off-exchange · market average ${m}%`,
            pctL: 'of its volume printed off-exchange',
            pctS: (m, v) => `market average ${m}% · volume ${v}x its own norm`,
            foot: 'signumhq.com/en/dark-pool · Data source: FINRA · free, no account',
            app: 'Every US ticker, free, no account:\nsignumhq.com/app?from=x_us',
        },
        ko: {
            kicker: (d) => `장외 체결 테이프 · ${d}`,
            shortL: '장외 물량 중 공매도로 팔린 비중',
            shortS: (a, p) => `평소 ${a}% · 장외 비중 ${p}%`,
            volL: '자기 20일 평균 대비 장외 물량',
            volS: (p, sp, sa) => `장외 비중 ${p}% · 그중 공매도 ${sp}% (평소 ${sa}%)`,
            thinL: '자기 20일 평균 대비 장외 물량',
            thinS: (p, m) => `장외 비중 ${p}% · 시장 평균 ${m}%`,
            pctL: '거래량 중 장외에서 체결된 비중',
            pctS: (m, v) => `시장 평균 ${m}% · 물량은 평소의 ${v}배`,
            foot: 'signumhq.com/ko/dark-pool · 출처 FINRA · 무료·가입 없이',
            app: '전 종목 무료·가입 없이:\nsignumhq.com/app?from=x_kr',
        },
        ja: {
            kicker: (d) => `場外約定テープ · ${d}`,
            shortL: '場外出来高のうち空売りで売られた割合',
            shortS: (a, p) => `平常 ${a}% · 場外比率 ${p}%`,
            volL: '自分の20日平均に対する場外出来高',
            volS: (p, sp, sa) => `場外比率 ${p}% · うち空売り ${sp}%（平常 ${sa}%）`,
            thinL: '自分の20日平均に対する場外出来高',
            thinS: (p, m) => `場外比率 ${p}% · 市場平均 ${m}%`,
            pctL: '出来高のうち場外で約定した割合',
            pctS: (m, v) => `市場平均 ${m}% · 出来高は平常の ${v}倍`,
            foot: 'signumhq.com/ja/dark-pool · 出典 FINRA · 無料・登録不要',
            app: '全銘柄、無料・登録不要:\nsignumhq.com/app?from=x_jp',
        },
    }[loc] || null;
    if (!T) { console.error('로케일은 en|ko|ja'); process.exit(4); }

    // ── 각도 선택: 그 종목에서 가장 크게 벗어난 축 ─────────────────────────
    //   ★ 「평소보다 유난히 적었다」도 신호다. 배수만 위로 보면 조용한 날을
    //     통째로 놓친다(AAOI 0.5배 = 5백분위에서 실제로 겪었다).
    const dev = dp.shortDev, vr = dp.volRatio;
    let big, unit, label, sub, accent;

    if (dev != null && Math.abs(dev) >= 8) {
        big = n1(dp.shortPct); unit = '%';
        label = T.shortL;
        sub = T.shortS(n1(dp.shortAvg), n1(dp.pct));
        accent = dev > 0 ? GOLD : CYAN;
    } else if (vr != null && vr >= 1.6) {
        big = n1(vr); unit = 'x';
        label = T.volL;
        sub = T.volS(n1(dp.pct), n1(dp.shortPct), n1(dp.shortAvg));
        accent = CYAN;
    } else if (vr != null && vr <= 0.6) {
        big = n1(vr); unit = 'x';
        label = T.thinL;
        sub = T.thinS(n1(dp.pct), dp.marketAvg);
        accent = CYAN;
    } else {
        big = n1(dp.pct); unit = '%';
        label = T.pctL;
        sub = T.pctS(dp.marketAvg, n1(vr));
        accent = CYAN;
    }

    const cfg = {
        kicker: T.kicker(dp.date),
        ticker: `$${ticker}`,
        big, bigUnit: unit, bigLabel: label, sub,
        foot: T.foot,
        shot: shotPath,
        accent,
    };

    const out = path.join(OUT_DIR, `xcard-${ticker}-${loc}-${dp.date}.png`);
    execFileSync('python3', [path.join(__dirname, 'make-x-card.py'), JSON.stringify(cfg), out],
        { stdio: 'inherit' });

    // 붙일 문장까지 같이 준다 — 이미지만 있으면 매번 문구를 새로 고민하게 된다.
    // ★ 앱 스마트링크는 «항상» 붙는다. 대표 반복 지적(오늘 10건 중 3건만 넣었다).
    //   기억에 의존하면 또 빠지므로 도구가 강제한다. /app 은 UA 로 분기해
    //   Play(install referrer 포함)/App Store 로 보내므로 설치로 꽂히고 측정된다.
    console.log('\n--- 붙일 문장 (앱 링크 포함) ---');
    console.log(composePost([`$${ticker} — ${big}${unit} · ${label}`, sub],
        { loc, source: `FINRA regShoDaily · ${dp.date}` }));
}

main().catch((e) => { console.error(e); process.exit(1); });
