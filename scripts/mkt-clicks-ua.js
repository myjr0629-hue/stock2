#!/usr/bin/env node
/* ============================================================================
 * mkt-clicks-ua — «데스크톱 클릭»을 UA 계열로 쪼갠다 (사람 브라우저인가, 수집기인가)
 *
 * ★2026-09-26 만든 이유: 9/23~25 블루스키 계열 태그 91클릭이 전부 데스크톱·폰 0 이었다(팔로워 25, 게시물 대부분 좋아요 0).
 *   /app 라우트는 PREVIEW_BOT_RE 에 없는 수집기를 «desktop 클릭»으로 센다. 그 숫자가 slot 의 «키우기» 레인을 정한다.
 *   라우트가 데스크톱 요청마다 `mkt:attr:ua:<tag>:<kind>:<ET날짜>` 를 한 칸 더 센다(feat/click-ua-audit).
 *   이 스크립트는 그 키만 읽는다 — 기존 표(mkt-clicks.js·mkt-clicks-platform.js)는 건드리지 않는다.
 *
 * kind: nomoz(UA 에 Mozilla/ 없음) · bot(수집기 표지) · nolang(Accept-Language 없음) · mac · win · linux · other
 * 사용: node scripts/mkt-clicks-ua.js [일수=3]
 * 주의: 배포 시점부터 쌓인다. 배포 전 날짜는 전부 0 으로 보이는 게 «정상»이다.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DAYS = Number(process.argv[2] || 3);
const KINDS = ['nomoz', 'bot', 'nolang', 'mac', 'win', 'linux', 'other'];
const HUMAN = new Set(['mac', 'win', 'linux', 'other']);

// mkt-clicks-platform.js 와 같은 경로 — EC2 레디스 프록시(Upstash REST 아님).
const BASE = 'http://52.23.98.13:8081';
const KEY = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) { console.error('.env.local 에 EC2_REDIS_PROXY_KEY 가 없다.'); process.exit(1); }

const etDay = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

const tags = (() => {
    const out = new Set(['reddit_bio', 'quora_bio', 'x_reply', 'github_profile', 'bluesky_bio', 'threads_bio']);
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
            const r = await fetch(`${BASE}/get?key=${key}`, { headers: { Authorization: 'Bearer ' + KEY } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            return Number(j?.value ?? j?.result ?? 0) || 0;
        } catch { await new Promise((z) => setTimeout(z, 250 * (i + 1))); }
    }
    return null; // 못 쟀다 — 0 과 구분한다
}

(async () => {
    const dates = [...Array(DAYS)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));
    const jobs = [];
    for (const t of tags) for (const k of KINDS) for (const d of dates) jobs.push([t, k, d]);
    const sum = {};
    let failed = 0, idx = 0;
    await Promise.all([...Array(12)].map(async () => {
        while (idx < jobs.length) {
            const [t, k, d] = jobs[idx++];
            const v = await get(`mkt:attr:ua:${t}:${k}:${d}`);
            if (v === null) { failed++; continue; }
            if (v) { sum[t] = sum[t] || {}; sum[t][k] = (sum[t][k] || 0) + v; }
        }
    }));
    const rows = Object.entries(sum).map(([t, o]) => {
        const total = KINDS.reduce((a, k) => a + (o[k] || 0), 0);
        const human = KINDS.filter((k) => HUMAN.has(k)).reduce((a, k) => a + (o[k] || 0), 0);
        return { t, o, total, human };
    }).sort((a, b) => b.total - a.total);
    console.log(`── 데스크톱 클릭의 UA 계열 (최근 ${DAYS}일 ET: ${dates[dates.length - 1]}~${dates[0]}) ──`);
    console.log('태그'.padEnd(20) + KINDS.map((k) => k.padStart(7)).join('') + '   합계  사람추정');
    for (const r of rows) {
        console.log(r.t.padEnd(20) + KINDS.map((k) => String(r.o[k] || 0).padStart(7)).join('')
            + String(r.total).padStart(7) + (Math.round((r.human / r.total) * 100) + '%').padStart(9));
    }
    if (!rows.length) console.log('(아직 쌓인 값 없음 — 라우트 배포 전이거나 데스크톱 클릭 0)');
    if (failed) console.log(`⚠ 조회 실패 ${failed}건 — 값이 0 이 아니라 «못 잰 것»이다.`);
    console.log('\n«사람추정» = mac+win+linux+other. bot·nomoz·nolang 은 사람 브라우저가 보내지 않는 모양이다(단정은 아님).');
})();
