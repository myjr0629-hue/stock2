/* 관제 하네스: 원천 증거를 상태로 정규화하고 외부 의존성 없이 SVG로 그린다.
 * 파일·프로세스·네트워크를 직접 읽거나 실행하지 않는 공유 순수 모듈이다. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HUDHarness = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const DEFINITIONS = [
        ['ceo', '대표', '운영 지시'],
        ['coordinator', '코디네이터', '클로드 오퍼스 5.5'],
        ['claude-subagents', '클로드 하위 에이전트', '브라우저·메일'],
        ['ego', '이고 브라우저', '브라우저 작업'],
        ['gmail', '메일', '지메일 확인'],
        ['codex-queue', '코덱스 대기열', '상주 대기열 실행기'],
        ['codex-write', '코덱스 쓰기', 'gpt-6.1-sol'],
        ['codex-read', '코덱스 읽기', 'gpt-6-astra'],
        ['gate', '관문', '검증·승인 결과'],
        ['merge-deploy', '병합·배포', '버셀 운영 반영'],
        ['day-sched2', '예약 게시기', '모델 없음 · day-sched2'],
        ['channel-x', '엑스', '예약 게시 대상'],
        ['channel-bluesky', '블루스카이', '예약 게시 대상'],
        ['channel-note', '노트', '예약 게시 대상'],
        ['channel-naver', '네이버', '예약 게시 대상'],
        ['channel-medium', '미디엄', '예약 게시 대상'],
        ['launchd', '시스템 감시', '모델 없음 · launchd'],
        ['integrity-watch', '무결성 감시', 'integrity-watch'],
        ['hud-refresh', '판독기 갱신', 'hud-refresh'],
        ['cycle-watchdog', '주기 감시견', 'cycle-watchdog'],
        ['daily-runner', '밤 검토', 'daily-runner'],
        ['publish-ledger', '게시 원장', 'PUBLISH-LEDGER'],
        ['codex-out', '코덱스 결과', 'codex/out'],
        ['integrity-results', '무결성 결과', 'integrity'],
        ['hud-results', '관제', '판독·보고 결과'],
    ];
    const EDGES = [
        ['ceo', 'coordinator'],
        ...['claude-subagents', 'codex-queue', 'day-sched2', 'launchd', 'daily-runner'].map((id) => ['coordinator', id]),
        ['claude-subagents', 'ego'], ['claude-subagents', 'gmail'],
        ['codex-queue', 'codex-write'], ['codex-write', 'codex-read'], ['codex-read', 'gate'], ['gate', 'merge-deploy'],
        ...['x', 'bluesky', 'note', 'naver', 'medium'].map((id) => ['day-sched2', 'channel-' + id]),
        ...['integrity-watch', 'hud-refresh', 'cycle-watchdog'].map((id) => ['launchd', id]),
        ...['publish-ledger', 'codex-out', 'integrity-results', 'hud-results'].map((id) => ['daily-runner', id]),
        ['day-sched2', 'publish-ledger'], ['codex-read', 'codex-out'],
        ['integrity-watch', 'integrity-results'], ['hud-refresh', 'hud-results'],
    ];
    const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    const array = (v) => Array.isArray(v) ? v : [];
    const esc = (v) => (['string', 'number', 'boolean'].includes(typeof v) ? String(v) : '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function timestamp(v) {
        if (!['string', 'number'].includes(typeof v) || v === '') return null;
        const ms = typeof v === 'number' ? v : Date.parse(v);
        return Number.isFinite(ms) && ms > 0 && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : null;
    }
    function state(v) {
        const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
        if (['ok', 'running', 'active', 'healthy', 'success', 'passed', 'pass', 'completed', 'complete', 'published', '정상', '완료', '실행 중', '통과'].includes(s)) return 'ok';
        if (['err', 'error', 'failed', 'fail', 'stopped', 'halted', 'broken', '실패', '오류', '멈춤', '중지'].includes(s)) return 'fail';
        return 'pending';
    }
    function evidence(v) {
        const row = object(v);
        return { status: state(row.status || row.state), lastAt: timestamp(row.lastAt || row.at || row.updatedAt || row.timestamp), source: typeof row.source === 'string' ? row.source : null };
    }
    function latest(rows) {
        return array(rows).filter((r) => r && typeof r === 'object').slice().sort((a, b) =>
            (Date.parse(timestamp(b.lastAt || b.at || b.timestamp || b.date)) || 0) - (Date.parse(timestamp(a.lastAt || a.at || a.timestamp || a.date)) || 0))[0];
    }
    function loadHarness(input) {
        const data = object(input), agents = object(data.agents);
        const rows = Array.isArray(data.agents) ? data.agents : array(agents.items || agents.rows);
        const byAgent = Object.create(null);
        for (const row of rows) if (row && typeof row.id === 'string') byAgent[row.id] = row;
        const measured = Object.create(null);
        for (const id of ['coordinator', 'ego', 'day-sched2', 'integrity-watch', 'hud-refresh', 'cycle-watchdog', 'daily-runner']) {
            if (byAgent[id]) measured[id] = evidence(byAgent[id]);
        }
        if (byAgent['queue-runner']) measured['codex-queue'] = evidence(byAgent['queue-runner']);
        // 하위 실행의 실제 기록만 사용한다. 부모의 생존·CLI 버전은 자식 작업의 성공 증거가 아니다.
        const children = rows.filter((r) => r && typeof r.id === 'string' && /^claude-subagent-/.test(r.id));
        const child = latest(children);
        if (child) measured['claude-subagents'] = evidence(child);
        for (const row of rows) {
            if (!row || typeof row.model !== 'string') continue;
            if (row.model === 'gpt-6.1-sol' && /^(running|active|failed|fail|error|stopped)$/.test(row.status || '')) measured['codex-write'] = evidence(row);
            if (row.model === 'gpt-6-astra' && /^(running|active|failed|fail|error|stopped)$/.test(row.status || '')) measured['codex-read'] = evidence(row);
        }
        const gate = latest(data.gates || object(data.integrity).gates);
        if (gate) measured.gate = evidence(gate);
        const integrity = object(data.integrity), checked = object(integrity.latest);
        if (Object.keys(checked).length) measured['integrity-results'] = evidence({ ...checked, source: integrity.source });
        if (gate) measured['codex-out'] = evidence(gate);
        const publishing = object(data.publishing), posts = array(publishing.items), lastPost = latest(posts);
        if (lastPost) measured['publish-ledger'] = evidence({ status: publishing.state, at: lastPost.at, source: publishing.source });
        const channels = {
            x: /^(?:x|twitter)(?:$|[_-])/i, bluesky: /^(?:bluesky|bsky)(?:$|[_-])/i,
            note: /^note(?:$|[_-])/i, naver: /^(?:naver|네이버)(?:$|[_-])/i, medium: /^medium(?:$|[_-])/i,
        };
        for (const [id, pattern] of Object.entries(channels)) {
            const post = latest(posts.filter((r) => r && typeof r.channel === 'string' && pattern.test(r.channel)));
            // 게시 원장은 마지막 게시 시각의 증거다. 현재 채널의 실행·계정 상태를 증명하지 않는다.
            if (post) measured['channel-' + id] = evidence({ at: post.at, source: publishing.source });
        }
        // 병합 기록은 배포 성공을 뜻하지 않는다. 전용 배포 증거가 있을 때만 상태를 채운다.
        if (data.deployment) measured['merge-deploy'] = evidence(data.deployment);
        // 추가 전용 원천은 노드별 명시적 증거로만 결합한다. 알 수 없는 ID는 버린다.
        const explicit = object(data.evidence);
        for (const [id] of DEFINITIONS) if (Object.prototype.hasOwnProperty.call(explicit, id)) measured[id] = evidence(explicit[id]);
        const nodes = DEFINITIONS.map(([id, label, detail]) => Object.assign({ id, label, detail, status: 'pending', lastAt: null, source: null }, measured[id] || {}));
        return {
            status: nodes.some((n) => n.status === 'fail') ? 'fail' : nodes.every((n) => n.status === 'ok') ? 'ok' : 'pending',
            nodes, edges: EDGES.map(([from, to]) => ({ from, to })),
            source: '에이전트·관문·게시 원장·무결성 실측',
            sources: [...new Set(nodes.map((n) => n.source).filter(Boolean))],
            readAt: timestamp(data.readAt),
        };
    }
    function timeLabel(at) {
        const t = timestamp(at);
        if (!t) return '판독 대기';
        return new Date(Date.parse(t) + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') + ' 한국';
    }
    function renderHarness(input) {
        const harness = object(input);
        const rows = array(harness.nodes), nodes = Object.create(null);
        for (const [id, label, detail] of DEFINITIONS) nodes[id] = { id, label, detail, status: 'pending', lastAt: null };
        for (const row of rows) if (row && typeof row.id === 'string' && Object.prototype.hasOwnProperty.call(nodes, row.id)) nodes[row.id] = Object.assign({}, nodes[row.id], row);
        const labels = { ok: '정상', pending: '대기', fail: '실패·멈춤' };
        const colors = { ok: '#238454', pending: '#b77a0a', fail: '#cc4141' };
        function node(id, x, y, width) {
            const n = nodes[id], s = state(n.status), color = colors[s];
            return `<g data-harness-node="${esc(id)}"><title>${esc(n.label)} · ${labels[s]} · 마지막 동작 ${esc(timeLabel(n.lastAt))}</title><rect x="${x}" y="${y}" width="${width}" height="74" rx="12" fill="#fff" stroke="#dfe9e2"/><circle cx="${x + 16}" cy="${y + 20}" r="4.5" fill="${color}"/><text x="${x + 28}" y="${y + 24}" font-size="12" font-weight="650" fill="#183c2d">${esc(n.label)}</text><text x="${x + 13}" y="${y + 43}" font-size="10" fill="#596e61">${esc(n.detail)}</text><text x="${x + 13}" y="${y + 61}" font-size="9" fill="${color}">마지막 동작 ${esc(timeLabel(n.lastAt))}</text></g>`;
        }
        const positions = {
            ceo: [0,0], coordinator: [1,0], 'claude-subagents': [2,0], ego: [3,0], gmail: [4,0],
            'codex-queue': [1,1.2], 'codex-write': [2,1.2], 'codex-read': [3,1.2], gate: [4,1.2], 'merge-deploy': [5,1.2],
            'day-sched2': [0,2.5], 'channel-x': [1,2.5], 'channel-bluesky': [2,2.5], 'channel-note': [3,2.5], 'channel-naver': [4,2.5], 'channel-medium': [5,2.5],
            launchd: [0,3.8], 'integrity-watch': [1,3.8], 'hud-refresh': [2,3.8], 'cycle-watchdog': [3,3.8],
            'daily-runner': [0,5.1], 'publish-ledger': [1,5.1], 'codex-out': [2,5.1], 'integrity-results': [3,5.1], 'hud-results': [4,5.1],
        };
        function diagram(mobile) {
            const coords = Object.create(null), width = mobile ? 360 : 1120;
            DEFINITIONS.forEach(([id], i) => { const [col, row] = positions[id]; coords[id] = mobile ? { x: 40, y: 12 + i * 98, w: 308 } : { x: 10 + col * 185, y: 16 + row * 108, w: 174 }; });
            const marker = mobile ? 'arrow-mobile' : 'arrow-wide';
            const paths = EDGES.map(([from, to], i) => {
                const a = coords[from], b = coords[to];
                let d;
                if (mobile) { const rail = 8 + (i % 5) * 5; d = `M${a.x} ${a.y + 37}H${rail}V${b.y + 37}H${b.x}`; }
                else if (a.y === b.y) d = b.x - a.x <= 185 ? `M${a.x + a.w} ${a.y + 37}H${b.x}` : `M${a.x + a.w - 8} ${a.y}V${a.y - 10}H${b.x + b.w / 2}V${b.y}`;
                else { const rail = Math.min(a.x, b.x) - 6; d = `M${a.x + 12} ${a.y + 74}V${a.y + 87}H${rail}V${b.y - 10}H${b.x + b.w / 2}V${b.y}`; }
                return `<path data-harness-edge="${esc(from + ':' + to)}" d="${d}" fill="none" stroke="#91ab9a" stroke-width="1.3" marker-end="url(#${marker})"/>`;
            }).join('');
            const height = mobile ? DEFINITIONS.length * 98 : 660;
            return `<svg class="${mobile ? 'harness-mobile' : 'harness-wide'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="운영 하네스 전체 연결 구조"><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#91ab9a"/></marker></defs>${paths}${DEFINITIONS.map(([id]) => { const p = coords[id]; return node(id, p.x, p.y, p.w); }).join('')}</svg>`;
        }
        return `<div class="hud-harness"><style>.hud-harness{min-width:0}.hud-harness svg{width:100%;height:auto;font-family:inherit}.harness-wide{display:block}.harness-mobile{display:none}.hud-harness-note{font-size:12px;color:#65766c;line-height:1.6}@media(max-width:640px){.harness-wide{display:none}.harness-mobile{display:block}.hud-harness-grid{grid-template-columns:minmax(0,1fr)}}</style>${diagram(false)}${diagram(true)}<p class="hud-harness-note">각 점은 해당 원천의 상태이며 마지막 동작은 한국 시각입니다. 병합 시각만으로 배포 성공을 판정하지 않습니다.</p></div>`;
    }
    return { loadHarness, renderHarness };
});
