// ============================================================================
// whyBuilder — 급변동에 «왜»를 붙인다. 단, 인과를 단정하지 않는다.
// ----------------------------------------------------------------------------
// 🚫 절대 규칙 — 병렬 서술
//   ❌ "제조업 확장 발표로 경기 회복력을 시사하며 나스닥 +1.11% 상승"
//   ✅ "나스닥 +1.11%. 같은 시간대에 ISM 제조업 확장 발표가 나왔다."
//   전자는 «검증 불가능한 인과 주장»이다. 틀리면 신뢰를 잃고 금융 콘텐츠로 위험하다.
//   (BUFFER_OPS §0-7 예측 프레이밍 금지와 같은 계열)
//
// 📌 대표 지적(2026-08-03): "발표가 나고 여러 뉴스에서 같이 나온다면 그 해석은 중요하다."
//   맞다. 그래서 «교차확인(corroboration)»을 점수로 만든다 —
//   서로 다른 출처가 같은 창에서 같은 방향을 말할수록 해석의 신뢰도가 올라간다.
//   한 곳만 말하면 SINGLE, 여러 곳이 말하면 CORROBORATED로 라벨을 붙여
//   «우리가 얼마나 확신하는지»를 사용자에게 그대로 보여준다. 숨기지 않는다.
//
// 💰 비용: AI 재호출 0.
//   news-digest가 이미 3언어 요약·해석을 들고 있다(NewsDigestItem.summaryKR/EN/JP).
//   여기서 다시 LLM을 부르면 비용도 들고, 무엇보다 «영어 폴백 오염» 버그
//   (메모리: ai-localization-silent-english-fallback)를 새 경로에 다시 열게 된다.
//   이미 현지화된 필드를 조립만 한다.
// ============================================================================

import { getFromCache } from '@/services/redisClient';
import type { NewsDigest, NewsDigestItem } from '@/app/api/guardian/news-digest/route';
import type { MoveSignal } from './detectMove';

const NEWS_KEY = 'guardian:news:digest:v2';
const CAL_KEY = 'fmp:econ-calendar';

/** 움직임 시각 기준 몇 분 전까지의 뉴스를 «같은 시간대»로 볼 것인가 */
const NEWS_LOOKBACK_MIN = 45;
/** 지표 발표는 앞뒤로 본다 — 발표 직전 포지셔닝도 움직임을 만든다 */
const CAL_WINDOW_MIN = 30;

export type Locale = 'ko' | 'en' | 'ja';
export type Confidence = 'CORROBORATED' | 'SINGLE' | 'NONE';

export interface WhyContext {
  /** 같은 시간대 뉴스 (최신순, 최대 3건) */
  news: Array<{
    headline: string;
    summary: string;
    source: string;
    publishedAtET: string;
    ageMinutes: number;
    impact: NewsDigestItem['impact'];
    category: NewsDigestItem['category'];
  }>;
  /** 같은 시간대 경제지표 발표 */
  calendar: Array<{ event: string; actual?: string; forecast?: string; time?: string }>;
  /** 교차확인 수준 — 같은 방향을 말한 «서로 다른 출처» 수에서 나온다 */
  confidence: Confidence;
  corroborationCount: number;
  /** 뉴스가 가리키는 방향이 가격 방향과 맞는가 (참고용, 단정 아님) */
  newsAligned: boolean | null;
}

interface CalEvent { event?: string; date?: string; actual?: string; estimate?: string; forecast?: string; country?: string }

function pickSummary(item: NewsDigestItem, loc: Locale): string {
  const v = loc === 'ko' ? item.summaryKR : loc === 'ja' ? item.summaryJP : item.summaryEN;
  return (v || item.summaryEN || item.headline || '').trim();
}

/**
 * 신호 시각 주변의 «동시 발생 사실»을 모은다. 해석하지 않는다 — 모으기만 한다.
 */
export async function buildWhyContext(signal: MoveSignal, loc: Locale): Promise<WhyContext> {
  const at = new Date(signal.atISO).getTime();

  const [digest, cal] = await Promise.all([
    getFromCache<NewsDigest>(NEWS_KEY).catch(() => null),
    getFromCache<{ events?: CalEvent[] }>(CAL_KEY).catch(() => null),
  ]);

  // ── 같은 시간대 뉴스 ────────────────────────────────────────────────────
  const inWindow = (digest?.items ?? []).filter((it) => {
    const t = Date.parse(it.publishedAt);
    if (!Number.isFinite(t)) return false;
    const minsBefore = (at - t) / 60000;
    return minsBefore >= 0 && minsBefore <= NEWS_LOOKBACK_MIN;
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const news = inWindow.slice(0, 3).map((it) => ({
    headline: it.headline,
    summary: pickSummary(it, loc),
    source: it.source,
    publishedAtET: it.publishedAtET,
    ageMinutes: Math.round((at - Date.parse(it.publishedAt)) / 60000),
    impact: it.impact,
    category: it.category,
  }));

  // ── 교차확인 ────────────────────────────────────────────────────────────
  // 같은 방향(impact)을 말한 «서로 다른 출처»가 몇 곳인가.
  // 같은 매체가 3번 쓴 건 1곳으로 센다 — 그래야 "여러 곳이 말한다"가 의미를 갖는다.
  const up = signal.changePct > 0;
  const agreeing = inWindow.filter((it) =>
    (up && it.impact === 'BULLISH') || (!up && it.impact === 'BEARISH'));
  const distinctSources = new Set(agreeing.map((it) => (it.source || '').toLowerCase().trim()));
  const corroborationCount = distinctSources.size;

  const confidence: Confidence =
    corroborationCount >= 2 ? 'CORROBORATED'
      : (corroborationCount === 1 || inWindow.length > 0) ? 'SINGLE'
        : 'NONE';

  // ── 같은 시간대 경제지표 ────────────────────────────────────────────────
  const calendar = (cal?.events ?? []).filter((e) => {
    const t = e.date ? Date.parse(e.date) : NaN;
    if (!Number.isFinite(t)) return false;
    return Math.abs(at - t) / 60000 <= CAL_WINDOW_MIN;
  }).slice(0, 2).map((e) => ({
    event: e.event || '',
    actual: e.actual,
    forecast: e.estimate ?? e.forecast,
    time: e.date,
  }));

  const newsAligned = inWindow.length === 0 ? null : corroborationCount > 0;

  return { news, calendar, confidence, corroborationCount, newsAligned };
}

// ── 문구 조립 ───────────────────────────────────────────────────────────────
// 전부 병렬 서술. "~때문에", "~로 인해", "~를 시사하며" 금지.

const T: Record<Locale, Record<string, string>> = {
  ko: {
    spikeUp: '급등', spikeDown: '급락',
    revUp: '하락하다 급반등', revDown: '상승하다 급반락',
    sameWindow: '같은 시간대',
    noTrigger: '뚜렷한 촉발 뉴스 없음',
    volume: '거래량', times: '배',
    corroborated: '복수 매체가 같은 내용을 보도',
    single: '단일 보도',
    reversalFrom: '직전',
  },
  en: {
    spikeUp: 'jumped', spikeDown: 'dropped',
    revUp: 'reversed higher after falling', revDown: 'reversed lower after rising',
    sameWindow: 'In the same window',
    noTrigger: 'No clear news trigger',
    volume: 'Volume', times: 'x',
    corroborated: 'Multiple outlets reported the same',
    single: 'Single report',
    reversalFrom: 'prior leg',
  },
  ja: {
    spikeUp: '急騰', spikeDown: '急落',
    revUp: '下落から急反発', revDown: '上昇から急反落',
    sameWindow: '同じ時間帯',
    noTrigger: '明確なきっかけとなるニュースなし',
    volume: '出来高', times: '倍',
    corroborated: '複数メディアが同内容を報道',
    single: '単独報道',
    reversalFrom: '直前',
  },
};

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/**
 * 알림 본문 / 카드 요약 — 한 줄.
 * [FIX 2026-08-03] 1차 구현에 결함 셋이 있었다:
 *   ① 일본어가 한국어 분기를 타고 문자열 치환으로 때워졌다
 *   ② 영어 문장에 창 길이 30이 하드코딩(TUNING과 어긋날 수 있다)
 *   ③ 어순이 어색했다 — "NVDA 30분 +3.35% 급등"
 * 언어별로 따로 쓴다. 문장은 각 언어에서 «자연스러운 어순»을 따른다.
 */
export function buildHeadline(signal: MoveSignal, loc: Locale, windowMin = 30): string {
  const t = T[loc];
  const s = signal.symbol;
  const p = pct(signal.changePct);
  const up = signal.changePct > 0;

  if (signal.kind === 'REVERSAL') {
    if (loc === 'ko') return `${s} ${up ? '하락세 뒤집고' : '상승세 꺾이며'} ${windowMin}분간 ${p}`;
    if (loc === 'ja') return `${s} ${up ? '下落から反転' : '上昇から反落'}、${windowMin}分で ${p}`;
    return `${s} ${up ? 'reversed higher' : 'reversed lower'} — ${p} in ${windowMin} min`;
  }
  if (loc === 'ko') return `${s} ${windowMin}분간 ${p} ${up ? t.spikeUp : t.spikeDown}`;
  if (loc === 'ja') return `${s} ${windowMin}分で ${p} ${up ? t.spikeUp : t.spikeDown}`;
  return `${s} ${up ? t.spikeUp : t.spikeDown} ${p} in ${windowMin} min`;
}

/**
 * 카드/전문에 쓰는 «왜» 2~3문장. 전부 병렬 서술.
 * 뉴스가 없으면 «없다는 사실»을 데이터로 대신 보여준다 — 그게 우리 차별점이다.
 */
export function buildWhyText(signal: MoveSignal, ctx: WhyContext, loc: Locale): string {
  const t = T[loc];
  const parts: string[] = [];

  if (signal.kind === 'REVERSAL' && signal.priorPct != null) {
    parts.push(loc === 'en'
      ? `${t.reversalFrom} ${pct(signal.priorPct)}, then ${pct(signal.changePct)}.`
      : `${t.reversalFrom} ${pct(signal.priorPct)} → ${pct(signal.changePct)}.`);
  }

  if (ctx.news.length > 0) {
    const heads = ctx.news.slice(0, 2).map((n) => n.headline).join(' · ');
    parts.push(`${t.sameWindow}: ${heads}`);
    parts.push(ctx.confidence === 'CORROBORATED'
      ? `${t.corroborated} (${ctx.corroborationCount})`
      : t.single);
  } else if (ctx.calendar.length > 0) {
    parts.push(`${t.sameWindow}: ${ctx.calendar.map((c) => c.event).join(' · ')}`);
  } else {
    // 뉴스 없는 급변동은 실제로 많다(수급·만기·기계적 매매).
    // «없다»를 숨기지 않고 우리 데이터로 대신 말한다.
    parts.push(`${t.noTrigger}. ${t.volume} ${signal.volumeMult.toFixed(1)}${t.times}, ${signal.sigmaMult.toFixed(1)}σ`);
  }

  return parts.join(' ');
}
