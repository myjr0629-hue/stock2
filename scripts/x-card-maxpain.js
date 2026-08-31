#!/usr/bin/env node
// ============================================================================
// x-card-maxpain — «이번 주 맥스페인» 카드를 끝까지 만든다.
//
// 왜 별도 소재인가 (2026-08-31 대표 지적):
//   「다크풀만 있는 게 아니다」. 매번 같은 지표를 올리면 피드가 템플릿으로
//   보이고, 무엇보다 우리가 가진 자원의 대부분을 안 쓰는 셈이 된다.
//   맥스페인은 구글 검색 실측에서 수요가 확인된 형태(「{티커} max pain」)라
//   SEO 와도 같은 방향을 본다.
//
// 맥스페인 = 만기에 «옵션 보유자 전체의 내재가치 합»이 최소가 되는 행사가.
//   시장이 그리 끌린다는 «주장»이 아니라, 미결제약정이 어디에 쌓였는지의
//   요약이다. 문구에서 인과로 쓰지 않는다(예측 금지 규칙).
//
// 실행: node scripts/x-card-maxpain.js NVDA [en|ko|ja]
// ============================================================================
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { composePost } = require('./_applink');

const BASE = 'https://www.signumhq.com';
const OUT_DIR = process.env.X_CARD_OUT || '/tmp/rshots';
const SHOT_DIR = path.join(OUT_DIR, 'shots');
const GOLD = [231, 194, 90];
const MIN_OI = 50000; // 얇은 체인의 맥스페인은 의미가 없다

/** 체인 OI 로 직접 계산 — 벤더의 계산값을 믿지 않는다. */
function maxPain(rows) {
    const strikes = [...new Set(rows.map((r) => r.k))].sort((a, b) => a - b);
    let best = null;
    for (const K of strikes) {
        let pain = 0;
        for (const r of rows) {
            if (r.t === 'call' && r.k < K) pain += (K - r.k) * r.oi;
            if (r.t === 'put' && r.k > K) pain += (r.k - K) * r.oi;
        }
        if (!best || pain < best.pain) best = { K, pain };
    }
    return best;
}

const T = {
    en: {
        kicker: (e) => `Open interest · expiry ${e}`,
        label: 'is where open interest is heaviest at expiry',
        sub: (t, s, g, oi) => `$${t} closed at $${s} — ${g} away · ${oi} contracts open`,
        foot: 'SIGNUM HQ · computed from the full option chain',
        head: (t, mp) => `$${t} — max pain sits at $${mp} this week`,
        body: (s, g, oi) => `Spot closed ${g} from it. ${oi} contracts are open across the chain.\nThat is where the open interest is, not a forecast.`,
    },
    ja: {
        kicker: (e) => `建玉 · 満期 ${e}`,
        label: '満期時に建玉が最も厚くなる行使価格',
        sub: (t, s, g, oi) => `$${t} の終値は $${s} — 差は ${g} · 建玉 ${oi} 枚`,
        foot: 'SIGNUM HQ · オプションチェーン全体から算出',
        head: (t, mp) => `$${t} の今週のマックスペインは $${mp}`,
        body: (s, g, oi) => `終値との差は ${g}。チェーン全体の建玉は ${oi} 枚。\n予測ではなく、建玉がどこに積み上がっているかの要約です。`,
    },
};

async function main() {
    const ticker = (process.argv[2] || '').toUpperCase();
    const loc = process.argv[3] || 'en';
    if (!ticker) { console.error('사용: node scripts/x-card-maxpain.js <TICKER> [en|ja]'); process.exit(1); }
    const t = T[loc] || T.en;

    const u = await fetch(`${BASE}/api/flow/unified?t=${ticker}`).then((r) => r.json());
    const chain = u?.liveQuote?.flow?.rawChain || [];
    const spot = u?.liveQuote?.price;
    if (!chain.length || !spot) { console.error(`${ticker}: 체인 없음`); process.exit(2); }

    const byExp = {};
    for (const c of chain) {
        const d = c.details || {};
        if (!d.expiration_date || !d.strike_price || !d.contract_type) continue;
        (byExp[d.expiration_date] ||= []).push({ k: d.strike_price, t: d.contract_type, oi: c.open_interest || 0 });
    }
    const exp = Object.keys(byExp).sort()[0];
    const rows = byExp[exp];
    const oi = rows.reduce((s, r) => s + r.oi, 0);
    if (oi < MIN_OI) { console.error(`${ticker}: 건옥 ${oi} — 너무 얇다`); process.exit(3); }

    const mp = maxPain(rows);
    const gapPct = ((spot - mp.K) / mp.K) * 100;
    const gap = `${gapPct > 0 ? '+' : ''}${gapPct.toFixed(1)}%`;
    const oiStr = oi.toLocaleString('en-US');

    fs.mkdirSync(SHOT_DIR, { recursive: true });
    execFileSync('node', [path.join(__dirname, 'make-x-shot.js'), 'signum', loc, 'cmd', ticker],
        { env: { ...process.env, X_SHOT_OUT: SHOT_DIR }, stdio: 'inherit' });
    const shot = fs.readdirSync(SHOT_DIR).filter((f) => f.endsWith(`-cmd-${loc}-${ticker}.png`)).sort().pop();
    if (!shot) { console.error('캡처 실패 — 카드를 만들지 않는다'); process.exit(4); }

    const cfg = {
        kicker: t.kicker(exp),
        ticker: `$${ticker}`,
        big: String(mp.K), bigUnit: '', bigLabel: t.label,
        sub: t.sub(ticker, spot.toFixed(2), gap, oiStr),
        foot: t.foot,
        shot: path.join(SHOT_DIR, shot),
        accent: GOLD,
    };
    const out = path.join(OUT_DIR, `xcard-maxpain-${ticker}-${loc}-${exp}.png`);
    execFileSync('python3', [path.join(__dirname, 'make-x-card.py'), JSON.stringify(cfg), out], { stdio: 'inherit' });

    console.log('\n--- 붙일 문장 (앱 링크 포함) ---');
    console.log(composePost([t.head(ticker, mp.K), '', t.body(spot.toFixed(2), gap, oiStr)], { loc }));
    console.log(`\n이미지: ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
