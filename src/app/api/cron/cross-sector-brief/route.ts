// ==========================================================================
// /api/cron/cross-sector-brief — Cron handler
// Runs at 21:50 UTC (after all 10 sector snapshots are done)
// ★2026-11-06 22:20Z ?mode=retry — 그 거래일 서빙 가능한 리포트가 없을 때만 재생성 · 22:35Z ?mode=check — 그래도 없으면 SNS 경보
//   (11/5 대폭락 날 크레딧 원장 상한으로 현행 생성·서빙 탈락 → 화면이 전날 서사, 아무도 몰랐다 — lib/ai/crossBriefCron)
// ==========================================================================

import { NextResponse } from 'next/server';
import { publicBase } from '@/lib/net/publicBase';
import { getFromCache, setInCache } from '@/services/redisClient';
import { selectServedBrief, crossBriefKey } from '@/lib/ai/crossBriefServe';
import { crossBriefCronMode, decideCrossBriefCron, crossBriefMissingAlert } from '@/lib/ai/crossBriefCron';
import { etDateOf } from '@/lib/marketCalendar';

/** 운영 경보 — 기존 SNS 주제 signum-lambda-alerts(contact@ 구독 확인, scripts/setup-xs-alarms.js 와 같은 길). 날짜당 한 번. */
async function publishOpsAlert(dedupeKey: string, subject: string, message: string): Promise<'sent' | 'dup' | 'failed'> {
    try {
        if (await getFromCache<number>(dedupeKey)) return 'dup';
        const { SNSClient, ListTopicsCommand, PublishCommand } = await import('@aws-sdk/client-sns');
        const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        let topicArn = process.env.OPS_ALERT_TOPIC_ARN || '';
        if (!topicArn) {
            const topics = await sns.send(new ListTopicsCommand({}));
            topicArn = (topics.Topics || []).map(t => t.TopicArn || '').find(a => a.endsWith(':signum-lambda-alerts')) || '';
        }
        if (!topicArn) throw new Error('alert topic not found');
        await sns.send(new PublishCommand({ TopicArn: topicArn, Subject: subject.slice(0, 99), Message: message }));
        await setInCache(dedupeKey, Date.now(), 2 * 24 * 3600);
        return 'sent';
    } catch (e: any) {
        console.error('[Cron:CrossSectorBrief] 경보 발송 실패:', e?.name || '', e?.message || e);
        return 'failed';
    }
}

// 생성 본체(POST)를 기다린다 — 본체 한도 300초(2026-10-24 장마감 리포트 v2)와 같게
export const maxDuration = 300;

export async function GET(request: Request) {
    // [Security] CRON_SECRET 검증 — 다른 cron 라우트(uc-warm·snapshot·warm-news-digest 등)와 같은 방식(헤더 또는 ?secret=).
    //   Vercel 크론은 CRON_SECRET 이 있으면 Authorization: Bearer 를 자동으로 붙인다. 이 라우트는 Bedrock 생성·저장 덮어쓰기를
    //   하므로 공개 호출을 막는다(2026-10-04 — 그 전엔 누구나 부르면 AI 비용·덮어쓰기). 저장소 안 다른 호출자 없음(vercel.json 만).
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const authHeader = request.headers.get('authorization');
        const secretParam = new URL(request.url).searchParams.get('secret');
        if (authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }
    const startTime = Date.now();

    const mode = crossBriefCronMode(new URL(request.url).searchParams.get('mode'));
    if (!mode) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    if (mode !== 'run') {
        try {
            const sessionDate = etDateOf(Date.now());
            const picked = await selectServedBrief((key) => getFromCache<any>(key), [sessionDate], (msg) => console.warn(`[Cron:CrossSectorBrief] ${msg}`));
            const decision = decideCrossBriefCron(mode, sessionDate, !!picked);
            if (decision.action === 'skip') {
                return NextResponse.json({ success: true, mode, sessionDate, skipped: decision.why, ...(picked ? { source: picked.source } : {}) });
            }
            if (decision.action === 'alert') {
                const stored = await getFromCache<any>(crossBriefKey('v4', sessionDate));
                const { subject, message } = crossBriefMissingAlert(sessionDate, stored);
                console.error(`[Cron:CrossSectorBrief] ❌ ${subject}\n${message}`);
                const alert = await publishOpsAlert(`cross-brief:alerted:${sessionDate}`, subject, message);
                return NextResponse.json({ success: false, mode, sessionDate, missing: true, alert }, { status: 503 });
            }
            console.warn(`[Cron:CrossSectorBrief] ${sessionDate} 서빙 가능한 리포트 없음 — 재생성(mode=retry)`);
        } catch (e: any) {
            console.error('[Cron:CrossSectorBrief] mode 판정 실패:', e?.message || e);
            if (mode === 'check') return NextResponse.json({ error: e?.message || 'check failed' }, { status: 500 });
            // retry 는 판정이 실패해도 생성으로 간다(최악 = 정시 생성과 같은 일 한 번 더)
        }
    }

    try {
        const baseUrl = publicBase(request.url.split('/api/')[0]);
        const bypassHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
            bypassHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
        }
        // 생성 본체(POST /api/intel/cross-sector-brief)도 같은 비밀값을 요구한다(2026-10-04) — 그대로 넘긴다
        if (cronSecret) bypassHeaders['Authorization'] = `Bearer ${cronSecret}`;

        console.log('[Cron:CrossSectorBrief] Triggering POST /api/intel/cross-sector-brief...');

        const res = await fetch(`${baseUrl}/api/intel/cross-sector-brief`, {
            method: 'POST',
            headers: bypassHeaders,
            cache: 'no-store',
        });

        const elapsed = Date.now() - startTime;

        // Safely parse response — handle HTML error pages (504, Vercel protection)
        let data: any;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const text = await res.text();
            console.error(`[Cron:CrossSectorBrief] Non-JSON response (${res.status}):`, text.substring(0, 200));
            data = { error: `POST returned ${res.status} (${text.substring(0, 100)})` };
        }

        console.log(`[Cron:CrossSectorBrief] ${res.ok ? '✅' : '❌'} Completed in ${elapsed}ms`);

        return NextResponse.json({
            success: res.ok,
            elapsed_ms: elapsed,
            ...data,
        }, { status: res.ok ? 200 : 500 });

    } catch (e: any) {
        console.error('[Cron:CrossSectorBrief] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
