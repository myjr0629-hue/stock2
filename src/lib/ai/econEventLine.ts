/** «오늘 요약»의 다음 주요 지표 아래 AI 한 줄 — 지표가 무엇을 재는지·시장이 왜 보는지(관찰·설명만). 대표 10/18 지시. */
import { REFUSAL, INTENT } from '@/lib/ai/todayPicksLine';
import type { Loc } from '@/lib/todayPicks/types';

export const EE_PURPOSE = 'TodaySummaryEcon';
export const EE_MAX: Record<Loc, number> = { ko: 60, ja: 60, en: 120 };

export const EE_SYSTEM = `You write ONE short note shown under the next scheduled US economic release in the "Today's summary" card of SIGNUM HQ, an options-flow app for retail investors. The card already shows the release name, time and consensus. Your note says, in plain words, what this indicator measures and why markets pay attention to it.

Return ONLY JSON: {"ko":"…","en":"…","ja":"…"} — the same note in Korean, English and Japanese.

Rules:
1. Explanation only. No forecast of the result, no prediction of prices, no advice. Never use: will, should, could, may, might, likely, expect, forecast, predict, buy, sell, recommend, bullish, bearish / 예측, 전망, 예상, 매수, 매도, 추천, 강세, 약세, 수 있습니다 / 予測, 見通し, 予想, 買い, 売り, 推奨, 強気, 弱気, 可能性.
2. No digits at all (no numbers, dates, years, percentages).
3. Length: Korean ≤ 45 characters, Japanese ≤ 45 characters, English ≤ 100 characters. One sentence, no line breaks.
4. Style: Korean polite «~습니다/입니다»; Japanese «です・ます»; English terse. Plain text, no emoji, quotes or markdown.
Example (housing starts): {"ko":"새로 착공한 주택 수로 건설 경기와 금리 영향을 가늠하는 지표입니다","en":"New homes started — a read on construction activity and rate sensitivity","ja":"新たに着工した住宅数で、建設の勢いと金利の影響を測る指標です"}`;

export function buildEconUserPrompt(event: string): string {
  return `RELEASE: ${event} (United States)\n\nWrite the note for this release now. JSON only.`;
}

const BANNED = /\b(?:will|should|could|may|might|likely|expect\w*|forecast\w*|predict\w*|buy|sell|recommend\w*|bullish|bearish)\b|예측|전망|예상|매수|매도|추천|강세|약세|수\s?있습니다|予測|見通し|予想|買い|売り|推奨|強気|弱気|可能性/i;

export interface EconCheck { ok: boolean; text?: Record<Loc, string>; reasons: string[] }

/** 출구 가드 — 셋 다 통과해야 쓴다. 하나라도 어기면 그 줄을 숨긴다(지어내기·전망 금지). */
export function checkEconLine(raw: string): EconCheck {
  const reasons: string[] = [];
  let j: any = null;
  try { j = JSON.parse(String(raw).trim().replace(/^```(?:json)?|```$/g, '')); } catch { return { ok: false, reasons: ['json'] }; }
  const out = {} as Record<Loc, string>;
  for (const loc of ['ko', 'en', 'ja'] as Loc[]) {
    const t = typeof j?.[loc] === 'string' ? j[loc].replace(/\s+/g, ' ').trim() : '';
    if (t.length < 8) { reasons.push(`${loc}:short`); continue; }
    if (t.length > EE_MAX[loc]) reasons.push(`${loc}:long`);
    if (/\d/.test(t)) reasons.push(`${loc}:digit`);
    if (REFUSAL.test(t)) reasons.push(`${loc}:refusal`);
    if (BANNED.test(t) || INTENT.some((r) => r.test(t))) reasons.push(`${loc}:banned`);
    if (/[\n"“”`*#]/.test(t)) reasons.push(`${loc}:format`);
    out[loc] = t;
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, text: out, reasons };
}
