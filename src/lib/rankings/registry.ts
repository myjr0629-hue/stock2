// ============================================================================
// 랭킹 등록부 — «무엇을 재는가»와 «왜 가치 있는가»를 코드 옆에 둔다.
//
// 설명을 문서로 따로 빼면 코드가 바뀔 때 설명만 남아 거짓말이 된다.
// 여기 적힌 what/why 는 API 응답으로 그대로 나가고, 다른 에이전트가
// 그걸 읽고 쓴다.
// ============================================================================
import { Phase } from './engine';

export type Loc = { ko: string; en: string; ja: string };

export type RankingSpec = {
    id: string;
    phase: Phase;
    /** 마감 후에만 자료가 들어오는가 (다크풀) */
    needsPostClose?: boolean;
    name: Loc;
    /** 무엇을 재는가 — 계산의 정의 */
    what: string;
    /** 왜 가치 있는가 — 이게 없으면 그냥 숫자 나열이다 */
    why: string;
    source: string;
    /** 이 랭킹이 놓기 쉬운 함정과, 그걸 막은 방법 */
    guards: string[];
    /** 값의 방향 — 클수록 이례적인가, 작을수록인가 */
    direction: 'deviation' | 'proximity';
};

export const RANKINGS: RankingSpec[] = [
    // ── 장중 ────────────────────────────────────────────────────────────
    {
        id: 'deviation', phase: 'intraday',
        name: { ko: '평소 대비 이탈', en: 'Break from own normal', ja: '平常からの乖離' },
        what: '종목별 옵션 지표(풋콜 비율·미결제약정·대형거래·델타 노출·스퀴즈 확률·옵션 자금)를 그 종목 자신의 최근 30일 중앙값과 비교해, 가장 크게 벗어난 순으로 세운다.',
        why: '절대 순위(옵션 프리미엄 TOP)는 시가총액을 따라가서 NVDA·TSLA·AAPL 이 거의 매일 상위다. 답을 미리 아는 랭킹은 볼 이유가 없다. 「이 종목이 평소와 다르다」만이 매일 답이 달라지고, 기관이 실제로 보는 축이다.',
        source: 'DynamoDB signum-flow-history',
        guards: ['대표 스냅샷(그날 총 OI 최대)', '만기 롤오버(같은 규모 체인만 비교)', 'MAD 분모 붕괴 방지', '|z|≥3 · 배수≥1.35'],
        direction: 'deviation',
    },
    {
        id: 'multi-axis', phase: 'intraday',
        name: { ko: '다축 동시 이탈', en: 'Multiple axes at once', ja: '複数軸の同時乖離' },
        what: '한 종목이 두 개 이상의 축에서 «동시에» 평소를 벗어난 경우만 모은다. 축 수가 많은 순, 같으면 이탈 크기 합이 큰 순.',
        why: '한 축만 튀는 건 우연일 수 있다. 미결제약정도 늘고 대형거래도 늘고 스퀴즈 확률도 오르면 그건 같은 사건의 세 얼굴이다. 단일 축 랭킹이 못 잡는 «강도»를 잡는다.',
        source: 'deviation 결과 재집계',
        guards: ['deviation 의 모든 게이트를 그대로 승계'],
        direction: 'deviation',
    },
    {
        id: 'maxpain-gap', phase: 'intraday',
        name: { ko: '맥스페인 이격도', en: 'Max pain gap', ja: 'マックスペイン乖離' },
        what: '현재가가 맥스페인(옵션 보유자 총 손실이 최소가 되는 가격)에서 몇 % 떨어져 있는지. 먼 순.',
        why: '만기가 가까울수록 주가가 맥스페인 쪽으로 끌리는 경향이 관찰된다(핀 현상). 이격이 크다는 건 그 인력이 아직 작동하지 않았거나, 반대로 강한 힘이 밀어내고 있다는 뜻이다. 「종가가 어디로 끌리나」라는 서사가 붙는다.',
        source: 'DynamoDB signum-gex-history (price · maxPain)',
        guards: ['맥스페인이 현재가에서 ±35% 밖이면 계산 오류로 보고 버린다', '대표 스냅샷 사용'],
        direction: 'deviation',
    },
    {
        id: 'gamma-flip', phase: 'intraday',
        name: { ko: '감마플립 근접', en: 'Near gamma flip', ja: 'ガンマフリップ接近' },
        what: '현재가가 감마 플립 레벨에서 몇 % 이내인지. 가까운 순.',
        why: '플립 레벨 위에서는 딜러가 «변동성을 죽이는» 방향(하락 시 매수·상승 시 매도)으로, 아래에서는 «변동성을 키우는» 방향으로 헤지한다. 그 경계에 붙어 있는 종목은 작은 움직임이 성격을 바꾼다. 예측이 아니라 포지셔닝 판독이다.',
        source: 'DynamoDB signum-gex-history (price · flipLevel)',
        guards: ['플립 레벨이 현재가 ±25% 밖이면 버린다', '대표 스냅샷 사용'],
        direction: 'proximity',
    },
    {
        id: 'money-vs-oi', phase: 'intraday',
        name: { ko: '돈과 포지션의 불일치', en: 'Dollars vs positions disagree', ja: '資金と建玉の不一致' },
        what: '«돈»(콜/풋 프리미엄 비)과 «쌓인 포지션»(콜/풋 미결제약정 비)이 서로 반대를 가리키는 정도. 어긋난 순.',
        why: '미결제약정은 풋이 많은데 돈은 콜에 몰리는 상황이 실제로 나온다 — 싼 풋을 수로 깔아두고 비싼 콜에 자금을 넣는 그림이다. 둘 중 하나만 보면 정반대로 읽는다. 이 모순 자체가 정보다.',
        source: 'DynamoDB signum-flow-history (callPremium·putPremium·OI, 같은 스냅샷)',
        guards: ['프리미엄과 OI 를 반드시 «같은 스냅샷»에서 읽는다', '양쪽 모두 0보다 커야 한다'],
        direction: 'deviation',
    },

    // ── 마감 후 ─────────────────────────────────────────────────────────
    {
        id: 'darkpool-volume', phase: 'postclose', needsPostClose: true,
        name: { ko: '장외 물량 이탈', en: 'Off-exchange volume break', ja: '取引所外の出来高乖離' },
        what: '장외(다크풀) 체결량이 그 종목의 20일 평균 대비 몇 배인지를, 다시 그날 시장 전체의 중앙 배수로 나눈 값. 시장 대비 이탈이 큰 순.',
        why: '거래소 밖 체결은 기관이 시장가를 흔들지 않으려 할 때 늘어난다. 다만 시장 전체가 조용한 날엔 모든 종목이 같이 줄어 «이탈»처럼 보인다 — 그래서 시장 대비로 본다.',
        source: 'FINRA Reg SHO (Redis finra:offexchange)',
        guards: ['시장 중앙 배수로 정규화', 'ETF 제외(이탈 상위를 오염시킨다)', '옵션 세션과 날짜가 다르면 랭킹에서 뺀다'],
        direction: 'deviation',
    },
    {
        id: 'darkpool-short', phase: 'postclose', needsPostClose: true,
        name: { ko: '장외 공매도 비중 이탈', en: 'Off-exchange short share break', ja: '取引所外の空売り比率乖離' },
        what: '장외 체결 중 공매도 비중이 그 종목의 평소보다 몇 %p 벗어났는지. 이탈이 큰 순.',
        why: '⚠️ 공매도 «비중» 자체는 방향성이 아니다. 시장 중앙값이 약 49% 인데, 도매업자가 소매 매수의 상대가 될 때 일단 공매도로 팔고 되사기 때문에 절반은 구조적으로 찍힌다. 「46% 공매도 = 하락 베팅」은 오독이다. 그 종목의 평소 대비 이탈만이 정보다.',
        source: 'FINRA Reg SHO (Redis finra:offexchange)',
        guards: ['배수가 아니라 %p 로 잰다(49%→65% 는 배수로 1.33뿐이지만 큰 이탈이다)', '±8%p 이상만', '날짜 일치 확인'],
        direction: 'deviation',
    },
    {
        id: 'stealth', phase: 'postclose', needsPostClose: true,
        name: { ko: '은밀 축적·분산', en: 'Stealth accumulation', ja: '静かな買い集め' },
        what: '장외 물량은 평소보다 많은데(volP↑) 그 물량 중 공매도 비중은 평소보다 낮은(shortP↓) 조합을 0~100 점으로. 70 이상 축적, 30 이하 분산.',
        why: '호가창 밖에서 «사 모으는» 그림과 «조용히 내보내는» 그림을 구분한다. 물량만 보면 방향을 모르고, 공매도만 보면 구조적 절반에 속는다. 둘을 겹쳐야 방향이 나온다. 예측이 아니라 포지셔닝 판독이다.',
        source: 'FINRA Reg SHO 파생(stealth·regime)',
        guards: ['백분위 표본 10일 미만이면 판정하지 않는다', 'ETF 제외', '날짜 일치 확인'],
        direction: 'deviation',
    },
    // ── 세션 무관 ───────────────────────────────────────────────────────
    {
        id: 'insider-conviction', phase: 'anytime',
        name: { ko: '내부자 자신감 매집', en: 'Insider conviction buys', ja: 'インサイダーの本気買い' },
        what: '미국 시장 «전체» 내부자 신고에서 SEC 코드 P(장내 매수)만 골라, 한 종목에 들어간 금액을 합쳐 세운다. 보상·무상취득(A)·옵션행사(M)·세금납부(F)는 전부 제외한다.',
        why: '회사 사정을 가장 잘 아는 사람이 «자기 돈»으로 시장에서 산 것만 남긴다. 보상으로 받은 주식은 아무 말도 안 한다 — 실측 908건 중 절반 이상이 그런 것이었다. 그리고 이건 우리 유니버스 25종목이 아니라 시장 전체를 훑는 «발굴형»이라, 아무도 모르던 티커가 올라온다.',
        source: 'Intrinio insider_transaction_filings (전역)',
        guards: ['SEC 코드 P 만', '파생거래 제외', '주식수·단가 둘 다 있어야 함', '금액과 «지분 증가율»을 함께 표기(대주주가 금액으로만 이기지 않게)'],
        direction: 'deviation',
    },
    {
        id: 'deep-value-fcf', phase: 'anytime',
        name: { ko: '현금창출 대비 저평가', en: 'Cash-rich but cheap', ja: 'キャッシュ創出に対し割安' },
        what: '잉여현금흐름 수익률(FCF ÷ 시가총액)이 높으면서, EV/EBITDA 가 유니버스 중앙값보다 40% 이상 싸고, 장기부채/자기자본이 0.8 이하인 종목.',
        why: '차트가 아니라 «돈»으로 보는 축이다. 현금은 미친 듯이 버는데 주가만 빠진 종목을 찾는다. 다른 랭킹이 전부 옵션·수급이라 단기 트레이더용인데, 이건 스윙·가치 투자자에게 걸린다 — 시청자층이 다르다.',
        source: 'Intrinio fundamentals → standardized_financials + marketcap',
        guards: ['업종 평균이 아니라 «유니버스 중앙값» 대비다 — 업종 매핑이 없으므로 그렇게 라벨한다', '부채비율 게이트', '세 값 중 하나라도 없으면 제외(추정하지 않는다)'],
        direction: 'deviation',
    },
];

export const byId = (id: string) => RANKINGS.find((r) => r.id === id) || null;
