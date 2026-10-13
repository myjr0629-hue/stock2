/**
 * «내 종목 이상 신호» — 공용 타입·상수 (순수 모듈: 네트워크·Redis·SDK 없음). 시험: tests/signals.*.test.ts
 *
 * 설계 요약 (대표 10/12·10/13 승인 — IMPL-5b-watchlist-alerts.md)
 *   · 기기(푸시 토큰) 레코드에 «내 종목 목록»만 붙인다(`push:tokens:{token}.watchlist`). 로그인·계정 없음, 식별자는 푸시 토큰 하나.
 *   · 서버는 저장소에 «이미 있는 값»만 읽어 이상 신호를 찾는다(공급사 호출 0 — Intrinio 429 재발 방지).
 *   · 무료 전원(PRO 차등 없음). 매수·매도 권유·예측 없음 — 숫자·기준 시각·AI 한 줄 해설(숫자는 규칙, AI 는 설명만).
 *   · 이전 브랜치 feat/watchlist-alerts(DynamoDB·RevenueCat PRO 확인)의 탐지 규칙을 이어받되 저장소·권한 모델은 새로 만들었다.
 */

export type Loc = 'ko' | 'en' | 'ja';
export const SIG_LOCALES: readonly Loc[] = ['ko', 'en', 'ja'];
export type LocText = Record<Loc, string>;

/** 신호 종류 — 앞의 다섯은 대표 승인 목록(다크풀 급증·맥스페인 이탈·실적 D-1·콜월 돌파·OI 급변), 뒤 둘은 같은 탐지 기계의 짝(기본 꺼짐) */
export const SIGNAL_EVENTS = [
    'call_wall_break',
    'maxpain_divergence',
    'darkpool_spike',
    'oi_surge',
    'earnings_d1',
    'put_floor_break',
    'gamma_flip_cross',
] as const;
export type SignalEvent = (typeof SIGNAL_EVENTS)[number];

/** 지금 보내는 종류 — put_floor_break·gamma_flip_cross 는 탐지만 하고 보내지 않는다(대표 목록 밖 · 드라이런으로 오탐을 본 뒤 켠다) */
export const ENABLED_EVENTS: readonly SignalEvent[] = ['call_wall_break', 'maxpain_divergence', 'darkpool_spike', 'oi_surge', 'earnings_d1'];

/** 같은 기기에 한 번에 몰릴 때의 순서(앞이 먼저) — 날짜가 지나면 의미가 없어지는 것(실적 D-1)이 맨 앞 */
export const EVENT_PRIORITY: readonly SignalEvent[] = ['earnings_d1', 'call_wall_break', 'put_floor_break', 'gamma_flip_cross', 'oi_surge', 'darkpool_spike', 'maxpain_divergence'];

/** 푸시를 눌렀을 때의 계측 출처(퍼널 닫힌 목록 funnelSchema.FUNNEL_SRCS 와 같아야 한다 — 시험이 대조) */
export const EVENT_FUNNEL_SRC: Record<SignalEvent, string> = {
    call_wall_break: 'push_sig_wall',
    put_floor_break: 'push_sig_wall',
    gamma_flip_cross: 'push_sig_wall',
    maxpain_divergence: 'push_sig_pain',
    darkpool_spike: 'push_sig_dark',
    oi_surge: 'push_sig_oi',
    earnings_d1: 'push_sig_earn',
};

// ── 설정(문턱·한도) ─────────────────────────────────────────────────────────────
export const SIG_CFG = {
    // 레벨 교차(콜월·풋플로어·감마플립)
    /** 되돌림 방지 여유 — 구조 굽기 관측은 몇 시간 간격이라 5분 종가보다 넉넉히 */
    crossBuffer: 0.003,
    /** 관측(구조 판본)이 이보다 오래됐으면 «지금 일어난 일»이 아니다 */
    obsMaxAgeMs: 90 * 60_000,
    /** 무장(레벨 아래/위에서 보던 기억)은 같은 거래일 안에서 이 간격까지만 이어진다 */
    armMaxGapMs: 5 * 3600_000,
    /** 두 관측 사이 가격이 이보다 크게 뛰면 틱 오류로 보고 건너뛴다 */
    maxJump: 0.15,
    gammaFlipTypes: ['EXACT'] as readonly string[],
    // 맥스페인 이탈
    maxPainSessions: 3,
    maxPainMinObs: 30,
    maxPainWindowSessions: 20,
    /** 자기 상위 10% 경계가 아무리 작아도 이만큼(%)은 벌어져야 한다 */
    maxPainFloorPct: 1.0,
    // 다크풀 급증(FINRA) — 오늘 장외 거래량 ÷ 20일 평균, 자기 백분위
    darkMinRatio: 1.8,
    darkMinPctile: 90,
    darkMinVolume: 500_000,
    // OI 급변(옵션 EOD 묶음의 확정 미결제약정 증가)
    oiMinNotional: 50e6,
    oiMinAdded: 1500,
    oiMinJump: 3,
    // 한도
    deviceDailyCap: 3,
    perRunPerDevice: 2,
    maxTickersPerDevice: 100,
    /** 한 실행에서 저장본을 읽는 종목 수 상한 — 많이 담긴 종목부터. 구조 판본이 종목당 수십 KB 라 읽는 양을 묶는다 */
    maxUnionTickers: 400,
    /** 같은 (기기·종목·신호·회차)는 이 기간 다시 보내지 않는다 */
    dedupeTtlSec: 8 * 24 * 3600,
} as const;

/** 같은 종목·같은 신호의 «재발송 금지 창»(초) — 자료 회차(sessionKey)가 달라도 이 안에서는 다시 보내지 않는다 */
export const EVENT_COOLDOWN_SEC: Record<SignalEvent, number> = {
    call_wall_break: 24 * 3600,
    put_floor_break: 24 * 3600,
    gamma_flip_cross: 24 * 3600,
    maxpain_divergence: 3 * 24 * 3600,
    darkpool_spike: 3 * 24 * 3600,
    oi_surge: 3 * 24 * 3600,
    earnings_d1: 5 * 24 * 3600,
};

// ── 사실(facts) — 규칙 문장과 AI 입력의 유일한 숫자 출처 ──────────────────────────────────
export interface WallFacts {
    kind: 'wall';
    level: 'callWall' | 'putFloor' | 'gammaFlip';
    levelPrice: number;
    /** 관측 시점 가격(구조 판본의 기준가) */
    price: number;
    direction: 'up' | 'down';
    /** 레벨 대비 가격 % (부호 있음, 가격 ÷ 레벨 − 1) */
    distPct: number;
    expiry: string;
    chainDate: string | null;
    /** 관측(구조 판본) 시각 ms */
    asOfMs: number;
}

export interface MaxPainFacts {
    kind: 'maxpain';
    maxPain: number;
    price: number;
    /** (가격 − Max Pain) ÷ Max Pain, % (부호 있음) */
    divPct: number;
    /** 이 종목의 최근 20거래일 괴리 상위 10% 경계, % */
    p90Pct: number;
    n: number;
    expiry: string;
    chainDate: string | null;
    asOfMs: number;
}

export interface DarkSigFacts {
    kind: 'darkpool';
    /** FINRA 세션 날짜 */
    date: string;
    pct: number;
    ratio: number;
    volume: number;
    marketAvg: number | null;
}

export interface OiFacts {
    kind: 'whale';
    /** 신규 포지션이 열린 세션(옵션 EOD 묶음의 prevDate) */
    openedOn: string;
    notional: number;
    callPct: number;
    best: { type: 'call' | 'put'; strike: number; expiry: string; added: number; oi: number; notional: number };
    jump: number | null;
}

export interface EarnD1Facts {
    kind: 'earnings_d1';
    date: string;
    hour: 'bmo' | 'amc' | '';
    etTime: string | null;
    /** 옵션이 반영한 변동폭 % — 저장본에 없으면 null(지어내지 않는다) */
    impliedPct: number | null;
    impliedExpiry: string | null;
    /** 달력상 내일인가(주말·휴장 앞이면 false) */
    tomorrow: boolean;
}

export type SignalFacts = WallFacts | MaxPainFacts | DarkSigFacts | OiFacts | EarnD1Facts;

export interface DetectedSignal {
    ticker: string;
    event: SignalEvent;
    /** 회차 키 — 같은 키는 한 기기에 한 번만(장중 레벨 = 거래일+방향 · 맥스페인 = 만기 · FINRA = 자료 날짜 · OI = 열린 세션 · 실적 = 발표일) */
    key: string;
    facts: SignalFacts;
    /** 이 신호가 말하는 자료의 기준 시각(ms) — 푸시 본문의 «기준 시각». 날짜 기준 자료는 그날 ET 정오 */
    asOfMs: number;
    /** 자료의 날짜(YYYY-MM-DD) */
    asOfDate: string;
    /** 같은 종류 안에서 견주는 점수(클수록 먼저) */
    score: number;
}

// ── 관측(구조 판본) ────────────────────────────────────────────────────────────
export type ObsSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';

/** 구조 판본(structure:v2:{T}) 한 장에서 알림에 필요한 것만 — 정의 게이트(lib/optionLevelGate)를 통과한 레벨 */
export interface LevelObs {
    ticker: string;
    asOfMs: number;
    session: ObsSession | string;
    spot: number;
    expiry: string | null;
    chainDate: string | null;
    callWall: number | null;
    putFloor: number | null;
    gammaFlip: number | null;
    gammaFlipType: string | null;
    gexConfidence: string | null;
    maxPain: number | null;
}

export type CrossKind = 'callWall' | 'putFloor' | 'gammaFlip';

/** 무장 — «이 레벨을 반대편에서 보고 있었다»는 기억 */
export interface Arm {
    level: number;
    side: 'below' | 'above';
    /** 이 무장을 만든 관측의 시각 */
    asOfMs: number;
    /** 거래일(ET) */
    day: string;
}

/** 종목별 마지막 관측 상태(EC2 레디스 wlsig:arm:{T}) */
export interface TickerState {
    asOfMs: number;
    day: string;
    spot: number;
    arms: Partial<Record<CrossKind, Arm>>;
}

// ── 기기 ──────────────────────────────────────────────────────────────────────
export type Platform = 'ios' | 'android';

/** 푸시 토큰 레코드에서 읽은 «신호를 받을 수 있는 기기» */
export interface SignalDevice {
    token: string;
    /** 토큰을 줄인 해시(12자) — 키 이름·로그에 쓴다(토큰 자체는 키에 넣지 않는다) */
    dev: string;
    platform: Platform;
    locale: Loc;
    tickers: string[];
    tz: string | null;
}

export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
