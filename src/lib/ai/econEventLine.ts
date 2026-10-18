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
4. Shape (strict): Korean must end with «지표입니다»; Japanese must end with «指標です»; English must start with «Measures», «Tracks», «Counts» or «Gauges». It is a definition of the indicator — never a statement about today, tomorrow, this week, or which way anything moves.
5. Plain text, no emoji, quotes or markdown.
Example (housing starts): {"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Counts new homes started, a read on construction activity","ja":"新たに着工した住宅数で、建設の勢いを測る指標です"}`;

export function buildEconUserPrompt(event: string): string {
  return `RELEASE: ${event} (United States)\n\nWrite the note for this release now. JSON only.`;
}

// 미래·가격 방향 서술(관문 10/18: «주가가 오를 것입니다/going to rise/上昇するでしょう» 통과) — 설명 문장엔 필요 없다
const FUTURE = /\bset to\b|\bpoised\b|after (?:this|the) release|발표\s?(?:뒤|후|이후)|発表後|가능성|かもしれ|오를|내릴|떨어질|상승할|하락할|올라갈|내려갈|上がる|下がる|上昇する|下落する|\brise\b|\bfall\b|\bdrop\b|\bjump\b|\bgoing to\b|\bwould\b|\bwill\b|것입니다|것이다|겠습니다|겠다|ㄹ 것|할 것|될 것|でしょう|だろう|はずです|見込み|주가|증시|stocks?\b|shares\b|株価|株式市場/i;
const BANNED = /\b(?:will|should|could|may|might|likely|expect\w*|forecast\w*|predict\w*|buy|sell|recommend\w*|bullish|bearish)\b|예측|전망|예상|매수|매도|추천|강세|약세|수\s?있습니다|予測|見通し|予想|買い|売り|推奨|強気|弱気|可能性/i;

const SHAPE: Record<Loc, RegExp> = {
  ko: /지표입니다\.?$/,
  ja: /指標です。?$/,
  en: /^(?:Measures|Tracks|Counts|Gauges)\b/,
};
/** 시점·방향 표현 — 정의 문장에는 필요 없다 */
const WHEN_OR_DIRECTION = /다음\s?달|지난\s?달|이번\s?달|next month|last month|this month|来月|先月|今月|\bnext\b|\blast\b|급락|급등|폭락|폭등|tumble|jump|sink|rally|crash|spike|dive|skyrocket|暴落|暴騰|하락|상승|증가세|감소세|흐름|추세|decrease|increase|decline|surge|plunge|soar|slump|急落|急騰|低下|上昇|増加傾向|減少傾向|내일|오늘|이번\s?주|다음\s?주|어제|tomorrow|today|tonight|this week|next week|yesterday|明日|今日|今週|来週|昨日|heading|lower|higher|낮아|높아|낮출|높일|내려|올라|低下|上昇し|下が|上が/i;

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
    if (BANNED.test(t) || FUTURE.test(t) || INTENT.some((r) => r.test(t))) reasons.push(`${loc}:banned`);
    if (/[\n"“”`*#]/.test(t)) reasons.push(`${loc}:format`);
    // 정의 문장 형태만(관문 10/18 3회: 금지어 덧대기로는 «내일 금리가 낮아집니다» 같은 변형이 계속 통과)
    if (!SHAPE[loc].test(t)) reasons.push(`${loc}:shape`);
    // 한 문장·한 절만(세미콜론·마침표 여러 개로 다른 주장을 덧붙이지 못하게)
    // 한 문장만: 끝 문자 하나를 뺀 본문에 문장부호(. 。 ! ? ; 등)가 하나라도 있으면 거절 — «정의. 다른 주장» 덧붙이기 차단
    if (/[.。!?！？;；:：]/.test(t.replace(/[.。]$/, ''))) reasons.push(`${loc}:multi`);
    if (WHEN_OR_DIRECTION.test(t)) reasons.push(`${loc}:when-direction`);
    out[loc] = t;
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, text: out, reasons };
}
