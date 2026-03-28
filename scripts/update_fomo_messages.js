/**
 * Update FOMO messages in en/ko/ja gate sections
 * Improves messaging to be more compelling and action-oriented
 */
const fs = require('fs');
const path = require('path');

const FOMO_UPDATES = {
  // ===== FLOW PAGE =====
  fomoAiVerdict: {
    en: "AI-powered options flow analysis · Bullish/Bearish pressure detected in real-time",
    ko: "AI 기반 옵션 플로우 방향 분석 · 실시간 매수/매도 압력 감지",
    ja: "AI駆動オプションフロー分析 · 強気/弱気圧力をリアルタイム検知"
  },
  fomoMarketStructure: {
    en: "Live gamma structure · Support/Resistance levels from options positioning",
    ko: "실시간 감마 구조 · 옵션 포지셔닝 기반 지지/저항 레벨",
    ja: "リアルタイムガンマ構造 · オプションポジショニングによるサポート/レジスタンス"
  },
  fomoGexRegime: {
    en: "Net GEX regime analysis · Institutional gamma exposure tracking",
    ko: "넷 GEX 레짐 분석 · 기관 감마 노출 추적",
    ja: "ネットGEXレジーム分析 · 機関ガンマエクスポージャー追跡"
  },
  fomoOptionsBattlefield: {
    en: "Options landscape · Strike-level call/put positioning & open interest flow",
    ko: "옵션 전장 · 행사가별 콜/풋 포지셔닝 & 미결제약정 흐름",
    ja: "オプション戦場 · 行使価格別コール/プットポジショニング＆建玉フロー"
  },
  fomoClassifiedFlow: {
    en: "Institutional block trades · Large-lot order flow tape in real-time",
    ko: "기관 블록 트레이드 · 대형 주문 플로우 테이프 실시간 공개",
    ja: "機関ブロック取引 · 大口注文フローテープをリアルタイム公開"
  },
  fomoImpliedMove: {
    en: "Expected price range derived from options pricing · Weekly/Monthly outlook",
    ko: "옵션 가격 기반 예상 변동폭 · 주간/월간 전망",
    ja: "オプション価格から算出される予想変動幅 · 週間/月間見通し"
  },
  fomoPutFloorCallWall: {
    en: "Key support & resistance from concentrated options positioning",
    ko: "집중된 옵션 포지셔닝에서 도출된 핵심 지지/저항선",
    ja: "集中オプションポジショニングから導出された主要サポート/レジスタンス"
  },
  fomoMaxPain: {
    en: "Options expiration convergence level · Where price gravitates at expiry",
    ko: "옵션 만기 수렴 레벨 · 만기일 가격 수렴점 분석",
    ja: "オプション満期収束レベル · 満期日の価格収束点分析"
  },
  fomoIvSkew: {
    en: "Implied volatility surface · Call/Put IV skew direction analysis",
    ko: "내재변동성 표면 · 콜/풋 IV 스큐 방향 분석",
    ja: "インプライドボラティリティサーフェス · コール/プットIVスキュー分析"
  },
  fomoOmr: {
    en: "Options market regime · Institutional-grade regime detection system",
    ko: "옵션 마켓 레짐 · 기관급 레짐 감지 시스템",
    ja: "オプションマーケットレジーム · 機関級レジーム検知システム"
  },
  fomoDex: {
    en: "Delta exposure analysis · Net directional positioning of market makers",
    ko: "델타 노출 분석 · 마켓메이커 순방향 포지셔닝",
    ja: "デルタエクスポージャー分析 · マーケットメイカーのネット方向性ポジション"
  },
  titleUoa: {
    en: "Unusual Options Activity",
    ko: "이상 옵션 활동",
    ja: "異常オプション活動"
  },

  // ===== COMMAND PAGE (LiveTickerDashboard) =====
  fomoSqueeze: {
    en: "Gamma squeeze risk analysis · Short interest dynamics & trigger levels",
    ko: "감마 스퀴즈 리스크 분석 · 공매도 동향 & 트리거 레벨",
    ja: "ガンマスクイーズリスク分析 · 空売り動向＆トリガーレベル"
  },

  // ===== DASHBOARD =====
  fomoDashCallPut: {
    en: "Call Wall & Put Floor — Key support/resistance from options concentration",
    ko: "콜월 & 풋플로어 — 옵션 집중도 기반 핵심 지지/저항선",
    ja: "コールウォール＆プットフロア — オプション集中度によるサポート/レジスタンス"
  },
  fomoDarkPool: {
    en: "Institutional dark pool trading volume · Hidden liquidity analysis",
    ko: "기관 다크풀 거래 비중 · 숨겨진 유동성 분석",
    ja: "機関ダークプール取引比重 · 隠れた流動性分析"
  },
  fomoShortVol: {
    en: "Short volume analysis · Bearish positioning intensity tracking",
    ko: "공매도 거래량 분석 · 약세 포지셔닝 강도 추적",
    ja: "空売り取引量分析 · 弱気ポジショニング強度追跡"
  },
  fomoAtmIv: {
    en: "ATM implied volatility surface · Options pricing tension indicator",
    ko: "ATM 내재변동성 표면 · 옵션 가격 긴장도 지표",
    ja: "ATMインプライドボラティリティ · オプション価格テンション指標"
  },
  fomoDashGexRegime: {
    en: "Gamma regime analysis · Institutional exposure state & transition signals",
    ko: "감마 레짐 분석 · 기관 노출 상태 & 전환 시그널",
    ja: "ガンマレジーム分析 · 機関エクスポージャー状態＆転換シグナル"
  },
  fomoDashImpliedMove: {
    en: "Derivatives-based price movement forecast · Expected weekly range",
    ko: "파생상품 기반 가격 변동 예측 · 예상 주간 변동폭",
    ja: "デリバティブ基準の価格変動予測 · 予想週間変動幅"
  },
  fomoDashMaxPain: {
    en: "Options expiration convergence · Max pain gravity level",
    ko: "옵션 만기 수렴점 · 맥스페인 중력 레벨",
    ja: "オプション満期収束ポイント · マックスペイン重力レベル"
  },

  // ===== GUARDIAN =====
  fomoGravityGauge: {
    en: "RLSI Market Temperature · Real-time regime change detection with 7 macro signals",
    ko: "RLSI 시장 온도 · 7개 매크로 시그널 기반 실시간 레짐 변화 감지",
    ja: "RLSI市場温度 · 7つのマクロシグナルによるリアルタイムレジーム変化検知"
  },
  fomoRealityCheck: {
    en: "Market Divergence Analysis · When price and breadth tell different stories",
    ko: "시장 다이버전스 분석 · 가격과 체감이 다를 때 포착하는 엣지",
    ja: "市場ダイバージェンス分析 · 価格と実態が乖離する瞬間を捉える"
  },
  fomoRlsiInsight: {
    en: "Regime Change Detection System · AI-driven market condition briefing",
    ko: "레짐 변화 감지 시스템 · AI 기반 시장 상태 브리핑",
    ja: "レジーム変化検知システム · AI駆動の市場状態ブリーフィング"
  },
  fomoGammaShield: {
    en: "Gamma Shield Status · Net gamma exposure & institutional hedging state",
    ko: "감마 방패 현황 · 순 감마 노출 & 기관 헤지 상태",
    ja: "ガンマシールド現況 · ネットガンマエクスポージャー＆機関ヘッジ状態"
  },
  fomoFlowTopo: {
    en: "Institutional Flow Topography · FOCUS ZONE — Where smart money is moving",
    ko: "기관 자금 흐름 지형도 · FOCUS ZONE — 스마트머니가 움직이는 곳",
    ja: "機関資金フロートポグラフィ · FOCUS ZONE — スマートマネーの行き先"
  },
  fomoIntelStack: {
    en: "Tactical Verdict · Sector Flow Intelligence — AI-synthesized market context",
    ko: "전술적 판단 · 섹터 자금 흐름 인텔 — AI 종합 시장 맥락",
    ja: "戦術判断 · セクター資金フローインテル — AI統合マーケットコンテキスト"
  },

  // ===== INTEL =====
  fomoAlphaLeaders: {
    en: "Today's Alpha Analytics #1·#2 Leaders revealed",
    ko: "오늘의 알파 분석 #1·#2 리더 공개",
    ja: "本日のAlpha Analytics #1·#2リーダー公開"
  },
  fomoM7Locked: {
    en: "TSLA·NVDA Live Analysis — Real-time AI-powered deep dive",
    ko: "TSLA·NVDA 실시간 분석 — AI 기반 리얼타임 딥 다이브",
    ja: "TSLA·NVDAリアルタイム分析 — AI駆動ディープダイブ"
  },
  fomoM7LockedTicker: {
    en: "{ticker} Live Analysis — Full AI deep dive available",
    ko: "{ticker} 실시간 분석 — 풀 AI 딥 다이브 이용 가능",
    ja: "{ticker} リアルタイム分析 — フルAIディープダイブ利用可能"
  },
  fomoPostMarket: {
    en: "Post-Market AI Sector Brief — After-hours intelligence synthesis",
    ko: "장마감 AI 섹터 브리프 — 장 마감 후 인텔리전스 종합",
    ja: "取引後AIセクターブリーフ — アフターアワーズ・インテリジェンス統合"
  },

  // ===== SECTOR REPORTS =====
  fomoPhysicalAI: {
    en: "Physical AI Sector Analysis · Robotics & embodied intelligence",
    ko: "피지컬 AI 섹터 분석 · 로보틱스 & 구현형 인텔리전스",
    ja: "Physical AIセクター分析 · ロボティクス＆身体的知能"
  },
  fomoSiliconCore: {
    en: "Silicon Core · Semiconductor supply chain & demand cycle analysis",
    ko: "실리콘 코어 · 반도체 공급망 & 수요 사이클 분석",
    ja: "シリコンコア · 半導体サプライチェーン＆需要サイクル分析"
  },
  fomoPowerMatrix: {
    en: "Power Matrix · AI energy infrastructure & grid transformation",
    ko: "파워 매트릭스 · AI 에너지 인프라 & 그리드 전환 분석",
    ja: "パワーマトリックス · AIエネルギーインフラ＆グリッド転換分析"
  },
  fomoBioPulse: {
    en: "Bio Pulse · Biotech pipeline & clinical catalyst tracking",
    ko: "바이오 펄스 · 바이오텍 파이프라인 & 임상 촉매 추적",
    ja: "バイオパルス · バイオテックパイプライン＆臨床カタリスト追跡"
  },
  fomoCyberShield: {
    en: "Cyber Shield · Cybersecurity threat landscape & sector dynamics",
    ko: "사이버 실드 · 사이버보안 위협 지형 & 섹터 역학",
    ja: "サイバーシールド · サイバーセキュリティ脅威ランドスケープ＆セクター動向"
  },
  fomoOrbitDefense: {
    en: "Orbit Defense · Aerospace & defense sector intelligence",
    ko: "오빗 디펜스 · 항공우주 & 방위 섹터 인텔리전스",
    ja: "オービットディフェンス · 航空宇宙＆防衛セクターインテリジェンス"
  },
  fomoQuantumEdge: {
    en: "Quantum Edge · AI infrastructure & quantum computing outlook",
    ko: "퀀텀 엣지 · AI 인프라 & 양자 컴퓨팅 전망",
    ja: "クォンタムエッジ · AIインフラ＆量子コンピューティング展望"
  },
  fomoFintechPulse: {
    en: "Fintech Pulse · Digital finance & payment ecosystem analysis",
    ko: "핀테크 펄스 · 디지털 금융 & 결제 생태계 분석",
    ja: "フィンテックパルス · デジタルファイナンス＆決済エコシステム分析"
  },
  fomoCloudFortress: {
    en: "Cloud Fortress · SaaS & cloud infrastructure positioning",
    ko: "클라우드 포트리스 · SaaS & 클라우드 인프라 포지셔닝",
    ja: "クラウドフォートレス · SaaS＆クラウドインフラポジショニング"
  },

  // ===== PORTFOLIO & WATCHLIST =====
  fomoPortfolioAlpha: {
    en: "View Context Score — Your portfolio's AI-calculated edge",
    ko: "Context Score 확인 — 포트폴리오 AI 분석 엣지",
    ja: "Context Scoreを確認 — ポートフォリオのAI分析エッジ"
  },
  fomoPortfolioSignal: {
    en: "View AI Signal — Machine-generated directional outlook",
    ko: "AI 시그널 확인 — 머신 생성 방향성 전망",
    ja: "AIシグナルを確認 — マシン生成の方向性見通し"
  },
  fomoPortfolioAction: {
    en: "Real-time directional analysis — AI-driven position insights",
    ko: "실시간 방향성 분석 — AI 기반 포지션 인사이트",
    ja: "リアルタイム方向性分析 — AI駆動ポジションインサイト"
  },
  fomoPortfolioScore: {
    en: "View Portfolio Grade — Overall health assessment",
    ko: "포트폴리오 등급 확인 — 전체 건강성 평가",
    ja: "ポートフォリオグレードを確認 — 全体ヘルス評価"
  },
};

['en', 'ko', 'ja'].forEach(lang => {
  const filePath = path.join(__dirname, '..', 'src', 'messages', `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  if (!data.gate) {
    console.log(`[${lang}] No gate section found!`);
    return;
  }

  let updated = 0;
  Object.entries(FOMO_UPDATES).forEach(([key, translations]) => {
    if (translations[lang]) {
      data.gate[key] = translations[lang];
      updated++;
    }
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`[${lang}] Updated ${updated} FOMO messages`);
});

console.log('\nDone!');
