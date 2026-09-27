import { NextRequest, NextResponse } from "next/server";
import { getStructureData, normalizeExpirationsForToday } from "@/services/structureService";

export const revalidate = 0; // Force dynamic (User Request)

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    const requestedExp = req.nextUrl.searchParams.get('exp');

    if (!t) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

    const result = await getStructureData(t, requestedExp);

    // ★ [2026-09-27] 여기 있던 `result.gex` 블록(GEX 이력 저장 + 맥스페인 35% 게이트)과 쓰이지 않던
    //   보조 함수·캐시(getNextTradingDayET·fetchMassiveWithRetry·structureCache)를 지웠다.
    //   getStructureData 는 `gex` 를 돌려준 적이 없어 한 번도 실행되지 않은 코드였다. 되살리지 않은 이유:
    //   · GEX_HISTORY(DynamoDB)는 수집 Lambda 가 이미 채운다 — 여기서 쓰면 정의가 다른 생산자가 하나 더 생긴다.
    //   · 맥스페인 게이트(sanitizeMaxPain)는 값을 쓰는 문(live/ticker·structure-build)이 각자 건다. 여기서 켜면
    //     이 API 의 maxPain 자체가 바뀐다(나스닥 전체 체인 대조 게이트가 검증하는 값) — 따로 검증할 동작 변경이다.
    // [2026-09-16] 응답 경계에서 한 번 더 — 어느 캐시 경로로 왔든 오늘(ET) 이전 만기는 나가지 않는다.
    return NextResponse.json(normalizeExpirationsForToday(result));
}
