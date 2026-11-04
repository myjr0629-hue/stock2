import { etClock, etDateOfIso, lastClosedSessionDate } from './marketSession';
import { sessionCloseMinutes } from './marketCalendar';

export type SelloffLocale = 'ko' | 'en' | 'ja';
export const SELLOFF_COPY = {
  ko: { title: '시장 급락 브리핑', chipsTitle: '반도체 급락 브리핑', why: '왜', earnings: '옵션 예상 범위를 벗어난 실적', expected: '예상', mine: '내 종목 다음 실적 예상폭' },
  en: { title: 'Market Selloff Briefing', chipsTitle: 'Chip Selloff Briefing', why: 'Why', earnings: 'Earnings beyond the options-implied range', expected: 'Implied', mine: 'My stocks: next earnings implied move' },
  ja: { title: '市場急落ブリーフィング', chipsTitle: '半導体急落ブリーフィング', why: '理由', earnings: 'オプションの想定範囲を超えた決算', expected: '想定', mine: 'マイ銘柄の次回決算の想定変動幅' },
} as const;

type Cash = { changePct?: number | null; sessionDate?: string | null; asOf?: string | null; price?: number | null };
type Factor = { level?: number | null; chgAbs?: number | null; chgPct?: number | null; marketTime?: string; status?: string; source?: string };
export type SelloffMacro = { fetchedAtET?: string; selloffReadAt?: string; indexBasis?: { cash?: { spx?: Cash; ndx?: Cash; nasdaq?: Cash } }; factors?: { sox?: Factor; vix?: Factor } };
/**
 * at = 그 값의 관측(체결) 시각 · rx = 그 값을 담은 macro 스냅샷의 생성 시각(fetchedAtET). 모두 ISO 정규형.
 * 스냅샷은 Redis 공용본 하나가 갱신되며 세대가 바뀌므로 rx 는 세대 순서다(인스턴스 메모리 사본만 ≤60초 늦다).
 * 같은 칸: SOX·VIX 의 0 롤을 제외하고 관측(at)이 늦은 쪽 → 같으면 rx 가 늦은 쪽.
 * 그래서 같은 시각 종가 정정(+12→+3→+12 포함)·등락률만 바뀐 정정·늦게 도착한 낡은 사본 모두 세대 순서대로 정리된다.
 */
export type SelloffChip = { name: string; pct: number; at?: string; rx?: string; level?: number; chgAbs?: number };
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

/** a 가 b 보다 «새» 관측인가 — redisClient SELLOFF_RECORD_LUA 의 newer 와 같은 규칙. */
const rolledZero = (a: SelloffChip, b: SelloffChip) =>
  (a.name === 'SOX' || a.name === 'VIX') && a.name === b.name && a.pct === 0 && (a.chgAbs == null || a.chgAbs === 0) && b.pct !== 0;
// 정상 0 정정도 기준가 롤과 구별할 수 없어 거부하며, 카드는 다음 정규장 마감에 자동 종료된다.
export function selloffChipNewer(a: SelloffChip, b: SelloffChip): boolean {
  if (rolledZero(a, b)) return false;
  if (!a.at) return false;
  if (!b.at) return true;
  if (a.at !== b.at) return a.at > b.at;
  return !!a.rx && (!b.rx || a.rx > b.rx);
}
const newer = selloffChipNewer;
const choose = (p: SelloffChip, q: SelloffChip) => newer(q, p) ? q : p;
const sameRecord = (a: SelloffBrief | null, b: SelloffBrief | null) =>
  JSON.stringify(a?.date) === JSON.stringify(b?.date) && JSON.stringify(a?.chips.map(c => [c.name, c.pct, c.at ?? null, c.rx ?? null, c.level ?? null, c.chgAbs ?? null])) === JSON.stringify(b?.chips.map(c => [c.name, c.pct, c.at ?? null, c.rx ?? null, c.level ?? null, c.chgAbs ?? null]));
/** 같은 날짜(date)의 두 기록을 칸마다 합친다. 겹치면 관측 시각이 더 늦은 쪽, 같거나 모르면 a. */
export function mergeSelloffRecords(a: SelloffBrief | null | undefined, b: SelloffBrief | null | undefined, date: string): SelloffBrief | null {
  const x = sanitizeSelloff(a), y = sanitizeSelloff(b);
  const pick = (r: SelloffBrief | null, i: number) => r?.date === date ? r.chips.find(c => slotOf(c.name) === i) ?? null : null;
  const chips = [0, 1, 2, 3].flatMap(i => { const p = pick(x, i), q = pick(y, i); const c = p && q ? choose(p, q) : p ?? q; return c ? [c] : []; });
  return chips.length ? { date, chips } : null;
}

/** 저장소 등 바깥에서 온 브리핑은 모양을 검사한 뒤에만 쓴다. */
export function sanitizeSelloff(x: unknown): SelloffBrief | null {
  const b = x as SelloffBrief | null;
  if (!b || typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Array.isArray(b.chips)) return null;
  const okIso = (t: unknown): t is string => typeof t === 'string' && Number.isFinite(Date.parse(t)) && new Date(t).toISOString() === t;
  const chips = b.chips.filter(c => c && slotOf(c.name) >= 0 && finite(c.pct))
    .map(c => ({ name: c.name, pct: c.pct, ...(okIso(c.at) ? { at: c.at } : {}), ...(okIso(c.rx) ? { rx: c.rx } : {}), ...(finite(c.level) ? { level: c.level } : {}), ...(finite(c.chgAbs) ? { chgAbs: c.chgAbs } : {}) }));
  return chips.length ? { date: b.date, chips } : null;
}

/**
 * 표시 창(코디네이터 11/2 결정): 카드는 «가장 최근에 끝난 정규장 세션 D»가 급락 조건을 만족했을 때,
 * D 마감부터 다음 정규장 마감까지(다음 날 장중 포함) 보인다. 다음 세션이 마감되면 D 가 바뀌어 사라진다.
 *
 * - 판정 값은 macro 응답 중 «D 마감 관측»(현물 indexBasis.cash, SOX·VIX factors)만 쓴다.
 * - 다음 정규장이 열리면 macro 의 값은 그날 장중 값으로 바뀐다 → D 의 값은 이 기기가 앞서 받은
 *   같은 D 브리핑(retained)으로만 채운다. D 마감 관측과 보관본은 관측 시각과 세대로 비교한다.
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
  // 세대(rx): factors(SOX·VIX)는 macro 본문 스냅샷 시각(fetchedAtET). 현물 indexBasis 는 macroHubProvider 가 요청마다
  // 캐시에서 새로 읽어 붙이므로(getMacroSnapshotSSOT) 서버가 응답에 찍은 읽은 시각(selloffReadAt)이 세대다.
  // 기기 시계는 쓰지 않는다 — 늦게 도착한 옛 응답은 옛 selloffReadAt 을 그대로 갖고 온다. 없으면 rx 없음(동시각 정정 경합에서 진다).
  const canon = (t: unknown): t is string => typeof t === 'string' && Number.isFinite(Date.parse(t)) && new Date(t).toISOString() === t;
  const rx = validIso(macro.fetchedAtET, now) ? { rx: iso(macro.fetchedAtET!) } : {};
  const cashRx = canon(macro.selloffReadAt) ? { rx: macro.selloffReadAt } : {};
  const cash = (name: string, v?: Cash): SelloffChip | null => v && v.sessionDate === date && finite(v.price) && v.price > 0 && closedAt(v.asOf, date, now, 1) && finite(v.changePct) ? { name, pct: v.changePct, at: iso(v.asOf!), ...cashRx } : null;
  const factor = (name: string, v?: Factor): SelloffChip | null => okFactor(v) && closedAt(v!.marketTime, date, now, 0) && finite(v!.chgPct) ? { name, pct: v!.chgPct, at: iso(v!.marketTime!), ...rx, ...(finite(v!.level) ? { level: v!.level } : {}), ...(finite(v!.chgAbs) ? { chgAbs: v!.chgAbs } : {}) } : null;
  const observed = [cash(NAMES[0], spx), cash(NAMES[1], ndx) ?? cash(NASDAQ_COMPOSITE, ixic), factor(NAMES[2], sox), factor(NAMES[3], vix)];
  const kept = sanitizeSelloff(input.retained);
  const fromKept = (i: number) => kept?.date === date ? kept.chips.find(c => slotOf(c.name) === i) ?? null : null;
  // 같은 칸: 보관본을 기존 값, 응답을 새 값으로 보고 관측 시각과 세대를 비교한다.
  const slots = observed.map((o, i) => { const k = fromKept(i); return o && k ? choose(k, o) : o ?? k; });
  const values = slots.map(o => o?.pct ?? null);
  const chips = slots.flatMap(o => o ? [o] : []);
  // 보관본은 «급락일 때만»이 아니라 D 의 최신 관측 전체다 — 정정돼 조건을 벗어나면 그 값으로 덮어써 다음 장중에 되살아나지 않는다.
  const record = chips.length ? { date, chips } : null;
  return { brief: record && values.some((v, i) => hit(i, v)) ? record : null, record };
}
/**
 * 카드 제목 — 지수(S&P·나스닥) 급락이나 VIX 급등이 걸렸을 때만 «시장 급락», SOX 하나만 걸린 날은 «반도체 급락».
 * (11/4: S&P +1.6%·나스닥 +1.4%·VIX −20% 인데 SOX −3.1% 하나로 «시장 급락»이 떴다 — 대표 11/5 지적)
 */
export function selloffTitleKey(brief: SelloffBrief): 'title' | 'chipsTitle' {
  const v = (i: number) => brief.chips.find(c => slotOf(c.name) === i)?.pct ?? null;
  return [0, 1, 3].some(i => hit(i, v(i))) ? 'title' : 'chipsTitle';
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
export function mergeSelloffRecord(input: { now: number; macro: SelloffMacro | null | undefined; stored: SelloffBrief | null; storedKnown: boolean }): { record: SelloffBrief | null; own: SelloffBrief | null; write: boolean; valueChanged: boolean } {
  const date = lastClosedSessionDate(input.now);
  const stored = sanitizeSelloff(input.stored);
  const merged = selloffEvaluate({ now: input.now, macro: input.macro, retained: stored }).record;
  // own = 이 응답의 D 마감 관측만. 저장소에는 own 만 보내고 합치기는 저장소 안(원자 EVAL)에서 한다.
  const own = selloffEvaluate({ now: input.now, macro: input.macro, retained: null }).record;
  const same = !!stored && stored.date === date && sameRecord(stored, merged);
  // 값(이름·등락률·관측 시각)이 바뀐 쓰기와 세대(rx)만 전진한 쓰기를 가른다 — 후자는 호출자가 빈도를 묶는다.
  const strip = (r: SelloffBrief | null) => r && { date: r.date, chips: r.chips.map(({ rx: _rx, ...c }) => c) };
  const valueChanged = !(stored && stored.date === date && sameRecord(strip(stored), strip(merged)));
  return { record: merged, own, write: input.storedKnown && !!merged && !!own && !same, valueChanged };
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
