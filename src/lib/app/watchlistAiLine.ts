// ============================================================================
// «내 종목» AI 한 줄 — 클라이언트·서버 공용 순수 모듈 (2026-10-12, 대표 승인 «② 내 종목 AI 한 줄»)
// ----------------------------------------------------------------------------
// 종목마다 한 줄: «Max Pain $215 위 6.6% · Call Wall $250까지 8.8% · 장외 비중 43.8%».
//   · 글은 종목 단위로 서버가 한 번 만들고(3개 언어 한 호출) 모든 사용자가 같이 읽는다(lib/ai/watchlistLine · services/watchlistAiLineService).
//   · 가격에 따라 움직이는 숫자(레벨까지 거리 %)는 AI 가 쓰지 않는다 — 자리표({MP}·{CW}·{PF}·{GF})로 두고 화면이 «지금 가격»으로 채운다.
//     그래서 같은 행의 지도·가격과 숫자가 어긋나지 않는다.
//   · 글은 «그 글을 쓸 때의 지형»(체인 날짜·레벨 네 값·가격이 각 레벨의 위/아래)에 묶인다. 화면의 지형이 그와 다르면
//     (새 체인·레벨 변경·가격이 레벨을 건넘) 그 글을 그리지 않고 서버에 «다시 써 달라»고 알린다(aiLineState 'stale').
// 지어내지 않는다: 이 파일은 글을 만들지 않는다. 숫자를 채우는 것은 «화면이 이미 가진 가격·레벨»뿐이다.
// ============================================================================

export type AiLevelKey = 'mp' | 'cw' | 'pf' | 'gf';
export const AI_LEVEL_KEYS: readonly AiLevelKey[] = ['mp', 'cw', 'pf', 'gf'];
export const AI_PLACEHOLDER: Record<AiLevelKey, string> = { mp: '{MP}', cw: '{CW}', pf: '{PF}', gf: '{GF}' };
/** 위(a) · 아래(b) · 레벨 위(at — 가격이 레벨에서 AT_BAND_PCT 안) */
export type AiSide = 'a' | 'b' | 'at';
/** 이 안이면 «레벨 위에 있다»로 본다 — 0.1% (NVDA $230 이면 23센트) */
export const AI_AT_BAND_PCT = 0.1;

export type AiLineLevels = Record<AiLevelKey, number | null>;
export type AiLineLocale = 'ko' | 'en' | 'ja';

/** 서버가 클라이언트에 주는 한 칸(언어 하나) */
export interface AiLineEntry {
  /** 자리표가 든 글 */
  text: string;
  /** 이 글을 쓴 옵션 체인 날짜(levelsChainDate, YYYY-MM-DD) */
  chain: string;
  /** 이 글을 쓴 레벨 네 값 */
  lv: AiLineLevels;
  /** 이 글을 쓴 가격이 각 레벨의 어느 쪽이었나(값이 있는 레벨만) */
  sides: Partial<Record<AiLevelKey, AiSide>>;
  /** 만든 시각(ms) */
  at: number;
}

const pos = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);

/** 가격이 레벨의 어느 쪽인가 — 둘 중 하나라도 없으면 null */
export function sideOf(price: number | null | undefined, level: number | null | undefined): AiSide | null {
  const p = pos(price), l = pos(level);
  if (p == null || l == null) return null;
  if ((Math.abs(p - l) / p) * 100 < AI_AT_BAND_PCT) return 'at';
  return p > l ? 'a' : 'b';
}

/** 가격에서 레벨까지 거리(%, 부호 없음) — 분모는 가격(maxPainDist 와 같은 규칙: (레벨 − 가격) ÷ 가격) */
export function distPct(price: number, level: number): number {
  return (Math.abs(level - price) / price) * 100;
}

/** 거리 % 글자 — 소수 한 자리 */
export function fmtDistPct(x: number): string {
  return `${x.toFixed(1)}%`;
}

export interface AiLineRow {
  /** 화면 가격(지도와 같은 값 — LevelsVerdict.S) */
  price: number | null | undefined;
  maxPain: number | null | undefined;
  callWall: number | null | undefined;
  putFloor: number | null | undefined;
  gammaFlipLevel: number | null | undefined;
  chainDate: string | null | undefined;
}

const sameLevel = (a: number | null | undefined, b: number | null | undefined): boolean => {
  const x = pos(a), y = pos(b);
  if (x == null || y == null) return x == null && y == null;
  return Math.abs(x - y) < 1e-6;
};

const rowLevels = (row: AiLineRow): AiLineLevels => ({ mp: pos(row.maxPain), cw: pos(row.callWall), pf: pos(row.putFloor), gf: pos(row.gammaFlipLevel) });

/** 지금 가격에서 각 레벨의 쪽 — 서버(글을 쓸 때)와 화면(읽을 때)이 같은 함수 */
export function sidesFor(price: number | null | undefined, lv: AiLineLevels): Partial<Record<AiLevelKey, AiSide>> {
  const out: Partial<Record<AiLevelKey, AiSide>> = {};
  for (const k of AI_LEVEL_KEYS) {
    const s = sideOf(price, lv[k]);
    if (s) out[k] = s;
  }
  return out;
}

/**
 * 이 글을 지금 그려도 되나.
 *   'ok'    체인 날짜·레벨 네 값·가격의 쪽이 글을 쓸 때와 같다
 *   'stale' 글은 있는데 지형이 바뀌었다 — 그리지 않고 서버에 다시 써 달라고 알린다
 *   'none'  글이 없다·가격이 없다·체인 날짜를 모른다
 */
export function aiLineState(entry: AiLineEntry | null | undefined, row: AiLineRow): 'ok' | 'stale' | 'none' {
  if (!entry || typeof entry.text !== 'string' || !entry.text) return 'none';
  const p = pos(row.price);
  if (p == null || !row.chainDate) return 'none';
  if (entry.chain !== row.chainDate) return 'stale';
  const lv = rowLevels(row);
  for (const k of AI_LEVEL_KEYS) if (!sameLevel(entry.lv?.[k], lv[k])) return 'stale';
  const now = sidesFor(p, lv);
  for (const k of AI_LEVEL_KEYS) if ((entry.sides?.[k] ?? null) !== (now[k] ?? null)) return 'stale';
  return 'ok';
}

const PLACEHOLDER_RE = /\{(MP|CW|PF|GF)\}/g;
const KEY_OF: Record<string, AiLevelKey> = { MP: 'mp', CW: 'cw', PF: 'pf', GF: 'gf' };

/**
 * 그릴 글 — 상태가 'ok' 일 때만, 자리표를 «지금 가격» 기준 거리로 채운다. 채울 수 없는 자리표가 있거나 모르는 중괄호가 남으면 null.
 */
export function fillAiLine(entry: AiLineEntry | null | undefined, row: AiLineRow): string | null {
  if (aiLineState(entry, row) !== 'ok') return null;
  const p = pos(row.price)!;
  const lv = rowLevels(row);
  let bad = false;
  const out = entry!.text.replace(PLACEHOLDER_RE, (_m, code: string) => {
    const l = lv[KEY_OF[code]];
    if (l == null) { bad = true; return ''; }
    return fmtDistPct(distPct(p, l));
  });
  if (bad || /[{}]/.test(out)) return null;
  return out;
}
