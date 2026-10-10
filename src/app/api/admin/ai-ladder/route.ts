/**
 * GET  /api/admin/ai-ladder?hours=24[&purpose=FlowAI][&raw=1]   운영 상태 — 월 원장·잔여·허용 목록·브레이커 + 용도별 호출 지표(전환율·p50/p95·가드·토큰·비용)
 * POST /api/admin/ai-ladder  {action:'capture', on:boolean, hours?:1~120}  입력 캡처 켜기/끄기(품질 비교용 실제 프롬프트 보관, 4일 TTL · 켜 두는 시간 최대 120시간)
 *                            {action:'kill', purposes:['*'] | string[] | null}   킬 스위치 — 재배포 없이 즉시 «예전 그대로»(null 이면 해제)
 *                            {action:'breaker-reset'}                  서킷 브레이커 해제
 * 인증: Authorization: Bearer <CRON_SECRET> (lib/ai/adminAuth). 응답에 키 값은 없다(설정 여부만).
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { ladderStatus, LLM_KEYS, TRACKED_PURPOSES, hourId, type CallRecord } from '@/lib/ai/llmLadder';
import { upstashStore } from '@/lib/ai/llmStore';
import { summarizeCalls } from '@/lib/ai/llmStats';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(req.url);
    const hours = Math.min(72, Math.max(1, Number(url.searchParams.get('hours')) || 24));
    const only = url.searchParams.get('purpose');
    const sinceMs = Number(url.searchParams.get('since')) || 0;   // epoch ms — 이 시각 이후 기록만(전/후 구간 나누기)
    const untilMs = Number(url.searchParams.get('until')) || Date.now() + 1;
    const now = Date.now();
    const status = await ladderStatus();
    const records: CallRecord[] = [];
    for (let h = 0; h < hours; h++) {
        const lines = await upstashStore.lrange(LLM_KEYS.calls(hourId(now - h * 3600_000)), 0, -1);
        for (const l of lines) {
            try {
                const r = JSON.parse(l) as CallRecord;
                if (only && r.p !== only) continue;
                if (r.t < sinceMs || r.t >= untilMs) continue;
                records.push(r);
            } catch { /* 깨진 줄은 건너뛴다 */ }
        }
    }
    // raw=1 : 개별 호출 기록(최근 300건, 입력·출력 글은 없다) — 출력 길이·토큰 «분포» 를 볼 때(예: 인텔 분석의 종목당 토큰)
    const raw = url.searchParams.get('raw') === '1' ? records.sort((a, b) => b.t - a.t).slice(0, 300) : undefined;
    return NextResponse.json({ ok: true, status, tracked: TRACKED_PURPOSES, window: { hours, since: sinceMs || null, until: untilMs }, calls: records.length, purposes: summarizeCalls(records), ...(raw ? { raw } : {}) });
}

export async function POST(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (action === 'capture') {
        if (body.on) await upstashStore.setEx(LLM_KEYS.capOn, '1', Math.min(120, Math.max(1, Number(body.hours) || 12)) * 3600);
        else await upstashStore.del(LLM_KEYS.capOn);
        return NextResponse.json({ ok: true, capture: !!body.on });
    }
    if (action === 'kill') {
        const p = body.purposes;
        if (p == null) { await upstashStore.del(LLM_KEYS.off); return NextResponse.json({ ok: true, kill: null }); }
        const val = p === '*' || (Array.isArray(p) && p.includes('*')) ? '*' : JSON.stringify((Array.isArray(p) ? p : [p]).map(String));
        await upstashStore.setEx(LLM_KEYS.off, val, 30 * 24 * 3600);
        return NextResponse.json({ ok: true, kill: val });
    }
    if (action === 'breaker-reset') {
        for (const id of ['a55', 'b55i', 'b55m']) await upstashStore.del(LLM_KEYS.breaker(id));
        return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
