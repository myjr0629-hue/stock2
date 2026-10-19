// ============================================================================
// /api/cron/today-picks — «✦ AI 오늘 볼 것» 선별·생성 (2026-10-13, 브랜치 feat/today-picks)
//
// 하루 5번(vercel.json, UTC·평일): 08:30 (= 17:30 KST, EDT 04:30 / EST 03:30 개장 직전) · 12:00 · 13:00 (= 08:00 · 09:00 ET 서머타임 / 07:00 · 08:00 ET 표준시) · 21:55 · 23:05 (= 17:55 · 19:05 ET / 16:55 · 18:05 ET).
//   조기판 UTC 08:30~09:00 또는 ET 시계가 아침 창(07:30~10:30) 또는 마감 뒤 창(16:30~21:00) 안일 때만 돈다 — 서머타임이 바뀌어도 같은 크론이 맞는 시각에만 움직인다.
//   같은 날·같은 슬롯 자료(stamp)가 그대로면 다시 만들지 않는다(두 번째 크론은 대개 «fresh» 로 끝나 AI 호출 0).
// 선별 재료는 기존 캐시, 조기판·프리 아침판 배경은 기존 시세 API·선물·뉴스 캐시(services/todayPicksService 머리말).
//
// 인증: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=) — 다른 크론과 같다.
//   ?dry=1   저장·AI 호출 없이 고른 결과(항목·후보 수·자료 날짜)와 규칙 문장 문서를 돌려준다.
//   ?force=1 같은 자료여도 다시 만들고 시간 창을 무시한다(점검용).   ?noai=1  AI 없이 규칙 해설로만.
//   ?off=1 / ?off=0  끄기 스위치(레디스 todaypicks:off) 켜기/끄기 — 재배포 없이 카드·웹·푸시 줄이 모두 사라진다/돌아온다.
// ============================================================================
import { NextResponse } from 'next/server';
import { inWindow, runPicks, setOff, readPicks } from '@/services/todayPicksService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const { searchParams } = new URL(request.url);
    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const okHeader = request.headers.get('authorization') === `Bearer ${cronSecret}`;
        const okParam = searchParams.get('secret') === cronSecret;
        if (!okHeader && !okParam) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const offParam = searchParams.get('off');
    if (offParam === '1' || offParam === '0') {
        const ok = await setOff(offParam === '1');
        const r = await readPicks().catch(() => null);
        return NextResponse.json({ ok, off: r?.off ?? null, action: offParam === '1' ? 'off' : 'on' });
    }

    const now = Date.now();
    const force = searchParams.get('force') === '1';
    const dry = searchParams.get('dry') === '1';
    if (!force && !dry && !inWindow(now)) return NextResponse.json({ ok: true, skipped: true, reason: 'outside-window' });

    const r = await runPicks({ now, force, dry, noAi: searchParams.get('noai') === '1' });
    console.log(`[Cron/TodayPicks] status=${r.status} slot=${r.slot} items=${r.items?.length ?? 0} counts=${JSON.stringify(r.counts ?? {})} gen=${JSON.stringify(r.gen ?? {})} notes=${(r.notes || []).join(',')}${r.reason ? ` reason=${r.reason}` : ''}`);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
