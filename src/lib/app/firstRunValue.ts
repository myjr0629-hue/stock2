// ============================================================================
// 첫 실행 «가치 먼저» — 순수 규칙 (2026-10-12, 브랜치 feat/first-run-value · 대표 10/12 «첫 실행 '가치 먼저'»)
// ----------------------------------------------------------------------------
// 흐름(v2):  ① 법적 고지·약관 동의(그대로) → ② 가치: 종목 1~3개 고르기 → 그 종목의 «AI 한 줄»·지형 지도·(임박하면) 옵션 반영 변동폭
//            → 내 종목에 담기 → ③ 알림: 맥락 화면에서 권한 요청(네이티브만) → 시작
// 옛 흐름(legacy):  ① 법적 고지 → ② 알림(옛 2/2) — 끄기 스위치(레디스 onb2:off)가 켜졌거나 설정을 못 읽었을 때
//
// 이 파일은 네트워크·저장소·React 없이 입력만으로 답한다(시험: tests/firstRunValue.test.ts).
// 지어내지 않는다: 카드의 숫자는 «이미 운영 중인 API 값»(레벨·가격·AI 저장본·실적 변동폭)을 그대로 채우기만 한다.
// ============================================================================

import { normalizeTicker } from '@/lib/app/watchlist';
import { aiLineState, fillAiLine, type AiLineEntry } from '@/lib/app/watchlistAiLine';
import {
  checkLevels, displayBasis, earningsPending, fmtMD, priceBasisLabel, type LevelsVerdict, type WlLocale,
} from '@/lib/app/watchlistInsights';
import type { LevelFields } from '@/components/app/watchlist/useWatchlistData';
import { pickNextEarnings } from '@/lib/earningsDate';
import { daysBetweenYmd, etDateOf } from '@/lib/marketCalendar';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

// ── 단계 · 끄기 스위치 · 푸시 결과 · 네이티브 판정 ── (서버 라우트와 부모 오버레이가 가볍게 읽도록 의존성 없는 onboardingConfig.ts 에 있다 — 여기서 다시 내보낸다)
export {
  ONB2_OFF_KEY, ONB_NUMBERED_STEPS, isNativeShell, onb2Enabled, onbStepNo, parseOnbConfig, permSrc, stepAfterLegal, stepAfterValue, stepSrc,
  type OnbMode, type OnbStep, type PushResult,
} from '@/lib/app/onboardingConfig';

// ── 고르기 ───────────────────────────────────────────────────────────────
export const ONB_PICK_MAX = 3;

/**
 * 인기 종목 칩 — 늘 «내 종목 AI 한 줄»이 저장돼 있는 종목만(운영 실측 10/12: 12/12 줄 있음 — 예열 대상 100종목 안).
 * QQQ·NFLX·INTC·MSTR·IWM 은 체인 날짜가 비거나 줄이 없어 뺐다(첫 화면의 첫 카드가 비면 가치가 0).
 */
export const ONB_POPULAR: readonly string[] = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'PLTR', 'MU', 'AVGO', 'SPY'];

export type PickResult = { picks: string[]; change: 'added' | 'removed' | 'full' | 'invalid' };

/** 칩·검색 결과를 눌렀을 때 — 담겨 있으면 빼고, 아니면 담는다(최대 max). 순서는 고른 순서. */
export function togglePick(picks: readonly string[], raw: string, max = ONB_PICK_MAX): PickResult {
  const t = normalizeTicker(raw);
  if (!t) return { picks: [...picks], change: 'invalid' };
  if (picks.includes(t)) return { picks: picks.filter((x) => x !== t), change: 'removed' };
  if (picks.length >= max) return { picks: [...picks], change: 'full' };
  return { picks: [...picks, t], change: 'added' };
}

/** 고른 수 → 계측 출처(0 은 담지 않으므로 null) */
export function pickSrc(n: number): FunnelSrc | null {
  return n === 1 ? 'onb_n1' : n === 2 ? 'onb_n2' : n >= 3 ? 'onb_n3' : null;
}

interface StoreLike {
  has(t: string): boolean;
  add(t: string, src: string, limit: number): { ok: boolean };
  isMemoryOnly(): boolean;
}

/**
 * 고른 종목을 «내 종목»에 담는다 — 저장소에 직접(토스트·진동·평점 요청 없음: 온보딩 안의 담기는 사용자가 «담고 계속»을 눌러 한 것이다).
 * 이미 담긴 종목은 건너뛴다. 한도는 호출자가 준다(무료 5 — 고르는 최대 3 이므로 첫 실행엔 넘지 않는다).
 */
export function commitPicks(store: StoreLike, picks: readonly string[], limit: number): { added: string[]; skipped: string[]; unsaved: boolean } {
  const added: string[] = [];
  const skipped: string[] = [];
  for (const t of picks) {
    if (store.has(t)) { skipped.push(t); continue; }
    const r = store.add(t, 'onb', limit);
    if (r.ok) added.push(t); else skipped.push(t);
  }
  return { added, skipped, unsaved: store.isMemoryOnly() };
}

// ── 카드 모델 ─────────────────────────────────────────────────────────────
export interface CardRealtime extends LevelFields {
  price?: number | null;
  changePct?: number | null;
  session?: string | null;
  ext?: boolean;
  receivedAt?: number;
  /** 묶음 4 원천 날짜·근거(mergeRow 가 싣는다) */
  sourceSessionDate?: string | null;
  stampBasis?: string | null;
}

export interface ValueCard {
  t: string;
  /** 지도 판정 — ok 가 아니면 PositionMap 이 사유 한마디를 그린다 */
  levels: LevelsVerdict;
  price: number | null;
  changePct: number | null;
  /** «10/9 종가»·«현재가»·«프리»… */
  basisShort: string;
  /** 자리표를 지금 가격으로 채운 AI 한 줄 — 지도가 서고 글이 지금 지형과 맞을 때만 */
  aiText: string | null;
  /** 글은 있는데 지형이 바뀌었다 → 그리지 않고 서버에 다시 써 달라고 알린다 */
  aiStale: boolean;
}

/** 내 종목 목록 행(buildRows)과 «같은 판정»으로 카드 하나를 만든다 — 같은 가격·레벨이라 같은 줄이 나온다. */
export function buildValueCard(t: string, rt: CardRealtime | undefined, ai: AiLineEntry | null, loc: WlLocale, nowMs: number): ValueCard {
  const levels = checkLevels({
    price: rt?.price, maxPain: rt?.maxPain, callWall: rt?.callWall, putFloor: rt?.putFloor, gammaFlipLevel: rt?.gammaFlipLevel,
    levelsChainDate: rt?.levelsChainDate, levelsSource: rt?.levelsSource, hasLevelsMeta: rt?.hasLevelsMeta, levelsDropped: rt?.levelsDropped,
    refPrice: rt?.levelsRefPrice, staleReason: rt?.levelsStaleReason,
  }, nowMs);
  const basis = displayBasis(rt?.session, rt?.ext, rt?.receivedAt ?? nowMs, { sourceSessionDate: rt?.sourceSessionDate ?? null, basis: rt?.stampBasis ?? null });
  const aiRow = levels.ok ? { price: levels.S, maxPain: levels.mp, callWall: levels.cw, putFloor: levels.pf, gammaFlipLevel: levels.gf, chainDate: levels.chainDate } : null;
  return {
    t,
    levels,
    price: typeof rt?.price === 'number' && Number.isFinite(rt.price) ? rt.price : null,
    changePct: typeof rt?.changePct === 'number' && Number.isFinite(rt.changePct) ? rt.changePct : null,
    basisShort: priceBasisLabel(basis, loc, true),
    aiText: aiRow ? fillAiLine(ai, aiRow) : null,
    aiStale: !!aiRow && aiLineState(ai, aiRow) === 'stale',
  };
}

// ── 실적 임박 ─────────────────────────────────────────────────────────────
/** 이 안(일)에 실적이 있으면 «임박» — 실적 캘린더가 37일 창이라 14일이면 앱 실적 화면의 «옵션 반영 변동폭» 값이 거의 다 채워진 구간이다 */
export const ONB_EARNINGS_WINDOW_DAYS = 14;

export interface OnbImplied { pct: number; expiry: string; session: string | null }
export interface OnbEarnings {
  date: string;
  hour: string;
  /** ET 오늘부터 남은 날(0 = 오늘) */
  days: number;
  /** 옵션 반영 변동폭 — 값이 없으면 null(날짜 줄만 그린다) */
  implied: OnbImplied | null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function impliedOf(raw: unknown): OnbImplied | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { pct?: unknown; expiry?: unknown; session?: unknown };
  if (typeof o.pct !== 'number' || !Number.isFinite(o.pct) || !(o.pct > 0)) return null;
  if (typeof o.expiry !== 'string' || !YMD.test(o.expiry)) return null;
  return { pct: o.pct, expiry: o.expiry, session: typeof o.session === 'string' && YMD.test(o.session) ? o.session : null };
}

/**
 * 실적 캘린더 행(/api/market/earnings-calendar rows)에서 이 종목의 «다음 실적»을 골라, 임박했으면(14일 안) 돌려준다.
 * 고르는 규칙은 앱 전체 공용(pickNextEarnings — 내 종목·Command 와 같은 함수) · 지났는지는 ET 날짜 + 발표 시각(earningsPending).
 * 옵션 반영 변동폭(implied)은 서버가 행에 붙여 둔 값 그대로(웹 earnings-week 와 같은 원천) — 없으면 null.
 */
export function imminentEarnings(rows: readonly unknown[] | null | undefined, ticker: string, nowMs: number): OnbEarnings | null {
  if (!Array.isArray(rows) || !rows.length) return null;
  const T = String(ticker || '').toUpperCase();
  const list = (rows as Array<Record<string, unknown>>).filter((r) => r && String(r.ticker || '').toUpperCase() === T);
  if (!list.length) return null;
  const todayET = etDateOf(nowMs);
  const next = pickNextEarnings({ fmp: list as never }, todayET);
  if (!next) return null;
  const date = String(next.date || '').slice(0, 10);
  const hour = String(next.hour || '');
  if (!YMD.test(date) || !earningsPending(date, hour, nowMs)) return null;
  const days = daysBetweenYmd(todayET, date);
  if (days == null || days < 0 || days > ONB_EARNINGS_WINDOW_DAYS) return null;
  const row = list.find((r) => String(r.date || '').slice(0, 10) === date);
  return { date, hour, days, implied: impliedOf(row?.implied) };
}

/** «실적 D-8 · 10/20 장 마감 후» — 내 종목 실적 칩(watchlistInsights earningsCopy)과 같은 말 */
export function earningsText(e: Pick<OnbEarnings, 'date' | 'hour' | 'days'>, loc: WlLocale): string {
  const head = loc === 'ko' ? '실적 ' : loc === 'ja' ? '決算 ' : 'Earnings ';
  const d = e.days === 0 ? (loc === 'ko' ? '오늘' : loc === 'ja' ? '本日' : 'today') : `D-${e.days}`;
  const when = e.hour === 'amc' ? (loc === 'ko' ? '장 마감 후' : loc === 'ja' ? '引け後' : 'after close')
    : e.hour === 'bmo' ? (loc === 'ko' ? '장 시작 전' : loc === 'ja' ? '寄り前' : 'before open') : '';
  return `${head}${d} · ${fmtMD(e.date)}${when ? ` ${when}` : ''}`;
}

/** 옵션 반영 변동폭 보조 글 — «10/23 만기 · 10/9 세션» (앱 실적 화면 impliedBasisText 와 같은 모양) */
export function impliedBasisLine(v: OnbImplied, loc: WlLocale): string {
  const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
  const exp = loc === 'ko' ? `${md(v.expiry)} 만기` : loc === 'ja' ? `${md(v.expiry)}満期` : `${md(v.expiry)} expiry`;
  if (!v.session) return exp;
  const ses = loc === 'ko' ? `${md(v.session)} 세션` : loc === 'ja' ? `${md(v.session)}セッション` : `${md(v.session)} session`;
  return `${exp} · ${ses}`;
}

/** «±8.5%» */
export const impliedPctLabel = (pct: number): string => `±${pct.toFixed(1)}%`;
