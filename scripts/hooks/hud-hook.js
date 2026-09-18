#!/usr/bin/env node
/* ============================================================================
 * hud-hook — 관제 콘솔로 훅 이벤트를 보내고, «제어 판정»을 받아 돌려준다.
 *
 * 안전 제1원칙: FAIL-OPEN.
 *   콘솔이 꺼져 있거나 느리거나 깨져 있어도 **작업을 절대 막지 않는다.**
 *   어떤 경우에도 exit 0 이며, 응답이 온 경우에만 그 JSON 을 그대로 출력한다
 *   (PreToolUse 의 permissionDecision 은 콘솔의 스위치에서만 나온다).
 * 오버헤드: 로컬 POST 1회(실측 2ms) + 노드 기동. 타임아웃 400ms 후 포기.
 * ========================================================================== */
'use strict';
const http = require('http');
const PORT = Number(process.env.HUD_PORT || 7788);
let raw = '';
const done = (out) => { if (out) process.stdout.write(out); process.exit(0); };
const timer = setTimeout(() => done(''), 1500); // 최후 안전장치
process.stdin.on('data', (d) => { raw += d; if (raw.length > 2e6) raw = raw.slice(0, 2e6); });
process.stdin.on('error', () => done(''));
process.stdin.on('end', () => {
    let body = raw;
    try { const j = JSON.parse(raw); body = JSON.stringify(j); } catch { /* 원문 그대로 보낸다 */ }
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/hook', method: 'POST', timeout: 400,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { clearTimeout(timer);
            try { const j = JSON.parse(b); if (j && j.hookSpecificOutput) return done(JSON.stringify(j)); } catch {}
            done(''); }); });
    req.on('error', () => { clearTimeout(timer); done(''); });
    req.on('timeout', () => { try { req.destroy(); } catch {} clearTimeout(timer); done(''); });
    req.end(body);
});
