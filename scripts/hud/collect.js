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

if (want.clicks) {
    try {
        const t = execSync('node scripts/mkt-clicks.js', { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
        // 행 모양: 채널 | 3일 | 오늘/어제/그제 | 21일
        const rows = [...t.matchAll(/^(\w+)\s+(\d+)\s+(\d+)\/(\d+)\/(\d+)\s+(\d+)\s*$/gm)]
            .map((m) => ({ ch: m[1], d3: +m[2], today: +m[3], y1: +m[4], y2: +m[5], d21: +m[6] }));
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
        if (m) out.ads = { spend: m[1], impr: m[2], taps: m[3], installs: m[4],
                           per, isToday, at: out.at };
    } catch (e) { console.error('ads 실패:', e.message.slice(0, 60)); }
}
const gate = val('--gate'); if (gate) out.gate = gate;
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('metrics.json 갱신:', Object.keys(out).filter((k) => k !== 'at').join(', '));
