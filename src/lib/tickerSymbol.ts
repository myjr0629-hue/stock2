/**
 * 티커 표기 — 클래스 주식(BRK.B · BF.B · LEN.B)의 정본은 «점»이다 (벤더 옵션 체인·수집 Lambda·사전 갱신·구조 판본 키 전부 BRK.B).
 *
 * 사고(10/14 점검): 앱 검색 «berkshire» 결과에 BRK-B·BRK-A(하이픈 표기, 외부 검색원)가 나온다. 그 표기로 열면 시세(/api/live/quotes)는 벤더가 알아봐 맞는데
 *   옵션 구조(/api/live/options/structure?t=BRK-B)는 «옵션 시장 없음(NO_MARKET)»으로 나온다 — 같은 종목이 표기 하나로 값이 갈린다.
 * 한 글자 클래스 접미(-B, /B)만 점으로 바꾼다. 두 글자 이상 접미(우선주 BAC-PK 등)·그 밖 하이픈은 건드리지 않는다.
 */
const CLASS_SHARE = /^([A-Z]{1,5})[-/]([A-Z])$/;

/** 대문자로 바꾸고 클래스 주식 표기를 점으로. 그 밖은 대문자만. 문자열이 아니면 빈 문자열. */
export function canonicalShareClass(t: unknown): string {
    const s = typeof t === 'string' ? t.trim().toUpperCase() : '';
    const m = CLASS_SHARE.exec(s);
    return m ? `${m[1]}.${m[2]}` : s;
}
