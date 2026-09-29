/**
 * PRO «내 종목» 알림 — 기기 사본 동기화(켜기·갱신) / 삭제(끄기).
 *
 * 앱(UI 브랜치 feat/app-watchlist, 플래그 NEXT_PUBLIC_WATCHLIST_ALERTS)이 부른다. 목록의 원본은 폰이고,
 * 서버는 «알림을 켠 PRO 기기»의 토큰·종목·이벤트 설정 사본만 DynamoDB 에 둔다(기획 §1·§6-2).
 * 처리 로직·계약은 src/lib/alerts/api.ts (시험: tests/watchlistAlerts.api.test.ts).
 *
 * 필요한 환경 변수(값은 저장소에 두지 않는다):
 *   REVENUECAT_SECRET_API_KEY — RevenueCat 서버 비밀키(PRO 판정). 없으면 POST 는 503 verify_unconfigured.
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION — 기존 DynamoDB 자격 증명(새 표 권한 필요).
 *   WATCHLIST_ALERTS_TABLE (선택) — 기본 signum-watchlist-alerts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { clientIpFrom, handleAlertsDelete, handleAlertsPost, type AlertsApiDeps } from '@/lib/alerts/api';
import { createRevenueCatVerifier } from '@/lib/alerts/revenuecat';
import { createDynamoAlertStore } from '@/lib/alerts/store-dynamo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 인스턴스당 하나 — PRO 판정 캐시(5분)를 요청 사이에 공유한다
const verifyPro = createRevenueCatVerifier();

function deps(): AlertsApiDeps {
    return {
        store: createDynamoAlertStore(),
        verifyPro,
        log: (msg, extra) => console.warn(msg, extra ?? ''),
    };
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
    const raw = await req.text().catch(() => '');
    const r = await handleAlertsPost(raw, clientIpFrom(req.headers), deps());
    return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
    const raw = await req.text().catch(() => '');
    const r = await handleAlertsDelete(raw, clientIpFrom(req.headers), deps());
    return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
