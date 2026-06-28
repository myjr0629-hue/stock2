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
  | 'shortInterest';

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
      ko: 'GEX·다크풀·블록딜·넷프리미엄을 합성한 기관 발자국 지표입니다. 높을수록 큰손(웨일)의 개입 신호가 강하게 관찰됩니다.',
      en: 'A composite institutional-footprint index built from GEX, dark pool, block trades and net premium. Higher readings reflect a stronger "whale" presence.',
      ja: 'GEX・ダークプール・ブロック取引・ネットプレミアムを合成した機関フットプリント指標です。高いほど大口（ホエール）の関与シグナルが強く観測されます。',
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
};
