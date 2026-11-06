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
/** 보내는 중 표시(임대)의 수명 — 보내던 인스턴스가 죽거나 응답이 사라져도 이 시간 뒤엔 다른 인스턴스가 보낸다 */
const LEASE_MS = 5 * 60_000;
export function _resetCreditAlertForTest(): void { _sent.clear(); }

/**
 * 주기마다 한 번만 보낸다(보냈으면 true).
 *   «보냄» 표시(<key>:sent)는 발송이 성공한 뒤에만 쓴다 — 표시가 있으면 끝.
 *   보내는 중 임대(<key>:lease = 시각·토큰)를 쓰고 다시 읽어 내 토큰일 때만 보낸다. 임대는 5분 뒤 스스로 풀린다.
 *   저장소가 응답하지 않으면(읽기 null) 이 인스턴스에서 보낸다 — 중복 메일 한 통이 누락보다 낫다(인스턴스 안 10분 간격).
 */
export async function alertOnce(store: LlmStore, key: string, send: AlertSender, subject: string, message: string, log?: (m: string) => void, now = Date.now()): Promise<boolean> {
    if ((_sent.get(key) ?? 0) > now) return false;
    _sent.set(key, now + RETRY_AFTER_MS);
    try {
        if (await store.get(`${key}:sent`)) { _sent.set(key, Number.POSITIVE_INFINITY); return false; }
        const leaseRaw = await store.get(`${key}:lease`);
        const leaseAt = Number(String(leaseRaw ?? '').split(':')[0]);
        if (leaseRaw && Number.isFinite(leaseAt) && now - leaseAt < LEASE_MS) return false;   // 다른 인스턴스가 보내는 중 — 10분 뒤 다시 본다
        const token = `${now}:${Math.random().toString(36).slice(2, 10)}`;
        await store.setEx(`${key}:lease`, token, Math.ceil(LEASE_MS / 1000));
        const back = await store.get(`${key}:lease`);
        if (back != null && back !== token) return false;   // 같은 순간 다른 인스턴스가 이겼다
        log?.(`[CreditAlert] ${subject}`);
        const ok = await send(subject, message);
        if (ok) {
            _sent.set(key, Number.POSITIVE_INFINITY);
            await store.setEx(`${key}:sent`, String(now), 40 * 24 * 3600);
        } else {
            await store.del(`${key}:lease`);   // 못 보냈다 — 다른 인스턴스가 바로 다시 시도할 수 있게
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
