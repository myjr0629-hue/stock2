import type { Loc } from '@/lib/todayPicks/types';

type Family = 'inflation' | 'employment' | 'unemployment' | 'gdp' | 'consumption' | 'trade' | 'ism' | 'confidence' | 'other';
// This broad classification is used only for the existing comparison sentence.
export function interpretationFamily(event: string, unit?: string | null, estimate = ''): Family {
  if (/price index|deflator|\b(?:cpi|ppi)\b|consumer price|producer price|pce.*price|personal consumption expenditures.*price|inflation|物価|価格指数|デフレーター|물가|디플레이터|(?:import|export) prices/i.test(event)) {
    return /%|mom|yoy|qoq|\b(?:m\/m|y\/y|q\/q)\b/i.test(`${unit || ''} ${estimate} ${event}`) ? 'inflation' : 'other';
  }
  if (/unemployment|jobless|initial claims|continuing claims/i.test(event)) return 'unemployment';
  if (/\bism\b/i.test(event)) return 'ism';
  if (/employment cost|unit labor costs/i.test(event)) return 'other';
  if (/payroll|employment|\badp\b|job openings|jolts/i.test(event)) return 'employment';
  if (/\bgdp\b|gross domestic product/i.test(event)) return 'gdp';
  if (/trade balance/i.test(event)) return 'trade';
  if (/consumer (?:confidence|sentiment)|michigan.*sentiment/i.test(event)) return 'confidence';
  if (/retail sales|personal spending|personal consumption expenditures/i.test(event)) return 'consumption';
  return 'other';
}

type Reading = 'inflation' | 'payroll' | 'unemployment' | 'claims' | 'growth' | 'retail' | 'ism';
const reads: Record<Reading, Record<Loc, string>> = {
  inflation: { ko: '예상보다 높게 나오면 금리 인하 기대 축소, 낮게 나오면 금리 인하 기대 확대로 읽힐 수 있습니다.', en: 'A result above expectations could be read as weaker rate-cut expectations, and one below expectations as stronger rate-cut expectations.', ja: '予想より高ければ利下げ期待の後退、低ければ利下げ期待の拡大と受け止められる可能性があります。' },
  payroll: { ko: '예상보다 높게 나오면 경기 견조와 금리 인하 기대 축소, 낮게 나오면 경기 둔화와 금리 인하 기대 확대로 읽힐 수 있습니다.', en: 'A result above expectations could be read as economic strength and weaker rate-cut expectations, and one below expectations as economic weakness and stronger rate-cut expectations.', ja: '予想より高ければ景気の堅調さと利下げ期待の後退、低ければ景気の減速と利下げ期待の拡大と受け止められる可能性があります。' },
  unemployment: { ko: '예상보다 높게 나오면 경기 둔화 우려, 낮게 나오면 경기 둔화 우려 완화로 읽힐 수 있습니다.', en: 'A result above expectations could be read as concern about an economic slowdown, and one below expectations as easing concern about a slowdown.', ja: '予想より高ければ景気減速への懸念、低ければその懸念の緩和と受け止められる可能性があります。' },
  claims: { ko: '예상보다 높게 나오면 고용 둔화 우려, 낮게 나오면 고용 둔화 우려 완화로 읽힐 수 있습니다.', en: 'A result above expectations could be read as concern about slowing employment, and one below expectations as easing concern about slowing employment.', ja: '予想より高ければ雇用減速への懸念、低ければその懸念の緩和と受け止められる可能性があります。' },
  growth: { ko: '예상보다 높게 나오면 경기 견조, 낮게 나오면 경기 둔화로 읽힐 수 있습니다.', en: 'A result above expectations could be read as economic strength, and one below expectations as economic weakness.', ja: '予想より高ければ景気の堅調さ、低ければ景気の減速と受け止められる可能性があります。' },
  retail: { ko: '예상보다 높게 나오면 소비와 경기 견조, 낮게 나오면 소비와 경기 둔화로 읽힐 수 있습니다.', en: 'A result above expectations could be read as firm consumer demand and economic strength, and one below expectations as weaker consumer demand and economic weakness.', ja: '予想より高ければ消費と景気の堅調さ、低ければ消費と景気の減速と受け止められる可能性があります。' },
  ism: { ko: '예상보다 높게 나오면 경기 견조, 낮게 나오면 경기 둔화로 읽힐 수 있습니다.', en: 'A result above expectations could be read as economic strength, and one below expectations as economic weakness.', ja: '予想より高ければ景気の堅調さ、低ければ景気の減速と受け止められる可能性があります。' },
};

/** Remove only calendar period suffixes; never remove descriptive qualifiers. */
export function interpretationText(event: string, unit?: string | null, estimate = ''): Record<Loc, string> | null {
  const name = event.normalize('NFKC').trim().toLowerCase()
    .replace(/\s*\((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|[a-z]{3}\/\d{1,2})\)\s*$/i, '')
    .replace(/\s+/g, ' ');
  const percent = /%/.test(`${unit || ''} ${estimate}`);
  let key: Reading | undefined;
  if (percent && /^(?:cpi|core cpi) (?:mom|yoy)$/.test(name)) key = 'inflation';
  else if (percent && /^(?:core )?pce price index(?: (?:mom|yoy))?$/.test(name)) key = 'inflation';
  else if (percent && name === 'ppi mom') key = 'inflation';
  else if (name === 'nonfarm payrolls') key = 'payroll';
  else if (name === 'unemployment rate') key = 'unemployment';
  else if (name === 'initial jobless claims') key = 'claims';
  else if (percent && name === 'gdp growth rate qoq') key = 'growth';
  else if (percent && name === 'retail sales mom') key = 'retail';
  else if (name === 'ism manufacturing pmi' || name === 'ism services pmi') key = 'ism';
  return key ? reads[key] : null;
}
