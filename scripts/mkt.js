#!/usr/bin/env node
/**
 * mkt — 홍보 엔진 작업 큐
 * ===========================================================================
 * 왜 있나 (2026-09-14 대표 지시):
 *   「몇 개 하다가 그만두는 것은 안 된다.」
 *   사이클은 언제든 끊긴다(세션 종료·에러·권한창·속도제한). 큐가 없으면 매번
 *   처음부터 판단하고 하던 일이 증발한다. 상태를 파일에 남겨 «하던 자리»에서
 *   이어받게 한다. 새 사이클은 판단하지 말고 `next` 가 주는 것부터 한다.
 *
 * 사용:
 *   node scripts/mkt.js next [개수]     다음 할 일 (doing 이 있으면 그것부터)
 *   node scripts/mkt.js start <id>      todo → doing
 *   node scripts/mkt.js done <id> [메모] doing → done
 *   node scripts/mkt.js fail <id> <이유> doing → failed (3회 실패하면 보류)
 *   node scripts/mkt.js add <type> <region> <제목> <상세> [우선순위]
 *   node scripts/mkt.js report          전체 현황
 *   node scripts/mkt.js reset           doing 을 todo 로 되돌림(중단 복구)
 * ===========================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '.agent', 'marketing', 'QUEUE.json');
const load = () => JSON.parse(fs.readFileSync(F, 'utf8'));
const save = (d) => { d.updated = new Date().toISOString().slice(0, 10); fs.writeFileSync(F, JSON.stringify(d, null, 1)); };
const find = (d, id) => d.items.find((x) => x.id === id);

const [, , cmd, ...args] = process.argv;
const d = load();

const line = (x) => `${x.id} [${x.state}] p${x.prio} ${x.type}/${x.region} — ${x.title}`;

switch (cmd) {
    case 'next': {
        const n = Number(args[0] || 1);
        // 진행 중이던 것이 최우선 — 끊긴 일을 먼저 끝낸다
        const doing = d.items.filter((x) => x.state === 'doing');
        const todo = d.items
            .filter((x) => x.state === 'todo' && x.tries < 3)
            .sort((a, b) => a.prio - b.prio || a.id.localeCompare(b.id));
        const pick = [...doing, ...todo].slice(0, n);
        if (!pick.length) { console.log('큐가 비었다. `add` 로 새 일을 넣거나 `report` 로 확인할 것.'); break; }
        pick.forEach((x) => {
            console.log(line(x));
            console.log('   ' + x.detail);
            if (x.note) console.log('   메모: ' + x.note);
        });
        break;
    }
    case 'start': {
        const x = find(d, args[0]); if (!x) { console.error('없는 id'); process.exit(1); }
        x.state = 'doing'; save(d); console.log('시작:', line(x)); break;
    }
    case 'done': {
        const x = find(d, args[0]); if (!x) { console.error('없는 id'); process.exit(1); }
        x.state = 'done'; x.note = args.slice(1).join(' ') || x.note; x.closed = d.updated;
        save(d); console.log('완료:', line(x)); break;
    }
    case 'fail': {
        const x = find(d, args[0]); if (!x) { console.error('없는 id'); process.exit(1); }
        x.tries += 1; x.note = args.slice(1).join(' ');
        // 3회 실패하면 todo 로 두되 next 에서 제외된다 — 사람이 봐야 할 신호
        x.state = x.tries >= 3 ? 'blocked' : 'todo';
        save(d); console.log(`실패(${x.tries}회):`, line(x), '—', x.note); break;
    }
    case 'add': {
        const [type, region, title, detail, prio] = args;
        if (!type || !region || !title) { console.error('사용: add <type> <region> <제목> <상세> [우선순위]'); process.exit(1); }
        const num = d.items.length + 1;
        const item = { id: 't' + String(num).padStart(3, '0'), type, region, title, detail: detail || '', prio: Number(prio || 2), state: 'todo', tries: 0, created: d.updated, note: '' };
        d.items.push(item); save(d); console.log('추가:', line(item)); break;
    }
    case 'reset': {
        let c = 0; d.items.forEach((x) => { if (x.state === 'doing') { x.state = 'todo'; c++; } });
        save(d); console.log(`doing ${c}건을 todo 로 되돌렸다.`); break;
    }
    case 'report':
    default: {
        const by = (s) => d.items.filter((x) => x.state === s).length;
        console.log(`\n=== 홍보 큐 (갱신 ${d.updated}) ===\n`);
        console.log(`  전체 ${d.items.length} · 대기 ${by('todo')} · 진행 ${by('doing')} · 완료 ${by('done')} · 막힘 ${by('blocked')}\n`);
        ['ads', 'publish', 'expand', 'aso', 'tech'].forEach((t) => {
            const g = d.items.filter((x) => x.type === t);
            if (!g.length) return;
            const done = g.filter((x) => x.state === 'done').length;
            console.log(`  ${t.padEnd(8)} ${done}/${g.length} 완료`);
        });
        const blocked = d.items.filter((x) => x.state === 'blocked');
        if (blocked.length) { console.log('\n  ■ 막힌 것 (사람이 봐야 함):'); blocked.forEach((x) => console.log('    ' + line(x) + ' — ' + x.note)); }
        const doing = d.items.filter((x) => x.state === 'doing');
        if (doing.length) { console.log('\n  ■ 진행 중:'); doing.forEach((x) => console.log('    ' + line(x))); }
        console.log('');
    }
}
