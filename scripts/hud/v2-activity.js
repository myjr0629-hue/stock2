'use strict';
// 허용한 로컬 원천에서 시각·모델·종료 상태만 추출한다. 본문은 API에 싣지 않는다.
const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const agentCache = new Map();
const stamp = file => { try { return fs.statSync(file).mtimeMs; } catch { return null; } };
const entries = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
function tail(file) {
    let fd;
    try { fd = fs.openSync(file, 'r'); const size = fs.fstatSync(fd).size, start = Math.max(0, size - 1024 * 1024), b = Buffer.alloc(size - start); fs.readSync(fd, b, 0, b.length, start); return b.toString('utf8'); } catch { return ''; } finally { if (fd != null) fs.closeSync(fd); }
}
function newest(files) { return files.map(file => ({ file, at: stamp(file) })).filter(r => r.at).sort((a, b) => b.at - a.at)[0]; }
function filesUnder(dir, depth = 2) {
    return entries(dir).filter(e => !e.name.startsWith('.') && !e.isSymbolicLink()).flatMap(e => e.isFile() ? [path.join(dir, e.name)] : e.isDirectory() && depth > 0 ? filesUnder(path.join(dir, e.name), depth - 1) : []);
}
function localTime(value, now) {
    const full = /20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?/.exec(value)?.[0];
    if (full) return Date.parse(/[Z]|[+-]\d{2}:\d{2}$/.test(full) ? full : full.replace(' ', 'T') + '+09:00') || null;
    const short = /^(\d{2}-\d{2})\s+(\d{2}:\d{2})/.exec(value);
    if (!short) return null;
    let year = new Date(now + 9 * 3600e3).getUTCFullYear(), at = Date.parse(`${year}-${short[1]}T${short[2]}:00+09:00`);
    if (at > now + 864e5) at = Date.parse(`${year - 1}-${short[1]}T${short[2]}:00+09:00`);
    return at;
}
function lastAgentCall(file) {
    let fd;
    try {
        const info = fs.statSync(file), prev = agentCache.get(file);
        if (prev && prev.size === info.size && prev.mtime === info.mtimeMs) return prev.at;
        const append = prev && prev.ino === info.ino && info.size > prev.size;
        let at = append ? prev.at : null, rest = '', offset = append ? prev.complete : 0, complete = offset;
        const decoder = new StringDecoder('utf8'), buf = Buffer.alloc(65536);
        fd = fs.openSync(file, 'r');
        while (offset < info.size) {
            const n = fs.readSync(fd, buf, 0, Math.min(buf.length, info.size - offset), offset);
            if (!n) break;
            const bytes = buf.subarray(0, n), newline = bytes.lastIndexOf(10);
            if (newline >= 0) complete = offset + newline + 1;
            offset += n;
            const lines = (rest + decoder.write(bytes)).split('\n'); rest = lines.pop();
            for (const line of lines) {
                try { const j = JSON.parse(line), content = j.message?.content, ts = Date.parse(j.timestamp);
                    if (Number.isFinite(ts) && Array.isArray(content) && content.some(c => c.type === 'tool_use' && c.name === 'Agent')) at = Math.max(at || 0, ts);
                } catch {}
            }
        }
        // A final JSON record need not end with a newline. It is reread after append.
        try { const j = JSON.parse(rest + decoder.end()), ts = Date.parse(j.timestamp);
            if (Number.isFinite(ts) && j.message?.content?.some?.(c => c.type === 'tool_use' && c.name === 'Agent')) at = Math.max(at || 0, ts);
        } catch {}
        if (agentCache.size >= 4 && !agentCache.has(file)) agentCache.delete(agentCache.keys().next().value);
        agentCache.set(file, { size: info.size, mtime: info.mtimeMs, ino: info.ino, complete, at });
        return at;
    } catch { return null; } finally { if (fd != null) fs.closeSync(fd); }
}
function loadActivity(o) {
    const ego = o.egoIo || process.env.HUD_EGO_IO || path.join(o.home, 'signum-ego-io'), evidence = {};
    const source = file => file.startsWith(o.home + '/') ? '~' + file.slice(o.home.length) : file;
    const add = (id, file, at = stamp(file), status = 'pending', extra = {}) => { if (at) evidence[id] = { lastAt: at, status, source: source(file), ...extra }; };
    add('ceo', o.todoFile || process.env.HUD_TODO_FILE || path.join(o.home, 'Documents/Project/recipt/대표-할일.md'), undefined, 'ok');
    const mail = path.join(o.work, 'hud/feeds/mail.json');
    try { const j = JSON.parse(fs.readFileSync(mail, 'utf8')); const at = Date.parse(j.updatedAt || j.readAt); if (Number.isFinite(at)) add('gmail', mail, at, 'ok'); } catch {}
    const egoFiles = filesUnder(ego);
    const latestEgo = newest(egoFiles);
    if (latestEgo) add('ego', latestEgo.file, latestEgo.at);
    const queue = o.queueLog || path.join(o.work, 'codex/queue/QUEUE-LOG.tsv');
    const queueLine = tail(queue).trim().split('\n').at(-1) || '';
    add('queue-runner', queue, localTime(queueLine, o.now) || stamp(queue));
    add('daily-runner', path.join(o.work, 'codex/out/nightly.daily.log'));
    const pubLogs = egoFiles.filter(f => /\/pub\/day-sched[^/]*\.log$/.test(f));
    const sched = newest(pubLogs);
    if (sched) {
        const line = tail(sched.file).trim().split('\n').at(-1) || '';
        add('day-sched2', sched.file, localTime(line, o.now) || sched.at);
    }
    const ledger = o.ledgerFile || path.join(o.work, 'codex/LEDGER.tsv');
    for (const line of tail(ledger).split('\n')) {
        const cells = line.split('\t'), model = /model=(gpt-6\.1-sol|gpt-6-astra)(?:\s|$)/.exec(line)?.[1];
        if (!model) continue;
        const finish = /^\d{2}:\d{2}$/.test(cells[1]) ? line.replace(/^(\d{2}-\d{2})\s+\d{2}:\d{2}/, '$1 ' + cells[1]) : line;
        let at = localTime(finish, o.now), start = localTime(line, o.now);
        if (at && start && at < start) at += 864e5;
        const id = model === 'gpt-6.1-sol' ? 'codex-write' : 'codex-read';
        if (at && (!evidence[id] || at >= evidence[id].lastAt)) add(id, ledger, at, /\brc=0(?:\s|$)/.test(line) ? 'ok' : /\brc=-?[1-9]\d*/.test(line) ? 'fail' : 'pending', { model });
    }
    const session = o.session || {}, root = o.transcriptRoot || path.join(o.home, '.claude/projects/-Users-eunhoon-Documents-Project-recipt');
    if (session.file) {
        const file = path.join(root, path.basename(session.file));
        const at = lastAgentCall(file); if (at) add('claude-subagents', file, at);
    }
    for (const id of ['integrity-watch', 'hud-refresh', 'cycle-watchdog']) {
        const candidates = [path.join(o.home, `Library/Logs/signum-${id}.log`)];
        if (id === 'integrity-watch') candidates.push(path.join(ego, 'integrity/launchd.log'));
        const plist = path.join(o.home, `Library/LaunchAgents/com.signumhq.${id}.plist`);
        // 로그 경로만 허용한다. plist의 환경값·인수는 읽거나 출력하지 않는다.
        for (const m of tail(plist).matchAll(/<key>Standard(?:Out|Error)Path<\/key>\s*<string>([^<]+)<\/string>/g)) {
            if (m[1].startsWith(o.home + '/') && /\.log$/.test(m[1])) candidates.push(m[1]);
        }
        const latest = newest(candidates); if (latest) add(id, latest.file, latest.at);
    }
    return evidence;
}
module.exports = { loadActivity };
