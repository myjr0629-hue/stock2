#!/usr/bin/env node
/* ============================================================================
 * mkt-posts-phone — «그날 올린 글»의 채널별 폰 클릭(안드로이드·iOS)과 PC 클릭을 한 표로 본다.
 *
 * ★2026-09-30 13시 회차에 만든 이유(개선 1건):
 *   코디네이터 질문 «오늘 올린 30편의 채널별 폰 클릭 → 설치»에 답하려면
 *   ① 원장(PUBLISH-LEDGER)에서 그날 채널 목록을 뽑고 ② 채널명→링크 태그(x_post→x_us, note_jp→note,
 *   bluesky_buildinpublic→bluesky_bip …)로 바꾸고 ③ 기기별 키(mkt:attr:hit:<태그>:<기기>:<ET날짜>)를
 *   그 글이 올라간 뒤의 ET 날짜만큼 더해야 했다 — 매번 손으로 했다. 이 스크립트가 그걸 한 번에 한다.
 *
 * 사용: node scripts/mkt-posts-phone.js [KST날짜=오늘]
 *   예) node scripts/mkt-posts-phone.js 2026-09-30
 * 읽기 전용(EC2 레디스 프록시 GET). 쓰는 것 없음.
 *
 * ⚠ 한계(표에도 찍는다)
 *   · 클릭 키는 «채널 태그 × 날짜» 단위다 — 같은 채널의 전날 글이 받은 클릭도 섞인다(글 단위 귀속 아님).
 *   · ET 날짜 경계 = KST 13시(서머타임). 그날 KST 00~13시 글의 클릭은 ET 전날 키에 쌓인다 → 둘 다 더한다.
 *   · 본문 링크가 없는 채널(레딧·지식iN·답글류·GeekNews 댓글)은 프로필 태그만 잡힌다 — «0» 이 곧 실패는 아니다.
 *   · 설치는 여기 없다: Play 는 획득 보고서 UTM(2일+ 지연·소량은 출처 비표시), iOS 는 ASC 웹 소스.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://52.23.98.13:8081'; // mkt-clicks.js 와 같은 EC2 레디스 프록시(const 이름을 URL 로 쓰지 말 것 — 전역 URL 가림)
const KEY = (process.env.EC2_REDIS_PROXY_KEY || '').trim() || ((() => {
    try { return (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim(); } catch { return ''; }
})());
if (!KEY) { console.error('EC2_REDIS_PROXY_KEY 가 없다(.env.local 또는 환경변수).'); process.exit(1); }

const PLATS = ['android', 'ios', 'desktop'];
const kstDay = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TARGET = process.argv[2] || kstDay(new Date());

// 원장 채널명 → 링크 태그. mkt-clicks.js 의 LEDGER_ALIAS·PAIR·tagsOf 와 같은 규칙.
const LEDGER_ALIAS = { note_jp: 'note', x_post: 'x_us', x: 'x_us', quora_en: 'quora' };
const PAIR = { reddit: ['reddit', 'reddit_bio'], quora: ['quora', 'quora_bio'] };
// 본문 링크가 없는(또는 금지된) 채널 — 0 클릭을 «실패»로 읽지 않게 표시만 한다
const NOLINK = new Set(['reddit', 'naver_kin', 'threads_reply', 'threads_reply_kr', 'threads_reply_jp', 'x_reply', 'x_reply_jp', 'bluesky_reply', 'geeknews_comment', 'quora']);

async function get(key) {
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch(`${BASE}/get?key=${key}`, { headers: { Authorization: 'Bearer ' + KEY } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            return Number(j?.value ?? j?.result ?? 0) || 0;
        } catch { await new Promise((z) => setTimeout(z, 250 * (i + 1))); }
    }
    return null; // 못 쟀다 — 0 과 구분
}

(async () => {
    const led = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json'), 'utf8'));
    const entries = Array.isArray(led) ? led : (led.entries || []);
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8'));
    const CH = Array.isArray(raw) ? raw : (raw.channels || []);
    const ids = new Set(CH.map((c) => c.id));
    const tagsOf = (ch) => {
        const a = LEDGER_ALIAS[ch] || ch;
        if (PAIR[a]) return PAIR[a];
        const own = (CH.find((c) => c.id === a) || {}).tag;
        return own && own !== a && !ids.has(own) && !/_bio$/.test(own) ? [a, own] : [a];
    };

    const posts = entries.filter((e) => e.at && kstDay(new Date(e.at)) === TARGET);
    if (!posts.length) { console.log(`${TARGET}(KST) 원장 기록 0건.`); return; }
    const first = new Date(Math.min(...posts.map((e) => new Date(e.at).getTime())));
    // 첫 글의 ET 날짜부터 오늘 ET 날짜까지
    const dates = [];
    for (let t = first.getTime(); ; t += 864e5) {
        const d = etDay(new Date(t)); if (!dates.includes(d)) dates.push(d);
        if (d >= etDay(new Date())) break;
        if (dates.length > 5) break;
    }
    const byCh = {};
    for (const e of posts) { (byCh[e.ch] = byCh[e.ch] || []).push(e); }

    const jobs = [];
    for (const ch of Object.keys(byCh)) for (const t of tagsOf(ch)) for (const p of PLATS) for (const d of dates) jobs.push([ch, t, p, d]);
    const sum = {}; let failed = 0, idx = 0;
    await Promise.all([...Array(12)].map(async () => {
        while (idx < jobs.length) {
            const [ch, t, p, d] = jobs[idx++];
            const v = await get(`mkt:attr:hit:${t}:${p}:${d}`);
            if (v === null) { failed++; continue; }
            if (!sum[ch]) sum[ch] = { android: 0, ios: 0, desktop: 0 };
            sum[ch][p] += v;
        }
    }));

    const rows = Object.keys(byCh).map((ch) => {
        const s = sum[ch] || { android: 0, ios: 0, desktop: 0 };
        const all = s.android + s.ios + s.desktop;
        return { ch, n: byCh[ch].length, tags: tagsOf(ch).join('+'), ...s, all, phone: s.android + s.ios };
    }).sort((a, b) => b.phone - a.phone || b.all - a.all);

    console.log(`\n── ${TARGET}(KST) 게시 ${posts.length}건 · 채널별 폰 클릭 (ET ${dates.join('·')} 합산) ──`);
    console.log('채널                   글  태그                     안드  iOS   PC  폰%   판정');
    let tA = 0, tI = 0, tD = 0;
    for (const r of rows) {
        tA += r.android; tI += r.ios; tD += r.desktop;
        const pct = r.all ? Math.round((r.phone / r.all) * 100) + '%' : '—';
        const verdict = r.phone > 0 ? '★ 폰 클릭' : (r.all > 0 ? 'PC 만' : (NOLINK.has(r.ch) ? '링크 없음(프로필 경유만)' : '0'));
        console.log(r.ch.padEnd(22) + String(r.n).padStart(3) + '  ' + r.tags.padEnd(24).slice(0, 24) + String(r.android).padStart(5) + String(r.ios).padStart(5) + String(r.desktop).padStart(5) + String(pct).padStart(5) + '   ' + verdict);
    }
    console.log('─'.repeat(84));
    const all = tA + tI + tD;
    console.log(`합계  안드 ${tA} · iOS ${tI} · PC ${tD} · 폰 비율 ${all ? Math.round(((tA + tI) / all) * 100) : 0}%`);
    console.log('⚠ 태그×날짜 단위라 같은 채널의 전날 글 클릭도 섞인다(글 단위 아님). 설치는 Play UTM(지연·소량 비표시)·ASC 소스로 따로 본다.');
    if (failed) console.log(`⚠ 조회 실패 ${failed}건 — 0 이 아니라 «못 쟀다»다.`);
})();
