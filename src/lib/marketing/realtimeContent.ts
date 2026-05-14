import type { Lang } from '@/lib/marketing/hashtagEngine';
import { captureTemplate, type FormatType } from '@/lib/marketing/screenshotService';
import { getFromCache } from '@/services/redisClient';

export interface LiveMarketData {
  spy: number; spyChg: number; vix: number; vixChg: number;
  gex: string; dp: number; date: string;
  /** NASDAQ index change % */
  qqq: number; qqqChg: number;
  /** DOW index change % */
  dia: number; diaChg: number;
  /** CNN Fear & Greed Index (0-100) */
  fgi: number; fgiLabel: string;
  /** Guardian AI tactical insight — per-locale cached analysis */
  tacticalInsight?: string;
  /** Guardian AI reality insight — deeper analysis */
  realityInsight?: string;
  /** Per-locale verdicts (for 3-lang dispatch) */
  verdicts?: Record<string, { tactical: string; reality: string }>;
}

// ---------------------------------------------------------------------------
// Fetch live market data from Redis + actual trade data + Guardian AI insight
// ---------------------------------------------------------------------------
export async function fetchLiveMarketData(locale: Lang = 'en'): Promise<LiveMarketData> {
  const [spyRaw, vixRaw, gexRaw, nasdaqRaw, dowRaw, fgiRaw] = await Promise.all([
    getFromCache('yahoo:idx:spx').catch(() => null),
    getFromCache('yahoo:vix').catch(() => null),
    getFromCache('analysis:gex:regime').catch(() => null),
    getFromCache('yahoo:idx:nasdaq').catch(() => null),
    getFromCache('yahoo:idx:dow').catch(() => null),
    getFromCache('cnn:feargreed').catch(() => null),
  ]);
  const spyData = spyRaw ? (typeof spyRaw === 'string' ? JSON.parse(spyRaw) : spyRaw) : {};
  const vixData = vixRaw ? (typeof vixRaw === 'string' ? JSON.parse(vixRaw) : vixRaw) : {};
  let gexStr = 'neutral';
  if (gexRaw) {
    if (typeof gexRaw === 'string') {
      try { gexStr = JSON.parse(gexRaw)?.regime ?? gexRaw; } catch { gexStr = gexRaw as string; }
    } else { gexStr = (gexRaw as any)?.regime ?? 'neutral'; }
  }

  // NASDAQ / DOW
  const nasdaqData = nasdaqRaw ? (typeof nasdaqRaw === 'string' ? JSON.parse(nasdaqRaw) : nasdaqRaw) : {};
  const dowData = dowRaw ? (typeof dowRaw === 'string' ? JSON.parse(dowRaw) : dowRaw) : {};

  // Fear & Greed
  const fgiData = fgiRaw ? (typeof fgiRaw === 'string' ? JSON.parse(fgiRaw) : fgiRaw) : {};
  const fgiScore = Math.round(fgiData?.score ?? 50);
  const fgiLbl = fgiData?.rating ?? (fgiScore >= 75 ? 'Extreme Greed' : fgiScore >= 55 ? 'Greed' : fgiScore >= 45 ? 'Neutral' : fgiScore >= 25 ? 'Fear' : 'Extreme Fear');

  // Dark Pool: fetch REAL data from EC2 ElastiCache → Polygon REST
  // Fallback: last cached DP value from event-detect cron (survives off-hours)
  let dp = 0;
  try {
    const { fetchTradeData } = await import('@/services/realtimeMetricsService');
    const spyTrade = await fetchTradeData('SPY').catch(() => null);
    dp = spyTrade?.darkPoolPercent || 0;
  } catch { /* optional */ }
  // Off-hours fallback: read last DP snapshot cached by event-detect cron
  if (dp === 0) {
    try {
      const dpCached = await getFromCache('marketing:dp:latest:SPY').catch(() => null)
        || await getFromCache('marketing:event:dp_spike:SPY').catch(() => null);
      if (dpCached) dp = parseFloat(String(dpCached)) || 0;
    } catch { /* optional */ }
  }

  // Guardian AI tactical insight — the REAL analysis text from AI engine (all 3 locales)
  const verdicts: Record<string, { tactical: string; reality: string }> = {};
  let tacticalInsight: string | undefined;
  let realityInsight: string | undefined;
  try {
    const [koV, enV, jaV] = await Promise.all([
      getFromCache('guardian:ai_verdict:ko').catch(() => null),
      getFromCache('guardian:ai_verdict:en').catch(() => null),
      getFromCache('guardian:ai_verdict:ja').catch(() => null),
    ]);
    for (const [loc, raw] of [['ko', koV], ['en', enV], ['ja', jaV]] as const) {
      if (raw) {
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        verdicts[loc] = { tactical: v?.description || '', reality: v?.realityInsight || '' };
      }
    }
    // Default to locale param for backward compat
    tacticalInsight = verdicts[locale]?.tactical || verdicts.ko?.tactical || undefined;
    realityInsight = verdicts[locale]?.reality || verdicts.ko?.reality || undefined;
  } catch { /* optional */ }

  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return {
    spy: spyData?.price ?? spyData?.last ?? 0,
    spyChg: spyData?.changePercent ?? spyData?.changePct ?? 0,
    vix: vixData?.price ?? vixData?.last ?? 0,
    vixChg: vixData?.changePercent ?? vixData?.changePct ?? 0,
    qqq: nasdaqData?.price ?? nasdaqData?.last ?? 0,
    qqqChg: nasdaqData?.changePercent ?? nasdaqData?.changePct ?? 0,
    dia: dowData?.price ?? dowData?.last ?? 0,
    diaChg: dowData?.changePercent ?? dowData?.changePct ?? 0,
    fgi: fgiScore,
    fgiLabel: fgiLbl,
    gex: gexStr, dp,
    date: `${etNow.getFullYear()}-${String(etNow.getMonth()+1).padStart(2,'0')}-${String(etNow.getDate()).padStart(2,'0')}`,
    tacticalInsight,
    realityInsight,
    verdicts,
  };
}

// ---------------------------------------------------------------------------
// Text Builder — observation language only, no predictions
// ---------------------------------------------------------------------------
export function buildRealtimeText(
  ct: 'premarket' | 'intraday' | 'close' | 'structure' | 'afterhours' | 'recap' | 'asia_insight' | 'market_open',
  plat: 'bluesky' | 'threads',
  lang: Lang,
  m: LiveMarketData,
): string {
  // Resolve per-locale Guardian AI verdict
  const localeVerdict = m.verdicts?.[lang];
  if (localeVerdict) {
    m = { ...m, tacticalInsight: localeVerdict.tactical || m.tacticalInsight, realityInsight: localeVerdict.reality || m.realityInsight };
  }
  const G = m.gex.toUpperCase();
  const gM = m.gex === 'positive'
    ? (lang === 'ko' ? '딜러 변동성 억제 구간' : lang === 'ja' ? 'ディーラーのボラ抑制ゾーン' : 'Dealer volatility suppression zone')
    : m.gex === 'negative'
    ? (lang === 'ko' ? '딜러 변동성 증폭 구간' : lang === 'ja' ? 'ディーラーのボラ増幅ゾーン' : 'Dealer volatility amplification zone')
    : (lang === 'ko' ? '중립 전환 구간' : lang === 'ja' ? '中立遷移ゾーン' : 'Neutral transition zone');
  const sd = m.spyChg >= 0 ? '+' : '';
  const nd = m.qqqChg >= 0 ? '+' : '';
  const dd = m.diaChg >= 0 ? '+' : '';
  const vd = m.vixChg >= 0 ? '+' : '';
  const dp = m.dp > 0 ? `${m.dp.toFixed(1)}%` : 'N/A';
  const fgiText = `${m.fgi} (${m.fgiLabel})`;
  const volNote = m.vixChg > 0
    ? (lang === 'ko' ? '변동성 확대 중' : lang === 'ja' ? 'ボラティリティ拡大中' : 'volatility expanding')
    : (lang === 'ko' ? '변동성 축소 중' : lang === 'ja' ? 'ボラティリティ縮小中' : 'volatility compressing');
  const disc = {
    en: '*Not financial advice. Data-driven context only.',
    ko: '*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.',
    ja: '*投資助言ではありません。データ分析の参考資料です。',
  };

  // ── BLUESKY (≤300 char, data-first — NO disclaimer; dispatch adds CTA+tags) ──
  if (plat === 'bluesky') {
    // Truncate AI insight to fit Bluesky 300 char limit (header ~80 chars)
    const bsInsight = m.tacticalInsight || '';
    const bsTrunc = bsInsight.length > 180 ? bsInsight.slice(0, 177) + '...' : bsInsight;
    if (ct === 'premarket') {
      return `📊 Pre-Market Structure | ${m.date}\n\nVIX: ${m.vix.toFixed(1)} (${vd}${m.vixChg.toFixed(1)}%)\nGEX: ${G} — ${gM}\n\nStructural positioning observed before the open.`;
    }
    if (ct === 'intraday') {
      return `⚡ Intraday Structure Update\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)}\nGEX: ${G} | DP: ${dp}\n\nInstitutional flow shifting in real-time.`;
    }
    if (ct === 'structure') {
      return bsTrunc ? `🏦 Mid-Session | ${m.date}\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${bsTrunc}` : `🏦 Mid-Session Structure | ${m.date}\n\nSPY: ${sd}${m.spyChg.toFixed(2)}%\nVIX: ${m.vix.toFixed(1)} | GEX: ${G}\nDark Pool: ${dp}`;
    }
    if (ct === 'afterhours') {
      return bsTrunc ? `📋 Session Debrief | ${m.date}\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${bsTrunc}` : `📋 Session Debrief | ${m.date}\n\nSPY closed: ${sd}${m.spyChg.toFixed(2)}%\nVIX: ${m.vix.toFixed(1)} | GEX: ${G} | DP: ${dp}`;
    }
    if (ct === 'recap') {
      return bsTrunc ? `📊 Wall St Overnight | ${m.date}\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${bsTrunc}` : `📊 Overnight Recap | ${m.date}\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)}\nGEX: ${G} | DP: ${dp}`;
    }
    if (ct === 'asia_insight') {
      const ri = m.realityInsight || bsInsight;
      const riTrunc = ri.length > 200 ? ri.slice(0, 197) + '...' : ri;
      return riTrunc ? `💡 Structure Insight\n\n${riTrunc}` : `💡 Structure Insight | ${m.date}\n\nVIX ${m.vix.toFixed(1)} | GEX: ${G} | DP: ${dp}`;
    }
    // close — 3 indices + FGI + AI insight (≤300)
    return bsTrunc
      ? `🔔 Market Close | ${m.date}\n\nS&P ${sd}${m.spyChg.toFixed(2)}% | NQ ${nd}${m.qqqChg.toFixed(2)}% | DOW ${dd}${m.diaChg.toFixed(2)}%\nVIX ${m.vix.toFixed(1)} | F&G ${m.fgi}\n\n${bsTrunc}`
      : `🔔 Market Close | ${m.date}\n\nS&P ${sd}${m.spyChg.toFixed(2)}% | NQ ${nd}${m.qqqChg.toFixed(2)}% | DOW ${dd}${m.diaChg.toFixed(2)}%\nVIX: ${m.vix.toFixed(1)} | GEX: ${G} | DP: ${dp}\nFear & Greed: ${fgiText}`;
  }

  // ── THREADS (≤500 char, conversational, engagement question) ──
  if (ct === 'premarket') {
    if (lang === 'ko') return `좋은 아침입니다 👋\n\n장 오픈 전 구조 체크:\n• VIX ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\n데이터는 예측하지 않습니다. 하지만 기관이 어디에 포지셔닝하고 있는지를 보여줍니다.\n\n오늘 주목하는 지표가 있으신가요? 👇\n\n${disc.ko}`;
    if (lang === 'ja') return `おはようございます 👋\n\n構造チェック:\n• VIX ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\n機関のポジショニングを観察しています。\n\n注目する指標は？ 👇\n\n${disc.ja}`;
    return `Good morning 👋\n\nQuick pre-market structure check:\n• VIX at ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\nThe data doesn't predict. But it reveals where institutions are positioning.\n\nWhat are you watching today? 👇\n\n${disc.en}`;
  }
  if (ct === 'structure') {
    const insight = m.tacticalInsight || '';
    const truncSt = insight.length > 200 ? insight.slice(0, 197) + '...' : insight;
    if (lang === 'ko') return truncSt ? `📊 장중 구조 분석\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncSt}\n\n${disc.ko}` : `📊 장중 데이터 체크\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)}\n다크풀: ${dp} | GEX: ${G}\n\n${disc.ko}`;
    if (lang === 'ja') return truncSt ? `📊 セッション中盤分析\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncSt}\n\n${disc.ja}` : `📊 セッション中盤チェック\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | GEX: ${G}\n\n${disc.ja}`;
    return truncSt ? `📊 Mid-Session Analysis\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncSt}\n\n${disc.en}` : `📊 Mid-session check\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | GEX: ${G}\n\n${disc.en}`;
  }
  if (ct === 'afterhours') {
    const insight = m.tacticalInsight || '';
    const truncInsight = insight.length > 280 ? insight.slice(0, 277) + '...' : insight;
    if (lang === 'ko') return truncInsight ? `🌙 세션 종료 — AI 구조 분석\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncInsight}\n\n${disc.ko}` : `🌙 세션 리캡\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | DP: ${dp} | GEX: ${G}\n\n${disc.ko}`;
    if (lang === 'ja') return truncInsight ? `🌙 セッション終了 — AI構造分析\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncInsight}\n\n${disc.ja}` : `🌙 セッション振り返り\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | GEX: ${G}\n\n${disc.ja}`;
    return truncInsight ? `🌙 Session Close — AI Structure Analysis\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncInsight}\n\n${disc.en}` : `🌙 Session Wrap\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | GEX: ${G}\n\n${disc.en}`;
  }
  // ── ASIA RECAP (KST 11:30) — Hook→Data→Meaning→Scenario→CTA ──
  if (ct === 'recap') {
    const insight = m.tacticalInsight || '';
    const maxI = 280;
    const tI = insight.length > maxI ? insight.slice(0, maxI - 3) + '...' : insight;
    // Dynamic hook based on market movement
    const hookKo = Math.abs(m.spyChg) > 1 ? '🚨 어젯밤 월가 큰 움직임' : m.spyChg >= 0 ? '📊 어젯밤 월가 요약' : '📉 어젯밤 월가 하락 마감';
    const hookJa = Math.abs(m.spyChg) > 1 ? '🚨 昨夜のウォール街—大きな動き' : m.spyChg >= 0 ? '📊 昨夜のウォール街サマリー' : '📉 昨夜のウォール街—下落';
    const hookEn = Math.abs(m.spyChg) > 1 ? '🚨 Wall Street Overnight — Big Move' : m.spyChg >= 0 ? '📊 Wall Street Overnight Recap' : '📉 Wall Street Closed Lower';
    // Meaning layer — what the data combination implies
    const meaningKo = m.dp > 40 ? '다크풀 활동이 40%를 넘었습니다 — 기관이 적극적으로 포지셔닝 중입니다.' : m.vix > 25 ? 'VIX 25 이상 — 변동성 확대 구간에서의 기관 움직임에 주목하세요.' : `GEX ${G} 체제에서 ${gM} — 구조적 맥락을 먼저 이해하세요.`;
    const meaningJa = m.dp > 40 ? 'DP活動40%超 — 機関が積極的にポジショニング中。' : m.vix > 25 ? 'VIX 25超 — ボラ拡大局面での機関の動きに注目。' : `GEX ${G}体制で${gM}。`;
    const meaningEn = m.dp > 40 ? 'Dark Pool above 40% — institutions actively positioning.' : m.vix > 25 ? 'VIX above 25 — watch institutional moves in elevated volatility.' : `GEX ${G} regime: ${gM}.`;
    if (lang === 'ko') return `${hookKo}\n\n📈 SPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} (${vd}${m.vixChg.toFixed(1)}%)\n🏦 다크풀: ${dp} | GEX: ${G}\n\n${tI || meaningKo}\n\n💡 ${meaningKo}\n\n→ 전체 분석: signumhq.com/intel-guardian\n\n${disc.ko}`;
    if (lang === 'ja') return `${hookJa}\n\n📈 SPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} (${vd}${m.vixChg.toFixed(1)}%)\n🏦 DP: ${dp} | GEX: ${G}\n\n${tI || meaningJa}\n\n💡 ${meaningJa}\n\n→ 全分析: signumhq.com/intel-guardian\n\n${disc.ja}`;
    return `${hookEn}\n\n📈 SPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} (${vd}${m.vixChg.toFixed(1)}%)\n🏦 Dark Pool: ${dp} | GEX: ${G}\n\n${tI || meaningEn}\n\n💡 ${meaningEn}\n\n→ Full analysis: signumhq.com/intel-guardian\n\n${disc.en}`;
  }
  // ── ASIA INSIGHT (KST 13:00) — Guardian AI deep analysis with context ──
  if (ct === 'asia_insight') {
    const insight = m.realityInsight || m.tacticalInsight || '';
    const maxI = 300;
    const tI = insight.length > maxI ? insight.slice(0, maxI - 3) + '...' : insight;
    // Context layer — what the structural regime means for readers
    const ctxKo = m.gex === 'negative' ? '⚠️ GEX 음수 체제 — 딜러 헤지가 변동성을 증폭시키는 구간입니다. 급격한 움직임에 대비하세요.' : m.gex === 'positive' ? '🛡️ GEX 양수 체제 — 딜러가 변동성을 억제하는 구간입니다. 범위 내 움직임이 예상됩니다.' : '⚖️ GEX 중립 전환 — 방향성 전환이 가능한 구간입니다.';
    const ctxJa = m.gex === 'negative' ? '⚠️ GEXマイナス体制 — ディーラーヘッジがボラを増幅する局面です。' : m.gex === 'positive' ? '🛡️ GEXプラス体制 — ディーラーがボラを抑制する局面です。' : '⚖️ GEX中立遷移 — 方向転換の可能性がある局面です。';
    const ctxEn = m.gex === 'negative' ? '⚠️ GEX Negative — dealer hedging amplifies volatility. Prepare for sharp moves.' : m.gex === 'positive' ? '🛡️ GEX Positive — dealer hedging suppresses volatility. Range-bound behavior expected.' : '⚖️ GEX Neutral — directional transition possible.';
    if (lang === 'ko') return tI ? `🧠 기관 구조 분석 — Guardian AI\n\n📊 VIX ${m.vix.toFixed(1)} | GEX ${G} | DP ${dp}\n\n${tI}\n\n${ctxKo}\n\n→ signumhq.com/intel-guardian\n\n${disc.ko}` : `🧠 기관 구조 분석\n\n${ctxKo}\n\n📊 VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n→ signumhq.com/intel-guardian\n\n${disc.ko}`;
    if (lang === 'ja') return tI ? `🧠 機関構造分析 — Guardian AI\n\n📊 VIX ${m.vix.toFixed(1)} | GEX ${G} | DP ${dp}\n\n${tI}\n\n${ctxJa}\n\n→ signumhq.com/intel-guardian\n\n${disc.ja}` : `🧠 機関構造分析\n\n${ctxJa}\n\n📊 VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n→ signumhq.com/intel-guardian\n\n${disc.ja}`;
    return tI ? `🧠 Institutional Structure — Guardian AI\n\n📊 VIX ${m.vix.toFixed(1)} | GEX ${G} | DP ${dp}\n\n${tI}\n\n${ctxEn}\n\n→ signumhq.com/intel-guardian\n\n${disc.en}` : `🧠 Institutional Structure\n\n${ctxEn}\n\n📊 VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n→ signumhq.com/intel-guardian\n\n${disc.en}`;
  }
  // ── MARKET OPEN (KST 22:30 = ET 09:30) ──
  if (ct === 'market_open') {
    if (lang === 'ko') return `🔔 미국 시장 오픈!

장 시작과 함께 구조를 확인합니다:
• VIX: ${m.vix.toFixed(1)} (${volNote})
• GEX: ${G} — ${gM}
• 다크풀: ${dp}

오픈 직후 기관 흐름이 가장 빠르게 드러납니다.

어떤 종목을 주시하고 계신가요? 👇

${disc.ko}`;
    if (lang === 'ja') return `🔔 米国市場オープン!

セッション開始時の構造:
• VIX: ${m.vix.toFixed(1)}
• GEX: ${G} — ${gM}
• DP: ${dp}

オープン直後に機関の動きが最も早く現れます。

注目銘柄は？ 👇

${disc.ja}`;
    return `🔔 US Market Open

Opening structure check:
• VIX: ${m.vix.toFixed(1)}
• GEX: ${G} — ${gM}
• Dark Pool: ${dp}

Institutional flow reveals itself fastest at the open.

What are you watching? 👇

${disc.en}`;
  }

  // close (threads) — Complete short analysis (no truncation) + CTA link
  // Strategy: Short complete insight → trust + CTA link → site traffic
  const closeInsightRaw = m.tacticalInsight || '';
  // Clean for marketing: strip bracket tags, ETF symbols, IFS scores, noise warnings
  let closeInsight = closeInsightRaw.replace(/\[[^\]]+\]\s*/g, '');
  closeInsight = closeInsight.replace(/\([^)]*IFS\s*[+-]?\d+[^)]*\)/g, '');
  closeInsight = closeInsight.replace(/\([^)]*\b(?:SMH|XLK|XLC|XLY|XLE|XLF|XLV|XLI|XLB|XLP|XLU|XLRE|IWM|AI_PWR)\b[^)]*\)/g, '');
  closeInsight = closeInsight.replace(/\bIFS\s*[+-]?\d+/g, '');
  // Strip standalone ETF/sector codes: "AI_PWR는 당일 -1." → remove entire phrase
  closeInsight = closeInsight.replace(/\b(?:AI_PWR|SMH|XLK|XLC|XLY|XLE|XLF|XLV|XLI|XLB|XLP|XLU|XLRE|IWM)[^\n.。]*[.。]?/g, '');
  closeInsight = closeInsight.replace(/,?\s*노이즈\s*경고[^.。]*[.。]?/g, '.');
  closeInsight = closeInsight.replace(/\([^)]*스텔스[^)]*\)/g, '');
  // Strip trailing incomplete sentences: "다만..." "ただし..." (greedy — avoids decimal point confusion)
  closeInsight = closeInsight.replace(/\s*다만\s+.*$/gm, '');
  closeInsight = closeInsight.replace(/\s*ただし\s+.*$/gm, '');
  closeInsight = closeInsight.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/,\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
  // Truncate at sentence boundary (max 200 chars, always ends on complete sentence)
  let closeTrunc = closeInsight;
  if (closeTrunc.length > 200) {
    const sub = closeTrunc.slice(0, 200);
    const lastEnd = Math.max(sub.lastIndexOf('.'), sub.lastIndexOf('。'), sub.lastIndexOf('다.'));
    closeTrunc = lastEnd > 80 ? closeTrunc.slice(0, lastEnd + 1) : sub;
  }
  const ctaLink = 'https://www.signumhq.com/intel-guardian';
  const ctaKo = `\n\n📊 전체 분석 보기 → ${ctaLink}`;
  const ctaJa = `\n\n📊 全分析を見る → ${ctaLink}`;
  const ctaEn = `\n\n📊 Full analysis → ${ctaLink}`;
  if (lang === 'ko') return closeTrunc
    ? `장 마감 🔔\n\n📉 S&P 500: ${sd}${m.spyChg.toFixed(2)}%\n📈 나스닥: ${nd}${m.qqqChg.toFixed(2)}%\n📊 다우: ${dd}${m.diaChg.toFixed(2)}%\n\nVIX: ${m.vix.toFixed(1)} | DP: ${dp} | F&G: ${m.fgi}\n\n${closeTrunc}${ctaKo}\n\n${disc.ko}`
    : `장 마감 🔔\n\n📉 S&P 500: ${sd}${m.spyChg.toFixed(2)}%\n📈 나스닥: ${nd}${m.qqqChg.toFixed(2)}%\n📊 다우: ${dd}${m.diaChg.toFixed(2)}%\n\nVIX: ${m.vix.toFixed(1)} | DP: ${dp} | F&G: ${m.fgi}${ctaKo}\n\n${disc.ko}`;
  if (lang === 'ja') return closeTrunc
    ? `セッション終了 🔔\n\n📉 S&P 500: ${sd}${m.spyChg.toFixed(2)}%\n📈 ナスダック: ${nd}${m.qqqChg.toFixed(2)}%\n📊 ダウ: ${dd}${m.diaChg.toFixed(2)}%\n\nVIX: ${m.vix.toFixed(1)} | DP: ${dp} | F&G: ${m.fgi}\n\n${closeTrunc}${ctaJa}\n\n${disc.ja}`
    : `セッション終了 🔔\n\n📉 S&P 500: ${sd}${m.spyChg.toFixed(2)}%\n📈 ナスダック: ${nd}${m.qqqChg.toFixed(2)}%\n📊 ダウ: ${dd}${m.diaChg.toFixed(2)}%\n\nVIX: ${m.vix.toFixed(1)} | DP: ${dp} | F&G: ${m.fgi}${ctaJa}\n\n${disc.ja}`;
  return closeTrunc
    ? `Session Wrap 🔔\n\n📉 S&P 500: ${sd}${m.spyChg.toFixed(2)}%\n📈 NASDAQ: ${nd}${m.qqqChg.toFixed(2)}%\n📊 DOW: ${dd}${m.diaChg.toFixed(2)}%\n\nVIX: ${m.vix.toFixed(1)} | DP: ${dp} | F&G: ${m.fgi}\n\n${closeTrunc}${ctaEn}\n\n${disc.en}`
    : `Session Wrap 🔔\n\n📉 S&P 500: ${sd}${m.spyChg.toFixed(2)}%\n📈 NASDAQ: ${nd}${m.qqqChg.toFixed(2)}%\n📊 DOW: ${dd}${m.diaChg.toFixed(2)}%\n\nVIX: ${m.vix.toFixed(1)} | DP: ${dp} | F&G: ${m.fgi}${ctaEn}\n\n${disc.en}`;
}


// ---------------------------------------------------------------------------
// Realtime OG Image (reuses pulse template with live data)
// ---------------------------------------------------------------------------
export async function captureRealtimeOG(
  baseUrl: string,
  mkt: LiveMarketData,
  format: FormatType,
  dryRun: boolean,
): Promise<string> {
  const data: Record<string, string | number> = {
    spy: mkt.spyChg, vix: mkt.vix, gex: mkt.gex, dp: mkt.dp, date: mkt.date,
  };

  if (dryRun) {
    const url = new URL(`${baseUrl}/templates/og/pulse`);
    Object.entries(data).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    url.searchParams.set('format', format);
    return url.toString();
  }

  // Live capture via EC2 (retry once)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await captureTemplate({ template: 'pulse', format, data });
      if (result?.cdnUrl) return result.cdnUrl;
    } catch (err: any) {
      console.warn(`[Dispatch] Realtime OG attempt ${attempt + 1} failed: ${err.message}`);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
  }
  return ''; // Empty = text-only post
}

// ---------------------------------------------------------------------------
// Market Close OG Image (7-metric dashboard: SPY, QQQ, DIA, VIX, DP, GEX, FGI)
// ---------------------------------------------------------------------------
export async function captureMarketCloseOG(
  baseUrl: string,
  mkt: LiveMarketData,
  format: FormatType,
  dryRun: boolean,
): Promise<string> {
  const data: Record<string, string | number> = {
    spy: mkt.spyChg,
    qqq: mkt.qqqChg,
    dia: mkt.diaChg,
    vix: mkt.vix,
    dp: mkt.dp,
    gex: mkt.gex,
    fgi: mkt.fgi,
    date: mkt.date,
  };

  if (dryRun) {
    const url = new URL(`${baseUrl}/templates/og/market-close`);
    Object.entries(data).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    url.searchParams.set('format', format);
    return url.toString();
  }

  // Live capture via EC2 (retry once)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await captureTemplate({ template: 'market-close', format, data });
      if (result?.cdnUrl) return result.cdnUrl;
    } catch (err: any) {
      console.warn(`[Dispatch] MarketClose OG attempt ${attempt + 1} failed: ${err.message}`);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
  }
  return ''; // Empty = text-only post
}

// ---------------------------------------------------------------------------
// Market Close IG Image (1080×1080 square — Instagram feed single image)
// Same 7-metric data, reuses market-close-ig template
// ---------------------------------------------------------------------------
export async function captureMarketCloseIG(
  baseUrl: string,
  mkt: LiveMarketData,
  dryRun: boolean,
): Promise<string> {
  const data: Record<string, string | number> = {
    spy: mkt.spyChg,
    qqq: mkt.qqqChg,
    dia: mkt.diaChg,
    vix: mkt.vix,
    dp: mkt.dp,
    gex: mkt.gex,
    fgi: mkt.fgi,
    date: mkt.date,
  };

  if (dryRun) {
    const url = new URL(`${baseUrl}/templates/og/market-close-ig`);
    Object.entries(data).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    return url.toString();
  }

  // Live capture via EC2 — 1080×1080 square format
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await captureTemplate({
        template: 'market-close-ig' as any,
        format: 'carousel',  // 1080×1080 in FORMATS
        data,
      });
      if (result?.cdnUrl) return result.cdnUrl;
    } catch (err: any) {
      console.warn(`[Dispatch] MarketClose IG attempt ${attempt + 1} failed: ${err.message}`);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
  }
  return ''; // Empty = skip IG post
}
