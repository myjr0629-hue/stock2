// ============================================================================
// 종목 페이지(/[locale]/flow/[ticker])의 «실적 시즌» 메타 — 회사명 + 실적 + 옵션 예상 변동 (2026-10-25, TRACKER T28)
//
// 왜: 실적 주간에 사람들은 «마이크로소프트 실적 옵션 예상 변동»·«アマゾン 決算 予想変動»·«Microsoft earnings expected move»로 찾는다.
//   종목 페이지 제목은 «MSFT 맥스페인 …»이라 회사명·실적 의도와 이어지지 않았다(코덱스 감사 seo-gift-loop-audit-1025 P0).
//
// 지키는 것(대표 규칙):
//   · 화면 문구·라벨은 바꾸지 않는다 — 여기서 만드는 문장은 <title>·description·OG·JSON-LD(기계가 읽는 곳)에만 쓴다.
//   · 산출 방식(ATM 스트래들·이벤트 분리 등)은 실적 주간 화면처럼 이름 붙이지 않는다 — 만기·기준 세션만(관문 10251320: 이벤트 분리값을 «ATM 스트래들»로 적었다).
//   · JSON-LD 에 실적·예상 변동 문장을 넣지 않는다 — 본문에 없는 내용의 마크업 금지(구글 구조화 데이터 지침, 관문 10251320). 회사 엔티티(about)만.
//   · 값을 만들지 않는다 — 일정은 회사 공지 목록(CONFIRMED_EARNINGS)만, 예상 변동은 실적 주간 페이지와 «같은 행»
//     (getEarningsWeek({readOnly:true}) — T26 정본, 장외엔 같은 만기 마감 관측)의 impliedMovePct 를 같은 표기(pctText)로.
//   · 값이 없거나 발표가 끝났으면(phaseOf = done) null → 호출부는 기존 메타 그대로.
//   · 새 공급사 호출·AI 생성·Redis 쓰기 0. 확인된 실적이 이번 주에 없는 종목은 저장본조차 읽지 않는다(6,700장 중 대부분 비용 0).
//
// 회사명은 공식 표기(각 회사의 한국어·일본어 공식 사이트·주요 매체 통용 표기). 이번 주·다음 주 실적 대형주 위주로 둔다.
// 순수 함수와 읽기 함수만 둔다. 비밀값 금지 — 이 저장소는 공개다.
// ============================================================================

import { CONFIRMED_EARNINGS, type ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { COPY, mdw, pctText, phaseOf, selectWeekEntries, toLoc, weekRangeET, type Loc } from '@/lib/earningsWeek';
import type { EarningsWeekRow } from '@/services/earningsWeekService';

import { COMPANY_NAMES } from '@/lib/companyNames';
export { COMPANY_NAMES, type CompanyName } from '@/lib/companyNames';

export const companyName = (ticker: string, loc: string): string | null => COMPANY_NAMES[ticker]?.[toLoc(loc)] ?? null;

/** «마이크로소프트(MSFT)» · «Microsoft (MSFT)» — 이름에 이미 괄호가 있으면 «알파벳(구글) GOOGL». 이름이 없으면 티커만. */
export function nameTag(ticker: string, loc: string): string {
  const n = companyName(ticker, loc);
  if (!n) return ticker;
  if (n.includes('(')) return `${n} ${ticker}`;
  return toLoc(loc) === 'en' ? `${n} (${ticker})` : `${n}(${ticker})`;
}

/** 이번 주(주말이면 다음 주 — 실적 주간 페이지와 같은 주) 회사 공지 목록의 그 종목 항목. 없으면 null — 저장본을 읽을지 가르는 값싼 문. */
export function confirmedThisWeek(ticker: string, nowMs: number = Date.now(), list: readonly ConfirmedEarnings[] = CONFIRMED_EARNINGS): ConfirmedEarnings | null {
  const r = weekRangeET(nowMs);
  return selectWeekEntries(list, r.start, r.end).find((c) => c.ticker === ticker) ?? null;
}

export interface EarningsSeo {
  /** 제목 후보 — 긴 것부터(맥스페인 포함 → 발표일 포함 → 최소). 호출부가 길이 상한으로 고른다 */
  titles: string[];
  /** 설명문 맨 앞에 붙는 문장들(문장 단위) */
  lead: string[];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (ymd: string, loc: Loc) => (loc === 'en' ? `${MON[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}` : `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`);
const isYmd = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

/**
 * 실적 메타 문장 — row 는 실적 주간 행(같은 값), maxPain 은 호출부가 «현재 판본»일 때만 넘긴 표기('$525').
 *   null = 기존 메타 그대로(값 없음 · 발표 완료 · 행 없음 · 날짜 형식 이상).
 */
export function earningsSeo(ticker: string, locale: string, row: EarningsWeekRow | null | undefined, opts: { nowMs?: number; maxPain?: string | null } = {}): EarningsSeo | null {
  if (!row || row.ticker !== ticker || !isYmd(row.date)) return null;
  const nowMs = opts.nowMs ?? Date.now();
  if (phaseOf(row.date, row.hour, nowMs) === 'done') return null;
  const pct = Number(row.impliedMovePct);
  if (!(Number.isFinite(pct) && pct > 0)) return null;
  const loc = toLoc(locale);
  const c = COPY[loc];
  const mv = pctText(pct);
  const tag = nameTag(ticker, loc);
  const day = mdw(row.date, loc);
  const hr = row.hour === 'bmo' ? c.hourBmo : row.hour === 'amc' ? c.hourAmc : null;
  const exp = isYmd(row.impliedExpiry) ? md(row.impliedExpiry, loc) : null;
  const ses = isYmd(row.impliedSession) ? md(row.impliedSession, loc) : null;
  const live = row.impliedBasis === 'live';
  const mp = opts.maxPain || null;

  if (loc === 'ko') {
    const head = `${tag} 실적 옵션 예상 변동폭 ${mv}`;
    const basis = [exp ? `${exp} 만기` : null, live ? '장중 호가 기준' : ses ? `${ses} 마감 호가 기준` : null].filter(Boolean).join(', ');
    const lead = [`${tag} 실적 발표 ${day}${hr ? ` ${hr}` : ''}(회사 공지).`, `옵션이 반영한 예상 변동폭 ${mv}${basis ? ` — ${basis}` : ''}.`];
    return { titles: [mp ? `${head} · ${day} 발표 · 맥스페인 ${mp}` : '', `${head} · ${day} 발표`, head].filter(Boolean), lead };
  }
  if (loc === 'ja') {
    const head = `${tag} 決算の予想変動幅${mv}`;
    const basis = [exp ? `${exp}満期` : null, live ? '場中気配基準' : ses ? `${ses}引け気配基準` : null].filter(Boolean).join('、');
    const lead = [`${tag}の決算発表は${day}${hr ? `${hr}` : ''}(企業告知)。`, `オプションが織り込む予想変動幅は${mv}${basis ? `(${basis})` : ''}。`];
    return { titles: [mp ? `${head}・${day}発表・マックスペイン${mp}` : '', `${head}・${day}発表`, head].filter(Boolean), lead };
  }
  const head = `${tag} Earnings Expected Move ${mv}`;
  const basis = [exp ? `${exp} expiry` : null, live ? 'live quotes' : ses ? `${ses} closing quotes` : null].filter(Boolean).join(', ');
  const hrEn = row.hour === 'bmo' ? ' before the open' : row.hour === 'amc' ? ' after the close' : '';
  const lead = [`${tag} reports earnings ${md(row.date, 'en')}${hrEn} (company-announced).`, `Options imply a ${mv} move${basis ? ` (${basis})` : ''}.`];
  return { titles: [mp ? `${head} · Reports ${md(row.date, 'en')} · Max Pain ${mp}` : '', `${head} · Reports ${md(row.date, 'en')}`, head].filter(Boolean), lead };
}

/** schema.org Corporation(이 페이지의 주제 회사) — 이름이 등록된 종목만. 현지어 이름을 name, 나머지 표기는 alternateName. */
export function corporationLd(ticker: string, locale: string): Record<string, unknown> | null {
  const n = COMPANY_NAMES[ticker];
  if (!n) return null;
  const loc = toLoc(locale);
  const alt = Array.from(new Set([n.en, n.ko, n.ja].filter((x) => x !== n[loc])));
  return { '@type': 'Corporation', name: n[loc], alternateName: alt, tickerSymbol: ticker };
}

/** 저장본 읽기 상한 — 넘으면 기존 메타(페이지가 매달리지 않게) */
export const EARNINGS_SEO_TIMEOUT_MS = 2500;

/**
 * 실적 주간 행 읽기 — 이번 주 회사 공지가 있는 종목만. 실적 주간 페이지·공유 카드와 같은 문(getEarningsWeek readOnly: 저장본만·보강 예약 없음).
 *   어떤 실패(읽기 오류·시간 초과·모듈 오류)도 null — 던지지 않는다.
 */
export async function readEarningsRow(ticker: string, nowMs: number = Date.now()): Promise<EarningsWeekRow | null> {
  if (!confirmedThisWeek(ticker, nowMs)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { getEarningsWeek } = await import('@/services/earningsWeekService');
    const week = await Promise.race([
      getEarningsWeek({ readOnly: true }),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), EARNINGS_SEO_TIMEOUT_MS); }),
    ]);
    return week?.rows.find((r) => r.ticker === ticker) ?? null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
