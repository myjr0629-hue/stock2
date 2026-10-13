/**
 * GET  /api/admin/intel-fast-meter?hours=24            시간대별(UTC) 흐름 이름별 Intrinio 호출·429·갱신 횟수 + 배경 갱신 관문의 판단(건너뜀 사유)
 *      /api/admin/intel-fast-meter?minutes=60          분 단위(오래된 순, 값이 있는 분만)
 *      라벨 읽는 법: `intel:app-warm`(앱 예열 크론) · `intel:fast-all`(목록 갱신) · `intel:signum-warm` · `intel:user`(사람 요청 안 계산) · `…/after`(응답 뒤 갱신) · `gov`(관문 판단·벤더 1콜 점검) · `other`(그 밖 — 429·오류만)
 *      ok/r429/err = 벤더에 실제 나간 호출(캐시 적중·합치기 제외) · runs = 섹터 갱신 횟수 → 갱신 한 번당 호출 = (ok+r429+err)/runs
 * POST /api/admin/intel-fast-meter {action:'off', on:true|false}   끄는 스위치 — on:true 면 관문 전부 «예전 그대로»(키 intel-fast-429:off, 30초 안에 전 인스턴스), on:false 면 해제
 * 인증: Authorization: Bearer <CRON_SECRET> (lib/ai/adminAuth). 응답에 키 값은 없다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { readCallHours, readCallMinuteSeries } from '@/lib/intrinioCallMeter';
import { GOV_OFF_KEY, PROBE_KEY, governorOff, resetGovernorSwitchMemo } from '@/lib/intelFastGovernor';
import { upstashMeterStore, userRecent429 } from '@/lib/intrinioMeter';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const q = new URL(req.url).searchParams;
    const now = Date.now();
    resetGovernorSwitchMemo();
    const [off, recent, probeRaw] = await Promise.all([
        governorOff().catch(() => false),
        userRecent429(now).catch(() => ({ state: 'unknown', lastAt: null })),
        upstashMeterStore.get(PROBE_KEY).catch(() => null),
    ]);
    const base = { success: true, now, governorOff: off, user429Recent: recent, probe: probeRaw ? safeJson(probeRaw) : null };
    const minutes = Number(q.get('minutes'));
    if (Number.isFinite(minutes) && minutes > 0) return NextResponse.json({ ...base, minutes: await readCallMinuteSeries(now, minutes) });
    const hours = Math.min(168, Math.max(1, Number(q.get('hours')) || 24));
    return NextResponse.json({ ...base, hours: await readCallHours(now, hours) });
}

export async function POST(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (String(body?.action || '') === 'off') {
        if (body.on) await upstashMeterStore.setEx(GOV_OFF_KEY, '1', 30 * 24 * 3600); else await upstashMeterStore.del(GOV_OFF_KEY);
        resetGovernorSwitchMemo();
        return NextResponse.json({ ok: true, governorOff: !!body.on, note: '다른 인스턴스는 30초 안에 반영' });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }
