// ============================================================================
// Realtime Content Helpers — Bluesky/Threads 실시간 포스팅 텍스트 생성
// compliance-safe, FOMO-triggering, 3 languages (EN/KO/JA)
// ============================================================================

import type { Lang } from '@/lib/marketing/hashtagEngine';
import { captureTemplate, type FormatType } from '@/lib/marketing/screenshotService';
import { getFromCache } from '@/services/redisClient';

export interface LiveMarketData {
  spy: number; spyChg: number; vix: number; vixChg: number;
  gex: string; dp: number; date: string;
}

// ---------------------------------------------------------------------------
// Fetch live market data from Redis
// ---------------------------------------------------------------------------
export async function fetchLiveMarketData(): Promise<LiveMarketData> {
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
  let dp = 0;
  try {
    const dpRaw = await getFromCache('yahoo:spy:darkpool').catch(() => null);
    if (dpRaw) {
      const d = typeof dpRaw === 'string' ? JSON.parse(dpRaw) : dpRaw;
      dp = d?.darkPoolPercent ?? d?.dp ?? 0;
    }
  } catch { /* optional */ }
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return {
    spy: spyData?.price ?? spyData?.last ?? 0,
    spyChg: spyData?.changePercent ?? spyData?.changePct ?? 0,
    vix: vixData?.price ?? vixData?.last ?? 0,
    vixChg: vixData?.changePercent ?? vixData?.changePct ?? 0,
    gex: gexStr, dp,
    date: etNow.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

// ---------------------------------------------------------------------------
// Text Builder — observation language only, no predictions
// ---------------------------------------------------------------------------
export function buildRealtimeText(
  ct: 'premarket' | 'intraday' | 'close' | 'structure' | 'afterhours' | 'recap' | 'asia_insight' | 'market_open' | 'asia_evening',
  plat: 'bluesky' | 'threads',
  lang: Lang,
  m: LiveMarketData,
): string {
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

  // ── BLUESKY (≤300 char, data-first — NO disclaimer here; dispatch adds CTA+tags) ──
  if (plat === 'bluesky') {
    if (ct === 'premarket') {
      return `📊 Pre-Market Structure | ${m.date}\n\nVIX: ${m.vix.toFixed(1)} (${vd}${m.vixChg.toFixed(1)}%)\nGEX: ${G} — ${gM}\n\nStructural positioning observed before the open.`;
    }
    if (ct === 'intraday') {
      return `⚡ Intraday Structure Update\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)}\nGEX: ${G} | DP: ${dp}\n\nInstitutional flow shifting in real-time.`;
    }
    if (ct === 'structure') {
      return `🏦 Mid-Session Structure | ${m.date}\n\nSPY: ${sd}${m.spyChg.toFixed(2)}%\nVIX: ${m.vix.toFixed(1)} | GEX: ${G}\nDark Pool: ${dp}\n\nWhere are dealers positioned right now?`;
    }
    if (ct === 'afterhours') {
      return `📋 Session Debrief | ${m.date}\n\nSPY closed: ${sd}${m.spyChg.toFixed(2)}%\nVIX: ${m.vix.toFixed(1)} | GEX: ${G}\nDP: ${dp}\n\nStructure doesn't lie. Tomorrow's setup starts here.`;
    }
    // close
    return `🔔 Session Close | ${m.date}\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)}\nGEX: ${G} | DP: ${dp}\n\nInstitutional positioning data finalized.`;
  }

  // ── THREADS (≤500 char, conversational, engagement question) ──
  if (ct === 'premarket') {
    if (lang === 'ko') return `좋은 아침입니다 👋\n\n장 오픈 전 구조 체크:\n• VIX ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\n데이터는 예측하지 않습니다. 하지만 기관이 어디에 포지셔닝하고 있는지를 보여줍니다.\n\n오늘 주목하는 지표가 있으신가요? 👇\n\n${disc.ko}`;
    if (lang === 'ja') return `おはようございます 👋\n\n構造チェック:\n• VIX ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\n機関のポジショニングを観察しています。\n\n注目する指標は？ 👇\n\n${disc.ja}`;
    return `Good morning 👋\n\nQuick pre-market structure check:\n• VIX at ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\nThe data doesn't predict. But it reveals where institutions are positioning.\n\nWhat are you watching today? 👇\n\n${disc.en}`;
  }
  if (ct === 'structure') {
    if (lang === 'ko') return `📊 장중 데이터 체크\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)}\n다크풀 활동: ${dp}\nGEX 레짐: ${G}\n\n가격만 보면 놓치는 것이 있습니다. 구조가 말하는 것을 읽어야 합니다.\n\n지금 가장 주목하는 지표는? 💬\n\n${disc.ko}`;
    if (lang === 'ja') return `📊 セッション中盤チェック\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)}\nダークプール: ${dp}\nGEX: ${G}\n\n価格だけでは見えないものがあります。構造を読むと見えてきます。\n\n注目指標は？ 💬\n\n${disc.ja}`;
    return `📊 Mid-session data check\n\nSPY ${sd}${m.spyChg.toFixed(2)}% | VIX ${m.vix.toFixed(1)}\nDark Pool: ${dp}\nGEX: ${G}\n\nPrice tells you what happened. Structure tells you why.\n\nWhat's catching your eye right now? 💬\n\n${disc.en}`;
  }
  if (ct === 'afterhours') {
    if (lang === 'ko') return `🌙 오늘의 세션 리캡\n\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 다크풀: ${dp}\n⚡ GEX: ${G}\n\n오늘 구조에서 가장 눈에 띄었던 것: 기관 포지셔닝이 가격보다 먼저 움직였습니다.\n\n내일 장을 위해 주목할 것은? 👇\n\n${disc.ko}`;
    if (lang === 'ja') return `🌙 本日のセッション振り返り\n\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 DP: ${dp}\n⚡ GEX: ${G}\n\n構造が価格に先行して動いた一日でした。\n\n明日のセッションで注目すべき点は？ 👇\n\n${disc.ja}`;
    return `🌙 Today's session in structure\n\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 Dark Pool: ${dp}\n⚡ GEX: ${G}\n\nInstitutional positioning moved before price did today.\n\nWhat are you watching for tomorrow? 👇\n\n${disc.en}`;
  }
  // ── ASIA DAYTIME: recap (KST 11:30 — 미국 세션 다음날 오전) ──
  if (ct === 'recap') {
    if (lang === 'ko') return `☕ 어젯밤 미국 시장 구조 리캡\n\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 다크풀: ${dp}\n⚡ GEX: ${G} — ${gM}\n\n밤새 기관은 무엇을 했을까요? 구조는 가격이 움직이기 전에 먼저 신호를 보냅니다.\n\n오늘 하루 주목할 레벨은? 💬\n\n${disc.ko}`;
    if (lang === 'ja') return `☕ 昨夜の米国市場構造レビュー\n\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 DP: ${dp}\n⚡ GEX: ${G} — ${gM}\n\n機関は夜間に何をしたのか？構造は価格の前にシグナルを送ります。\n\n今日注目すべきレベルは？ 💬\n\n${disc.ja}`;
    return `☕ Overnight US session recap\n\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 Dark Pool: ${dp}\n⚡ GEX: ${G} — ${gM}\n\nStructure sends signals before price moves.\n\nWhat levels are you watching today? 💬\n\n${disc.en}`;
  }
  // ── ASIA DAYTIME: insight (KST 14:00 — 오후 인사이트) ──
  if (ct === 'asia_insight') {
    const gexNote = m.gex === 'positive'
      ? (lang === 'ko' ? 'GEX가 양수라는 것은 딜러가 변동성을 억제하고 있다는 뜻입니다' : lang === 'ja' ? 'GEXがプラスということは、ディーラーがボラティリティを抑制中' : 'Positive GEX means dealers are suppressing volatility')
      : m.gex === 'negative'
      ? (lang === 'ko' ? 'GEX가 음수 — 딜러가 변동성을 증폭시키는 환경입니다' : lang === 'ja' ? 'GEXがマイナス — ディーラーがボラを増幅する環境' : 'Negative GEX — dealers amplifying volatility')
      : (lang === 'ko' ? 'GEX 중립 — 딜러 영향력이 약한 구간, 방향성이 불투명합니다' : lang === 'ja' ? 'GEX中立 — ディーラーの影響力が弱い区間' : 'Neutral GEX — dealer influence is minimal, direction unclear');
    if (lang === 'ko') return `💡 오늘의 구조 인사이트\n\n${gexNote}\n\nVIX ${m.vix.toFixed(1)} | DP ${dp}\n\n이 데이터를 보고 무엇이 떠오르시나요?\n→ 실시간 구조 분석: signumhq.com\n\n${disc.ko}`;
    if (lang === 'ja') return `💡 本日の構造インサイト\n\n${gexNote}\n\nVIX ${m.vix.toFixed(1)} | DP ${dp}\n\nこのデータから何が見えますか？\n→ リアルタイム構造分析: signumhq.com\n\n${disc.ja}`;
    return `💡 Today's structural insight\n\n${gexNote}\n\nVIX ${m.vix.toFixed(1)} | DP ${dp}\n\nWhat does this data tell you?\n→ Live structure analysis: signumhq.com\n\n${disc.en}`;
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
  // close (threads)
  if (lang === 'ko') return `장 마감 🔔\n\n오늘 구조가 보여준 것:\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 Dark Pool: ${dp}\n⚡ GEX: ${G}\n\n데이터는 예측하지 않지만, 기관의 포지셔닝을 드러냅니다.\n\n오늘 가장 인상적이었던 지표는? 👇\n\n${disc.ko}`;
  if (lang === 'ja') return `セッション終了 🔔\n\n本日の構造:\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 Dark Pool: ${dp}\n⚡ GEX: ${G}\n\nデータは予測しませんが、機関のポジショニングを明らかにします。\n\n今日最も印象的だった指標は？ 👇\n\n${disc.ja}`;
  return `Session wrap 🔔\n\nHere's what structure revealed today:\n📈 SPY: ${sd}${m.spyChg.toFixed(2)}%\n📊 VIX: ${m.vix.toFixed(1)}\n🏦 Dark Pool: ${dp}\n⚡ GEX: ${G}\n\nThe data doesn't predict, but it reveals positioning.\n\nWhat stood out to you today? 👇\n\n${disc.en}`;
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
