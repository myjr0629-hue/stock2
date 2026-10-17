'use strict';
// 관제 v2는 로컬 파일과 읽기 전용 명령의 허용 필드만 노출한다.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { PLAN_CHANNELS, LEDGER_ALIASES, EXCLUDED_LEDGER_CHANNELS } = require('./v2-platform-ids');
const finite = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const text = (v) => typeof v === 'string' ? v.replace(/https?:\/\/[^\s<>\])]+/gi, (url) => publicUrl(url) || '비공개 링크').replace(/(?:Bearer\s+\S+|\b(?:sk|ghp|github_pat|xox[baprs])-?[A-Za-z0-9_-]{12,})/gi, '비공개').replace(/\b(?:[A-Z0-9]{10,}|\d{6})\b/g, '비공개').replace(/((?:token|secret|password|api[_ -]?key|cookie|code|쿠키|코드)\s*[:=]\s*)[^\s,;]+/gi, '$1비공개').slice(0, 1200) : null;
function publicUrl(value) {
    try {
        const u = new URL(value);
        if (!/^https?:$/.test(u.protocol) || u.username || u.password || /(?:verify|verification|password|reset|oauth|callback|token)/i.test(u.pathname)) return null;
        // 네이버 구형 게시 주소·영상 주소의 공개 식별자는 주소의 일부다.
        // 인증·추적 인자를 비롯해 이 허용 목록 밖의 값은 내보내지 않는다.
        const publicParams = new Set(['blogid', 'logno', 'clubid', 'articleid', 'id', 'v', 'p', 'page', 'story_fbid']);
        for (const key of [...u.searchParams.keys()]) if (!publicParams.has(key.toLowerCase())) u.searchParams.delete(key);
        u.hash = '';
        return u.href;
    } catch { return null; }
}
const list = (dir) => { try { return fs.readdirSync(dir).filter((x) => !x.startsWith('.') && !/^\.env/.test(x)).sort(); } catch { return null; } };
const stat = (file) => { try { return fs.statSync(file).mtimeMs; } catch { return null; } };
const timestamp = (v) => finite(v) ?? (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
const read = (file) => { if (path.basename(file).startsWith('.env')) return null; try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
function readPart(file, tail = false) {
    let fd;
    try { fd = fs.openSync(file, 'r'); const size = fs.fstatSync(fd).size, start = tail ? Math.max(0, size - 65536) : 0, buf = Buffer.alloc(Math.min(tail ? 65536 : 4096, size - start)); fs.readSync(fd, buf, 0, buf.length, start); const out = buf.toString('utf8'); return tail && start > 0 ? out.slice(out.indexOf('\n') + 1) : out; } catch { return ''; } finally { if (fd != null) fs.closeSync(fd); }
}
const json = (file) => { try { const v = JSON.parse(read(file)); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const homePath = (file, home) => file.startsWith(home + path.sep) ? '~' + file.slice(home.length) : file;
const day = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const dayAdd = (d, offset) => new Date(Date.parse(d + 'T12:00:00Z') + offset * 864e5).toISOString().slice(0, 10);
function opts(o = {}) {
    const home = o.home || os.homedir();
    return { home, work: o.work || process.env.HUD_WORK || path.join(home, 'Documents/signum-work'), root: o.root || process.env.HUD_ROOT || path.resolve(__dirname, '../..'), now: o.now ?? Date.now(), ...o };
}
function base(file, o, good = false) { return { state: good ? 'ok' : 'pending', source: homePath(file, o.home), readAt: stat(file) }; }
function runDefault(file, args) { return execFileSync(file, args, { encoding: 'utf8', timeout: 2200, maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
function command(o, file, args) { try { return String((o.run || runDefault)(file, args)).trim(); } catch (e) { return e && e.status === 1 && file === '/usr/bin/pgrep' ? '' : null; } }
function feed(file, o) { const j = json(file); return { j, meta: { ...base(file, o, !!j), readAt: timestamp(j && (j.readAt ?? j.updatedAt ?? j.at)) ?? stat(file) } }; }

function loadCredits(options = {}) {
    const o = opts(options), file = o.file || path.join(o.work, 'hud/feeds/credits.json'), { j, meta } = feed(file, o);
    const c = j && j.claude || {}, x = j && j.codex || {}, extra = c.extraUsage || {};
    const daily = Array.isArray(x.daily) ? x.daily : Object.entries(x.byDay || {}).map(([date, tokens]) => ({ date, tokens }));
    return { ...meta, state: j && (j.claude || j.codex) ? 'ok' : 'pending', claude: { weeklyPct: finite(c.weeklyPct ?? c.weeklyAllModelsPct), fiveHourPct: finite(c.fiveHourPct), resetsAt: text(c.resetsAt ?? c.weeklyResetsAt), extraSpentUsd: finite(c.extraSpentUsd ?? extra.spentUSD), extraLimitUsd: finite(c.extraLimitUsd ?? extra.limitUSD) }, codex: { weeklyTokens: finite(x.weeklyTokens), weeklyTasks: finite(x.weeklyTasks), weeklyPct: finite(x.weeklyPct), daily: daily.filter((r) => r && typeof r === 'object').map((r) => ({ date: text(r.date), tokens: finite(r.tokens) })) } };
}
function loadMail(options = {}) {
    const o = opts(options), file = o.file || path.join(o.work, 'hud/feeds/mail.json'), { j, meta } = feed(file, o);
    const rows = j && Array.isArray(j.items) ? j.items : [];
    return { ...meta, state: j && Array.isArray(j.items) ? 'ok' : 'pending', items: rows.filter((r) => r && typeof r === 'object').map((r) => Object.fromEntries(['date', 'from', 'subject', 'summary', 'action', 'kind'].map((k) => [k, text(r[k])]))).sort((a, b) => String(b.date).localeCompare(String(a.date))) };
}
function loadTodos(options = {}) {
    const o = opts(options), file = o.file || process.env.HUD_TODO_FILE || path.join(o.home, 'Documents/Project/recipt/대표-할일.md'), raw = read(file), items = [];
    const headerDate = /^#\s+.*?\b(20\d{2}-\d{2}-\d{2})\b/m.exec(raw || '')?.[1] || day(stat(file) || o.now);
    let title = null, lines = [], skip = false, checked = 0, open = 0;
    const flush = () => {
        if (!title || skip || (checked && !open) || !lines.some(l => l.trim())) return;
        const body = [title, ...lines].join('\n'), full = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(body);
        const short = /\((\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2})시)?/.exec(body);
        const date = full?.[1] || (short ? `${headerDate.slice(0, 4)}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}` : headerDate);
        const hour = short?.[3] || '0';
        items.push({ title: text(title), detail: text(lines.join('\n')), date, at: `${date}T${hour.padStart(2, '0')}:00:00+09:00`, kind: /채팅/.test(title) ? 'chat' : /준비/.test(title) ? 'prep' : 'do' });
    };
    for (const line of (raw || '').split(/\r?\n/)) {
        const h = /^##\s+(.+)/.exec(line);
        if (h) { flush(); title = h[1]; lines = []; checked = 0; open = 0; skip = /✅|\[[xX]\]|\(완료/.test(title); continue; }
        if (/^---\s*$/.test(line)) { flush(); title = null; continue; }
        if (/^\s*[-*]\s+\[[xX]\]/.test(line)) { checked++; continue; }
        if (/^\s*[-*]\s+\[ \]/.test(line)) open++;
        if (title) lines.push(line);
    }
    flush();
    return { ...base(file, o, raw != null && /^#\s/m.test(raw)), items: items.sort((a, b) => String(b.at).localeCompare(String(a.at))) };
}
const REGIONS = ['한국', '일본', '미국', '글로벌'];
function regionOf(id, explicit) {
    if (REGIONS.includes(explicit)) return explicit;
    const s = String(id || '').toLowerCase();
    if (/(?:^|[_ -])(jp|ja)(?:$|[_ -])|note|qiita|zenn|tsukutta|個人|アプリ|窓|はてな|にほん|放課後|日本|일본/.test(s)) return '일본';
    if (/(?:^|[_ -])(kr|ko)(?:$|[_ -])|naver|clien|ppomppu|ruli|disquiet|okky|tistory|geeknews|네이버|클리앙|뽐뿌|카페|한국/.test(s)) return '한국';
    if (/(?:^|[_ -])(us|en)(?:$|[_ -])|reddit|medium|quora|macrumors|미국/.test(s)) return '미국';
    return '글로벌';
}
function loadPublishing(options = {}) {
    const o = opts(options), file = o.file || path.join(o.home, '.gemini/antigravity/scratch/stock2/.agent/marketing/PUBLISH-LEDGER.json');
    const j = json(file), rows = Array.isArray(j) ? j : j && (j.entries || j.items), today = day(o.now), dates = Array.from({ length: 14 }, (_, i) => dayAdd(today, i - 13));
    const allItems = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object' && !/^diff_kit|^(indexnow|naver_search_advisor)$/.test(r.ch || '')).map((r) => {
        const at = text(r.at), url = publicUrl(r.url), d = /^\d{4}-\d{2}-\d{2}/.exec(String(r.kst || ''));
        const parsedAt = Date.parse(at); return { channel: text(r.ch || r.channel), at, url, date: d ? d[0] : Number.isFinite(parsedAt) ? day(parsedAt) : null, region: regionOf(r.ch || r.channel, r.region) };
    }).filter((r) => r.url && !/apps\.apple\.com|play\.google\.com\/store/.test(r.url));
    const items = allItems.filter((r) => dates.includes(r.date)), lastPostByChannel = {};
    for (const r of allItems) if (timestamp(r.at) != null && (!lastPostByChannel[r.channel] || timestamp(r.at) > timestamp(lastPostByChannel[r.channel]))) lastPostByChannel[r.channel] = r.at;
    const cells = REGIONS.flatMap((region) => dates.map((date) => { const selected = items.filter((r) => r.region === region && r.date === date); return { region, date, count: Array.isArray(rows) ? selected.length : null, items: selected }; }));
    const ledgerChannels = [...new Set((Array.isArray(rows) ? rows : []).map(r => r && text(r.ch || r.channel)).filter(Boolean))].sort();
    return { ...base(file, o, Array.isArray(rows)), dates, regions: REGIONS, cells, items, lastPostByChannel, ledgerChannels, participationSource: homePath(path.join(o.work, 'growth/communities/PARTICIPATION-LOG.md'), o.home) };
}
function loadAgents(options = {}) {
    const o = opts(options), activity = require('./v2-activity').loadActivity(o), queueRoot = o.queueRoot || path.join(o.work, 'codex/queue'), queueLog = o.queueLog || path.join(queueRoot, 'QUEUE-LOG.tsv');
    const running = list(path.join(queueRoot, 'running')), todo = list(path.join(queueRoot, 'todo'));
    const session = o.session || {}, file = o.codexPath || path.join(o.home, '.local/codex-cli/node_modules/.bin/codex');
    const versionRaw = command(o, file, ['--version']), version = versionRaw && /(?:codex(?:-cli)?\s+)?(\d+\.\d+\.\d+(?:[-.\w]*)?)/i.exec(versionRaw);
    const egoPlist = o.egoPlist || '/Applications/ego lite.app/Contents/Info.plist';
    const egoVersion = command(o, '/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', egoPlist]);
    const items = [
        { id: 'coordinator', name: '클로드 코디네이터', model: 'claude-opus-5-5', sessionId: text(session.sessionId || String(session.file || '').replace(/\.jsonl$/, '')) || null, status: session.lastTs && o.now - Date.parse(session.lastTs) < 30 * 60e3 ? 'running' : 'pending', lastAt: session.lastTs || null, source: '클로드 세션 전사', readAt: session.lastTs ? Date.parse(session.lastTs) : null },
        { id: 'codex', name: '코덱스', model: 'gpt-6.1-sol · gpt-6-astra', version: version ? version[1] : null, status: version ? (running && running.length ? 'running' : 'pending') : 'pending', lastAt: stat(queueLog), source: homePath(file, o.home), readAt: version ? o.now : null },
        { id: 'ego', name: '이고 라이트 브라우저', version: egoVersion && /^\d+(?:\.\d+)+(?:[-.\w]*)?$/.test(egoVersion) ? egoVersion : null, status: 'pending', lastAt: null, source: egoPlist, readAt: egoVersion ? o.now : null },
    ];
    for (const id of ['queue-runner', 'daily-runner', 'day-sched2']) {
        const raw = command(o, '/usr/bin/pgrep', ['-f', `(^|/|[[:space:]])${id}([.]sh|[[:space:]]|$)`]);
        const pids = raw == null ? null : raw.split(/\s+/).filter((p) => /^\d+$/.test(p));
        items.push({ id, name: { 'queue-runner': '코덱스 대기열 실행기', 'daily-runner': '밤 검토 실행기', 'day-sched2': '예약 게시기' }[id], status: pids && pids.length ? 'running' : 'pending', lastAt: null, source: '프로세스 조회', readAt: raw == null ? null : o.now, pidCount: pids ? pids.length : null });
    }
    const egoProcess = command(o, '/usr/bin/pgrep', ['-f', '/Applications/ego lite.app/Contents/MacOS/']);
    items.find(r => r.id === 'ego').status = egoProcess && /^\d/m.test(egoProcess) ? 'running' : 'pending';
    const launched = command(o, '/bin/launchctl', ['list']);
    for (const id of ['integrity-watch', 'hud-refresh', 'cycle-watchdog']) {
        const row = launched && launched.split('\n').find((l) => l.trim().split(/\s+/).pop() === `com.signumhq.${id}`), parts = row ? row.trim().split(/\s+/) : [];
        items.push({ id, name: { 'integrity-watch': '무결성 감시', 'hud-refresh': '판독기 갱신', 'cycle-watchdog': '사이클 감시견' }[id], status: row && parts.length === 3 && /^-?\d+$/.test(parts[1]) ? (/^\d+$/.test(parts[0]) ? 'running' : parts[1] !== '0' ? 'fail' : 'ok') : 'pending', lastExitStatus: row && /^-?\d+$/.test(parts[1]) ? Number(parts[1]) : null, detail: row ? `마지막 종료 상태 ${parts[1]}` : null, lastAt: null, source: '상주 작업 조회', readAt: launched == null ? null : o.now });
    }
    const transcriptRoot = o.transcriptRoot || path.join(o.home, '.claude/projects/-Users-eunhoon-Documents-Project-recipt');
    const sessionDir = session.file && path.join(transcriptRoot, path.basename(session.file, '.jsonl'), 'subagents');
    const subs = sessionDir && list(sessionDir);
    for (const [i, name] of (subs || []).filter((n) => /^agent-.*\.jsonl$/.test(n)).slice(-12).entries()) {
        const p = path.join(sessionDir, name); let model = null, lastAt = null;
        // 전사에서는 모델·시각만 읽으며 프롬프트·명령·도구 결과는 응답에 싣지 않는다.
        for (const line of readPart(p, true).split('\n')) { try { const r = JSON.parse(line); if (r.message && typeof r.message.model === 'string') model = text(r.message.model); if (r.timestamp) lastAt = text(r.timestamp); } catch {} }
        items.push({ id: `claude-subagent-${i + 1}`, name: `클로드 하위 에이전트 ${i + 1}`, model, lastAt, status: lastAt && o.now - Date.parse(lastAt) < 15 * 60e3 ? 'running' : 'pending', source: homePath(p, o.home), readAt: stat(p) });
    }
    if (!items.some((r) => r.id.startsWith('claude-subagent-'))) items.push({ id: 'claude-subagent', name: '클로드 하위 에이전트', model: null, lastAt: null, status: 'pending', source: '현재 세션 하위 에이전트 전사', readAt: null });
    for (const r of items) if (activity[r.id]) { r.lastAt = activity[r.id].lastAt; r.source += ' · ' + activity[r.id].source; }
    if (activity['claude-subagents']) { const r = items.find(r => r.id === 'claude-subagent'); if (r) Object.assign(r, { lastAt: activity['claude-subagents'].lastAt, source: activity['claude-subagents'].source }); }
    for (const id of ['codex-write', 'codex-read']) if (activity[id]) items.push({ id, name: id === 'codex-write' ? '코덱스 쓰기' : '코덱스 읽기', ...activity[id], readAt: o.now });
    return { activity, state: items.some((r) => r.readAt) ? 'ok' : 'pending', source: homePath(queueRoot, o.home), readAt: o.now, items, rows: items, queue: { running: running && running.map((id) => ({ id: text(id) })), todo: todo && todo.map((id) => ({ id: text(id) })), source: homePath(queueRoot, o.home), readAt: Math.max(stat(path.join(queueRoot, 'running')) || 0, stat(path.join(queueRoot, 'todo')) || 0) || null } };
}
function gateStatus(s) { return /\b(?:FAIL|HOLD|BLOCK|REJECT)|보류|실패|반려|불통과/i.test(s) ? 'held' : /\bPASS\b|통과|승인|병합\s*가능/i.test(s) ? 'passed' : 'pending'; }
function loadIntegrityV2(options = {}) {
    const o = opts(options), file = o.file || process.env.HUD_INTEGRITY || path.join(o.home, 'signum-ego-io/integrity/latest.json'), historyFile = o.historyFile || path.join(path.dirname(file), 'history.jsonl');
    const j = json(file), pick = (r) => ({ at: finite(r.at), ok: finite(r.ok), errors: finite(r.errors), delays: finite(r.delays), warns: finite(r.warns), symbols: finite(r.symbols) });
    const history = (read(historyFile) || '').split('\n').slice(-240).flatMap((l) => { try { const r = JSON.parse(l); return finite(r.at) == null ? [] : [pick(r)]; } catch { return []; } });
    const outDir = o.outDir || path.join(o.work, 'codex/out');
    const gates = (list(outDir) || []).filter((n) => /^gate-.*\.md$/.test(n)).map((n) => ({ file: path.join(outDir, n), at: stat(path.join(outDir, n)) })).sort((a, b) => b.at - a.at).map((r) => { const title = text(readPart(r.file).split(/\r?\n/)[0]); return { title, status: gateStatus(title || ''), at: r.at, source: homePath(r.file, o.home) }; });
    const git = command(o, '/usr/bin/git', ['-C', o.root, 'log', 'origin/main', '--merges', '--since=7.days', '--format=%aI%x09%s']);
    const merges = git == null ? null : git.split('\n').filter(Boolean).map((l) => { const [at, ...title] = l.split('\t'); return { at, title: text(title.join('\t')), source: '운영 기준 브랜치 병합 기록', readAt: o.now }; });
    const mergeLine = command(o, '/usr/bin/git', ['-C', o.root, 'log', 'origin/main', '--merges', '-1', '--format=%aI%x09%s']);
    const lastMergeAt = mergeLine && Number.isFinite(Date.parse(mergeLine.split('\t')[0])) ? mergeLine.split('\t')[0] : null;
    const todayGates = gates.filter((g) => g.at && day(g.at) === day(o.now));
    const gateSummaryToday = list(outDir) == null ? null : { passed: todayGates.filter((g) => g.status === 'passed').length, held: todayGates.filter((g) => g.status === 'held').length };
    return { ...base(file, o, !!j && finite(j.at) != null && finite(j.errors) != null && finite(j.ok) != null), latest: j && finite(j.at) != null ? { ...pick(j), state: finite(j.errors) == null || finite(j.ok) == null || o.now - j.at > 40 * 60e3 ? 'pending' : (j.errors > 0 ? 'fail' : 'ok'), errorList: (Array.isArray(j.errorList) ? j.errorList : []).filter((r) => r && typeof r === 'object').slice(0, 12).map((r) => ({ sym: text(r.sym), field: text(r.field), msg: text(r.msg) })) } : null, lastMergeAt, history, historySource: homePath(historyFile, o.home), gates: gates.slice(0, 30), gateSummaryToday, merges, gatesReadAt: list(outDir) == null ? null : o.now, mergesReadAt: git == null ? null : o.now };
}
function loadPlatforms(options = {}) {
    const o = opts(options), file = o.file || path.join(o.work, 'growth/POST-RESET-100-PLAN.md'), channelsFile = o.channelsFile || path.join(o.home, '.gemini/antigravity/scratch/stock2/.agent/marketing/channels.json');
    const raw = read(file), ch = json(channelsFile), channels = (Array.isArray(ch) ? ch : ch && Array.isArray(ch.channels) ? ch.channels : []).filter((r) => r && typeof r === 'object'), items = [];
    const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龯]/g, '');
    const publishing = o.publishing || {}, used = new Set();
    const target = ch => Object.hasOwn(LEDGER_ALIASES, ch) ? LEDGER_ALIASES[ch] : ch;
    const excluded = ch => Object.hasOwn(EXCLUDED_LEDGER_CHANNELS, ch);
    const lastPost = ids => {
        // 14일 밖의 최근 게시도 포함하고, 여러 채널·시간대 중 실제로 가장 최근 시각을 고른다.
        const posts = [...Object.entries(publishing.lastPostByChannel || {}).map(([channel, at]) => ({ channel, at })), ...(publishing.items || [])];
        return posts.filter(p => !excluded(p.channel) && ids.includes(target(p.channel)) && timestamp(p.at) != null)
            .sort((a, b) => timestamp(b.at) - timestamp(a.at))[0]?.at || null;
    };
    for (const line of (raw || '').split('\n')) {
        const cells = line.split('|').slice(1, -1).map((c) => c.trim()); if (!/^P\d+$/.test(cells[0] || '') || cells.length < 4) continue;
        const name = cells[1].split('/')[0].trim(), plan = PLAN_CHANNELS[cells[0]];
        const channelIds = plan && key(plan[0]) === key(name) ? plan[1].slice() : channels.filter(c => [c.id, c.name].some(n => key(n) && key(n) === key(name))).map(c => c.id);
        for (const id of channelIds) used.add(id);
        const matched = channels.find(c => channelIds.includes(c.id));
        const status = /정지|금지|제외|종료/.test(cells[2]) ? '정지' : /활성/.test(cells[2]) ? '활성' : '게이트';
        let region = /Ads|광고/.test(name) ? '광고' : /Store|스토어|Google Play|Uptodown|Softonic|GetApps|Aptoide/i.test(name) ? '스토어' : regionOf(name, null);
        if (region === '글로벌') region = cells[3] === 'KO' ? '한국' : cells[3] === 'JA' ? '일본' : cells[3] === 'EN' || /미국/.test(name) ? '미국' : '글로벌';
        const mdUrl = /https?:\/\/[^\s)|]+/.exec(cells.join(' '));
        items.push({ id: cells[0], channelIds, name: text(name), region, status, lastPostAt: lastPost([cells[0], ...channelIds]), url: publicUrl(matched && (matched.profile || matched.link)) || publicUrl(mdUrl && mdUrl[0]), detail: text(cells.slice(2).join(' · ')), source: homePath(file, o.home), readAt: stat(file) });
    }
    // 대장의 모든 플랫폼을 보존하고 채널 파일에만 있는 항목도 별도로 포함한다.
    for (const c of channels) if (c && c.id && !used.has(c.id)) { used.add(c.id); items.push({ id: text(c.id), channelIds: [c.id], name: text(c.name || c.id), region: regionOf(c.id), status: c.gate ? '게이트' : c.enabled === false ? '정지' : /가입|로그인|게이트|보류/.test(c.note || '') ? '게이트' : '활성', lastPostAt: lastPost([c.id]), url: publicUrl(c.profile || c.link), detail: text(c.note), source: homePath(channelsFile, o.home), readAt: stat(channelsFile) }); }
    const represented = new Set(items.flatMap(r => [r.id, ...r.channelIds]));
    const ledgerChannels = publishing.ledgerChannels || [...new Set([...Object.keys(publishing.lastPostByChannel || {}), ...(publishing.items || []).map(p => p.channel)])].sort();
    const unmatchedLedgerChannels = ledgerChannels.filter(ch => !excluded(ch) && !represented.has(target(ch)));
    const excludedLedgerChannels = ledgerChannels.filter(excluded).map(channel => ({ channel, reason: EXCLUDED_LEDGER_CHANNELS[channel] }));
    return { ...base(file, o, items.length > 0), items, unmatchedLedgerChannels, excludedLedgerChannels, groups: [...REGIONS, '스토어', '광고'].map((region) => ({ region, items: items.filter((r) => r.region === region) })) };
}
function loadWork(options = {}) {
    const o = opts(options), file = o.file || o.queueLog || path.join(o.work, 'codex/queue/QUEUE-LOG.tsv'), raw = read(file), today = day(o.now);
    // 실행기가 DONE/result 줄을 쓴 경우만 완료로 센다. START나 단순 행 수를 처리 수로 쓰지 않는다.
    const valid = raw != null && (!raw.trim() || /^(?:\d{4}-)?\d{2}-\d{2}[ T]\d{2}:\d{2}/m.test(raw));
    const lines = !valid ? null : raw.split('\n').filter((l) => (l.startsWith(today) || l.startsWith(today.slice(5) + ' ')) && /\b(?:DONE|COMPLETE|FINISH|END)\b|완료/i.test(l));
    const integrity = o.integrity || {}, publishing = o.publishing || {}, posts = publishing.state === 'ok' ? (publishing.items || []).filter((p) => p.date === today) : null;
    const gates = integrity.gatesReadAt ? (integrity.gates || []).filter((g) => g.at && day(g.at) === today) : null;
    return { ...base(file, o, valid), today, processed: lines ? lines.length : null, passed: integrity.gateSummaryToday ? integrity.gateSummaryToday.passed : gates ? gates.filter((g) => g.status === 'passed').length : null, held: integrity.gateSummaryToday ? integrity.gateSummaryToday.held : gates ? gates.filter((g) => g.status === 'held').length : null, merges: integrity.merges ? integrity.merges.filter((m) => Number.isFinite(Date.parse(m.at)) && day(Date.parse(m.at)) === today).length : null, posts: posts ? posts.length : null, platformCount: posts ? new Set(posts.map((p) => p.channel)).size : null, provenance: { gates: integrity.gatesReadAt || null, merges: integrity.mergesReadAt || null, posts: publishing.readAt || null } };
}
function loadPerformance(options = {}) {
    const o = opts(options), file = o.file || path.join(o.work, 'hud/feeds/performance.json'), { j, meta } = feed(file, o), p = j || {}, installs = o.installs || null;
    const utcToday = new Date(o.now).toISOString().slice(0, 10), dates = Array.from({ length: 7 }, (_, i) => dayAdd(utcToday, i - 7));
    const days = installs && Array.isArray(installs.historyDays || installs.days) ? (installs.historyDays || installs.days).filter((r) => r && typeof r === 'object') : [], pick = (d) => d ? { date: d.date, total: finite(d.real && d.real.total), ios: finite(d.real && d.real.ios), android: finite(d.real && d.real.android), partial: typeof d.partial === 'boolean' ? d.partial : null, source: d.source || installs.file, readAt: d.readAt || installs.readAt } : null;
    const completed = dates.map((date) => days.find((d) => d.date === date && !d.partial));
    const today = installs && installs.utcToday === utcToday ? pick(days.find((d) => d.date === utcToday)) : null, yesterday = pick(completed[6]);
    const avg7 = completed.every((d) => d && finite(d.real && d.real.total) != null) ? +(completed.reduce((sum, d) => sum + d.real.total, 0) / 7).toFixed(1) : null;
    const rc = o.rcOverview || {}, rs = o.redeemSummary || {}, metrics = rc.metrics || {}, period = text(rc.period), metric = name => finite(metrics[name]?.value);
    const rcMeta = { source: rc.file || '구독 개요', readAt: rc.readAt || null, period, stale: rc.stale === true };
    const registrations = p.registrations ? { ...p.registrations, ...meta } : { total: null, week: null, overview: metric('New Customers'), ...rcMeta };
    const paid = p.paid ? { ...p.paid, ...meta } : { active: metric('Active Subscriptions'), trials: metric('Active Trials'), conversion: null, mrr: metric('MRR'), revenue: metric('Revenue'), mrrDisplay: text(metrics.MRR?.display), revenueDisplay: text(metrics.Revenue?.display), ...rcMeta };
    const redeem = p.redeem ? { ...p.redeem, ...meta } : { today: null, week: null, remaining: finite(rs.total?.remaining), confirmedUsed: finite(rs.total?.confirmedUsed), distributedToday: finite(rs.total?.today), platforms: rs.platforms || {}, basis: rs.basis, source: rs.file, readAt: rs.readAt, stale: rs.stale === true, ledger: true };
    return { ...meta, state: j && (j.registrations || j.paid || j.redeem) || Object.values(metrics).some(r => finite(r?.value) != null) || rs.readAt ? 'ok' : 'pending',
        installs: { date: utcToday, today, yesterday, avg7, days: Array.from({ length: 14 }, (_, i) => { const date = dayAdd(utcToday, i - 13); return { date, ...(pick(days.find(d => d.date === date)) || { total: null, ios: null, android: null, partial: null }) }; }), goal: 100, pct: today && today.total != null ? Math.round(today.total) : null, source: installs?.file || '신규 고객 판독', readAt: installs?.readAt || null },
        registrations: { ...registrations, total: finite(registrations.total), week: finite(registrations.week), overview: finite(registrations.overview) }, paid: { ...paid, active: finite(paid.active), trials: finite(paid.trials), conversion: finite(paid.conversion) }, redeem: { ...redeem, today: finite(redeem.today), week: finite(redeem.week), remaining: finite(redeem.remaining) } };
}
function harnessEvidence(agents, integrity) {
    const evidence = { ...(agents.activity || {}) }, rows = agents.items || [];
    for (const r of rows) if (evidence[r.id]) evidence[r.id] = { ...evidence[r.id], status: r.status, lastAt: r.lastAt };
    const child = rows.filter(r => /^claude-subagent-/.test(r.id) && r.lastAt).sort((a, b) => (timestamp(b.lastAt) || 0) - (timestamp(a.lastAt) || 0))[0];
    if (child && evidence['claude-subagents']) evidence['claude-subagents'].status = child.status;
    const watchers = rows.filter(r => ['integrity-watch', 'hud-refresh', 'cycle-watchdog'].includes(r.id));
    const at = Math.max(0, ...watchers.map(r => timestamp(r.lastAt) || 0));
    if (at) evidence.launchd = { lastAt: at, status: watchers.some(r => r.status === 'fail') ? 'fail' : watchers.every(r => ['running', 'ok'].includes(r.status)) ? 'ok' : 'pending', source: '상주 작업 종료 상태·로그 시각' };
    const merge = (integrity.merges || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    if (integrity.lastMergeAt || merge) evidence['merge-deploy'] = { lastAt: integrity.lastMergeAt || merge.at, status: 'pending', source: '운영 기준 브랜치 마지막 병합 · 배포 성공 별도 확인' };
    return evidence;
}
function loadV2(options = {}) {
    const o = opts(options), isolate = (fn, extra = {}) => { try { return fn({ ...o, ...extra }); } catch { return { state: 'pending', source: '로컬 판독', readAt: null }; } };
    const publishing = isolate(loadPublishing), integrity = isolate(loadIntegrityV2), agents = isolate(loadAgents);
    const result = { agents, credits: isolate(loadCredits), publishing, todos: isolate(loadTodos), mail: isolate(loadMail), integrity, platforms: isolate(loadPlatforms, { publishing }), work: isolate(loadWork, { publishing, integrity }), performance: isolate(loadPerformance, { installs: o.live && o.live.installs, rcOverview: o.live && o.live.rcOverview, redeemSummary: o.live && o.live.redeemSummary }) };
    try { result.harness = require('./v2-harness').loadHarness({ agents, integrity, publishing, gates: integrity.gates, merges: integrity.merges, evidence: harnessEvidence(agents, integrity), work: result.work, readAt: o.now }); } catch { result.harness = { state: 'pending', nodes: [], edges: [], source: '하네스 판독', readAt: null }; }
    return result;
}
module.exports = { loadAgents, loadCredits, loadPublishing, loadTodos, loadMail, loadIntegrityV2, loadPlatforms, loadWork, loadPerformance, loadV2, publicUrl };
