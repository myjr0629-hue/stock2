#!/usr/bin/env node
/* ============================================================================
 * mkt-funnel-human — 웹 페이지 «사람 방문» → 그 페이지 설치 버튼 «사람 클릭» → CTR (2026-10-04)
 *
 * 분모 pv:<페이지군>:<로케일>:<ET날짜>  (lib/marketing/pageViewHuman.ts — 서버가 매 요청 사람 판정, EC2 전용)
 *      human = 사람의 문서 착지(사이트 안 <Link> 이동은 없음 — Next 가 RSC 헤더를 지워 prefetch 와 못 가른다) · app = 앱 웹뷰(웹 합계에서 뺀다)
 * 분자 clk:<sg|uc|wim>:<태그>:<ET날짜> 의 «기기|human» 칸 (lib/marketing/clickHuman.ts) — 그 페이지 버튼의 from 태그만
 * 사람 아님 pvb:<페이지군>:<ET날짜> (bot·nolang·nometa·nonnav)
 *
 * 사용: node scripts/mkt-funnel-human.js [일수=1] [--preview] [--group=home]
 *   --preview = 미리보기 배포의 시험 값(pvp:·pvbp:·clkp:)
 * 주의: 배포(2026-10-04) 전 날짜는 비어 있는 게 정상이다. CTR = 클릭 ÷ PV (한 방문이 버튼 여러 개를 누를 수 있다).
 *   iOS 스마트 앱 배너·안드 설치 배너를 누른 설치는 우리 서버를 안 거쳐 분자에 없다.
 * ========================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const DAYS = Number(args.find((a) => /^\d+$/.test(a)) || 1);
const PREVIEW = args.includes('--preview');
const ONLY = (args.find((a) => a.startsWith('--group=')) || '').slice(8) || null;
const P = PREVIEW ? { pv: 'pvp', pvb: 'pvbp', clk: 'clkp' } : { pv: 'pv', pvb: 'pvb', clk: 'clk' };

const BASE = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const KEY = process.env.EC2_REDIS_PROXY_KEY || (() => {
    for (const f of [path.join(ROOT, '.env.local'), path.join(os.homedir(), '.gemini/antigravity/scratch/stock2/.env.local')]) {
        try { const m = fs.readFileSync(f, 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m); if (m) return m[1].trim().replace(/^["']|["']$/g, ''); } catch { /* 다음 후보 */ }
    }
    return '';
})();
if (!KEY) { console.error('EC2_REDIS_PROXY_KEY 가 없다(.env.local 또는 환경변수).'); process.exit(1); }

const LOCALES = ['ko', 'en', 'ja', 'xx'];
const DEV = ['ios', 'android', 'desktop'];
const NONHUMAN = ['bot', 'nolang', 'nometa', 'nonnav', 'prefetch'];

// 학습 개념 페이지 버튼 태그 = seo_learn_<슬러그에서 - 뺀 것> — 슬러그는 lib/seo/concepts.ts 의 CONCEPT_SLUGS
const learnTags = (() => {
    const out = ['seo_learn_hub'];
    try {
        const src = fs.readFileSync(path.join(ROOT, 'src/lib/seo/concepts.ts'), 'utf8');
        const arr = (src.match(/export const CONCEPT_SLUGS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
        for (const m of arr.matchAll(/['"]([a-z0-9-]+)['"]/g)) out.push(`seo_learn_${m[1].replace(/-/g, '')}`);
    } catch { /* 허브만 */ }
    return out;
})();

// 페이지군 → 그 페이지의 설치 버튼(앱:from 태그). 페이지 소스의 href 와 같아야 한다.
const GROUPS = {
    home: ['sg:home', 'uc:home', 'wim:home', 'sg:home_hero'],                // (home)/page.tsx
    ticker: ['uc:seo_uc', 'sg:seo_sg', 'wim:seo_wim'],                       // flow/[ticker] ctaTag('seo_*')
    tickers: ['sg:seo_tickers'],
    options_flow: ['sg:seo_optionsflow', 'uc:seo_optionsflow'],
    dark_pool: ['sg:seo_darkpool', 'uc:seo_darkpool', 'wim:seo_darkpool'],
    rankings: ['sg:seo_rankings'],
    learn: learnTags.map((t) => `sg:${t}`),
    how_it_works: ['sg:seo_howitworks'],
};
const groups = Object.keys(GROUPS).filter((g) => !ONLY || g === ONLY);
const tooLong = learnTags.filter((t) => !/^[a-z0-9_]{1,24}$/.test(t));   // clickHuman 은 24자 넘는 태그를 세지 않는다

// /app 착지(참고) — 모든 태그의 clk:sg 사람 칸. 태그 목록은 mkt-clicks-human.js 와 같은 출처.
const allTags = (() => {
    const out = new Set(['home', 'home_hero', 'share', 'desktop', 'reddit_bio', 'quora_bio', 'x_reply', 'github_profile', 'bluesky_bio', 'threads_bio']);
    for (const ts of Object.values(GROUPS)) for (const at of ts) out.add(at.split(':')[1]);
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8'));
        for (const c of (Array.isArray(raw) ? raw : (raw.channels || []))) for (const t of [c.id, c.tag]) if (/^[a-z0-9_]{1,24}$/.test(t || '')) out.add(t);
    } catch { /* 없으면 기본 목록 */ }
    return [...out];
})();

const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dates = [...Array(DAYS)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));

let failed = 0;
async function mget(keys) {
    const out = new Map();
    for (let i = 0; i < keys.length; i += 40) {
        const chunk = keys.slice(i, i + 40);
        let ok = false;
        for (let tr = 0; tr < 3 && !ok; tr++) {
            try {
                const r = await fetch(`${BASE}/mget?keys=${encodeURIComponent(chunk.join(','))}`, { headers: { Authorization: 'Bearer ' + KEY } });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const j = await r.json();
                (j.results || []).forEach((v, idx) => out.set(chunk[idx], v && typeof v === 'object' ? v : {}));
                ok = true;
            } catch { await new Promise((z) => setTimeout(z, 300 * (tr + 1))); }
        }
        if (!ok) failed += chunk.length;   // 못 잰 것 — 0 과 구분
    }
    return out;
}
const add = (o, f, n) => { o[f] = (o[f] || 0) + (Number(n) || 0); };
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
// 터미널 칸 너비(한글 2칸) 기준 맞춤 — padEnd/padStart 는 한글을 1칸으로 세어 표가 어긋난다
const dw = (s) => [...String(s)].reduce((n, ch) => n + (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch) ? 2 : 1), 0);
const padE = (s, n) => String(s) + ' '.repeat(Math.max(0, n - dw(s)));
const padS = (s, n) => ' '.repeat(Math.max(0, n - dw(s))) + String(s);

(async () => {
    const pvKeys = [], pvbKeys = [], clkKeys = [];
    for (const g of groups) for (const d of dates) {
        for (const l of LOCALES) pvKeys.push(`${P.pv}:${g}:${l}:${d}`);
        pvbKeys.push(`${P.pvb}:${g}:${d}`);
    }
    for (const t of allTags) for (const d of dates) clkKeys.push(`${P.clk}:sg:${t}:${d}`);
    for (const g of groups) for (const at of GROUPS[g]) if (!at.startsWith('sg:')) for (const d of dates) clkKeys.push(`${P.clk}:${at}:${d}`);
    const vals = await mget([...new Set([...pvKeys, ...pvbKeys, ...clkKeys])]);

    console.log(`── 사람 퍼널: 페이지 사람 방문 → 설치 버튼 사람 클릭 (최근 ${DAYS}일 ET ${dates[dates.length - 1]}~${dates[0]}${PREVIEW ? ' · 미리보기 값' : ''}) ──`);
    console.log('PV = 사람의 «문서 이동»(바깥 유입·새로고침·새 탭·사이트 안 일반 <a> 링크) · Next <Link> 클라이언트 이동만 빠진다(서버가 prefetch 와 못 가른다) · 앱 웹뷰 제외 · CTR = 설치 클릭 ÷ PV\n');
    console.log(padE('', 33) + ' │' + padE(' 사람 PV(기기별)', 18) + ' │' + padE(' 설치 클릭(사람)', 18) + ' │ CTR = 클릭 ÷ PV');
    console.log(padE('페이지군', 14) + padS('PV', 6) + padE('', 13) + ' │' + ['iOS', '안드', 'PC'].map((x) => padS(x, 6)).join('')
        + ' │' + ['iOS', '안드', 'PC'].map((x) => padS(x, 6)).join('') + ' │' + ['iOS', '안드', 'PC', '전체'].map((x) => padS(x, 8)).join(''));
    const extra = [];
    for (const g of groups) {
        const hum = {}, byLoc = {}, non = {};
        for (const d of dates) {
            for (const l of LOCALES) {
                const v = vals.get(`${P.pv}:${g}:${l}:${d}`) || {};
                for (const [f, n] of Object.entries(v)) {
                    add(hum, f, n);
                    if (/^(ios|android|desktop)\|human$/.test(f)) add(byLoc, l, n);
                }
            }
            for (const [f, n] of Object.entries(vals.get(`${P.pvb}:${g}:${d}`) || {})) add(non, f, n);
        }
        const pv = (dv) => hum[`${dv}|human`] || 0;
        const land = DEV.reduce((s, dv) => s + (hum[`${dv}|human`] || 0), 0);
        const clk = { ios: 0, android: 0, desktop: 0 };
        for (const at of GROUPS[g]) for (const d of dates) {
            const v = vals.get(`${P.clk}:${at}:${d}`) || {};
            for (const dv of DEV) clk[dv] += Number(v[`${dv}|human`]) || 0;
        }
        const pvAll = land, clkAll = DEV.reduce((s, dv) => s + clk[dv], 0);
        console.log(padE(g, 14) + padS(pvAll, 6) + padE('', 13) + ' │' + DEV.map((dv) => padS(pv(dv), 6)).join('')
            + ' │' + DEV.map((dv) => padS(clk[dv], 6)).join('') + ' │' + DEV.map((dv) => padS(pct(clk[dv], pv(dv)), 8)).join('') + padS(pct(clkAll, pvAll), 8));
        const appPv = hum['app|human'] || 0;
        const locs = LOCALES.filter((l) => byLoc[l]).map((l) => `${l} ${byLoc[l]}`).join(' · ');
        const nonTot = Object.values(non).reduce((s, n) => s + n, 0);
        const nonBy = NONHUMAN.map((c) => [c, Object.entries(non).filter(([f]) => f.endsWith(`|${c}`)).reduce((s, [, n]) => s + n, 0)]).filter(([, n]) => n);
        extra.push({ g, locs, appPv, nonTot, nonBy, land, hum });
    }

    console.log('\n── 로케일 · 앱 웹뷰(별도) · 사람 아님(pvb) — 사람% = 착지 ÷ (착지 + 사람 아님 문서 요청) ──');
    for (const e of extra) {
        console.log(padE(e.g, 14) + `로케일 ${e.locs || '-'}` + (e.appPv ? ` │ 앱 웹뷰 ${e.appPv}` : '')
            + ` │ 사람 아님 ${e.nonTot}${e.nonBy.length ? ' (' + e.nonBy.map(([c, n]) => `${c} ${n}`).join(' · ') + ')' : ''} │ 사람% ${pct(e.land, e.land + e.nonTot)}`);
    }

    const home = extra.find((e) => e.g === 'home');
    if (home && home.land) {
        const parts = Object.entries(home.hum).filter(([f]) => /\|(ref|site):/.test(f)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([f, n]) => `${f}=${n}`);
        console.log('\n── 홈 사람 착지는 어디서 왔나(ref=리퍼러 분류 · site=Sec-Fetch-Site) ──\n' + parts.join('  '));
    }

    // /app 착지(참고) — 모든 태그의 사람 클릭 = 스마트링크로 들어온 사람 수(폰은 바로 스토어로 302, PC 는 넘겨주기 화면)
    const app = { ios: 0, android: 0, desktop: 0 }; const byTag = {};
    for (const t of allTags) for (const d of dates) {
        const v = vals.get(`${P.clk}:sg:${t}:${d}`) || {};
        for (const dv of DEV) { const n = Number(v[`${dv}|human`]) || 0; app[dv] += n; if (n) add(byTag, t, n); }
    }
    const top = Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} ${n}`).join(' · ');
    console.log(`\n── /app 스마트링크 사람 착지(참고 · clk:sg 전체 태그) ── iOS ${app.ios} · 안드 ${app.android} · PC ${app.desktop}${top ? '  │ 상위 태그: ' + top : ''}`);

    if (tooLong.length) console.log(`\n⚠ 24자 넘는 학습 태그 ${tooLong.length}개는 clk: 에 기록되지 않는다: ${tooLong.join(', ')}`);
    if (failed) console.log(`\n⚠ 조회 실패 ${failed}건 — 값이 0 이 아니라 «못 잰 것»이다.`);
})();
