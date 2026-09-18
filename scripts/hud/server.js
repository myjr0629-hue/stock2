#!/usr/bin/env node
/* ============================================================================
 * SIGNUM 관제·제어 콘솔 — 로컬 전용, 의존성 0 (Node 20+)
 *
 * 왜: 대표가 «작업과 진행상황·결과»를 화면에서 보고 «제어»까지 하기 위한 창.
 *     외부 서비스·API 키 없이 이 맥에서만 돈다(127.0.0.1 바인드).
 *
 * 데이터는 전부 «실측 원천»에서만 읽는다 — 추측값을 만들지 않는다:
 *   ① 세션 전사 JSONL   → 모델별 토큰·도구 호출·시간대 분포 (증분 스캔)
 *   ② .agent/marketing/ → 발행 원장·티켓·사이클 로그·채널 정본
 *   ③ .agent/hud/metrics.json → 느린 실측(클릭·광고·Redis)을 collect.js 가 적어 둔 것
 *   ④ git log           → 커밋·배포 흐름
 *   ⑤ 훅 이벤트(POST)   → 지금 무슨 도구가 돌고 있는지 (실시간)
 *   ⑥ OTLP(선택)        → 텔레메트리가 켜진 세션의 «청구 비용»
 *
 * 제어: 일시정지 · 발행금지 · 예산상한 · 다음 프롬프트에 주입할 대표 지시
 *       → PreToolUse 훅이 이 상태를 읽어 실행을 허용/거부한다.
 * ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HUD = path.join(ROOT, '.agent', 'hud');
const PORT = Number(process.env.HUD_PORT || 7788);
const HOST = '127.0.0.1';
fs.mkdirSync(HUD, { recursive: true });

const F = {
    state: path.join(HUD, 'state.json'),
    events: path.join(HUD, 'events.jsonl'),
    usage: path.join(HUD, 'usage-cache.json'),
    metrics: path.join(HUD, 'metrics.json'),
    otel: path.join(HUD, 'otel.json'),
};
const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 1));

// ── 제어 상태 ───────────────────────────────────────────────────────────────
const DEFAULT_STATE = { paused: false, noPublish: false, budgetUsd: 0, note: '', updatedAt: null };
let state = Object.assign({}, DEFAULT_STATE, readJson(F.state, {}));
const saveState = () => { state.updatedAt = new Date().toISOString(); writeJson(F.state, state); };
if (!fs.existsSync(F.state)) saveState();

// ── 이벤트 링버퍼 + SSE ────────────────────────────────────────────────────
const clients = new Set();
const events = [];
try { // 재시작 시 최근 300건 복원
    const tail = fs.readFileSync(F.events, 'utf8').trim().split('\n').slice(-300);
    for (const l of tail) { try { events.push(JSON.parse(l)); } catch {} }
} catch {}
function pushEvent(ev) {
    ev.t = ev.t || Date.now();
    events.push(ev); if (events.length > 600) events.shift();
    try { fs.appendFileSync(F.events, JSON.stringify(ev) + '\n'); } catch {}
    const line = `event: hook\ndata: ${JSON.stringify(ev)}\n\n`;
    for (const c of clients) { try { c.write(line); } catch {} }
}

// ── ① 전사(JSONL) 증분 스캔 — 모델별 토큰·도구 호출 ─────────────────────────
const PROJECT_DIR = path.join(process.env.HOME, '.claude', 'projects', '-Users-eunhoon-Documents-Project-recipt');
function findTranscripts() {
    try {
        return fs.readdirSync(PROJECT_DIR).filter((f) => f.endsWith('.jsonl'))
            .map((f) => ({ f, p: path.join(PROJECT_DIR, f), st: fs.statSync(path.join(PROJECT_DIR, f)) }))
            .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    } catch { return []; }
}
let usage = readJson(F.usage, null) || { file: null, offset: 0, byModel: {}, byHour: {}, tools: {}, msgs: 0, firstTs: null, lastTs: null, scanning: false };
const EMPTY_M = () => ({ input: 0, output: 0, thinking: 0, cacheRead: 0, cacheCreate: 0, msgs: 0 });

function scanTranscript(limitBytes) {
    const list = findTranscripts(); if (!list.length) return;
    const cur = list[0];
    if (usage.file !== cur.f) { // 새 세션 파일 → 처음부터(너무 크면 꼬리부터)
        usage = { file: cur.f, offset: 0, byModel: {}, byHour: {}, tools: {}, msgs: 0, firstTs: null, lastTs: null, scanning: false };
    }
    const size = cur.st.size;
    if (size <= usage.offset) return;
    let start = usage.offset;
    if (limitBytes && size - start > limitBytes) start = size - limitBytes; // 첫 기동: 꼬리만
    const fd = fs.openSync(cur.p, 'r');
    const CH = 4 * 1024 * 1024;
    let pos = start, rest = '';
    const buf = Buffer.allocUnsafe(CH);
    while (pos < size) {
        const n = fs.readSync(fd, buf, 0, Math.min(CH, size - pos), pos); pos += n;
        const chunk = rest + buf.slice(0, n).toString('utf8');
        const lines = chunk.split('\n'); rest = lines.pop();
        for (const line of lines) {
            if (line.length < 40) continue;
            const hasUsage = line.indexOf('"usage"') !== -1;
            const hasTool = line.indexOf('"tool_use"') !== -1;
            if (!hasUsage && !hasTool) continue;
            let e; try { e = JSON.parse(line); } catch { continue; }
            const ts = e.timestamp || null;
            if (ts) { if (!usage.firstTs || ts < usage.firstTs) usage.firstTs = ts; if (!usage.lastTs || ts > usage.lastTs) usage.lastTs = ts; }
            const m = e.message || {};
            if (m.usage && m.model) {
                const k = m.model;
                const b = (usage.byModel[k] = usage.byModel[k] || EMPTY_M());
                const u = m.usage;
                b.input += u.input_tokens || 0;
                b.output += u.output_tokens || 0;
                b.thinking += (u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0;
                b.cacheRead += u.cache_read_input_tokens || 0;
                b.cacheCreate += u.cache_creation_input_tokens || 0;
                b.msgs += 1; usage.msgs += 1;
                if (ts) { const h = ts.slice(0, 13); const hb = (usage.byHour[h] = usage.byHour[h] || { out: 0, cacheCreate: 0, msgs: 0 });
                    hb.out += u.output_tokens || 0; hb.cacheCreate += u.cache_creation_input_tokens || 0; hb.msgs += 1; }
            }
            if (hasTool && Array.isArray(m.content)) {
                for (const c of m.content) if (c && c.type === 'tool_use' && c.name) usage.tools[c.name] = (usage.tools[c.name] || 0) + 1;
            }
        }
    }
    fs.closeSync(fd);
    usage.offset = size;
    writeJson(F.usage, usage);
}

// ── ② 마케팅 원천 ──────────────────────────────────────────────────────────
const MKT = path.join(ROOT, '.agent', 'marketing');
const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
function marketing() {
    const led = readJson(path.join(MKT, 'PUBLISH-LEDGER.json'), []);
    const rows = Array.isArray(led) ? led : (led.entries || led.items || []);
    const today = kstDay();
    const byDay = {}, todayRows = [];
    for (const e of rows) { const d = e.kst || (e.at || '').slice(0, 10); if (!d) continue; byDay[d] = (byDay[d] || 0) + 1; if (d === today) todayRows.push({ ch: e.ch, url: e.url, at: e.at }); }
    const q = readJson(path.join(MKT, 'QUEUE.json'), []);
    const tickets = (Array.isArray(q) ? q : (q.tickets || q.items || [])).filter((t) => t && t.state !== 'done');
    const ch = readJson(path.join(MKT, 'channels.json'), []);
    const chans = (Array.isArray(ch) ? ch : (ch.channels || Object.values(ch))).filter((x) => x && x.id);
    let cycles = [];
    try {
        const log = fs.readFileSync(path.join(MKT, 'OUTREACH-LOG.md'), 'utf8');
        cycles = [...log.matchAll(/^## (사이클[^\n]*|[^\n]*사이클[^\n]*)$/gm)].map((m) => m[1].trim()).slice(-12).reverse();
    } catch {}
    const todayBy = {}; for (const r of todayRows) todayBy[r.ch] = (todayBy[r.ch] || 0) + 1;
    return {
        today, todayCount: todayRows.length, todayRows: todayRows.slice(-40).reverse(), todayBy,
        byDay: Object.fromEntries(Object.entries(byDay).sort().slice(-14)),
        total: rows.length,
        tickets: tickets.map((t) => ({ id: t.id, type: t.type, prio: t.prio, state: t.state, title: (t.title || '').slice(0, 130) })),
        ceoTickets: tickets.filter((t) => t.type === 'ceo').length,
        channels: { total: chans.length, enabled: chans.filter((c) => c.enabled !== false).length,
            list: chans.map((c) => ({ id: c.id, tier: c.tier || '', enabled: c.enabled !== false, gate: /계정 필요|가입|보류|게이트|약관|보안문자/.test(String(c.note || '')) })) },
        cycles,
    };
}

// ── ③-b 이번 시간 슬롯 배정 (mkt-plan.js slot · 60초 캐시) ─────────────────
let slotCache = { at: 0, data: null };
function slot() {
    if (Date.now() - slotCache.at < 60000 && slotCache.data) return slotCache.data;
    let out = '';
    try { out = execSync('node scripts/mkt-plan.js slot', { cwd: ROOT, encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { slotCache = { at: Date.now(), data: slotCache.data }; return slotCache.data; }
    const pick = (head) => {
        const i = out.indexOf(head); if (i < 0) return [];
        const seg = out.slice(i, out.indexOf('\n\n', i) < 0 ? undefined : out.indexOf('\n\n', i));
        // ⚠ mkt-plan 은 id 를 padEnd 로 정렬해 출력한다 — id 가 길면 다음 칸이 «붙어» 나온다(naver_search_advisor기록없음).
        return [...seg.matchAll(/^\s+\d+\.\s+(\S+)\s*(.*)$/gm)].map((m) => {
            let id = m[1].replace(/(기록없음|\d+시간 전|\d+분 전|어제|오늘).*$/, '');
            return { id, note: (m[1].slice(id.length) + ' ' + m[2]).replace(/\s+/g, ' ').trim().slice(0, 90) };
        });
    };
    const ceo = [...out.matchAll(/^\s+✅\s*(.+)$/gm)].map((m) => m[1].trim());
    const waiting = (out.match(/대표 가입 대기 (\d+)건: (.+)$/m) || []);
    const data = {
        run: pick('■ 실행'), unblock: pick('■ 뚫기'),
        pending: (out.match(/대기\((\d+)\):/) || [])[1] || null,
        ceoActivate: ceo, ceoWaiting: waiting[1] ? Number(waiting[1]) : 0, ceoWaitingList: (waiting[2] || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10),
        norule: (out.match(/규칙 미정의 \d+개 — 지금 정할 것: (.+)$/m) || [])[1] || null,
        at: new Date().toISOString(),
    };
    slotCache = { at: Date.now(), data };
    return data;
}

// ── ④ git ──────────────────────────────────────────────────────────────────
function gitInfo() {
    const sh = (c) => { try { return execSync(c, { cwd: ROOT, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
    return {
        branch: sh('git rev-parse --abbrev-ref HEAD'),
        head: sh('git log -1 --format=%h%x09%ad%x09%s --date=format:%H:%M'),
        recent: sh('git log -12 --format=%h%x09%ad%x09%s --date=format:%m-%d\\ %H:%M').split('\n').filter(Boolean),
        dirty: sh('git status --porcelain').split('\n').filter(Boolean).length,
    };
}

// ── 스냅샷 ─────────────────────────────────────────────────────────────────
function snapshot() {
    try { scanTranscript(0); } catch {}
    const otel = readJson(F.otel, null);
    const metrics = readJson(F.metrics, null);
    return {
        now: new Date().toISOString(),
        state,
        usage: { file: usage.file, msgs: usage.msgs, byModel: usage.byModel, byHour: usage.byHour, tools: usage.tools, firstTs: usage.firstTs, lastTs: usage.lastTs, scanning: usage.scanning },
        marketing: marketing(),
        slot: (() => { try { return slot(); } catch { return null; } })(),
        metrics, otel,
        git: gitInfo(),
        events: events.slice(-120).reverse(),
        server: { port: PORT, pid: process.pid, uptimeS: Math.round(process.uptime()), clients: clients.size },
    };
}

// ── 훅 수신(제어 판정 포함) ────────────────────────────────────────────────
const PUBLISH_RE = /ego-browser|mkt-plan\.js\s+pub|asc_|play\.google\.com\/console/i;
function hookDecision(j) {
    const ev = j.hook_event_name || '';
    const cmd = (j.tool_input && (j.tool_input.command || j.tool_input.file_path)) || '';
    if (ev === 'UserPromptSubmit') { // 대표 지시가 있으면 «그 턴의 컨텍스트»로 넣어 준다(없으면 아무것도 안 한다)
        if (!state.note || !state.note.trim()) return null;
        // 24시간이 지난 메모는 주입하지 않는다 — 낡은 지시가 영구히 작업을 끌고 가는 것을 막는다.
        const ageH = state.updatedAt ? (Date.now() - new Date(state.updatedAt).getTime()) / 3600e3 : 999;
        if (ageH > 24) return null;
        return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit',
            additionalContext: `[관제 콘솔 메모 · 대표가 콘솔에 직접 입력 · ${Math.round(ageH * 10) / 10}시간 전]\n${state.note.trim()}\n(참고 정보다. 채팅의 대표 지시가 우선이고, 이 메모가 안전선과 충돌하면 대표에게 먼저 확인한다.)` } };
    }
    if (ev !== 'PreToolUse') return null;
    if (state.paused) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '관제 콘솔: «일시정지» 스위치가 켜져 있습니다. 대표가 재개할 때까지 도구를 실행하지 않습니다.' } };
    if (state.noPublish && PUBLISH_RE.test(String(cmd))) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '관제 콘솔: «발행 금지» 스위치가 켜져 있습니다(브라우저 발행·스토어 쓰기 차단).' } };
    return null;
}

// ── OTLP(선택) — 텔레메트리 켜진 세션의 비용·토큰 ──────────────────────────
function ingestOtlp(body) {
    let j; try { j = JSON.parse(body); } catch { return; }
    const acc = readJson(F.otel, { cost: {}, tokens: {}, updatedAt: null });
    const walk = (rm) => { for (const r of rm || []) for (const sm of r.scopeMetrics || []) for (const m of sm.metrics || []) {
        const name = m.name || ''; const pts = (m.sum && m.sum.dataPoints) || (m.gauge && m.gauge.dataPoints) || [];
        for (const p of pts) { const attrs = {}; for (const a of p.attributes || []) attrs[a.key] = (a.value && (a.value.stringValue ?? a.value.intValue ?? a.value.doubleValue));
            const v = p.asDouble != null ? p.asDouble : Number(p.asInt || 0); const model = attrs.model || 'unknown';
            if (name === 'claude_code.cost.usage') acc.cost[model] = (acc.cost[model] || 0) + v;
            if (name === 'claude_code.token.usage') { const t = attrs.type || 'total'; acc.tokens[model] = acc.tokens[model] || {}; acc.tokens[model][t] = (acc.tokens[model][t] || 0) + v; } } } };
    walk(j.resourceMetrics); acc.updatedAt = new Date().toISOString(); writeJson(F.otel, acc);
}

// ── HTTP ───────────────────────────────────────────────────────────────────
const PAGE = () => fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && url === '/api/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`retry: 2000\n\n`); clients.add(res);
        const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
    }
    if (req.method === 'GET' && url === '/api/snapshot') return json(res, snapshot());
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
        try { const p = PAGE(); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(p); }
        catch (e) { return json(res, { error: 'index.html 없음: ' + e.message }, 500); }
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 8e6) body = body.slice(0, 8e6); });
    req.on('end', () => {
        if (req.method === 'POST' && url === '/hook') {
            let j = {}; try { j = JSON.parse(body); } catch {}
            const ev = { t: Date.now(), ev: j.hook_event_name || '?', tool: j.tool_name || '', agent: j.agent_type || '', model: (j.model && j.model.id) || j.model || '',
                cmd: String((j.tool_input && (j.tool_input.command || j.tool_input.file_path || j.tool_input.prompt)) || '').replace(/\s+/g, ' ').slice(0, 160),
                err: j.tool_error ? String(j.tool_error).slice(0, 120) : '' };
            pushEvent(ev);
            const d = hookDecision(j);
            return json(res, d || {});
        }
        if (req.method === 'POST' && url === '/api/control') {
            let j = {}; try { j = JSON.parse(body); } catch {}
            for (const k of ['paused', 'noPublish']) if (typeof j[k] === 'boolean') state[k] = j[k];
            if (typeof j.budgetUsd === 'number') state.budgetUsd = j.budgetUsd;
            if (typeof j.note === 'string') state.note = j.note.slice(0, 2000);
            saveState(); pushEvent({ ev: 'CONTROL', tool: '', cmd: JSON.stringify({ paused: state.paused, noPublish: state.noPublish, note: state.note ? state.note.slice(0, 60) : '' }) });
            return json(res, state);
        }
        if (req.method === 'POST' && url.startsWith('/otlp/')) { try { ingestOtlp(body); } catch {} return json(res, {}); }
        return json(res, { error: 'not found' }, 404);
    });
}).listen(PORT, HOST, () => {
    console.log(`[HUD] http://${HOST}:${PORT}  (pid ${process.pid})`);
    usage.scanning = true;
    setTimeout(() => { try { scanTranscript(0); } catch (e) { console.error('[HUD] 전사 스캔 실패:', e.message); } usage.scanning = false; console.log(`[HUD] 전사 스캔 완료 — 메시지 ${usage.msgs} · 모델 ${Object.keys(usage.byModel).join(',')}`); }, 300);
    setInterval(() => { try { scanTranscript(0); } catch {} }, 15000);
});
