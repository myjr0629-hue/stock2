// ============================================================================
// Marketing V2 — Prepare: Event (실시간 이벤트 발행)
// event-detect에서 감지된 GEX Flip/Insider Trade 등 → 즉시 발행
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureImagesForSlot } from '../core/images';
import { buildHashtagMap } from '../core/hashtags';
import { DISCLAIMER, buildCta, applyCompliance } from '../core/compliance';
import { getFromCache } from '@/services/redisClient';

export interface EventInput {
  type: string;         // gex_shift, insider_trade, volume_spike, etc.
  ticker: string;
  event: string;        // "GEX Flip Negative", "NVDA CEO Sold $5M"
  magnitude?: number;   // 이벤트 크기 (0~100)
  details?: string;     // 추가 설명
}

export async function prepareEvent(opts: { date?: string; dryRun?: boolean; event?: EventInput } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  console.log(`[MktV2/Prepare/Event] Starting for ${date}...`);

  // 1. 이벤트 데이터: 직접 전달 또는 Redis에서 로드
  const event = opts.event || await loadEventFromRedis(date);
  if (!event) {
    throw new Error('[MktV2/Prepare/Event] No event data available');
  }

  console.log(`[MktV2/Prepare/Event] Type=${event.type} Ticker=${event.ticker} Event="${event.event}"`);

  // 2. Build text
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildEventText(lang, event, date);
  }

  // 3. Capture OG images
  const images = await captureImagesForSlot('event', {
    type: event.type,
    ticker: event.ticker,
    event: event.event,
  }, date, opts.dryRun);

  // 4. Hashtags
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

function buildEventText(lang: Lang, event: EventInput, date: string) {
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

  const dataLines: Record<Lang, string> = {
    en: `${event.event}${event.details ? `\n\n${event.details}` : ''}`,
    ko: `${event.event}${event.details ? `\n\n${event.details}` : ''}`,
    ja: `${event.event}${event.details ? `\n\n${event.details}` : ''}`,
  };

  const insights: Record<Lang, string> = {
    en: `Event detected in $${event.ticker} — institutional monitoring active.`,
    ko: `$${event.ticker}에서 이벤트 감지 — 기관 모니터링 활성.`,
    ja: `$${event.ticker}でイベント検出 — 機関モニタリング稼働中。`,
  };

  const cta = buildCta(lang, 'intel-guardian', 'event', 'twitter');

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(dataLines[lang]),
    insight: applyCompliance(insights[lang]),
    full: applyCompliance(`${headlines[lang]}\n\n${dataLines[lang]}\n\n${insights[lang]}`),
    disclaimer: DISCLAIMER[lang],
    cta: cta.display,
    ctaFull: cta.full,
  };
}
