/**
 * PRO «내 종목» 알림 — 실행기(run.ts) 통합 시험: 메모리 저장소 + 가짜 자료 제공자 + 가짜 발송기(실발송 없음)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/watchlistAlerts.run.test.ts
 *
 * 확인하는 것: 무장→확정 두 번의 실행 · 종목+이벤트+세션 중복 억제 · 이벤트별 구독 필터 · 조용한 시간(무음·passive) ·
 *   기기 하루 상한 · 3종목 이상 요약 · 드라이런(쓰기·발송 0) · PRO 만료 재확인 · 죽은 토큰 정리 · 시간표·완료 표식.
 */
import assert from 'node:assert/strict';
import { runWatchlistAlerts, phaseClock, type AlertDataProvider, type AlertPush, type AlertSender, type LevelsResult } from '../src/lib/alerts/run';
import { MemoryAlertStore, deviceHashOf, type AlertStore } from '../src/lib/alerts/store';
import type { ProVerifier } from '../src/lib/alerts/revenuecat';
import type { Bar5, DarkPoolInput, EarningsInput, LevelSet, MaxPainStats, StoredDevice, WhaleInput } from '../src/lib/alerts/types';

let n = 0;
const tests: Array<[string, () => Promise<void>]> = [];
const t = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

const et = (date: string, hhmm: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = hhmm.split(':').map(Number);
    return Date.UTC(y, m - 1, d, hh + 4, mm);   // EDT
};
const WED = '2026-09-30', TUE = '2026-09-29', FRI = '2026-10-02';
const FAR = Date.UTC(2026, 10, 30);

const TOK = { d1: 'a'.repeat(64), d2: 'dQw4w9WgXcQ:APA91bH' + 'y'.repeat(140), d3: 'c'.repeat(64) };

function device(token: string, over: Partial<StoredDevice>): StoredDevice {
    return {
        deviceHash: deviceHashOf(token), rcAppUserId: '$RCAnonymousID:' + '0'.repeat(32), platform: 'ios', token, locale: 'ko',
        tickers: [], quiet: null, dailyCap: 5, proUntil: FAR, updatedAt: et(WED, '09:00'), ...over,
    };
}

async function seed(store: MemoryAlertStore) {
    await store.putSubscription(device(TOK.d1, {
        tickers: [{ t: 'NVDA', events: ['call_wall_break', 'gamma_flip_cross'] }, { t: 'MU', events: ['put_floor_break'] }],
        quiet: { start: '23:00', end: '07:00', tz: 'Asia/Seoul' },   // ET 10:10 = KST 23:10 → 무음
    }), et(WED, '09:00'));
    await store.putSubscription(device(TOK.d2, {
        platform: 'android', locale: 'en', tickers: [{ t: 'NVDA', events: ['put_floor_break'] }],   // 콜월 돌파는 안 받는다
    }), et(WED, '09:00'));
    await store.putSubscription(device(TOK.d3, {
        locale: 'ja', dailyCap: 1, tickers: [{ t: 'NVDA', events: ['call_wall_break', 'gamma_flip_cross'] }],
    }), et(WED, '09:00'));
}

const nvda = (over: Partial<LevelSet> = {}): LevelSet => ({
    callWall: 250, putFloor: 240, gammaFlip: 245, gammaFlipType: 'EXACT', gexConfidence: 'HIGH', maxPain: 242.5, pcr: 0.97,
    spot: 248.1, asOf: et(WED, '10:00'), expiration: FRI, chainDate: TUE, ...over,
});
const mu = (over: Partial<LevelSet> = {}): LevelSet => ({
    callWall: 1000, putFloor: 900, gammaFlip: 950, gammaFlipType: 'EXACT', gexConfidence: 'MEDIUM', maxPain: 970, pcr: 1.12,
    spot: 906, asOf: et(WED, '10:00'), expiration: FRI, chainDate: TUE, ...over,
});
const bar = (hhmm: string, close: number): Bar5 => ({ close, endMs: et(WED, hhmm), session: WED });

class FakeProvider implements AlertDataProvider {
    bars: Record<string, Bar5 | null> = {};
    levels: Record<string, LevelsResult> = {};
    whales: Record<string, WhaleInput | null> = {};
    dark: Record<string, DarkPoolInput | null> = {};
    earnings: Record<string, EarningsInput | null> = {};
    stats: Record<string, MaxPainStats | null> = {};
    calls: string[] = [];
    async getBars(ts: string[]) { this.calls.push(`bars:${ts.join(',')}`); return Object.fromEntries(ts.map((x) => [x, this.bars[x] ?? null])); }
    async getLevels(ts: string[]) { this.calls.push(`levels:${ts.join(',')}`); return Object.fromEntries(ts.filter((x) => this.levels[x]).map((x) => [x, this.levels[x]])); }
    async getMaxPainStats(ts: string[]) { this.calls.push(`stats:${ts.join(',')}`); return Object.fromEntries(ts.map((x) => [x, this.stats[x] ?? null])); }
    async getDarkPool(ts: string[]) { this.calls.push('darkpool'); return Object.fromEntries(ts.map((x) => [x, this.dark[x] ?? null])); }
    async getWhales(ts: string[]) { this.calls.push('whales'); return Object.fromEntries(ts.map((x) => [x, this.whales[x] ?? null])); }
    async getEarnings(ts: string[]) { this.calls.push('earnings'); return Object.fromEntries(ts.map((x) => [x, this.earnings[x] ?? null])); }
}

class FakeSender implements AlertSender {
    pushes: AlertPush[] = [];
    dead: string[] = [];
    async send(p: AlertPush[]) {
        this.pushes.push(...p);
        const total = p.reduce((a, x) => a + x.tokens.length, 0);
        return { sent: total - this.dead.length, failed: 0, deadTokens: this.dead };
    }
}

const activePro: ProVerifier = async () => ({ active: true, expiresAtMs: FAR });

/** 두 번의 장중 실행: 10:05 무장 → 10:10 NVDA 콜월 250 돌파 + MU 풋플로어 900 이탈 */
async function twoRuns(dryRunSecond: boolean) {
    const store = new MemoryAlertStore();
    await seed(store);
    const provider = new FakeProvider();
    const sender = new FakeSender();
    provider.bars = { NVDA: bar('10:05', 248.6), MU: bar('10:05', 905) };
    provider.levels = { NVDA: { levels: nvda(), expirations: [FRI] }, MU: { levels: mu(), expirations: [FRI] } };
    const r1 = await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '10:05') + 30_000 }, { dryRun: false });
    provider.bars = { NVDA: bar('10:10', 250.7), MU: bar('10:10', 897.5) };
    provider.levels = {
        NVDA: { levels: nvda({ callWall: 260, spot: 250.7, asOf: et(WED, '10:10') }), expirations: [FRI] },
        MU: { levels: mu({ putFloor: 880, spot: 897.5, asOf: et(WED, '10:10') }), expirations: [FRI] },
    };
    const r2 = await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '10:10') + 30_000 }, { dryRun: dryRunSecond });
    return { store, provider, sender, r1, r2 };
}

// ─────────────────────────────────────────────────────────────────────
t('시간표(ET): 09:05 고래 · 10:35 장중+실적+맥스페인(오전) · 14:35 장중+맥스페인(오후) · 16:10 없음 · 18:05 장외 · 토요일 없음', async () => {
    const on = (date: string, hhmm: string) => Object.entries(phaseClock(et(date, hhmm)).phases).filter(([, v]) => v).map(([k]) => k).sort();
    assert.deepEqual(on(WED, '09:05'), ['whale']);
    assert.deepEqual(on(WED, '10:35'), ['earnings', 'intraday', 'maxPain']);
    assert.deepEqual(on(WED, '14:35'), ['intraday', 'maxPain']);
    assert.deepEqual(on(WED, '16:10'), []);
    assert.deepEqual(on(WED, '18:05'), ['darkPool']);
    assert.deepEqual(on('2026-10-03', '10:35'), []);
    const c = phaseClock(et(FRI, '10:35'));
    assert.deepEqual([c.prevSession, c.nextSession, c.maxPainSlot], ['2026-10-01', '2026-10-05', 'am']);
});

t('할 일이 없는 시각(07:00 ET)·주말에는 저장소를 한 번도 건드리지 않는다', async () => {
    const trap = new Proxy({}, { get: () => () => { throw new Error('store touched'); } }) as unknown as AlertStore;
    const provider = new FakeProvider();
    const a = await runWatchlistAlerts({ store: trap, provider, sender: null, now: () => et(WED, '07:00') }, { dryRun: false });
    assert.equal(a.skipped, 'no_phase');
    const b = await runWatchlistAlerts({ store: trap, provider, sender: null, now: () => et('2026-10-03', '10:30') }, { dryRun: false });
    assert.equal(b.skipped, 'non_trading_day');
    assert.equal(provider.calls.length, 0);
});

t('첫 실행은 무장만(발송 0) → 두 번째 실행에서 NVDA 콜월 250 돌파·MU 풋플로어 900 이탈 발송', async () => {
    const { sender, r1, r2 } = await twoRuns(false);
    assert.equal(r1.events.length, 0);
    assert.equal(r1.sent, 0);
    assert.deepEqual(r2.events.map((e) => `${e.ticker}:${e.event}:${e.status}:${e.recipients}`).sort(),
        ['MU:put_floor_break:queued:1', 'NVDA:call_wall_break:queued:2']);
    assert.equal(r2.errors.length, 0, r2.errors.join());
    assert.equal(sender.pushes.reduce((a, p) => a + p.tokens.length, 0), 3, 'D1(NVDA·MU) 2통 + D3(NVDA) 1통 — D2 는 콜월 돌파를 켜지 않았다');
    assert.equal(r2.sent, 3);
});

t('기기별 문구·플랫폼 규칙: 언어·collapse id=티커·딥링크·보관 15분 · 조용한 시간은 무음(passive), 아니면 Time Sensitive', async () => {
    const { sender } = await twoRuns(false);
    const d1nv = sender.pushes.find((p) => p.tokens.includes(TOK.d1) && p.collapseId === 'NVDA')!;
    assert.equal(d1nv.title, 'NVDA 콜월 250 돌파');
    assert.equal(d1nv.body, '다음 벽 260 · 풋콜 0.97 · 현재 250.70 · 5분 종가 기준');
    assert.equal(d1nv.silent, true);
    assert.equal(d1nv.level, 'passive');
    assert.equal(d1nv.ttlSec, 900);
    assert.deepEqual(d1nv.data, { type: 'watchlist_alert', ticker: 'NVDA', event: 'call_wall_break', path: '/app-view/flow?t=NVDA&from=alert' });
    const d1mu = sender.pushes.find((p) => p.tokens.includes(TOK.d1) && p.collapseId === 'MU')!;
    assert.equal(d1mu.title, 'MU 풋플로어 900 이탈');
    const d3 = sender.pushes.find((p) => p.tokens.includes(TOK.d3))!;
    assert.equal(d3.title, 'NVDA コールウォール250を上抜け');
    assert.equal(d3.silent, false);
    assert.equal(d3.level, 'time-sensitive');
    assert.equal(d3.platform, 'ios');
    assert.ok(!sender.pushes.some((p) => p.tokens.includes(TOK.d2)));
});

t('중복 억제: 같은 종목·같은 이벤트·같은 세션은 한 번 — 다음 벽(260)을 또 넘어도 오늘은 보내지 않는다', async () => {
    const { store, provider, sender } = await twoRuns(false);
    const before = sender.pushes.length;
    provider.bars = { NVDA: bar('10:15', 250.9), MU: bar('10:15', 897) };
    await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '10:15') + 30_000 }, { dryRun: false });
    provider.bars = { NVDA: bar('10:20', 261), MU: bar('10:20', 896) };
    provider.levels.NVDA = { levels: nvda({ callWall: 270, spot: 261, asOf: et(WED, '10:20') }), expirations: [FRI] };
    const r = await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '10:20') + 30_000 }, { dryRun: false });
    const cw = r.events.filter((e) => e.event === 'call_wall_break');
    assert.deepEqual(cw.map((e) => e.status), ['already_sent']);
    assert.equal(sender.pushes.length, before);
});

t('기기 하루 상한: 상한 1인 D3 는 두 번째 사건(감마플립)을 받지 않는다 — daily_cap 으로 보고', async () => {
    const { store, provider, sender } = await twoRuns(false);
    // 10:15 감마플립 245 를 아래로(250.9 → 무장 above 245 → 244.3 확정)
    provider.bars = { NVDA: bar('10:15', 246.5), MU: bar('10:15', 897) };
    provider.levels.NVDA = { levels: nvda({ spot: 246.5, asOf: et(WED, '10:15') }), expirations: [FRI] };
    await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '10:15') + 30_000 }, { dryRun: false });
    provider.bars = { NVDA: bar('10:20', 244.3), MU: bar('10:20', 897) };
    const r = await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '10:20') + 30_000 }, { dryRun: false });
    assert.deepEqual(r.events.map((e) => `${e.event}:${e.status}`), ['gamma_flip_cross:queued']);
    const statuses = r.notifications.map((x) => `${x.locale}:${x.status}`).sort();
    assert.deepEqual(statuses, ['ja:daily_cap', 'ko:queued']);
    assert.equal(await store.sentCount(deviceHashOf(TOK.d3), WED), 1);
    assert.equal(await store.sentCount(deviceHashOf(TOK.d1), WED), 3);
});

t('드라이런: 발송 0 · 중복 억제·상한·스냅샷·표식 쓰기 0 · «would_send» 목록만 돌려준다', async () => {
    const { store, sender, r2 } = await twoRuns(true);
    assert.equal(sender.pushes.length, 0);
    assert.equal(r2.sent, 0);
    assert.equal(store.sent.size, 0, '중복 억제 기록을 남기지 않는다');
    assert.equal(await store.sentCount(deviceHashOf(TOK.d1), WED), 0);
    assert.deepEqual(r2.notifications.map((x) => x.status).sort(), ['would_send', 'would_send', 'would_send']);
    assert.ok(r2.notifications.every((x) => x.device.length === 8 && !JSON.stringify(x).includes(TOK.d1)), '보고에 원문 토큰이 없다');
    const snaps = await store.loadSnapshots(['NVDA']);
    assert.equal(snaps.NVDA.bar?.close, 248.6, '드라이런은 스냅샷을 저장하지 않는다(다음 실제 실행의 비교 기준을 바꾸지 않는다)');
});

t('3종목 이상이 한 번에 나면 요약 한 통(wl-summary · 대시보드 딥링크) — 고래 아침 단계', async () => {
    const store = new MemoryAlertStore();
    const ts = ['AAA', 'BBB', 'CCC', 'DDD'];
    await store.putSubscription(device(TOK.d1, { tickers: ts.map((x) => ({ t: x, events: ['whale_new' as const] })) }), et(WED, '08:00'));
    const provider = new FakeProvider();
    for (const x of ts) provider.whales[x] = { date: TUE, contracts: [{ type: 'call', strike: 100, expiration: FRI, oiChange: 20000, notional: 200_000_000 }] };
    const sender = new FakeSender();
    const r = await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '09:05') }, { dryRun: false });
    assert.equal(r.events.length, 4);
    assert.equal(sender.pushes.length, 1);
    const p = sender.pushes[0];
    assert.equal(p.collapseId, 'wl-summary');
    assert.equal(p.title, '내 종목 알림 4건');
    assert.equal(p.data.path, '/app-view/dash?from=alert');
    assert.equal(p.level, 'active');
    assert.equal(p.ttlSec, 7200);
    assert.equal(await store.getMarker(`whale:${TUE}`) !== null, true, '신선한 자료로 돈 단계는 완료 표식');
    const again = await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '09:10') }, { dryRun: false });
    assert.equal(again.skipped, 'phases_done');
});

t('PRO 만료가 지난 기기: RevenueCat 재확인 — 비활성이면 사본 삭제·발송 0, 활성이면 만료 갱신 후 발송', async () => {
    for (const active of [false, true]) {
        const store = new MemoryAlertStore();
        await store.putSubscription(device(TOK.d1, { tickers: [{ t: 'MU', events: ['whale_new'] }], proUntil: et(WED, '08:00') }), et(WED, '07:00'));
        const provider = new FakeProvider();
        provider.whales.MU = { date: TUE, contracts: [{ type: 'put', strike: 600, expiration: FRI, oiChange: 3477, notional: 208_620_000 }] };
        const sender = new FakeSender();
        let asked = 0;
        const verify: ProVerifier = async () => { asked++; return active ? { active: true, expiresAtMs: FAR } : { active: false, expiresAtMs: null }; };
        const r = await runWatchlistAlerts({ store, provider, sender, verifyPro: verify, now: () => et(WED, '09:05') }, { dryRun: false });
        assert.equal(asked, 1);
        if (active) {
            assert.equal(sender.pushes.length, 1);
            assert.equal((await store.getDevice(deviceHashOf(TOK.d1)))!.proUntil, FAR);
        } else {
            assert.equal(sender.pushes.length, 0);
            assert.equal(r.notifications[0].status, 'pro_expired');
            assert.equal(await store.getDevice(deviceHashOf(TOK.d1)), null);
        }
    }
});

t('발송기가 «영구히 죽은 토큰»을 돌려주면 그 기기 사본을 지운다', async () => {
    const store = new MemoryAlertStore();
    await store.putSubscription(device(TOK.d1, { tickers: [{ t: 'MU', events: ['whale_new'] }] }), et(WED, '07:00'));
    const provider = new FakeProvider();
    provider.whales.MU = { date: TUE, contracts: [{ type: 'put', strike: 600, expiration: FRI, oiChange: 3477, notional: 208_620_000 }] };
    const sender = new FakeSender();
    sender.dead = [TOK.d1];
    const r = await runWatchlistAlerts({ store, provider, sender, verifyPro: activePro, now: () => et(WED, '09:05') }, { dryRun: false });
    assert.equal(r.pruned, 1);
    assert.equal(await store.getDevice(deviceHashOf(TOK.d1)), null);
});

t('장외 비중 단계: FINRA 자료가 아직 어제 것이면 발송도 완료 표식도 없다(다음 실행이 다시 본다)', async () => {
    const store = new MemoryAlertStore();
    await store.putSubscription(device(TOK.d1, { tickers: [{ t: 'TSLA', events: ['darkpool_spike'] }] }), et(WED, '07:00'));
    const provider = new FakeProvider();
    provider.dark.TSLA = { date: TUE, pct: 58, series: { dates: [TUE], pct: [44] } };
    const r = await runWatchlistAlerts({ store, provider, sender: new FakeSender(), verifyPro: activePro, now: () => et(WED, '18:05') }, { dryRun: false });
    assert.equal(r.events.length, 0);
    assert.equal(await store.getMarker(`darkpool:${WED}`), null);
});

t('수동 점검(phases·tickers 지정)은 시간표·완료 표식을 보지 않고 그 단계만 돈다', async () => {
    const store = new MemoryAlertStore();
    await seed(store);
    const provider = new FakeProvider();
    provider.bars = { NVDA: bar('10:05', 248.6) };
    provider.levels = { NVDA: { levels: nvda(), expirations: [FRI] } };
    const r = await runWatchlistAlerts({ store, provider, sender: null, now: () => et(WED, '10:05') + 30_000 },
        { dryRun: true, phases: { intraday: true }, tickers: ['nvda'], verbose: true });
    assert.equal(r.tickers, 1);
    assert.deepEqual(r.phases, { intraday: true, maxPain: false, darkPool: false, whale: false, earnings: false });
    assert.ok(provider.calls.some((c) => c === 'bars:NVDA'));
    assert.ok(!provider.calls.includes('whales'));
});

(async () => {
    for (const [name, fn] of tests) {
        await fn();
        n++;
        console.log(`  ✓ ${name}`);
    }
    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
