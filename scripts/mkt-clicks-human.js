#!/usr/bin/env node
/* ============================================================================
 * mkt-clicks-human — 스마트링크 클릭을 «사람 / 사람 아님»으로 나눠 읽는다 (2026-10-04)
 *
 * 왜: 원시 클릭(mkt:attr:hit:*)은 설치와 상관이 없었다(r=−0.12). 홈의 SIGNUM·UC·WIM·히어로 네 링크를 자동 수집기가
 *   «같은 밀리초»에 한꺼번에 가져가 홈 클릭이 방문당 6~8 씩 부풀었고, 폰 UA 에는 봇 판정이 아예 없었다.
 *   /app·/app-uc·/app-wim 이 요청마다 clk:<sg|uc|wim>:<태그>:<ET날짜> 에 분류를 남긴다(lib/marketing/clickHuman.ts).
 *   이 스크립트는 그 키만 읽는다 — 기존 표(mkt-clicks.js·mkt-funnel.js·mkt-clicks-ua.js)는 그대로다(원시 키도 그대로 쌓인다).
 *
 * 분류: human(사람의 문서 이동) · bot(수집기 UA) · nolang(Accept-Language 없음) · prefetch · nonnav(fetch·img·HEAD 등)
 *       · nometa(Sec-Fetch 헤더 없음 — 옛 브라우저이거나 흉내 낸 클라이언트)
 * 사용: node scripts/mkt-clicks-human.js [일수=3] [--app=sg|uc|wim|code] [--tag=home]
 * 주의: 배포(2026-10-04) 전 날짜는 비어 있는 게 «정상»이다. 미리보기 배포의 시험 값은 clkp: 로 따로 쌓인다(여기엔 안 나온다).
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const DAYS = Number(args.find((a) => /^\d+$/.test(a)) || 3);
const ONLY_APP = (args.find((a) => a.startsWith('--app=')) || '').slice(6) || null;
const ONLY_TAG = (args.find((a) => a.startsWith('--tag=')) || '').slice(6) || null;
const APPS = ['sg', 'uc', 'wim', 'code'].filter((a) => !ONLY_APP || a === ONLY_APP);   // code = /app 리딤 코드 링크만(2026-10-04 G0)
const DEVICES = ['ios', 'android', 'desktop'];
const CLASSES = ['human', 'bot', 'nolang', 'prefetch', 'nonnav', 'nometa'];

// mkt-clicks-ua.js 와 같은 경로 — EC2 레디스 프록시(Upstash REST 아님). clk: 는 EC2 전용 키다.
const BASE = 'http://52.23.98.13:8081';
const KEY = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) { console.error('.env.local 에 EC2_REDIS_PROXY_KEY 가 없다.'); process.exit(1); }

const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const tags = (() => {
    if (ONLY_TAG) return [ONLY_TAG];
    const out = new Set(['home', 'home_hero', 'reddit_bio', 'quora_bio', 'x_reply', 'github_profile', 'bluesky_bio', 'threads_bio', 'desktop', 'share']);
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8'));
        for (const c of (Array.isArray(raw) ? raw : (raw.channels || []))) for (const t of [c.id, c.tag]) if (/^[a-z0-9_]{1,24}$/.test(t || '')) out.add(t);
    } catch { /* 채널표가 없어도 캐시 쪽으로 진행 */ }
    try {
        const txt = fs.readFileSync(path.join(ROOT, '.agent/marketing/clicks-cache.json'), 'utf8');
        for (const m of txt.matchAll(/"([a-z0-9_]{2,24})"/g)) if (!/^\d/.test(m[1])) out.add(m[1]);
    } catch { /* 캐시가 없으면 채널표만 */ }
    return [...out];
})();

async function get(key) {
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch(`${BASE}/get?key=${encodeURIComponent(key)}`, { headers: { Authorization: 'Bearer ' + KEY } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            const v = j?.value ?? j?.result ?? null;
            if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
            return v && typeof v === 'object' ? v : {};
        } catch { await new Promise((z) => setTimeout(z, 250 * (i + 1))); }
    }
    return null; // 못 쟀다 — 0 과 구분한다
}

(async () => {
    const dates = [...Array(DAYS)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));
    const jobs = [];
    for (const a of APPS) for (const t of tags) for (const d of dates) jobs.push([a, t, d]);
    const sum = {}; // `${app}:${tag}` → { field: n }
    let failed = 0, idx = 0;
    await Promise.all([...Array(12)].map(async () => {
        while (idx < jobs.length) {
            const [a, t, d] = jobs[idx++];
            const v = await get(`clk:${a}:${t}:${d}`);
            if (v === null) { failed++; continue; }
            for (const [f, n] of Object.entries(v || {})) {
                const k = `${a}:${t}`; sum[k] = sum[k] || {}; sum[k][f] = (sum[k][f] || 0) + (Number(n) || 0);
            }
        }
    }));
    const rows = Object.entries(sum).map(([k, o]) => {
        const by = (dev, cls) => o[`${dev}|${cls}`] || 0;
        const total = DEVICES.reduce((s, dv) => s + CLASSES.reduce((x, c) => x + by(dv, c), 0), 0);
        const human = DEVICES.reduce((s, dv) => s + by(dv, 'human'), 0);
        return { k, o, by, total, human };
    }).sort((a, b) => b.human - a.human || b.total - a.total);

    console.log(`── 스마트링크 클릭: 사람 vs 원시 (최근 ${DAYS}일 ET: ${dates[dates.length - 1]}~${dates[0]}) ──`);
    console.log('앱:태그'.padEnd(24) + '사람 iOS'.padStart(9) + '안드'.padStart(6) + 'PC'.padStart(5) + ' │ 원시합' + '  사람%' + ' │ 사람 아님(bot/nolang/prefetch/nonnav/nometa)');
    for (const r of rows) {
        const non = ['bot', 'nolang', 'prefetch', 'nonnav', 'nometa'].map((c) => DEVICES.reduce((s, dv) => s + r.by(dv, c), 0)).join('/');
        console.log(r.k.padEnd(24) + String(r.by('ios', 'human')).padStart(9) + String(r.by('android', 'human')).padStart(6) + String(r.by('desktop', 'human')).padStart(5)
            + ' │ ' + String(r.total).padStart(5) + (r.total ? Math.round((r.human / r.total) * 100) + '%' : '-').padStart(7) + ' │ ' + non);
    }
    if (!rows.length) console.log('(아직 쌓인 값 없음 — 배포 전이거나 태그 클릭 0)');

    // 사람 클릭이 «어떻게» 들어왔나 — Sec-Fetch-Site·랜딩 리퍼러·PC 운영체제(사람 칸만 쌓인다)
    const detail = rows.filter((r) => r.human > 0).slice(0, 12);
    if (detail.length) {
        console.log('\n── 사람 클릭의 경로(site=Sec-Fetch-Site · ref=리퍼러 분류 · os=PC 운영체제) ──');
        for (const r of detail) {
            const parts = Object.entries(r.o).filter(([f]) => /\|(site|ref|os):/.test(f)).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f}=${n}`);
            console.log(r.k.padEnd(24) + parts.join('  '));
        }
    }
    if (failed) console.log(`\n⚠ 조회 실패 ${failed}건 — 값이 0 이 아니라 «못 잰 것»이다.`);
    console.log('\n원시(mkt:attr:hit)는 예전 그대로 쌓인다 — 추세는 mkt-clicks.js, 사람 판단은 이 표. 홈(home)은 원시 키에서 세 앱이 한 칸이라 앱별은 이 표로만 갈린다.');
})();
