#!/usr/bin/env node
/* ============================================================================
 * mkt-clicks-platform — 클릭을 «기기»로 쪼개 본다 (android / ios / desktop)
 *
 * ★2026-09-22 만든 이유 — 숫자가 안 맞았다:
 *   21일 스마트링크 클릭 **882건** · Play 등록정보 열람 **11건**.
 *   등록정보를 연 사람의 **61% 가 설치**하므로, 클릭이 스토어까지 갔다면 설치는 수백이어야 한다.
 *   실제 설치는 7건이었다. 즉 «클릭이 스토어에 닿지 못하고 있다».
 *
 *   가장 유력한 구멍은 **데스크톱**이다. 우리 상위 채널 중 Medium·LinkedIn·IndieHackers·Quora 는
 *   데스크톱 독자가 많은데, 데스크톱에서 `apps.apple.com` 을 열면 **설치할 방법이 없다**.
 *   그런데 그동안 집계가 기기를 구분하지 않아 그 구멍의 «크기»를 잴 수가 없었다.
 *
 *   그래서 `/app` 라우트가 `mkt:attr:hit:<tag>:<platform>:<date>` 를 하나 더 센다(2026-09-22 배포).
 *   이 스크립트는 그 키만 읽는다. **기존 표(`mkt-clicks.js`)는 건드리지 않는다** —
 *   그쪽은 키를 «정확한 이름»으로 가져오므로 새 키가 섞여도 숫자가 오염되지 않는다.
 *
 * 사용: node scripts/mkt-clicks-platform.js [일수=7]
 * 주의: 배포 시점부터 쌓인다. 배포 전 날짜는 전부 0 으로 보이는 게 «정상»이다.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DAYS = Number(process.argv[2] || 7);
const PLATS = ['android', 'ios', 'desktop'];

// ⚠ mkt-clicks.js 와 «같은» 경로를 쓴다 — EC2 레디스 프록시다(Upstash REST 가 아니다).
//   const 이름을 URL 로 쓰면 전역 URL 클래스를 가려 fetch 가 조용히 죽는다(기존 파일의 경고 그대로).
const BASE = 'http://52.23.98.13:8081';
const KEY = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) { console.error('.env.local 에 EC2_REDIS_PROXY_KEY 가 없다.'); process.exit(1); }

const etDay = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

const tags = (() => {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8'));
        const arr = Array.isArray(raw) ? raw : (raw.channels || []);
        return [...new Set(arr.map((c) => c.tag || c.id).filter((t) => /^[a-z0-9_]{1,24}$/.test(t || '')))];
    } catch { return []; }
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
    for (const t of tags) for (const p of PLATS) for (const d of dates) jobs.push([t, p, d]);

    const sum = {};
    let failed = 0, idx = 0;
    await Promise.all([...Array(12)].map(async () => {
        while (idx < jobs.length) {
            const [t, p, d] = jobs[idx++];
            const v = await get(`mkt:attr:hit:${t}:${p}:${d}`);
            if (v === null) { failed++; continue; }
            if (!sum[t]) sum[t] = { android: 0, ios: 0, desktop: 0 };
            sum[t][p] += v;
        }
    }));

    const rows = Object.entries(sum)
        .map(([t, v]) => ({ t, ...v, all: v.android + v.ios + v.desktop }))
        .filter((r) => r.all > 0)
        .sort((a, b) => b.all - a.all);

    console.log(`\n── 기기별 클릭 (최근 ${DAYS}일 · ET 기준) ──`);
    if (!rows.length) {
        console.log('아직 0건이다. 이 집계는 2026-09-22 배포 시점부터 쌓인다 — 배포 전 날짜가 0인 것은 정상이다.');
        if (failed) console.log(`⚠ 조회 실패 ${failed}건 — 0 이 아니라 «못 쟀다»다.`);
        return;
    }
    console.log('채널             안드로이드   iOS   데스크톱   합계   설치가능%');
    let tA = 0, tI = 0, tD = 0;
    for (const r of rows) {
        tA += r.android; tI += r.ios; tD += r.desktop;
        const inst = r.all ? Math.round(((r.android + r.ios) / r.all) * 100) : 0;
        console.log(
            r.t.padEnd(16) + String(r.android).padStart(6) + String(r.ios).padStart(7) +
            String(r.desktop).padStart(9) + String(r.all).padStart(7) + String(inst + '%').padStart(9),
        );
    }
    const all = tA + tI + tD;
    console.log('─'.repeat(58));
    console.log('합계'.padEnd(16) + String(tA).padStart(6) + String(tI).padStart(7) + String(tD).padStart(9) +
        String(all).padStart(7) + String(all ? Math.round(((tA + tI) / all) * 100) : 0 + '%').padStart(9) + '%');
    console.log('\n«설치가능%» = 안드로이드+iOS 비율. 데스크톱 클릭은 스토어 페이지에 닿아도 설치로 이어지지 않는다.');
    if (failed) console.log(`⚠ 조회 실패 ${failed}건 — 0 이 아니라 «못 쟀다»다.`);
})();
