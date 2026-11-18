/**
 * «✦ AI 오늘 볼 것» — 공용 타입 (2026-10-13, 브랜치 feat/today-picks). 순수 타입만(네트워크·Redis 없음).
 *
 * 한 문서(TodayPicksDoc)는 조기판·아침판·마감판으로 서버가 저장소의 «이미 있는 값»에서 골라 만든다(선별 원천은 캐시, 프리 배경은 기존 시세 API).
 * 항목마다 «무엇이·숫자·기준 시각»(규칙으로 만든 문장 — AI 가 숫자를 쓰지 않는다)과 «왜 볼 만한가 한 줄»(AI, 출구 가드 통과분 · 실패하면 규칙 문장)이 붙는다.
 */

export type Loc = 'ko' | 'en' | 'ja';
export const TP_LOCALES: readonly Loc[] = ['ko', 'en', 'ja'];

export type PickKind = 'whale' | 'darkpool' | 'gamma' | 'earnings' | 'mover';
export const PICK_KINDS: readonly PickKind[] = ['whale', 'darkpool', 'gamma', 'earnings', 'mover'];
/** 옵션 계열(고급 지표) — 전체보기 상위 3개 중 합계 1개까지·홈 카드에선 일반 항목이 둘 이상이면 0개(대표 11/18) */
export const OPTIONS_KINDS: readonly PickKind[] = ['whale', 'darkpool', 'gamma'];

/** pre = 한국 저녁 조기판 · am = 08:00 ET 무렵 · pm = 마감 뒤 */
export type Slot = 'pre' | 'am' | 'pm';

export interface WhaleFacts {
    kind: 'whale';
    /** 이 신규 포지션이 «열린» 세션(묶음 prevDate) — 그 세션 마감 기준의 확정 미결제약정 증가분 */
    openedOn: string;
    /** 만기가 지나지 않은 계약들의 신규 명목 합(USD, 행사가 × 100 × 늘어난 계약). 선별 점수·콜 비중용이며 단일 계약의 표시 금액은 best.notional. */
    notional: number;
    /** 신규 명목 중 콜 비중 0~100 */
    callPct: number;
    /** 표시할 단일 계약. notional = added(미결제약정 증가분) × 100주 × strike(행사가), 총 oi·현재가·프리미엄 기준이 아니다. */
    best: { type: 'call' | 'put'; strike: number; expiry: string; added: number; oi: number; notional: number };
    /** 그 계약의 미결제약정 배수(늘어난 뒤 ÷ 늘어나기 전). 처음 생긴 계약이면 null */
    jump: number | null;
}

export interface DarkFacts {
    kind: 'darkpool';
    /** FINRA 세션 날짜 */
    date: string;
    /** 장외 체결 비중 % */
    pct: number;
    /** 오늘 장외 거래량 ÷ 20일 평균 */
    ratio: number;
    /** 장외 거래량(주) */
    volume: number;
    /** 같은 날 전 종목 평균 장외 비중 % */
    marketAvg: number | null;
}

export interface GammaFacts {
    kind: 'gamma';
    level: 'gammaFlip' | 'maxPain';
    /** 레벨 판본의 체인(미결제약정) 날짜 */
    chainDate: string;
    expiry: string;
    spot: number;
    levelPrice: number;
    /** 레벨까지 거리 % (절댓값) · 가격이 레벨 위('a')/아래('b')/같음('at') */
    distPct: number;
    side: 'a' | 'b' | 'at';
}

export interface EarnFacts {
    kind: 'earnings';
    date: string;
    hour: 'bmo' | 'amc' | '';
    etTime: string | null;
    /** 옵션이 반영한 예상 변동(보조 정보) — 넓힌 선별(11/18)에서는 없을 수 있다(null) */
    impliedPct: number | null;
    impliedExpiry: string | null;
    /** 예상 변동을 잰 세션(옵션 호가 날짜) */
    session: string | null;
}

/**
 * 큰 폭 상승·하락(2026-11-18) — 거래대금이 큰 종목의 «끝난 정규장 세션» 종가 기준 등락. 오늘 실시간 값이 아니다(session 날짜를 단다).
 * 원천: market:movers 캐시 → 무버 API 와 같은 세션·분할 보정(services/moverSession · splitGuard) → 기존 시세 API 의 정규장 종가로 대조.
 */
export interface MoverFacts {
    kind: 'mover';
    /** 이 등락이 속한 정규장 세션 날짜(그 세션 종가 기준) */
    session: string;
    /** 직전 종가 대비 % (소수 첫째 자리) */
    changePct: number;
    /** 그 세션 종가 */
    price: number;
    /** 그 세션 거래대금(USD) */
    value: number;
    /** 회사가 공지한 실적 발표가 이 세션 직전에 있었다(같은 날 개장 전 · 전 거래일 장 마감 후) */
    earnings: { date: string; hour: 'bmo' | 'amc' } | null;
    /** 종목이 태그된 같은 시기 보도(뉴스 다이제스트 헤드라인 · 영어 원문) — 있을 때만 */
    news: { headline: string; publishedAt: string } | null;
}

export type PickFacts = WhaleFacts | DarkFacts | GammaFacts | EarnFacts | MoverFacts;

/** 선별 후보 — 점수는 같은 종류 안에서만 견준다 */
export interface Cand<F extends PickFacts = PickFacts> {
    id: string;
    kind: F['kind'];
    ticker: string;
    /** 항목이 말하는 자료의 날짜(YYYY-MM-DD) — 화면의 «M/D 기준» */
    asOf: string;
    score: number;
    facts: F;
}

export type LocText = Record<Loc, string>;

/** 저장되는 항목 */
export interface TodayPick {
    id: string;
    kind: PickKind;
    ticker: string;
    asOf: string;
    facts: PickFacts;
    /** 무엇이·숫자·기준 — 규칙 문장(숫자는 facts 에서만) */
    what: LocText;
    /** 왜 볼 만한가 한 줄 — AI(whyAi=true) 또는 규칙 문장 */
    why: LocText;
    whyAi: boolean;
    /** 푸시 본문용 압축 한 줄(규칙 문장) */
    push: LocText;
}

export interface TodayPicksDoc {
    v: 1;
    slot: Slot;
    /** 만든 시각의 ET 날짜 */
    etDate: string;
    /** 생성 시점의 실제 주식 세션(EST 03:30은 CLOSED). 화면 라벨은 기존 것을 유지. */
    session?: string;
    context?: import('@/lib/ai/preMarketContext').PreMarketContext;
    /** 만든 시각(ms) */
    at: number;
    /** 이 문서가 읽은 자료의 날짜들 — 같으면 다시 만들지 않는다 */
    stamp: DocStamp;
    items: TodayPick[];
    /** 선별 규칙 판본 — 'broad1' = 일반 항목(큰 폭 등락·실적) 우선(11/18). 없으면 옛 선별 */
    sel?: 'broad1';
    /** 생성 계측(비용·지연·가드) */
    gen: { calls: number; ok: number; fallback: number; ms: number; reasons?: string[] };
}

export interface DocStamp {
    /** 옵션 EOD 묶음 레코드 날짜 · 신규 포지션이 열린 세션 */
    opt: string | null;
    opened: string | null;
    /** FINRA 날짜 */
    finra: string | null;
    /** 구조 판본 체인 날짜(후보 중 가장 늦은 것) */
    chain: string | null;
    /** 실적 일정 창이 시작하는 ET 날짜 */
    earn: string | null;
    /** 큰 폭 등락 — «세션|상위 종목» (옛 문서엔 없다 → 첫 실행에 다시 만든다) */
    mov?: string | null;
    /** 선별 판본(sel) — 스위치를 바꾸면 다시 만든다 */
    sel?: string | null;
}
