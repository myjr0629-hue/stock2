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
export type SelloffMacro = { indexBasis?: { cash?: { spx?: Cash; ndx?: Cash } }; factors?: { sox?: Factor; vix?: Factor } };
export type SelloffBrief = { date: string; chips: { name: string; pct: number }[] };
export function currentSelloff(brief: SelloffBrief | null, now = Date.now()): SelloffBrief | null {
  return brief?.date === lastClosedSessionDate(now) ? brief : null;
}

export async function readSelloffMacro(result: PromiseSettledResult<Response>, now = Date.now()): Promise<{ macro: any; brief: SelloffBrief | null }> {
  try {
    if (result.status === 'fulfilled' && result.value.ok) {
      const macro = await result.value.json();
      return { macro, brief: selloffBrief(macro, now) };
    }
  } catch { /* Failed or malformed responses invalidate the card. */ }
  return { macro: null, brief: null };
}

export function selloffPreviewParam(search: string, environment: string | undefined): string | null {
  return environment === 'development' ? new URLSearchParams(search).get('selloffPreview') : null;
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
function closedAt(iso: string | null | undefined, date: string, now: number): boolean {
  if (!iso || etDateOfIso(iso) !== date) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms <= now && etClock(ms).minutes >= sessionCloseMinutes(date) - 1;
}
export function selloffBrief(macro: SelloffMacro | null, now = Date.now()): SelloffBrief | null {
  const date = lastClosedSessionDate(now);
  const cash = (v?: Cash) => v && v.sessionDate === date && finite(v.price) && v.price > 0 && closedAt(v.asOf, date, now) && finite(v.changePct) ? v.changePct : null;
  const factor = (v?: Factor) => v && v.status === 'OK' && v.source !== 'FAIL' && closedAt(v.marketTime, date, now) && finite(v.chgPct) ? v.chgPct : null;
  const values = [cash(macro?.indexBasis?.cash?.spx), cash(macro?.indexBasis?.cash?.ndx), factor(macro?.factors?.sox), factor(macro?.factors?.vix)];
  if (!values.some((v, i) => v != null && (i === 3 ? v >= 10 : v <= [-1.5, -2, -3][i]))) return null;
  const names = ['S&P 500', 'NASDAQ 100', 'SOX', 'VIX'];
  return { date, chips: values.flatMap((pct, i) => pct == null ? [] : [{ name: names[i], pct }]) };
}
export function scorecardWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
