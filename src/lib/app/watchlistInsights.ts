// ============================================================================
// «내 종목» 행의 판정 — 레벨 정의 검사 · 신선도 · 지도 기하 · 인사이트 칩 고르기
// ----------------------------------------------------------------------------
// 순수 함수만 둔다(네트워크·DOM 없음). 시험: tests/watchlistInsights.test.ts
//
// ★ 숫자를 지어내지 않는다(대표 교리 · 기획서 8절).
//   배치 API 의 레벨이 정의를 벗어난 종목이 실측됐다(9/28 MU 풋플로어 60·감마플립 530·
//   콜월이 현재가 아래, TSLA 풋플로어 200·감마플립 280). 서버 수리(fix/levels-one-door-gate)가
//   따로 진행 중이지만, 화면은 «그것과 무관하게» 스스로 검사한다:
//     콜월 ∈ (S, 1.2S] · 풋플로어 ∈ [0.8S, S) · 감마플립 |K−S| ≤ 0.15S · 맥스페인 |K−S| ≤ 0.20S
//   하나라도 어기면(레벨은 한 벌이다) 지도를 숨기고 «레벨 갱신 대기»를 그린다.
//   레벨이 오래됐으면(체인 판본이 기대 날짜보다 앞) 역시 숨긴다.
//   보여 줄 사실이 하나도 없으면 칩 줄을 통째로 숨긴다.
// ============================================================================

import { isNonTradingDay } from '@/lib/marketCalendar';

export type WlLocale = 'ko' | 'en' | 'ja';
export const toWlLocale = (l: string | null | undefined): WlLocale => (l === 'ko' || l === 'ja' ? l : 'en');

// ── ET 달력 ─────────────────────────────────────────────────────────────

const ET_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function etParts(ms: number): { date: string; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of ET_PARTS.formatToParts(new Date(ms))) p[x.type] = x.value;
  // hourCycle h23 이라도 일부 엔진이 자정을 "24"로 준다(Node 20 실측 — 메모리 intl-hour12) → 0 으로 접는다
  const hh = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hh * 60 + Number(p.minute) };
}

export const etDateOf = (ms: number) => etParts(ms).date;
export const etMinutesOf = (ms: number) => etParts(ms).minutes;

export function shiftDate(d: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const x = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + delta));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

export const isTradingDay = (d: string) => !isNonTradingDay(d);

export function prevTradingDay(d: string): string {
  let x = shiftDate(d, -1);
  for (let i = 0; i < 12 && !isTradingDay(x); i++) x = shiftDate(x, -1);
  return x;
}

export function nextTradingDay(d: string): string {
  let x = shiftDate(d, 1);
  for (let i = 0; i < 12 && !isTradingDay(x); i++) x = shiftDate(x, 1);
  return x;
}

/** 지금 «마지막으로 끝난 정규장»(16:00 ET 마감) 날짜 */
export function lastCompletedSession(nowMs: number): string {
  const { date, minutes } = etParts(nowMs);
  if (isTradingDay(date) && minutes >= 16 * 60) return date;
  return prevTradingDay(date);
}

/**
 * 옵션 체인·FINRA·EOD 파생값이 «적어도 이 날짜» 판본이어야 한다.
 *
 * EOD 는 T+1 로 공표된다(옵션 벌크 적재 03:30 ET · 구조 체인은 그날 밤). 그래서 문자 그대로
 * «마지막으로 끝난 세션»을 요구하면 장 마감 직후 몇 시간(=한국 아침) 동안 멀쩡한 지도가
 * 매일 사라진다. 규칙: ET 06:00 을 하루의 경계로 보고, «오늘 거래일의 직전 거래일» 판본까지 허용.
 *   화 10:00 → 월 판본 필요(금 판본이면 오래됨) · 화 20:00 → 월 · 수 01:00 → 월 · 수 07:00 → 화
 *   토·일·휴장 → 직전 거래일(금) · 월 07:00 → 금(9/28 월요일 아침 «목 판본 57시간»은 오래됨으로 잡힌다)
 */
export function expectedChainDate(nowMs: number): string {
  const d = etDateOf(nowMs - 6 * 3600_000);
  const effective = isTradingDay(d) ? d : nextTradingDay(d);
  return prevTradingDay(effective);
}

/** 판본 날짜가 기대보다 앞인가(오래됨). 날짜 모양이 아니면 판단하지 않는다(false). */
export function isStaleDate(dateStr: string | null | undefined, nowMs: number): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return false;
  return dateStr.slice(0, 10) < expectedChainDate(nowMs);
}

const WEEKDAY: Record<WlLocale, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function mdOf(d: string): { m: number; day: number; dow: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { m, day, dow: new Date(Date.UTC(y, m - 1, day)).getUTCDay() };
}

/** '2026-09-28' → ko «9/28(월)» · ja «9/28(月)» · en «Mon 9/28» */
export function fmtSessionDate(d: string, loc: WlLocale): string {
  const { m, day, dow } = mdOf(d);
  return loc === 'en' ? `${WEEKDAY.en[dow]} ${m}/${day}` : `${m}/${day}(${WEEKDAY[loc][dow]})`;
}

/** '2026-09-28' → «9/28» */
export function fmtMD(d: string): string {
  const { m, day } = mdOf(d);
  return `${m}/${day}`;
}

export type PriceBasis = { kind: 'live' | 'close'; date: string };

/** 배치 API 의 session('reg'|'pre'|'post'|'closed')으로 «이 가격이 언제의 값인가» */
export function priceBasis(session: string | null | undefined, nowMs: number): PriceBasis {
  if (session === 'reg') return { kind: 'live', date: etDateOf(nowMs) };
  return { kind: 'close', date: lastCompletedSession(nowMs) };
}

/** 헤더 한 줄(«9/28(월) 종가»)과 범례(«9/28 종가») */
export function priceBasisLabel(b: PriceBasis, loc: WlLocale, short = false): string {
  const d = short ? fmtMD(b.date) : fmtSessionDate(b.date, loc);
  if (b.kind === 'live') {
    if (short) return loc === 'ko' ? '현재가' : loc === 'ja' ? '現在値' : 'Price';
    return loc === 'ko' ? `${d} 장중` : loc === 'ja' ? `${d} 取引中` : `${d} intraday`;
  }
  return loc === 'ko' ? `${d} 종가` : loc === 'ja' ? `${d} 終値` : `${d} close`;
}

// ── 숫자 모양 ───────────────────────────────────────────────────────────

const MINUS = '−';

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pos = (v: unknown): number | null => (isNum(v) && v > 0 ? v : null);

/** 행사가·레벨: 1,100 · 337.5 · 39.5 (끝의 0 은 지운다) */
export function fmtLevel(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/** $1,053.98 — 10만 달러 이상은 소수점 없이 */
export function fmtPrice(n: number): string {
  const digits = n >= 100_000 ? 0 : 2;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** +1.9% · −2.5% (마이너스는 U+2212) */
export function fmtSignedPct(x: number, digits = 1): string {
  const r = Number(x.toFixed(digits));
  const abs = Math.abs(r).toFixed(digits);
  if (r > 0) return `+${abs}%`;
  if (r < 0) return `${MINUS}${abs}%`;
  return `${abs}%`;
}

export function fmtUsdCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `$${Math.round(n / 1e6)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

// ── 레벨 정의 검사 ──────────────────────────────────────────────────────

export const LEVEL_RULES = { callWallMax: 1.2, putFloorMin: 0.8, gammaFlip: 0.15, maxPain: 0.2 } as const;

export interface LevelInput {
  /** S — 행에 그리는 가격(정규장 가격 / 장 마감 뒤엔 종가) */
  price?: number | null;
  maxPain?: number | null;
  callWall?: number | null;
  putFloor?: number | null;
  gammaFlipLevel?: number | null;
  /** 서버 수리 이후에만 온다: 레벨이 계산된 옵션 체인의 EOD 날짜 */
  levelsChainDate?: string | null;
  /** 서버 수리 이후에만 온다: 'structure'(한 벌) · null(구조 없음). 키가 없으면 수리 전 응답 */
  levelsSource?: string | null;
  /** 응답에 levelsSource 키가 «있었는가»(수리 전/후 구분) */
  hasLevelsMeta?: boolean;
}

export type LevelField = 'callWall' | 'putFloor' | 'gammaFlipLevel' | 'maxPain';

export type LevelsVerdict =
  | { ok: true; S: number; pf: number; mp: number; cw: number; gf: number | null; chainDate: string | null }
  | { ok: false; reason: 'no-price' | 'missing' | 'source' | 'definition' | 'stale'; bad?: LevelField[] };

/** 현물 S 기준으로 정의를 어긴 필드(값이 있는 것만 본다) */
export function levelViolations(lv: Partial<Record<LevelField, number | null | undefined>>, S: number): LevelField[] {
  const eps = S * 1e-9;
  const bad: LevelField[] = [];
  const cw = pos(lv.callWall), pf = pos(lv.putFloor), gf = pos(lv.gammaFlipLevel), mp = pos(lv.maxPain);
  if (cw != null && !(cw > S && cw <= S * LEVEL_RULES.callWallMax + eps)) bad.push('callWall');
  if (pf != null && !(pf < S && pf >= S * LEVEL_RULES.putFloorMin - eps)) bad.push('putFloor');
  if (gf != null && !(Math.abs(gf - S) <= S * LEVEL_RULES.gammaFlip + eps)) bad.push('gammaFlipLevel');
  if (mp != null && !(Math.abs(mp - S) <= S * LEVEL_RULES.maxPain + eps)) bad.push('maxPain');
  return bad;
}

/**
 * 지도를 그려도 되는가. 레벨은 «한 벌»이다 — 한 값이라도 정의를 어기면 전부 버린다
 * (9/28 MU 는 풋플로어·감마플립·콜월이 «함께» 틀렸다. 한 칸만 지우면 나머지가 거짓을 말한다).
 */
export function checkLevels(input: LevelInput, nowMs: number): LevelsVerdict {
  const S = pos(input.price);
  if (S == null) return { ok: false, reason: 'no-price' };
  const pf = pos(input.putFloor), cw = pos(input.callWall), mp = pos(input.maxPain);
  const gf = pos(input.gammaFlipLevel);
  if (pf == null || cw == null || mp == null) return { ok: false, reason: 'missing' };
  if (input.hasLevelsMeta && input.levelsSource !== 'structure') return { ok: false, reason: 'source' };
  const bad = levelViolations({ callWall: cw, putFloor: pf, gammaFlipLevel: gf, maxPain: mp }, S);
  if (bad.length) return { ok: false, reason: 'definition', bad };
  const chainDate = typeof input.levelsChainDate === 'string' ? input.levelsChainDate.slice(0, 10) : null;
  if (chainDate && isStaleDate(chainDate, nowMs)) return { ok: false, reason: 'stale' };
  return { ok: true, S, pf, mp, cw, gf, chainDate };
}

// ── 포지셔닝 지도 기하 ──────────────────────────────────────────────────

export interface MapGeometry {
  /** 0~1 — 풋플로어(0) ~ 콜월(1) 사이 자리 */
  px: number;
  mp: number;
  segLeft: number;
  segWidth: number;
  /** 금색 띠가 짙은 쪽 — 맥스페인 쪽에서 가격 쪽으로 옅어진다 */
  segFrom: 'left' | 'right';
  /** 맥스페인이 [풋플로어, 콜월] 밖이라 끝에 붙여 그렸다 */
  mpClamped: boolean;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function mapGeometry(v: { S: number; pf: number; mp: number; cw: number }): MapGeometry {
  const span = v.cw - v.pf;
  const at = (x: number) => (span > 0 ? (x - v.pf) / span : 0.5);
  const px = clamp01(at(v.S));
  const rawMp = at(v.mp);
  const mp = clamp01(rawMp);
  return {
    px,
    mp,
    segLeft: Math.min(px, mp),
    segWidth: Math.abs(px - mp),
    segFrom: mp <= px ? 'left' : 'right',
    mpClamped: rawMp < 0 || rawMp > 1,
  };
}

/** 10px Inter 표 숫자 기준 대략 폭(px) — 겹침 판정용(실제 폰트가 늦게 와도 보수적으로) */
export function estimateLabelWidth(text: string, fontPx = 10): number {
  let w = 0;
  for (const ch of text) w += ch === ',' || ch === '.' ? 0.3 : ch === ' ' ? 0.28 : 0.62;
  return w * fontPx;
}

/** 맥스페인 숫자를 ◆ 아래 가운데에 둘 수 있는가 — 양 끝 숫자와 겹치면 숫자만 숨긴다(◆ 는 남긴다) */
export function maxPainLabelFits(mapWidth: number, mpPos: number, left: string, mid: string, right: string, gap = 4): boolean {
  if (!(mapWidth > 0)) return false;
  const x = mpPos * mapWidth;
  const half = estimateLabelWidth(mid) / 2;
  if (x - half < estimateLabelWidth(left) + gap) return false;
  if (x + half > mapWidth - estimateLabelWidth(right) - gap) return false;
  return true;
}

// ── 인사이트 칩 ─────────────────────────────────────────────────────────

export type ChipKind =
  | 'earnings' | 'gammaCross' | 'gammaNear' | 'callNear' | 'putNear'
  | 'whale' | 'darkpool' | 'mpDiverge' | 'nearest';
export type ChipIcon = 'cal' | 'gamma' | 'ceil' | 'floor' | 'bolt' | 'layers' | 'diamond';
export type ChipTone = 'ev' | 'gam' | 'lvl' | 'flow' | 'mp';
/** 문장 조각 — 문자열은 보통 글자, {b} 는 굵은 숫자 */
export type Seg = string | { b: string };

export interface InsightChip {
  kind: ChipKind;
  /** 같은 무리(벽·감마 등)는 한 행에 하나만 */
  group: string;
  icon: ChipIcon;
  tone: ChipTone;
  long: Seg[];
  short: Seg[];
}

export interface InsightInput {
  price: number | null;
  changePct: number | null;
  levels: LevelsVerdict;
  impliedMovePct: number | null;
  /** 다음 실적(실적 캘린더) */
  earnings?: { date: string; hour?: string | null } | null;
  /** 옵션 EOD «신규 포지션» 요약(/api/flow/options-eod?all=1) */
  whale?: { contracts: number; notional: number; side: 'call' | 'put'; date: string | null } | null;
  /** FINRA 장외 비중(/api/flow/dark-pool) */
  darkPool?: { pct: number; volRatio: number | null; date: string | null } | null;
  /** 서버 수리 이후: 레벨의 만기 */
  levelsExpiration?: string | null;
  /** 기기의 오늘 날짜(YYYY-MM-DD) — 실적 D-n 은 앱의 실적 캘린더와 같은 기준(기기 달력) */
  todayLocal: string;
  nowMs: number;
}

/** 무리 판정의 문턱 — 한 곳에 모아 둔다(조정은 여기서만) */
export const INSIGHT_RULES = {
  earningsWithinDays: 2,
  nearPct: 2,               // 레벨까지 2% 이내 = 근접
  whaleMinContracts: 1000,  // moomoo «대형 체결» 기준과 같은 1,000계약
  whaleMinNotional: 10e6,
  darkPoolVolRatio: 1.25,   // darkPoolRead 의 «늘었다» 구간과 같다
  mpDivergePct: 2,
  expiryWithinTradingDays: 3,
} as const;

export function daysBetween(fromYmd: string, toYmd: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fromYmd), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(toYmd);
  if (!a || !b) return null;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86_400_000);
}

/** 만기까지 남은 «정규장» 수 — 오늘 장이 아직 안 끝났으면 오늘 포함(16:00 ET 뒤엔 내일부터). 지났으면 -1 */
export function tradingDaysUntil(expiry: string, nowMs: number): number {
  const { date: today, minutes } = etParts(nowMs);
  const e = expiry.slice(0, 10);
  if (e < today) return -1;
  let d = minutes >= 16 * 60 ? shiftDate(today, 1) : today;
  let n = 0;
  for (let i = 0; i < 40 && d <= e; i++) {
    if (isTradingDay(d)) n++;
    d = shiftDate(d, 1);
  }
  return n;
}

export function localTodayYmd(nowMs: number = Date.now()): string {
  const x = new Date(nowMs);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

type Copy = (loc: WlLocale) => { long: Seg[]; short: Seg[] };
const L = <T,>(loc: WlLocale, ko: T, en: T, ja: T): T => (loc === 'ko' ? ko : loc === 'ja' ? ja : en);

function earningsCopy(d: number, date: string, hour: string | null | undefined, im: number | null): Copy {
  return (loc) => {
    const dLabel = d === 0 ? L(loc, '실적 오늘', 'Earnings today', '決算 本日') : L(loc, `실적 D-${d}`, `Earnings D-${d}`, `決算 D-${d}`);
    const when = hour === 'amc' ? L(loc, '장 마감 후', 'after close', '引け後')
      : hour === 'bmo' ? L(loc, '장 시작 전', 'before open', '寄り前') : '';
    const md = fmtMD(date);
    const imTxt = im != null ? `±${im.toFixed(1)}%` : null;
    const whenPart = loc === 'en' ? null : `${md}${when ? ` ${when}` : ''}`;
    const long: Seg[] = [dLabel];
    if (whenPart) long.push(` · ${whenPart}`);
    if (imTxt) long.push(L(loc, ' · 옵션 ', ' · options ', ' · オプション '), { b: imTxt });
    const short: Seg[] = imTxt ? [`${dLabel} · `, { b: imTxt }] : [loc === 'en' ? dLabel : `${dLabel} · ${md}`];
    return { long, short };
  };
}

/**
 * 한 행의 칩(최대 max 개). 순서(대표 승인 시안):
 *   실적 D-2 이내 → 레벨 교차·2% 이내 근접 → 고래 신규 포지션·장외 비중 급변 → 만기 주간 맥스페인 괴리
 *   → 기본값(가장 가까운 레벨까지 거리). 예측·권유 문구 없음 — 숫자와 사실만.
 */
export function selectInsights(input: InsightInput, loc: WlLocale, max: number): InsightChip[] {
  const out: InsightChip[] = [];
  const S = pos(input.price);
  const lv = input.levels;
  const cands: Array<Omit<InsightChip, 'long' | 'short'> & { copy: Copy }> = [];
  let walls: { callCopy: Copy; putCopy: Copy; toCall: number; toPut: number } | null = null;

  // 1) 실적 D-0~2 (+ 옵션 내재 변동)
  if (input.earnings?.date) {
    const d = daysBetween(input.todayLocal, input.earnings.date);
    if (d != null && d >= 0 && d <= INSIGHT_RULES.earningsWithinDays) {
      const im = isNum(input.impliedMovePct) && input.impliedMovePct > 0 && input.impliedMovePct < 60 ? input.impliedMovePct : null;
      cands.push({ kind: 'earnings', group: 'earn', icon: 'cal', tone: 'ev', copy: earningsCopy(d, input.earnings.date, input.earnings.hour, im) });
    }
  }

  // 2) 레벨 교차·근접 — 정의 검사를 통과한 레벨로만
  if (lv.ok && S != null) {
    const { gf, cw, pf } = lv;
    if (gf != null) {
      const dist = ((S - gf) / S) * 100;
      const prev = isNum(input.changePct) && input.changePct > -99 ? S / (1 + input.changePct / 100) : null;
      const crossed = prev != null && (prev - gf) * (S - gf) < 0;
      const below = S < gf;
      const g = fmtLevel(gf), dp = fmtSignedPct(dist);
      if (crossed) {
        cands.push({
          kind: 'gammaCross', group: 'gamma', icon: 'gamma', tone: 'gam',
          copy: (loc) => below
            ? { long: [L(loc, '감마 플립 ', 'Crossed below gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 하향 이탈 ', '', ' を下抜け '), ...(loc === 'en' ? [] : [{ b: dp } as Seg]), L(loc, ' · 변동 확대 구간', '', ' · 変動拡大ゾーン')],
                short: [L(loc, '감마 플립 ', 'Below gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 하향 이탈', '', ' を下抜け')] }
            : { long: [L(loc, '감마 플립 ', 'Crossed above gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 상향 돌파 ', '', ' を上抜け '), ...(loc === 'en' ? [] : [{ b: dp } as Seg]), L(loc, ' · 변동 축소 구간', '', ' · 変動縮小ゾーン')],
                short: [L(loc, '감마 플립 ', 'Above gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 상향 돌파', '', ' を上抜け')] },
        });
      } else if (Math.abs(dist) <= INSIGHT_RULES.nearPct) {
        cands.push({
          kind: 'gammaNear', group: 'gamma', icon: 'gamma', tone: 'gam',
          copy: (loc) => below
            ? { long: [L(loc, '감마 플립 ', 'Below gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 아래 ', ' · ', ' の下 '), { b: dp }, L(loc, ' · 변동 확대 구간', '', ' · 変動拡大ゾーン')],
                short: [L(loc, '감마 플립 ', 'Below gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 아래', '', ' の下')] }
            : { long: [L(loc, '감마 플립 ', 'Above gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 위 ', ' · ', ' の上 '), { b: dp }, L(loc, ' · 변동 축소 구간', '', ' · 変動縮小ゾーン')],
                short: [L(loc, '감마 플립 ', 'Above gamma flip ', 'ガンマフリップ '), { b: g }, L(loc, ' 위', '', ' の上')] },
        });
      }
    }
    const toCall = ((cw - S) / S) * 100;       // 양수
    const toPut = ((pf - S) / S) * 100;        // 음수
    const callCopy: Copy = (loc) => {
      const seg: Seg[] = loc === 'en'
        ? [{ b: fmtSignedPct(toCall) }, ' to call wall ', { b: fmtLevel(cw) }]
        : [L(loc, '콜월 ', '', 'コールウォール '), { b: fmtLevel(cw) }, L(loc, '까지 ', '', ' まで '), { b: fmtSignedPct(toCall) }];
      return { long: seg, short: seg };
    };
    const putCopy: Copy = (loc) => {
      const seg: Seg[] = loc === 'en'
        ? [{ b: fmtSignedPct(toPut) }, ' to put floor ', { b: fmtLevel(pf) }]
        : [L(loc, '풋플로어 ', '', 'プットフロア '), { b: fmtLevel(pf) }, L(loc, '까지 ', '', ' まで '), { b: fmtSignedPct(toPut) }];
      return { long: seg, short: seg };
    };
    if (toCall <= INSIGHT_RULES.nearPct) cands.push({ kind: 'callNear', group: 'walls', icon: 'ceil', tone: 'lvl', copy: callCopy });
    if (-toPut <= INSIGHT_RULES.nearPct) cands.push({ kind: 'putNear', group: 'walls', icon: 'floor', tone: 'lvl', copy: putCopy });

    // 3·4·5 는 아래에서 순서대로 — 기본값(가장 가까운 벽)은 맨 끝
    walls = { callCopy, putCopy, toCall, toPut };
  }

  // 3) 고래 신규 포지션 · 장외 비중 급변 (각자 판본이 오래됐으면 버린다)
  const w = input.whale;
  if (w && w.contracts >= INSIGHT_RULES.whaleMinContracts && w.notional >= INSIGHT_RULES.whaleMinNotional && !isStaleDate(w.date, input.nowMs) && w.date) {
    const c = `+${Math.round(w.contracts).toLocaleString('en-US')}`;
    const n = fmtUsdCompact(w.notional);
    const isPut = w.side === 'put';
    cands.push({
      kind: 'whale', group: 'whale', icon: 'bolt', tone: 'flow',
      copy: (loc) => ({
        long: [L(loc, isPut ? '고래 신규 풋 ' : '고래 신규 콜 ', isPut ? 'Whale new puts ' : 'Whale new calls ', isPut ? '大口新規プット ' : '大口新規コール '), { b: c }, L(loc, '계약 · ', ' · ', '枚 · '), { b: n }],
        short: [L(loc, isPut ? '고래 신규 풋 ' : '고래 신규 콜 ', isPut ? 'New puts ' : 'New calls ', isPut ? '大口新規プット ' : '大口新規コール '), { b: c }],
      }),
    });
  }
  const dpx = input.darkPool;
  if (dpx && isNum(dpx.pct) && dpx.pct > 0 && isNum(dpx.volRatio) && dpx.volRatio >= INSIGHT_RULES.darkPoolVolRatio && dpx.date && !isStaleDate(dpx.date, input.nowMs)) {
    const p = `${Math.round(dpx.pct)}%`;
    const r = dpx.volRatio.toFixed(1);
    cands.push({
      kind: 'darkpool', group: 'dp', icon: 'layers', tone: 'flow',
      copy: (loc) => ({
        long: [L(loc, '장외 비중 ', 'Off-exch ', '場外比率 '), { b: p }, L(loc, ' · 물량 20일 평균의 ', ' · vol ', ' · 出来高 20日平均の'), { b: L(loc, `${r}배`, `${r}×`, `${r}倍`) }, L(loc, '', ' 20d avg', '')],
        short: [L(loc, '장외 ', 'Off-exch ', '場外 '), { b: p }, L(loc, ' · 물량 ', ' · ', ' · 出来高'), { b: L(loc, `${r}배`, `${r}× vol`, `${r}倍`) }],
      }),
    });
  }

  // 4) 만기 주간 맥스페인 괴리 — 만기를 알 때만(서버 수리 이후 levelsExpiration)
  if (lv.ok && S != null && input.levelsExpiration) {
    const tdays = tradingDaysUntil(input.levelsExpiration, input.nowMs);
    const div = ((S - lv.mp) / lv.mp) * 100;
    if (tdays >= 1 && tdays <= INSIGHT_RULES.expiryWithinTradingDays && Math.abs(div) >= INSIGHT_RULES.mpDivergePct) {
      const m = fmtLevel(lv.mp), dv = fmtSignedPct(div);
      cands.push({
        kind: 'mpDiverge', group: 'mp', icon: 'diamond', tone: 'mp',
        copy: (loc) => ({
          long: [L(loc, '만기 주간 맥스페인 ', 'Expiry week · max pain ', '満期週 マックスペイン '), { b: m }, L(loc, ' · 괴리 ', ' ', ' · 乖離 '), { b: dv }],
          short: [L(loc, '맥스페인 ', 'Max pain ', 'マックスペイン '), { b: m }, L(loc, ' · 괴리 ', ' ', ' 乖離 '), { b: dv }],
        }),
      });
    }
  }

  // 5) 기본값 — 가장 가까운 벽까지 거리
  if (walls) {
    const callNearer = walls.toCall <= -walls.toPut;
    cands.push(callNearer
      ? { kind: 'nearest', group: 'walls', icon: 'ceil', tone: 'lvl', copy: walls.callCopy }
      : { kind: 'nearest', group: 'walls', icon: 'floor', tone: 'lvl', copy: walls.putCopy });
  }

  const usedGroups = new Set<string>();
  for (const c of cands) {
    if (out.length >= max) break;
    if (usedGroups.has(c.group)) continue;
    usedGroups.add(c.group);
    const { long, short } = c.copy(loc);
    out.push({ kind: c.kind, group: c.group, icon: c.icon, tone: c.tone, long, short });
  }
  return out;
}

/** 스크린리더용 평문 */
export function segText(segs: Seg[]): string {
  return segs.map((s) => (typeof s === 'string' ? s : s.b)).join('');
}
