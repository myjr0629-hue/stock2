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
//
// ★ 출처는 «확인된 것만» 믿는다(fail-closed · 9/29 검토 A1).
//   지도·감마 칩은 레벨이 구조 한 벌(levelsSource === 'structure')이고 체인 날짜(levelsChainDate)가 있을 때만 그린다.
//   메타가 없는 응답(72 이전 모양)·다른 출처·날짜 없음은 전부 숨긴다 — 수집 Lambda 행(getLatestGex 폴백)의
//   «벽 중간값» 감마플립 (콜월+풋플로어)/2 가 정의 검사를 늘 통과해 지어낸 감마 칩·지도가 됐다
//   (9/28 AAPL 감마플립 337.5 = (345+330)/2). 중간값은 콜월·풋플로어 사이에 있으니 ±15% 검사로는 못 거른다.
// ============================================================================

import { isNonTradingDay } from '@/lib/marketCalendar';

export type WlLocale = 'ko' | 'en' | 'ja';
export const toWlLocale = (l: string | null | undefined): WlLocale => (l === 'ko' || l === 'ja' ? l : 'en');

// ── ET 달력 ─────────────────────────────────────────────────────────────

// hour12:false — hourCycle 을 모르는 오래된 웹뷰에서도 24시간제로 온다(자정이 «24»로 오는 엔진은 아래에서 접는다)
const ET_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function etParts(ms: number): { date: string; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of ET_PARTS.formatToParts(new Date(ms))) p[x.type] = x.value;
  // 일부 엔진이 자정을 "24"로 준다(Node 20 실측) → 0 으로 접는다
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

/**
 * 조기 폐장(13:00 ET) — NYSE 공표 일정. 매년 갱신한다(marketCalendar 휴장표와 같은 주기).
 * 앱 공용 marketCalendar 는 바꾸지 않는다(호출자 전부에 번진다) — 워치리스트의 «종가 날짜»·«남은 정규장»·
 * 실적 발표 시각 판정만 이 표를 쓴다(A9: 11/27·12/24 13~16시 ET 에 «종가»가 전 거래일 날짜로 나왔다).
 *   2026: 11/27(추수감사절 다음 날) · 12/24(성탄 전날). 7/2 는 정상 마감(7/3 이 독립기념일 대체 휴장).
 *   2027: 11/26. 12/24 는 성탄 대체 휴장이라 없고, 7/2(금)도 정상 마감(7/5 대체 휴장).
 */
export const EARLY_CLOSE_DATES: ReadonlySet<string> = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);

/** 그날 정규장이 끝나는 시각(ET 자정 기준 분) — 평소 16:00(960) · 조기 폐장 13:00(780) */
export const sessionCloseMinutes = (d: string): number => (EARLY_CLOSE_DATES.has(d) ? 13 * 60 : 16 * 60);

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

/** 지금 «마지막으로 끝난 정규장»(16:00 ET 마감 · 조기 폐장일 13:00) 날짜 */
export function lastCompletedSession(nowMs: number): string {
  const { date, minutes } = etParts(nowMs);
  if (isTradingDay(date) && minutes >= sessionCloseMinutes(date)) return date;
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

/**
 * 옵션 레벨 지도용 «너무 오래됨» — 기대 판본보다 «2거래일 이상» 늦을 때만 참(2026-09-29 19시 미리보기 실측 뒤 조정).
 * 왜: 수집 Lambda 체인 캐시가 새 EOD 공표 뒤에도 전날 체인을 최대 20시간 내보낸다(㊲-2 ② 배포 전). 그래서
 *   «1거래일 늦음»은 한국 낮 시간 거의 매일의 정상 지연이고, 같은 구조 한 벌 값을 Command·Flow 는 그대로 보여 준다.
 *   워치리스트만 숨기면 «레벨 갱신 대기»와 Command 의 숫자가 어긋난다 → 1거래일 늦음은 머리줄에 날짜를 밝혀 보여 주고,
 *   2거래일 이상(파이프라인 멈춤)만 숨긴다. 날짜 모양이 아니면 판단하지 않는다(false).
 */
export function isTooStaleLevels(dateStr: string | null | undefined, nowMs: number): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return false;
  return dateStr.slice(0, 10) < prevTradingDay(expectedChainDate(nowMs));
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
  /** 레벨이 계산된 옵션 체인의 EOD 날짜(72 응답: 구조가 없으면 null) — 없으면 지도를 그리지 않는다 */
  levelsChainDate?: string | null;
  /** 72 응답: 'structure'(구조 한 벌) · null(구조 없음 → 레벨 전부 null). 키가 없으면 72 이전 모양 */
  levelsSource?: string | null;
  /** 응답에 levelsSource 키가 «있었는가»(72 전/후 구분). 안 주면 levelsSource 가 정의됐는지로 본다 */
  hasLevelsMeta?: boolean;
  /** 72 응답: 서버 정의 게이트가 지운 필드 — 빈 레벨이 «원래 없어서»인지 «정의를 어겨서»인지 가른다 */
  levelsDropped?: readonly string[] | null;
}

export type LevelField = 'callWall' | 'putFloor' | 'gammaFlipLevel' | 'maxPain';

/**
 * 지도를 숨긴 까닭.
 *   «원래 없음» — missing(구조는 있으나 벽·맥스페인이 비었다) · source(구조 한 벌이 아니다: 서버가 null 이라고 말했다)
 *   «아직 못 믿음» — definition(정의 위반·서버 게이트가 지움) · stale(체인 판본이 오래됨) · undated(체인 날짜 없음)
 *                   · unverified(출처 메타가 없는 응답) · no-price(가격을 못 받아 검사할 수 없음)
 */
export type LevelsReason = 'no-price' | 'missing' | 'source' | 'definition' | 'stale' | 'undated' | 'unverified';

export type LevelsVerdict =
  | { ok: true; S: number; pf: number; mp: number; cw: number; gf: number | null; chainDate: string | null }
  | { ok: false; reason: LevelsReason; bad?: LevelField[] };

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

const YMD = /^\d{4}-\d{2}-\d{2}/;
const MAP_FIELDS: readonly LevelField[] = ['callWall', 'putFloor', 'maxPain'];

/**
 * 지도를 그려도 되는가. 레벨은 «한 벌»이다 — 한 값이라도 정의를 어기면 전부 버린다
 * (9/28 MU 는 풋플로어·감마플립·콜월이 «함께» 틀렸다. 한 칸만 지우면 나머지가 거짓을 말한다).
 * 출처가 확인되지 않으면 값이 정의 안에 있어도 버린다(fail-closed · A1): 구조 한 벌이어야 한다. 판본 날짜는 2거래일 이상 늦을 때만 숨긴다(④).
 */
export function checkLevels(input: LevelInput, nowMs: number): LevelsVerdict {
  const S = pos(input.price);
  // ① 출처 — 메타 없는 응답(72 이전 모양)은 벽 중간값 감마플립 같은 다른 생산자의 값일 수 있다
  const meta = input.hasLevelsMeta ?? (input.levelsSource !== undefined);
  if (!meta) return { ok: false, reason: S == null ? 'no-price' : 'unverified' };
  if (input.levelsSource !== 'structure') return { ok: false, reason: 'source' };
  // ② 가격 — 정의 검사의 기준(S)이 없으면 판단하지 않는다
  if (S == null) return { ok: false, reason: 'no-price' };
  const pf = pos(input.putFloor), cw = pos(input.callWall), mp = pos(input.maxPain);
  const gf = pos(input.gammaFlipLevel);
  if (pf == null || cw == null || mp == null) {
    // 서버 정의 게이트(optionLevelGate)가 지운 칸이면 «원래 없음»이 아니라 «정의 위반»이다
    const dropped = MAP_FIELDS.filter((f) => input.levelsDropped?.includes(f));
    return dropped.length ? { ok: false, reason: 'definition', bad: dropped } : { ok: false, reason: 'missing' };
  }
  // ③ 정의 — 화면 가격 기준(맥스페인 ±20% 는 서버 35% 보다 엄격)
  const bad = levelViolations({ callWall: cw, putFloor: pf, gammaFlipLevel: gf, maxPain: mp }, S);
  if (bad.length) return { ok: false, reason: 'definition', bad };
  // ④ 판본 날짜 — 2거래일 이상 늦으면(파이프라인 멈춤) 숨긴다. 1거래일 늦음은 날짜를 밝혀 보여 주고(isTooStaleLevels 머리말),
  //    날짜를 모르면(수집 Lambda 캐시 경로 — ㊲-2 ② 배포 전엔 판본 날짜를 안 싣는다) 날짜를 «주장하지 않고» 보여 준다.
  //    출처(구조 한 벌)·정의 검사는 위에서 이미 통과 — 지어낸 값(벽 중간값 등)은 ①에서 막혔다.
  const chainDate = typeof input.levelsChainDate === 'string' && YMD.test(input.levelsChainDate) ? input.levelsChainDate.slice(0, 10) : null;
  if (chainDate && isTooStaleLevels(chainDate, nowMs)) return { ok: false, reason: 'stale' };
  return { ok: true, S, pf, mp, cw, gf, chainDate };
}

/**
 * 지도 자리의 말(A15). 레벨이 «원래 없는» 종목(missing·source)에 «레벨 갱신 대기»를 쓰면 오지 않을 갱신을 약속한다.
 *   'none' → «옵션 레벨 없음» · 'wait' → «레벨 갱신 대기»(정의 위반·오래됨·날짜 없음·출처 확인 전·가격 못 받음) · 지도를 그리면 null
 */
export function levelsNotice(v: LevelsVerdict): 'none' | 'wait' | null {
  if (v.ok) return null;
  return v.reason === 'missing' || v.reason === 'source' ? 'none' : 'wait';
}

// ── 포지셔닝 지도 기하 ──────────────────────────────────────────────────

export interface MapGeometry {
  /** 0~1 — 풋플로어(0) ~ 콜월(1) 사이 자리 */
  px: number;
  mp: number;
  segLeft: number;
  segWidth: number;
  /** ◆(맥스페인)가 있는 쪽 — 띠는 반대쪽(● 가격)이 짙고 ◆ 쪽으로 옅어진다(mapBandBackground) */
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

/**
 * ◆(맥스페인) ─ ●(가격) 사이 띠의 배경 — 지도 트랙과 같은 회청색(슬레이트) 계열로, ● 쪽이 짙고 ◆ 쪽으로 옅어진다.
 * 금색을 쓰지 않는다: 금색은 ◆ 표식과 ★ 에만(9/29 검토 C6 — 금색 띠가 그 규칙과 어긋났다). 행 지도·알림 설정 큰 지도가 같이 쓴다.
 */
export function mapBandBackground(segFrom: MapGeometry['segFrom']): string {
  // linear-gradient 의 첫 색이 «각도가 가리키는 반대편» 끝이다: 270deg = 오른쪽에서 왼쪽으로 → 첫 색이 오른쪽 끝
  return `linear-gradient(${segFrom === 'left' ? 270 : 90}deg, rgba(148,163,184,.5), rgba(148,163,184,.12))`;
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
  // ⚠️ 실적 칩에 «옵션 ±» 숫자를 싣지 않는다(2026-09-29 실화면 검수).
  //   묶음 API 의 impliedMovePct 는 옵션 내재 변동이 아니다 — (콜월 − 풋플로어) ÷ 가격, 즉 «벽 사이 폭»이다
  //   (watchlistBatchService·portfolioBatchService). MU 9/28: 그 값 ±9.0% vs 10/2 만기 1055 스트래들 중간값 ±7.9%.
  //   실적 내재 변동은 «실적 뒤 첫 만기의 ATM 스트래들(실시간 중간값) ÷ 가격»만 맞다 — 그 값을 주는 문이 생기면
  //   만기와 함께 여기로 받는다. 그 전엔 날짜·발표 시각만 쓴다.
  /** 다음 실적(실적 캘린더) — 발표가 «지났는지»는 ET 날짜 + 발표 시각으로 본다(earningsPending) */
  earnings?: { date: string; hour?: string | null } | null;
  /**
   * 옵션 EOD «신규 포지션»(/api/flow/options-eod?all=1) — 우세한 쪽(side) «한쪽»의 숫자만.
   *   contracts = 그쪽 미결제약정 증가 합, notional = 그쪽 ΔOI×100×행사가(프리미엄 아님 — 문턱에만 쓰고 화면엔 싣지 않는다).
   *   date = OI 를 잰 EOD 세션 · prevDate = 비교한 직전 세션(직전 거래일이 아니면 «전 세션 대비»가 아니라 버린다).
   */
  whale?: { contracts: number; notional: number; side: 'call' | 'put'; date: string | null; prevDate?: string | null } | null;
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

/** 만기까지 남은 «정규장» 수 — 오늘 장이 아직 안 끝났으면 오늘 포함(16:00 ET · 조기 폐장 13:00 뒤엔 내일부터). 지났으면 -1 */
export function tradingDaysUntil(expiry: string, nowMs: number): number {
  const { date: today, minutes } = etParts(nowMs);
  const e = expiry.slice(0, 10);
  if (e < today) return -1;
  let d = minutes >= sessionCloseMinutes(today) ? shiftDate(today, 1) : today;
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

/** 시각 미정 실적이 «지났다»고 보는 시각 — 시간외 거래가 끝나는 20:00 ET(장 전·장중·장 마감 후 어느 쪽이든 그 전에 나온다) */
const EARNINGS_UNKNOWN_DONE_MIN = 20 * 60;

/**
 * 실적 발표가 «아직 안 지났나» — 기기 날짜가 아니라 ET 날짜 + 발표 시각으로 판정한다(A5).
 *   bmo(장 시작 전) → 그날 09:30 ET 부터 지남 · amc(장 마감 후) → 그날 정규장 마감(16:00, 조기 폐장 13:00) ET 부터 지남
 *   시각 미정 → 그날 20:00 ET 부터 지남.
 * 한·일 기기는 미국장 내내 기기 날짜가 하루 앞선다 — 기기 날짜로 거르면 amc 실적 «당일» 칩이 미국 장중 내내 사라졌다.
 * D-n 표기는 앱 실적 캘린더와 같은 기기 달력 그대로 둔다(selectInsights).
 */
export function earningsPending(date: string, hour: string | null | undefined, nowMs: number): boolean {
  if (typeof date !== 'string' || !YMD.test(date)) return false;
  const d = date.slice(0, 10);
  const { date: today, minutes } = etParts(nowMs);
  if (d !== today) return d > today;
  if (hour === 'bmo') return minutes < 9 * 60 + 30;
  if (hour === 'amc') return minutes < sessionCloseMinutes(d);
  return minutes < EARNINGS_UNKNOWN_DONE_MIN;
}

type Copy = (loc: WlLocale) => { long: Seg[]; short: Seg[] };
const L = <T,>(loc: WlLocale, ko: T, en: T, ja: T): T => (loc === 'ko' ? ko : loc === 'ja' ? ja : en);

function earningsCopy(d: number, date: string, hour: string | null | undefined): Copy {
  return (loc) => {
    // «실적 D-1 · 9/30 장 마감 후» — 굵게는 D-n(이 칩의 사실). 숫자(옵션 ±)는 싣지 않는다(InsightInput 주석).
    const head = L(loc, '실적 ', 'Earnings ', '決算 ');
    const dTxt = d === 0 ? L(loc, '오늘', 'today', '本日') : `D-${d}`;
    const when = hour === 'amc' ? L(loc, '장 마감 후', 'after close', '引け後')
      : hour === 'bmo' ? L(loc, '장 시작 전', 'before open', '寄り前') : '';
    const md = fmtMD(date);
    const long: Seg[] = [head, { b: dTxt }, ` · ${md}${when ? ` ${when}` : ''}`];
    const short: Seg[] = [head, { b: dTxt }, ` · ${md}`];
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

  // 1) 실적 D-0~2 — 날짜·발표 시각만(옵션 ± 없음: InsightInput 주석).
  //    «지났나»는 ET 날짜 + 발표 시각(earningsPending), D-n 은 기기 달력. 기기 날짜가 ET 보다 앞선 한·일의 미국 장중엔
  //    기기 기준 D-(-1) 이 되는데, 발표 전이면 ET 로 «당일»이다 → «오늘»로 접는다.
  if (input.earnings?.date && earningsPending(input.earnings.date, input.earnings.hour, input.nowMs)) {
    const raw = daysBetween(input.todayLocal, input.earnings.date);
    const d = raw == null ? null : Math.max(0, raw);
    if (d != null && d <= INSIGHT_RULES.earningsWithinDays) {
      cands.push({ kind: 'earnings', group: 'earn', icon: 'cal', tone: 'ev', copy: earningsCopy(d, input.earnings.date.slice(0, 10), input.earnings.hour) });
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
    // 벽까지 거리 — 긴 문장 «콜 월 345까지 +1.9%», 짧은 문장은 조사 없이 «콜 월 345 · +1.9%»(좁은 폭 · ja «まで» 빼기, 9/29 검토 C4).
    //   이름은 앱 용어집(metricGlossary)과 같게: 콜 월 · 풋 플로어.
    const wallCopy = (name: [string, string, string], k: number, pct: number): Copy => (loc) => {
      const lvl = fmtLevel(k), d = fmtSignedPct(pct);
      const long: Seg[] = loc === 'en'
        ? [{ b: d }, ` to ${name[1].toLowerCase()} `, { b: lvl }]
        : [`${L(loc, name[0], name[1], name[2])} `, { b: lvl }, L(loc, '까지 ', '', ' まで '), { b: d }];
      const short: Seg[] = [`${L(loc, name[0], name[1], name[2])} `, { b: lvl }, ' · ', { b: d }];
      return { long, short };
    };
    const callCopy = wallCopy(['콜 월', 'Call wall', 'コールウォール'], cw, toCall);
    const putCopy = wallCopy(['풋 플로어', 'Put floor', 'プットフロア'], pf, toPut);
    if (toCall <= INSIGHT_RULES.nearPct) cands.push({ kind: 'callNear', group: 'walls', icon: 'ceil', tone: 'lvl', copy: callCopy });
    if (-toPut <= INSIGHT_RULES.nearPct) cands.push({ kind: 'putNear', group: 'walls', icon: 'floor', tone: 'lvl', copy: putCopy });

    // 3·4·5 는 아래에서 순서대로 — 기본값(가장 가까운 벽)은 맨 끝
    walls = { callCopy, putCopy, toCall, toPut };
  }

  // 3) 고래 신규 포지션 · 장외 비중 급변 (각자 판본이 오래됐으면 버린다)
  //    고래(A3): 우세한 쪽 «한쪽»의 계약 수만 — 콜+풋 합계를 «신규 콜»로 적지 않는다. 금액(ΔOI×100×행사가)은 프리미엄이 아니라
  //    싣지 않고, 대신 OI 를 잰 세션 날짜를 단다. «전 세션 대비»가 아니면(prevDate ≠ 직전 거래일 — 적재가 하루 빠졌다) 버린다.
  const w = input.whale;
  const wDate = w?.date && YMD.test(w.date) ? w.date.slice(0, 10) : null;
  if (w && wDate && w.contracts >= INSIGHT_RULES.whaleMinContracts && w.notional >= INSIGHT_RULES.whaleMinNotional
    && !isStaleDate(wDate, input.nowMs) && w.prevDate === prevTradingDay(wDate)) {
    const c = `+${Math.round(w.contracts).toLocaleString('en-US')}`;
    const md = fmtMD(wDate);
    const isPut = w.side === 'put';
    cands.push({
      kind: 'whale', group: 'whale', icon: 'bolt', tone: 'flow',
      copy: (loc) => ({
        long: [L(loc, isPut ? '고래 신규 풋 ' : '고래 신규 콜 ', isPut ? 'New whale puts ' : 'New whale calls ', isPut ? '大口新規プット ' : '大口新規コール '), { b: c },
          L(loc, `계약 · ${md} 마감`, ` · ${md} close`, `枚 · ${md}引け`)],
        short: [L(loc, isPut ? '고래 신규 풋 ' : '고래 신규 콜 ', isPut ? 'New puts ' : 'New calls ', isPut ? '大口新規プット ' : '大口新規コール '), { b: c }, ` · ${md}`],
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
        long: [L(loc, '장외 비중 ', 'Off-exchange ', '場外比率 '), { b: p }, L(loc, ' · 물량 20일 평균의 ', ' · vol ', ' · 出来高 20日平均の'), { b: L(loc, `${r}배`, `${r}×`, `${r}倍`) }, L(loc, '', ' 20d avg', '')],
        short: [L(loc, '장외 ', 'Off-exchange ', '場外 '), { b: p }, L(loc, ' · 물량 ', ' · ', ' · 出来高'), { b: L(loc, `${r}배`, `${r}× vol`, `${r}倍`) }],
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
          // 영어도 «gap»을 밝힌다(«Max pain 740 −3.0%»는 무엇의 −3.0% 인지 읽히지 않았다)
          long: [L(loc, '만기 주간 맥스 페인 ', 'Expiry week · max pain ', '満期週 マックスペイン '), { b: m }, L(loc, ' · 괴리 ', ' · gap ', ' · 乖離 '), { b: dv }],
          short: [L(loc, '맥스 페인 ', 'Max pain ', 'マックスペイン '), { b: m }, L(loc, ' · 괴리 ', ' · gap ', ' 乖離 '), { b: dv }],
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

// ── 잠긴 두 번째 칩(무료) ───────────────────────────────────────────────

/**
 * 칩의 «종류 이름» — 숫자·문장 없이 이름만. 말은 이미 쓰는 것 그대로:
 * 칩 문장의 머리말과 지도 이름(앱 용어집과 같은 콜 월·풋 플로어·맥스 페인·감마 플립).
 * «가장 가까운 벽»은 아이콘(ceil/floor)으로 어느 벽인지 안다 — 지도에 이미 보이는 사실이라 새로 드러나는 것이 없다.
 */
export function chipKindLabel(c: Pick<InsightChip, 'kind' | 'icon'>, loc: WlLocale): string {
  switch (c.kind) {
    case 'earnings': return L(loc, '실적 일정', 'Earnings date', '決算日程');
    case 'gammaCross':
    case 'gammaNear': return L(loc, '감마 플립', 'Gamma flip', 'ガンマフリップ');
    case 'whale': return L(loc, '고래 신규 포지션', 'Whale positions', '大口新規');
    case 'darkpool': return L(loc, '장외 비중', 'Off-exchange', '場外比率');
    case 'mpDiverge': return L(loc, '맥스 페인', 'Max pain', 'マックスペイン');
    case 'putNear': return L(loc, '풋 플로어', 'Put floor', 'プットフロア');
    case 'callNear': return L(loc, '콜 월', 'Call wall', 'コールウォール');
    case 'nearest':
    default:
      return c.icon === 'floor' ? L(loc, '풋 플로어', 'Put floor', 'プットフロア') : L(loc, '콜 월', 'Call wall', 'コールウォール');
  }
}

/** 무료 행의 잠긴 칩 — 종류 이름만(내용은 싣지 않는다) */
export interface LockedChip {
  kind: ChipKind;
  label: string;
}

/**
 * 요금제별 칩. all 은 selectInsights(…, 2) 의 결과.
 *   tiering 꺼짐(기본 — watchlistFlags WATCHLIST_CHIP_TIERING): 무료·PRO 모두 두 칩, 잠금 없음(정보 차등 없음).
 *   tiering 켜짐: 무료 1 · PRO 2(대표 결정). 무료의 첫 칩은 selectInsights(…, 1) 과 같다(같은 순서에서 앞 하나).
 *     무료 행은 두 번째 칩이 «실제로 있을 때만» 그 종류 이름을 잠금 칩으로 돌려준다 — 없으면 null(가짜 희소성 금지).
 */
export function chipsForPlan(
  all: readonly InsightChip[], plan: { isPro: boolean; tiering: boolean }, loc: WlLocale,
): { chips: InsightChip[]; locked: LockedChip | null } {
  if (!plan.tiering || plan.isPro) return { chips: all.slice(0, 2), locked: null };
  const second = all[1];
  return {
    chips: all.slice(0, 1),
    locked: second ? { kind: second.kind, label: chipKindLabel(second, loc) } : null,
  };
}
