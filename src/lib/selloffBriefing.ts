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
/**
 * 카드의 «왜» 한 줄(대표 11/6 승인 — 급락 카드가 뜬 날만). 7d2b2a110 의 줄은 c51dade35 에서 «카드 안 새 요청은 읽기 전용 캐시만»
 * 규칙 때문에 빠졌다. 지금 /api/intel/cross-sector-brief?date=D 는 저장본만 읽고 없으면 404 — 생성·공급사 호출이 없다(그 시험 아래).
 * 원칙: 같은 세션(D) 서사만 · 문장은 리포트 그대로(새 원인 생성 0) · 카드 칩과 숫자가 어긋나면 서사를 버린다 · 없으면 칩 숫자만으로 사실 한 줄.
 */
export type SelloffReport = { status: 'ok'; json: unknown } | { status: 'missing' } | { status: 'error' } | null;
export type SelloffReportOutcome = { kind: 'ok'; json: unknown } | { kind: 'http'; status: number } | { kind: 'network' } | { kind: 'bad-json' };
/**
 * 리포트 요청 결과 → 카드 상태. 서버가 «지금 서빙하지 않음»을 말한 응답(404·그 밖의 4xx·깨진 본문)은 받아 둔 서사도 내린다.
 * 일시 장애(5xx·네트워크)만 직전 상태를 유지한다(관문 11061039·11061042). 순서 역전은 호출부가 요청 번호로 막는다.
 */
export function nextSelloffReport(prev: SelloffReport, o: SelloffReportOutcome): SelloffReport {
  if (o.kind === 'ok') return { status: 'ok', json: o.json };
  if (o.kind === 'network' || (o.kind === 'http' && o.status >= 500)) return prev ?? { status: 'error' };
  return { status: 'missing' };
}
const SCRIPT_OK: Record<SelloffLocale, (s: string) => boolean> = {
  ko: s => /[가-힣]/.test(s),
  ja: s => /[぀-ヿ一-鿿]/.test(s) && !/[가-힣]/.test(s),
  en: s => !/[가-힣぀-ヿ一-鿿]/.test(s),
};
/** 마침표가 문장 끝이 아닌 약어(«U.S.»·«e.g.»·«Inc.» 등) — 관문 11061045. */
const ABBREV = /(?:^|\s)(?:(?:[A-Za-z]\.)*[A-Za-z]|Inc|Corp|Co|Ltd|vs|etc|Mr|Mrs|Ms|Dr|St|Jr|Sr|No|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/;
/** 첫 문장. 약어의 마침표·너무 짧은 조각(25자 미만)에서는 끊지 않는다. 문장 끝이 없으면 전체 — 카드 CSS 가 2줄로 자른다. */
export function firstSentence(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  const re = /[.!?](?=\s)|[。！？]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (s[m.index] === '.' && ABBREV.test(s.slice(0, m.index))) continue;
    if (m.index + 1 >= 25) return s.slice(0, m.index + 1);
  }
  return s;
}
/** 지수 이름 — 지수의 크기·방향은 칩이 말한다. «왜» 줄은 원인 문장만 싣는다. */
const INDEX_NAME = /s&p|nasdaq|나스닥|ナスダック|\bsox\b|필라델피아 반도체|フィラデルフィア半導体|philadelphia semiconductor|\bvix\b|\bdow\b|다우|ダウ|russell|러셀|ラッセル|코스피|kospi|日経|nikkei|\bindex|\bindices|지수|指数/i;
/** 매도·하락 신호 — 급락 카드의 원인 문장이면 반드시 하나는 있다(11/5 실문장: 매도세·selling·売り). */
const SELL = /\bsell|\bsold\b|\bdeclin|\bdrop|\bfell\b|\bfall|\bslid|\bslump|\bplung|\btumbl|\bsank|\bweak|\blosses\b|\bdown(?:turn|grade)?\b|risk[- ]off|risk aversion|매도|하락|약세|급락|밀렸|밀린|떨어|손실|위험 회피|売り|下落|急落|下げ|軟調|リスク回避|安/i;
/** 오름·매수 낱말 — 하나라도 있으면 칩과 어긋날 수 있다. */
const UP = /\b(?:up\b|surg|soar|jump|rall(?:y|ied|ies)|rose|rise[sn]?\b|rising|gain|climb|rebound|recover|advanc|higher|spik|increas|eas(?:e|ed|es|ing)\b|uptick|bounc|bought|buy|bull|strong(?:er)?\b|record high|positive)|상승|급등|반등|올랐|오른|오름|오르|강세|치솟|매수|사상 최고|회복|완화|늘었|증가|上昇|急騰|反発|上げ|高騰|続伸|買い|強気|最高値|回復|和らい|一服|増加|持ち直/i;
/**
 * 서사 첫 문장이 카드 칩과 어긋날 수 있으면 true → 서사를 쓰지 않고 칩 숫자 사실 한 줄로 간다(틀린 문장보다 덜 말하는 쪽).
 * 거부 목록만으로는 새는 표현이 끝없어서(관문 11061022·11061030·11061045) 허용 조건을 건다:
 * ① % 기호·수치 주장 없음(날짜·시각만 허용) ② 지수 이름 없음(대소문자 무관 — 지수 방향·크기 주장 자체를 싣지 않는다) ③ 매도·하락 신호가 있어야 함 ④ 오름·매수·완화 낱말 없음.
 */
/** 수치 주장 — 날짜(2026-11-05)·시각(13:02)·«24/7» 외의 숫자, 비율·포인트 낱말. 크기는 칩이 말한다. */
const NUMBER_CLAIM = (t: string) => /\d/.test(t.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\b|\b24\/7\b/g, '')) || /percent|per cent|\bbps?\b|basis point|\bpoints?\b|퍼센트|포인트|프로|パーセント|ポイント|割/i.test(t);
export function contradictsChips(sentence: string, _brief?: SelloffBrief): boolean {
  return /[%％]/.test(sentence) || NUMBER_CLAIM(sentence) || INDEX_NAME.test(sentence) || !SELL.test(sentence) || UP.test(sentence);
}
/**
 * 원인 표식: 리포트 규칙상 «왜»는 같은 세션에 일치한 후보이지 확정 원인이 아니다. 유보 문장이 어떤 표현으로 오든(관문 11061030)
 * 첫 문장만 잘라 보이면 단정처럼 읽히므로 늘 «원인 후보 ·»를 앞에 붙인다 — 2줄 말줄임에도 잘리지 않는 자리.
 */
export const SELLOFF_HEDGE_TAG: Record<SelloffLocale, string> = { ko: '원인 후보 · ', en: 'Possible cause · ', ja: '要因候補 · ' };
/** 장마감 리포트 응답에서 같은 세션 «왜» 첫 문장. 날짜·성공·출처·생성 시각(마감 뒤)·문자 체계·칩 일치가 모두 맞을 때만. */
export function selloffWhyFromReport(json: unknown, brief: SelloffBrief, loc: SelloffLocale): string | null {
  const j = json as { success?: unknown; date?: unknown; source?: unknown; generatedAt?: unknown; structured?: { closingNarrative?: { why?: Record<string, unknown> } } } | null;
  if (!j || j.success !== true || j.date !== brief.date || typeof j.source !== 'string' || !j.source) return null;
  if (typeof j.generatedAt === 'string') {
    const ms = Date.parse(j.generatedAt);
    // D 마감 전에 만든 글은 그 세션을 담지 못한다.
    if (!Number.isFinite(ms)) return null;
    const day = etDateOfIso(j.generatedAt) ?? '';
    if (day < brief.date || (day === brief.date && etClock(ms).minutes < sessionCloseMinutes(brief.date))) return null;
  }
  const raw = j.structured?.closingNarrative?.why?.[loc];
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const sentence = firstSentence(raw);
  if (!SCRIPT_OK[loc](sentence) || contradictsChips(sentence, brief)) return null;
  return `${SELLOFF_HEDGE_TAG[loc]}${sentence}`;
}
const FALLBACK = {
  ko: { sox: '반도체(SOX)', most: '로 낙폭이 가장 컸습니다', one: ' 하락', vix: ' 급등' },
  en: { sox: 'Chips (SOX)', most: ', the steepest drop', one: ' down', vix: ' spike' },
  ja: { sox: '半導体(SOX)', most: 'で下げ幅が最大でした', one: ' 下落', vix: ' 急騰' },
} as const;
/**
 * 서사가 없을 때: 카드 칩 숫자만으로 사실 한 줄(원인 추정 0).
 * «리포트 준비 중» 같은 상태 문구는 붙이지 않는다 — 날짜 GET 의 404 는 미생성·서빙 가드 탈락·저장소 장애를 구별하지 못한다(관문 11061022·11061037).
 */
export function selloffWhyFallback(brief: SelloffBrief, loc: SelloffLocale): string | null {
  const f = FALLBACK[loc];
  const label = (name: string) => name === 'SOX' ? f.sox : name;
  const drops = brief.chips.filter(c => c.name !== 'VIX' && c.pct < 0).sort((a, b) => a.pct - b.pct);
  const vix = brief.chips.find(c => c.name === 'VIX' && c.pct > 0);
  const fact = drops.length >= 2 ? `${label(drops[0].name)} ${signedPct(drops[0].pct)}${f.most}`
    : drops.length === 1 ? `${label(drops[0].name)} ${signedPct(drops[0].pct)}${f.one}`
    : vix ? `VIX ${signedPct(vix.pct)}${f.vix}` : null;
  return fact;
}
/** 카드에 그릴 «왜» 줄 — 같은 세션 서사 → 없으면(읽는 중·404·실패·검사 탈락) 사실 한 줄. 읽는 중에도 사실 줄로 자리를 지켜 높이 출렁임을 줄인다. */
export function selloffWhyLine(brief: SelloffBrief, loc: SelloffLocale, report: SelloffReport): { text: string; source: 'narrative' | 'fallback' } | null {
  const narrative = report?.status === 'ok' ? selloffWhyFromReport(report.json, brief, loc) : null;
  if (narrative) return { text: narrative, source: 'narrative' };
  const fb = selloffWhyFallback(brief, loc);
  return fb ? { text: fb, source: 'fallback' } : null;
}
export function scorecardWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
