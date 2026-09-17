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
 *   node scripts/mkt.js checkpoint <id> <무엇을했나>   진행 중 단계 기록
 *   node scripts/mkt.js resume          끊긴 일이 어디서 멈췄는지
 *   node scripts/mkt.js close           ★ 사이클 종료 게이트 (doing 남으면 exit 1)
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

        // ★ 2026-09-14 대표 지적: 「왜 광고 관련해서만 작업하냐」
        //   원인은 내 게으름이 아니라 «이 함수»였다 — 우선순위만 보고 뽑는데
        //   광고 항목을 전부 p1 로 넣어놔서, 매 사이클 광고만 세 개가 나왔다.
        //   편식을 막으려던 규칙이 단일작물을 만들었다.
        //   → 종류를 «돌아가며» 뽑는다. 같은 종류를 연속으로 주지 않는다.
        const ORDER = ['ads', 'publish', 'expand', 'aso', 'tech'];
        const byType = new Map();
        for (const x of todo) {
            if (!byType.has(x.type)) byType.set(x.type, []);
            byType.get(x.type).push(x);
        }
        // 오래 굶은 종류부터 — 마지막으로 done 된 시각이 가장 예전인 종류가 앞선다
        const lastDone = new Map();
        for (const x of d.items) {
            if (x.state !== 'done') continue;
            const t = x.closed || x.doneAt || x.created || '';
            if (!lastDone.has(x.type) || t > lastDone.get(x.type)) lastDone.set(x.type, t);
        }
        const types = [...byType.keys()].sort((a, b) => {
            const la = lastDone.get(a) || '';
            const lb = lastDone.get(b) || '';
            if (la !== lb) return la < lb ? -1 : 1;        // 굶은 쪽 먼저
            return ORDER.indexOf(a) - ORDER.indexOf(b);
        });
        const roundRobin = [];
        for (let i = 0; roundRobin.length < todo.length; i++) {
            let moved = false;
            for (const t of types) {
                const q = byType.get(t);
                if (q[i]) { roundRobin.push(q[i]); moved = true; }
            }
            if (!moved) break;
        }

        const pick = [...doing, ...roundRobin].slice(0, n);
        if (!pick.length) { console.log('큐가 비었다. `add` 로 새 일을 넣거나 `report` 로 확인할 것.'); break; }
        const kinds = new Set(pick.map((x) => x.type));
        if (pick.length >= 2 && kinds.size === 1) {
            console.log(`⚠︎ 이번에 뽑힌 ${pick.length}건이 전부 «${[...kinds][0]}» 한 종류다 — 다른 종류의 todo 가 없다는 뜻이다.`);
            console.log('   `add` 로 다른 종류를 채우고 다시 뽑을 것. 한 종류만 파는 사이클은 금지다.\n');
        }
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
        x.state = 'done'; x.note = args.slice(1).join(' ') || x.note; x.closed = new Date().toISOString().slice(0,16).replace('T',' ');
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
    case 'checkpoint': {
        // 진행 중인 일의 «어디까지 했는지» 를 남긴다. 사이클이 끊겨도 여기서 이어받는다.
        const x = find(d, args[0]); if (!x) { console.error('없는 id'); process.exit(1); }
        if (x.state !== 'doing') { console.error(`${x.id} 는 doing 이 아니다 (${x.state}). 먼저 start 할 것.`); process.exit(1); }
        x.steps = x.steps || [];
        x.steps.push({ at: new Date().toISOString().slice(0, 16).replace('T', ' '), what: args.slice(1).join(' ') });
        save(d); console.log(`체크포인트 [${x.id}] ${x.steps.length}단계: ${x.steps[x.steps.length - 1].what}`); break;
    }
    case 'resume': {
        // 끊긴 일이 «정확히 어디서» 멈췄는지 보여준다
        const doing = d.items.filter((x) => x.state === 'doing');
        if (!doing.length) { console.log('진행 중인 일 없음 — next 로 새로 집으면 된다.'); break; }
        doing.forEach((x) => {
            console.log('\n■ ' + line(x));
            console.log('  ' + x.detail);
            (x.steps || []).forEach((s, i) => console.log(`  ${i + 1}. [${s.at}] ${s.what}`));
            console.log('  → 위 마지막 단계 «다음»부터 이어서 할 것.');
        });
        break;
    }
    case 'close': {
        // ★ 사이클 종료 게이트 — 대표 지시(2026-09-14):
        //   「작업을 하다 말고 다음 스케줄로 넘기지 마라.」
        //   doing 이 하나라도 남아 있으면 사이클을 닫을 수 없다.
        const doing = d.items.filter((x) => x.state === 'doing');
        if (doing.length) {
            console.log('\n✗ 사이클을 닫을 수 없다 — 끝내지 않은 일이 있다:\n');
            doing.forEach((x) => {
                console.log('  ' + line(x));
                const last = (x.steps || []).slice(-1)[0];
                console.log('    마지막 단계: ' + (last ? last.what : '(체크포인트 없음)'));
            });
            console.log('\n  → 끝내고 `done` 하거나, 진짜 막혔으면 `fail <id> <이유>` 로 닫을 것.');
            console.log('    둘 다 안 하고 다음 사이클로 넘기는 것은 금지다.\n');
            process.exit(1);
        }
        console.log('✓ 사이클 종료 가능 — 진행 중인 일 없음.');
        break;
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
