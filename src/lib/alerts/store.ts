/**
 * 알림 사본 저장소 — 인터페이스 + 메모리 구현(시험용) + 기기 토큰 해시.
 * 운영 구현(DynamoDB)은 store-dynamo.ts — 이 파일은 AWS SDK 를 부르지 않는다(시험이 가볍게 불러 쓴다).
 *
 * 개인정보 원칙(기획 §1):
 *   - 키에는 토큰 «해시»만 쓴다(deviceHash). 원문 토큰은 값(발송에 필요)에만 둔다.
 *   - 알림을 끄면 즉시 지운다(deleteSubscription). 동기화가 30일 끊긴 기기는 TTL 이 지운다.
 */
import crypto from 'node:crypto';
import type {
    AlertEventId, StoredDevice, TickerRecipient, TickerSnapshot,
} from './types';

/** 토큰 → 키용 해시(128비트). 접두어는 «이 용도의 해시»임을 고정한다(다른 곳의 sha256(token) 과 섞이지 않게). */
export function deviceHashOf(token: string): string {
    return crypto.createHash('sha256').update('sg-watchlist-alerts:v1:' + token).digest('hex').slice(0, 32);
}

export interface PutResult {
    /** false = 같은 내용이 최근(20시간 안)에 이미 저장돼 있어 쓰지 않았다 */
    written: boolean;
    removedTickers: string[];
}

export interface AlertStore {
    // ── 구독 사본 ──────────────────────────────────────────────
    getDevice(deviceHash: string): Promise<StoredDevice | null>;
    putSubscription(dev: StoredDevice, nowMs: number): Promise<PutResult>;
    deleteSubscription(deviceHash: string): Promise<{ deleted: boolean }>;
    /** 구독자가 한 명이라도 있는(있었던) 종목 — 색인이 넉넉할 수는 있어도 모자라지는 않다 */
    listSubscribedTickers(): Promise<string[]>;
    listTokensForTicker(ticker: string): Promise<TickerRecipient[]>;
    updateProUntil(deviceHash: string, proUntil: number | null, nowMs: number): Promise<void>;
    // ── 발송 기록 ──────────────────────────────────────────────
    /** 종목·이벤트·회차 첫 기록이면 true(조건부 쓰기 — 동시 실행에도 한 번만 이긴다) */
    recordSent(ticker: string, event: AlertEventId, sessionKey: string, nowMs: number): Promise<boolean>;
    wasSent(ticker: string, event: AlertEventId, sessionKey: string): Promise<boolean>;
    sentCount(deviceHash: string, day: string): Promise<number>;
    /** 하루 상한 안이면 1 올리고 true, 이미 상한이면 false(원자적) */
    tryConsumeDaily(deviceHash: string, day: string, cap: number, nowMs: number): Promise<boolean>;
    // ── 탐지 상태 ──────────────────────────────────────────────
    loadSnapshots(tickers: string[]): Promise<Record<string, TickerSnapshot>>;
    saveSnapshots(snaps: TickerSnapshot[], nowMs: number): Promise<void>;
    getMarker(key: string): Promise<string | null>;
    setMarker(key: string, value: string, ttlSec: number, nowMs: number): Promise<void>;
    // ── 남용 방지 ──────────────────────────────────────────────
    /** 창(windowSec) 안 요청 수가 limit 미만이면 세고 true */
    rateHit(bucket: string, windowSec: number, limit: number, nowMs: number): Promise<boolean>;
}

/** 저장본에서 뺄 것 — 단계별 입력(장외 이력·고래 목록·실적)은 그 실행에서만 쓴다(항목 크기·쓰기 비용 절감). */
export function compactSnapshot(s: TickerSnapshot): TickerSnapshot {
    const out: TickerSnapshot = { ...s };
    delete out.darkPool;
    delete out.whale;
    delete out.earnings;
    return out;
}

/** 두 기기 사본이 «발송에 영향 있는 내용»까지 같은가 */
export function sameSubscription(a: StoredDevice, b: StoredDevice): boolean {
    return a.token === b.token
        && a.platform === b.platform
        && a.locale === b.locale
        && a.rcAppUserId === b.rcAppUserId
        && a.dailyCap === b.dailyCap
        && a.proUntil === b.proUntil
        && JSON.stringify(a.quiet) === JSON.stringify(b.quiet)
        && JSON.stringify(a.tickers) === JSON.stringify(b.tickers);
}

/**
 * 같은 내용이면 이 시간 안에는 다시 쓰지 않는다(앱이 열릴 때마다 보내도 쓰기 비용이 늘지 않게).
 * 사본 TTL 은 30일이라 3일마다 한 번 다시 써도 넉넉하다.
 */
export const RESYNC_SKIP_MS = 3 * 86400 * 1000;

export function recipientOf(dev: StoredDevice, events: AlertEventId[]): TickerRecipient {
    return {
        deviceHash: dev.deviceHash,
        token: dev.token,
        platform: dev.platform,
        locale: dev.locale,
        events,
        quiet: dev.quiet,
        dailyCap: dev.dailyCap,
        proUntil: dev.proUntil,
    };
}

// ═══════════════════════════════════════════════════════════════════
// 메모리 구현 — 시험·로컬 전용. DynamoDB 구현과 같은 의미(조건부 쓰기·상한)를 지킨다.
// ═══════════════════════════════════════════════════════════════════
export class MemoryAlertStore implements AlertStore {
    devices = new Map<string, StoredDevice>();
    byTicker = new Map<string, Map<string, TickerRecipient>>();
    sent = new Set<string>();
    counts = new Map<string, number>();
    snaps = new Map<string, TickerSnapshot>();
    markers = new Map<string, string>();
    rate = new Map<string, number>();
    /** 쓰기 횟수(시험에서 «다시 쓰지 않았다»를 확인) */
    writes = 0;

    async getDevice(h: string) {
        const d = this.devices.get(h);
        return d ? JSON.parse(JSON.stringify(d)) as StoredDevice : null;
    }

    async putSubscription(dev: StoredDevice, nowMs: number): Promise<PutResult> {
        const prev = this.devices.get(dev.deviceHash) ?? null;
        const nextSet = new Set(dev.tickers.map((x) => x.t));
        const removed = prev ? prev.tickers.map((x) => x.t).filter((t) => !nextSet.has(t)) : [];
        if (prev && sameSubscription(prev, dev) && nowMs - prev.updatedAt < RESYNC_SKIP_MS) {
            return { written: false, removedTickers: [] };
        }
        this.writes++;
        this.devices.set(dev.deviceHash, JSON.parse(JSON.stringify(dev)));
        for (const tp of dev.tickers) {
            const m = this.byTicker.get(tp.t) ?? new Map<string, TickerRecipient>();
            m.set(dev.deviceHash, recipientOf(dev, tp.events));
            this.byTicker.set(tp.t, m);
        }
        for (const t of removed) {
            const m = this.byTicker.get(t);
            m?.delete(dev.deviceHash);
            if (m && m.size === 0) this.byTicker.delete(t);
        }
        return { written: true, removedTickers: removed };
    }

    async deleteSubscription(h: string) {
        const prev = this.devices.get(h);
        if (!prev) return { deleted: false };
        this.writes++;
        for (const tp of prev.tickers) {
            const m = this.byTicker.get(tp.t);
            m?.delete(h);
            if (m && m.size === 0) this.byTicker.delete(tp.t);
        }
        this.devices.delete(h);
        return { deleted: true };
    }

    async listSubscribedTickers() {
        return Array.from(this.byTicker.keys()).sort();
    }

    async listTokensForTicker(t: string) {
        return Array.from(this.byTicker.get(t)?.values() ?? []).map((r) => ({ ...r }));
    }

    async updateProUntil(h: string, proUntil: number | null, nowMs: number) {
        const d = this.devices.get(h);
        if (!d) return;
        d.proUntil = proUntil;
        d.updatedAt = nowMs;
        for (const tp of d.tickers) {
            const r = this.byTicker.get(tp.t)?.get(h);
            if (r) r.proUntil = proUntil;
        }
    }

    private sentKey(t: string, e: string, s: string) { return `${t}#${e}#${s}`; }

    async recordSent(t: string, e: AlertEventId, s: string) {
        const k = this.sentKey(t, e, s);
        if (this.sent.has(k)) return false;
        this.sent.add(k);
        return true;
    }

    async wasSent(t: string, e: AlertEventId, s: string) {
        return this.sent.has(this.sentKey(t, e, s));
    }

    async sentCount(h: string, day: string) {
        return this.counts.get(`${h}#${day}`) ?? 0;
    }

    async tryConsumeDaily(h: string, day: string, cap: number) {
        const k = `${h}#${day}`;
        const n = this.counts.get(k) ?? 0;
        if (n >= cap) return false;
        this.counts.set(k, n + 1);
        return true;
    }

    async loadSnapshots(tickers: string[]) {
        const out: Record<string, TickerSnapshot> = {};
        for (const t of tickers) {
            const s = this.snaps.get(t);
            if (s) out[t] = JSON.parse(JSON.stringify(s));
        }
        return out;
    }

    async saveSnapshots(snaps: TickerSnapshot[]) {
        for (const s of snaps) this.snaps.set(s.ticker, JSON.parse(JSON.stringify(compactSnapshot(s))));
    }

    async getMarker(key: string) { return this.markers.get(key) ?? null; }
    async setMarker(key: string, value: string) { this.markers.set(key, value); }

    async rateHit(bucket: string, windowSec: number, limit: number, nowMs: number) {
        const k = `${bucket}#${Math.floor(nowMs / 1000 / windowSec)}`;
        const n = this.rate.get(k) ?? 0;
        if (n >= limit) return false;
        this.rate.set(k, n + 1);
        return true;
    }
}
