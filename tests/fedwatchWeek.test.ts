/**
 * FedWatch 카드 — «1주 변화»는 진짜 1주 전 대비, 값 옆에 «기준 시각», 수집은 정각을 피해 30분 간격 (src/lib/fedwatchView.ts · cron-fedwatch.yml)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/fedwatchWeek.test.ts
 *
 * 출발점(2026-10-07 22:41 KST 장중 실측): 카드가 13.5시간 전 스크랩(01:06 UTC)을 «현재 확률»로 보여 줬고 «1주 변화»는 0.0% 였다.
 *   · 0.0% = 2026-08-07 서버측 이식이 스크래퍼의 get1WeekAgoData 를 지우고 prev* 를 «Redis 직전값(= 방금 전 스크랩)»으로 대체했다
 *   · 13.5시간 = GitHub Actions 정각 크론(12·15·19·22시 UTC)이 밀리거나 안 돌았다: 최근 300회 평일 첫 실행 중앙값 17시대 UTC
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    ASOF_STALE_MS, WEEK_MAX_AGE_MS, WEEK_MS, formatAsOfEt, isAsOfStale, weekAgoFromRow, weekDelta, withWeekBaseline,
} from '@/lib/fedwatchView';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };
const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-10-07T15:30:00.000Z');

(async () => {
    // ── 1주 전 기준 ─────────────────────────────────────────────────────────────
    await t('기준 행: 7일 이상 된 행의 확률 셋을 그대로(시각은 ISO)', () => {
        const row = { pattern: 'FEDWATCH:latest', timestamp: NOW - 7 * DAY - 3600_000, ease: 3.5, noChange: 70.1, hike: 26.4 };
        assert.deepEqual(weekAgoFromRow(row, NOW), { ease: 3.5, noChange: 70.1, hike: 26.4, at: new Date(NOW - 7 * DAY - 3600_000).toISOString() });
        // 문자열 숫자도 읽는다(DynamoDB 를 거친 값)
        assert.equal(weekAgoFromRow({ timestamp: String(NOW - 8 * DAY), ease: '0', noChange: '79.5', hike: '20.5' }, NOW)!.noChange, 79.5);
    });

    await t('기준 행: 1주가 안 된 행(6일)·12일을 넘게 묵은 행은 «1주 전»이 아니다 → null', () => {
        const mk = (age: number) => ({ timestamp: NOW - age, ease: 1, noChange: 60, hike: 39 });
        assert.equal(weekAgoFromRow(mk(6 * DAY), NOW), null);
        assert.notEqual(weekAgoFromRow(mk(WEEK_MS), NOW), null);
        assert.notEqual(weekAgoFromRow(mk(WEEK_MAX_AGE_MS), NOW), null);
        assert.equal(weekAgoFromRow(mk(WEEK_MAX_AGE_MS + 1000), NOW), null);
    });

    await t('기준 행: 0/0/0·범위 밖·숫자 아님·빈 행은 null — «전부 0%» 라는 주장을 만들지 않는다', () => {
        const base = { timestamp: NOW - 8 * DAY };
        assert.equal(weekAgoFromRow({ ...base, ease: 0, noChange: 0, hike: 0 }, NOW), null);
        assert.equal(weekAgoFromRow({ ...base, ease: -1, noChange: 90, hike: 11 }, NOW), null);
        assert.equal(weekAgoFromRow({ ...base, ease: 1, noChange: 200, hike: 0 }, NOW), null);
        assert.equal(weekAgoFromRow({ ...base, ease: 'x', noChange: 90, hike: 10 }, NOW), null);
        assert.equal(weekAgoFromRow({ ease: 1, noChange: 90, hike: 9 }, NOW), null);          // 시각 없음
        assert.equal(weekAgoFromRow(null, NOW), null); assert.equal(weekAgoFromRow(undefined, NOW), null); assert.equal(weekAgoFromRow('x' as any, NOW), null);
        // timestamp 가 없으면 scrapedAt 으로
        assert.notEqual(weekAgoFromRow({ scrapedAt: new Date(NOW - 8 * DAY).toISOString(), ease: 1, noChange: 90, hike: 9 }, NOW), null);
    });

    await t('응답 반영: prev* 를 «1주 전 값»으로 바꾸고(직전 스크랩 값을 덮는다) 기준이 없으면 null · 원본은 안 바뀐다', () => {
        const live = { ease: 0, noChange: 79.5, hike: 20.5, prevEase: 0, prevNoChange: 79.5, prevHike: 20.5, scrapedAt: '2026-10-07T01:06:56.024Z', daysUntilFomc: 21 };
        const snap = JSON.stringify(live);
        const base = { ease: 4, noChange: 70, hike: 26, at: '2026-09-29T12:00:00.000Z' };
        const out = withWeekBaseline(live, base);
        assert.deepEqual([out.prevEase, out.prevNoChange, out.prevHike, out.weekAgoAt], [4, 70, 26, base.at]);
        assert.equal(out.scrapedAt, live.scrapedAt); assert.equal(out.daysUntilFomc, 21);
        assert.equal(JSON.stringify(live), snap);
        const none = withWeekBaseline(live, null);
        assert.deepEqual([none.prevEase, none.prevNoChange, none.prevHike, none.weekAgoAt], [null, null, null, null]);
    });

    await t('1주 변화 계산: 10/7 사고(직전 스크랩 79.5 = 현재 79.5 → 0.0%)와 달리 1주 전 70.0 대비 +9.5, 기준이 없으면 null(«—»)', () => {
        assert.equal(weekDelta(79.5, 79.5), 0);
        assert.equal(weekDelta(79.5, 70), 9.5);
        assert.equal(weekDelta(20.5, 26), -5.5);
        assert.equal(weekDelta(0, 4), -4);
        assert.equal(weekDelta(79.5, null), null); assert.equal(weekDelta(79.5, undefined), null); assert.equal(weekDelta(NaN, 3), null);
        assert.equal(weekDelta(0.3, 0.1 + 0.1), 0.1);              // 부동소수 잡음 제거
        assert.equal(Object.is(weekDelta(10.04, 10), 0), true);     // −0 이 «-0.0%» 로 보이지 않게 (0 으로 정규화되는지는 표시 쪽 toFixed 가 처리)
    });

    // ── 기준 시각 ───────────────────────────────────────────────────────────────
    await t('기준 시각: 10/7 스크랩 01:06:56Z = 뉴욕(서머타임) 10/6 21:06 — 세 언어 문구', () => {
        const iso = '2026-10-07T01:06:56.024Z';
        assert.equal(formatAsOfEt(iso, 'ko'), '10/6 21:06 ET 기준');
        assert.equal(formatAsOfEt(iso, 'ja'), '10/6 21:06 ET時点');
        assert.equal(formatAsOfEt(iso, 'en'), 'as of 10/6 21:06 ET');
        assert.equal(formatAsOfEt(iso, 'fr'), 'as of 10/6 21:06 ET');   // 모르는 언어는 영어
    });

    await t('기준 시각: 표준시(11월~)는 UTC−5 · 자정은 «00:05»(24:05 아님) · 날짜 경계', () => {
        assert.equal(formatAsOfEt('2026-12-07T01:06:00Z', 'ko'), '12/6 20:06 ET 기준');
        assert.equal(formatAsOfEt('2026-10-07T04:05:00Z', 'en'), 'as of 10/7 00:05 ET');
        assert.equal(formatAsOfEt('2026-03-08T07:30:00Z', 'ko'), '3/8 03:30 ET 기준');   // 서머타임 시작일(03/08 02:00 → 03:00)
    });

    await t('기준 시각: 읽을 수 없으면 null(표식을 지어내지 않는다) · 낡음 판정은 6시간 · 읽을 수 없는 값은 낡은 것', () => {
        assert.equal(formatAsOfEt(undefined, 'ko'), null); assert.equal(formatAsOfEt('', 'ko'), null); assert.equal(formatAsOfEt('abc', 'ko'), null); assert.equal(formatAsOfEt(123, 'ko'), null);
        const iso = new Date(NOW - ASOF_STALE_MS + 1000).toISOString();
        assert.equal(isAsOfStale(iso, NOW), false);
        assert.equal(isAsOfStale(new Date(NOW - ASOF_STALE_MS - 1000).toISOString(), NOW), true);
        assert.equal(isAsOfStale('2026-10-07T01:06:56.024Z', NOW), true);     // 10/7 사고: 14.4시간 → 낡음
        assert.equal(isAsOfStale(undefined, NOW), true);
    });

    // ── 화면 연결(소스 수준) ────────────────────────────────────────────────────
    await t('화면: 모바일 카드의 1주 변화는 weekDelta(1주 전 값)를 쓰고 «직전 스크랩 차이»를 직접 빼지 않는다 · 두 카드에 기준 시각', () => {
        const root = path.join(__dirname, '..');
        const mobile = fs.readFileSync(path.join(root, 'src/components/guardian/mobile/MobileGuardianOverview.tsx'), 'utf8');
        const gauge = fs.readFileSync(path.join(root, 'src/components/guardian/GravityGauge.tsx'), 'utf8');
        assert.match(mobile, /weekDelta\(item\.value, item\.prev\)/);
        assert.doesNotMatch(mobile, /item\.value - item\.prev/);
        assert.match(mobile, /formatAsOfEt\(fedwatch\?\.scrapedAt, fwLocale\)/);
        assert.match(gauge, /formatAsOfEt\(data\.scrapedAt, locale\)/);
        const route = fs.readFileSync(path.join(root, 'src/app/api/guardian/fedwatch/route.ts'), 'utf8');
        assert.match(route, /withWeekBaseline\(payload, await loadWeekAgo\(\)\)/);
        assert.match(route, /'FEDWATCH:latest'/);
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
