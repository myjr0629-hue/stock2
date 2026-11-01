import { etClock, etDateOfIso, lastClosedSessionDate } from './marketSession';
import { sessionCloseMinutes } from './marketCalendar';

export type SelloffLocale = 'ko' | 'en' | 'ja';
export const SELLOFF_COPY = {
  ko: { title: '시장 급락 브리핑', why: '왜', earnings: '옵션 예상 범위를 벗어난 실적', expected: '예상', mine: '내 종목 다음 실적 예상폭' },
  en: { title: 'Market Selloff Briefing', why: 'Why', earnings: 'Earnings beyond the options-implied range', expected: 'Implied', mine: 'My stocks: next earnings implied move' },
  ja: { title: '市場急落ブリーフィング', why: '理由', earnings: 'オプションの想定範囲を超えた決算', expected: '想定', mine: 'マイ銘柄の次回決算の想定変動幅' },
} as const;

type Cash = { changePct?: number | null; sessionDate?: string | null; asOf?: string | null; price?: number | null };
type Factor = { chgPct?: number | null; marketTime?: string; status?: string; source?: string };
export type SelloffMacro = { indexBasis?: { cash?: { spx?: Cash; ndx?: Cash; nasdaq?: Cash } }; factors?: { sox?: Factor; vix?: Factor } };
/** at = 그 값의 관측 시각(ISO). 같은 칸의 두 기록이 겹치면 더 늦은 관측이 이긴다(인스턴스 간 낡은 사본 방지). */
export type SelloffChip = { name: string; pct: number; at?: string };
export type SelloffBrief = { date: string; chips: SelloffChip[] };

const NAMES = ['S&P 500', 'NASDAQ 100', 'SOX', 'VIX'] as const;
/** 나스닥 칸: ^NDX 현물 피드가 없을 때(현재 운영) 같은 응답의 종합 현물 ^IXIC 로 판정하고 «NASDAQ»으로 표기한다. */
const NASDAQ_COMPOSITE = 'NASDAQ';
const slotOf = (name: string): number => name === NASDAQ_COMPOSITE ? 1 : (NAMES as readonly string[]).indexOf(name);
/** S&P ≤ −1.5% · 나스닥(NDX, 없으면 종합) ≤ −2.0% · SOX ≤ −3.0% · VIX ≥ +10% */
const hit = (i: number, v: number | null) => v != null && (i === 3 ? v >= 10 : v <= [-1.5, -2, -3][i]);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const validIso = (iso: string | null | undefined, now: number): boolean => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) && ms <= now;
};
/**
 * 마감 관측인가. 현물(cash)은 저장소 공용 규칙(lib/marketIndexBasis isCashCloseObservation)과 같게 «마지막 1분봉 시작
 * 15:59(조기 폐장 12:59)»부터 인정한다 — 수집기가 종가 봉을 그 시각으로 보존하기 때문이다(buildMarketIndexBasis 가 이미 검증).
 * SOX·VIX 는 야후 체결 시각 그대로라 장중 마지막 틱(15:59:xx)을 종가로 오인하지 않게 마감 시각 이후만 인정한다.
 */
function closedAt(iso: string | null | undefined, date: string, now: number, graceMinutes: number): boolean {
  if (!validIso(iso, now) || etDateOfIso(iso) !== date) return false;
  return etClock(Date.parse(iso!)).minutes >= sessionCloseMinutes(date) - graceMinutes;
}

const newer = (a: SelloffChip, b: SelloffChip) => !!a.at && !!b.at && Date.parse(a.at) > Date.parse(b.at);
/** 같은 날짜(date)의 두 기록을 칸마다 합친다. 겹치면 관측 시각이 더 늦은 쪽, 같거나 모르면 a. */
export function mergeSelloffRecords(a: SelloffBrief | null | undefined, b: SelloffBrief | null | undefined, date: string): SelloffBrief | null {
  const x = sanitizeSelloff(a), y = sanitizeSelloff(b);
  const pick = (r: SelloffBrief | null, i: number) => r?.date === date ? r.chips.find(c => slotOf(c.name) === i) ?? null : null;
  const chips = [0, 1, 2, 3].flatMap(i => { const p = pick(x, i), q = pick(y, i); const c = p && q ? (newer(q, p) ? q : p) : p ?? q; return c ? [c] : []; });
  return chips.length ? { date, chips } : null;
}

/** 저장소 등 바깥에서 온 브리핑은 모양을 검사한 뒤에만 쓴다. */
export function sanitizeSelloff(x: unknown): SelloffBrief | null {
  const b = x as SelloffBrief | null;
  if (!b || typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Array.isArray(b.chips)) return null;
  const chips = b.chips.filter(c => c && slotOf(c.name) >= 0 && finite(c.pct))
    .map(c => typeof c.at === 'string' && Number.isFinite(Date.parse(c.at)) ? { name: c.name, pct: c.pct, at: c.at } : { name: c.name, pct: c.pct });
  return chips.length ? { date: b.date, chips } : null;
}

/**
 * 표시 창(코디네이터 11/2 결정): 카드는 «가장 최근에 끝난 정규장 세션 D»가 급락 조건을 만족했을 때,
 * D 마감부터 다음 정규장 마감까지(다음 날 장중 포함) 보인다. 다음 세션이 마감되면 D 가 바뀌어 사라진다.
 *
 * - 판정 값은 macro 응답 중 «D 마감 관측»(현물 indexBasis.cash, SOX·VIX factors)만 쓴다.
 * - 다음 정규장이 열리면 macro 의 값은 그날 장중 값으로 바뀐다 → D 의 값은 이 기기가 앞서 받은
 *   같은 D 브리핑(retained)으로만 채운다. D 마감 관측이 응답에 있으면 그 값이 언제나 우선이다.
 * - macro 가 없거나(요청 실패) 응답의 모든 관측 시각이 D 보다 오래됐거나 미래면 숨긴다.
 */
export function selloffEvaluate(input: { now: number; macro: SelloffMacro | null | undefined; retained?: SelloffBrief | null }): { brief: SelloffBrief | null; record: SelloffBrief | null } {
  const none = { brief: null, record: null };
  const { now, macro } = input;
  if (!macro || typeof macro !== 'object') return none;
  const date = lastClosedSessionDate(now);
  const spx = macro.indexBasis?.cash?.spx, ndx = macro.indexBasis?.cash?.ndx, ixic = macro.indexBasis?.cash?.nasdaq, sox = macro.factors?.sox, vix = macro.factors?.vix;
  const okFactor = (v?: Factor) => !!v && v.status === 'OK' && v.source !== 'FAIL';
  // 응답이 D 이후 시세를 담고 있는가 — 멈춘 피드(시각이 D 이전)는 보관본까지 숨긴다.
  const stamps = [spx?.asOf, ndx?.asOf, ixic?.asOf, okFactor(sox) ? sox!.marketTime : null, okFactor(vix) ? vix!.marketTime : null];
  if (!stamps.some(t => validIso(t, now) && (etDateOfIso(t) ?? '') >= date)) return none;
  const iso = (t: string) => new Date(Date.parse(t)).toISOString();
  const cash = (name: string, v?: Cash): SelloffChip | null => v && v.sessionDate === date && finite(v.price) && v.price > 0 && closedAt(v.asOf, date, now, 1) && finite(v.changePct) ? { name, pct: v.changePct, at: iso(v.asOf!) } : null;
  const factor = (name: string, v?: Factor): SelloffChip | null => okFactor(v) && closedAt(v!.marketTime, date, now, 0) && finite(v!.chgPct) ? { name, pct: v!.chgPct, at: iso(v!.marketTime!) } : null;
  const observed = [cash(NAMES[0], spx), cash(NAMES[1], ndx) ?? cash(NASDAQ_COMPOSITE, ixic), factor(NAMES[2], sox), factor(NAMES[3], vix)];
  const kept = sanitizeSelloff(input.retained);
  const fromKept = (i: number) => kept?.date === date ? kept.chips.find(c => slotOf(c.name) === i) ?? null : null;
  // 같은 칸: 이 응답의 D 마감 관측이 기본, 기록 쪽 관측 시각이 «더 늦을» 때만 기록이 이긴다(앞선 정정을 낡은 사본이 되돌리지 못하게).
  const slots = observed.map((o, i) => { const k = fromKept(i); return o && k ? (newer(k, o) ? k : o) : o ?? k; });
  const values = slots.map(o => o?.pct ?? null);
  const chips = slots.flatMap(o => o ? [o] : []);
  // 보관본은 «급락일 때만»이 아니라 D 의 최신 관측 전체다 — 정정돼 조건을 벗어나면 그 값으로 덮어써 다음 장중에 되살아나지 않는다.
  const record = chips.length ? { date, chips } : null;
  return { brief: record && values.some((v, i) => hit(i, v)) ? record : null, record };
}
export function selloffForDisplay(input: { now: number; macro: SelloffMacro | null | undefined; retained?: SelloffBrief | null }): SelloffBrief | null {
  return selloffEvaluate(input).brief;
}
/**
 * 서버 보관(macro 라우트): 다음 정규장 장중 «처음 여는 기기»도 D 카드를 보도록, D 마감 관측 기록을
 * Redis 한 키에 둔다(캐시 읽기·쓰기만, 공급사·AI 호출 0). 응답에 D 마감 관측이 있을 때만,
 * 기존 기록과 다를 때만 쓴다 — 정정값은 덮어쓰고, 개장 전 한 지표만 넘어가도 나머지는 기록이 잇는다.
 */
export const SELLOFF_RECORD_KEY = 'selloff:record:v1:';
export function mergeSelloffRecord(input: { now: number; macro: SelloffMacro | null | undefined; stored: SelloffBrief | null; storedKnown: boolean }): { record: SelloffBrief | null; write: boolean } {
  const date = lastClosedSessionDate(input.now);
  const stored = sanitizeSelloff(input.stored);
  const merged = selloffEvaluate({ now: input.now, macro: input.macro, retained: stored }).record;
  const own = selloffEvaluate({ now: input.now, macro: input.macro, retained: null }).record;
  const same = !!stored && stored.date === date && JSON.stringify(stored) === JSON.stringify(merged);
  return { record: merged, write: input.storedKnown && !!merged && !!own && !same };
}
export function selloffBrief(macro: SelloffMacro | null, now = Date.now(), retained: SelloffBrief | null = null): SelloffBrief | null {
  return selloffForDisplay({ now, macro, retained });
}
/** 렌더 시점 창 검사 — 상태에 남은 브리핑도 다음 세션 마감(= D 가 바뀌는 순간) 뒤엔 그리지 않는다. */
export function currentSelloff(brief: SelloffBrief | null, now = Date.now()): SelloffBrief | null {
  return brief?.date === lastClosedSessionDate(now) ? brief : null;
}

export async function readSelloffMacro(result: PromiseSettledResult<Response>, now = Date.now(), retained: SelloffBrief | null = null): Promise<{ macro: any; brief: SelloffBrief | null; record: SelloffBrief | null }> {
  try {
    if (result.status === 'fulfilled' && result.value.ok) {
      const macro = await result.value.json();
      // 서버 기록(같은 D)이 먼저, 없으면 이 기기 보관본.
      // 서버 기록과 이 기기 보관본을 칸마다 합친다 — 관측 시각이 늦은 쪽이 이긴다(어느 쪽도 무조건 우선하지 않음).
      const kept = mergeSelloffRecords(sanitizeSelloff(macro?.selloffRecord), retained, lastClosedSessionDate(now));
      return { macro, ...selloffEvaluate({ now, macro, retained: kept }) };
    }
  } catch { /* Failed or malformed responses invalidate the card. */ }
  return { macro: null, brief: null, record: null };
}

/** 기기 보관(D 의 최신 관측 기록, 급락 여부와 무관) — 다음 정규장 장중에도 D 판정을 잇기 위한 것뿐. 실패해도 화면은 macro 판정대로. */
export const SELLOFF_STORE_KEY = 'signum:selloff:v1';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
export function loadRetainedSelloff(store: Store): SelloffBrief | null {
  try { const raw = store?.getItem(SELLOFF_STORE_KEY); return raw ? sanitizeSelloff(JSON.parse(raw)) : null; } catch { return null; }
}
export function saveRetainedSelloff(store: Store, record: SelloffBrief | null): void {
  if (!record) return;
  try { store?.setItem(SELLOFF_STORE_KEY, JSON.stringify(record)); } catch { /* storage unavailable */ }
}

export function selloffPreviewParam(search: string, environment: string | undefined): string | null {
  return environment === 'development' ? new URLSearchParams(search).get('selloffPreview') : null;
}
const PREVIEW_BRIEF: SelloffBrief = { date: '2026-10-30', chips: [{ name: 'S&P 500', pct: -1.82 }, { name: 'NASDAQ', pct: -2.86 }, { name: 'SOX', pct: -7.2 }, { name: 'VIX', pct: 12.9 }] };
/** 개발용 미리보기(on/off)를 반영한 최종 표시 값. preview 는 selloffPreviewParam 을 거친 값(운영에선 늘 null). */
export function selloffShown(preview: string | null, brief: SelloffBrief | null, now = Date.now()): SelloffBrief | null {
  if (preview === 'off') return null;
  if (preview === 'on') return PREVIEW_BRIEF;
  return currentSelloff(brief, now);
}
export function scorecardWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
