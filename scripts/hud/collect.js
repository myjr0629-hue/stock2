#!/usr/bin/env node
/* 관제 콘솔용 «느린 실측» 수집기 — 사이클마다 돌린다.
 *   node scripts/hud/collect.js [--clicks] [--redis] [--ads-file <path>] [--gate <문구>]
 * 인자가 없으면 --clicks --redis 를 한다. 측정한 것만 갱신하고 나머지는 이전 값을 보존한다.
 * 추측값을 넣지 않는다: 실패하면 그 항목을 비워 둔다(화면에 «미측정» 으로 나온다). */
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..'); const OUT = path.join(ROOT, '.agent', 'hud', 'metrics.json');
const A = process.argv.slice(2); const has = (f) => A.includes(f); const val = (f) => { const i = A.indexOf(f); return i >= 0 ? A[i + 1] : null; };
const want = { clicks: has('--clicks') || !A.length, redis: has('--redis') || !A.length };
const prev = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return {}; } })();
const out = Object.assign({}, prev, { at: new Date().toISOString() });
// 이전 실행의 블록을 그대로 물려받을 때는 «몇 시간 전 것인지»를 반드시 함께 싣는다.
// 그러지 않으면 화면이 옛 숫자를 «지금»이라고 말한다(2026-09-22 실측: 4일 전 클릭이 오늘로 떴다).
for (const k of ['clicks', 'ads', 'ratings']) {
    if (prev[k] && prev[k].at) {
        const h = (Date.now() - Date.parse(prev[k].at)) / 36e5;
        if (Number.isFinite(h)) out[k] = Object.assign({}, prev[k], { ageH: +h.toFixed(1) });
    }
}

if (want.clicks) {
    try {
        const t = execSync('node scripts/mkt-clicks.js', { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
        // ★2026-09-22 파서 수리 — 표에 열이 늘어 정규식이 «행 끝»에서 어긋나 있었다.
        //   실측: 21일 합계가 **5** 로 나왔다(실제 821). 행이 하나도 안 잡히면 합계 보정도 못 한다.
        //   현재 모양: `채널  3일  오늘/어제/그제  21일  [내점검]  실3일`
        //   → 정규식으로 끝을 고정하지 말고 «토큰 위치»로 읽는다. 열이 또 늘어도 안 깨진다.
        //   그리고 3일은 «실3일»(자가점검 제외본)이 있으면 그것을 쓴다 — 내 점검 클릭을 성과로 세지 않는다.
        const rows = t.split('\n').map((ln) => {
            const x = ln.trim().split(/\s+/);
            if (x.length < 4) return null;
            const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(x[2]);
            if (!m || !/^[a-z0-9_]+$/i.test(x[0]) || !/^\d+$/.test(x[1]) || !/^\d+$/.test(x[3])) return null;
            const last = x[x.length - 1];
            const real3 = x.length > 4 && /^\d+$/.test(last) ? +last : +x[1];
            return { ch: x[0], d3: real3, d3raw: +x[1], today: +m[1], y1: +m[2], y2: +m[3], d21: +x[3] };
        }).filter(Boolean);
        const tot = t.match(/합계\s+(\d+)\s+\S*\s*(\d+)/);
        out.clicks = {
            // ⚠️ 합계 줄 정규식이 21일 칸을 잘못 집는 경우가 있다(실측: 1 로 나왔다).
            //    행 합보다 작으면 «파싱 실패»로 보고 행 합을 쓴다 — 화면에 거짓 숫자를 내지 않는다.
            total3: Math.max(tot ? +tot[1] : 0, rows.reduce((a, r) => a + r.d3, 0)),
            total21: Math.max(tot ? +tot[2] : 0, rows.reduce((a, r) => a + r.d21, 0)),
            today: rows.reduce((a, r) => a + r.today, 0),
            rows: rows.sort((a, b) => b.d21 - a.d21).slice(0, 24),
            top: rows.slice(0, 5).map((r) => [r.ch, r.d21]),
            at: out.at,
        };
        // ★2026-09-22 — 광고에서 고친 것과 «같은 고장»이 클릭에도 있었다.
        //   `--ads-file` 만 주고 돌리면 want.clicks 가 false 라 예전 블록이 prev 로 살아남는데,
        //   화면은 그것을 «오늘»이라고 불렀다(실측: clicks.at 09-18, 화면은 현재값처럼 표시).
        //   블록을 새로 만든 이 경로에서는 나이가 0 이다. 아래 else 가 «안 만든 경우»를 표시한다.
        out.clicks.ageH = 0;
    } catch (e) { console.error('clicks 실패:', String(e.message).slice(0, 80)); }
}
if (want.redis) {
    try {
        const t = execSync('node scripts/redis-upstash-info.js hud', { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
        const g = (k) => { const m = t.match(new RegExp('"' + k + '": *"?([\\d.]+)')); return m ? Number(m[1]) : null; };
        const w = g('total_writes_processed'), r = g('total_reads_processed');
        let rate = null;
        if (prev.redis && prev.redis.writes && prev.redis.at) {
            const mins = (Date.now() - new Date(prev.redis.at).getTime()) / 60000;
            if (mins > 4) rate = `쓰기 ${((w - prev.redis.writes) / mins).toFixed(0)} · 읽기 ${((r - prev.redis.reads) / mins).toFixed(0)}`;
        }
        out.redis = { writes: w, reads: r, member: (t.match(/"local_member": *"([^"]+)"/) || [])[1] || null, rate, at: out.at };
    } catch (e) { console.error('redis 실패:', String(e.message).slice(0, 80)); }
}
const af = val('--ads-file');
if (af) {
    try {
        const t = fs.readFileSync(af, 'utf8');
        const m = t.match(/합계 \| (\$[\d.,]+) \| [^|]* \| [^|]* \| [^|]* \| ([\d,]+) \| (\d+) \| (\d+)/);
        // 캠페인별 행: ads-today.mjs 가 찍는 «이름 상태 지출 노출 탭 설치 CPA» 한 줄
        const per = [...t.matchAll(/^\s{2}(SIGNUM [A-Z]{2}[^\n]*?)\s+(실행 중|일시 정지됨)\s+지출 \$([\d.,]+)\s+노출 ([\d,]+)\s+탭 (\d+)\s+설치 (\d+)\s+CPA \$([\d.,]+)/gm)]
            .map((x) => ({ name: x[1].trim(), state: x[2], spend: +x[3].replace(/,/g, ''), impr: +x[4].replace(/,/g, ''),
                           taps: +x[5], installs: +x[6], cpa: +x[7].replace(/,/g, '') }));
        // 기간이 «오늘»로 고정된 판독인지 표시한다 — 예전에 7일치를 하루로 읽어 거짓 경보를 냈다
        const isToday = /기간 선택=\{"t":"오늘"/.test(t);
        // ★2026-09-21 — 판독 «파일»이 며칠 묵어도 화면은 「오늘」이라고 떠 있었다.
        //   실제로 2.5일 전 값($21.26·설치 1)이 오늘로 보였고, 같은 시각 콘솔은 $0.00·전부 정지였다.
        //   화면이 지표를 «지어내는» 전형이다 → 파일의 나이를 같이 싣고, 6시간을 넘으면 stale 로 표시한다.
        let ageH = null;
        try { ageH = (Date.now() - fs.statSync(af).mtimeMs) / 36e5; } catch {}
        const stale = ageH == null || ageH > 6;
        if (m) out.ads = { spend: m[1], impr: m[2], taps: m[3], installs: m[4],
                           per, isToday: isToday && !stale, stale, ageH: ageH == null ? null : +ageH.toFixed(1),
                           readAt: (() => { try { return new Date(fs.statSync(af).mtimeMs).toISOString(); } catch { return null; } })(),
                           at: out.at };
    } catch (e) { console.error('ads 실패:', e.message.slice(0, 60)); }
}
// ★ 별점 — 2026-09-19 실측으로 확정한 병목이다(노출 2,190 → 열람 11 → 설치 7, 별점 0).
//   브라우저 없이 읽는다. 대표가 taskspace 를 잡으면 브라우저 검증이 통째로 멈추므로
//   «가장 중요한 지표»를 그 의존에 묶지 않는다.
if (has('--ratings') || !A.length) {
    try {
        const t = execSync('node scripts/check-store-ratings.js --json', { cwd: ROOT, encoding: 'utf8', timeout: 90000 });
        const j = JSON.parse(t);
        out.ratings = { at: j.at, rows: (j.rows || []).map((r) => ({ name: r.name, rating: r.rating, reviews: r.reviews, downloads: r.downloads, error: r.error || null })) };
    } catch (e) {
        // 종료코드 1(별점 0) 도 예외로 온다 — stdout 이 있으면 그걸 쓴다
        const so = e && e.stdout ? String(e.stdout) : '';
        try { const j = JSON.parse(so); out.ratings = { at: j.at, rows: j.rows.map((r) => ({ name: r.name, rating: r.rating, reviews: r.reviews, downloads: r.downloads, error: r.error || null })) }; }
        catch { console.error('ratings 실패:', String(e.message).slice(0, 70)); }
    }
}
const gate = val('--gate'); if (gate) out.gate = gate;
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('metrics.json 갱신:', Object.keys(out).filter((k) => k !== 'at').join(', '));
