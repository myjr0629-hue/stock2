// ============================================================================
// Content Engines — 플랫폼별 최적화 콘텐츠 생성기
// 5-Layer Structure: Hook → Data → Meaning → Implication → CTA
// Compliance-grade premium templates with institutional tone
// ============================================================================

import { applyCompliance, buildUtm, CTA, CTA_KO, CTA_JA, DISCLAIMER } from './bufferClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MarketData {
  spy: number;
  qqq: number;
  vix: number;
  gexRegime: string;
  /**
   * @deprecated 다크풀은 2026-08-28 벤더 권한 상실로 **영구 소멸**했다.
   *   `!= null` 가드는 0 을 통과시키므로 「$0% of volume went dark」 같은 글이
   *   실제로 발행됐다. 새 코드는 instNotional/instCallPct 를 쓸 것.
   */
  darkPool?: number;
  /** 기관 신규 포지션 금액(USD) — 옵션 미결제약정 증가분 */
  instNotional?: number | null;
  /** 그중 콜 비중 0~100 */
  instCallPct?: number | null;
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
  type: 'whale' | 'gex_shift' | 'level_break' | 'unusual_volume' | 'sec_8k' | 'insider_trade';
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

// 기관 신규 포지션 → 표기·해석 (다크풀 대체)
function instMoney(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}
function instMeaning(callPct: number, lang: string): string {
  if (callPct >= 60) {
    return lang === 'ko' ? '콜 쪽으로 신규 자금이 쏠렸습니다' :
           lang === 'ja' ? 'コール側に新規資金が偏りました' :
           'new money skewed to calls';
  }
  if (callPct <= 40) {
    return lang === 'ko' ? '풋 쪽으로 신규 자금이 쏠렸습니다' :
           lang === 'ja' ? 'プット側に新規資金が偏りました' :
           'new money skewed to puts';
  }
  return lang === 'ko' ? '콜·풋이 균형을 이뤘습니다' :
         lang === 'ja' ? 'コールとプットが均衡しました' :
         'calls and puts were balanced';
}
/**
 * 한 줄 문구. **둘 다 있어야** 문장을 만든다 — 없으면 빈 문자열이라
 * 그 줄이 통째로 빠진다(0 을 그리지 않는다).
 */
function instLine(data: { instNotional?: number | null; instCallPct?: number | null },
                  lang: 'en' | 'ko' | 'ja', style: 'bullet' | 'plain' | 'compact'): string {
  const n = data.instNotional, c = data.instCallPct;
  if (typeof n !== 'number' || !(n > 0) || typeof c !== 'number' || !(c > 0)) return '';
  const label = lang === 'ko' ? '기관 신규 포지션' : lang === 'ja' ? '機関の新規ポジション' : 'New institutional positions';
  const val = instMoney(n);
  if (style === 'compact') return `${label}: ${val}`;
  const mean = instMeaning(c, lang);
  if (style === 'bullet') return `▸ ${label}: ${val} — ${mean}`;
  return lang === 'ja' ? `${label}${val} — ${mean}。` : `${label} ${val} — ${mean}.`;
}

// GEX regime → historical directional tendency (compliance-safe)
function gexHistorical(gex: string, lang: string): string {
  const stats: Record<string, Record<string, string>> = {
    positive: {
      en: 'Historically, positive GEX regimes have shown lower realized volatility over the following 3 sessions.',
      ko: '역사적으로, GEX Positive 구간에서는 이후 3거래일 실현 변동성이 낮아지는 경향이 있었습니다.',
      ja: '歴史的に、GEX Positive局面では以降3営業日の実現ボラティリティが低下する傾向がありました。',
    },
    negative: {
      en: 'Historically, negative GEX regimes have coincided with larger intraday price ranges over the following sessions.',
      ko: '역사적으로, GEX Negative 구간에서는 이후 장중 가격 변동폭이 확대되는 경향이 있었습니다.',
      ja: '歴史的に、GEX Negative局面では以降のセッションで日中レンジが拡大する傾向がありました。',
    },
    transition: {
      en: 'Regime transitions have historically preceded trend acceleration, not mean reversion.',
      ko: '레짐 전환기에는 역사적으로 평균회귀보다 추세 가속이 선행되는 경향이 있었습니다.',
      ja: 'レジーム転換期には、歴史的に平均回帰よりトレンド加速が先行する傾向がありました。',
    },
  };
  return stats[gex.toLowerCase()]?.[lang] || '';
}

// ---------------------------------------------------------------------------
// Hook Rotation — Phase 3-1: 피로도 방지 + 긴급성 강화
// 날짜 기반 로테이션으로 매일 다른 Hook 사용
// ---------------------------------------------------------------------------
function getHookIndex(): number {
  const day = new Date().getDate();
  return day % 6; // 6개 Hook 로테이션
}

function getPulseHook(data: MarketData, lang: string): string[] {
  const idx = getHookIndex();

  const enHooks: string[][] = [
    [`Surface numbers rarely tell the whole story.`,
     `SPY ${fmt(data.spy)}. But here's what actually shifted:`],
    [`Everyone saw ${fmt(data.spy)}. Almost no one saw what happened underneath.`],
    [`The close was ${fmt(data.spy)}. The structure tells a different story.`],
    [`SPY ${fmt(data.spy)}. Institutions opened ${data.instNotional ? instMoney(data.instNotional) : 'new'} in fresh option positions.`,
     `Here's what the options market is actually saying:`],
    [`Headline: SPY ${fmt(data.spy)}.`,
     `Reality: The options structure just shifted.`],
    [`${Math.abs(data.spy) > 1 ? 'A big move.' : 'A quiet session.'} But the real signal is under the surface.`],
  ];

  // KO: 번역투 제거, 한국 금융 미디어 네이티브 톤
  const koHooks: string[][] = [
    [`어제 SPY ${fmt(data.spy)}. 그 숫자가 가리고 있는 게 있습니다.`],
    [`지수만 보면 ${fmt(data.spy)}. 하지만 옵션 시장은 다른 얘기를 합니다.`],
    [`SPY ${fmt(data.spy)} 마감. 다크풀에선 이미 다음 수를 두고 있습니다.`],
    [`표면: ${fmt(data.spy)}. 이면: 구조적 전환 포착.`],
    [`${Math.abs(data.spy) > 1 ? '큰 움직임이었습니다.' : '조용한 장이었습니다.'} 그런데 진짜 시그널은 따로 있습니다.`],
    [`SPY ${fmt(data.spy)}로 마감. 그런데 기관의 발자국이 보입니다.`],
  ];

  // JA: 丁寧語(です/ます体) + 自然な日本語
  const jaHooks: string[][] = [
    [`SPY ${fmt(data.spy)}で引けました。しかし、数字の裏で構造が変わっています。`],
    [`昨日の${fmt(data.spy)}。市場が本当に伝えたいことは別にあります。`],
    [`表面は${fmt(data.spy)}。しかしオプション市場は異なるシグナルを発しています。`],
    [`SPY ${fmt(data.spy)}。ダークプールでは既に次の動きが始まっています。`],
    [`${Math.abs(data.spy) > 1 ? '大きな動きでした。' : '静かなセッションでした。'}しかし真のシグナルは水面下にあります。`],
    [`指数だけを見れば${fmt(data.spy)}。構造分析が示すのは全く異なる景色です。`],
  ];

  const hooks = lang === 'ko' ? koHooks : lang === 'ja' ? jaHooks : enHooks;
  return hooks[idx % hooks.length];
}

// ---------------------------------------------------------------------------
// A. Market Pulse — 5-Layer: Hook → Data → Meaning → Implication → CTA
// ---------------------------------------------------------------------------
export function generateMarketPulse(data: MarketData): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const imageParams = `type=pulse&spy=${data.spy}&vix=${data.vix}&gex=${data.gexRegime}&in=${data.instNotional ?? ''}&cp=${data.instCallPct ?? ''}`;
  const gex = data.gexRegime.toUpperCase();

  // ── English ──────────────────────────────────────────
  const enTwitter = [
    // Hook (rotating — Phase 3-1)
    ...getPulseHook(data, 'en'),
    ``,
    // Data + Meaning
    `▸ GEX flipped ${gex} (${gexMeaning(data.gexRegime, 'en')})`,
    instLine(data, 'en', 'bullet'),
    ``,
    // Historical context (compliance-safe — Phase 3-6)
    gexHistorical(data.gexRegime, 'en'),
    ``,
    // Implication + Disclaimer
    `Price reacts. Structure dictates.`,
    DISCLAIMER.en,
  ].filter(Boolean).join('\n');

  const enThreads = [
    // Hook (문장 쪼개기 — 체류시간 증가)
    `SPY closed ${fmt(data.spy)}.`,
    ``,
    `But that number is hiding what actually changed.`,
    ``,
    // Data + Meaning
    `GEX is ${gex} — ${gexMeaning(data.gexRegime, 'en')}`,
    instLine(data, 'en', 'plain'),
    data.callWall ? `Key levels: Call Wall $${data.callWall}, Put Floor $${data.putFloor}.` : '',
    ``,
    // Conversational close (Threads algorithm: replies > likes)
    `The headline says one thing. The structure says another.`,
    ``,
    `What’s your read on tomorrow’s open?`,
    DISCLAIMER.en,
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
    instLine(data, 'en', 'bullet'),
    data.pcr != null ? `▸ P/C Ratio: ${data.pcr.toFixed(2)}` : '',
    data.callWall ? `▸ Call Wall: $${data.callWall}  ·  Put Floor: $${data.putFloor}` : '',
    data.maxPain != null ? `▸ Max Pain: $${data.maxPain}` : '',
    ``,
    `Price reacts. Structure dictates.`,
    `See what the market is actually doing → Tap to learn more`,
    `Link in bio.`,
    ``,
    `*Data-driven context. Not financial advice.`,
    ``,
    `#OptionsFlow #GammaExposure #GEX #MarketStructure`,
    `#DarkPool #VIX #SPY #Options #SignumHQ`,
  ].filter(Boolean).join('\n');

  const enBluesky = [
    `SPY ${fmt(data.spy)} · QQQ ${fmt(data.qqq)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'en')}`,
    instLine(data, 'en', 'compact'),
    DISCLAIMER.en,
  ].filter(Boolean).join('\n');

  // ── Korean ──────────────────────────────────────────
  const koTwitter = [
    // Hook (rotating — Phase 3-3 네이티브 KO)
    ...getPulseHook(data, 'ko'),
    ``,
    `▸ GEX: ${gex} 진입 (${gexMeaning(data.gexRegime, 'ko')})`,
    instLine(data, 'ko', 'bullet'),
    ``,
    gexHistorical(data.gexRegime, 'ko'),
    ``,
    `가격은 현상. 구조가 본질.`,
    DISCLAIMER.ko,
  ].filter(Boolean).join('\n');

  const koThreads = [
    `SPY ${fmt(data.spy)}로 마감했습니다.`,
    ``,
    `하지만 그 숫자가 실제로 바뀐 것을 가리고 있습니다.`,
    ``,
    `GEX가 ${gex} — ${gexMeaning(data.gexRegime, 'ko')}`,
    instLine(data, 'ko', 'plain'),
    data.callWall ? `주시 레벨: Call Wall $${data.callWall}, Put Floor $${data.putFloor}` : '',
    ``,
    `표면적 가격과 심층 구조의 괴리.`,
    ``,
    `내일 장 오픈 어떻게 보시나요?`,
    DISCLAIMER.ko,
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
    instLine(data, 'ko', 'bullet'),
    data.pcr != null ? `▸ 풋/콜 비율: ${data.pcr.toFixed(2)}` : '',
    data.callWall ? `▸ Call Wall: $${data.callWall}  ·  Put Floor: $${data.putFloor}` : '',
    data.maxPain != null ? `▸ Max Pain: $${data.maxPain}` : '',
    ``,
    `가격은 현상이지만, 옵션 구조는 본질입니다.`,
    `데이터로 내일의 시장 맥락을 확인하십시오.`,
    `프로필 링크에서 확인하세요.`,
    ``,
    `*본 정보는 데이터 분석을 위한 참고 자료이며, 투자 권유가 아닙니다.`,
    ``,
    `#옵션플로우 #감마익스포저 #GEX #시장구조`,
    `#다크풀 #VIX #SPY #기관급분석 #SignumHQ`,
  ].filter(Boolean).join('\n');

  const koBluesky = [
    `SPY ${fmt(data.spy)} · QQQ ${fmt(data.qqq)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ko')}`,
    instLine(data, 'ko', 'compact'),
    DISCLAIMER.ko,
  ].filter(Boolean).join('\n');

  // ── Japanese ──────────────────────────────────────────
  const jaTwitter = [
    // Hook (rotating — Phase 3-4 丁寧語 JA)
    ...getPulseHook(data, 'ja'),
    ``,
    `▸ GEX: ${gex}（${gexMeaning(data.gexRegime, 'ja')}）`,
    instLine(data, 'ja', 'bullet'),
    ``,
    gexHistorical(data.gexRegime, 'ja'),
    ``,
    `価格は現象。構造が本質です。`,
    DISCLAIMER.ja,
  ].filter(Boolean).join('\n');

  const jaThreads = [
    `SPY ${fmt(data.spy)}で引けました。`,
    ``,
    `しかし、その数字は実際に変わったことを隠しています。`,
    ``,
    `GEXが${gex} — ${gexMeaning(data.gexRegime, 'ja')}`,
    instLine(data, 'ja', 'plain'),
    ``,
    `表面の価格と深層構造の乖離。`,
    ``,
    `明日の寄り付き、どう見られますか？`,
    DISCLAIMER.ja,
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
    instLine(data, 'ja', 'bullet'),
    data.pcr != null ? `▸ P/Cレシオ: ${data.pcr.toFixed(2)}` : '',
    ``,
    `価格は現象。オプション構造は本質です。`,
    `プロフィールリンクからご確認ください。`,
    ``,
    `*データに基づく参考資料です。投資助言ではありません。`,
    ``,
    `#オプションフロー #ガンマエクスポージャー #GEX`,
    `#マーケット構造 #ダークプール #VIX #SignumHQ`,
  ].filter(Boolean).join('\n');

  const jaBluesky = [
    `SPY ${fmt(data.spy)} · QQQ ${fmt(data.qqq)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ja')}`,
    DISCLAIMER.ja,
  ].join('\n');

  const imageUrl = (lang: string) => `${baseUrl}/templates/og/pulse?${imageParams}&lang=${lang}`;

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
  const imageParams = `spy=${data.spy}&vix=${data.vix.toFixed(1)}&gex=${data.gexRegime}&in=${data.instNotional ?? ''}&cp=${data.instCallPct ?? ''}${data.briefingSummary ? '&insight=' + encodeURIComponent(data.briefingSummary.substring(0, 120)) : ''}`;
  const gex = data.gexRegime.toUpperCase();

  const enTwitter = [
    `The structure heading into today's open:`,
    ``,
    `SPY ${fmt(data.spy)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'en')}`,
    data.briefingSummary ? `\n${data.briefingSummary.substring(0, 100)}` : '',
    ``,
    `Track the mechanics driving today's session.`,
    DISCLAIMER.en,
  ].filter(Boolean).join('\n');

  const koTwitter = [
    `오늘 장 오픈 전 구조 분석:`,
    ``,
    `SPY ${fmt(data.spy)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ko')}`,
    data.briefingSummary ? `\n${data.briefingSummary.substring(0, 100)}` : '',
    ``,
    `오늘의 시장 맥락을 데이터로 확인하십시오.`,
    DISCLAIMER.ko,
  ].filter(Boolean).join('\n');

  const jaTwitter = [
    `本日の寄り前構造分析:`,
    ``,
    `SPY ${fmt(data.spy)} · VIX ${data.vix.toFixed(1)}`,
    `GEX: ${gex} — ${gexMeaning(data.gexRegime, 'ja')}`,
    data.briefingSummary ? `\n${data.briefingSummary.substring(0, 100)}` : '',
    DISCLAIMER.ja,
  ].filter(Boolean).join('\n');

  const imageUrl = (lang: string) => `${baseUrl}/templates/og/morning?${imageParams}&lang=${lang}`;

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
      imageUrl: `${baseUrl}/templates/og/education?topic=${topic.id}&lang=${lang}`,
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

  const imageParams = `ticker=${event.ticker}&event=${encodeURIComponent(event.details)}&spy=${marketData?.spy || 0}&vix=${marketData?.vix || 0}&in=${marketData?.instNotional ?? ''}&cp=${marketData?.instCallPct ?? ''}`;

  function buildEvent(lang: 'en' | 'ko' | 'ja') {
    const premium = event.premium ? (
      lang === 'ko' ? `프리미엄: $${(event.premium / 1e6).toFixed(1)}M` :
      lang === 'ja' ? `プレミアム: $${(event.premium / 1e6).toFixed(1)}M` :
      `Premium: $${(event.premium / 1e6).toFixed(1)}M`
    ) : '';

    // Phase 3-5: value가 있으면 수치 표시
    const valueStr = event.value ? (
      lang === 'ko' ? `규모: $${Math.abs(event.value) >= 1e9 ? (event.value / 1e9).toFixed(1) + 'B' : (event.value / 1e6).toFixed(1) + 'M'}` :
      lang === 'ja' ? `規模: $${Math.abs(event.value) >= 1e9 ? (event.value / 1e9).toFixed(1) + 'B' : (event.value / 1e6).toFixed(1) + 'M'}` :
      `Size: $${Math.abs(event.value) >= 1e9 ? (event.value / 1e9).toFixed(1) + 'B' : (event.value / 1e6).toFixed(1) + 'M'}`
    ) : '';

    // GEX Shift — special handling with interpretation
    if (event.type === 'gex_shift') {
      const twitter = lang === 'ko'
        ? `🚨 $${event.ticker} GEX 레짐 전환 감지\n\n${event.details}${valueStr ? `\n${valueStr}` : ''}\n딜러 헤징이 변동성을 억제하는 대신 증폭시키는 구간입니다.\n${DISCLAIMER.ko}`
        : lang === 'ja'
        ? `🚨 $${event.ticker} GEXレジーム転換検出\n\n${event.details}${valueStr ? `\n${valueStr}` : ''}\nディーラーヘッジがボラティリティを抑制ではなく増幅する局面です。\n${DISCLAIMER.ja}`
        : `🚨 $${event.ticker} GEX Regime Shift Detected\n\n${event.details}${valueStr ? `\n${valueStr}` : ''}\nDealer hedging now amplifies rather than suppresses volatility.\n${DISCLAIMER.en}`;

      const threads = lang === 'ko'
        ? `🚨 $${event.ticker} GEX 레짐 전환\n\n${event.details}${valueStr ? `\n${valueStr}` : ''}\n\n딜러 헤징 알고리즘이 변동성 억제 → 증폭으로 전환되는 구간입니다.\n\n이런 구간에서 어떻게 대응하시나요?\n${DISCLAIMER.ko}`
        : lang === 'ja'
        ? `🚨 $${event.ticker} GEXレジーム転換\n\n${event.details}${valueStr ? `\n${valueStr}` : ''}\n\nディーラーヘッジがボラティリティ抑制から増幅に転じる局面です。\n\nこの局面でどう対応されていますか？\n${DISCLAIMER.ja}`
        : `🚨 $${event.ticker} GEX Regime Shift\n\n${event.details}${valueStr ? `\n${valueStr}` : ''}\n\nDealer hedging shifts from suppression to amplification.\n\nHow are you adjusting for this?\n${DISCLAIMER.en}`;

      return {
        text: applyCompliance(twitter),
        imageUrl: `${baseUrl}/templates/og/event?${imageParams}&lang=${lang}`,
        cta: 'liveStructure' as const,
        platformText: {
          twitter: applyCompliance(twitter),
          threads: applyCompliance(threads),
          instagram: applyCompliance(threads + (lang === 'ko' ? '\n\n#GEX전환 #옵션플로우 #SignumHQ' : lang === 'ja' ? '\n\n#GEXシフト #SignumHQ' : '\n\n#GEXShift #OptionsFlow #SignumHQ')),
          bluesky: applyCompliance(twitter),
        },
      };
    }

    // Generic event — Phase 3-5: 구체적 수치 + DISCLAIMER
    const hook = lang === 'ko' ? `🚨 $${event.ticker} 구조적 변화 감지`
               : lang === 'ja' ? `🚨 $${event.ticker} 構造的変化を検出`
               : `🚨 Structural change — $${event.ticker}`;

    const twitter = [hook, '', event.details, valueStr, premium, '', DISCLAIMER[lang]].filter(Boolean).join('\n');
    const threads = [hook, '', event.details, valueStr, premium, '',
      lang === 'ko' ? '이 시그널을 어떻게 해석하시나요?' :
      lang === 'ja' ? 'このシグナルをどう解釈されますか？' :
      'What does this signal tell you?',
      DISCLAIMER[lang],
    ].filter(Boolean).join('\n');

    return {
      text: applyCompliance(twitter),
      imageUrl: `${baseUrl}/templates/og/event?${imageParams}&lang=${lang}`,
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

// ---------------------------------------------------------------------------
// F. Seasonal Content Calendar — Phase 1-15
// Pinterest users plan ahead → publish educational pins 45 days before major events
// Returns relevant topic ID + urgency for cron scheduling
// ---------------------------------------------------------------------------
interface SeasonalEvent {
  name: string;
  month: number;       // 1-12
  day: number;         // approximate day
  topicId: string;     // maps to EDUCATION_TOPICS
  keywords: string[];  // Pinterest SEO keywords
}

const SEASONAL_CALENDAR: SeasonalEvent[] = [
  // FOMC meetings (2026 approximate schedule)
  { name: 'FOMC Jan', month: 1, day: 29, topicId: 'gex', keywords: ['FOMC', 'fed meeting', 'interest rates', 'volatility'] },
  { name: 'FOMC Mar', month: 3, day: 19, topicId: 'gex', keywords: ['FOMC', 'fed decision', 'gamma exposure'] },
  { name: 'FOMC May', month: 5, day: 7, topicId: 'gex', keywords: ['FOMC', 'rate decision', 'options flow'] },
  { name: 'FOMC Jun', month: 6, day: 18, topicId: 'darkpool', keywords: ['FOMC', 'institutional flow', 'dark pool'] },
  { name: 'FOMC Jul', month: 7, day: 30, topicId: 'gex', keywords: ['FOMC', 'rate cut', 'gamma exposure'] },
  { name: 'FOMC Sep', month: 9, day: 17, topicId: 'gex', keywords: ['FOMC', 'september volatility'] },
  { name: 'FOMC Nov', month: 11, day: 5, topicId: 'darkpool', keywords: ['FOMC', 'year end positioning'] },
  { name: 'FOMC Dec', month: 12, day: 17, topicId: 'gex', keywords: ['FOMC', 'december rate decision'] },
  // Earnings seasons (start dates)
  { name: 'Q1 Earnings', month: 4, day: 15, topicId: 'darkpool', keywords: ['earnings season', 'dark pool', 'institutional positioning'] },
  { name: 'Q2 Earnings', month: 7, day: 15, topicId: 'darkpool', keywords: ['earnings season', 'options flow', 'smart money'] },
  { name: 'Q3 Earnings', month: 10, day: 15, topicId: 'levels', keywords: ['earnings season', 'support resistance', 'max pain'] },
  { name: 'Q4 Earnings', month: 1, day: 15, topicId: 'darkpool', keywords: ['earnings season', 'institutional activity'] },
  // Triple Witching (options expiration)
  { name: 'March OpEx', month: 3, day: 21, topicId: 'levels', keywords: ['triple witching', 'options expiration', 'max pain'] },
  { name: 'June OpEx', month: 6, day: 20, topicId: 'levels', keywords: ['triple witching', 'OPEX', 'gamma pin'] },
  { name: 'Sep OpEx', month: 9, day: 19, topicId: 'levels', keywords: ['triple witching', 'options expiration'] },
  { name: 'Dec OpEx', month: 12, day: 19, topicId: 'levels', keywords: ['triple witching', 'year end expiration'] },
  // Jackson Hole
  { name: 'Jackson Hole', month: 8, day: 22, topicId: 'gex', keywords: ['jackson hole', 'fed symposium', 'volatility spike'] },
];

export interface SeasonalResult {
  event: SeasonalEvent;
  daysUntil: number;
  urgency: 'early' | 'mid' | 'imminent';
}

/**
 * Returns seasonal events approaching within the next 45 days.
 * Used by cron to decide when to publish educational content on Pinterest.
 */
export function getUpcomingSeasonalEvents(referenceDate?: Date): SeasonalResult[] {
  const now = referenceDate || new Date();
  const results: SeasonalResult[] = [];

  for (const evt of SEASONAL_CALENDAR) {
    // Create event date for this year
    const eventDate = new Date(now.getFullYear(), evt.month - 1, evt.day);
    // If event already passed this year, check next year
    if (eventDate < now) {
      eventDate.setFullYear(eventDate.getFullYear() + 1);
    }
    const diffMs = eventDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntil <= 45 && daysUntil > 0) {
      const urgency = daysUntil <= 7 ? 'imminent' : daysUntil <= 21 ? 'mid' : 'early';
      results.push({ event: evt, daysUntil, urgency });
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ---------------------------------------------------------------------------
// F. Ticker Spotlight — Phase 4-3
// 게릴라 포스팅: M7 + 고관심 종목 중 랜덤 1개 분석
// ---------------------------------------------------------------------------
const SPOTLIGHT_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'];

export interface SpotlightData {
  ticker: string;
  /** @deprecated 다크풀 소멸(2026-08-28). instNotional 을 쓸 것 */
  darkPoolPct?: number;
  /** 이 종목의 기관 신규 포지션 금액(USD) — 옵션 미결제약정 증가분 */
  instNotional?: number | null;
  instSide?: 'call' | 'put' | null;
  buyPct?: number;
  sellPct?: number;
  blockTrades?: number;
}

export function generateTickerSpotlight(data: SpotlightData): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const { ticker, instNotional, instSide, buyPct, sellPct, blockTrades } = data;

  // 다크풀 줄은 삭제했다 — 원천이 없는데 「Dark Pool: 0.0%」가 발행되고 있었다.
  const hasInst = typeof instNotional === 'number' && instNotional > 0;
  const instVal = hasInst ? instMoney(instNotional!) : '';
  const flowText = buyPct != null && sellPct != null
    ? `Flow: ${buyPct > sellPct ? 'Buy-side dominant' : 'Sell-side dominant'} (${buyPct.toFixed(0)}/${sellPct.toFixed(0)})`
    : '';
  const blockText = blockTrades != null && blockTrades > 0 ? `${blockTrades} block trades detected` : '';

  const imageParams = `t=${ticker}&in=${instNotional ?? ''}&buy=${buyPct ?? ''}&sell=${sellPct ?? ''}&blocks=${blockTrades ?? ''}&position=${buyPct ?? 50}`;
  const imageUrl = (lang: string) => `${baseUrl}/templates/og/spotlight?${imageParams}&lang=${lang}`;

  const enText = [
    `$${ticker} — Under the Hood`,
    ``,
    hasInst ? `▸ New institutional positions: ${instVal}${instSide ? ` (${instSide}-side)` : ''}` : '',
    flowText ? `▸ ${flowText}` : '',
    blockText ? `▸ ${blockText}` : '',
    ``,
    `What institutions are quietly positioning for.`,
    DISCLAIMER.en,
  ].filter(Boolean).join('\n');

  const koText = [
    `$${ticker} — 구조 분석`,
    ``,
    hasInst ? `▸ 기관 신규 포지션: ${instVal}${instSide ? ` (${instSide === 'call' ? '콜' : '풋'} 우위)` : ''}` : '',
    flowText ? `▸ 플로우: ${buyPct! > sellPct! ? '매수 우위' : '매도 우위'} (${buyPct?.toFixed(0)}/${sellPct?.toFixed(0)})` : '',
    blockText ? `▸ 블록 트레이드 ${blockTrades}건 감지` : '',
    ``,
    `기관이 조용히 포지셔닝하는 방향.`,
    DISCLAIMER.ko,
  ].filter(Boolean).join('\n');

  const jaText = [
    `$${ticker} — 構造分析`,
    ``,
    hasInst ? `▸ 機関の新規ポジション: ${instVal}${instSide ? `（${instSide === 'call' ? 'コール' : 'プット'}優勢）` : ''}` : '',
    flowText ? `▸ フロー: ${buyPct! > sellPct! ? '買い優勢' : '売り優勢'} (${buyPct?.toFixed(0)}/${sellPct?.toFixed(0)})` : '',
    blockText ? `▸ ブロックトレード ${blockTrades}件検出` : '',
    ``,
    `機関が静かにポジショニングしている方向。`,
    DISCLAIMER.ja,
  ].filter(Boolean).join('\n');

  return {
    en: { text: applyCompliance(enText), imageUrl: imageUrl('en'), cta: 'darkPoolTrack' },
    ko: { text: applyCompliance(koText), imageUrl: imageUrl('ko'), cta: 'darkPoolTrack' },
    ja: { text: applyCompliance(jaText), imageUrl: imageUrl('ja'), cta: 'darkPoolTrack' },
  };
}

export function getRandomSpotlightTicker(): string {
  return SPOTLIGHT_TICKERS[Math.floor(Math.random() * SPOTLIGHT_TICKERS.length)];
}
