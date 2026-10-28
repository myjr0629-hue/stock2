/** 다음 주요 지표의 비교와 조건부 해석. */
import { interpretationFamily } from '@/lib/ai/econInterpretations';
import type { Loc } from '@/lib/todayPicks/types';


/** Values retain their original display units; incompatible units cannot be compared. */
function parseValue(value: string): { value: number; unit: string } | null {
  const m = value.trim().replace(/−/g, '-').match(/^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([KMBT%]?|%?\s*(?:MoM|YoY))$/i);
  if (!m) return null;
  const unit = m[2].replace(/\s/g, '').toUpperCase();
  const number = Number(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[unit] || (Number(m[1].replace(/,/g, '')) === 0 ? 0 : Number(m[1].replace(/,/g, '')));
  return Number.isFinite(number) ? { value: number, unit: /^(%|%?MOM|%?YOY)$/.test(unit) ? unit : '' } : null;
}
export function buildEconCompareSentence(event: string, consensus: string, prior: string, loc: Loc, unit?: string | null): string {
  const a = parseValue(consensus), b = parseValue(prior);
  const prefix = { ko: `예상 ${consensus}는 이전 ${prior}`, ja: `予想${consensus}は前回${prior}`, en: `Consensus ${consensus}` };
  const fallback = { ko: `예상 ${consensus}, 이전 ${prior}입니다.`, ja: `予想${consensus}、前回${prior}です。`, en: `Consensus ${consensus}, prior ${prior}.` };
  if (!a || !b || a.unit !== b.unit) return fallback[loc];
  const d = a.value - b.value;
  const similar = d === 0 || (b.value !== 0 && Math.abs(d) < Math.abs(b.value) * 0.01);
  if (similar) return { ko: `${prefix.ko}과 비슷한 수준입니다.`, ja: `${prefix.ja}とほぼ同水準です。`, en: `${prefix.en} is similar to the prior ${prior}.` }[loc];
  const trade = /trade balance/i.test(event) && a.value < 0 && b.value < 0;
  const labor = /unemployment rate|jobless claims|unemployment claims/i.test(event);
  const inflation = interpretationFamily(event, unit, consensus) === 'inflation'
    && (/%|MOM|YOY/.test(a.unit) || /%|\b(?:mom|yoy|qoq)\b/i.test(unit || ''));
  const up = d > 0;
  const slight = b.value !== 0 && Math.abs(d) < Math.abs(b.value) * 0.05;
  if (trade) return { ko: `${prefix.ko}보다 적자가 ${up ? (slight ? '조금 줄어드는' : '줄어드는') : '늘어나는'} 수준입니다.`, ja: `${prefix.ja}より赤字が${up ? (slight ? 'やや縮小する' : '縮小する') : '拡大する'}水準です。`, en: `${prefix.en} would be a ${up ? 'smaller' : 'larger'} deficit than the prior ${prior}.` }[loc];
  if (labor) return { ko: `${prefix.ko}보다 ${up ? '높아져 악화되는' : '낮아져 개선되는'} 수준입니다.`, ja: `${prefix.ja}より${up ? '上昇し悪化する' : '低下し改善する'}水準です。`, en: `${prefix.en} is ${up ? 'higher, indicating deterioration' : 'lower, indicating improvement'} than the prior ${prior}.` }[loc];
  if (inflation) return { ko: `${prefix.ko}보다 물가 상승률이 ${up ? '높아지는' : '낮아지는'} 수준입니다.`, ja: `${prefix.ja}より物価上昇率が${up ? '高くなる' : '低くなる'}水準です。`, en: `${prefix.en} implies ${up ? 'higher' : 'lower'} inflation than the prior ${prior}.` }[loc];
  return { ko: `${prefix.ko}보다 ${up ? '높은' : '낮은'} 수준입니다.`, ja: `${prefix.ja}より${up ? '高い' : '低い'}水準です。`, en: `${prefix.en} is ${up ? 'higher' : 'lower'} than the prior ${prior}.` }[loc];
}
