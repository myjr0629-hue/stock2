/**
 * PRO «내 종목» 포지셔닝 알림 — 공용 타입·상수 (순수 모듈: 네트워크·Redis·SDK 없음)
 *
 * 기획 정본: .agent/product/WATCHLIST-PLAN-2026-09-29.md §1·§6·§7·§8
 *   - 목록의 원본은 «폰»이다. 서버는 알림을 켠 PRO 기기의 «기기 토큰 + 종목 + 이벤트 설정» 사본만 둔다.
 *   - 사본 저장소는 DynamoDB(Upstash 아님 — 비용 관리 대상).
 *   - 알림 문구는 숫자와 사실만(예측·권유 금지), 광고·구독 권유를 섞지 않는다(정보통신망법 제50조).
 *
 * 앱(UI 브랜치 feat/app-watchlist)과의 계약 — 필드 이름·이벤트 id 는 여기서 한 글자도 바꾸지 않는다.
 *   POST   /api/app/watchlist/alerts  { rcAppUserId, platform, deviceToken, locale, tickers:[{t, events}], quiet, dailyCap }
 *   DELETE /api/app/watchlist/alerts  { rcAppUserId, deviceToken }
 */

export const ALERT_EVENTS = [
    'call_wall_break',
    'put_floor_break',
    'gamma_flip_cross',
    'maxpain_divergence',
    'darkpool_spike',
    'whale_new',
    'earnings_d1',
] as const;
export type AlertEventId = (typeof ALERT_EVENTS)[number];

export const ALERT_LOCALES = ['ko', 'en', 'ja'] as const;
export type AlertLocale = (typeof ALERT_LOCALES)[number];

export const ALERT_PLATFORMS = ['ios', 'android'] as const;
export type AlertPlatform = (typeof ALERT_PLATFORMS)[number];

/** 조용한 시간 — 기기 현지 시각(tz) 기준 [start, end). start > end 면 자정을 넘는다(예: 23:00~07:00). */
export interface QuietHours {
    start: string; // 'HH:MM'
    end: string;   // 'HH:MM'
    tz: string;    // IANA, 예: 'Asia/Seoul'
}

export interface TickerPref {
    t: string;
    events: AlertEventId[];
}

/** 검증을 통과한 POST 본문(정규화됨: 티커 대문자·중복 병합·이벤트 중복 제거). */
export interface AlertSubscriptionInput {
    rcAppUserId: string;
    platform: AlertPlatform;
    deviceToken: string;
    locale: AlertLocale;
    tickers: TickerPref[];
    quiet: QuietHours | null;
    dailyCap: number;
}

/** 저장되는 기기 사본(역방향 항목) — 삭제·PRO 재확인에 쓴다. */
export interface StoredDevice {
    deviceHash: string;
    rcAppUserId: string;
    platform: AlertPlatform;
    token: string;
    locale: AlertLocale;
    tickers: TickerPref[];
    quiet: QuietHours | null;
    dailyCap: number;
    /** PRO 권한 만료 시각(ms). null = 만료 없음(평생·프로모션 무기한). 이 시각이 지나면 발송 전에 다시 확인한다. */
    proUntil: number | null;
    updatedAt: number;
}

/** 종목 → 기기 역색인 항목(발송 경로가 한 번의 Query 로 필요한 것을 다 받도록 비정규화). */
export interface TickerRecipient {
    deviceHash: string;
    token: string;
    platform: AlertPlatform;
    locale: AlertLocale;
    events: AlertEventId[];
    quiet: QuietHours | null;
    dailyCap: number;
    proUntil: number | null;
}

// ── 한도 ─────────────────────────────────────────────────────────────
export const MAX_ALERT_TICKERS = 50;
export const DAILY_CAP_MIN = 1;
export const DAILY_CAP_MAX = 50;
/** 마지막 동기화 뒤 이 기간이 지나면 DynamoDB TTL 이 사본을 지운다(앱이 하루 1회 이상 다시 보낸다). */
export const SUBSCRIPTION_TTL_DAYS = 30;
/** 요청 본문 상한(바이트) — 50종목 × 7이벤트여도 4KB 안쪽이다. */
export const MAX_BODY_BYTES = 16 * 1024;

// ── 탐지 스냅샷(종목별) ───────────────────────────────────────────────

/** 정규장 «완료된» 5분 봉 하나. endMs = 봉이 끝난 시각(시작 + 5분). */
export interface Bar5 {
    close: number;
    endMs: number;
    /** 이 봉이 속한 ET 거래일 'YYYY-MM-DD' */
    session: string;
}

/**
 * 구조 서비스(getStructureData — 단일 출처)가 만든 레벨 한 벌.
 * asOf·spot 은 신뢰 게이트의 기준이다 — «언제, 어떤 현물로» 계산된 값인가.
 */
export interface LevelSet {
    callWall: number | null;
    putFloor: number | null;
    gammaFlip: number | null;
    /** 감마플립 판정 종류 — EXACT(누적 GEX 부호 교차)만 교차 알림에 쓴다. NEAR_ZERO 는 근사값. */
    gammaFlipType: string | null;
    gexConfidence: string | null;
    maxPain: number | null;
    pcr: number | null;
    /** 계산에 쓴 현물(S0) */
    spot: number | null;
    /** 계산 시각(ms) */
    asOf: number | null;
    /** 레벨의 기준 만기 'YYYY-MM-DD' */
    expiration: string | null;
    /** 미결제약정 EOD 날짜 — 구조 서비스가 싣기 시작하면(㊲-2 병합 후) 판본 게이트가 켜진다. */
    chainDate: string | null;
}

export type CrossKind = 'callWall' | 'putFloor' | 'gammaFlip';

/**
 * 교차 대기(무장) 상태 — «이 레벨을 반대편에서 보고 있었다»는 기억.
 * 구조 서비스는 현물이 벽을 넘으면 다음 벽을 새로 고른다(콜월 = (S, 1.2S] 최대 OI).
 * 그래서 «사용자가 보던 레벨»을 여기에 붙들어 두고, 5분 종가가 여유폭을 넘을 때 발화한다.
 */
export interface Arm {
    level: number;
    /** 무장 당시 가격이 레벨의 어느 쪽에 있었나 */
    side: 'below' | 'above';
    armedAt: number;
    session: string;
    levelAsOf: number;
}

export interface MaxPainStats {
    /** 이 통계를 계산한 ET 날짜(하루 1회 캐시) */
    date: string;
    /** |가격 − 맥스페인| / 맥스페인 의 20거래일 상위 10% 경계(비율, 0.021 = 2.1%) */
    p90: number;
    n: number;
}

/** FINRA 일간 장외 비중 — 최신 한 점 + 자기 이력(정렬된 날짜 배열). pct 는 0~100(%). */
export interface DarkPoolInput {
    date: string | null;
    pct: number | null;
    series: { dates: string[]; pct: Array<number | null> } | null;
}

export interface WhaleContract {
    type: 'call' | 'put';
    strike: number;
    expiration: string;
    oiChange: number;
    notional: number;
}

/** 옵션 EOD 스냅샷의 신규 진입(ΔOI > 0) 계약들 — date 는 미결제약정이 속한 세션. */
export interface WhaleInput {
    date: string | null;
    contracts: WhaleContract[];
}

export interface EarningsInput {
    date: string;
    /** 'bmo' 장 시작 전 · 'amc' 장 마감 후 · 'dmh' 장중 · 'unknown' */
    timing: 'bmo' | 'amc' | 'dmh' | 'unknown';
    impliedMovePct: number | null;
}

export interface TickerSnapshot {
    ticker: string;
    /** 이 스냅샷을 만든 시각 */
    at: number;
    /** ET 거래일 */
    session: string;
    bar: Bar5 | null;
    levels: LevelSet | null;
    arms?: Partial<Record<CrossKind, Arm>>;
    maxPainStats?: MaxPainStats | null;
    darkPool?: DarkPoolInput | null;
    whale?: WhaleInput | null;
    earnings?: EarningsInput | null;
    /** 마지막으로 5분 봉을 새로 받은 시각(순환 우선순위용) */
    barFetchedAt?: number | null;
}

/** 탐지 결과 한 건 — 문구는 messages.ts 가 facts 로 만든다(숫자만 싣는다). */
export interface DetectedEvent {
    ticker: string;
    event: AlertEventId;
    /** 중복 억제 키의 «회차» — 장중 이벤트는 ET 거래일, FINRA 는 자료 날짜, 실적은 실적일 */
    sessionKey: string;
    /** «지금 일어난 일» — iOS Time Sensitive·짧은 보관 시간 대상 */
    timeSensitive: boolean;
    facts: AlertFacts;
}

export interface AlertFacts {
    level?: number;
    direction?: 'up' | 'down';
    price?: number;
    nextWall?: number | null;
    pcr?: number | null;
    maxPain?: number | null;
    divergencePct?: number;
    expiration?: string | null;
    pct?: number;
    mean?: number;
    ratio?: number;
    sigma?: number;
    date?: string | null;
    contract?: WhaleContract;
    earningsDate?: string;
    timing?: EarningsInput['timing'];
    impliedMovePct?: number | null;
}
