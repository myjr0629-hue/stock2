/**
 * 알림 사본 저장소 — DynamoDB 구현(운영).
 *
 * 표 하나(기본 이름 signum-watchlist-alerts · 요청당 과금 · TTL 속성 `ttl`) — 만드는 스크립트: scripts/alerts/create-table.sh
 * (⚠️ 대표 승인 전에는 실행하지 않는다. 표가 없으면 이 저장소의 모든 호출이 ResourceNotFoundException 으로 실패하고,
 *  라우트는 503 store_unavailable 을, 크론은 오류 보고를 돌려준다 — 조용히 «성공»하지 않는다.)
 *
 *  pk                               sk          내용
 *  ───────────────────────────────  ──────────  ───────────────────────────────────────────────
 *  D#<deviceHash>                   META        기기 사본(원문 토큰·RC 사용자 ID·종목·설정·PRO 만료) — 삭제·재확인용 역방향 항목
 *  T#<TICKER>                       D#<hash>    종목 → 기기 역색인(발송에 필요한 것 비정규화: 토큰·플랫폼·언어·이벤트·조용한 시간·상한·PRO 만료)
 *  IDX                              T#<TICKER>  구독 종목 색인(크론이 Query 한 번으로 «감시할 종목»을 얻는다)
 *  S#<TICKER>#<event>#<sessionKey>  S           중복 억제(조건부 쓰기) — TTL 4일
 *  C#<deviceHash>#<ET 날짜>          C           기기별 하루 발송 수(원자적 ADD + 상한 조건) — TTL 3일
 *  P#<TICKER>                       SNAP        직전 탐지 스냅샷(5분 종가·레벨·무장 상태·맥스페인 분포) — TTL 5일
 *  M#<key>                          M           단계 완료 표식(다크풀·고래·실적·맥스페인 회차) — TTL 3일
 *  R#<bucket>#<window>              R           요청 수 제한 카운터 — TTL 창×2
 */
import {
    BatchGetCommand, BatchWriteCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand,
    type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { getDynamoClient } from '@/lib/aws/dynamoClient';
import {
    compactSnapshot, recipientOf, RESYNC_SKIP_MS, sameSubscription,
    type AlertStore, type PutResult,
} from './store';
import { SUBSCRIPTION_TTL_DAYS, type AlertEventId, type StoredDevice, type TickerRecipient, type TickerSnapshot } from './types';

export const DEFAULT_ALERTS_TABLE = 'signum-watchlist-alerts';

const DAY_SEC = 86400;
const SENT_TTL_SEC = 4 * DAY_SEC;
const COUNT_TTL_SEC = 3 * DAY_SEC;
const SNAP_TTL_SEC = 5 * DAY_SEC;

const sec = (ms: number) => Math.floor(ms / 1000);
const isConditionalFail = (e: any) => e?.name === 'ConditionalCheckFailedException';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Key = { pk: string; sk: string };

export class DynamoAlertStore implements AlertStore {
    constructor(private readonly db: DynamoDBDocumentClient, private readonly table: string) { }

    // ── 내부 도구 ──────────────────────────────────────────────────
    private async batchWrite(reqs: Array<Record<string, any>>): Promise<void> {
        for (let i = 0; i < reqs.length; i += 25) {
            let pending = reqs.slice(i, i + 25);
            for (let attempt = 0; pending.length && attempt < 6; attempt++) {
                if (attempt) await sleep(60 * 2 ** attempt);
                const res = await this.db.send(new BatchWriteCommand({ RequestItems: { [this.table]: pending as any } }));
                pending = ((res.UnprocessedItems?.[this.table] as any[]) ?? []);
            }
            // 남은 것을 조용히 버리지 않는다 — 호출자가 500 을 돌려 앱이 다시 보내게 한다
            if (pending.length) throw new Error(`batchWrite: ${pending.length} unprocessed after retries`);
        }
    }

    private async batchGet(keys: Key[]): Promise<Array<Record<string, any>>> {
        const out: Array<Record<string, any>> = [];
        for (let i = 0; i < keys.length; i += 100) {
            let pending: Key[] = keys.slice(i, i + 100);
            for (let attempt = 0; pending.length && attempt < 6; attempt++) {
                if (attempt) await sleep(60 * 2 ** attempt);
                const res = await this.db.send(new BatchGetCommand({ RequestItems: { [this.table]: { Keys: pending } } }));
                out.push(...((res.Responses?.[this.table] as any[]) ?? []));
                pending = ((res.UnprocessedKeys?.[this.table]?.Keys as Key[]) ?? []);
            }
            if (pending.length) throw new Error(`batchGet: ${pending.length} unprocessed after retries`);
        }
        return out;
    }

    private async queryAll(pk: string, opts: { limit?: number; projection?: string } = {}): Promise<Array<Record<string, any>>> {
        const items: Array<Record<string, any>> = [];
        let startKey: Record<string, any> | undefined;
        do {
            const res = await this.db.send(new QueryCommand({
                TableName: this.table,
                KeyConditionExpression: 'pk = :pk',
                ExpressionAttributeValues: { ':pk': pk },
                ...(opts.limit ? { Limit: opts.limit } : {}),
                ...(startKey ? { ExclusiveStartKey: startKey } : {}),
            }));
            items.push(...((res.Items as any[]) ?? []));
            startKey = res.LastEvaluatedKey;
            if (opts.limit && items.length >= opts.limit) break;
        } while (startKey);
        return items;
    }

    private devItem(dev: StoredDevice, ttl: number) {
        return {
            pk: `D#${dev.deviceHash}`, sk: 'META', kind: 'device',
            rc: dev.rcAppUserId, platform: dev.platform, token: dev.token, locale: dev.locale,
            tickers: dev.tickers, quiet: dev.quiet, dailyCap: dev.dailyCap,
            proUntil: dev.proUntil, updatedAt: dev.updatedAt, ttl,
        };
    }

    private static toDevice(hash: string, it: Record<string, any>): StoredDevice {
        return {
            deviceHash: hash,
            rcAppUserId: String(it.rc ?? ''),
            platform: it.platform,
            token: String(it.token ?? ''),
            locale: it.locale,
            tickers: Array.isArray(it.tickers) ? it.tickers : [],
            quiet: it.quiet ?? null,
            dailyCap: Number(it.dailyCap) || 1,
            proUntil: typeof it.proUntil === 'number' ? it.proUntil : null,
            updatedAt: Number(it.updatedAt) || 0,
        };
    }

    private subItem(ticker: string, r: TickerRecipient, ttl: number) {
        return {
            pk: `T#${ticker}`, sk: `D#${r.deviceHash}`, kind: 'sub',
            token: r.token, platform: r.platform, locale: r.locale, events: r.events,
            quiet: r.quiet, dailyCap: r.dailyCap, proUntil: r.proUntil, ttl,
        };
    }

    /** 제거된 종목에 구독자가 더는 없으면 색인에서 뺀다(없는 종목을 크론이 계속 조회하지 않게) */
    private async pruneIndex(tickers: string[]): Promise<void> {
        const empty: string[] = [];
        for (const t of tickers) {
            const rest = await this.queryAll(`T#${t}`, { limit: 1 });
            if (!rest.length) empty.push(t);
        }
        if (empty.length) await this.batchWrite(empty.map((t) => ({ DeleteRequest: { Key: { pk: 'IDX', sk: `T#${t}` } } })));
    }

    // ── 구독 사본 ──────────────────────────────────────────────────
    async getDevice(deviceHash: string): Promise<StoredDevice | null> {
        const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: `D#${deviceHash}`, sk: 'META' } }));
        return res.Item ? DynamoAlertStore.toDevice(deviceHash, res.Item) : null;
    }

    /**
     * 순서가 곧 안전장치다:
     *   ① 기기 사본(META)을 «새 목록 ∪ 지울 목록»으로 먼저 쓴다 — 중간에 실패해도 무엇을 지워야 하는지 남는다.
     *   ② 종목 항목·색인을 쓴다. ③ 빠진 종목 항목을 지운다. ④ META 를 새 목록으로 확정한다.
     */
    async putSubscription(dev: StoredDevice, nowMs: number): Promise<PutResult> {
        const prev = await this.getDevice(dev.deviceHash);
        const nextSet = new Set(dev.tickers.map((x) => x.t));
        const removed = prev ? prev.tickers.map((x) => x.t).filter((t) => !nextSet.has(t)) : [];
        if (prev && sameSubscription(prev, dev) && nowMs - prev.updatedAt < RESYNC_SKIP_MS) {
            return { written: false, removedTickers: [] };
        }
        const ttl = sec(nowMs) + SUBSCRIPTION_TTL_DAYS * DAY_SEC;

        if (removed.length && prev) {
            const union = [...dev.tickers, ...prev.tickers.filter((x) => removed.includes(x.t))];
            await this.db.send(new PutCommand({ TableName: this.table, Item: this.devItem({ ...dev, tickers: union }, ttl) }));
        }
        const puts: Array<Record<string, any>> = [];
        for (const tp of dev.tickers) {
            puts.push({ PutRequest: { Item: this.subItem(tp.t, recipientOf(dev, tp.events), ttl) } });
            puts.push({ PutRequest: { Item: { pk: 'IDX', sk: `T#${tp.t}`, kind: 'idx', ttl } } });
        }
        await this.batchWrite(puts);
        if (removed.length) {
            await this.batchWrite(removed.map((t) => ({ DeleteRequest: { Key: { pk: `T#${t}`, sk: `D#${dev.deviceHash}` } } })));
        }
        await this.db.send(new PutCommand({ TableName: this.table, Item: this.devItem(dev, ttl) }));
        if (removed.length) await this.pruneIndex(removed);
        return { written: true, removedTickers: removed };
    }

    /** 종목 항목을 먼저 지우고 META 를 마지막에 지운다 — 중간에 실패해도 다시 지울 근거(META)가 남는다. */
    async deleteSubscription(deviceHash: string): Promise<{ deleted: boolean }> {
        const prev = await this.getDevice(deviceHash);
        if (!prev) return { deleted: false };
        const tickers = prev.tickers.map((x) => x.t);
        if (tickers.length) {
            await this.batchWrite(tickers.map((t) => ({ DeleteRequest: { Key: { pk: `T#${t}`, sk: `D#${deviceHash}` } } })));
        }
        await this.db.send(new DeleteCommand({ TableName: this.table, Key: { pk: `D#${deviceHash}`, sk: 'META' } }));
        if (tickers.length) await this.pruneIndex(tickers);
        return { deleted: true };
    }

    async listSubscribedTickers(): Promise<string[]> {
        const items = await this.queryAll('IDX');
        const nowSec = sec(Date.now());
        // TTL 삭제는 최대 수일 늦을 수 있다 — 만료된 항목은 여기서 걸러낸다
        return items
            .filter((it) => !(typeof it.ttl === 'number' && it.ttl < nowSec))
            .map((it) => String(it.sk).replace(/^T#/, ''))
            .filter(Boolean)
            .sort();
    }

    async listTokensForTicker(ticker: string): Promise<TickerRecipient[]> {
        const items = await this.queryAll(`T#${ticker}`);
        const nowSec = sec(Date.now());
        return items
            .filter((it) => !(typeof it.ttl === 'number' && it.ttl < nowSec))
            .map((it) => ({
                deviceHash: String(it.sk).replace(/^D#/, ''),
                token: String(it.token ?? ''),
                platform: it.platform,
                locale: it.locale,
                events: Array.isArray(it.events) ? it.events : [],
                quiet: it.quiet ?? null,
                dailyCap: Number(it.dailyCap) || 1,
                proUntil: typeof it.proUntil === 'number' ? it.proUntil : null,
            }))
            .filter((r) => r.token && r.deviceHash);
    }

    async updateProUntil(deviceHash: string, proUntil: number | null, nowMs: number): Promise<void> {
        const dev = await this.getDevice(deviceHash);
        if (!dev) return;
        const next = { ...dev, proUntil, updatedAt: nowMs };
        const ttl = sec(nowMs) + SUBSCRIPTION_TTL_DAYS * DAY_SEC;
        await this.db.send(new PutCommand({ TableName: this.table, Item: this.devItem(next, ttl) }));
        await this.batchWrite(next.tickers.map((tp) => ({ PutRequest: { Item: this.subItem(tp.t, recipientOf(next, tp.events), ttl) } })));
    }

    // ── 발송 기록 ──────────────────────────────────────────────────
    async recordSent(ticker: string, event: AlertEventId, sessionKey: string, nowMs: number): Promise<boolean> {
        try {
            await this.db.send(new PutCommand({
                TableName: this.table,
                Item: { pk: `S#${ticker}#${event}#${sessionKey}`, sk: 'S', kind: 'sent', at: nowMs, ttl: sec(nowMs) + SENT_TTL_SEC },
                ConditionExpression: 'attribute_not_exists(pk)',
            }));
            return true;
        } catch (e) {
            if (isConditionalFail(e)) return false;
            throw e;
        }
    }

    async wasSent(ticker: string, event: AlertEventId, sessionKey: string): Promise<boolean> {
        const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: `S#${ticker}#${event}#${sessionKey}`, sk: 'S' } }));
        return !!res.Item;
    }

    async sentCount(deviceHash: string, day: string): Promise<number> {
        const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: `C#${deviceHash}#${day}`, sk: 'C' } }));
        return Number(res.Item?.n) || 0;
    }

    async tryConsumeDaily(deviceHash: string, day: string, cap: number, nowMs: number): Promise<boolean> {
        try {
            await this.db.send(new UpdateCommand({
                TableName: this.table,
                Key: { pk: `C#${deviceHash}#${day}`, sk: 'C' },
                UpdateExpression: 'ADD n :one SET #ttl = if_not_exists(#ttl, :ttl), kind = :k',
                ConditionExpression: 'attribute_not_exists(n) OR n < :cap',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':one': 1, ':cap': cap, ':ttl': sec(nowMs) + COUNT_TTL_SEC, ':k': 'count' },
            }));
            return true;
        } catch (e) {
            if (isConditionalFail(e)) return false;
            throw e;
        }
    }

    // ── 탐지 상태 ──────────────────────────────────────────────────
    async loadSnapshots(tickers: string[]): Promise<Record<string, TickerSnapshot>> {
        const uniq = Array.from(new Set(tickers));
        const items = await this.batchGet(uniq.map((t) => ({ pk: `P#${t}`, sk: 'SNAP' })));
        const out: Record<string, TickerSnapshot> = {};
        for (const it of items) {
            const t = String(it.pk).replace(/^P#/, '');
            if (it.snap && typeof it.snap === 'object') out[t] = it.snap as TickerSnapshot;
        }
        return out;
    }

    async saveSnapshots(snaps: TickerSnapshot[], nowMs: number): Promise<void> {
        const ttl = sec(nowMs) + SNAP_TTL_SEC;
        await this.batchWrite(snaps.map((s) => ({
            PutRequest: { Item: { pk: `P#${s.ticker}`, sk: 'SNAP', kind: 'snap', snap: compactSnapshot(s), ttl } },
        })));
    }

    async getMarker(key: string): Promise<string | null> {
        const res = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: `M#${key}`, sk: 'M' } }));
        return typeof res.Item?.v === 'string' ? res.Item.v : null;
    }

    async setMarker(key: string, value: string, ttlSec: number, nowMs: number): Promise<void> {
        await this.db.send(new PutCommand({
            TableName: this.table,
            Item: { pk: `M#${key}`, sk: 'M', kind: 'marker', v: value, ttl: sec(nowMs) + ttlSec },
        }));
    }

    // ── 남용 방지 ──────────────────────────────────────────────────
    async rateHit(bucket: string, windowSec: number, limit: number, nowMs: number): Promise<boolean> {
        const win = Math.floor(sec(nowMs) / windowSec);
        try {
            await this.db.send(new UpdateCommand({
                TableName: this.table,
                Key: { pk: `R#${bucket}#${win}`, sk: 'R' },
                UpdateExpression: 'ADD n :one SET #ttl = if_not_exists(#ttl, :ttl), kind = :k',
                ConditionExpression: 'attribute_not_exists(n) OR n < :limit',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':one': 1, ':limit': limit, ':ttl': sec(nowMs) + windowSec * 2, ':k': 'rate' },
            }));
            return true;
        } catch (e) {
            if (isConditionalFail(e)) return false;
            throw e;
        }
    }
}

/** 운영 저장소. AWS 자격 증명이 없으면 null(라우트는 503, 크론은 오류 보고). */
export function createDynamoAlertStore(): DynamoAlertStore | null {
    const db = getDynamoClient();
    if (!db) return null;
    const table = process.env.WATCHLIST_ALERTS_TABLE || DEFAULT_ALERTS_TABLE;
    return new DynamoAlertStore(db, table);
}
