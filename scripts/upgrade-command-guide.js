const fs = require('fs');

// Upgrade all 3 languages
['ko', 'en', 'ja'].forEach(lang => {
  const path = `C:/Users/seamo/backup/stock2/src/messages/${lang}.json`;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const g = data.commandGuide;

  if (lang === 'ko') {
    // ─── Premium Korean Upgrade ───
    g.subtitle = "기관 트레이딩 데스크에서 사용하는 10개 독립 파생·기술·수급 지표를 개인 투자자의 화면에 구현한 분석 터미널";
    g.overviewTitle = "COMMAND 개요";
    g.overviewDesc = "Command 터미널은 <cyan>10개의 독립 파생·기술·수급 지표</cyan>를 하나의 화면에 집약합니다. <gold>VOL REGIME</gold>으로 현재 변동성 체제를, <cyan>CONVICTION</cyan>으로 복합 데이터 정렬 상태를, <rose>SHORT SQUEEZE</rose>로 숏커버 리스크를, <emerald>ANALYST TARGET</emerald>으로 월가 컨센서스를 실시간 확인할 수 있습니다. 블룸버그 터미널에서 수백만 원의 비용으로 접근하는 동일 수준의 분석을 제공합니다.";
    g.indicatorsTitle = "프리미엄 지표 카드";
    g.indicatorsSubtitle = "Institutional-Grade Analytics";
    g.indicatorsDesc = "각 지표는 독립적인 데이터 소스에서 실시간으로 파생되며, 단일 지표 해석이 아닌 복수 지표의 교차 확인이 구조적 분석의 핵심입니다. 기관 애널리스트가 사용하는 동일한 분석 프레임워크를 적용합니다.";
    g.row1Title = "Row 1 — 실시간 시장 구조 진단";
    g.row2Title = "Row 2 — 중장기 포지셔닝 분석";

    // VOL REGIME
    g.volRegime.badge = "변동성 체제";
    g.volRegime.desc = "감마 노출(GEX), 내재변동성(IV), 스퀴즈 확률 — 세 축을 결합하여 현재 <gold>시장의 변동성 체제</gold>를 4등급으로 구분합니다. 0~100 Score로 체제 강도를 수치화하며, 옵션 딜러의 헤지 구조에서 직접 도출한 지표입니다.";
    g.volRegime.tip = "LOADED/ERUPTING 상태에서는 소규모 촉매에도 비선형적 가격 이동이 발생합니다. 이는 딜러의 숏감마 포지션에서 기인하는 구조적 특성으로, 기관 리스크 매니저가 가장 먼저 확인하는 지표입니다.";
    g.volRegime.tradingGuide = "시그널 해석";

    // CONVICTION
    g.conviction.desc = "<cyan>이동평균 트렌드</cyan>, VWAP 위치, P/C Ratio, 감마 노출, 옵션 플로우 — 총 5개 독립 데이터를 가중 합산한 <gold>방향 확신도 스코어</gold>입니다. A~F 등급으로 현재 데이터의 방향 합의 수준을 직관적으로 나타내며, 기관의 다중 소스 확인(Multi-Source Confirmation) 방법론을 구현합니다.";
    g.conviction.tradingGuide = "시그널 해석";

    // VWAP
    g.vwapCard.desc = "<cyan>거래량가중평균가(VWAP)</cyan>와 현재가의 이격률(%)입니다. 기관 참가자가 실행 효율(Execution Quality)을 측정하는 업계 표준 벤치마크이며, 이 수치의 부호와 크기가 <gold>단기 수급 구조의 방향</gold>을 드러냅니다. 글로벌 헤지펀드 트레이딩 데스크의 핵심 참조 지표입니다.";
    g.vwapCard.tradingGuide = "시그널 해석";

    // SHORT SQUEEZE
    g.shortSqueeze.desc = "공매도 잔고 비율(SI%), 숏커버 소요일(Days to Cover), 공매도 거래 집중도를 종합하여 <rose>숏스퀴즈 발생 확률</rose>을 등급화합니다. 강제 청산이 발생할 때의 비자발적 매수 수요 규모를 정량화하는 지표로, 기관 리스크 관리 시스템의 필수 모니터링 요소입니다.";
    g.shortSqueeze.tradingGuide = "시그널 해석";

    // ANALYST TARGET
    g.analystTarget.desc = "주요 투자은행 및 리서치 하우스의 <emerald>애널리스트 의견 분포</emerald>와 목표가 컨센서스를 표시합니다. Strong Buy~Strong Sell 5단계 분포, 참여 애널리스트 수, 목표가와 현재가의 괴리율을 한 눈에 확인할 수 있습니다. 월스트리트 리서치 생태계의 집합적 판단을 실시간으로 추적합니다.";
    g.analystTarget.tradingGuide = "시그널 해석";

    // RELATED  
    g.related.desc = "현재 종목과 <cyan>높은 통계적 상관관계</cyan>를 보이는 동종 업계 종목들의 실시간 수익률을 나란히 표시합니다. 섹터 전체의 자금 흐름인지 개별 종목 고유 이벤트인지를 즉시 구분할 수 있으며, 기관 트레이더가 상시 모니터링하는 상관관계 분석을 개인 투자자에게 제공합니다.";
    g.related.tradingGuide = "시그널 해석";

    // INST RADAR
    g.instRadar.desc = "<purple>다크풀 거래 비율</purple>과 <cyan>블록 트레이드 빈도</cyan>를 결합하여 기관 참가자의 매집(Accumulation) / 분배(Distribution) 패턴을 3단계로 분류합니다. 공개 시장에서 보이지 않는 기관의 포지셔닝 의도를 간접 추론하며, 이 데이터는 통상 기관 전용 터미널에서만 접근 가능합니다.";
    g.instRadar.tradingGuide = "시그널 해석";

    // TREND PHASE
    g.trendPhase.desc = "<emerald>SMA 50일선과 200일선</emerald>의 교차 상태를 기반으로 현재 추세 국면을 진단합니다. Golden Cross / Dead Cross는 기관 운용역이 중장기 자산 배분 의사결정에 참조하는 기술적 기준점이며, SIGNUM은 이를 실시간 레벨과 이격률(%)로 제공합니다.";
    g.trendPhase.tradingGuide = "시그널 해석";

    // FUNDAMENTAL
    g.fundamental.desc = "<cyan>PER</cyan>, <gold>ROE</gold>, 잉여현금흐름, 매출 성장률, 영업이익률, 부채비율 등 핵심 재무 지표를 종합한 <emerald>재무 건전성 스코어</emerald>입니다. 기관 애널리스트의 밸류에이션 프레임워크를 자동화한 정량 분석으로, 0~100점 / A~F 등급으로 즉시 확인할 수 있습니다.";
    g.fundamental.tradingGuide = "시그널 해석";

    // EARNINGS
    g.earnings.desc = "차기 <gold>분기 실적 발표일</gold>, D-Day 카운트다운, 예상 EPS를 표시합니다. 실적 발표 전후 옵션 내재변동성(IV)의 구조적 팽창·수축 패턴은 기관 옵션 전략의 핵심 변수이며, SIGNUM은 이 일정을 모든 분석에 자동 반영합니다.";
    g.earnings.tradingGuide = "시그널 해석";

    // Lower sections
    g.chartDesc = "<cyan>다기간 가격 차트</cyan> 위에 Call Wall, Max Pain, Put Floor, Prev Close 레벨을 오버레이합니다. 옵션 구조가 형성한 <gold>지지·저항 구간</gold>과 현재가의 상대적 위치를 직관적으로 파악할 수 있습니다. 1D/5D/1M/6M/1Y/All 기간 전환이 가능하며, 기관급 옵션 레벨 분석을 차트에 통합한 구성입니다.";
    g.signalDesc = "<gold>복합 시그널 분석 엔진</gold>입니다. 감지된 구조적 이벤트(Golden Cross, IV Spike, Analyst Consensus Shift 등)를 뱃지로 요약 표시하며, 장마감 후에는 SMA·뉴스·수급 데이터를 결합한 AI 종합 분석 리포트가 자동 생성됩니다.";
    g.flowDesc = "<emerald>실시간 옵션 자금 흐름</emerald>을 추적합니다. 콜/풋 프리미엄 차이(Net Premium)와 체결 강도(Volume Strength)를 결합하여, 대규모 참가자의 <gold>방향성 포지셔닝</gold>을 실시간으로 포착합니다. 기관의 옵션 플로우 데이터를 개인 투자자에게 실시간 제공하는 핵심 기능입니다.";
    g.gammaDesc = "옵션 미결제약정에서 도출한 <gold>구조적 가격 레벨</gold>과 <cyan>감마 프로파일 분석</cyan>을 제공합니다. Support/Resist/Max Pain 레벨이 단기 가격 구간을 정의하며, Net GEX 방향과 Gamma Flip이 현재 시장 환경을 구조적으로 분류합니다.";
    g.intelDesc = "<cyan>AI 뉴스 인텔리전스</cyan> 피드입니다. 해당 종목 관련 뉴스를 AI 엔진이 실시간으로 분석하여 시장 영향도와 센티먼트를 자동 평가합니다. 각 뉴스 항목에 자동 분류 태그와 임팩트 점수가 부여되어 빠른 상황 인식이 가능합니다.";

    // GAMMA FLIP
    g.gammaFlipDesc = "<purple>Gamma Flip Level</purple>은 딜러의 감마 노출이 <cyan>롱에서 숏으로 전환</cyan>되는 가격선입니다. 이 레벨을 경계로 딜러 헤지의 방향이 역전됩니다 — 상방에서는 딜러가 <emerald>가격 이동과 반대로 헤지</emerald>하여 안정화하고, 하방에서는 <rose>같은 방향으로 헤지</rose>하여 변동을 증폭합니다. 이 지표는 기관 옵션 데스크의 핵심 참조 레벨이며, SIGNUM이 개인 투자자에게 실시간으로 제공하는 차별화된 분석입니다.";

    // Strategy section
    g.strategy.title = "구조 분석 워크플로우";
    g.strategy.desc = "Command의 10개 지표를 <cyan>4단계 프레임워크</cyan>로 체계화하여 시장 구조를 입체적으로 파악합니다. 기관 트레이딩 데스크의 실제 분석 프로세스를 개인 투자자의 워크플로우로 재구성하였습니다.";

  } else if (lang === 'en') {
    // ─── Premium English Upgrade ───
    g.subtitle = "10 independent derivative, technical, and flow indicators — the institutional trading desk toolkit, delivered to individual investors";
    g.overviewTitle = "COMMAND Overview";
    g.overviewDesc = "Command Terminal consolidates <cyan>10 independent derivative, technical, and flow indicators</cyan> into a single screen. Monitor <gold>VOL REGIME</gold> for current volatility structure, <cyan>CONVICTION</cyan> for multi-source data alignment, <rose>SHORT SQUEEZE</rose> for short-cover risk, and <emerald>ANALYST TARGET</emerald> for Wall Street consensus — all in real-time. Delivering the same analytical depth that costs hundreds of thousands at a Bloomberg Terminal.";
    g.indicatorsTitle = "Premium Indicator Cards";
    g.indicatorsSubtitle = "Institutional-Grade Analytics";
    g.indicatorsDesc = "Each indicator derives from an independent data source in real-time. The core of structural analysis lies not in interpreting single indicators, but in cross-validating multiple signals — applying the same multi-source confirmation methodology used by institutional analysts.";
    g.row1Title = "Row 1 — Real-Time Market Structure";
    g.row2Title = "Row 2 — Swing & Long-Term Positioning";

    g.volRegime.title = "VOL REGIME";
    g.volRegime.badge = "Volatility";
    g.volRegime.desc = "Combines Gamma Exposure (GEX), Implied Volatility (IV), and Squeeze Probability to classify the current <gold>market volatility regime</gold> into 4 tiers. Quantified as a 0–100 Score derived directly from options dealer hedging structure — the metric institutional risk managers check first.";
    g.volRegime.stable = "STABLE — Low volatility, range-bound environment";
    g.volRegime.coiling = "COILING — Energy accumulating, direction seeking";
    g.volRegime.loaded = "LOADED — Volatility at critical threshold, prepare for breakout";
    g.volRegime.erupting = "ERUPTING — Extreme volatility, maximum risk zone";
    g.volRegime.tip = "In LOADED/ERUPTING states, small catalysts can trigger non-linear price movements due to dealer short-gamma positioning — the structural characteristic that institutional risk managers prioritize.";
    g.volRegime.tradingGuide = "Signal Interpretation";
    g.volRegime.guide1 = "STABLE: Dealer hedging tends to revert prices toward VWAP, creating a mean-reversion environment";
    g.volRegime.guide2 = "COILING: Compressed volatility accumulates energy; breakout moves tend to be amplified";
    g.volRegime.guide3 = "LOADED/ERUPTING: Dealer short-gamma deepens, creating structural conditions for bi-directional sharp moves";

    g.conviction.title = "CONVICTION MATRIX";
    g.conviction.badge = "Composite Score";
    g.conviction.desc = "Weighted aggregation of <cyan>moving average trends</cyan>, VWAP position, P/C Ratio, gamma exposure, and options flow — a <gold>directional conviction score</gold> from 5 independent data sources. Grades A through F to intuitively convey data alignment, implementing institutional multi-source confirmation methodology.";
    g.conviction.bull = "A–B+ (65+) — Bullish dominance, multi-signal alignment";
    g.conviction.neutral = "B–C (45-64) — Neutral, direction seeking";
    g.conviction.bear = "D–F (0-44) — Bearish dominance, concentrated sell signals";
    g.conviction.tip = "Conviction 80+ combined with VOL REGIME STABLE indicates 5 sources are stably aligned — a high-conviction structural environment.";
    g.conviction.tradingGuide = "Signal Interpretation";
    g.conviction.guide1 = "Grade A: All 5 data sources converge in the same direction, structurally elevating trend continuation probability";
    g.conviction.guide2 = "Grade C: Data conflict detected — a transitional state with low directional confidence";
    g.conviction.guide3 = "Grade F: Multiple sources converge bearish, indicating structurally elevated downside risk";

    g.vwapCard.title = "VWAP";
    g.vwapCard.badge = "Institutional Benchmark";
    g.vwapCard.desc = "The deviation (%) between <cyan>Volume-Weighted Average Price</cyan> and current price. The industry-standard execution benchmark used by institutional participants to measure execution quality — its sign and magnitude reveal <gold>short-term supply/demand structure</gold>. A core reference at global hedge fund trading desks.";
    g.vwapCard.above = "Positive (+) — Above VWAP — Average buyer in profit";
    g.vwapCard.below = "Negative (−) — Below VWAP — Average buyer in loss";
    g.vwapCard.tip = "VWAP deviation within ±0.3% is the institutional benchmark battleground — the resolution direction at this level determines short-term trend.";
    g.vwapCard.tradingGuide = "Signal Interpretation";
    g.vwapCard.guide1 = "+2% deviation: Average participants hold significant unrealized gains; profit-taking supply likely";
    g.vwapCard.guide2 = "±0.5%: VWAP battleground zone — whether close forms above or below VWAP is the key observation";
    g.vwapCard.guide3 = "−2% deviation: Average participants underwater; additional decline may trigger stop-loss cascades";

    g.shortSqueeze.title = "SHORT SQUEEZE";
    g.shortSqueeze.badge = "Short Risk";
    g.shortSqueeze.desc = "Aggregates Short Interest (SI%), Days to Cover, and short volume concentration to classify <rose>squeeze probability</rose> into tiers. Quantifies the potential magnitude of involuntary buying demand when forced covering occurs — a mandatory monitoring element in institutional risk management systems.";
    g.shortSqueeze.low = "LOW — SI% below 5%, squeeze probability minimal";
    g.shortSqueeze.medium = "MEDIUM — SI% 5-15%, monitoring required";
    g.shortSqueeze.high = "HIGH — SI% 15%+, short squeeze alert";
    g.shortSqueeze.critical = "CRITICAL — SI% 25%+, extreme risk";
    g.shortSqueeze.tip = "Days to Cover 3+ combined with SI% 15%+ creates the classic structure where short-cover demand can concentrate in a compressed timeframe.";
    g.shortSqueeze.tradingGuide = "Signal Interpretation";
    g.shortSqueeze.guide1 = "HIGH/CRITICAL: Price increases can cascade forced covering, triggering non-linear rallies through self-reinforcing loops";
    g.shortSqueeze.guide2 = "Positive momentum + HIGH SI%: Price rise triggers covers, covers trigger further rises — a self-reinforcing feedback loop";
    g.shortSqueeze.guide3 = "LOW: Short interest impact on price is negligible; prioritize fundamental and technical analysis";

    g.analystTarget.title = "ANALYST TARGET";
    g.analystTarget.badge = "Consensus";
    g.analystTarget.desc = "Displays <emerald>analyst opinion distribution</emerald> and price target consensus from major investment banks and research houses. Track the 5-tier distribution (Strong Buy to Strong Sell), analyst count, and target-to-current price gap — real-time tracking of Wall Street's collective research judgment.";
    g.analystTarget.strongBuy = "Strong Buy — Overwhelming bullish consensus";
    g.analystTarget.buy = "Buy — Bullish consensus";
    g.analystTarget.hold = "Hold — Neutral consensus";
    g.analystTarget.sell = "Sell — Bearish consensus";
    g.analystTarget.tip = "Buy opinions above 80% indicate strongly converged consensus. Consider both that consensus may already be priced in and the crowding risk from absence of dissent.";
    g.analystTarget.tradingGuide = "Signal Interpretation";
    g.analystTarget.guide1 = "Buy 90%+: Research community outlook extremely converged — strong consensus serves as a medium-term bullish foundation";
    g.analystTarget.guide2 = "Buy 50–70%: Dispersed opinions suggest data permits multiple interpretations — an uncertain phase";
    g.analystTarget.guide3 = "Hold majority: Absence of directional conviction; wait-and-see dominates until new catalysts emerge";

    g.related.title = "RELATED";
    g.related.badge = "Correlated Peers";
    g.related.desc = "Displays real-time performance of industry peers with <cyan>high statistical correlation</cyan>. Instantly distinguish sector-wide capital flows from individual stock events — delivering the same correlation analysis that institutional traders monitor continuously.";
    g.related.positive = "Same direction — Sector-wide common factors at work";
    g.related.divergent = "Different direction — Stock-specific factors driving price";
    g.related.tip = "When all related stocks move together but the target diverges, it signals a decoupling structure where individual catalysts (earnings/news/litigation) override sector trends.";
    g.related.tradingGuide = "Signal Interpretation";
    g.related.guide1 = "Sector co-movement: Macro/sector flows dominate price action over individual fundamentals";
    g.related.guide2 = "Leader-only advance: Intra-sector rotation underway; whether it spreads to laggards is the key question";
    g.related.guide3 = "Decoupling: Stock-specific catalyst (earnings, news, regulatory) overrides sector trend";

    g.instRadar.title = "INST RADAR";
    g.instRadar.badge = "Institutional Flow";
    g.instRadar.desc = "Combines <purple>dark pool trading ratios</purple> and <cyan>block trade frequency</cyan> to classify institutional Accumulation/Distribution patterns into 3 tiers. Infers institutional positioning intent invisible to public markets — data typically accessible only through institutional-only terminals.";
    g.instRadar.accum = "ACCUMULATION — Dark pool 40%+ & Block 3+ — Institutional buying indicated";
    g.instRadar.neutral = "NEUTRAL — Normal range, no institutional anomalies detected";
    g.instRadar.dist = "DISTRIBUTION — Dark pool 20%− & Block 1− — Institutional selling indicated";
    g.instRadar.tip = "ACCUMULATION coinciding with Buy consensus indicates both institutional execution and research views are aligned — a powerful structural agreement.";
    g.instRadar.tradingGuide = "Signal Interpretation";
    g.instRadar.guide1 = "ACCUMULATION: Large volumes aggregating off-exchange, indicating non-public institutional buying intent";
    g.instRadar.guide2 = "DISTRIBUTION: Institutional supply entering the market; selling may continue even during rallies";
    g.instRadar.guide3 = "NEUTRAL: Institutional participation at normal levels; retail flow plays the dominant price-setting role";

    g.trendPhase.title = "TREND PHASE";
    g.trendPhase.badge = "Trend Diagnosis";
    g.trendPhase.desc = "Diagnoses the current trend phase based on <emerald>SMA 50/200 crossover state</emerald>. Golden Cross and Dead Cross are the technical reference points institutional portfolio managers use for medium-to-long-term asset allocation decisions — SIGNUM delivers these with real-time levels and deviation percentages.";
    g.trendPhase.golden = "GOLDEN — SMA 50 > SMA 200, medium-term bullish transition";
    g.trendPhase.dead = "DEAD — SMA 50 < SMA 200, medium-term bearish transition";
    g.trendPhase.neutral = "NEUTRAL — No crossover, existing trend tentatively maintained";
    g.trendPhase.tip = "Golden Cross + CONVICTION Grade A: Technical trend and multi-source data confirm the same direction — a structurally powerful setup.";
    g.trendPhase.tradingGuide = "Signal Interpretation";
    g.trendPhase.guide1 = "Golden Cross: 50-day average has crossed above 200-day — technical confirmation of medium-term bullish momentum";
    g.trendPhase.guide2 = "Dead Cross: 50-day average has fallen below 200-day — technical warning of medium-term bearish transition";
    g.trendPhase.guide3 = "SMA gap within 3%: Two averages converging, crossover imminent — a transitional zone";

    g.fundamental.title = "FUNDAMENTAL";
    g.fundamental.badge = "Financial Analysis";
    g.fundamental.desc = "Composite <emerald>financial health score</emerald> integrating <cyan>P/E</cyan>, <gold>ROE</gold>, free cash flow, revenue growth, operating margin, and debt ratio. An automated quantitative analysis applying institutional analyst valuation frameworks — instantly accessible as a 0–100 / A–F grade.";
    g.fundamental.aGrade = "Grade A (80+) — Financially excellent, growth-profitability balance";
    g.fundamental.bGrade = "Grade B (60-79) — Solid with minor weaknesses";
    g.fundamental.cGrade = "Grade C or below — Improvement needed, risk flagged";
    g.fundamental.tip = "P/E discounted vs. sector average combined with ROE above 20% suggests undervaluation relative to earnings power.";
    g.fundamental.tradingGuide = "Signal Interpretation";
    g.fundamental.guide1 = "Grade A: Growth, profitability, and financial stability all strong — structural fundamental advantage confirmed";
    g.fundamental.guide2 = "Grade B: Most metrics solid but specific areas (debt, margins) require attention — a mixed picture";
    g.fundamental.guide3 = "Grade C−: Structural financial vulnerabilities confirmed; price likely driven by speculative flow rather than fundamentals";

    g.earnings.title = "EARNINGS";
    g.earnings.badge = "Earnings Schedule";
    g.earnings.desc = "Displays next <gold>quarterly earnings date</gold>, D-Day countdown, and EPS estimates. The structural IV expansion/contraction pattern around earnings is a core variable in institutional options strategy — SIGNUM auto-integrates this schedule into all analysis modules.";
    g.earnings.upcoming = "Earnings imminent (D-7) — IV expansion, premium-rich environment";
    g.earnings.far = "Earnings distant — Fundamentals and technicals take priority";
    g.earnings.tip = "IV typically surges D-3 onwards; post-announcement, uncertainty resolution frequently triggers IV Crush (rapid premium contraction).";
    g.earnings.tradingGuide = "Signal Interpretation";
    g.earnings.guide1 = "D-7: IV begins rising; options premiums expand as volatility expectations build";
    g.earnings.guide2 = "Earnings day: Directional uncertainty peaks; results can trigger significant gap moves";
    g.earnings.guide3 = "Post-earnings: Uncertainty resolves, IV normalizes rapidly — this is known as IV Crush";

    g.chartTitle = "Price History Chart";
    g.chartDesc = "Overlays Call Wall, Max Pain, Put Floor, and Prev Close levels on a <cyan>multi-timeframe price chart</cyan>. Instantly visualize <gold>support/resistance zones</gold> defined by options structure relative to current price. Switchable across 1D/5D/1M/6M/1Y/All — integrating institutional-grade options level analysis directly into the chart.";
    g.signalTitle = "SIGNAL CORE";
    g.signalDesc = "<gold>Composite signal analysis engine</gold>. Displays detected structural events (Golden Cross, IV Spike, Consensus Shift) as summary badges. After market close, auto-generates AI comprehensive analysis reports combining SMA, news, and flow data.";
    g.flowTitle = "FLOW UNIT";
    g.flowDesc = "Tracks <emerald>real-time options capital flows</emerald>. Combines Call/Put premium differential (Net Premium) with execution intensity (Volume Strength) to capture large participant <gold>directional positioning</gold> in real-time — a core feature delivering institutional options flow data to individual investors.";
    g.gammaTitle = "TACTICAL RANGE & NET GAMMA ENGINE";
    g.gammaDesc = "Provides <gold>structural price levels</gold> derived from options open interest and <cyan>gamma profile analysis</cyan>. Support/Resist/Max Pain define the short-term price range while Net GEX direction and Gamma Flip structurally classify the current market environment.";
    g.intelTitle = "INTEL FEED (AI)";
    g.intelDesc = "<cyan>AI news intelligence</cyan> feed. AI engine analyzes stock-relevant news in real-time, auto-evaluating market impact and sentiment. Each news item receives auto-classification tags and impact scores for rapid situational awareness.";

    g.gammaFlipDesc = "<purple>Gamma Flip Level</purple> is the price point where dealer gamma exposure <cyan>transitions from long to short</cyan>. At this boundary, the direction of dealer hedging reverses — above it, dealers hedge <emerald>against price movement</emerald> (stabilizing); below it, they hedge <rose>in the same direction</rose> (amplifying). This metric is a core reference level at institutional options desks — and SIGNUM delivers it to individual investors in real-time.";
    g.gammaFlip.longTitle = "LONG γ Zone (Above Flip)";
    g.gammaFlip.longDesc = "Price > Gamma Flip → Dealers <emerald>hedge against price movement</emerald> → Natural braking force on price swings. A <gold>volatility-suppressed range environment</gold> forms.";
    g.gammaFlip.shortTitle = "SHORT γ Zone (Below Flip)";
    g.gammaFlip.shortDesc = "Price < Gamma Flip → Dealers <rose>hedge in the same direction as price</rose> → Price moves become self-reinforcing. A <gold>volatility-amplified momentum environment</gold> forms.";
    g.gammaFlip.tip = "Monitor Flip deviation (%) on the VOL REGIME card for real-time distance to regime transition. Within ±2%, regime shift is considered imminent.";

    g.strategy.title = "Structural Analysis Workflow";
    g.strategy.desc = "Systematize Command's 10 indicators into a <cyan>4-step framework</cyan> for multi-dimensional market structure analysis. This workflow adapts the actual analytical process used by institutional trading desks for individual investors.";
    g.strategy.step1.title = "Step 1: Volatility Regime Assessment";
    g.strategy.step1.desc = "First, check VOL REGIME's 4-tier grade and CONVICTION's composite score. Understanding whether the market is in a Stable/Transitional/Explosive volatility regime and which direction multi-source data align forms the foundation for all subsequent analysis.";
    g.strategy.step2.title = "Step 2: Directional Structure Confirmation";
    g.strategy.step2.desc = "Review TREND PHASE crossover state and VWAP deviation. Confirm whether the technical trend and short-term supply/demand benchmark point the same direction or conflict.";
    g.strategy.step3.title = "Step 3: Risk Environment Evaluation";
    g.strategy.step3.desc = "Check SHORT SQUEEZE risk tier and EARNINGS D-Day. High SI% + imminent earnings creates a compound catalyst zone — structural conditions for bi-directional sharp moves.";
    g.strategy.step4.title = "Step 4: Institutional Participation Structure";
    g.strategy.step4.desc = "Review INST RADAR's Accumulation/Distribution signals and FLOW UNIT's Net Premium direction. Infer institutional positioning intent through cross-analysis of dark pool, block trade, and flow data.";
    g.strategy.warningTitle = "⚠️ Risk Disclosure & Disclaimer";
    g.strategy.warningDesc = "All information provided by this service (including indicators, signals, and analysis results) represents quantitative analysis of market data and does not constitute investment advice, trade directives, or personalized recommendations. Financial investments carry the risk of principal loss, and past data and indicators do not guarantee future returns. All investment decisions are made under the user's own responsibility, and the service provider assumes no legal liability for any resulting outcomes.";

  } else if (lang === 'ja') {
    // ─── Premium Japanese Upgrade ───
    g.subtitle = "機関トレーディングデスクで使用する10個の独立デリバティブ・テクニカル・需給指標を個人投資家の画面に実装した分析ターミナル";
    g.overviewTitle = "COMMAND 概要";
    g.overviewDesc = "Commandターミナルは<cyan>10個の独立デリバティブ・テクニカル・需給指標</cyan>を一画面に集約します。<gold>VOL REGIME</gold>で現在のボラティリティ体制を、<cyan>CONVICTION</cyan>で複合データ整列状態を、<rose>SHORT SQUEEZE</rose>でショートカバーリスクを、<emerald>ANALYST TARGET</emerald>でウォール街コンセンサスをリアルタイムで確認できます。ブルームバーグターミナルで数百万円のコストで提供される同水準の分析を提供します。";
    g.indicatorsTitle = "プレミアム指標カード";
    g.indicatorsSubtitle = "Institutional-Grade Analytics";
    g.indicatorsDesc = "各指標は独立したデータソースからリアルタイムで導出されます。単一指標の解釈ではなく、複数指標のクロスバリデーションこそが構造分析の核心であり、機関アナリストが使用する同じ分析フレームワークを適用しています。";
    g.row1Title = "Row 1 — リアルタイム市場構造診断";
    g.row2Title = "Row 2 — 中長期ポジショニング分析";

    g.volRegime.badge = "ボラティリティ";
    g.volRegime.desc = "ガンマエクスポージャー(GEX)、インプライドボラティリティ(IV)、スクイーズ確率の3軸を統合し、現在の<gold>市場ボラティリティ体制</gold>を4段階に分類。0〜100スコアで体制強度を数値化します。オプションディーラーのヘッジ構造から直接導出した指標で、機関リスクマネージャーが最初に確認する指標です。";
    g.volRegime.tip = "LOADED/ERUPTING状態では小規模触媒でも非線形的な価格変動が発生します。これはディーラーのショートガンマポジションに起因する構造的特性で、機関リスクマネージャーが最も重視する指標です。";
    g.volRegime.tradingGuide = "シグナル解釈";

    g.conviction.badge = "複合スコア";
    g.conviction.desc = "<cyan>移動平均トレンド</cyan>、VWAP位置、P/Cレシオ、ガンマエクスポージャー、オプションフロー — 5つの独立データを加重集計した<gold>方向確信度スコア</gold>。A〜F等級でデータの方向合意レベルを直感的に表現し、機関のマルチソース確認手法を実装しています。";
    g.conviction.tradingGuide = "シグナル解釈";

    g.vwapCard.badge = "機関ベンチマーク";
    g.vwapCard.desc = "<cyan>出来高加重平均価格(VWAP)</cyan>と現在価格の乖離率(%)。機関投資家が執行品質を測定する業界標準ベンチマークであり、この数値の符号と大きさが<gold>短期需給構造の方向</gold>を示します。グローバルヘッジファンドのトレーディングデスクにおける核心参照指標です。";
    g.vwapCard.tradingGuide = "シグナル解釈";

    g.shortSqueeze.badge = "空売りリスク";
    g.shortSqueeze.desc = "空売り残高比率(SI%)、ショートカバー所要日数(DTC)、空売り取引集中度を総合し、<rose>ショートスクイーズ発生確率</rose>を等級化。強制決済時の非自発的買い需要規模を定量化する指標で、機関リスク管理システムの必須モニタリング要素です。";
    g.shortSqueeze.tradingGuide = "シグナル解釈";

    g.analystTarget.badge = "コンセンサス";
    g.analystTarget.desc = "主要投資銀行・リサーチハウスの<emerald>アナリスト意見分布</emerald>と目標株価コンセンサスを表示。Strong Buy〜Strong Sell 5段階分布、参加アナリスト数、目標株価と現在株価の乖離率を一目で確認できます。ウォール街リサーチエコシステムの集合的判断をリアルタイムで追跡します。";
    g.analystTarget.tradingGuide = "シグナル解釈";

    g.related.badge = "相関銘柄";
    g.related.desc = "対象銘柄と<cyan>高い統計的相関</cyan>を持つ同業種銘柄のリアルタイムリターンを並列表示。セクター全体の資金フローか個別銘柄固有のイベントかを即座に判別でき、機関トレーダーが常時モニタリングする相関分析を個人投資家に提供します。";
    g.related.tradingGuide = "シグナル解釈";

    g.instRadar.badge = "機関フロー";
    g.instRadar.desc = "<purple>ダークプール取引比率</purple>と<cyan>ブロックトレード頻度</cyan>を統合し、機関投資家の集積(Accumulation)/分配(Distribution)パターンを3段階に分類。公開市場で見えない機関のポジショニング意図を間接推論し、このデータは通常、機関専用ターミナルでのみアクセス可能です。";
    g.instRadar.tradingGuide = "シグナル解釈";

    g.trendPhase.badge = "トレンド診断";
    g.trendPhase.desc = "<emerald>SMA 50日線と200日線</emerald>の交差状態で現在のトレンド局面を診断。ゴールデンクロス/デッドクロスは機関ポートフォリオマネージャーが中長期資産配分に参照するテクニカル基準点であり、SIGNUMではリアルタイムレベルと乖離率(%)で提供します。";
    g.trendPhase.tradingGuide = "シグナル解釈";

    g.fundamental.badge = "財務分析";
    g.fundamental.desc = "<cyan>PER</cyan>、<gold>ROE</gold>、フリーキャッシュフロー、売上成長率、営業利益率、負債比率等の核心財務指標を総合した<emerald>財務健全性スコア</emerald>。機関アナリストのバリュエーションフレームワークを自動化した定量分析で、0〜100点 / A〜F等級で即座に確認できます。";
    g.fundamental.tradingGuide = "シグナル解釈";

    g.earnings.badge = "決算スケジュール";
    g.earnings.desc = "次回<gold>四半期決算発表日</gold>、Dデイカウントダウン、予想EPSを表示。決算前後のIVの構造的膨張・収縮パターンは機関オプション戦略の核心変数であり、SIGNUMはこのスケジュールを全分析に自動反映します。";
    g.earnings.tradingGuide = "シグナル解釈";

    g.chartDesc = "<cyan>マルチタイムフレーム価格チャート</cyan>上にCall Wall、Max Pain、Put Floor、Prev Closeレベルをオーバーレイ。オプション構造が形成した<gold>サポート・レジスタンスゾーン</gold>と現在価格の相対位置を直感的に把握できます。1D/5D/1M/6M/1Y/All期間切替可能で、機関級オプションレベル分析をチャートに統合した構成です。";
    g.signalDesc = "<gold>複合シグナル分析エンジン</gold>。検出された構造的イベント(ゴールデンクロス、IVスパイク、コンセンサス変動等)をバッジで要約表示。大引け後はSMA・ニュース・需給データを統合したAI総合分析レポートが自動生成されます。";
    g.flowDesc = "<emerald>リアルタイムオプション資金フロー</emerald>を追跡。コール/プットプレミアム差(Net Premium)と約定強度(Volume Strength)を組み合わせ、大口参加者の<gold>方向性ポジショニング</gold>をリアルタイムで捕捉。機関のオプションフローデータを個人投資家にリアルタイム提供する核心機能です。";
    g.gammaDesc = "オプション建玉から導出した<gold>構造的価格レベル</gold>と<cyan>ガンマプロファイル分析</cyan>を提供。Support/Resist/Max Painが短期価格レンジを定義し、Net GEX方向とGamma Flipが現在の市場環境を構造的に分類します。";
    g.intelDesc = "<cyan>AIニュースインテリジェンス</cyan>フィード。対象銘柄関連ニュースをAIエンジンがリアルタイム分析し、市場影響度とセンチメントを自動評価。各ニュースに自動分類タグとインパクトスコアが付与され、迅速な状況認識が可能です。";

    g.gammaFlipDesc = "<purple>Gamma Flip Level</purple>はディーラーのガンマエクスポージャーが<cyan>ロングからショートに転換</cyan>する価格線です。このレベルを境にディーラーヘッジの方向が反転します — 上方ではディーラーが<emerald>価格移動と逆方向にヘッジ</emerald>して安定化し、下方では<rose>同方向にヘッジ</rose>して変動を増幅します。機関オプションデスクの核心参照レベルであり、SIGNUMが個人投資家にリアルタイムで提供する差別化された分析です。";

    g.strategy.title = "構造分析ワークフロー";
    g.strategy.desc = "Commandの10指標を<cyan>4ステップフレームワーク</cyan>で体系化し、市場構造を立体的に把握します。機関トレーディングデスクの実際の分析プロセスを個人投資家のワークフローに再構成しました。";
    g.strategy.warningTitle = "⚠️ リスク開示・免責事項";
    g.strategy.warningDesc = "本サービスで提供するすべての情報（指標、シグナル、分析結果を含む）は市場データの定量分析結果であり、投資助言・売買指示・個別化された推奨には該当しません。金融投資には元本毀損リスクが伴い、過去のデータと指標は将来の収益を保証するものではありません。すべての投資判断は利用者ご自身の責任のもとで行われ、その結果について本サービス提供者はいかなる法的責任も負いません。";
  }

  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`${lang} commandGuide upgraded (${JSON.stringify(data.commandGuide).length} chars)`);
});
