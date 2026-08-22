// ============================================================================
// concepts — /learn/{개념} 설명 페이지의 콘텐츠 원본 (3개국어)
// ----------------------------------------------------------------------------
// 왜 만들었나 (2026-08-22, Bing Keyword Research 실측):
//   `dark pool` 3개월 527노출. 상위 10위는 Investopedia·Wikipedia·FINRA 같은
//   «설명 콘텐츠» + Unusual Whales·Cheddar Flow·darkpoolheatmap 같은 경쟁 도구였다.
//   우리는 이 층에 페이지가 «하나도» 없었다. 티커 페이지의 용어집은 한 줄짜리라
//   경쟁이 안 된다.
//
//   동시에 이 페이지들은 «링크 허브»로도 일한다 — 595개 티커 페이지가 전부
//   여기로 링크하면 개념 페이지가 권위를 모으고, 되돌아오는 링크가 티커 페이지의
//   문맥을 강화한다.
//
// 원칙: 설명은 우리가 «실제로 계산하는 방식»을 쓴다. 일반론만 쓰면 Investopedia 를
//       이길 이유가 없다. 임계값·해석은 우리 화면이 쓰는 것과 같아야 한다.
// ============================================================================

export type ConceptSection = { h: string; p: string };
export type Concept = {
  slug: string;
  title: string;
  desc: string;
  h1: string;
  lead: string;
  sections: ConceptSection[];
  related: string[];
};

type Loc = 'en' | 'ko' | 'ja';

export const CONCEPT_SLUGS = [
  'dark-pool', 'max-pain', 'gamma-exposure', 'call-wall', 'put-call-ratio', 'options-flow',
] as const;
export type ConceptSlug = (typeof CONCEPT_SLUGS)[number];

export const CONCEPTS: Record<Loc, Record<ConceptSlug, Concept>> = {
  en: {
    'dark-pool': {
      slug: 'dark-pool',
      title: 'What Is Dark Pool Volume? How to Read Off-Exchange Trading',
      desc: 'Dark pool volume is the share of trading that happens away from public exchanges. Here is what the number means, what counts as high, and how to read it on a specific ticker.',
      h1: 'Dark pool volume, explained',
      lead: 'A dark pool is a private venue where institutions trade without posting their orders to a public order book. The trades still print — they are reported to the tape after execution — but the intent is hidden while the order is being filled.',
      sections: [
        { h: 'Why institutions use them', p: 'A pension fund buying two million shares on a lit exchange would move the price against itself before the order finished. Routing through a dark pool lets the order fill closer to the prevailing price. This is legal, regulated, and routine — roughly 40% of US equity volume executes off-exchange on a normal day.' },
        { h: 'What the percentage actually measures', p: 'Dark pool share is off-exchange volume divided by total volume for that ticker, for that session. It is a ratio, not a direction: a high number tells you size traded quietly, not whether it was buying or selling.' },
        { h: 'How to read it', p: 'Around 40% is ordinary. Sustained readings well above that on a single name mean unusual institutional participation — worth pairing with options positioning to guess at direction. A single high day proves nothing; a run of them alongside a rising call wall is a different story.' },
        { h: 'The honest limitation', p: 'Off-exchange prints do not carry a buy/sell flag you can trust. Anyone selling you a "dark pool buy signal" is inferring direction from data that does not contain it. We show the share and let you combine it with positioning yourself.' },
      ],
      related: ['options-flow', 'max-pain'],
    },
    'max-pain': {
      slug: 'max-pain',
      title: 'What Is Max Pain? The Options Price Magnet, Explained',
      desc: 'Max pain is the strike where the most options expire worthless. Here is how it is calculated, why price often drifts toward it near expiry, and when it stops mattering.',
      h1: 'Max pain, explained',
      lead: 'Max pain is the price at which the largest total value of open options contracts would expire worthless — the price that inflicts the most "pain" on option buyers as a group.',
      sections: [
        { h: 'How it is calculated', p: 'For every strike, you sum what all open calls and puts would be worth if the stock settled exactly there. The strike where that total payout is smallest is max pain. It is arithmetic over open interest, not a prediction model.' },
        { h: 'Why price sometimes drifts toward it', p: 'Market makers who sold those options hedge continuously. As expiry nears and time value collapses, that hedging tends to dampen moves away from the heaviest open interest. The effect is real but weak — it is a gravitational pull, not a rail.' },
        { h: 'When it matters and when it does not', p: 'The pull is strongest in the last days before a monthly expiry on a liquid name with concentrated open interest. It is close to meaningless right after a new cycle opens, or when news is repricing the stock faster than dealers can hedge.' },
        { h: 'How we show it', p: 'We publish max pain next to the current price so the gap is visible at a glance. A wide gap late in an expiry cycle is the setup worth noticing; the same gap on the first day of a cycle usually is not.' },
      ],
      related: ['gamma-exposure', 'call-wall'],
    },
    'gamma-exposure': {
      slug: 'gamma-exposure',
      title: 'What Is Gamma Exposure (GEX)? Dealer Hedging, Explained',
      desc: 'Gamma exposure describes how dealer hedging amplifies or dampens price moves. Here is what positive and negative gamma mean, and where the flip point matters.',
      h1: 'Gamma exposure, explained',
      lead: 'Gamma exposure measures how much dealers must buy or sell as the underlying moves, because of the options they are holding against customers.',
      sections: [
        { h: 'Positive gamma dampens moves', p: 'When dealers are net long gamma, hedging means selling into strength and buying into weakness. That is mechanically stabilising — it compresses realised volatility and tends to produce quiet, range-bound sessions.' },
        { h: 'Negative gamma amplifies them', p: 'When dealers are net short gamma, the hedge runs the other way: they buy as price rises and sell as it falls. The same news produces a bigger move, because hedging pushes in the direction of travel.' },
        { h: 'The gamma flip', p: 'The price where net dealer gamma crosses zero is the flip point. Above it, moves tend to be damped; below it, amplified. It is not a support or resistance level — it is a change in the character of the tape.' },
        { h: 'What it cannot tell you', p: 'Gamma describes how a move is likely to behave, not whether one is coming. It is a volatility regime input, not a directional signal, and anyone presenting it as the latter is overselling it.' },
      ],
      related: ['max-pain', 'options-flow'],
    },
    'call-wall': {
      slug: 'call-wall',
      title: 'Call Wall and Put Floor: Reading Open Interest Levels',
      desc: 'The call wall and put floor are the strikes with the heaviest open interest. Here is why they often act as short-term resistance and support, and when they break.',
      h1: 'Call wall and put floor, explained',
      lead: 'The call wall is the strike carrying the largest call open interest; the put floor is its downside counterpart. They matter because of who is on the other side of those contracts.',
      sections: [
        { h: 'Why a wall acts like resistance', p: 'Dealers short a large block of calls at one strike must hedge by holding shares. As price approaches that strike, the hedge is already largely in place, so further buying pressure meets supply from delta adjustments. The strike behaves like a soft ceiling.' },
        { h: 'Why a floor acts like support', p: 'The mirror image. Heavy put open interest below the price leaves dealers hedged short; as price falls toward the strike, their hedge adjustment becomes buying, which cushions the move.' },
        { h: 'When they break', p: 'These are crowd-positioning levels, not laws. A genuine catalyst — earnings, a rate decision, an unexpected filing — reprices the stock faster than positioning can hold it, and the wall gives way. The level then often flips role.' },
        { h: 'Using them well', p: 'Read them as where the crowd has money at risk, not as a forecast. They are most useful for framing a move that is already happening: knowing that price just cleared the call wall tells you something about who has to adjust next.' },
      ],
      related: ['max-pain', 'gamma-exposure'],
    },
    'put-call-ratio': {
      slug: 'put-call-ratio',
      title: 'Put/Call Ratio: What It Measures and How to Read It',
      desc: 'The put/call ratio compares put activity to call activity. Here is the difference between the volume and open-interest versions, and what the thresholds mean.',
      h1: 'Put/call ratio, explained',
      lead: 'The put/call ratio divides put activity by call activity. Below roughly 0.7 leans bullish; above roughly 1.0 leans defensive. The nuance is in which activity you are dividing.',
      sections: [
        { h: 'Volume vs open interest', p: 'The volume ratio uses contracts traded today — it is a snapshot of fresh intent and moves fast. The open-interest ratio uses contracts still outstanding — it is the accumulated standing position and moves slowly. They can disagree, and the disagreement is often the interesting part.' },
        { h: 'Reading the thresholds', p: 'Ratios are relative to the name, not absolute. A ticker whose options crowd is structurally hedge-heavy will sit above 1.0 all year without meaning anything. What matters is today against that name’s own baseline.' },
        { h: 'Why extremes are read as contrarian', p: 'When the ratio hits an extreme, positioning is crowded on one side. Crowded positioning is fragile positioning: the marginal buyer is exhausted, so the move that hurts the most people becomes the easier one.' },
        { h: 'Pairing it with flow', p: 'A ratio tells you the balance; it does not tell you who moved. Reading it alongside where the large premium actually printed is what turns it from trivia into context.' },
      ],
      related: ['options-flow', 'dark-pool'],
    },
    'options-flow': {
      slug: 'options-flow',
      title: 'What Is Options Flow? Reading Unusual Options Activity',
      desc: 'Options flow is the record of options actually trading. Here is what makes an order unusual, why sweeps matter, and how to avoid the common misreading.',
      h1: 'Options flow, explained',
      lead: 'Options flow is the stream of options orders as they print. Reading it well means separating routine hedging from orders that carry real conviction.',
      sections: [
        { h: 'What makes an order unusual', p: 'Size relative to that contract’s normal activity, premium paid, and whether the order lifted the offer or hit the bid. A large order that pays up across multiple exchanges is a different statement than a passive resting bid that eventually filled.' },
        { h: 'Sweeps versus blocks', p: 'A sweep splits an order across venues to fill immediately, accepting worse prices for speed — that urgency is the signal. A block is negotiated and printed at once, often as part of a hedge or a spread, and carries less directional information.' },
        { h: 'The most common misreading', p: 'A large call buy is not automatically bullish. It may be one leg of a spread, a hedge against a short stock position, or a covered-call roll. Treating every big call print as a bet on upside is the single most common error in reading flow.' },
        { h: 'What we show', p: 'We publish the flow alongside standing positioning — open interest, max pain, walls — so a single print can be read in the context of what was already there. One order rarely means much; one order against a shifting position often does.' },
      ],
      related: ['dark-pool', 'put-call-ratio'],
    },
  },

  ko: {
    'dark-pool': {
      slug: 'dark-pool',
      title: '다크풀 비중이란? 장외 거래 읽는 법',
      desc: '다크풀 비중은 공개 거래소 밖에서 체결된 거래의 비율입니다. 이 숫자가 무엇을 뜻하는지, 얼마부터 높은 것인지, 개별 종목에서 어떻게 읽는지 설명합니다.',
      h1: '다크풀 비중, 제대로 읽기',
      lead: '다크풀은 기관이 주문을 공개 호가창에 올리지 않고 거래하는 사설 체결 장소입니다. 거래 자체는 체결 후 테이프에 보고되지만, 주문이 채워지는 동안에는 의도가 드러나지 않습니다.',
      sections: [
        { h: '기관이 쓰는 이유', p: '연기금이 200만 주를 공개 거래소에서 사면 주문이 끝나기도 전에 가격이 자기 자신에게 불리하게 움직입니다. 다크풀로 우회하면 시세에 가깝게 채울 수 있습니다. 합법이고 규제 대상이며, 평범한 날에도 미국 주식 거래량의 약 40%가 장외에서 체결됩니다.' },
        { h: '이 퍼센트가 실제로 재는 것', p: '다크풀 비중은 그 종목의 그 세션에서 «장외 거래량 ÷ 총 거래량» 입니다. 비율이지 방향이 아닙니다 — 숫자가 높다는 건 큰 물량이 조용히 오갔다는 뜻이지, 사자였는지 팔자였는지는 말해주지 않습니다.' },
        { h: '읽는 법', p: '40% 안팎은 평범합니다. 한 종목에서 그보다 «지속적으로» 높게 나오면 이례적인 기관 참여이고, 옵션 포지션과 함께 봐야 방향을 짐작할 수 있습니다. 하루 높은 건 아무 의미 없고, 며칠 이어지면서 콜월이 올라가면 다른 이야기입니다.' },
        { h: '정직한 한계', p: '장외 체결에는 믿을 만한 매수/매도 표시가 없습니다. «다크풀 매수 신호»를 파는 쪽은 그 정보가 «없는» 데이터에서 방향을 추정하는 겁니다. 우리는 비중을 보여주고, 포지션과 결합하는 판단은 사용자에게 맡깁니다.' },
      ],
      related: ['options-flow', 'max-pain'],
    },
    'max-pain': {
      slug: 'max-pain',
      title: '맥스페인이란? 옵션 만기의 «가격 자석» 설명',
      desc: '맥스페인은 가장 많은 옵션이 휴지가 되는 행사가입니다. 계산 방법, 만기 직전에 가격이 그쪽으로 끌리는 이유, 그리고 의미가 없어지는 순간을 설명합니다.',
      h1: '맥스페인, 제대로 읽기',
      lead: '맥스페인은 미결제 옵션의 총 가치가 가장 크게 소멸하는 가격입니다. 옵션 매수자 집단 전체에 가장 큰 «고통»을 주는 가격이라는 뜻입니다.',
      sections: [
        { h: '계산 방법', p: '모든 행사가마다, 주가가 정확히 그 값으로 마감했을 때 미결제 콜과 풋이 갖게 될 가치를 전부 더합니다. 그 합이 가장 작은 행사가가 맥스페인입니다. 미결제약정에 대한 산수일 뿐, 예측 모형이 아닙니다.' },
        { h: '가격이 끌리는 이유', p: '그 옵션을 판 마켓메이커는 계속 헤지합니다. 만기가 가까워져 시간가치가 무너질수록, 그 헤지가 미결제약정이 몰린 곳에서 멀어지는 움직임을 억제하는 방향으로 작동합니다. 실재하지만 약한 효과입니다 — 레일이 아니라 «중력»입니다.' },
        { h: '의미 있을 때와 없을 때', p: '월물 만기 직전 며칠, 유동성 있는 종목, 미결제약정이 한 곳에 몰렸을 때 가장 강합니다. 새 사이클이 막 열린 직후나, 딜러가 헤지하는 속도보다 뉴스가 주가를 다시 매기는 속도가 빠를 때는 거의 무의미합니다.' },
        { h: '우리 화면에서', p: '현재가 바로 옆에 맥스페인을 띄워 격차가 한눈에 보이게 했습니다. 만기 사이클 후반의 큰 격차가 눈여겨볼 구도이고, 사이클 첫날의 같은 격차는 보통 아닙니다.' },
      ],
      related: ['gamma-exposure', 'call-wall'],
    },
    'gamma-exposure': {
      slug: 'gamma-exposure',
      title: '감마 노출(GEX)이란? 딜러 헤지가 시장을 흔드는 방식',
      desc: '감마 노출은 딜러 헤지가 가격 움직임을 증폭하거나 억제하는 정도입니다. 양의 감마와 음의 감마, 그리고 감마 플립 지점의 의미를 설명합니다.',
      h1: '감마 노출, 제대로 읽기',
      lead: '감마 노출은 기초자산이 움직일 때 딜러가 고객 반대편의 옵션 때문에 «얼마나 사고팔아야 하는지»를 나타냅니다.',
      sections: [
        { h: '양의 감마는 움직임을 억제한다', p: '딜러가 순매수 감마 상태면 헤지는 강세에 팔고 약세에 사는 방향입니다. 기계적으로 안정화 작용을 해서 실현 변동성을 눌러 조용한 박스권 장세를 만듭니다.' },
        { h: '음의 감마는 증폭한다', p: '딜러가 순매도 감마면 헤지가 반대로 돕니다 — 오르면 사고 내리면 팝니다. 같은 뉴스가 더 큰 움직임을 만듭니다. 헤지가 진행 방향으로 밀기 때문입니다.' },
        { h: '감마 플립', p: '딜러 순감마가 0을 지나는 가격이 플립 지점입니다. 위에서는 움직임이 눌리고 아래에서는 증폭됩니다. 지지·저항선이 아니라 «장의 성격이 바뀌는 경계»입니다.' },
        { h: '알려주지 못하는 것', p: '감마는 움직임이 «어떻게» 전개될지를 말하지, 움직임이 «올지»를 말하지 않습니다. 변동성 레짐 입력값이지 방향 신호가 아니며, 방향 신호처럼 파는 쪽은 과장하는 겁니다.' },
      ],
      related: ['max-pain', 'options-flow'],
    },
    'call-wall': {
      slug: 'call-wall',
      title: '콜월과 풋플로어 — 미결제약정 레벨 읽는 법',
      desc: '콜월과 풋플로어는 미결제약정이 가장 두꺼운 행사가입니다. 단기 저항·지지처럼 작동하는 이유와 무너지는 순간을 설명합니다.',
      h1: '콜월과 풋플로어, 제대로 읽기',
      lead: '콜월은 콜 미결제약정이 가장 많은 행사가, 풋플로어는 그 하방 짝입니다. 중요한 이유는 «그 계약 반대편에 누가 있는가» 때문입니다.',
      sections: [
        { h: '콜월이 저항처럼 보이는 이유', p: '한 행사가에서 콜을 대량 매도한 딜러는 주식을 보유해 헤지합니다. 가격이 그 행사가에 다가갈 때쯤이면 헤지가 이미 대부분 채워져 있어, 추가 매수 압력이 델타 조정 물량과 만납니다. 그 행사가가 «부드러운 천장»처럼 작동합니다.' },
        { h: '풋플로어가 지지처럼 보이는 이유', p: '거울상입니다. 현재가 아래에 풋 미결제약정이 두꺼우면 딜러는 숏 헤지 상태이고, 가격이 그 행사가로 내려갈수록 헤지 조정이 «매수»가 되어 하락을 완충합니다.' },
        { h: '무너질 때', p: '이건 군중 포지션이지 법칙이 아닙니다. 실적, 금리 결정, 예상 못 한 공시 같은 진짜 촉매가 나오면 포지션이 버티는 속도보다 빠르게 주가가 다시 매겨지고 벽은 뚫립니다. 그 뒤엔 역할이 뒤바뀌는 경우가 많습니다.' },
        { h: '잘 쓰는 법', p: '예측이 아니라 «군중의 돈이 걸린 자리»로 읽으세요. 이미 벌어지고 있는 움직임의 틀을 잡는 데 가장 유용합니다 — 방금 콜월을 뚫었다는 사실은 «다음에 누가 조정해야 하는가»를 알려줍니다.' },
      ],
      related: ['max-pain', 'gamma-exposure'],
    },
    'put-call-ratio': {
      slug: 'put-call-ratio',
      title: '풋콜 비율 — 무엇을 재고 어떻게 읽는가',
      desc: '풋콜 비율은 풋 활동을 콜 활동으로 나눈 값입니다. 거래량 기준과 미결제약정 기준의 차이, 그리고 임계값의 의미를 설명합니다.',
      h1: '풋콜 비율, 제대로 읽기',
      lead: '풋콜 비율은 풋 활동을 콜 활동으로 나눈 값입니다. 대략 0.7 아래면 강세 쪽, 1.0 위면 방어적으로 기울었다고 봅니다. 미묘한 부분은 «무엇을 나누느냐»에 있습니다.',
      sections: [
        { h: '거래량 기준 vs 미결제약정 기준', p: '거래량 비율은 오늘 체결된 계약을 씁니다 — 새로 생긴 의도의 스냅숏이고 빠르게 움직입니다. 미결제약정 비율은 아직 남아 있는 계약을 씁니다 — 누적된 상시 포지션이고 느리게 움직입니다. 둘은 어긋날 수 있고, 어긋나는 지점이 대개 흥미로운 부분입니다.' },
        { h: '임계값 읽기', p: '비율은 절대값이 아니라 그 종목 기준입니다. 옵션 군중이 구조적으로 헤지 중심인 종목은 일 년 내내 1.0 위에 있으면서도 아무 의미가 없습니다. 중요한 건 «그 종목 자신의 평소 대비 오늘» 입니다.' },
        { h: '극단값을 역발상으로 읽는 이유', p: '비율이 극단에 닿으면 포지션이 한쪽에 몰려 있다는 뜻입니다. 몰린 포지션은 취약한 포지션입니다 — 한계 매수자가 소진되어, 가장 많은 사람을 아프게 하는 움직임이 오히려 «쉬운» 쪽이 됩니다.' },
        { h: '플로우와 함께 보기', p: '비율은 균형을 알려주지 «누가 움직였는지»는 알려주지 않습니다. 큰 프리미엄이 실제로 어디서 찍혔는지와 함께 읽을 때 잡학에서 «맥락»으로 바뀝니다.' },
      ],
      related: ['options-flow', 'dark-pool'],
    },
    'options-flow': {
      slug: 'options-flow',
      title: '옵션 플로우란? 이상 옵션 거래 읽는 법',
      desc: '옵션 플로우는 실제로 체결된 옵션 거래의 기록입니다. 무엇이 «이상»인지, 스윕이 왜 중요한지, 그리고 가장 흔한 오독을 설명합니다.',
      h1: '옵션 플로우, 제대로 읽기',
      lead: '옵션 플로우는 옵션 주문이 체결되는 흐름입니다. 잘 읽는다는 건 «일상적인 헤지»와 «진짜 확신이 실린 주문»을 갈라내는 일입니다.',
      sections: [
        { h: '무엇이 «이상»인가', p: '그 계약의 평소 활동 대비 크기, 지불한 프리미엄, 그리고 매도호가를 걷어갔는지 매수호가를 때렸는지입니다. 여러 거래소를 가로질러 «비싸게라도» 채운 대량 주문은, 가만히 걸어두고 결국 체결된 주문과 전혀 다른 진술입니다.' },
        { h: '스윕 vs 블록', p: '스윕은 즉시 채우려고 여러 거래소로 쪼갠 주문입니다 — 속도를 위해 나쁜 가격을 감수하고, 그 «다급함»이 곧 신호입니다. 블록은 협의해서 한 번에 찍는 거래로, 헤지나 스프레드의 일부인 경우가 많아 방향성 정보가 적습니다.' },
        { h: '가장 흔한 오독', p: '큰 콜 매수가 자동으로 강세는 «아닙니다». 스프레드의 한 다리일 수도, 주식 숏에 대한 헤지일 수도, 커버드콜 롤링일 수도 있습니다. 큰 콜 체결을 전부 상승 베팅으로 읽는 것이 플로우 해석에서 가장 흔한 실수입니다.' },
        { h: '우리가 보여주는 것', p: '플로우를 상시 포지션(미결제약정·맥스페인·벽)과 «나란히» 보여줍니다. 한 건의 체결만으로는 알 수 없는 것이, 변하고 있는 포지션과 대조하면 보이기 때문입니다.' },
      ],
      related: ['dark-pool', 'put-call-ratio'],
    },
  },

  ja: {
    'dark-pool': {
      slug: 'dark-pool',
      title: 'ダークプール比率とは？取引所外取引の読み方',
      desc: 'ダークプール比率は、公開取引所の外で成立した取引の割合です。この数字が何を意味し、どこからが高いのか、個別銘柄でどう読むかを解説します。',
      h1: 'ダークプール比率の読み方',
      lead: 'ダークプールは、機関投資家が注文を公開板に出さずに取引する私設の執行場所です。約定自体は事後にテープへ報告されますが、注文が埋まる間は意図が見えません。',
      sections: [
        { h: '機関が使う理由', p: '年金基金が200万株を公開市場で買えば、注文が終わる前に価格が自分に不利に動きます。ダークプール経由なら現在値に近い水準で埋められます。合法かつ規制下にあり、平常時でも米国株の出来高の約40%が取引所外で成立します。' },
        { h: 'この％が実際に測るもの', p: 'ダークプール比率は、その銘柄・そのセッションにおける「取引所外出来高 ÷ 総出来高」です。比率であって方向ではありません — 数字が高いのは大口が静かに動いたという意味で、買いか売りかは示しません。' },
        { h: '読み方', p: '40%前後は普通です。一銘柄でそれを大きく超える状態が「続く」なら異例の機関参加で、方向を推し量るにはオプションのポジションと合わせて見る必要があります。一日高いだけでは何も言えず、数日続きながらコールウォールが切り上がるなら別の話です。' },
        { h: '正直な限界', p: '取引所外の約定には信頼できる売買フラグがありません。「ダークプール買いシグナル」を売る側は、その情報が「入っていない」データから方向を推定しています。当社は比率を示し、ポジションと組み合わせる判断は利用者に委ねます。' },
      ],
      related: ['options-flow', 'max-pain'],
    },
    'max-pain': {
      slug: 'max-pain',
      title: 'マックスペインとは？オプション満期の「価格の磁石」',
      desc: 'マックスペインは、最も多くのオプションが無価値で満期を迎える権利行使価格です。計算方法、満期直前に価格が引き寄せられる理由、意味を失う場面を解説します。',
      h1: 'マックスペインの読み方',
      lead: 'マックスペインは、建玉の総価値が最も大きく消滅する価格です。オプション買い手全体に最大の「痛み」を与える価格、という意味です。',
      sections: [
        { h: '計算方法', p: '各権利行使価格について、株価がちょうどそこで引けた場合に建玉のコールとプットが持つ価値をすべて合計します。その合計が最小になる価格がマックスペインです。建玉に対する算術であり、予測モデルではありません。' },
        { h: '価格が引き寄せられる理由', p: 'そのオプションを売ったマーケットメイカーは継続的にヘッジします。満期が近づき時間価値が崩れるほど、そのヘッジが建玉の厚い水準から離れる動きを抑える方向に働きます。実在するが弱い効果です — レールではなく「重力」です。' },
        { h: '効く場面と効かない場面', p: '月限の満期直前の数日、流動性のある銘柄、建玉が一点に集中しているときに最も強く働きます。新しいサイクルが始まった直後や、ディーラーのヘッジより速くニュースが株価を値洗いしているときはほぼ無意味です。' },
        { h: '当社の表示', p: '現在値のすぐ横にマックスペインを置き、乖離が一目で分かるようにしています。満期サイクル後半の大きな乖離が注目すべき構図で、サイクル初日の同じ乖離は通常そうではありません。' },
      ],
      related: ['gamma-exposure', 'call-wall'],
    },
    'gamma-exposure': {
      slug: 'gamma-exposure',
      title: 'ガンマエクスポージャー(GEX)とは？ディーラーヘッジの仕組み',
      desc: 'ガンマエクスポージャーは、ディーラーのヘッジが値動きを増幅するか抑制するかを表します。正負のガンマと、ガンマフリップの意味を解説します。',
      h1: 'ガンマエクスポージャーの読み方',
      lead: 'ガンマエクスポージャーは、原資産が動いたときにディーラーが顧客の反対side のオプションのためにどれだけ売買しなければならないかを示します。',
      sections: [
        { h: '正のガンマは動きを抑える', p: 'ディーラーがネットでガンマ買いの状態だと、ヘッジは強いところで売り、弱いところで買う方向になります。機械的に安定化に働き、実現ボラティリティを圧縮して静かなレンジ相場を生みます。' },
        { h: '負のガンマは増幅する', p: 'ディーラーがネットでガンマ売りだと、ヘッジは逆に回ります — 上がれば買い、下がれば売る。同じニュースがより大きな動きを生みます。ヘッジが進行方向へ押すからです。' },
        { h: 'ガンマフリップ', p: 'ディーラーのネットガンマがゼロを跨ぐ価格がフリップ地点です。その上では動きが抑えられ、下では増幅されます。支持線・抵抗線ではなく「相場の性格が変わる境目」です。' },
        { h: '示せないこと', p: 'ガンマは動きが「どう」展開するかを語り、動きが「来るか」は語りません。ボラティリティ・レジームの入力値であって方向シグナルではなく、方向シグナルとして売る側は誇張しています。' },
      ],
      related: ['max-pain', 'options-flow'],
    },
    'call-wall': {
      slug: 'call-wall',
      title: 'コールウォールとプットフロア — 建玉水準の読み方',
      desc: 'コールウォールとプットフロアは建玉が最も厚い権利行使価格です。短期の抵抗・支持として働く理由と、崩れる場面を解説します。',
      h1: 'コールウォールとプットフロアの読み方',
      lead: 'コールウォールはコール建玉が最も多い権利行使価格、プットフロアはその下方の対です。重要なのは「その契約の反対側に誰がいるか」だからです。',
      sections: [
        { h: 'ウォールが抵抗のように働く理由', p: 'ある権利行使価格でコールを大量に売ったディーラーは、株式を保有してヘッジします。価格がその水準に近づく頃にはヘッジがほぼ埋まっており、追加の買い圧力がデルタ調整の供給とぶつかります。その価格が「柔らかい天井」のように働きます。' },
        { h: 'フロアが支持のように働く理由', p: '鏡像です。現在値の下にプット建玉が厚いとディーラーはショートヘッジの状態で、価格がその水準へ下がるほどヘッジ調整が「買い」となり下落を和らげます。' },
        { h: '崩れるとき', p: 'これは群衆のポジションであって法則ではありません。決算、金利決定、想定外の開示といった本物の触媒が出れば、ポジションが支える速度より速く株価が値洗いされ、ウォールは破られます。その後は役割が入れ替わることが多いです。' },
        { h: '上手な使い方', p: '予測ではなく「群衆の資金が置かれている場所」として読んでください。すでに起きている動きの枠組みを掴むのに最も有用です — いまコールウォールを抜けたという事実は「次に誰が調整しなければならないか」を教えてくれます。' },
      ],
      related: ['max-pain', 'gamma-exposure'],
    },
    'put-call-ratio': {
      slug: 'put-call-ratio',
      title: 'プットコールレシオ — 何を測り、どう読むか',
      desc: 'プットコールレシオはプットの活動をコールの活動で割った値です。出来高ベースと建玉ベースの違い、しきい値の意味を解説します。',
      h1: 'プットコールレシオの読み方',
      lead: 'プットコールレシオはプットの活動をコールの活動で割った値です。概ね0.7未満なら強気寄り、1.0超なら防御寄り。妙味は「何を割っているか」にあります。',
      sections: [
        { h: '出来高ベース vs 建玉ベース', p: '出来高レシオは今日成立した契約を使います — 新しい意図のスナップショットで速く動きます。建玉レシオは残っている契約を使います — 積み上がった常設ポジションで遅く動きます。両者は食い違うことがあり、その食い違いこそ面白い部分です。' },
        { h: 'しきい値の読み方', p: 'レシオは絶対値ではなく銘柄基準です。オプションの群衆が構造的にヘッジ中心の銘柄は、一年中1.0超にいながら何の意味も持ちません。重要なのは「その銘柄自身の平常時に対する今日」です。' },
        { h: '極端値を逆張りで読む理由', p: 'レシオが極端に振れると、ポジションが片側に偏っているということです。偏ったポジションは脆いポジションです — 限界的な買い手が尽き、最も多くの人が痛む動きの方が「起きやすく」なります。' },
        { h: 'フローと合わせて見る', p: 'レシオはバランスを教えますが「誰が動いたか」は教えません。大きなプレミアムが実際にどこで約定したかと併せて読むことで、雑学から「文脈」に変わります。' },
      ],
      related: ['options-flow', 'dark-pool'],
    },
    'options-flow': {
      slug: 'options-flow',
      title: 'オプションフローとは？異常オプション取引の読み方',
      desc: 'オプションフローは実際に成立したオプション取引の記録です。何が「異常」なのか、スイープがなぜ重要か、最もよくある誤読を解説します。',
      h1: 'オプションフローの読み方',
      lead: 'オプションフローはオプション注文が約定していく流れです。上手に読むとは「日常的なヘッジ」と「本物の確信が乗った注文」を切り分けることです。',
      sections: [
        { h: '何が「異常」か', p: 'その契約の通常の活動に対する大きさ、支払ったプレミアム、そして売り気配を取りに行ったか買い気配を叩いたか。複数の取引所をまたいで「高くても」埋めた大口注文は、置いておいて結局約定した注文とはまったく別の意思表示です。' },
        { h: 'スイープ vs ブロック', p: 'スイープは即時に埋めるため複数venue に分割した注文で、速度のために悪い価格を受け入れます — その「切迫感」こそがシグナルです。ブロックは相対で一度に printされ、ヘッジやスプレッドの一部であることが多く方向情報は乏しくなります。' },
        { h: '最もよくある誤読', p: '大きなコール買いが自動的に強気とは「限りません」。スプレッドの一本かもしれず、株式ショートに対するヘッジかもしれず、カバードコールのロールかもしれません。大口のコール約定をすべて上昇への賭けと読むのが、フロー解釈で最も多い誤りです。' },
        { h: '当社が示すもの', p: 'フローを常設ポジション(建玉・マックスペイン・ウォール)と「並べて」表示します。一件の約定だけでは分からないことが、変化しつつあるポジションと対照すると見えてくるからです。' },
      ],
      related: ['dark-pool', 'put-call-ratio'],
    },
  },
};
