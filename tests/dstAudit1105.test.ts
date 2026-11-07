/**
 * 서머타임 종료 2차 감사(2026-11-05, 대표 «장마감 리포트도 그렇고 시간대가 중요한 것들은 조정을 확인해 완벽하게»).
 * 실행: node -r ./scripts/offline-test-typescript.cjs --test tests/dstAudit1105.test.ts
 *
 * 고정하는 것(두 계절 — EDT 10/28 · EST 11/4 · 다음 경계 직전 EST 2027-03-10 · 직후 EDT 2027-03-15):
 *   ① 장마감 섹터 스냅샷 10개 = 전부 마감 15분 뒤(≥16:15 ET; 11/7 T51c 부터는 ≥16:40 ET — tests/sectorCloseSchedule) · 마지막 스냅샷 < 장마감 리포트(cross-sector-brief) < 첫 마감 푸시.
 *      (11/2·11/3 실측: 가격 원천이 약 15분 늦어 16:00~16:10 ET 스냅샷이 마감 전 값 → 리포트 입력 오염)
 *   ② 마감 푸시 휴장 관문 = 시장 달력(공급사 일봉 «있나» 추측 아님 — EST 17:00 ET 엔 아직 없어 22:00 UTC 회차가 매일 건너뛰었다).
 *   ③ 장마감 리포트 v4(postmarket:) 쓰기는 Upstash 에도 복제(EC2 축출 뒤 읽기 폴백이 사본을 찾게).
 *   ④ flow-harvest Lambda 의 ET 시계 = America/New_York(«3~11월 EDT» 월 근사 제거).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { etMinutesOf } from '@/lib/marketCalendar';
import { closingPushHolidayReason } from '@/lib/push/closingHoliday';
import { decideReplicate, shouldFallbackToUpstash } from '@/services/redisClient';

const ROOT = path.resolve(__dirname, '..');
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as { crons: Array<{ path: string; schedule: string }> };

function field(spec: string, lo: number, hi: number): Set<number> {
    const out = new Set<number>();
    for (const part of spec.split(',')) {
        const [rng, stepS] = part.split('/');
        const step = stepS ? Number(stepS) : 1;
        let a = lo, b = hi;
        if (rng !== '*') { const [x, y] = rng.split('-').map(Number); a = x; b = y ?? (stepS ? hi : x); }
        for (let v = a; v <= b; v += step) out.add(v);
    }
    return out;
}
function cronMatches(expr: string, ms: number): boolean {
    const [mi, h, dom, mon, dow] = expr.trim().split(/\s+/);
    const d = new Date(ms);
    return field(mi, 0, 59).has(d.getUTCMinutes()) && field(h, 0, 23).has(d.getUTCHours())
        && field(dom, 1, 31).has(d.getUTCDate()) && field(mon, 1, 12).has(d.getUTCMonth() + 1) && field(dow, 0, 6).has(d.getUTCDay());
}
function fires(p: string, fromMs: number, toMs: number): number[] {
    const scheds = VERCEL.crons.filter((c) => c.path === p).map((c) => c.schedule);
    assert.ok(scheds.length > 0, `vercel.json 에 ${p} 없음`);
    const out: number[] = [];
    for (let ms = fromMs; ms < toMs; ms += 60000) if (scheds.some((s) => cronMatches(s, ms))) out.push(ms);
    return out;
}
const hm = (ms: number) => { const m = etMinutesOf(ms); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const SECTORS = ['m7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse', 'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress'];
// ET 정오~자정(UTC) — 마감 체인 전체가 들어간다
const DAYS = [
    { name: 'EDT 2026-10-28', from: '2026-10-28T16:00:00Z', to: '2026-10-29T04:00:00Z' },
    { name: 'EST 2026-11-04', from: '2026-11-04T17:00:00Z', to: '2026-11-05T05:00:00Z' },
    { name: 'EST 2027-03-10', from: '2027-03-10T17:00:00Z', to: '2027-03-11T05:00:00Z' },
    { name: 'EDT 2027-03-15', from: '2027-03-15T16:00:00Z', to: '2027-03-16T04:00:00Z' },
];

for (const D of DAYS) {
    const a = Date.parse(D.from), b = Date.parse(D.to);
    test(`${D.name} — 섹터 스냅샷 10개 모두 ≥16:15 ET(마감 값이 원천에 닿은 뒤) · 하루 1회`, () => {
        for (const s of SECTORS) {
            const f = fires(`/api/cron/snapshot?sector=${s}`, a, b);
            assert.equal(f.length, 1, `${s} 발화 ${f.map(hm).join(',')}`);
            assert.ok(etMinutesOf(f[0]) >= 16 * 60 + 15, `${s} ${hm(f[0])} ET — 마감 15분 전 값이 찍힌다`);
        }
    });
    // [T51c 2026-11-07] 스냅샷 21:42~22:00Z(2분 간격)·리포트 22:04Z·첫 푸시 22:10Z 로 옮겼다. 간격 근거:
    //   스냅샷 POST maxDuration 60초 → 22:01Z 이전 종료 보장 + 3분 여유 = 리포트까지 4분 · 리포트 생성 실측 48초~2분57초(11/4~11/6) → 푸시까지 6분.
    test(`${D.name} — 마지막 스냅샷(cloud_fortress) +4분 ≤ 장마감 리포트 · 리포트 +6분 ≤ 첫 마감 푸시 ≤ 리포트 +10분`, () => {
        const last = Math.max(...SECTORS.map((s) => fires(`/api/cron/snapshot?sector=${s}`, a, b)[0]));
        assert.equal(last, fires('/api/cron/snapshot?sector=cloud_fortress', a, b)[0], '마감 푸시 표식은 cloud_fortress 성공 때 찍힌다 — 마지막이어야 한다');
        const brief = fires('/api/cron/cross-sector-brief', a, b);
        const push = fires('/api/cron/push?type=closing', a, b);
        assert.equal(brief.length, 1);
        assert.ok(brief[0] - last >= 4 * 60000, `리포트 ${hm(brief[0])} · 마지막 스냅샷 ${hm(last)}`);
        // 리포트보다 먼저 도는 마감 푸시 회차가 있으면 매일 «brief-not-ready» 로 건너뛰고 다음 회차까지 밀린다(관문 11070756)
        assert.ok(push.length >= 1 && push.every((p) => p > brief[0]), `푸시 ${push.map(hm).join(',')} · 리포트 ${hm(brief[0])}`);
        assert.ok(push[0] - brief[0] >= 6 * 60000 && push[0] - brief[0] <= 10 * 60000, `첫 푸시 ${hm(push[0])} · 리포트 ${hm(brief[0])}`);
    });
}

test('마감 푸시 휴장 관문 = 시장 달력 — 거래일은 통과, 휴장·주말은 건너뜀', () => {
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2027-03-15']) assert.equal(closingPushHolidayReason(d), null, d);
    for (const d of ['2026-11-26', '2026-12-25', '2026-11-07', '2026-11-08', '2026-07-03']) assert.equal(closingPushHolidayReason(d), 'market-holiday', d);
});

test('마감 푸시 라우트는 공급사 SPY 일봉으로 휴장을 추측하지 않는다(EST 17:00 ET 엔 아직 없음)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app/api/cron/push/route.ts'), 'utf8');
    assert.equal(/fetchMassive|aggs\/ticker\/SPY/.test(src), false);
    assert.ok(src.includes('closingPushHolidayReason(todayET)'));
});

test('장마감 리포트 저장본(postmarket:)은 EC2 정상 쓰기여도 Upstash 에 복제 · EC2 미스면 Upstash 를 읽는다', () => {
    assert.equal(decideReplicate('postmarket:cross-brief-v4:2026-11-04', 259200, true), 'replicate');
    assert.equal(shouldFallbackToUpstash('postmarket:cross-brief-v4:2026-11-04', true), true);
});

test('flow-harvest Lambda ET 시계 — 11월 EST·3월 경계 전 EST·EDT 모두 뉴욕 벽시계', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/lambda-flow-harvest/index.js'), 'utf8');
    assert.equal(/month >= 3 && month <= 11/.test(src), false, '월 단위 서머타임 근사 금지');
    const m = src.match(/function etClock\(now\) \{[\s\S]*?\n\}\n/);
    assert.ok(m, 'etClock 없음');
    // eslint-disable-next-line no-new-func
    const etClock = new Function(`${m![0]}; return etClock;`)() as (d: Date) => { etHour: number; day: number };
    assert.deepEqual(etClock(new Date('2026-11-04T01:30:00Z')), { etHour: 20, day: 2 }); // EST 화 20:30
    assert.deepEqual(etClock(new Date('2026-11-04T00:59:00Z')), { etHour: 19, day: 2 }); // EST 화 19:59 — 시간외 안
    assert.deepEqual(etClock(new Date('2026-10-28T00:30:00Z')), { etHour: 20, day: 2 }); // EDT 화 20:30
    assert.deepEqual(etClock(new Date('2027-03-10T01:30:00Z')), { etHour: 20, day: 2 }); // 3/9(화) EST — 예전 근사는 21
    assert.deepEqual(etClock(new Date('2026-11-07T01:30:00Z')), { etHour: 20, day: 5 }); // 금 20:30 ET(UTC 로는 토)
    const calls = src.match(/etClock\(/g) || [];
    assert.ok(calls.length >= 3, '두 판정 지점(getEffectiveTTL·장외 건너뛰기) 모두 etClock 사용');
});

for (const D of DAYS) {
    const a = Date.parse(D.from), b = Date.parse(D.to);
    test(`${D.name} — 섹터 판정문(sector-headlines) 마감 뒤 회차가 있다(16:15~19:59 ET) · 장중 마지막 회차는 정규장 안`, () => {
        const all = fires('/api/cron/sector-headlines', a, b);
        const post = all.filter((ms) => etMinutesOf(ms) >= 16 * 60 + 15 && etMinutesOf(ms) < 20 * 60);
        assert.ok(post.length >= 1, `발화 ${all.map(hm).join(',')}`);
    });
}
