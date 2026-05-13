import type { Lang } from '@/lib/marketing/hashtagEngine';
import { captureTemplate, type FormatType } from '@/lib/marketing/screenshotService';
import { getFromCache } from '@/services/redisClient';

export interface LiveMarketData {
  spy: number; spyChg: number; vix: number; vixChg: number;
  gex: string; dp: number; date: string;
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
  const [spyRaw, vixRaw, gexRaw] = await Promise.all([
    getFromCache('yahoo:idx:spx').catch(() => null),
    getFromCache('yahoo:vix').catch(() => null),
    getFromCache('analysis:gex:regime').catch(() => null),
  ]);
  const spyData = spyRaw ? (typeof spyRaw === 'string' ? JSON.parse(spyRaw) : spyRaw) : {};
  const vixData = vixRaw ? (typeof vixRaw === 'string' ? JSON.parse(vixRaw) : vixRaw) : {};
  let gexStr = 'neutral';
  if (gexRaw) {
    if (typeof gexRaw === 'string') {
      try { gexStr = JSON.parse(gexRaw)?.regime ?? gexRaw; } catch { gexStr = gexRaw as string; }
    } else { gexStr = (gexRaw as any)?.regime ?? 'neutral'; }
  }

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
  ct: 'premarket' | 'intraday' | 'close' | 'structure' | 'afterhours' | 'recap' | 'asia_insight' | 'market_open' | 'asia_evening' | 'asia_tip' | 'asia_preview',
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
  const vd = m.vixChg >= 0 ? '+' : '';
  const dp = m.dp > 0 ? `${m.dp.toFixed(1)}%` : 'N/A';
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
    // close
    return bsTrunc ? `🔔 Session Close | ${m.date}\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${bsTrunc}` : `🔔 Session Close | ${m.date}\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)}\nGEX: ${G} | DP: ${dp}\n\nInstitutional positioning data finalized.`;
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
  // ── ASIA DAYTIME: recap (KST 11:30 — Guardian AI 분석 기반 리캡) ──
  if (ct === 'recap') {
    const insight = m.tacticalInsight || '';
    const maxInsight = 350;
    const truncInsight = insight.length > maxInsight ? insight.slice(0, maxInsight - 3) + '...' : insight;
    if (lang === 'ko') return truncInsight ? `📊 어젯밤 월가 — AI 구조 분석\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncInsight}\n\n→ 전체 분석: signumhq.com/intel-guardian\n\n${disc.ko}` : `📊 어젯밤 미국 시장\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | DP: ${dp} | GEX: ${G}\n\n${disc.ko}`;
    if (lang === 'ja') return truncInsight ? `📊 昨夜のウォール街 — AI構造分析\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncInsight}\n\n→ 全分析: signumhq.com/intel-guardian\n\n${disc.ja}` : `📊 昨夜の米国市場\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | GEX: ${G}\n\n${disc.ja}`;
    return truncInsight ? `📊 Wall Street Overnight — AI Structure Analysis\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${truncInsight}\n\n→ Full analysis: signumhq.com/intel-guardian\n\n${disc.en}` : `📊 Overnight US Market\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | GEX: ${G}\n\n${disc.en}`;
  }
  // ── ASIA DAYTIME: insight (KST 14:00 — Guardian reality insight 기반) ──
  if (ct === 'asia_insight') {
    const insight = m.realityInsight || m.tacticalInsight || '';
    const maxInsight = 350;
    const truncInsight = insight.length > maxInsight ? insight.slice(0, maxInsight - 3) + '...' : insight;
    if (lang === 'ko') return truncInsight ? `💡 오늘의 구조 인사이트\n\n${truncInsight}\n\n→ 실시간 분석: signumhq.com/intel-guardian\n\n${disc.ko}` : `💡 오늘의 구조 인사이트\n\nGEX ${G} — ${gM}\nVIX ${m.vix.toFixed(1)} | DP ${dp}\n\n→ signumhq.com/intel-guardian\n\n${disc.ko}`;
    if (lang === 'ja') return truncInsight ? `💡 本日の構造インサイト\n\n${truncInsight}\n\n→ リアルタイム分析: signumhq.com/intel-guardian\n\n${disc.ja}` : `💡 本日の構造インサイト\n\nGEX ${G} — ${gM}\nVIX ${m.vix.toFixed(1)} | DP ${dp}\n\n→ signumhq.com/intel-guardian\n\n${disc.ja}`;
    return truncInsight ? `💡 Today's Structure Insight\n\n${truncInsight}\n\n→ Live analysis: signumhq.com/intel-guardian\n\n${disc.en}` : `💡 Structure Insight\n\nGEX ${G} — ${gM}\nVIX ${m.vix.toFixed(1)} | DP ${dp}\n\n→ signumhq.com/intel-guardian\n\n${disc.en}`;
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
  // ── ASIA EVENING (KST 20:30 — 저녁 소셜 피크) ──
  if (ct === 'asia_evening') {
    if (lang === 'ko') return `🌆 오늘의 시장 준비 체크

미국 장 오픈까지 2시간. 지금 구조를 미리 확인하세요:
📊 VIX: ${m.vix.toFixed(1)} | GEX: ${G}
🏦 다크풀: ${dp}

기관이 포지셔닝하는 곳을 먼저 봐야 합니다.
→ signumhq.com에서 실시간 확인

${disc.ko}`;
    if (lang === 'ja') return `🌆 本日の市場準備チェック

米国オープンまで2時間。構造を事前に確認:
📊 VIX: ${m.vix.toFixed(1)} | GEX: ${G}
🏦 DP: ${dp}

機関のポジショニングを先に確認しましょう。
→ signumhq.comでリアルタイム確認

${disc.ja}`;
    return `🌆 Pre-session prep

2 hours to US open. Structure check:
📊 VIX: ${m.vix.toFixed(1)} | GEX: ${G}
🏦 Dark Pool: ${dp}

See where institutions are positioning first.
→ signumhq.com

${disc.en}`;
  }
  // ── ASIA TIP (KST 16:30 — 오후 교육 팁) ──
  if (ct === 'asia_tip') {
    const tips: Record<string, string[]> = {
      ko: [
        `💡 GEX란? Gamma Exposure의 약자\n\n딜러가 보유한 옵션 헤지의 방향을 나타냅니다.\n• 양수: 변동성 억제\n• 음수: 변동성 증폭\n\n지금 GEX: ${G}\n\n→ signumhq.com에서 실시간 확인\n\n${disc.ko}`,
        `💡 다크풀(Dark Pool)이란?\n\n기관이 대량 거래를 공개 시장에 노출하지 않고 실행하는 채널.\n• 현재 DP 활동: ${dp}\n\n높을수록 기관이 적극적으로 움직이고 있습니다.\n\n→ signumhq.com\n\n${disc.ko}`,
        `💡 VIX는 시장의 체온계\n\n• 15 미만: 시장 안정\n• 20-25: 경계\n• 30+: 공포\n\n지금 VIX: ${m.vix.toFixed(1)}\n\n구조를 이해하면 가격이 보입니다.\n\n→ signumhq.com\n\n${disc.ko}`,
      ],
      ja: [
        `💡 GEXとは？Gamma Exposureの略\n\nディーラーのオプションヘッジの方向性を示します。\n• プラス: ボラ抑制\n• マイナス: ボラ増幅\n\n現在GEX: ${G}\n\n→ signumhq.com\n\n${disc.ja}`,
        `💡 ダークプールとは？\n\n機関が大口取引を非公開で実行するチャネル。\n• 現在DP活動: ${dp}\n\n→ signumhq.com\n\n${disc.ja}`,
        `💡 VIXは市場の体温計\n\n• 15未満: 安定\n• 20-25: 警戒\n• 30+: 恐怖\n\n現在VIX: ${m.vix.toFixed(1)}\n\n→ signumhq.com\n\n${disc.ja}`,
      ],
      en: [
        `💡 What is GEX?\n\nGamma Exposure shows dealer hedging direction.\n• Positive: Volatility suppressed\n• Negative: Volatility amplified\n\nCurrent GEX: ${G}\n\n→ signumhq.com\n\n${disc.en}`,
      ],
    };
    const arr = tips[lang] || tips.en;
    const idx = new Date().getDate() % arr.length;
    return arr[idx];
  }
  // ── ASIA PREVIEW (KST 18:00 — 미국 장 오픈 전 프리뷰) ──
  if (ct === 'asia_preview') {
    if (lang === 'ko') return `🌟 오늘 밤 미국 장 프리뷰\n\n장 오픈까지 4시간 남았습니다.\n\n현재 구조:\n📊 VIX: ${m.vix.toFixed(1)} | GEX: ${G}\n🏦 다크풀: ${dp}\n\n오늘 밤 어떤 시나리오가 나올 수 있을까요?\n\n→ signumhq.com에서 준비하세요\n\n${disc.ko}`;
    if (lang === 'ja') return `🌟 今夜の米国市場プレビュー\n\nオープンまで4時間。\n\n現在の構造:\n📊 VIX: ${m.vix.toFixed(1)} | GEX: ${G}\n🏦 DP: ${dp}\n\n今夜のシナリオは？\n\n→ signumhq.comで準備\n\n${disc.ja}`;
    return `🌟 Tonight's US market preview\n\n4 hours to open.\n\nCurrent structure:\n📊 VIX: ${m.vix.toFixed(1)} | GEX: ${G}\n🏦 Dark Pool: ${dp}\n\nWhat scenario are you expecting tonight?\n\n→ signumhq.com\n\n${disc.en}`;
  }
  // close (threads) — Guardian AI insight + data
  const closeInsight = m.tacticalInsight || '';
  const closeTrunc = closeInsight.length > 280 ? closeInsight.slice(0, 277) + '...' : closeInsight;
  if (lang === 'ko') return closeTrunc ? `장 마감 🔔\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${closeTrunc}\n\n${disc.ko}` : `장 마감 🔔\n\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)} | DP: ${dp} | GEX: ${G}\n\n${disc.ko}`;
  if (lang === 'ja') return closeTrunc ? `セッション終了 🔔\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${closeTrunc}\n\n${disc.ja}` : `セッション終了 🔔\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | DP: ${dp} | GEX: ${G}\n\n${disc.ja}`;
  return closeTrunc ? `Session Wrap 🔔\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)} | DP ${dp}\n\n${closeTrunc}\n\n${disc.en}` : `Session Wrap 🔔\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)} | DP: ${dp} | GEX: ${G}\n\n${disc.en}`;
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
