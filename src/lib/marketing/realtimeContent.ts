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
  ct: 'premarket' | 'intraday' | 'close',
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
    // close
    return `🔔 Session Close | ${m.date}\n\nSPY: ${sd}${m.spyChg.toFixed(2)}% | VIX: ${m.vix.toFixed(1)}\nGEX: ${G} | DP: ${dp}\n\nInstitutional positioning data finalized.`;
  }

  // ── THREADS (≤500 char, conversational, engagement question) ──
  if (ct === 'premarket') {
    const volNote = m.vixChg > 0
      ? (lang === 'ko' ? '변동성 확대 중' : lang === 'ja' ? 'ボラティリティ拡大中' : 'volatility expanding')
      : (lang === 'ko' ? '변동성 축소 중' : lang === 'ja' ? 'ボラティリティ縮小中' : 'volatility compressing');
    if (lang === 'ko') return `좋은 아침입니다 👋\n\n장 오픈 전 구조 체크:\n• VIX ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\n데이터는 예측하지 않습니다. 하지만 기관이 어디에 포지셔닝하고 있는지를 보여줍니다.\n\n오늘 주목하는 지표가 있으신가요? 👇\n\n${disc.ko}`;
    if (lang === 'ja') return `おはようございます 👋\n\n構造チェック:\n• VIX ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\n機関のポジショニングを観察しています。\n\n注目する指標は？ 👇\n\n${disc.ja}`;
    return `Good morning 👋\n\nQuick pre-market structure check:\n• VIX at ${m.vix.toFixed(1)} — ${volNote}\n• GEX ${G} — ${gM}\n\nThe data doesn't predict. But it reveals where institutions are positioning.\n\nWhat are you watching today? 👇\n\n${disc.en}`;
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
