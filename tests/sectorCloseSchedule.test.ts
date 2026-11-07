import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { dryClock, replaySnapshotAllowed } from '@/lib/ai/crossBriefDryClock';
import { etMinutesOf, sessionCloseMinutes } from '@/lib/marketCalendar';

const crons: { path: string; schedule: string }[] = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).crons;
const sectors = ['m7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse', 'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress'];

test('스냅샷 10개와 리포트는 지정된 평일 UTC 시각에 실행된다', () => {
    const entries = crons.filter(c => c.path.startsWith('/api/cron/snapshot?sector='));
    assert.equal(entries.length, 10);
    sectors.forEach((sector, i) => {
        const c = entries.find(e => e.path === `/api/cron/snapshot?sector=${sector}`);
        const minute = 21 * 60 + 42 + i * 2;
        assert.equal(c?.schedule, `${minute % 60} ${Math.floor(minute / 60)} * * 1-5`);
        for (const date of ['2026-12-01', '2027-07-01']) {
            const at = Date.parse(`${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00Z`);
            assert.ok(etMinutesOf(at) >= sessionCloseMinutes(date) + 40);
        }
    });
    const report = crons.find(c => c.path === '/api/cron/cross-sector-brief');
    assert.equal(report?.schedule, '4 22 * * 1-5');
    assert.ok(22 * 60 + 4 > 22 * 60);
});

test('재생 시각 22:04Z는 22:00Z 저장분을 포함하고 미래 저장분은 제외한다', () => {
    const now = dryClock('2026-12-01', new Date('2026-12-02T01:00:00Z'));
    assert.equal(now.toISOString(), '2026-12-01T22:04:00.000Z');
    assert.equal(replaySnapshotAllowed(new Date('2026-12-01T22:00:00Z'), now, '2026-12-01'), true);
    assert.equal(replaySnapshotAllowed(new Date('2026-12-01T22:05:00Z'), now, '2026-12-01'), false);
    assert.equal(dryClock('2026-12-01', new Date('2026-12-01T22:02:00Z')).toISOString(), '2026-12-01T22:02:00.000Z');
});

test('T51c 관문 11070756 — 마감 푸시 첫 회차는 리포트(22:04Z) 뒤 22:10Z, 리포트보다 먼저 도는 회차 없음', () => {
    const push = crons.filter(c => c.path === '/api/cron/push?type=closing').map(c => c.schedule);
    assert.deepEqual(push, ['10 22 * * 1-5', '20 22 * * 1-5', '40 22 * * 1-5']);
    const retry = crons.find(c => c.path === '/api/cron/cross-sector-brief?mode=retry');
    const check = crons.find(c => c.path === '/api/cron/cross-sector-brief?mode=check');
    // 재생성(22:20Z)은 정시(22:04Z) 생성 상한(maxDuration 300초 → 22:09Z) 뒤, 경보(22:35Z)는 재생성 상한(22:25Z) 뒤
    assert.equal(retry?.schedule, '20 22 * * 1-5');
    assert.equal(check?.schedule, '35 22 * * 1-5');
});

test('T51c Lambda(v3) EventBridge 배포 스크립트도 22:04Z — 21:50Z 에 돌면 그날 스냅샷 5개만(나머지 전날 → 제외) 읽는다', () => {
    const src = fs.readFileSync('scripts/deploy-cross-sector.js', 'utf8');
    assert.match(src, /ScheduleExpression: 'cron\(4 22 \? \* MON-FRI \*\)'/);
    assert.doesNotMatch(src, /cron\(50 21/);
});
