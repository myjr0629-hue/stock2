// ============================================================================
// metricGlossary — central, 3-language (ko/en/ja) definitions for the app's
// less-familiar indicators. Drop <MetricInfo term="..." /> next to any label.
//
// Compliance: OBSERVER only. Definitions describe what a metric IS and what is
// *observed*, never advice or prediction (no buy/sell/will/should/target).
// Keep every term filled for all three languages.
// ============================================================================

export type Lang = 'ko' | 'en' | 'ja';

export interface GlossaryEntry {
  title: Record<Lang, string>;
  body: Record<Lang, string>;
}

export type MetricTerm =
  | 'gexTimeline'
  | 'gex'
  | 'gammaFlip'
  | 'callWall'
  | 'putFloor'
  | 'maxPain'
  | 'darkPool'
  | 'liquidity'
  | 'volSqueeze'
  | 'trendStrength'
  | 'moneyFlow'
  | 'volPremium'
  | 'creditSpread'
  | 'atr'
  | 'blockTrades'
  | 'ivRank'
  | 'ivSkew'
  | 'impliedMove'
  | 'netPremium'
  | 'opi'
  | 'pcr'
  | 'squeeze'
  | 'whale'
  | 'rsi'
  | 'vwap'
  | 'shortInterest'
  | 'volRegime'
  | 'conviction'
  | 'trendPhase'
  | 'fundamental'
  | 'institutional13f'
  | 'insiderActivity'
  // macro track (WIM curriculum — reusable app-wide)
  | 'rate10y'
  | 'fomc'
  | 'cpi'
  | 'jobsReport'
  | 'yieldCurve'
  | 'dollarIndex'
  | 'vix'
  // news-reading track (WIM curriculum)
  | 'guidance'
  | 'consensus'
  | 'sectorRotation'
  | 'riskOnOff';

export const CLOSE_LABEL: Record<Lang, string> = { ko: '확인', en: 'Got it', ja: '閉じる' };

export const METRIC_GLOSSARY: Record<MetricTerm, GlossaryEntry> = {
  gexTimeline: {
    title: { ko: 'GEX 타임라인이란?', en: 'What is the GEX Timeline?', ja: 'GEXタイムラインとは？' },
    body: {
      ko: '딜러(옵션 마켓메이커)가 떠안은 감마 포지션의 30일 추이입니다. 음수(숏 감마)면 딜러 헤지가 가격 변동을 키우고, 양수(롱 감마)면 변동을 억제합니다. 이 종목이 구조적으로 "잘 튀는지" "눌리는지"를 보여줍니다.',
      en: 'The 30-day trend of dealer (option market-maker) gamma positioning. Negative (short gamma) means dealer hedging amplifies price moves; positive (long gamma) dampens them — i.e. whether this name is structurally "jumpy" or "pinned".',
      ja: 'ディーラー（オプション・マーケットメイカー）が抱えるガンマ・ポジションの30日推移です。マイナス（ショートガンマ）はヘッジが値動きを増幅し、プラス（ロングガンマ）は抑制します。この銘柄が構造的に「動きやすい」か「抑えられている」かを示します。',
    },
  },
  gex: {
    title: { ko: 'GEX (감마 익스포저)', en: 'GEX (Gamma Exposure)', ja: 'GEX（ガンマ・エクスポージャー）' },
    body: {
      ko: '딜러가 보유한 옵션 감마의 순합계입니다. 음수면 딜러가 하락엔 더 팔고 상승엔 더 사야 해 변동성이 증폭되는 구조가, 양수면 변동성이 억제되는 구조가 관찰됩니다.',
      en: "The net sum of dealers' option gamma. Negative readings are associated with an amplifying structure (dealers sell into drops, buy into rallies); positive readings with a dampening, range-holding structure.",
      ja: 'ディーラーが保有するオプション・ガンマの純合計です。マイナスは変動が増幅されやすい構造、プラスは変動が抑えられやすい構造として観測されます。',
    },
  },
  gammaFlip: {
    title: { ko: '감마 플립', en: 'Gamma Flip', ja: 'ガンマフリップ' },
    body: {
      ko: '딜러의 순감마가 0을 교차하는 가격대입니다. 이 위에선 안정(롱 감마), 아래에선 증폭(숏 감마) 환경이 관찰되어 레짐 전환 기준선으로 쓰입니다.',
      en: 'The price where dealer net gamma crosses zero. Above it a stabilizing (long-gamma) environment is observed; below it an amplifying (short-gamma) one — a regime-transition reference level.',
      ja: 'ディーラーの純ガンマがゼロを横切る価格帯です。上では安定（ロングガンマ）、下では増幅（ショートガンマ）の環境が観測され、レジーム転換の基準線として用いられます。',
    },
  },
  callWall: {
    title: { ko: '콜 월 (Call Wall)', en: 'Call Wall', ja: 'コールウォール' },
    body: {
      ko: '콜 옵션 미결제약정·감마가 가장 두껍게 쌓인 상단 가격대입니다. 딜러 헤지가 가격을 누르는 경향이 있어 저항 구간으로 자주 관찰됩니다.',
      en: 'The strike above price with the heaviest call open interest / gamma. Dealer hedging there tends to cap price, so it is frequently observed as a resistance zone.',
      ja: 'コールの建玉・ガンマが最も厚い上方の価格帯です。ディーラーのヘッジが価格を抑える傾向があり、抵抗帯として観測されやすい水準です。',
    },
  },
  putFloor: {
    title: { ko: '풋 플로어 (Put Floor)', en: 'Put Floor', ja: 'プットフロア' },
    body: {
      ko: '풋 옵션 미결제약정·감마가 가장 두껍게 쌓인 하단 가격대입니다. 딜러 헤지가 하락을 받치는 경향이 있어 지지 구간으로 자주 관찰됩니다.',
      en: 'The strike below price with the heaviest put open interest / gamma. Dealer hedging there tends to cushion declines, so it is frequently observed as a support zone.',
      ja: 'プットの建玉・ガンマが最も厚い下方の価格帯です。ディーラーのヘッジが下落を支える傾向があり、支持帯として観測されやすい水準です。',
    },
  },
  maxPain: {
    title: { ko: '맥스 페인 (Max Pain)', en: 'Max Pain', ja: 'マックスペイン' },
    body: {
      ko: '만기 시 옵션 보유자 전체의 손실이 가장 커지는(=발행자 이익이 최대인) 가격대입니다. 만기 부근에서 가격이 이 수준으로 수렴하는 경향이 관찰되곤 합니다.',
      en: 'The strike at which the most options expire worthless (greatest aggregate option-holder loss). Price is sometimes observed to gravitate toward this level near expiry.',
      ja: '満期時にオプション保有者全体の損失が最大となる価格帯です。満期付近で価格がこの水準へ収束する傾向が観測されることがあります。',
    },
  },
  darkPool: {
    title: { ko: '다크풀 (Dark Pool)', en: 'Dark Pool', ja: 'ダークプール' },
    body: {
      ko: '거래소 밖(장외)에서 체결된 거래 비중입니다. 대형 기관이 시장 충격을 줄이려 쓰는 경로로, 비율이 높을수록 기관 활동이 활발한 것으로 관찰됩니다.',
      en: 'The share of volume executed off-exchange. Large institutions use it to reduce market impact, so a higher percentage is associated with heavier institutional activity.',
      ja: '取引所外（店頭）で約定した取引の割合です。大口機関が市場インパクトを抑えるために用いる経路で、比率が高いほど機関の活動が活発と観測されます。',
    },
  },
  liquidity: {
    title: { ko: '유동성 (Liquidity)', en: 'Liquidity', ja: '流動性' },
    body: {
      ko: '매수·매도 호가 차이(스프레드)로 매긴 0~100 점수입니다. 점수가 높을수록 호가가 촘촘해, 큰 물량이 들어와도 가격이 잘 밀리지 않습니다. 낮으면 시장이 얇아 같은 물량에도 가격이 크게 흔들립니다. 정규장 체결 기준으로 계산하며, 장 마감 후에는 직전 정규장 값을 보여줍니다.',
      en: 'A 0-100 score derived from the bid-ask spread. A higher score means tighter quotes, so large orders move price less. A lower score means a thin market where the same size swings price more. Computed from regular-session trading; after the close it shows the last regular session.',
      ja: '売買気配の差（スプレッド）から算出した0〜100のスコアです。高いほど気配が厚く、大口注文でも価格が動きにくいことを示します。低いと市場が薄く、同じ数量でも価格が大きく振れます。通常取引時間の約定を基準に計算し、引け後は直近の通常取引時間の値を表示します。',
    },
  },
  volSqueeze: {
    title: { ko: '변동성 압축 (Volatility Squeeze)', en: 'Volatility Squeeze', ja: 'ボラティリティ圧縮' },
    body: {
      ko: '볼린저 밴드의 폭이 지난 130거래일 분포에서 몇 번째 백분위인지 나타냅니다. 값이 낮을수록 최근 가격 변동폭이 이례적으로 좁다는 뜻이며, 이런 압축 구간 뒤에 변동성이 확대되는 흐름이 자주 관찰됩니다. 방향은 알려주지 않습니다 — 위로 터질지 아래로 터질지는 다른 지표와 함께 보아야 합니다. 20% 이하를 압축, 10% 이하를 극단적 압축으로 표시합니다.',
      en: 'Where the current Bollinger band width sits in its own 130-session distribution. A low reading means the recent trading range is unusually narrow, and volatility expansion is often observed after such compression. It says nothing about direction — whether the move resolves up or down must be read alongside other indicators. Below 20% is flagged as a squeeze, below 10% as extreme.',
      ja: 'ボリンジャーバンドの幅が過去130営業日の分布の何パーセンタイルに位置するかを示します。値が低いほど直近の値幅が異例に狭いことを意味し、こうした圧縮局面の後にボラティリティが拡大する動きがしばしば観測されます。方向は示しません — 上下どちらに放れるかは他の指標と併せて判断する必要があります。20%以下を圧縮、10%以下を極端な圧縮として表示します。',
    },
  },
  trendStrength: {
    title: { ko: '추세 강도 (ADX)', en: 'Trend Strength (ADX)', ja: 'トレンド強度 (ADX)' },
    body: {
      ko: '추세가 「어느 방향인지」가 아니라 「있기는 한지」를 재는 지표입니다. 20 아래면 뚜렷한 추세가 없는 구간으로 보며, 이때 나오는 골든크로스·데드크로스는 방향이 자주 바뀌어 신뢰도가 낮게 관찰됩니다. 25를 넘으면 추세가 형성된 것으로, 40을 넘으면 강한 추세로 봅니다. 교차 신호가 났는데 강도가 낮으면 카드 테두리로 표시해 알려드립니다.',
      en: 'Measures whether a trend exists at all, not which way it points. Below 20 is treated as a trendless range, where golden/dead crosses tend to flip direction and are observed to be less reliable. Above 25 indicates an established trend, above 40 a strong one. When a cross appears while strength is low, the card border flags it.',
      ja: 'トレンドの「方向」ではなく「そもそも存在するか」を測る指標です。20未満はトレンドが不明瞭な局面とみなし、この状態でのゴールデンクロス・デッドクロスは方向が頻繁に反転し信頼度が低いと観測されます。25超でトレンド形成、40超で強いトレンドとみます。クロスが出ていて強度が低い場合はカードの枠線で示します。',
    },
  },
  moneyFlow: {
    title: { ko: '자금 흐름 (OBV)', en: 'Money Flow (OBV)', ja: '資金フロー (OBV)' },
    body: {
      ko: '상승한 날의 거래량은 더하고 하락한 날은 빼서 누적한 값의 20거래일 변화율입니다. 가격이 오르는데 이 값이 줄면 상승을 뒷받침하는 자금이 따라오지 않는다는 뜻으로, 반대의 경우도 마찬가지입니다. 이런 어긋남(다이버전스)이 나타나면 카드 테두리로 강조합니다. 방향을 단정하는 지표가 아니라 가격과 수급이 같은 이야기를 하는지 확인하는 용도입니다.',
      en: "The 20-session change in on-balance volume — volume added on up days, subtracted on down days. If price rises while this falls, the move is not being backed by flow, and vice versa. When that divergence appears, the card border highlights it. It is a cross-check on whether price and flow tell the same story, not a directional call.",
      ja: '上昇日の出来高を加算し下落日を減算して累積した値の、20営業日変化率です。価格が上昇しているのにこの値が減少していれば、上昇を支える資金が伴っていないことを意味し、逆も同様です。この乖離（ダイバージェンス）が現れた場合はカードの枠線で強調します。方向を断定する指標ではなく、価格と需給が同じ話をしているかを確認するためのものです。',
    },
  },
  volPremium: {
    title: { ko: '변동성 프리미엄 (IV − 실현)', en: 'Volatility Premium (IV − RV)', ja: 'ボラティリティプレミアム (IV − RV)' },
    body: {
      ko: '옵션 시장이 기대하는 변동성(IV)에서 실제로 나타난 변동성(20일 종가 기준)을 뺀 값입니다. 양수가 크면 옵션이 실제 움직임 대비 비싸게 거래되는 상태로, 음수가 크면 그 반대로 관찰됩니다. 주가의 방향이 아니라 옵션 「가격의 적정성」을 말하는 지표입니다. ±10%p 안쪽은 계산 오차와 만기 구조 차이로 갈릴 수 있어 중립으로 표시합니다.',
      en: "Implied volatility from the option chain minus realized volatility computed from 20 sessions of closes. A large positive reading means options are priced richly relative to how the stock has actually moved; a large negative reading is the reverse. It speaks to the fairness of option pricing, not to price direction. Within ±10 points it is shown as neutral, since calculation and term-structure differences can account for that range.",
      ja: 'オプション市場が織り込む変動率（IV）から、実際に生じた変動率（20日終値ベース）を差し引いた値です。プラスが大きいほどオプションが実際の値動きに対して割高に取引されている状態、マイナスが大きいほどその逆として観測されます。株価の方向ではなくオプション「価格の妥当性」を示す指標です。±10ポイント以内は計算誤差や限月構造の違いで振れうるため中立として表示します。',
    },
  },
  creditSpread: {
    title: { ko: '신용 스프레드 (하이일드)', en: 'Credit Spread (High Yield)', ja: 'クレジットスプレッド（ハイイールド）' },
    body: {
      ko: '신용도가 낮은 기업의 회사채가 국채 대비 얼마나 높은 금리를 요구받는지를 나타냅니다. 채권시장이 위험을 어떻게 보는지를 가장 직접적으로 보여주는 값으로, 벌어지면 위험 회피, 좁아지면 위험 선호로 해석됩니다. 주가는 오르는데 스프레드가 벌어지는 구간은 주식과 채권이 서로 다른 이야기를 하는 상태로 관찰됩니다. 절대 수준보다 방향과 1년 분포 내 위치를 함께 봅니다.',
      en: 'How much extra yield lower-rated corporate bonds must offer over Treasuries. It is the most direct read on how the credit market prices risk: widening reads as risk-off, tightening as risk-on. Stretches where equities rise while spreads widen are observed as stocks and bonds telling different stories. Direction and position within the past year matter more than the absolute level.',
      ja: '信用力の低い企業の社債が国債に対してどれだけ高い利回りを要求されているかを示します。債券市場がリスクをどう見ているかを最も直接的に表す値で、拡大すればリスク回避、縮小すればリスク選好と解釈されます。株価が上昇する一方でスプレッドが拡大する局面は、株式と債券が異なる話をしている状態として観測されます。絶対水準より方向と過去1年の分布内の位置を併せて見ます。',
    },
  },
  atr: {
    title: { ko: '평균 실제 변동폭 (ATR)', en: 'Average True Range (ATR)', ja: '平均実質変動幅 (ATR)' },
    body: {
      ko: '최근 하루 동안 실제로 움직인 폭의 평균입니다. 전날 종가와의 갭까지 포함해 계산하므로 장중 고저 차이만 보는 것보다 실제 변동을 잘 반영합니다. 오늘의 움직임이 평소 대비 큰지 작은지 가늠하거나, 손절 폭·포지션 크기를 정할 때 기준으로 쓰입니다. 옵션 IV가 「기대되는 변동」이라면 이 값은 「실제로 있었던 변동」입니다.',
      en: 'The average distance the price has actually traveled in a session, including any gap from the prior close — so it reflects real movement better than the intraday high-low range alone. It is used to judge whether today is unusually active, and to size stops or positions. If option IV is the expected move, this is the move that actually happened.',
      ja: '直近の1日で実際に動いた値幅の平均です。前日終値からのギャップも含めて計算するため、日中の高安差だけを見るより実際の変動をよく反映します。今日の動きが普段に比べ大きいか小さいかの判断や、損切り幅・ポジションサイズの基準として使われます。オプションのIVが「期待される変動」なら、こちらは「実際にあった変動」です。',
    },
  },
  blockTrades: {
    title: { ko: '블록 트레이드', en: 'Block Trades', ja: 'ブロック取引' },
    body: {
      ko: '한 번에 체결된 대형 단일 거래 건수입니다. 대개 기관의 대량 매매로, 빈도가 높으면 큰손의 포지션 움직임이 관찰됩니다.',
      en: 'The count of large single-print trades. These are typically institutional, so a higher count reflects sizeable players moving positions.',
      ja: '一度に約定した大口単一取引の件数です。多くは機関の大量売買で、件数が多いと大口のポジション移動が観測されます。',
    },
  },
  ivRank: {
    title: { ko: 'IV 랭크 (IV Rank)', en: 'IV Rank', ja: 'IVランク' },
    body: {
      ko: '현재 내재변동성(IV)이 지난 1년 범위에서 어느 위치인지를 0~100으로 나타낸 값입니다. 높을수록 옵션이 역사적으로 비싸게(변동성 고평가) 관찰됩니다.',
      en: 'Where current implied volatility sits within its own 1-year range, on a 0–100 scale. Higher means options are historically expensive (elevated volatility) relative to the past year.',
      ja: '現在の予想変動率（IV）が過去1年のレンジ内でどの位置かを0〜100で示します。高いほどオプションが過去比で割高（ボラ高）として観測されます。',
    },
  },
  ivSkew: {
    title: { ko: 'IV 스큐 (IV Skew)', en: 'IV Skew', ja: 'IVスキュー' },
    body: {
      ko: '풋과 콜의 내재변동성 차이입니다. 풋 쪽이 비쌀수록(스큐 확대) 하방 헤지 수요가 큰 것으로, 콜 쪽이 비싸면 상방 베팅 수요가 관찰됩니다.',
      en: 'The difference in implied volatility between puts and calls. Richer puts (wider skew) reflect stronger downside-hedging demand; richer calls reflect upside-bet demand.',
      ja: 'プットとコールの予想変動率の差です。プットが割高（スキュー拡大）なら下方ヘッジ需要、コールが割高なら上方ベット需要が観測されます。',
    },
  },
  impliedMove: {
    title: { ko: '내재 변동폭 (Implied Move)', en: 'Implied Move', ja: '想定変動幅' },
    body: {
      ko: '옵션 가격에 반영된, 시장이 예상하는 가격 변동 범위입니다. 어닝 등 이벤트를 앞두고 옵션 시장이 얼마만큼의 움직임을 가격에 반영하고 있는지를 보여줍니다.',
      en: 'The price range the options market is pricing in. It shows how large a move option prices currently embed — useful context around events like earnings.',
      ja: 'オプション価格に織り込まれた、市場が想定する変動範囲です。決算などのイベント前にオプション市場がどれだけの動きを織り込んでいるかを示します。',
    },
  },
  netPremium: {
    title: { ko: '넷 프리미엄 (Net Premium)', en: 'Net Premium', ja: 'ネットプレミアム' },
    body: {
      ko: '콜에 유입된 프리미엄에서 풋 프리미엄을 뺀 순액입니다. 양수면 콜 쪽(상방), 음수면 풋 쪽(하방)으로 자금이 기운 옵션 플로우가 관찰됩니다.',
      en: 'Premium paid into calls minus premium into puts. Positive readings reflect flow tilted to the call (upside) side, negative to the put (downside) side.',
      ja: 'コールに入ったプレミアムからプットを差し引いた純額です。プラスはコール（上方）、マイナスはプット（下方）寄りのフローが観測されます。',
    },
  },
  opi: {
    title: { ko: 'OPI (옵션 압력 지수)', en: 'OPI (Options Pressure Index)', ja: 'OPI（オプション圧力指数）' },
    body: {
      ko: '옵션 플로우의 순매수/매도 압력을 0~100으로 종합한 지표입니다. 높을수록 콜 우위(상방 압력), 낮을수록 풋 우위(하방 압력)가 관찰됩니다.',
      en: "A 0–100 composite of net options-flow pressure. Higher readings reflect call-dominant (upside) pressure, lower readings put-dominant (downside) pressure.",
      ja: 'オプション・フローの純圧力を0〜100で総合した指標です。高いほどコール優勢（上方圧力）、低いほどプット優勢（下方圧力）が観測されます。',
    },
  },
  pcr: {
    title: { ko: 'P/C 비율 (Put/Call Ratio)', en: 'P/C Ratio (Put/Call)', ja: 'P/Cレシオ（プット/コール）' },
    body: {
      ko: '풋 대비 콜의 거래량·미결제약정 비율입니다. 1보다 크면 풋(하방 헤지/베팅)이, 작으면 콜(상방)이 우세한 것으로 관찰됩니다.',
      en: 'The ratio of put to call volume / open interest. Above 1 reflects more puts (downside hedging/bets); below 1 reflects more calls (upside).',
      ja: 'コールに対するプットの出来高・建玉の比率です。1より大きいとプット（下方ヘッジ/ベット）、小さいとコール（上方）が優勢と観測されます。',
    },
  },
  squeeze: {
    title: { ko: '스퀴즈 (Squeeze)', en: 'Squeeze', ja: 'スクイーズ' },
    body: {
      ko: '공매도 압박(쇼트 스퀴즈)과 딜러 감마 압박(감마 스퀴즈) 가능성을 종합한 점수입니다. 높을수록 강제 매수를 부르는 구조적 긴장이 관찰됩니다.',
      en: 'A composite score of short-squeeze and dealer gamma-squeeze potential. Higher readings reflect structural tension that can force buying.',
      ja: '空売り圧迫（ショートスクイーズ）とディーラーのガンマ圧迫（ガンマスクイーズ）の可能性を総合したスコアです。高いほど強制買いを招く構造的緊張が観測されます。',
    },
  },
  whale: {
    title: { ko: '웨일 인덱스 (Whale Index)', en: 'Whale Index', ja: 'ホエール指数' },
    body: {
      ko: '딜러 감마(GEX)와 옵션 순프리미엄을 합성한 기관 발자국 지표입니다. 높을수록 큰손(웨일)의 개입 신호가 강하게 관찰됩니다.',
      en: 'A composite institutional-footprint index built from dealer gamma (GEX) and net option premium. Higher readings reflect a stronger "whale" presence.',
      ja: 'ディーラーガンマ（GEX）とオプションのネットプレミアムを合成した機関フットプリント指標です。高いほど大口（ホエール）の関与シグナルが強く観測されます。',
    },
  },
  rsi: {
    title: { ko: 'RSI (상대강도지수)', en: 'RSI (Relative Strength Index)', ja: 'RSI（相対力指数）' },
    body: {
      ko: '최근 상승/하락 폭을 0~100으로 나타낸 모멘텀 지표(기간 14)입니다. 통상 30 미만은 과매도, 70 초과는 과매수 상태로 관찰됩니다.',
      en: 'A 0–100 momentum gauge (period 14) of recent gains vs losses. Below 30 is commonly observed as oversold, above 70 as overbought.',
      ja: '直近の上昇/下落幅を0〜100で示すモメンタム指標（期間14）です。一般に30未満は売られ過ぎ、70超は買われ過ぎと観測されます。',
    },
  },
  vwap: {
    title: { ko: 'VWAP (거래량가중평균가)', en: 'VWAP', ja: 'VWAP（出来高加重平均価格）' },
    body: {
      ko: '당일 거래량으로 가중한 평균 체결가입니다. 기관이 체결 품질의 기준선으로 삼으며, 가격이 VWAP 위/아래인지로 일중 강약을 관찰합니다.',
      en: 'The volume-weighted average traded price for the session. Institutions use it as an execution benchmark; price above/below VWAP is read as intraday strength/weakness.',
      ja: '当日の出来高で加重した平均約定価格です。機関が約定品質の基準とし、価格がVWAPの上/下かで日中の強弱を観測します。',
    },
  },
  shortInterest: {
    title: { ko: '공매도 잔량 (Short Interest)', en: 'Short Interest', ja: '空売り残高' },
    body: {
      ko: '유통주식 대비 공매도된 비율과 환매에 걸리는 일수(Days to Cover)를 봅니다. 높을수록 숏 스퀴즈 연료가 쌓인 것으로 관찰됩니다.',
      en: 'The percentage of float sold short, alongside days-to-cover. Higher readings reflect more fuel for a potential short squeeze.',
      ja: '浮動株に対する空売り比率と買い戻しに要する日数（Days to Cover）を見ます。高いほどショートスクイーズの燃料が蓄積していると観測されます。',
    },
  },
  volRegime: {
    title: { ko: '변동성 레짐 (Vol Regime)', en: 'Volatility Regime', ja: 'ボラティリティ・レジーム' },
    body: {
      ko: '옵션 변동성의 압축/확장 국면입니다. COILING(에너지 응축·저변동) → LOADED(변동성 축적) → ERUPTING(극단 변동)으로, 변동성이 어느 단계에 있는지 관찰됩니다.',
      en: 'The compression/expansion phase of option volatility — COILING (energy building, low vol) → LOADED (accumulating) → ERUPTING (extreme). It shows which stage volatility is observed to be in.',
      ja: 'オプション変動性の圧縮/拡張の局面です。COILING（エネルギー凝縮・低ボラ）→ LOADED（蓄積）→ ERUPTING（極端な変動）の段階として観測されます。',
    },
  },
  conviction: {
    title: { ko: '컨빅션 (Conviction)', en: 'Conviction', ja: 'コンビクション' },
    body: {
      ko: '실시간 옵션 플로우·가격·VWAP 신호를 융합한 당장의 방향 정렬도(0~100)입니다. 높을수록 상방, 낮을수록 하방으로 신호가 정렬된 것으로 관찰됩니다.',
      en: 'A 0–100 read of how aligned the live signals (options flow, price, VWAP) are right now. Higher reflects upside-aligned signals, lower downside-aligned.',
      ja: 'リアルタイムのオプションフロー・価格・VWAPシグナルの方向一致度（0〜100）です。高いほど上方、低いほど下方にシグナルが揃っていると観測されます。',
    },
  },
  trendPhase: {
    title: { ko: '트렌드 페이즈 (Trend Phase)', en: 'Trend Phase', ja: 'トレンドフェーズ' },
    body: {
      ko: '이동평균 교차(골든/데드 크로스) 기반의 추세 국면입니다. 골든크로스는 상승 추세, 데드크로스는 하락 추세, 그 외는 횡보로 관찰됩니다.',
      en: 'The trend phase from moving-average crossovers. A golden cross is read as an up-trend, a dead cross as a down-trend, otherwise consolidation.',
      ja: '移動平均のクロス（ゴールデン/デッド）に基づくトレンド局面です。ゴールデンクロスは上昇、デッドクロスは下降、それ以外はレンジとして観測されます。',
    },
  },
  fundamental: {
    title: { ko: '펀더멘탈 (Fundamental)', en: 'Fundamental', ja: 'ファンダメンタル' },
    body: {
      ko: 'PER·ROE·부채비율 등 재무 지표를 종합한 건전성 등급입니다. A에 가까울수록 재무가 우량한 것으로 평가됩니다.',
      en: 'A health grade compiled from valuation and profitability metrics (P/E, ROE, debt, etc.). Grades closer to A reflect stronger fundamentals.',
      ja: 'PER・ROE・負債比率などの財務指標を総合した健全性グレードです。Aに近いほど財務が良好と評価されます。',
    },
  },
  institutional13f: {
    title: { ko: '13-F 기관 보유란?', en: 'What is 13-F?', ja: '13-F（機関保有）とは？' },
    body: {
      ko: '운용자산 1억 달러 이상의 기관투자자가 분기마다 SEC에 제출하는 보유 종목 공시입니다. 어떤 기관이 이 종목을 얼마나 보유하는지, 비중은 얼마인지 보여줍니다. 분기 1회·약 45일 지연 공시라 최신 매매가 아닌 분기말 기준입니다.',
      en: 'A quarterly SEC filing by institutional managers with over $100M in assets, disclosing their equity holdings. Shows which institutions hold this stock, how many shares, and the weight. Quarterly and ~45-day lagged, so it reflects quarter-end positions — not live trading.',
      ja: '運用資産1億ドル超の機関投資家が四半期ごとにSECへ提出する保有銘柄の開示です。どの機関がこの銘柄を何株・どの比率で保有するかを示します。四半期1回・約45日遅れのため、最新売買ではなく四半期末時点の保有状況です。',
    },
  },
  insiderActivity: {
    title: { ko: '내부자 거래란?', en: 'What is Insider Activity?', ja: '内部者取引とは？' },
    body: {
      ko: '임원·이사·10% 이상 주주 등 회사 내부자가 자사 주식을 매매하면 SEC Form 4로 공시됩니다. 내부자의 매수는 회사에 대한 자신감으로 해석될 수 있고, 매도는 분산투자·세금 등 다양한 이유가 있을 수 있습니다. 참고 지표일 뿐 매매 신호가 아닙니다.',
      en: "When a company's officers, directors, or 10%+ owners buy or sell its stock, it's disclosed via SEC Form 4. Insider buying can signal confidence, while selling may have many reasons (diversification, taxes, etc.). It's a reference signal, not a trade recommendation.",
      ja: '役員・取締役・10%以上保有株主などの会社内部者が自社株を売買するとSEC Form 4で開示されます。買いは会社への自信、売りは分散・税金など様々な理由が考えられます。参考指標であり売買シグナルではありません。',
    },
  },
  // ── macro track ──────────────────────────────────────────────────────────
  rate10y: {
    title: { ko: '미 10년물 금리', en: 'US 10-Year Yield', ja: '米10年債利回り' },
    body: {
      ko: '미국 10년 만기 국채의 수익률로, 전 세계 자산 가격의 "기준 금리"처럼 쓰입니다. 이 금리가 오르면 성장주의 미래 이익 할인율이 커져 주가에 부담으로 관찰되고, 내리면 그 반대가 관찰되곤 합니다.',
      en: 'The yield on 10-year US Treasuries — the reference rate for pricing assets worldwide. When it rises, future earnings are discounted more heavily (often observed as pressure on growth stocks); when it falls, the reverse is observed.',
      ja: '米国10年国債の利回りで、世界中の資産価格の「基準金利」の役割を果たします。上昇すると将来利益の割引率が大きくなりグロース株の重しとして観測され、低下時はその逆が観測されます。',
    },
  },
  fomc: {
    title: { ko: 'FOMC (연준 금리 결정)', en: 'FOMC (Fed Rate Decision)', ja: 'FOMC（米金利決定会合）' },
    body: {
      ko: '미국 연방준비제도가 기준금리를 결정하는 회의로 연 8회 열립니다. 결정 자체보다 "다음에 뭘 할지"에 대한 힌트(성명서·점도표·기자회견)에 시장이 크게 반응하는 것이 관찰됩니다.',
      en: 'The Federal Reserve meeting that sets the US policy rate, held eight times a year. Markets are often observed reacting less to the decision itself than to hints about what comes next (statement, dot plot, press conference).',
      ja: '米連邦準備制度が政策金利を決める会合で年8回開催されます。決定そのものより「次に何をするか」のヒント（声明・ドットチャート・会見）に市場が大きく反応する傾向が観測されます。',
    },
  },
  cpi: {
    title: { ko: 'CPI (소비자물가지수)', en: 'CPI (Consumer Price Index)', ja: 'CPI（消費者物価指数）' },
    body: {
      ko: '미국의 대표 인플레이션 지표로 매월 발표됩니다. 예상보다 높으면 "금리를 더 오래 높게"라는 해석과 함께 주가·채권이 함께 흔들리는 날이 관찰되고, 예상보다 낮으면 안도 랠리가 관찰되곤 합니다.',
      en: "The main US inflation gauge, released monthly. Hotter-than-expected prints are often observed shaking both stocks and bonds ('higher for longer'), while cooler prints are observed sparking relief rallies.",
      ja: '米国の代表的なインフレ指標で毎月発表されます。予想より高いと「金利は高く長く」との解釈で株と債券が同時に揺れる日が観測され、予想より低いと安堵のラリーが観測されることがあります。',
    },
  },
  jobsReport: {
    title: { ko: '고용보고서 (NFP)', en: 'Jobs Report (NFP)', ja: '雇用統計（NFP）' },
    body: {
      ko: '매월 첫 금요일에 나오는 미국 비농업 고용지표입니다. "너무 뜨거우면 금리 걱정, 너무 차가우면 경기 걱정" — 시장이 같은 숫자를 두 방향으로 읽는 대표적인 날로 관찰됩니다.',
      en: 'US nonfarm payrolls, released the first Friday of each month. A classic case of one number read two ways: too hot brings rate worries, too cold brings recession worries — both reactions are regularly observed.',
      ja: '毎月第1金曜に発表される米非農業部門雇用者数です。「熱すぎれば金利懸念、冷たすぎれば景気懸念」— 同じ数字が二方向に読まれる代表的な日として観測されます。',
    },
  },
  yieldCurve: {
    title: { ko: '수익률 곡선 (장단기 금리차)', en: 'Yield Curve', ja: 'イールドカーブ（長短金利差）' },
    body: {
      ko: '만기별 국채 금리를 이은 곡선입니다. 보통은 장기금리가 더 높지만, 단기가 더 높아지는 "역전"은 과거 침체에 앞서 나타난 사례가 관찰되어 시장이 주시하는 신호입니다.',
      en: 'The line connecting Treasury yields across maturities. Long rates are usually higher; an "inversion" (short above long) has been observed preceding past recessions, so markets watch it closely.',
      ja: '満期ごとの国債利回りを結んだ曲線です。通常は長期金利が高いものの、短期が上回る「逆イールド」は過去の景気後退に先行した事例が観測されており、市場が注視するシグナルです。',
    },
  },
  dollarIndex: {
    title: { ko: '달러 인덱스 (DXY)', en: 'Dollar Index (DXY)', ja: 'ドル指数（DXY）' },
    body: {
      ko: '주요 6개 통화 대비 달러의 상대 강도입니다. 달러가 강해지면 미국 기업의 해외 매출 환산액이 줄고 신흥국 자금이 빠지는 압력이 관찰되어, 위험자산과 반대로 움직이는 날이 많습니다.',
      en: "The dollar's strength against six major currencies. A stronger dollar shrinks translated overseas revenue for US firms and pressures emerging-market flows — it is often observed moving opposite risk assets.",
      ja: '主要6通貨に対するドルの相対的な強さです。ドル高は米企業の海外売上の目減りや新興国からの資金流出圧力として観測され、リスク資産と逆に動く日が多く見られます。',
    },
  },
  vix: {
    title: { ko: 'VIX (변동성 지수)', en: 'VIX (Volatility Index)', ja: 'VIX（恐怖指数）' },
    body: {
      ko: 'S&P500 옵션 가격에서 역산한 "앞으로 30일 예상 변동성"입니다. 시장이 불안할수록 옵션(보험료)이 비싸져 VIX가 뛰는 것이 관찰되어 흔히 공포지수라 불립니다. 20 아래는 평온, 30 위는 긴장 구간으로 통용됩니다.',
      en: "Expected 30-day volatility implied by S&P 500 option prices. When markets get nervous, option 'insurance' gets pricier and the VIX is observed jumping — hence 'the fear index.' Below 20 reads calm; above 30 reads stressed.",
      ja: 'S&P500オプション価格から逆算した「今後30日の予想変動率」です。市場が不安になるほどオプション（保険料）が高くなりVIXが跳ねる様子が観測され、恐怖指数と呼ばれます。20未満は平穏、30超は緊張圏とされます。',
    },
  },
  // ── news-reading track ───────────────────────────────────────────────────
  guidance: {
    title: { ko: '가이던스 (실적 전망)', en: 'Guidance', ja: 'ガイダンス（業績見通し）' },
    body: {
      ko: '기업이 스스로 제시하는 다음 분기·연간 실적 전망입니다. 지난 분기 성적보다 이 "앞으로" 숫자에 주가가 더 크게 반응하는 사례가 자주 관찰됩니다 — 실적이 좋아도 가이던스가 낮으면 하락하는 식입니다.',
      en: "A company's own forecast for the next quarter or year. Prices are frequently observed reacting more to this forward number than to the quarter just reported — a beat can still fall on soft guidance.",
      ja: '企業自身が示す来四半期・通期の業績見通しです。直前の実績よりこの「先行き」の数字に株価が大きく反応する事例が頻繁に観測されます — 好決算でもガイダンスが弱ければ下落する形です。',
    },
  },
  consensus: {
    title: { ko: '컨센서스와 서프라이즈', en: 'Consensus & Surprise', ja: 'コンセンサスとサプライズ' },
    body: {
      ko: '애널리스트 전망치의 평균이 컨센서스, 실제 발표가 그보다 좋으면/나쁘면 어닝 서프라이즈/쇼크입니다. 주가는 "절대 성적"이 아니라 "기대 대비 차이"에 반응하는 것이 반복적으로 관찰됩니다.',
      en: "The average analyst estimate is the consensus; beating or missing it is a surprise or shock. Prices are repeatedly observed reacting to the gap versus expectations, not to the absolute result.",
      ja: 'アナリスト予想の平均がコンセンサス、実績がそれを上回れば/下回ればサプライズ/ショックです。株価は「絶対的な成績」ではなく「期待との差」に反応することが繰り返し観測されます。',
    },
  },
  sectorRotation: {
    title: { ko: '섹터 로테이션', en: 'Sector Rotation', ja: 'セクターローテーション' },
    body: {
      ko: '자금이 한 업종에서 다른 업종으로 옮겨 다니는 흐름입니다. 개별 기업 뉴스 없이도 "반도체 전체가 빠지고 헬스케어 전체가 오르는" 날은 로테이션이 원인인 경우가 관찰됩니다.',
      en: 'Money migrating from one sector to another. On days when all of semis fall while all of healthcare rises with no company-specific news, rotation is often the observed driver.',
      ja: '資金がある業種から別の業種へ移動する流れです。個別ニュースがないのに「半導体全体が下がりヘルスケア全体が上がる」日は、ローテーションが要因として観測されることがあります。',
    },
  },
  riskOnOff: {
    title: { ko: '리스크온 / 리스크오프', en: 'Risk-On / Risk-Off', ja: 'リスクオン／リスクオフ' },
    body: {
      ko: '시장 전체의 위험 선호 모드입니다. 리스크온에는 성장주·고베타가, 리스크오프에는 국채·달러·방어주가 강한 패턴이 관찰됩니다. 개별 종목 뉴스보다 이 "모드"가 그날 색깔을 정하는 날이 많습니다.',
      en: "The market's overall risk appetite. Risk-on days are observed favoring growth and high-beta names; risk-off favors Treasuries, the dollar, and defensives. Many days are colored by this mode more than by any single stock's news.",
      ja: '市場全体のリスク選好モードです。リスクオンではグロースや高ベータ銘柄、リスクオフでは国債・ドル・ディフェンシブが強い傾向が観測されます。個別ニュースよりこの「モード」がその日の色を決める日が多くあります。',
    },
  },
};
