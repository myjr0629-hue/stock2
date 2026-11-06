/**
 * AI 크레딧 경보 (2026-11-06) — 조용히 끊기지 않게. 기존 SNS 주제 signum-lambda-alerts(contact@ 구독)로 보낸다
 * (장마감 리포트 누락 경보 /api/cron/cross-sector-brief 와 같은 길).
 *
 *   · 운영(VERCEL_ENV=production)에서만 실제로 보낸다 — 시험·미리보기·로컬은 보내지 않는다(OPS_ALERT_FORCE=1 이면 보낸다).
 *   · 같은 경보는 주기마다 한 번 — 저장소 카운터(INCRBYFLOAT 결과가 1 일 때만) + 인스턴스 안 기억.
 *   · 발송 실패·저장소 장애는 AI 호출에 닿지 않는다(3초 상한, 예외 삼킴).
 */
import type { LlmStore } from '@/lib/ai/llmStore';

export type AlertSender = (subject: string, message: string) => Promise<boolean>;

const SEND_TIMEOUT_MS = 3_000;
let _topicArn: string | null = null;

export const alertsEnabled = (): boolean => process.env.OPS_ALERT_FORCE === '1' || process.env.VERCEL_ENV === 'production';

export const snsOpsAlert: AlertSender = async (subject, message) => {
    if (!alertsEnabled()) return false;
    const run = (async () => {
        const { SNSClient, ListTopicsCommand, PublishCommand } = await import('@aws-sdk/client-sns');
        const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        let topicArn = process.env.OPS_ALERT_TOPIC_ARN || _topicArn || '';
        let next: string | undefined;
        for (let page = 0; !topicArn && page < 10; page++) {
            const topics = await sns.send(new ListTopicsCommand(next ? { NextToken: next } : {}));
            topicArn = (topics.Topics || []).map((t) => t.TopicArn || '').find((a) => a.endsWith(':signum-lambda-alerts')) || '';
            next = topics.NextToken;
            if (!next) break;
        }
        if (!topicArn) throw new Error('alert topic not found');
        _topicArn = topicArn;
        await sns.send(new PublishCommand({ TopicArn: topicArn, Subject: subject.slice(0, 99), Message: message.slice(0, 4000) }));
        return true;
    })();
    try {
        return await Promise.race([run, new Promise<boolean>((r) => setTimeout(() => r(false), SEND_TIMEOUT_MS))]);
    } catch (e: any) {
        console.error('[CreditAlert] 경보 발송 실패:', e?.name || '', String(e?.message || e).slice(0, 160));
        return false;
    }
};

export const creditAlertKey = (cycleId: string, tag: string): string => `llm:credit:alert:${cycleId}:${tag}`;

/** key → 이 시각 전에는 이 인스턴스에서 다시 시도하지 않는다(보냈으면 무한대, 그 밖 10분 뒤) */
const _sent = new Map<string, number>();
const RETRY_AFTER_MS = 10 * 60_000;
/** 보내는 중 표시(잠금)의 시간 칸 — 칸마다 원자 증가(INCRBYFLOAT)가 1 인 인스턴스 하나만 보낸다 */
const LOCK_SLOT_MS = 5 * 60_000;
export function _resetCreditAlertForTest(): void { _sent.clear(); }

/**
 * 주기마다 한 번만 보낸다(보냈으면 true).
 *   «보냄» 표시(<key>:sent)는 발송이 성공한 뒤에만 쓴다 — 표시가 있으면 끝.
 *   잠금 = 5분 칸 키(<key>:lock:<칸>) 원자 증가가 1 인 인스턴스만 보낸다(동시에 둘이 보내지 않는다).
 *   바로 앞 칸 잠금이 남아 있으면(누가 보내는 중이거나 보내다 죽음) 기다린다 — 죽은 잠금은 길어야 10분 뒤 풀린다.
 *   보내다 실패하면 잠금을 지워 다른 인스턴스가 곧바로 다시 시도한다.
 *   저장소가 응답하지 않으면(증가 결과 null) 이 인스턴스에서 보낸다 — 누락보다 중복 한 통이 낫다(인스턴스 안 10분 간격).
 */
export async function alertOnce(store: LlmStore, key: string, send: AlertSender, subject: string, message: string, log?: (m: string) => void, now = Date.now()): Promise<boolean> {
    if ((_sent.get(key) ?? 0) > now) return false;
    _sent.set(key, now + RETRY_AFTER_MS);
    try {
        if (await store.get(`${key}:sent`)) { _sent.set(key, Number.POSITIVE_INFINITY); return false; }
        const slot = Math.floor(now / LOCK_SLOT_MS);
        if (await store.get(`${key}:lock:${slot - 1}`)) return false;
        const lockKey = `${key}:lock:${slot}`;
        const n = await store.incrByFloat(lockKey, 1, Math.ceil((2 * LOCK_SLOT_MS) / 1000));
        if (n != null && n !== 1) return false;
        log?.(`[CreditAlert] ${subject}`);
        const ok = await send(subject, message);
        if (ok) {
            _sent.set(key, Number.POSITIVE_INFINITY);
            await store.setEx(`${key}:sent`, String(now), 40 * 24 * 3600);
        } else if (n === 1) {
            await store.del(lockKey);
        }
        return ok;
    } catch { return false; }
}

/**
 * 경보를 AI 응답 경로 밖에서 — 호출을 기다리게 하지 않는다. 요청 문맥이 있으면 next/server after() 로 함수 수명 안에 끝내고,
 * 없으면(스크립트·시험) 그냥 흘려보낸다. 예외는 삼킨다.
 */
const _pending = new Set<Promise<unknown>>();
export function inBackground(task: () => Promise<unknown>): void {
    const p: Promise<unknown> = Promise.resolve().then(task).catch(() => undefined).finally(() => { _pending.delete(p); });
    _pending.add(p);
    import('next/server').then((m) => { try { (m as any).after?.(() => p); } catch { /* 요청 문맥 밖 */ } }).catch(() => undefined);
}
/** 시험용 — 흘려보낸 경보가 끝날 때까지 */
export async function _flushCreditAlertsForTest(): Promise<void> { while (_pending.size) await Promise.all([..._pending]); }
