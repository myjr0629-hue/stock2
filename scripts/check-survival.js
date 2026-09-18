#!/usr/bin/env node
/* 발행물 생존 확인 — ⚠ 403/999 는 봇 차단이다. SPA(Quora·LinkedIn)는 브라우저로 보되
 *   «본문이 다 그려질 때까지» 기다린 뒤 판정할 것(2026-09-18: 셸만 읽고 삭제로 오보했다) — 플랫폼이 조용히 지우는 일이 있다(Quora: 8클릭 뒤 33분 만에 삭제 실측).
 * 사용: node scripts/check-survival.js [일수=2] */
const fs = require('fs'), path = require('path');
const days = Number(process.argv[2] || 2);
const L = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.agent/marketing/PUBLISH-LEDGER.json'), 'utf8'));
const rows = (Array.isArray(L) ? L : (L.entries || [])).filter((e) => e.url && /^https?:/.test(e.url));
const cut = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
const recent = rows.filter((e) => (e.kst || '') >= cut);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
(async () => {
    let bad = 0, unknown = 0;
    for (const e of recent) {
        let s = 0, note = '';
        try {
            const r = await fetch(e.url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
            s = r.status; const t = await r.text();
            if (/삭제된 게시|삭제되었|存在しません|not found|페이지를 찾을 수 없|This page isn|deleted/i.test(t.slice(0, 4000))) note = '삭제 문구';
            else if (t.length < 800) note = '본문 짧음';
        } catch (err) { note = String(err.message).slice(0, 40); }
        // ⚠ 403(Quora)·999(LinkedIn)·429 는 «봇 차단»이지 삭제가 아니다 — 삭제로 적으면 거짓 경보다(2026-09-18 실측).
        const blocked = [403, 429, 999].includes(s) || /quora\.com|linkedin\.com/.test(e.url);
        const ok = s >= 200 && s < 400 && !note;
        const mark = ok ? '✓' : (blocked ? '?' : '✗');
        if (!ok && !blocked) bad++; if (!ok && blocked) unknown++;
        console.log(`${mark} ${String(e.ch).padEnd(22)} ${String(s).padEnd(4)} ${(blocked && !ok ? '봇차단-브라우저확인' : note).padEnd(18)} ${e.url.slice(0, 74)}`);
    }
    console.log(`\n최근 ${days}일 발행 ${recent.length}건 · 삭제 의심 ${bad}건 · 봇차단으로 확인 불가 ${unknown}건(브라우저로 볼 것)`);
    process.exit(bad ? 1 : 0);
})();
