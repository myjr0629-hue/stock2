/**
 * Bedrock 요청 «속도» 제한기 — 던지고 거절당하는 대신 기다렸다 성공한다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 왜 필요한가 (2026-09-10 실측 · AWS 케이스 178896794200630)
 *
 *   이 계정의 분당 요청 한도(L-CCA5DF70)는 **10** 이다. AWS 기본값의 0.1%.
 *   그런데 우리 코드엔 «동시성» 제한만 있고 «속도» 제한이 없었다.
 *   10 RPM 은 6초에 1건인데 동시 5건을 던지면 그냥 뚫고 나간다.
 *
 *   결과(CloudWatch 24시간): 성공 4,677 · **스로틀 35,488 (7.6배)**.
 *   즉 우리 요청의 88% 가 «실패»로 기록되고 있었다.
 *
 * [왜 이게 두 배로 중요한가]
 *   AWS 상담원 답변: 이 제한은 계정 «initial blocker» 이고
 *   **「사용 패턴이 쌓이면 풀린다」**. 그런데 우리 사용 패턴의 88% 가
 *   실패로 찍히고 있었다 — 한도가 낮아 실패가 쌓이고, 실패가 쌓여
 *   한도가 안 풀리는 고리다. 스로틀을 줄이는 것은 사용자 경험만이 아니라
 *   **한도를 푸는 조건 자체**에도 작용한다.
 *
 * ⚠️ [이 제한기가 «못» 하는 일 — 과신 금지]
 *   서버리스에선 라우트마다 인스턴스가 따로 뜬다. uc-warm 은 각 피드를 **HTTP 로**
 *   부르므로 그 12건은 서로 다른 프로세스에서 실행된다 — **이 제한기에는 보이지 않는다.**
 *   Redis 에 INCR 이 없어(getFromCache/setInCache 뿐) 분산 카운터도 못 만든다.
 *   따라서 이것은 «한 인스턴스 안에서 여러 번 부르는 경로»만 고르게 만든다.
 *   크론이 만드는 진짜 버스트는 **크론 쪽에서 요청 수를 줄여야** 없어진다
 *   (uc-warm 의 feed 3종을 신선도 인지형으로 바꾼 것이 그 조치다).
 *
 * [설계 원칙 — 절대 지금보다 나빠지지 않는다]
 *   라우트 예산이 60초이고 호출 자체가 50초 타임아웃이라 «무한정 기다리기»는
 *   위험하다. 그래서 **기다림에 상한**을 둔다. 상한을 넘길 순번이면
 *   기다리지 않고 그냥 보낸다(= 지금과 동일한 동작). 제한기가 고장 나도
 *   최악이 «현재 상태»다.
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 요청 사이 최소 간격.
 *
 * ★ 이것은 «한도 강제»가 아니라 «버스트 분산»이다. 분당 10건을 그대로 지키려면
 *   간격이 6초여야 하는데, 라우트 예산이 60초이고 생성 자체가 20~50초라
 *   6초씩 줄을 세우면 대기 중에 타임아웃이 난다. 그래서 «동시에 우르르»만
 *   흩어 놓는다: uc-warm 은 15분마다 12건 안팎을 한꺼번에 던지는데, 그 순간
 *   실사용자 요청까지 같이 스로틀된다. 그 겹침을 없애는 것이 목적이다.
 *
 *   ⚠️ 첫 설계에서 간격(7.5초)을 대기 상한(6초)보다 크게 잡아 **모든 호출이
 *      상한 초과로 그냥 통과**했다(제한기가 아무 일도 안 했다). 시험에서 잡혔다.
 *      → 간격 × 2 ≤ 상한 이어야 최소 두 건이 줄을 설 수 있다. 불변식으로 강제한다.
 */
const MIN_GAP_MS = Math.max(0, Number(process.env.BEDROCK_MIN_GAP_MS || 3000));
/** 이 시간보다 오래 기다려야 하면 기다리지 않고 그냥 보낸다(= 현재 동작) */
const MAX_WAIT_MS = Math.max(MIN_GAP_MS * 2, Number(process.env.BEDROCK_RATE_MAX_WAIT_MS || 6000));

/** 다음 슬롯이 열리는 시각. 프로세스 안에서만 공유된다(Redis 에 INCR 이 없다). */
let nextFreeAt = 0;

let paced = 0, overflowed = 0, waitedTotalMs = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface SlotResult {
    /** 실제로 기다린 밀리초 */
    waitedMs: number;
    /** 상한을 넘겨서 «기다리지 않고 보냄» 이면 true */
    overflowed: boolean;
}

/**
 * Bedrock 을 호출하기 «직전»에 부른다. 슬롯이 날 때까지 기다린다.
 * 기다림이 상한을 넘으면 예약하지 않고 즉시 통과시킨다.
 */
export async function reserveBedrockSlot(label = 'bedrock'): Promise<SlotResult> {
    const now = Date.now();
    const start = Math.max(now, nextFreeAt);
    const waitMs = start - now;

    if (waitMs > MAX_WAIT_MS) {
        // 줄이 너무 길다 — 예약하지 않고 그냥 보낸다(현재 동작과 동일).
        overflowed++;
        return { waitedMs: 0, overflowed: true };
    }

    // 내 슬롯을 «먼저» 확정하고(동시 진입 경합 방지) 그 다음에 기다린다.
    nextFreeAt = start + MIN_GAP_MS;
    if (waitMs > 0) {
        paced++;
        waitedTotalMs += waitMs;
        await sleep(waitMs);
    }
    return { waitedMs: waitMs, overflowed: false };
}

/** 운영 확인용 — 이 프로세스에서 얼마나 고르게 나갔는지 */
export function bedrockRateStats() {
    return {
        minGapMs: MIN_GAP_MS,
        maxWaitMs: MAX_WAIT_MS,
        pacedCalls: paced,
        overflowedCalls: overflowed,
        avgWaitMs: paced ? Math.round(waitedTotalMs / paced) : 0,
    };
}

/**
 * 세 곳(bedrockClient · undercurrent/shared · guardian/briefing)이 각자
 * BedrockRuntimeClient 를 만든다. SDK 기본 재시도는 3회인데 그 재시도가
 * 전부 «스로틀»로 따로 집계된다 — 논리적 호출 1건이 최대 3건으로 부풀었다.
 * 2회로 낮춰 증폭을 줄이되, 진짜 일시적 네트워크 오류는 한 번 더 시도한다.
 */
export const BEDROCK_CLIENT_RETRY = {
    maxAttempts: Math.max(1, Number(process.env.BEDROCK_SDK_MAX_ATTEMPTS || 2)),
} as const;
