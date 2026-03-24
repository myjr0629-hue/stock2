const fs = require('fs');

// Read KO as the structural reference
const koData = JSON.parse(fs.readFileSync('C:/Users/seamo/backup/stock2/src/messages/ko.json', 'utf8'));
const koGuide = koData.commandGuide;

// ── ENGLISH ──
const enPath = 'C:/Users/seamo/backup/stock2/src/messages/en.json';
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
enData.commandGuide = {
  subtitle: "10 independent derivative, technical, and flow indicators — the institutional trading desk toolkit, delivered to individual investors",
  overviewTitle: "COMMAND Overview",
  overviewDesc: "Command Terminal consolidates <cyan>10 independent derivative, technical, and flow indicators</cyan> into a single screen. Monitor <gold>VOL REGIME</gold> for current volatility structure, <cyan>CONVICTION</cyan> for multi-source data alignment, <rose>SHORT SQUEEZE</rose> for short-cover risk, and <emerald>ANALYST TARGET</emerald> for Wall Street consensus — all in real-time. Delivering the same analytical depth that costs hundreds of thousands at a Bloomberg Terminal.",
  indicatorsTitle: "Premium Indicator Cards",
  indicatorsSubtitle: "Institutional-Grade Analytics",
  indicatorsDesc: "Each indicator derives from an independent data source in real-time. The core of structural analysis lies not in interpreting single indicators, but in cross-validating multiple signals — applying the same multi-source confirmation methodology used by institutional analysts.",
  row1Title: "Row 1 — Real-Time Market Structure",
  row2Title: "Row 2 — Swing & Long-Term Positioning",
  volRegime: {
    title: "VOL REGIME",
    badge: "Volatility",
    desc: "Combines Gamma Exposure (GEX), Implied Volatility (IV), and Squeeze Probability to classify the current <gold>market volatility regime</gold> into 4 tiers. Quantified as a 0–100 Score derived directly from options dealer hedging structure — the metric institutional risk managers check first.",
    stable: "STABLE — Low volatility, range-bound environment",
    coiling: "COILING — Energy accumulating, direction seeking",
    loaded: "LOADED — Volatility at critical threshold, prepare for breakout",
    erupting: "ERUPTING — Extreme volatility, maximum risk zone",
    tip: "In LOADED/ERUPTING states, small catalysts can trigger non-linear price movements due to dealer short-gamma positioning — the structural characteristic that institutional risk managers prioritize.",
    tradingGuide: "Signal Interpretation",
    guide1: "STABLE: Dealer hedging tends to revert prices toward VWAP, creating a mean-reversion environment",
    guide2: "COILING: Compressed volatility accumulates energy; breakout moves tend to be amplified",
    guide3: "LOADED/ERUPTING: Dealer short-gamma deepens, creating structural conditions for bi-directional sharp moves"
  },
  conviction: {
    title: "CONVICTION MATRIX",
    badge: "Composite Score",
    desc: "Weighted aggregation of <cyan>moving average trends</cyan>, VWAP position, P/C Ratio, gamma exposure, and options flow — a <gold>directional conviction score</gold> from 5 independent data sources. Grades A through F to intuitively convey data alignment, implementing institutional multi-source confirmation methodology.",
    bull: "A–B+ (65+) — Bullish dominance, multi-signal alignment",
    neutral: "B–C (45-64) — Neutral, direction seeking",
    bear: "D–F (0-44) — Bearish dominance, concentrated sell signals",
    tip: "Conviction 80+ combined with VOL REGIME STABLE indicates 5 sources are stably aligned — a high-conviction structural environment.",
    tradingGuide: "Signal Interpretation",
    guide1: "Grade A: All 5 data sources converge in the same direction, structurally elevating trend continuation probability",
    guide2: "Grade C: Data conflict detected — a transitional state with low directional confidence",
    guide3: "Grade F: Multiple sources converge bearish, indicating structurally elevated downside risk"
  },
  vwapCard: {
    title: "VWAP",
    badge: "Institutional Benchmark",
    desc: "The deviation (%) between <cyan>Volume-Weighted Average Price</cyan> and current price. The industry-standard execution benchmark used by institutional participants to measure execution quality — its sign and magnitude reveal <gold>short-term supply/demand structure</gold>. A core reference at global hedge fund trading desks.",
    above: "Positive (+) — Above VWAP — Average buyer in profit",
    below: "Negative (−) — Below VWAP — Average buyer in loss",
    tip: "VWAP deviation within ±0.3% is the institutional benchmark battleground — the resolution direction at this level determines short-term trend.",
    tradingGuide: "Signal Interpretation",
    guide1: "+2% deviation: Average participants hold significant unrealized gains; profit-taking supply likely",
    guide2: "±0.5%: VWAP battleground zone — whether close forms above or below VWAP is the key observation",
    guide3: "−2% deviation: Average participants underwater; additional decline may trigger stop-loss cascades"
  },
  shortSqueeze: {
    title: "SHORT SQUEEZE",
    badge: "Short Risk",
    desc: "Aggregates Short Interest (SI%), Days to Cover, and short volume concentration to classify <rose>squeeze probability</rose> into tiers. Quantifies the potential magnitude of involuntary buying demand when forced covering occurs — a mandatory monitoring element in institutional risk management systems.",
    low: "LOW — SI% below 5%, squeeze probability minimal",
    medium: "MEDIUM — SI% 5-15%, monitoring required",
    high: "HIGH — SI% 15%+, short squeeze alert",
    critical: "CRITICAL — SI% 25%+, extreme risk",
    tip: "Days to Cover 3+ combined with SI% 15%+ creates the classic structure where short-cover demand can concentrate in a compressed timeframe.",
    tradingGuide: "Signal Interpretation",
    guide1: "HIGH/CRITICAL: Price increases can cascade forced covering, triggering non-linear rallies through self-reinforcing loops",
    guide2: "Positive momentum + HIGH SI%: Price rise triggers covers, covers trigger further rises — a self-reinforcing feedback loop",
    guide3: "LOW: Short interest impact on price is negligible; prioritize fundamental and technical analysis"
  },
  analystTarget: {
    title: "ANALYST TARGET",
    badge: "Consensus",
    desc: "Displays <emerald>analyst opinion distribution</emerald> and price target consensus from major investment banks and research houses. Track the 5-tier distribution (Strong Buy to Strong Sell), analyst count, and target-to-current price gap — real-time tracking of Wall Street's collective research judgment.",
    strongBuy: "Strong Buy — Overwhelming bullish consensus",
    buy: "Buy — Bullish consensus",
    hold: "Hold — Neutral consensus",
    sell: "Sell — Bearish consensus",
    tip: "Buy opinions above 80% indicate strongly converged consensus. Consider both that consensus may already be priced in and the crowding risk from absence of dissent.",
    tradingGuide: "Signal Interpretation",
    guide1: "Buy 90%+: Research community outlook extremely converged — strong consensus serves as a medium-term bullish foundation",
    guide2: "Buy 50–70%: Dispersed opinions suggest data permits multiple interpretations — an uncertain phase",
    guide3: "Hold majority: Absence of directional conviction; wait-and-see dominates until new catalysts emerge"
  },
  related: {
    title: "RELATED",
    badge: "Correlated Peers",
    desc: "Displays real-time performance of industry peers with <cyan>high statistical correlation</cyan>. Instantly distinguish sector-wide capital flows from individual stock events — delivering the same correlation analysis that institutional traders monitor continuously.",
    positive: "Same direction — Sector-wide common factors at work",
    divergent: "Different direction — Stock-specific factors driving price",
    tip: "When all related stocks move together but the target diverges, it signals a decoupling structure where individual catalysts override sector trends.",
    tradingGuide: "Signal Interpretation",
    guide1: "Sector co-movement: Macro/sector flows dominate price action over individual fundamentals",
    guide2: "Leader-only advance: Intra-sector rotation underway; whether it spreads to laggards is the key question",
    guide3: "Decoupling: Stock-specific catalyst overrides sector trend"
  },
  instRadar: {
    title: "INST RADAR",
    badge: "Institutional Flow",
    desc: "Combines <purple>dark pool trading ratios</purple> and <cyan>block trade frequency</cyan> to classify institutional Accumulation/Distribution patterns into 3 tiers. Infers institutional positioning intent invisible to public markets — data typically accessible only through institutional-only terminals.",
    accum: "ACCUMULATION — Dark pool 40%+ & Block 3+ — Institutional buying indicated",
    neutral: "NEUTRAL — Normal range, no institutional anomalies detected",
    dist: "DISTRIBUTION — Dark pool 20%− & Block 1− — Institutional selling indicated",
    tip: "ACCUMULATION coinciding with Buy consensus indicates both institutional execution and research views are aligned — a powerful structural agreement.",
    tradingGuide: "Signal Interpretation",
    guide1: "ACCUMULATION: Large volumes aggregating off-exchange, indicating non-public institutional buying intent",
    guide2: "DISTRIBUTION: Institutional supply entering the market; selling may continue even during rallies",
    guide3: "NEUTRAL: Institutional participation at normal levels; retail flow plays the dominant price-setting role"
  },
  trendPhase: {
    title: "TREND PHASE",
    badge: "Trend Diagnosis",
    desc: "Diagnoses the current trend phase based on <emerald>SMA 50/200 crossover state</emerald>. Golden Cross and Dead Cross are the technical reference points institutional portfolio managers use for medium-to-long-term asset allocation — SIGNUM delivers these with real-time levels and deviation percentages.",
    golden: "GOLDEN — SMA 50 > SMA 200, medium-term bullish transition",
    dead: "DEAD — SMA 50 < SMA 200, medium-term bearish transition",
    neutral: "NEUTRAL — No crossover, existing trend tentatively maintained",
    tip: "Golden Cross + CONVICTION Grade A: Technical trend and multi-source data confirm the same direction — a structurally powerful setup.",
    tradingGuide: "Signal Interpretation",
    guide1: "Golden Cross: 50-day average crossed above 200-day — technical confirmation of medium-term bullish momentum",
    guide2: "Dead Cross: 50-day average fell below 200-day — technical warning of medium-term bearish transition",
    guide3: "SMA gap within 3%: Two averages converging, crossover imminent — a transitional zone"
  },
  fundamental: {
    title: "FUNDAMENTAL",
    badge: "Financial Analysis",
    desc: "Composite <emerald>financial health score</emerald> integrating <cyan>P/E</cyan>, <gold>ROE</gold>, free cash flow, revenue growth, operating margin, and debt ratio. Automated quantitative analysis applying institutional analyst valuation frameworks — instantly accessible as 0–100 / A–F grade.",
    aGrade: "Grade A (80+) — Financially excellent, growth-profitability balance",
    bGrade: "Grade B (60-79) — Solid with minor weaknesses",
    cGrade: "Grade C or below — Improvement needed, risk flagged",
    tip: "P/E discounted vs. sector average combined with ROE above 20% suggests undervaluation relative to earnings power.",
    tradingGuide: "Signal Interpretation",
    guide1: "Grade A: Growth, profitability, and stability all strong — structural fundamental advantage confirmed",
    guide2: "Grade B: Most metrics solid but specific areas require attention — a mixed picture",
    guide3: "Grade C−: Structural financial vulnerabilities confirmed; price likely driven by speculative flow"
  },
  earnings: {
    title: "EARNINGS",
    badge: "Earnings Schedule",
    desc: "Displays next <gold>quarterly earnings date</gold>, D-Day countdown, and EPS estimates. The structural IV expansion/contraction pattern around earnings is a core variable in institutional options strategy — SIGNUM auto-integrates this schedule into all analysis modules.",
    upcoming: "Earnings imminent (D-7) — IV expansion, premium-rich environment",
    far: "Earnings distant — Fundamentals and technicals take priority",
    tip: "IV typically surges D-3 onwards; post-announcement, uncertainty resolution frequently triggers IV Crush.",
    tradingGuide: "Signal Interpretation",
    guide1: "D-7: IV begins rising; options premiums expand as volatility expectations build",
    guide2: "Earnings day: Directional uncertainty peaks; results can trigger significant gap moves",
    guide3: "Post-earnings: Uncertainty resolves, IV normalizes rapidly — known as IV Crush"
  },
  chartTitle: "Price History Chart",
  chartDesc: "Overlays Call Wall, Max Pain, Put Floor, and Prev Close levels on a <cyan>multi-timeframe price chart</cyan>. Instantly visualize <gold>support/resistance zones</gold> defined by options structure. Switchable across 1D/5D/1M/6M/1Y/All — integrating institutional-grade options level analysis directly into the chart.",
  signalTitle: "SIGNAL CORE",
  signalDesc: "<gold>Composite signal analysis engine</gold>. Displays detected structural events (Golden Cross, IV Spike, Consensus Shift) as summary badges. After market close, auto-generates AI comprehensive analysis reports combining SMA, news, and flow data.",
  flowTitle: "FLOW UNIT",
  flowDesc: "Tracks <emerald>real-time options capital flows</emerald>. Combines Call/Put premium differential (Net Premium) with execution intensity (Volume Strength) to capture large participant <gold>directional positioning</gold> in real-time — a core feature delivering institutional options flow data to individual investors.",
  gammaTitle: "TACTICAL RANGE & NET GAMMA ENGINE",
  gammaDesc: "Provides <gold>structural price levels</gold> derived from options open interest and <cyan>gamma profile analysis</cyan>. Support/Resist/Max Pain define the short-term price range while Net GEX direction and Gamma Flip structurally classify the current market environment.",
  intelTitle: "INTEL FEED (AI)",
  intelDesc: "<cyan>AI news intelligence</cyan> feed. AI engine analyzes stock-relevant news in real-time, auto-evaluating market impact and sentiment. Each news item receives auto-classification tags and impact scores for rapid situational awareness.",
  gammaFlipDesc: "<purple>Gamma Flip Level</purple> is the price point where dealer gamma exposure <cyan>transitions from long to short</cyan>. At this boundary, dealer hedging direction reverses — above it, dealers hedge <emerald>against price movement</emerald> (stabilizing); below it, they hedge <rose>in the same direction</rose> (amplifying). A core reference level at institutional options desks — SIGNUM delivers it to individual investors in real-time.",
  gammaFlip: {
    longTitle: "LONG γ Zone (Above Flip)",
    longDesc: "Price > Gamma Flip → Dealers <emerald>hedge against price movement</emerald> → Natural braking force on price swings. A <gold>volatility-suppressed range environment</gold> forms.",
    shortTitle: "SHORT γ Zone (Below Flip)",
    shortDesc: "Price < Gamma Flip → Dealers <rose>hedge in the same direction as price</rose> → Price moves become self-reinforcing. A <gold>volatility-amplified momentum environment</gold> forms.",
    tip: "Monitor Flip deviation (%) on the VOL REGIME card for real-time distance to regime transition. Within ±2%, regime shift is considered imminent."
  },
  strategy: {
    title: "Structural Analysis Workflow",
    desc: "Systematize Command's 10 indicators into a <cyan>4-step framework</cyan> for multi-dimensional market structure analysis. Adapts the actual analytical process used by institutional trading desks for individual investors.",
    step1: {
      title: "Step 1: Volatility Regime Assessment",
      desc: "Check VOL REGIME's 4-tier grade and CONVICTION's composite score first. Understanding whether the market is in a Stable/Transitional/Explosive volatility regime and which direction data align forms the foundation for all subsequent analysis."
    },
    step2: {
      title: "Step 2: Directional Structure Confirmation",
      desc: "Review TREND PHASE crossover state and VWAP deviation. Confirm whether technical trend and short-term supply/demand benchmark point the same direction or conflict."
    },
    step3: {
      title: "Step 3: Risk Environment Evaluation",
      desc: "Check SHORT SQUEEZE risk tier and EARNINGS D-Day. High SI% + imminent earnings creates compound catalyst conditions for bi-directional sharp moves."
    },
    step4: {
      title: "Step 4: Institutional Participation Structure",
      desc: "Review INST RADAR's Accumulation/Distribution signals and FLOW UNIT's Net Premium direction. Infer institutional positioning through cross-analysis of dark pool, block trade, and flow data."
    },
    warningTitle: "⚠️ Risk Disclosure & Disclaimer",
    warningDesc: "All information provided (including indicators, signals, and analysis results) represents quantitative analysis of market data and does not constitute investment advice, trade directives, or personalized recommendations. Financial investments carry the risk of principal loss. Past data and indicators do not guarantee future returns. All investment decisions are made under the user's own responsibility."
  }
};
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2) + '\n', 'utf8');
console.log('EN commandGuide replaced (' + JSON.stringify(enData.commandGuide).length + ' chars)');

// ── JAPANESE ──
const jaPath = 'C:/Users/seamo/backup/stock2/src/messages/ja.json';
const jaData = JSON.parse(fs.readFileSync(jaPath, 'utf8'));
jaData.commandGuide = {
  subtitle: "機関トレーディングデスクで使用する10個の独立デリバティブ・テクニカル・需給指標を個人投資家の画面に実装した分析ターミナル",
  overviewTitle: "COMMAND 概要",
  overviewDesc: "Commandターミナルは<cyan>10個の独立デリバティブ・テクニカル・需給指標</cyan>を一画面に集約。<gold>VOL REGIME</gold>で現在のボラティリティ体制を、<cyan>CONVICTION</cyan>で複合データ整列を、<rose>SHORT SQUEEZE</rose>でショートカバーリスクを、<emerald>ANALYST TARGET</emerald>でウォール街コンセンサスをリアルタイムで確認できます。ブルームバーグターミナルで数百万円のコストで提供される同水準の分析を提供します。",
  indicatorsTitle: "プレミアム指標カード",
  indicatorsSubtitle: "Institutional-Grade Analytics",
  indicatorsDesc: "各指標は独立したデータソースからリアルタイムで導出されます。単一指標の解釈ではなく、複数指標のクロスバリデーションが構造分析の核心です。機関アナリストが使用する同一の分析フレームワークを適用しています。",
  row1Title: "Row 1 — リアルタイム市場構造診断",
  row2Title: "Row 2 — 中長期ポジショニング分析",
  volRegime: {
    title: "VOL REGIME", badge: "ボラティリティ",
    desc: "ガンマエクスポージャー(GEX)、IV、スクイーズ確率の3軸を統合し、現在の<gold>市場ボラティリティ体制</gold>を4段階に分類。0〜100スコアで体制強度を数値化。オプションディーラーのヘッジ構造から直接導出した、機関リスクマネージャーが最初に確認する指標です。",
    stable: "STABLE — 低ボラティリティ、レンジ環境",
    coiling: "COILING — エネルギー蓄積中、方向模索",
    loaded: "LOADED — ボラティリティ臨界、ブレイクアウト準備",
    erupting: "ERUPTING — 極度のボラティリティ、最大リスクゾーン",
    tip: "LOADED/ERUPTING状態では小規模触媒でも非線形的な価格変動が発生します。ディーラーのショートガンマに起因する構造的特性です。",
    tradingGuide: "シグナル解釈",
    guide1: "STABLE: ディーラーヘッジが価格をVWAP方向に回帰させる傾向、ミーンリバージョン環境",
    guide2: "COILING: 圧縮ボラティリティがエネルギーを蓄積、ブレイクアウト時に移動幅が拡大",
    guide3: "LOADED/ERUPTING: ディーラーショートガンマが深化、双方向の急変動の構造的条件が形成"
  },
  conviction: {
    title: "CONVICTION MATRIX", badge: "複合スコア",
    desc: "<cyan>移動平均トレンド</cyan>、VWAP位置、P/Cレシオ、ガンマ、オプションフロー — 5独立データの加重集計<gold>方向確信度スコア</gold>。A〜F等級でデータ方向合意を直感表現。機関のマルチソース確認手法を実装。",
    bull: "A〜B+ (65+) — 強気優勢、複合シグナル整列",
    neutral: "B〜C (45-64) — 中立、方向模索中",
    bear: "D〜F (0-44) — 弱気優勢、売りシグナル集中",
    tip: "Conviction 80+かつVOL REGIME STABLEなら5ソースが安定整列 — 高確信の構造環境です。",
    tradingGuide: "シグナル解釈",
    guide1: "A等級: 5データソースが同方向に収束、トレンド継続確率が構造的に上昇",
    guide2: "C等級: データ間の矛盾が発生、方向への確信が弱い移行状態",
    guide3: "F等級: 複数ソースが弱気方向に収束、下方リスクが構造的に高い環境"
  },
  vwapCard: {
    title: "VWAP", badge: "機関ベンチマーク",
    desc: "<cyan>出来高加重平均価格(VWAP)</cyan>と現在価格の乖離率(%)。機関投資家が執行品質を測定する業界標準ベンチマーク。この数値の符号と大きさが<gold>短期需給構造の方向</gold>を示します。グローバルヘッジファンドの核心参照指標。",
    above: "プラス(+) — VWAP上回り — 平均買い手が利益圏内",
    below: "マイナス(−) — VWAP下回り — 平均買い手が損失圏内",
    tip: "VWAP乖離±0.3%以内は機関ベンチマーク攻防圏 — この地点での解決方向が短期トレンドを決定します。",
    tradingGuide: "シグナル解釈",
    guide1: "+2%乖離: 平均参加者が相当な含み益を保有、利益確定売りが入りやすい区間",
    guide2: "±0.5%: VWAP攻防圏、終値がVWAPの上下どちらに形成されるかが核心",
    guide3: "−2%乖離: 平均参加者が損失状態、追加下落時に損切り需要発生の可能性"
  },
  shortSqueeze: {
    title: "SHORT SQUEEZE", badge: "空売りリスク",
    desc: "SI%、DTC、空売り取引集中度を総合し<rose>スクイーズ発生確率</rose>を等級化。強制決済時の非自発的買い需要規模を定量化 — 機関リスク管理システムの必須モニタリング要素です。",
    low: "LOW — SI% 5%未満、スクイーズ可能性低い",
    medium: "MEDIUM — SI% 5-15%、モニタリング必要",
    high: "HIGH — SI% 15%+、ショートスクイーズ警報",
    critical: "CRITICAL — SI% 25%+、極度の危険",
    tip: "DTC 3日以上 + SI% 15%以上は、ショートカバー需要が短期間に集中する典型的構造です。",
    tradingGuide: "シグナル解釈",
    guide1: "HIGH/CRITICAL: 価格上昇が強制カバーを連鎖させ、非線形的急騰が発生する可能性",
    guide2: "上昇モメンタム + HIGH SI%: 価格上昇→カバー→さらなる上昇の自己強化ループ形成",
    guide3: "LOW: 空売り比率の価格影響は無視可能、ファンダメンタル・テクニカル分析を優先"
  },
  analystTarget: {
    title: "ANALYST TARGET", badge: "コンセンサス",
    desc: "主要投資銀行の<emerald>アナリスト意見分布</emerald>と目標株価コンセンサスを表示。5段階分布、参加アナリスト数、目標株価乖離率を一目で確認。ウォール街リサーチの集合的判断をリアルタイム追跡します。",
    strongBuy: "Strong Buy — 圧倒的強気コンセンサス",
    buy: "Buy — 強気コンセンサス",
    hold: "Hold — 中立コンセンサス",
    sell: "Sell — 弱気コンセンサス",
    tip: "買い意見80%以上はコンセンサスが強く収束した状態。既に価格に織り込まれている可能性と、反対意見不在のクラウディングリスクを同時に考慮すべきです。",
    tradingGuide: "シグナル解釈",
    guide1: "買い90%+: リサーチコミュニティの見通しが極度に収束、中長期強気の基盤",
    guide2: "買い50-70%: 意見が分散、データが複数解釈を許容する不確実局面",
    guide3: "Hold多数: 方向への確信不在、新触媒が出るまで様子見が支配的"
  },
  related: {
    title: "RELATED", badge: "相関銘柄",
    desc: "対象銘柄と<cyan>高い統計的相関</cyan>を持つ同業種銘柄のリアルタイムリターンを並列表示。セクター全体の資金フローか個別銘柄固有イベントかを即座に判別。機関トレーダーが常時モニタリングする相関分析を個人投資家に提供します。",
    positive: "同方向 — セクター共通要因が作用",
    divergent: "異方向 — 個別銘柄固有要因が価格を主導",
    tip: "関連銘柄全体が同方向なのに対象銘柄だけが逆方向の場合、個別触媒がセクタートレンドを凌駕するデカップリング構造です。",
    tradingGuide: "シグナル解釈",
    guide1: "セクター連動: マクロ・セクター資金フローが個別ファンダメンタルより価格を主導",
    guide2: "リーダーのみ先行: セクター内ローテーション進行中、後発銘柄への波及が焦点",
    guide3: "デカップリング: 個別触媒がセクタートレンドを凌駕する状態"
  },
  instRadar: {
    title: "INST RADAR", badge: "機関フロー",
    desc: "<purple>ダークプール取引比率</purple>と<cyan>ブロックトレード頻度</cyan>を統合し、機関の集積/分配パターンを3段階に分類。公開市場で見えない機関のポジショニング意図を間接推論 — 通常、機関専用ターミナルでのみアクセス可能なデータです。",
    accum: "ACCUMULATION — ダークプール40%+ & ブロック3件+ — 機関集積示唆",
    neutral: "NEUTRAL — 通常範囲、機関異常動向なし",
    dist: "DISTRIBUTION — ダークプール20%- & ブロック1件- — 機関分配示唆",
    tip: "ACCUMULATIONと買いコンセンサスが同時に観測されれば、機関の執行とリサーチの見解が同方向に整列した強力な構造的合意です。",
    tradingGuide: "シグナル解釈",
    guide1: "ACCUMULATION: 取引所外で大量物量が集積、機関の非公開買い意図を示唆",
    guide2: "DISTRIBUTION: 機関の売り供給が市場に流入、上昇局面でも内部的売却が進行の可能性",
    guide3: "NEUTRAL: 機関参加が通常水準、個人投資家の需給が価格形成の主導的役割"
  },
  trendPhase: {
    title: "TREND PHASE", badge: "トレンド診断",
    desc: "<emerald>SMA 50日線と200日線</emerald>の交差状態で現在のトレンド局面を診断。ゴールデンクロス/デッドクロスは機関PMが中長期資産配分に参照するテクニカル基準点。SIGNUMではリアルタイムレベルと乖離率(%)で提供します。",
    golden: "GOLDEN — SMA 50 > SMA 200、中長期強気転換",
    dead: "DEAD — SMA 50 < SMA 200、中長期弱気転換",
    neutral: "NEUTRAL — 交差未発生、既存トレンド暫定維持",
    tip: "Golden Cross + CONVICTION A等級: テクニカルトレンドとマルチソースデータが同方向を確認 — 構造的に強力なセットアップ。",
    tradingGuide: "シグナル解釈",
    guide1: "Golden Cross: 50日平均が200日平均を上抜け — 中期強気モメンタムのテクニカル確認",
    guide2: "Dead Cross: 50日平均が200日平均を下抜け — 中期弱気転換のテクニカル警告",
    guide3: "SMA乖離3%以内: 2移動平均が収束中、交差が差し迫った移行区間"
  },
  fundamental: {
    title: "FUNDAMENTAL", badge: "財務分析",
    desc: "<cyan>PER</cyan>、<gold>ROE</gold>、FCF、売上成長率、営業利益率、負債比率等を総合した<emerald>財務健全性スコア</emerald>。機関アナリストのバリュエーションフレームワークを自動化した定量分析。0〜100 / A〜F等級で即座に確認可能。",
    aGrade: "A等級 (80+) — 財務優秀、成長・収益性のバランス",
    bGrade: "B等級 (60-79) — 良好、一部弱点あり",
    cGrade: "C等級以下 — 改善必要、リスク注意",
    tip: "PERがセクター平均より割安かつROE 20%以上の組合せは、収益力対比の過小評価を示唆します。",
    tradingGuide: "シグナル解釈",
    guide1: "A等級: 成長性、収益性、財務安定性のすべてが良好 — ファンダメンタルの構造的優位を確認",
    guide2: "B等級: 大部分の指標は良好だが特定領域に注意が必要 — 混合状態",
    guide3: "C等級以下: 構造的な財務脆弱性が確認、価格がファンダメンタルより投機的需給で形成される可能性"
  },
  earnings: {
    title: "EARNINGS", badge: "決算スケジュール",
    desc: "次回<gold>四半期決算発表日</gold>、Dデイカウントダウン、予想EPSを表示。決算前後のIV膨張・収縮パターンは機関オプション戦略の核心変数。SIGNUMはこのスケジュールを全分析に自動反映します。",
    upcoming: "決算間近(D-7) — IV膨張、プレミアム拡大環境",
    far: "決算まで余裕 — ファンダメンタル・テクニカル中心区間",
    tip: "D-3以降IVが急騰するのが一般的。発表直後は不確実性解消とともにIV Crush(プレミアム急収縮)が頻繁に観測されます。",
    tradingGuide: "シグナル解釈",
    guide1: "D-7: IVが上昇開始、オプションプレミアムが拡大しボラティリティ期待が反映",
    guide2: "決算当日: 方向性不確実性がピーク、結果次第で大幅ギャップの可能性",
    guide3: "決算発表後: 不確実性が解消しIVが急速正常化 — これがIV Crushです"
  },
  chartTitle: "Price History チャート",
  chartDesc: "<cyan>マルチタイムフレーム価格チャート</cyan>上にCall Wall、Max Pain、Put Floor、Prev Closeレベルをオーバーレイ。オプション構造が形成した<gold>サポート・レジスタンスゾーン</gold>を直感的に把握。1D/5D/1M/6M/1Y/All切替可能。機関級オプションレベル分析をチャートに統合。",
  signalTitle: "SIGNAL CORE",
  signalDesc: "<gold>複合シグナル分析エンジン</gold>。構造的イベント(ゴールデンクロス、IVスパイク、コンセンサス変動)をバッジで要約表示。大引け後はSMA・ニュース・需給データを統合したAI総合分析レポートが自動生成。",
  flowTitle: "FLOW UNIT",
  flowDesc: "<emerald>リアルタイムオプション資金フロー</emerald>を追跡。コール/プットプレミアム差と約定強度を組み合わせ、大口参加者の<gold>方向性ポジショニング</gold>をリアルタイムで捕捉。機関のオプションフローデータを個人投資家にリアルタイム提供する核心機能。",
  gammaTitle: "TACTICAL RANGE & NET GAMMA ENGINE",
  gammaDesc: "オプション建玉から導出した<gold>構造的価格レベル</gold>と<cyan>ガンマプロファイル分析</cyan>を提供。Support/Resist/Max Painが短期価格レンジを定義し、Net GEX方向とGamma Flipが市場環境を構造的に分類。",
  intelTitle: "INTEL FEED (AI)",
  intelDesc: "<cyan>AIニュースインテリジェンス</cyan>フィード。AIエンジンが対象銘柄ニュースをリアルタイム分析し市場影響度とセンチメントを自動評価。各ニュースに自動分類タグとインパクトスコアが付与。",
  gammaFlipDesc: "<purple>Gamma Flip Level</purple>はディーラーのガンマエクスポージャーが<cyan>ロングからショートに転換</cyan>する価格線。このレベルを境にディーラーヘッジの方向が反転 — 上方では<emerald>価格移動と逆方向にヘッジ</emerald>(安定化)、下方では<rose>同方向にヘッジ</rose>(増幅)。機関オプションデスクの核心参照レベル — SIGNUMが個人投資家にリアルタイム提供する差別化分析です。",
  gammaFlip: {
    longTitle: "LONG γ Zone (Flip上方)",
    longDesc: "現在価格 > Gamma Flip → ディーラーが<emerald>価格移動と逆方向にヘッジ</emerald> → 価格変動への自然制動力が作用。<gold>ボラティリティ抑制のレンジ環境</gold>が形成。",
    shortTitle: "SHORT γ Zone (Flip下方)",
    shortDesc: "現在価格 < Gamma Flip → ディーラーが<rose>価格移動と同方向にヘッジ</rose> → 価格変動が自己強化的に拡大。<gold>ボラティリティ増幅のモメンタム環境</gold>が形成。",
    tip: "VOL REGIMEカードのFlip乖離率(%)でレジーム転換までの距離をリアルタイム把握。±2%以内ならレジームシフトが差し迫ったと解釈されます。"
  },
  strategy: {
    title: "構造分析ワークフロー",
    desc: "Commandの10指標を<cyan>4ステップフレームワーク</cyan>で体系化し市場構造を立体把握。機関トレーディングデスクの実際の分析プロセスを個人投資家向けに再構成。",
    step1: { title: "Step 1: ボラティリティ体制診断", desc: "VOL REGIMEの4段階等級とCONVICTIONの複合スコアを最初に確認。市場が安定/移行/爆発のどのボラティリティ体制にあるか、複合データがどの方向に整列しているかが全後続分析の基礎となります。" },
    step2: { title: "Step 2: 方向構造確認", desc: "TREND PHASEの移動平均交差状態とVWAP乖離率を点検。テクニカルトレンドと短期需給ベンチマークが同方向を示すか矛盾するかを確認します。" },
    step3: { title: "Step 3: リスク環境評価", desc: "SHORT SQUEEZEリスク等級とEARNINGS Dデイを点検。高SI% + 決算間近は複合触媒が重なる高リスク区間 — 双方向急変動の構造的条件が形成されます。" },
    step4: { title: "Step 4: 機関参加構造確認", desc: "INST RADARの集積/分配シグナルとFLOW UNITのNet Premium方向を確認。ダークプール・ブロック・フローデータのクロス分析で機関のポジショニング意図を推論します。" },
    warningTitle: "⚠️ リスク開示・免責事項",
    warningDesc: "本サービスで提供するすべての情報は市場データの定量分析結果であり、投資助言・売買指示・個別推奨には該当しません。金融投資には元本毀損リスクが伴い、過去のデータは将来の収益を保証しません。すべての投資判断は利用者ご自身の責任のもとで行われます。"
  }
};
fs.writeFileSync(jaPath, JSON.stringify(jaData, null, 2) + '\n', 'utf8');
console.log('JA commandGuide replaced (' + JSON.stringify(jaData.commandGuide).length + ' chars)');
