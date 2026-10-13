/**
 * «✦ AI 오늘 볼 것» — 공용 타입 (2026-10-13, 브랜치 feat/today-picks). 순수 타입만(네트워크·Redis 없음).
 *
 * 한 문서(TodayPicksDoc)는 하루 두 번(아침 08:00 ET 전후 · 마감 뒤) 서버가 저장소의 «이미 있는 값»에서 골라 만든다(공급사 호출 0).
 * 항목마다 «무엇이·숫자·기준 시각»(규칙으로 만든 문장 — AI 가 숫자를 쓰지 않는다)과 «왜 볼 만한가 한 줄»(AI, 출구 가드 통과분 · 실패하면 규칙 문장)이 붙는다.
 */

export type Loc = 'ko' | 'en' | 'ja';
export const TP_LOCALES: readonly Loc[] = ['ko', 'en', 'ja'];

export type PickKind = 'whale' | 'darkpool' | 'gamma' | 'earnings';
export const PICK_KINDS: readonly PickKind[] = ['whale', 'darkpool', 'gamma', 'earnings'];

/** am = 프리마켓 전(08:00 ET 무렵) · pm = 마감 뒤 */
export type Slot = 'am' | 'pm';

export interface WhaleFacts {
    kind: 'whale';
    /** 이 신규 포지션이 «열린» 세션(묶음 prevDate) — 그 세션 마감 기준의 확정 미결제약정 증가분 */
    openedOn: string;
    /** 만기가 지나지 않은 계약들의 신규 명목 합(USD, 행사가 × 100 × 늘어난 계약) */
    notional: number;
    /** 신규 명목 중 콜 비중 0~100 */
    callPct: number;
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
    impliedPct: number;
    impliedExpiry: string;
    /** 예상 변동을 잰 세션(옵션 호가 날짜) */
    session: string | null;
}

export type PickFacts = WhaleFacts | DarkFacts | GammaFacts | EarnFacts;

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
    /** 만든 시각(ms) */
    at: number;
    /** 이 문서가 읽은 자료의 날짜들 — 같으면 다시 만들지 않는다 */
    stamp: DocStamp;
    items: TodayPick[];
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
}
