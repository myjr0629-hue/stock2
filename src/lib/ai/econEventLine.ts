/** 다음 주요 지표의 비교와 조건부 해석. */
import { interpretationFamily } from '@/lib/ai/econInterpretations';
import type { Loc } from '@/lib/todayPicks/types';

/**
 * 한국어 조사(은/는·이/가·과/와·을/를)를 «읽었을 때 마지막 소리»의 받침으로 고른다.
 * 숫자: 소수부는 자리마다 읽고(54.70 → «영»), 정수부 끝의 0 은 자릿값으로 읽는다(10 십·100 백·1,000 천·100,000 십만·10^8 억·10^12 조·10^16 경).
 * 영문 단위: L·M·N·R(엘·엠·엔·알)만 받침, 그 외(B 비·K 케이·T 티 등)·%(퍼센트)는 받침 없음.
 */
const KO_DIGIT_FINAL: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };
function koEndsWithFinal(word: string): boolean {
  const w = word.trim().replace(/[)\]}'"\s]+$/, '');
  const last = w.slice(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[A-Za-z]/.test(last)) return /[LMNRlmnr]/.test(last);
  if (/[0-9]/.test(last)) {
    const num = (w.match(/[0-9][0-9,]*(?:\.[0-9]+)?$/) || [last])[0];
    if (num.includes('.')) return KO_DIGIT_FINAL[last];
    const digits = num.replace(/,/g, '').replace(/^0+(?=\d)/, '');
    if (/^0+$/.test(digits)) return true;                      // 영
    const zeros = digits.length - digits.replace(/0+$/, '').length;
    if (zeros === 0) return KO_DIGIT_FINAL[last];
    if (zeros < 4) return true;                                // 십·백·천
    return [true, true, false, true][Math.min(Math.floor(zeros / 4), 4) - 1];   // 만(십만·백만…)·억·조·경
  }
  return false;                                                // %·기호 — 퍼센트 등
}
export function koParticle(word: string, pair: '은/는' | '이/가' | '과/와' | '을/를'): string {
  const [withFinal, withoutFinal] = pair.split('/');
  return koEndsWithFinal(word) ? withFinal : withoutFinal;
}

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
  const prefix = { ko: `예상 ${consensus}${koParticle(consensus, '은/는')} 이전 ${prior}`, ja: `予想${consensus}は前回${prior}`, en: `Consensus ${consensus}` };
  const fallback = { ko: `예상 ${consensus}, 이전 ${prior}입니다.`, ja: `予想${consensus}、前回${prior}です。`, en: `Consensus ${consensus}, prior ${prior}.` };
  if (!a || !b || a.unit !== b.unit) return fallback[loc];
  const d = a.value - b.value;
  const similar = d === 0 || (b.value !== 0 && Math.abs(d) < Math.abs(b.value) * 0.01);
  if (similar) return { ko: `${prefix.ko}${koParticle(prior, '과/와')} 비슷한 수준입니다.`, ja: `${prefix.ja}とほぼ同水準です。`, en: `${prefix.en} is similar to the prior ${prior}.` }[loc];
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
