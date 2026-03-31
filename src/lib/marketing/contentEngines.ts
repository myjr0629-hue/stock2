// ============================================================================
// Content Engines — 플랫폼별 최적화 콘텐츠 생성기
// 5-Layer Structure: Hook → Data → Meaning → Implication → CTA
// Compliance-grade premium templates with institutional tone
// ============================================================================

import { applyCompliance, buildUtm, CTA, CTA_KO, CTA_JA } from './bufferClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MarketData {
  spy: number;
  qqq: number;
  vix: number;
  gexRegime: string;
  darkPool?: number;
  pcr?: number;
  maxPain?: number;
  callWall?: number;
  putFloor?: number;
}

export interface PlatformContent {
  twitter: string;
  threads: string;
  instagram: string;
  bluesky: string;
}

export interface ContentOutput {
  en: { text: string; imageUrl: string; cta: keyof typeof CTA; platformText?: PlatformContent };
  ko: { text: string; imageUrl: string; cta: keyof typeof CTA_KO; platformText?: PlatformContent };
  ja: { text: string; imageUrl: string; cta: keyof typeof CTA_JA; platformText?: PlatformContent };
}

export interface EventData {
  ticker: string;
  type: 'whale' | 'gex_shift' | 'level_break' | 'unusual_volume' | 'sec_8k';
  details: string;
  value?: number;
  premium?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

function dateStr(lang: string): string {
  if (lang === 'ko') return new Date().toLocaleDateString('ko-KR');
  if (lang === 'ja') return new Date().toLocaleDateString('ja-JP');
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// GEX → interpretation (meaning layer)
function gexMeaning(gex: string, lang: string): string {
  const m: Record<string, Record<string, string>> = {
    positive: {
      en: 'Market absorbs shocks. Small moves stay small.',
      ko: '시장이 충격을 흡수합니다. 작은 움직임은 작게 머뭅니다.',
      ja: '市場がショックを吸収。小さな動きは小さいまま。',
    },
    negative: {
      en: 'This is where small moves turn into large ones.',
      ko: '작은 움직임이 큰 움직임으로 전환되는 구간입니다.',
      ja: '小さな動きが大きな動きに転換する局面です。',
    },
    neutral: {
      en: 'Neither side has conviction. Watch for the next shift.',
      ko: '어느 쪽도 확신이 없습니다. 다음 전환을 주시하십시오.',
      ja: 'どちら側も確信なし。次のシフトに注目。',
    },
    transition: {
      en: 'The regime is shifting. Trends accelerate, not stabilize.',
      ko: '레짐이 전환 중입니다. 추세가 안정이 아닌 가속됩니다.',
      ja: 'レジームが移行中。トレンドは安定ではなく加速。',
    },
  };
  return m[gex.toLowerCase()]?.[lang] || '';
}

// Dark Pool → interpretation
function dpMeaning(dp: number, lang: string): string {
  if (dp >= 40) {
    return lang === 'ko' ? '기관이 수면 아래에서 움직이고 있습니다' :
           lang === 'ja' ? '機関が水面下で動いています' :
           'Institutions are active beneath the surface';
  }
  return lang === 'ko' ? '기관 활동 정상 범위' :
         lang === 'ja' ? '機関活動は通常範囲' :
         'Institutional activity within normal range';
}

// ---------------------------------------------------------------------------
// A. Market Pulse — 5-Layer: Hook → Data → Meaning → Implication → CTA
// ---------------------------------------------------------------------------
export function generateMarketPulse(data: MarketData): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const imageParams = `type=pulse&spy=${data.spy}&qqq=${data.qqq}&vix=${data.vix}&gex=${data.gexRegime}`;
  const gex = data.gexRegime.toUpperCase();

  // ── English ──────────────────────────────────────────
  const enTwitter = [
    // Hook (반전)
    `Surface numbers rarely tell the whole story.`,
    `Retail saw today's ${fmt(data.spy)} drop. Here is what happened beneath the surface:`,
    ``,
    // Data + Meaning
    `▸ GEX flipped ${gex} (${gexMeaning(data.gexRegime, 'en')})`,
    data.darkPool != null ? `▸ Dark Pool at ${data.darkPool.toFixed(1)}% (${dpMeaning(data.darkPool, 'en')})` : '',
    ``,
    // Implication
    `Price reacts. Structure dictates.`,
  ].filter(Boolean).join('\n');

  const enThreads = [
    // Hook (문장 쪼개기 — 체류시간 증가)
    `SPY closed ${fmt(data.spy)}.`,
    ``,
    `But that number is hiding what actually changed.`,
    ``,
    // Data + Meaning
    `GEX is ${gex} — ${gexMeaning(data.gexRegime, 'en')}`,
    data.darkPool != null ? `Dark Pool at ${data.darkPool.toFixed(1)}% — ${dpMeaning(data.darkPool, 'en')}.` : '',
    data.callWall ? `Key levels: Call Wall $${data.callWall}, Put Floor $${data.putFloor}.` : '',
    ``,
    // Implication
    `The headline says one thing. The structure says another.`,
    `Data-driven context. Not financial advice.`,
  ].filter(Boolean).join('\n');

  const enInstagram = [
    `The headline says ${fmt(data.spy)}.`,
    `The structure says something else entirely.  ↓`,
    ``,
    `▸ SPY ${fmt(data.spy)}  ·  QQQ ${fmt(data.qqq)}`,
    `▸ VIX ${data.vix.toFixed(1)}`,
    `▸ GEX Regime: ${gex}`,
    `→ ${gexMeaning(data.gexRegime, 'en')}`,
    ``,
    data.darkPool != null ? `▸ Dark Pool: ${data.darkPool.toFixed(1)}% — ${dpMeaning(data.darkPool, 'en')}` : '',
    data.pcr != null ? `▸ P/C Ratio: ${data.pcr.toFixed(2)}` : '',
    data.callWall ? `▸ Call Wall: $${data.callWall}  ·  Put Floor: $${data.putFloor}` : '',
    data.maxPain != null ? `▸ Max Pain: $${data.maxPain}` : '',
    ``,
    `Price reacts. Structure dictates.`,
    `See what the market is actually doing → Link in bio`,
    ``,
    `*Data-driven context. Not financial advice.`,
    ``,
    `#OptionsFlow #GammaExposure #GEX #MarketStructure`,
    `#DarkPool #VIX #SPY #Options #SignumHQ`,
  ].filter(Boolean).join('\n');

  const enBluesky = [
    `SPY ${fmt(data.spy)} · QQQ ${fmt(data.qqq)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'en')}`,
    data.darkPool != null ? `Dark Pool: ${data.darkPool.toFixed(1)}%` : '',
  ].filter(Boolean).join('\n');

  // ── Korean ──────────────────────────────────────────
  const koTwitter = [
    `표면적인 지수 하락(${fmt(data.spy)}) 이면의 구조적 움직임입니다.`,
    ``,
    `▸ GEX: ${gex} 진입 (${gexMeaning(data.gexRegime, 'ko')})`,
    data.darkPool != null ? `▸ 다크풀: ${data.darkPool.toFixed(1)}% (${dpMeaning(data.darkPool, 'ko')})` : '',
    ``,
    `가격은 현상이지만, 옵션 구조는 본질입니다.`,
  ].filter(Boolean).join('\n');

  const koThreads = [
    `SPY ${fmt(data.spy)}로 마감했습니다.`,
    ``,
    `하지만 그 숫자가 실제로 바뀐 것을 가리고 있습니다.`,
    ``,
    `GEX가 ${gex} — ${gexMeaning(data.gexRegime, 'ko')}`,
    data.darkPool != null ? `다크풀 ${data.darkPool.toFixed(1)}% — ${dpMeaning(data.darkPool, 'ko')}.` : '',
    data.callWall ? `주시 레벨: Call Wall $${data.callWall}, Put Floor $${data.putFloor}` : '',
    ``,
    `표면적 가격과 심층 구조의 괴리.`,
    `데이터 기반 시장 맥락입니다. 투자 조언이 아닙니다.`,
  ].filter(Boolean).join('\n');

  const koInstagram = [
    `지수는 ${fmt(data.spy)}.`,
    `하지만 구조는 전혀 다른 이야기를 하고 있습니다.  ↓`,
    ``,
    `▸ SPY ${fmt(data.spy)}  ·  QQQ ${fmt(data.qqq)}`,
    `▸ VIX ${data.vix.toFixed(1)}`,
    `▸ GEX 레짐: ${gex}`,
    `→ ${gexMeaning(data.gexRegime, 'ko')}`,
    ``,
    data.darkPool != null ? `▸ 다크풀: ${data.darkPool.toFixed(1)}% — ${dpMeaning(data.darkPool, 'ko')}` : '',
    data.pcr != null ? `▸ 풋/콜 비율: ${data.pcr.toFixed(2)}` : '',
    data.callWall ? `▸ Call Wall: $${data.callWall}  ·  Put Floor: $${data.putFloor}` : '',
    data.maxPain != null ? `▸ Max Pain: $${data.maxPain}` : '',
    ``,
    `가격은 현상이지만, 옵션 구조는 본질입니다.`,
    `데이터로 내일의 시장 맥락을 확인하십시오. 링크는 프로필에 있습니다.`,
    ``,
    `*본 정보는 데이터 분석을 위한 참고 자료이며, 투자 권유가 아닙니다.`,
    ``,
    `#옵션플로우 #감마익스포저 #GEX #시장구조`,
    `#다크풀 #VIX #SPY #기관급분석 #SignumHQ`,
  ].filter(Boolean).join('\n');

  const koBluesky = [
    `SPY ${fmt(data.spy)} · QQQ ${fmt(data.qqq)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ko')}`,
    data.darkPool != null ? `다크풀: ${data.darkPool.toFixed(1)}%` : '',
  ].filter(Boolean).join('\n');

  // ── Japanese ──────────────────────────────────────────
  const jaTwitter = [
    `表面的な指数下落（${fmt(data.spy)}）の裏で起きている構造的変化：`,
    ``,
    `▸ GEX: ${gex}（${gexMeaning(data.gexRegime, 'ja')}）`,
    data.darkPool != null ? `▸ ダークプール: ${data.darkPool.toFixed(1)}%（${dpMeaning(data.darkPool, 'ja')}）` : '',
    ``,
    `価格ではなく、市場の「構造」を追跡してください。`,
  ].filter(Boolean).join('\n');

  const jaThreads = [
    `SPY ${fmt(data.spy)}で引けました。`,
    ``,
    `しかし、その数字は実際に変わったことを隠しています。`,
    ``,
    `GEXが${gex} — ${gexMeaning(data.gexRegime, 'ja')}`,
    data.darkPool != null ? `ダークプール${data.darkPool.toFixed(1)}% — ${dpMeaning(data.darkPool, 'ja')}。` : '',
    ``,
    `表面の価格と深層構造の乖離。`,
    `データ基盤の市場分析。投資助言ではありません。`,
  ].filter(Boolean).join('\n');

  const jaInstagram = [
    `指数は${fmt(data.spy)}。`,
    `しかし構造はまったく異なる話をしています。 ↓`,
    ``,
    `▸ SPY ${fmt(data.spy)} · QQQ ${fmt(data.qqq)}`,
    `▸ VIX ${data.vix.toFixed(1)}`,
    `▸ GEXレジーム: ${gex}`,
    `→ ${gexMeaning(data.gexRegime, 'ja')}`,
    ``,
    data.darkPool != null ? `▸ ダークプール: ${data.darkPool.toFixed(1)}% — ${dpMeaning(data.darkPool, 'ja')}` : '',
    data.pcr != null ? `▸ P/Cレシオ: ${data.pcr.toFixed(2)}` : '',
    ``,
    `価格は現象。オプション構造は本質。`,
    ``,
    `*データに基づく参考資料です。投資助言ではありません。`,
    ``,
    `#オプションフロー #ガンマエクスポージャー #GEX`,
    `#マーケット構造 #ダークプール #VIX #SignumHQ`,
  ].filter(Boolean).join('\n');

  const jaBluesky = [
    `SPY ${fmt(data.spy)} · QQQ ${fmt(data.qqq)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ja')}`,
  ].join('\n');

  const imageUrl = (lang: string) => `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`;

  return {
    en: {
      text: applyCompliance(enTwitter),
      imageUrl: imageUrl('en'),
      cta: 'liveStructure',
      platformText: {
        twitter: applyCompliance(enTwitter),
        threads: applyCompliance(enThreads),
        instagram: applyCompliance(enInstagram),
        bluesky: applyCompliance(enBluesky),
      },
    },
    ko: {
      text: applyCompliance(koTwitter),
      imageUrl: imageUrl('ko'),
      cta: 'liveStructure',
      platformText: {
        twitter: applyCompliance(koTwitter),
        threads: applyCompliance(koThreads),
        instagram: applyCompliance(koInstagram),
        bluesky: applyCompliance(koBluesky),
      },
    },
    ja: {
      text: applyCompliance(jaTwitter),
      imageUrl: imageUrl('ja'),
      cta: 'liveStructure',
      platformText: {
        twitter: applyCompliance(jaTwitter),
        threads: applyCompliance(jaThreads),
        instagram: applyCompliance(jaInstagram),
        bluesky: applyCompliance(jaBluesky),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// B. Morning Briefing
// ---------------------------------------------------------------------------
export function generateMorningBrief(data: MarketData & { briefingSummary?: string }): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const imageParams = `type=pulse&spy=${data.spy}&qqq=${data.qqq}&vix=${data.vix}&gex=${data.gexRegime}`;
  const gex = data.gexRegime.toUpperCase();

  const enTwitter = [
    `The structure heading into today's open:`,
    ``,
    `SPY ${fmt(data.spy)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'en')}`,
    data.briefingSummary ? `\n${data.briefingSummary.substring(0, 100)}` : '',
    ``,
    `Track the mechanics driving today's session.`,
  ].filter(Boolean).join('\n');

  const koTwitter = [
    `오늘 장 오픈 전 구조 분석:`,
    ``,
    `SPY ${fmt(data.spy)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ko')}`,
    data.briefingSummary ? `\n${data.briefingSummary.substring(0, 100)}` : '',
    ``,
    `오늘의 시장 맥락을 데이터로 확인하십시오.`,
  ].filter(Boolean).join('\n');

  const jaTwitter = [
    `本日の寄り前構造分析:`,
    ``,
    `SPY ${fmt(data.spy)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ja')}`,
    data.briefingSummary ? `\n${data.briefingSummary.substring(0, 100)}` : '',
  ].filter(Boolean).join('\n');

  const imageUrl = (lang: string) => `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`;

  return {
    en: { text: applyCompliance(enTwitter), imageUrl: imageUrl('en'), cta: 'fullReport' },
    ko: { text: applyCompliance(koTwitter), imageUrl: imageUrl('ko'), cta: 'fullReport' },
    ja: { text: applyCompliance(jaTwitter), imageUrl: imageUrl('ja'), cta: 'fullReport' },
  };
}

// ---------------------------------------------------------------------------
// C. Education — Hook → Concept → Contrast → Implication → CTA
// ---------------------------------------------------------------------------

const EDUCATION_TOPICS = [
  {
    id: 'gex',
    en: {
      hook: 'Most traders analyze charts. Quants analyze liquidity.',
      title: 'What is GEX?',
      body: `Gamma Exposure (GEX) is the force behind price.\n\nWhen GEX is POSITIVE:\nDealers buy dips and sell rips. The market remains stable.\n\nWhen GEX is NEGATIVE:\nDealers are forced to sell into drops and buy into rallies.\nVolatility expands. This is where trends accelerate, not stabilize.\n\nIf you are trading without knowing the current GEX regime, you are missing half the picture.`,
      cta: 'Equip yourself with institutional-grade context.',
    },
    ko: {
      hook: '대부분의 트레이더는 차트를 보지만, 퀀트는 유동성을 봅니다.',
      title: 'GEX(감마 익스포저)란?',
      body: `감마 익스포저(GEX)는 가격 뒤에 숨은 힘입니다.\n\nGEX 양수(+):\n딜러가 하락 시 매수, 상승 시 매도하여 시장 안정화.\n\nGEX 음수(-):\n딜러가 추세와 같은 방향으로 거래하여 변동성 폭발.\n추세가 안정이 아닌 가속되는 구간입니다.\n\n현재 시장이 어느 구간에 있는지 모른 채 거래하는 것은,\n나침반 없이 항해하는 것과 같습니다.`,
      cta: '스마트 머니가 보는 시장의 맥락을 확인하십시오.',
    },
    ja: {
      hook: 'ほとんどのトレーダーはチャートを見ます。クオンツは流動性を見ます。',
      title: 'GEX（ガンマエクスポージャー）とは？',
      body: `GEXは価格の背後にある力です。\n\nGEXプラス:\nディーラーが下落時に買い、上昇時に売り。市場は安定。\n\nGEXマイナス:\nディーラーがトレンドと同方向に取引。ボラティリティ拡大。\nトレンドは安定ではなく加速する局面です。\n\n現在の市場がどの局面にあるか知らずに取引するのは、\n羅針盤なしで航海するようなものです。`,
      cta: 'スマートマネーが見る市場の文脈を確認してください。',
    },
  },
  {
    id: 'dark_pool',
    en: {
      hook: 'You can\'t see where institutions trade. But you can track the footprint.',
      title: 'Dark Pool Activity',
      body: `Dark pools are private venues where institutions trade without market impact.\n\nHigh dark pool percentage: institutions are positioning before the next move.\nLow percentage: retail-driven, direction uncertain.\n\nWhen dark pool activity rises above 40%, historically, directional moves follow within 48 hours.`,
      cta: 'Track what\'s happening beneath the surface.',
    },
    ko: {
      hook: '기관이 어디서 거래하는지 보이지 않습니다. 하지만 흔적은 추적할 수 있습니다.',
      title: '다크풀 활동',
      body: `다크풀은 기관이 시장에 영향을 주지 않고 거래하는 비공개 채널입니다.\n\n다크풀 비율 높음: 기관이 다음 움직임 전에 포지셔닝.\n비율 낮음: 개인 주도, 방향성 불확실.\n\n다크풀 활동이 40%를 넘으면, 역사적으로 48시간 내 방향성 움직임이 관찰됩니다.`,
      cta: '수면 아래에서 일어나는 일을 추적하십시오.',
    },
    ja: {
      hook: '機関がどこで取引するか見えません。しかし痕跡は追跡できます。',
      title: 'ダークプール活動',
      body: `ダークプールは機関が市場インパクトなしに取引する非公開チャネルです。\n\nダークプール比率高い: 機関が次の動きの前にポジショニング。\n比率低い: リテール主導、方向性不確実。\n\nダークプール活動が40%を超えると、歴史的に48時間以内に方向性の動きが観測されます。`,
      cta: '水面下で起きていることを追跡してください。',
    },
  },
  {
    id: 'iv_percentile',
    en: {
      hook: 'Options look expensive? Here\'s the only way to actually measure it.',
      title: 'IV Percentile',
      body: `IV Percentile ranks current implied volatility against the past year.\n\n90th percentile: options are more expensive than 90% of the past year.\n10th percentile: options are cheaper than 90% of history.\n\nWithout this context, you\'re guessing whether premiums are high or low.`,
      cta: 'Stop guessing. See the data.',
    },
    ko: {
      hook: '옵션이 비싸 보입니까? 실제로 측정하는 유일한 방법이 있습니다.',
      title: 'IV 퍼센타일',
      body: `IV 퍼센타일은 현재 내재변동성을 지난 1년 대비 순위로 보여줍니다.\n\n90번째 퍼센타일: 지난 1년 중 90%보다 비싼 상태.\n10번째 퍼센타일: 역사적 범위 하위. 저렴한 상태.\n\n이 맥락 없이는 프리미엄이 높은지 낮은지 추측에 불과합니다.`,
      cta: '추측을 멈추십시오. 데이터를 확인하십시오.',
    },
    ja: {
      hook: 'オプションが高く見えますか？実際に測定する唯一の方法があります。',
      title: 'IVパーセンタイル',
      body: `IVパーセンタイルは現在のIVを過去1年と比較してランク付けします。\n\n90パーセンタイル: 過去1年の90%より割高。\n10パーセンタイル: 歴史的レンジの下位。割安。\n\nこの文脈なしでは、プレミアムが高いか低いか推測に過ぎません。`,
      cta: '推測をやめてください。データを確認してください。',
    },
  },
  {
    id: 'pcr',
    en: {
      hook: 'One ratio reveals whether the market is hedging or speculating.',
      title: 'Put/Call Ratio',
      body: `PCR measures put volume relative to calls.\n\nPCR > 1.0: More puts purchased. Fear is elevated.\nPCR < 0.7: More calls. Optimism may be stretched.\n\nExtreme readings have historically coincided with market turning points.\nThe question isn\'t what price did — it\'s what options traders are preparing for.`,
      cta: 'See what the options market is preparing for.',
    },
    ko: {
      hook: '하나의 비율이 시장이 공포에 있는지 탐욕에 있는지 보여줍니다.',
      title: '풋/콜 비율',
      body: `PCR은 콜 대비 풋 거래량을 측정합니다.\n\nPCR > 1.0: 풋 매수 증가. 공포가 높음.\nPCR < 0.7: 콜이 많음. 낙관이 과도할 수 있음.\n\n극단적 수치는 역사적으로 시장 전환점과 일치해왔습니다.\n가격이 무엇을 했는지가 아니라, 옵션 트레이더가 무엇을 준비하고 있는지가 핵심입니다.`,
      cta: '옵션 시장이 준비하고 있는 것을 확인하십시오.',
    },
    ja: {
      hook: '一つの比率で市場が恐怖にあるか貪欲にあるかがわかります。',
      title: 'プット/コール比率',
      body: `PCRはコール対比プット取引量を測定します。\n\nPCR > 1.0: プット購入増加。恐怖が高い。\nPCR < 0.7: コールが多い。楽観が行き過ぎの可能性。\n\n極端な数値は歴史的に市場の転換点と一致してきました。\n価格が何をしたかではなく、オプショントレーダーが何を準備しているかが核心です。`,
      cta: 'オプション市場が準備していることを確認してください。',
    },
  },
  {
    id: 'max_pain',
    en: {
      hook: 'There\'s a level where price is magnetically pulled toward. Here\'s how to find it.',
      title: 'Max Pain & Key Levels',
      body: `Max Pain: the strike where option buyers lose the most at expiration.\n\nCall Wall: highest call open interest. Acts as a ceiling.\nPut Floor: highest put open interest. Acts as a floor.\n\nThese levels create a gravitational range.\nPrice doesn\'t move randomly — it orbits around structure.`,
      cta: 'See where the gravity is pulling price today.',
    },
    ko: {
      hook: '가격이 자기처럼 끌려가는 레벨이 있습니다. 찾는 방법:',
      title: '맥스 페인과 핵심 레벨',
      body: `맥스 페인: 만기 시 옵션 매수자가 가장 많은 손실을 보는 행사가.\n\n콜 월: 콜 미결제약정 최다 행사가. 천장 역할.\n풋 플로어: 풋 미결제약정 최다 행사가. 바닥 역할.\n\n이 레벨들이 중력 범위를 만듭니다.\n가격은 무작위로 움직이지 않습니다 — 구조 주변을 공전합니다.`,
      cta: '오늘 가격을 끌어당기는 중력이 어디 있는지 확인하십시오.',
    },
    ja: {
      hook: '価格が磁石のように引き寄せられるレベルがあります。見つけ方:',
      title: 'マックスペインとキーレベル',
      body: `マックスペイン: 満期時にオプション買い手が最も損失を被る行使価格。\n\nコールウォール: コール建玉最多。天井として機能。\nプットフロア: プット建玉最多。底として機能。\n\nこれらのレベルが重力レンジを形成します。\n価格はランダムに動かない — 構造の周りを周回します。`,
      cta: '今日価格を引き寄せている重力がどこにあるか確認してください。',
    },
  },
];

export function generateEducationContent(topicId?: string): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const topic = topicId
    ? EDUCATION_TOPICS.find(t => t.id === topicId) || EDUCATION_TOPICS[0]
    : EDUCATION_TOPICS[Math.floor(Math.random() * EDUCATION_TOPICS.length)];

  const imageParams = `type=education&topic=${topic.id}`;

  function buildEdu(lang: 'en' | 'ko' | 'ja') {
    const t = topic[lang];
    // Twitter: Hook + first paragraph only
    const twitter = `${t.hook}\n\n${t.body.split('\n\n')[0]}\n\n${t.cta}`;
    // Threads: Full body
    const threads = `${t.hook}\n\n${t.body}\n\n${t.cta}`;
    // Instagram: Full + hashtags + disclaimer
    const disclaimer = lang === 'ko' ? '*본 정보는 데이터 분석을 위한 참고 자료이며, 투자 권유가 아닙니다.' :
                       lang === 'ja' ? '*データに基づく参考資料です。投資助言ではありません。' :
                       '*Data-driven context. Not financial advice.';
    const hashtags = lang === 'ko' ? '#옵션교육 #감마익스포저 #시장구조 #SignumHQ' :
                     lang === 'ja' ? '#オプション教育 #ガンマエクスポージャー #マーケット構造 #SignumHQ' :
                     '#OptionsEducation #GammaExposure #MarketStructure #SignumHQ';
    const instagram = `${t.hook}\n\n${t.title}\n\n${t.body}\n\n${t.cta} Link in bio.\n\n${disclaimer}\n\n${hashtags}`;
    // Bluesky: Hook + first two paragraphs
    const bluesky = `${t.hook}\n\n${t.body.split('\n\n').slice(0, 2).join('\n\n')}`;

    return {
      text: applyCompliance(twitter),
      imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`,
      cta: 'trackLevels' as const,
      platformText: {
        twitter: applyCompliance(twitter),
        threads: applyCompliance(threads),
        instagram: applyCompliance(instagram),
        bluesky: applyCompliance(bluesky),
      },
    };
  }

  return { en: buildEdu('en'), ko: buildEdu('ko'), ja: buildEdu('ja') };
}

export function getEducationTopicIds(): string[] {
  return EDUCATION_TOPICS.map(t => t.id);
}

// ---------------------------------------------------------------------------
// D. Event Spike — Structural alert with interpretation
// ---------------------------------------------------------------------------
export function generateEventSpike(event: EventData, marketData?: Partial<MarketData>): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';

  const imageParams = `type=event&ticker=${event.ticker}&event=${encodeURIComponent(event.details)}&spy=${marketData?.spy || 0}&qqq=${marketData?.qqq || 0}&vix=${marketData?.vix || 0}&gex=${marketData?.gexRegime || 'neutral'}`;

  function buildEvent(lang: 'en' | 'ko' | 'ja') {
    const premium = event.premium ? (
      lang === 'ko' ? `프리미엄: $${(event.premium / 1e6).toFixed(1)}M` :
      lang === 'ja' ? `プレミアム: $${(event.premium / 1e6).toFixed(1)}M` :
      `Premium: $${(event.premium / 1e6).toFixed(1)}M`
    ) : '';

    // GEX Shift — special handling with interpretation
    if (event.type === 'gex_shift') {
      const twitter = lang === 'ko'
        ? `🚨 $${event.ticker} 시장 구조 변화 감지\n\n${event.details}\n이 구간에서는 딜러들의 헤징이 변동성을 억제하는 대신, 증폭시키는 경향이 있습니다.\n\n평소와 다른 리스크 관리가 요구되는 환경입니다.`
        : lang === 'ja'
        ? `🚨 $${event.ticker} 市場構造変化検出\n\n${event.details}\nこの局面ではディーラーのヘッジがボラティリティを抑制するのではなく、増幅する傾向があります。`
        : `🚨 Structural Shift Detected: $${event.ticker}\n\n${event.details}\nThis changes how dealers hedge — and how price moves.`;

      const threads = lang === 'ko'
        ? `🚨 $${event.ticker} 시장 구조 변화 감지\n\n${event.details}\n이 구간에서는 딜러들의 헤징 알고리즘이 시장의 변동성을 억제하는 대신, 방향성을 증폭시키는 경향이 있습니다.\n\n평소와 다른 리스크 관리가 요구되는 환경입니다.`
        : lang === 'ja'
        ? `🚨 $${event.ticker} 市場構造変化検出\n\n${event.details}\nディーラーのヘッジ行動が変化しました。\nボラティリティが抑制から増幅に転じる可能性があります。`
        : `🚨 Structural Shift Detected: $${event.ticker}\n\n${event.details}\nIn this regime, dealer hedging shifts from suppressing volatility to potentially amplifying it.\n\nRisk management parameters should be adjusted accordingly.`;

      return {
        text: applyCompliance(twitter),
        imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`,
        cta: 'liveStructure' as const,
        platformText: {
          twitter: applyCompliance(twitter),
          threads: applyCompliance(threads),
          instagram: applyCompliance(threads + (lang === 'ko' ? '\n\n#GEX전환 #옵션플로우 #SignumHQ' : lang === 'ja' ? '\n\n#GEXシフト #SignumHQ' : '\n\n#GEXShift #OptionsFlow #SignumHQ')),
          bluesky: applyCompliance(twitter),
        },
      };
    }

    // Generic event
    const hook = lang === 'ko' ? `$${event.ticker}에서 구조적 변화 감지:`
               : lang === 'ja' ? `$${event.ticker}で構造的変化検出:`
               : `Structural change detected — $${event.ticker}:`;

    const twitter = [hook, '', event.details, premium].filter(Boolean).join('\n');
    const threads = [hook, '', event.details, premium, '',
      lang === 'ko' ? '데이터 기반 맥락입니다.' : lang === 'ja' ? 'データ基盤の文脈です。' : 'Data-driven context.'
    ].filter(Boolean).join('\n');

    return {
      text: applyCompliance(twitter),
      imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=${lang}`,
      cta: 'liveStructure' as const,
      platformText: {
        twitter: applyCompliance(twitter),
        threads: applyCompliance(threads),
        instagram: applyCompliance(threads),
        bluesky: applyCompliance(twitter),
      },
    };
  }

  return { en: buildEvent('en'), ko: buildEvent('ko'), ja: buildEvent('ja') };
}
