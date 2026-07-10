// ============================================================================
// Marketing V2 — Prepare: Event (실시간 이벤트 발행)
// event-detect에서 감지된 GEX Flip/Insider Trade 등 → AI 분석 → 즉시 발행
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureImagesForSlot } from '../core/images';
import { buildHashtagMap } from '../core/hashtags';
import { DISCLAIMER, applyCompliance } from '../core/compliance';
import { getFromCache } from '@/services/redisClient';

export interface EventInput {
  type: string;         // gex_shift, insider_trade, volume_spike, etc.
  ticker: string;
  event: string;        // "GEX Flip Negative", "NVDA CEO Sold $5M"
  magnitude?: number;   // 이벤트 크기 (0~100)
  details?: string;     // 추가 설명
}

interface AiEventAnalysis { en: string; ko: string; ja: string; }

export async function prepareEvent(opts: { date?: string; dryRun?: boolean; event?: EventInput } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  console.log(`[MktV2/Prepare/Event] Starting for ${date}...`);

  // 1. 이벤트 데이터: 직접 전달 또는 Redis에서 로드
  const event = opts.event || await loadEventFromRedis(date);
  if (!event) {
    throw new Error('[MktV2/Prepare/Event] No event data available');
  }

  console.log(`[MktV2/Prepare/Event] Type=${event.type} Ticker=${event.ticker} Event="${event.event}"`);

  // 2. AI 맞춤 분석 + 번역 생성
  const aiAnalysis = await generateEventAnalysis(event);
  console.log(`[MktV2/Prepare/Event] AI Analysis: ${aiAnalysis.en ? 'OK' : 'FALLBACK'}`);

  // 3. Build text
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildEventText(lang, event, date, aiAnalysis);
  }

  // 4. Capture OG images
  const images = await captureImagesForSlot('event', {
    type: event.type,
    ticker: event.ticker,
    event: event.event,
  }, date, opts.dryRun);

  // 5. Hashtags
  const hashtags = buildHashtagMap('event', ALL_LANGS, ALL_PLATFORMS, [event.ticker]);

  const pkg: ContentPackage = {
    slot: 'event',
    date,
    preparedAt: new Date().toISOString(),
    images,
    text,
    metrics: {
      type: event.type,
      ticker: event.ticker,
      event: event.event,
      magnitude: event.magnitude || 0,
    },
    hashtags,
  };

  await storeContentPackage(pkg);
  console.log(`[MktV2/Prepare/Event] ✅ Package stored: ${event.type}/${event.ticker}`);
  return pkg;
}

async function loadEventFromRedis(date: string): Promise<EventInput | null> {
  try {
    const raw = await getFromCache(`event:latest:${date}`);
    if (!raw) return null;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      type: data.type || data.eventType || 'unknown',
      ticker: data.ticker || data.symbol || 'SPY',
      event: data.event || data.title || data.description || '',
      magnitude: data.magnitude || data.severity || 0,
      details: data.details || data.analysis || '',
    };
  } catch {
    return null;
  }
}

// ── Bedrock AI 이벤트 분석 + 3개국어 생성 ──
async function generateEventAnalysis(event: EventInput): Promise<AiEventAnalysis> {
  const empty: AiEventAnalysis = { en: '', ko: '', ja: '' };
  try {
    const { callBedrock, MODELS } = await import('@/services/bedrockClient');

    const prompt = `You are an institutional market event analyst. Analyze the following market event.

EVENT:
- Type: ${event.type}
- Ticker: $${event.ticker}
- Event: ${event.event}
- Magnitude: ${event.magnitude || 'N/A'}/100
- Details: ${event.details || 'N/A'}

RULES:
1. Observation only — NO predictions, NO financial advice
2. Explain WHY this event matters institutionally (impact on options, hedging, volatility)
3. Each language must be STANDALONE, natural, and fluent — not machine-translated
4. Korean: 자연스러운 한국어, 전문 투자 용어 사용
5. Japanese: 自然な日本語、専門用語を使用
6. 2-3 sentences per language, institutional grade
7. Output ONLY valid JSON

Output: {"en":"English 2-3 sentences","ko":"한국어 2-3문장","ja":"日本語2-3文"}`;

    const result = await callBedrock({
      modelId: MODELS.HAIKU_35,
      system: 'You are a Bloomberg-tier institutional event analyst. Output JSON only.',
      userPrompt: prompt,
      maxTokens: 800,
      temperature: 0.3,
      timeoutMs: 20000,
      jsonPrefill: true,
      label: `MktV2-Event-${event.ticker}`,
    });

    const enM = result.text.match(/"en"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const koM = result.text.match(/"ko"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const jaM = result.text.match(/"ja"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    return {
      en: enM ? enM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '',
      ko: koM ? koM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '',
      ja: jaM ? jaM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '',
    };
  } catch (err) {
    console.error(`[MktV2/Event] AI analysis failed for ${event.ticker}:`, err);
    return empty;
  }
}

function buildEventText(lang: Lang, event: EventInput, date: string, aiAnalysis: AiEventAnalysis) {
  const typeLabels: Record<string, Record<Lang, string>> = {
    gex_shift: { en: '🔮 GEX Regime Shift', ko: '🔮 GEX 레짐 전환', ja: '🔮 GEXレジーム転換' },
    insider_trade: { en: '👤 Insider Trade Alert', ko: '👤 내부자 거래 감지', ja: '👤 インサイダー取引検出' },
    volume_spike: { en: '📈 Volume Spike', ko: '📈 거래량 급증', ja: '📈 出来高急増' },
    default: { en: '⚡ Market Event', ko: '⚡ 시장 이벤트', ja: '⚡ マーケットイベント' },
  };

  const label = typeLabels[event.type] || typeLabels.default;

  const headlines: Record<Lang, string> = {
    en: `${label.en} — $${event.ticker}`,
    ko: `${label.ko} — $${event.ticker}`,
    ja: `${label.ja} — $${event.ticker}`,
  };

  // 이벤트 본문도 AI가 번역한 insight를 사용
  const eventDesc: Record<Lang, string> = {
    en: event.event,
    ko: event.event, // 영어 이벤트명은 그대로 (GEX Flip 등 전문 용어)
    ja: event.event,
  };

  // AI 분석 우선, fallback으로 기본 문장
  const fallback: Record<Lang, string> = {
    en: `Event detected in $${event.ticker} — institutional monitoring active.`,
    ko: `$${event.ticker}에서 이벤트 감지 — 기관 모니터링 활성.`,
    ja: `$${event.ticker}でイベント検出 — 機関モニタリング稼働中。`,
  };

  const insight = aiAnalysis[lang] || (lang === 'ja' ? aiAnalysis.ko : '') || fallback[lang];

  // CTA: app-first funnel — /app smart link (?from= tag for install attribution)
  const ctaUrl = 'https://www.signumhq.com/app?from=event';
  const ctaLabels: Record<Lang, string> = {
    en: `📱 Track $${event.ticker} in the free app → ${ctaUrl}`,
    ko: `📱 무료 앱에서 $${event.ticker} 추적 → ${ctaUrl}`,
    ja: `📱 無料アプリで$${event.ticker}を追跡 → ${ctaUrl}`,
  };

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(eventDesc[lang]),
    insight: applyCompliance(insight),
    full: applyCompliance(`${headlines[lang]}\n\n${eventDesc[lang]}\n\n🎯 ${insight}`),
    disclaimer: DISCLAIMER[lang],
    cta: ctaLabels[lang],
    ctaFull: ctaUrl,
  };
}
