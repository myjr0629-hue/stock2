/**
 * 서머타임 경계 시험 — 2026-11-01(일) 미국 서머타임 종료(EDT UTC−4 → EST UTC−5) 감사(T51, 2026-11-02).
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/dstBoundary.test.ts
 *
 * 고정하는 것:
 *   ① 시각 변환 함수 — 같은 ET 벽시계가 두 계절에 다른 UTC·KST 가 된다(FMP 캘린더 UTC→ET · Tactical 일정 한국/일본 시각 · getETOffset).
 *   ② vercel.json UTC 크론 × ET 판정 가드 — 두 계절 모두 «의도한 ET 시각»에 실제로 일이 일어난다(모닝·마감 푸시, 오늘 볼 것, AI 예열,
 *      구조 사전 갱신, 앱 예열 프리~애프터, 장마감 스냅샷 뒤 마감 푸시).
 *   ③ 대시 캐시 «움직이는 시간» = ET 평일 04:00~19:59(EST 19시대 포함).
 *   ④ 가디언 워커 지표 반응 — FMP 캘린더 UTC 시각을 발표 시점 ms 로 읽는다(ET 분으로 읽던 4·5시간 어긋남 제거).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fmpCalendarToET } from '@/lib/fmpCalendarTime';
import { tacticalEventTime } from '@/lib/ai/tacticalPrompt';
import { getETOffset } from '@/services/timezoneUtils';
import { etMinutesOf, etDateOf, isNonTradingDay } from '@/lib/marketCalendar';
import { isUsExtendedWindowAt } from '@/lib/usExtendedWindow';
import { inWindow as todayPicksWindow } from '@/services/todayPicksService';
import { warmWindowOpen } from '@/lib/structureWarmPlan';
import { dueRound } from '@/lib/ai/deepWarmPlan';

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
    try { fn(); pass++; console.log(`  ✓ ${name}`); } catch (e: any) { fail++; console.log(`  ✗ ${name}\n      ${e?.message || e}`); }
}
const ROOT = path.resolve(__dirname, '..');
const U = (iso: string) => Date.parse(iso);
const hm = (ms: number) => { const m = etMinutesOf(ms); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// ── 최소 크론 해석기(분 시 일 월 요일 — *, */n, a-b, a-b/n, 목록) · UTC ──
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
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as { crons: Array<{ path: string; schedule: string }> };
/** [fromMs, toMs) 안에서 그 경로 크론이 도는 UTC 분 시각들 */
function firesBetween(p: string, fromMs: number, toMs: number): number[] {
    const scheds = VERCEL.crons.filter((c) => c.path === p).map((c) => c.schedule);
    assert.ok(scheds.length > 0, `vercel.json 에 ${p} 없음`);
    const out: number[] = [];
    for (let ms = Math.ceil(fromMs / 60000) * 60000; ms < toMs; ms += 60000) if (scheds.some((s) => cronMatches(s, ms))) out.push(ms);
    return out;
}
// 계절별 대표 평일(둘 다 거래일): EDT 10/28(수) · EST 11/4(수)
const SEASONS = [
    { name: 'EDT 10/28(수)', day: '2026-10-28', next: '2026-10-29', off: '-04:00' },
    { name: 'EST 11/04(수)', day: '2026-11-04', next: '2026-11-05', off: '-05:00' },
] as const;
const etAt = (day: string, off: string, hhmm: string) => U(`${day}T${hhmm}:00${off}`);

console.log('① 시각 변환');
t('getETOffset — 10/30 EDT · 11/02 EST · 3/9/2027 EDT(3/14 시작 전은 EST)', () => {
    assert.equal(getETOffset('2026-10-30'), '-04:00');
    assert.equal(getETOffset('2026-11-01'), '-05:00');   // 경계일 정오 = EST
    assert.equal(getETOffset('2026-11-02'), '-05:00');
    assert.equal(getETOffset('2027-03-12'), '-05:00');
    assert.equal(getETOffset('2027-03-15'), '-04:00');
});
t('FMP 캘린더(UTC) → ET — CPI 12:30Z(EDT)=08:30 · 13:30Z(EST)=08:30', () => {
    assert.deepEqual(fmpCalendarToET('2026-10-15', '12:30'), { date: '2026-10-15', time: '08:30' });
    assert.deepEqual(fmpCalendarToET('2026-11-12', '13:30'), { date: '2026-11-12', time: '08:30' });
    assert.deepEqual(fmpCalendarToET('2026-11-04', '19:00'), { date: '2026-11-04', time: '14:00' });   // FOMC 14:00 ET
});
t('Tactical 일정 한국/일본 시각 — 08:30 ET = 21:30 KST(EDT) · 22:30 KST(EST)', () => {
    assert.equal(tacticalEventTime('2026-10-29', '08:30', 'ko'), '10/29(목) 08:30 ET(한국 21:30)');
    assert.equal(tacticalEventTime('2026-11-05', '08:30', 'ko'), '11/5(목) 08:30 ET(한국 22:30)');
    assert.equal(tacticalEventTime('2026-11-05', '10:00', 'ja'), '11/5(木) 10:00 ET(日本時間 00:00)');
    assert.equal(tacticalEventTime('2026-11-05', '10:00', 'en'), '11/5 (Thu) 10:00 ET');
});
t('정규장 KST — EST 개장 23:30 · 마감 06:00 · 프리 18:00 · 애프터 끝 10:00', () => {
    const kst = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
    assert.equal(kst(etAt('2026-11-04', '-05:00', '09:30')), '23:30');
    assert.equal(kst(etAt('2026-11-04', '-05:00', '16:00')), '06:00');
    assert.equal(kst(etAt('2026-11-04', '-05:00', '04:00')), '18:00');
    assert.equal(kst(etAt('2026-11-04', '-05:00', '20:00')), '10:00');
    assert.equal(kst(etAt('2026-10-28', '-04:00', '09:30')), '22:30');
});

console.log('② vercel.json UTC 크론 × ET 가드 — 두 계절');
for (const S of SEASONS) {
    const dayStart = etAt(S.day, S.off, '00:00'), dayEnd = etAt(S.next, S.off, '00:00');
    t(`${S.name} 모닝 푸시 — 08:00~08:35 ET 안에 한 번 이상 돈다(브리핑 08:00 ET 뒤)`, () => {
        const f = firesBetween('/api/cron/push?type=morning', dayStart, dayEnd).filter((ms) => etMinutesOf(ms) >= 480 && etMinutesOf(ms) <= 515);
        assert.ok(f.length >= 1, `발화 ${firesBetween('/api/cron/push?type=morning', dayStart, dayEnd).map(hm).join(',')}`);
    });
    t(`${S.name} 마감 푸시 — 첫 발화가 마지막 섹터 스냅샷(cloud_fortress) 뒤 · 16:00 ET 뒤`, () => {
        const snap = firesBetween('/api/cron/snapshot?sector=cloud_fortress', dayStart, dayEnd);
        const push = firesBetween('/api/cron/push?type=closing', dayStart, dayEnd);
        assert.ok(snap.length === 1 && push.length >= 1);
        assert.ok(etMinutesOf(snap[0]) >= 16 * 60, `스냅샷 ${hm(snap[0])}`);
        assert.ok(push[0] > snap[0], `푸시 ${hm(push[0])} · 스냅샷 ${hm(snap[0])}`);
    });
    t(`${S.name} 장마감 스냅샷 첫 섹터(m7) — 16:00 ET 이후(장중 아님)`, () => {
        const m7 = firesBetween('/api/cron/snapshot?sector=m7', dayStart, dayEnd);
        assert.ok(m7.length === 1 && etMinutesOf(m7[0]) >= 16 * 60, hm(m7[0]));
    });
    t(`${S.name} 오늘 볼 것 — 아침판(07:30~10:30 ET)·마감판(16:30~21:00 ET) 창 안 발화가 각각 1회 이상`, () => {
        const f = firesBetween('/api/cron/today-picks', dayStart, dayEnd).filter((ms) => todayPicksWindow(ms));
        const m = f.map(etMinutesOf);
        assert.ok(m.some((x) => x >= 450 && x <= 630), `창 안 발화 ${f.map(hm).join(',')}`);
        assert.ok(m.some((x) => x >= 990 && x <= 1260), `창 안 발화 ${f.map(hm).join(',')}`);
    });
    t(`${S.name} AI 딥 예열 — open·r2 두 라운드 창에 크론이 닿는다`, () => {
        const done = new Set<string>();
        for (const ms of firesBetween('/api/cron/ai-warm', dayStart, dayEnd)) { const r = dueRound(ms, done); if (r) done.add(r.id); }
        assert.deepEqual([...done].sort(), ['open', 'r2']);
    });
    t(`${S.name} 구조 사전 갱신 — 창(20:05 ET~07:00 ET) 안 발화 24회 이상 · 정규장·시간외 발화 0`, () => {
        const from = etAt(S.day, S.off, '16:00'), to = etAt(S.next, S.off, '09:30');
        const f = firesBetween('/api/cron/structure-warm', from, to);
        const inWin = f.filter((ms) => warmWindowOpen(ms));
        assert.ok(inWin.length >= 24, `창 안 ${inWin.length}회: ${inWin.map(hm).join(',')}`);
        assert.ok(f.every((ms) => !warmWindowOpen(ms) ? true : (etMinutesOf(ms) >= 20 * 60 + 5 || etMinutesOf(ms) < 7 * 60)));
    });
    t(`${S.name} 앱 예열 — 프리~애프터(04:00~19:59 ET) 5분 칸마다 «실제로 일하는» 발화 · 같은 분 중복 0 · ext 크론은 창 밖이면 건너뜀`, () => {
        const from = etAt(S.day, S.off, '00:00'), to = etAt(S.next, S.off, '04:00');
        const base = firesBetween('/api/cron/app-warm', from, to);
        const ext = firesBetween('/api/cron/app-warm?ext=1', from, to);
        const extWorking = ext.filter((ms) => isUsExtendedWindowAt(ms));   // 라우트 가드와 같은 함수
        assert.deepEqual(base.filter((ms) => ext.includes(ms)).map(hm), [], '같은 분에 두 크론');
        const f = new Set([...base, ...extWorking]);
        const missing: string[] = [];
        for (let ms = etAt(S.day, S.off, '04:00'); ms < etAt(S.day, S.off, '20:00'); ms += 5 * 60000) if (!f.has(ms)) missing.push(hm(ms));
        assert.deepEqual(missing, []);
        if (S.off === '-04:00') assert.equal(extWorking.length, 0, 'EDT 에 ext 크론이 일했다');
    });
    t(`${S.name} 정규장 09:30~16:00 ET — 대시 캐시 «움직이는 시간» · 19:30 ET 도 포함 · 20:00 ET 부터 장외`, () => {
        assert.ok(isUsExtendedWindowAt(etAt(S.day, S.off, '04:00')));
        assert.ok(isUsExtendedWindowAt(etAt(S.day, S.off, '09:30')));
        assert.ok(isUsExtendedWindowAt(etAt(S.day, S.off, '19:30')));
        assert.ok(!isUsExtendedWindowAt(etAt(S.day, S.off, '20:00')));
        assert.ok(!isUsExtendedWindowAt(etAt(S.day, S.off, '03:59')));
    });
}
t('EST 금요일 19:30 ET(= 토 00:30 UTC) — 아직 애프터(대시 «움직이는 시간»)', () => {
    assert.ok(isUsExtendedWindowAt(U('2026-11-07T00:30:00Z')));
    assert.ok(!isUsExtendedWindowAt(U('2026-11-07T09:30:00Z')));   // 토 04:30 ET
});
t('휴장 판정은 ET 날짜 — EST 11/26(추수감사절) 휴장', () => {
    assert.equal(etDateOf(U('2026-11-27T04:30:00Z')), '2026-11-26');
    assert.ok(isNonTradingDay('2026-11-26'));
});

console.log('④ 가디언 워커 지표 반응(fmpEventMs)');
t('fmpEventMs — FMP UTC 시각을 발표 시점 ms 로 · 모양이 틀리면 null', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/ec2-guardian-worker.js'), 'utf8');
    const m = /function fmpEventMs\(evt\) \{[\s\S]*?\n\}/.exec(src);
    assert.ok(m, 'fmpEventMs 없음');
    // eslint-disable-next-line no-new-func
    const fmpEventMs = new Function(`${m![0]}; return fmpEventMs;`)() as (e: unknown) => number | null;
    assert.equal(fmpEventMs({ date: '2026-11-12', time: '13:30' }), etAt('2026-11-12', '-05:00', '08:30'));
    assert.equal(fmpEventMs({ date: '2026-10-15', time: '12:30' }), etAt('2026-10-15', '-04:00', '08:30'));
    assert.equal(fmpEventMs({ date: '2026-11-12', time: '8:30' }), U('2026-11-12T08:30:00Z'));
    assert.equal(fmpEventMs({ date: '2026-11-12' }), null);
    assert.equal(fmpEventMs(null), null);
    assert.ok(!/currentMinutes|eventMinutes/.test(src), 'ET 분 비교가 남아 있다');
});
t('eventInRegularWindow — 정규장 안 발표만(옵션 09:30 개장 전 08:30 지표는 GEX 반응 측정 불가) · 두 계절 같은 ET', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/ec2-guardian-worker.js'), 'utf8');
    const m = /function eventInRegularWindow\(eventMs\) \{[\s\S]*?\n\}/.exec(src);
    assert.ok(m, 'eventInRegularWindow 없음');
    // eslint-disable-next-line no-new-func
    const inReg = new Function(`${m![0]}; return eventInRegularWindow;`)() as (ms: number) => boolean;
    assert.equal(inReg(U('2026-11-12T13:30:00Z')), false);   // CPI 08:30 EST
    assert.equal(inReg(U('2026-11-02T15:00:00Z')), true);    // ISM 10:00 EST
    assert.equal(inReg(U('2026-11-04T19:00:00Z')), true);    // FOMC 14:00 EST
    assert.equal(inReg(U('2026-10-28T18:00:00Z')), true);    // FOMC 14:00 EDT
    assert.equal(inReg(U('2026-10-28T14:00:00Z')), true);    // 10:00 EDT
    assert.equal(inReg(U('2026-11-04T14:00:00Z')), false);   // 09:00 EST — 개장 전
    assert.ok(/fmpEventMs\(evt\);\s*\n\s*if \(eventMs == null \|\| !eventInRegularWindow\(eventMs\)\) continue;/.test(src), '발표 전 기록 경로가 정규장 창을 거르지 않는다');
});

console.log(`\n${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
